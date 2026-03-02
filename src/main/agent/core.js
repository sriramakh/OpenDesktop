/**
 * AgentCore — Orchestrator for the OpenDesktop agent.
 *
 * Responsibilities:
 *  - Maintain session state (current conversation, task tracking)
 *  - Build the system prompt with live OS context
 *  - Start the AgentLoop for each user message
 *  - Handle approvals, cancellation, and settings
 *  - Persist conversation to memory
 *
 * The actual reasoning + tool execution happens in AgentLoop (loop.js).
 */

const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { AgentLoop } = require('./loop');
const { PersonaManager } = require('./personas');
const {
  configure: configureLLM,
  setKeyStore: setLLMKeyStore,
  callLLM,
  callWithTools,
  getCurrentProvider,
} = require('./llm');

class AgentCore {
  constructor({ memory, permissions, context, toolRegistry, keyStore, emit, piiDetector, policyEngine }) {
    this.memory      = memory;
    this.permissions = permissions;
    this.context     = context;
    this.toolRegistry = toolRegistry;
    this.keyStore    = keyStore;
    this.emit        = emit;
    this.piiDetector  = piiDetector  || null;
    this.policyEngine = policyEngine || null;

    this.personaManager = new PersonaManager();

    this.currentTaskId  = null;
    this.cancelled      = false;
    this.pendingApprovals = new Map();

    // Current session conversation (persisted across messages within a session)
    this.sessionMessages = [];
    this.sessionId = uuidv4();

    this.settings = {
      llmProvider:      'ollama',
      llmModel:         'llama3.2',
      maxTurns:         50,
      autoApproveRead:  true,
      autoApproveWrite: false,
      defaultPersona:   'auto',
      temperature:      0.7,
      maxTokens:        8096,
      workingDirectory: os.homedir(),
      agentMode:        'comprehensive', // 'fast' | 'comprehensive'
    };

    this._retryAttempt = false;
    this._spawner = null;

    if (keyStore) {
      setLLMKeyStore(keyStore);
    }

    // Create the agent loop (stateless — reused for every message)
    this._loop = new AgentLoop({
      toolRegistry,
      llm: { callWithTools, getCurrentProvider },
      permissions,
      emit:         this._emitWrapper.bind(this),
      memory,
      piiDetector:  this.piiDetector,
      policyEngine: this.policyEngine,
      summarizer: async (content, toolName) =>
        callLLM(
          'Summarize this tool output in ≤300 words, preserving key facts, numbers, file paths.',
          `Tool: ${toolName}\nOutput:\n${content.slice(0, 12000)}`
        ),
    });

    // Pass session ID to loop so audit logs are correlated
    this._loop._sessionId = this.sessionId;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    configureLLM({
      provider:    this.settings.llmProvider,
      model:       this.settings.llmModel,
      temperature: this.settings.temperature,
      maxTokens:   this.settings.maxTokens,
    });
    return this.settings;
  }

  /**
   * Wire the AgentSpawner for parallel execution support.
   */
  setSpawner(spawner) {
    this._spawner = spawner;
  }

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  cancel() {
    this.cancelled = true;
    this._loop.cancel();
    if (this.currentTaskId) {
      this.emit('agent:complete', {
        taskId: this.currentTaskId,
        status: 'cancelled',
        summary: 'Task cancelled by user.',
        steps: [],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Approval flow
  // ---------------------------------------------------------------------------

  resolveApproval(requestId, approved, note) {
    const resolver = this.pendingApprovals.get(requestId);
    if (resolver) {
      resolver({ approved: !!approved, note });
      this.pendingApprovals.delete(requestId);
    }
  }

  // ---------------------------------------------------------------------------
  // Emit wrapper — intercepts approval requests to wire them through core
  // ---------------------------------------------------------------------------

  _emitWrapper(channel, data) {
    if (channel === 'agent:approval-request') {
      // Wire the resolver into core's pendingApprovals map
      // (The loop already set up the promise; we just need to forward the event)
      this.pendingApprovals = this._loop.pendingApprovals;
    }
    if (this.emit) this.emit(channel, data);
  }

  // ---------------------------------------------------------------------------
  // Main entry point: handle a user message
  // ---------------------------------------------------------------------------

  async handleUserMessage(message, personaName, attachments) {
    this.cancelled = false;
    const taskId = uuidv4();
    this.currentTaskId = taskId;

    // Notify the renderer immediately so it can adopt this taskId
    this.emit('agent:task-start', { taskId });

    // ── Classify complexity (zero LLM calls) ──
    const complexity = this._classifyComplexity(message);
    console.log(`[AgentCore] Complexity: ${complexity} for "${message.slice(0, 60)}..."`);

    // Resolve persona — skip LLM fallback for simple queries
    let resolvedPersona = personaName || this.settings.defaultPersona;
    if (resolvedPersona === 'auto' || !personaName) {
      resolvedPersona = await this._autoSelectPersona(message, complexity);
    }
    const persona = this.personaManager.get(resolvedPersona);

    // Build final user message content — append attachment hints if provided
    let userContent = message;
    if (attachments && attachments.length > 0) {
      userContent += `\n\n[Attached files: ${attachments.join(', ')} — use fs_read or appropriate office tools to read them]`;
    }

    // ── Tool routing hints — inject when keywords strongly match a specific tool ──
    const msgLower = message.toLowerCase();
    const isEditRequest = /\b(add\s+slide|remove\s+slide|delete\s+slide|change\s+theme|edit.*presentation|move\s+slide|regenerate\s+slide|refine\s+slide|tweak\s+slide|update\s+slide|rename\s+section|add\s+section|what\s+slides|show\s+slides|presentation\s+structure)\b/.test(msgLower);
    if (isEditRequest) {
      userContent += `\n\n[ROUTING: This is an EDIT request for an existing presentation. `
        + `First call \`pptx_edit_get_state\` to see the current structure, then use the appropriate \`pptx_edit_*\` tool. `
        + `Available: pptx_edit_add_slide, pptx_edit_remove_slide, pptx_edit_move_slide, pptx_edit_update_content, `
        + `pptx_edit_regenerate, pptx_edit_set_theme, pptx_edit_rebuild, pptx_edit_rename_section, pptx_edit_add_section. `
        + `The session_path was returned by the original pptx_ai_build or pptx_build call.]`;
    } else if (/\b(presentation|pptx|powerpoint|pitch\s*deck|slide\s*deck|slides)\b/.test(msgLower)) {
      userContent += `\n\n[ROUTING: You MUST call the tool \`pptx_ai_build\` to create the presentation. `
        + `Do any research/data-gathering first, then call pptx_ai_build once with topic, company_name, theme_key, `
        + `and pass all gathered info as additional_context. Do NOT use system_exec, office_write_pptx, or pptx_build.]`;
    }

    // Add user message to session
    this.sessionMessages.push({ role: 'user', content: userContent });

    // Store in short-term memory
    this.memory.addToShortTerm({ role: 'user', content: userContent, timestamp: Date.now() });

    try {
      // Gather live OS context
      this.emit('agent:step-update', { taskId, phase: 'context', message: 'Gathering context...' });
      const activeContext = await this.context.getActiveContext().catch(() => ({}));
      const relevantMemories = this.memory.search(message, 3);

      // Build the system prompt
      const systemPrompt = this._buildSystemPrompt(persona, activeContext, relevantMemories);
      const taskStartTime = Date.now();
      const agentMode = this.settings.agentMode;

      // ── Parallel execution for complex multi-entity tasks ──
      if (complexity === 'complex' && this._spawner) {
        const parallel = this._detectParallelPattern(message);
        if (parallel) {
          console.log(`[AgentCore] Parallel pattern detected: ${parallel.type} with ${parallel.entities.length} entities`);
          const parallelResult = await this._executeParallel(parallel, message, taskId, systemPrompt);
          if (parallelResult) {
            // Save synthesis as the session result
            this.sessionMessages.push({ role: 'assistant', content: parallelResult });
            this.memory.addToShortTerm({ role: 'assistant', content: parallelResult, taskId, timestamp: Date.now() });
            await this.memory.addToLongTerm({
              type: 'task', query: message, summary: parallelResult, persona: persona.name,
              status: 'completed', turns: 0, sessionId: this.sessionId, timestamp: Date.now(),
            });
            await this.memory.saveTaskState({
              sessionId: this.sessionId, query: message, goal: message,
              plan: null, completedSteps: [], filesModified: [], toolOutputsSummary: [],
              decisions: [], status: 'completed', turns: 0,
              createdAt: taskStartTime, completedAt: Date.now(),
            });
            this.emit('agent:complete', { taskId, status: 'completed', summary: parallelResult, steps: [] });
            return { taskId, summary: parallelResult };
          }
          // Fall through to normal flow if parallel execution returned null
        }
      }

      this.emit('agent:step-update', { taskId, phase: 'running', message: 'Agent is working...' });

      // ── Plan generation: only for complex tasks in comprehensive mode ──
      let taskPlan = null;
      if (complexity === 'complex') {
        taskPlan = await this._generatePlan(message);
      }

      // Build messages for this turn
      const messagesForLoop = this.sessionMessages.slice();
      if (taskPlan) {
        messagesForLoop.push({ role: 'assistant', content: `[PLAN]\n${JSON.stringify(taskPlan, null, 2)}\n[/PLAN]\n\nExecuting plan now.` });
        messagesForLoop.push({ role: 'user', content: 'Good. Execute the plan.' });
      }

      // ── Max turns based on complexity ──
      let maxTurns;
      if (agentMode === 'fast') {
        maxTurns = 15;
      } else if (complexity === 'simple') {
        maxTurns = 5;
      } else if (complexity === 'moderate') {
        maxTurns = 15;
      } else {
        maxTurns = this.settings.maxTurns; // complex: full allocation
      }

      // Run the ReAct loop
      let result = await this._loop.run({
        messages: messagesForLoop,
        systemPrompt,
        taskId,
        options: {
          maxTurns,
          taskPlan,
        },
        pendingApprovals: this.pendingApprovals,
      });

      let summary = result.text || '(No response)';

      // ── Self-verification: only for complex tasks in comprehensive mode ──
      if (complexity === 'complex' && agentMode !== 'fast' && !result.cancelled && !this._retryAttempt) {
        const check = await this._verifyGoal(message, summary, taskPlan);
        if (!check.verified) {
          this._retryAttempt = true;
          let retryHint = `Task incomplete. Missing: ${check.missing || 'goal not achieved'}. Please complete it.`;
          // Re-inject routing hint on retry
          if (isEditRequest) {
            retryHint += ` [ROUTING: Use \`pptx_edit_*\` tools with the session_path from the original build.]`;
          } else if (/\b(presentation|pptx|powerpoint|pitch\s*deck|slide\s*deck|slides)\b/.test(msgLower)) {
            retryHint += ` [ROUTING: Call \`pptx_ai_build\` to create the presentation. Pass all research as additional_context.]`;
          }
          const retryMsgs = result.messages.concat([{
            role: 'user',
            content: retryHint,
          }]);
          try {
            const r2 = await this._loop.run({
              messages: retryMsgs,
              systemPrompt,
              taskId,
              options: { maxTurns: 10 },
              pendingApprovals: this.pendingApprovals,
            });
            if (r2.text) { result = r2; summary = r2.text; }
          } catch { /* ignore retry errors */ }
          this._retryAttempt = false;
        }
      }

      // Update session with the full conversation returned from the loop
      this.sessionMessages = result.messages;

      // Persist task state
      await this.memory.saveTaskState({
        sessionId: this.sessionId,
        query: message,
        goal: taskPlan?.goal || message,
        plan: taskPlan?.steps,
        completedSteps: result.taskState?.completedSteps || [],
        filesModified: result.taskState?.filesModified || [],
        toolOutputsSummary: result.taskState?.toolOutputsSummary || [],
        decisions: [],
        status: result.cancelled ? 'cancelled' : 'completed',
        turns: result.turns,
        createdAt: taskStartTime,
        completedAt: Date.now(),
      });

      // Persist to long-term memory
      this.memory.addToShortTerm({ role: 'assistant', content: summary, taskId, timestamp: Date.now() });
      await this.memory.addToLongTerm({
        type: 'task',
        query: message,
        summary,
        persona: persona.name,
        status: result.cancelled ? 'cancelled' : 'completed',
        turns: result.turns,
        sessionId: this.sessionId,
        timestamp: Date.now(),
      });

      this.emit('agent:complete', {
        taskId,
        status: result.cancelled ? 'cancelled' : 'completed',
        summary,
        steps: this._extractStepsFromMessages(result.messages),
      });

      return { taskId, summary };
    } catch (err) {
      console.error('[AgentCore] Error:', err);
      this.emit('agent:error', { taskId, error: err.message });
      return { taskId, error: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // System prompt builder
  // ---------------------------------------------------------------------------

  _buildSystemPrompt(persona, context, memories) {
    const home = os.homedir();
    const user = os.userInfo().username;
    const platform = process.platform === 'darwin' ? 'macOS' : process.platform;
    const now = new Date().toLocaleString();

    const memorySection = memories.length
      ? `\n## Relevant past interactions\n${memories.map((m) => `- ${m.summary || m.query}`).join('\n')}`
      : '';

    const runningApps = context.runningApps?.length
      ? `\n- Running apps: ${context.runningApps.slice(0, 10).join(', ')}`
      : '';

    const modeInstruction = this.settings.agentMode === 'fast'
      ? '\n[Fast Mode] Be efficient: use the minimum tool calls needed, give direct concise answers, avoid deep exploration unless asked.'
      : '\n[Comprehensive Mode] Be thorough: explore fully, verify findings, use as many tool calls as needed for complete and accurate results.';

    return `${persona.systemPrompt}${modeInstruction}

You are OpenDesktop, an autonomous AI agent running natively on ${user}'s ${platform} computer.

## Your capabilities
You have real tools that execute directly on this machine:
- **Filesystem**: fs_read, fs_write, fs_edit, fs_list, fs_search, fs_move, fs_delete, fs_mkdir, fs_tree, fs_info, fs_organize, fs_undo, fs_diff
- **Office Documents**: office_read_pdf, office_pdf_search, office_pdf_ask, office_search_pdfs, office_read_docx, office_write_docx, office_search_docx, office_search_docxs, **office_analyze_xlsx**, office_read_xlsx, office_write_xlsx, **office_chart_xlsx**, **office_python_dashboard**, excel_vba_run, excel_vba_list, office_read_pptx, office_write_pptx, office_read_csv, office_write_csv, **office_csv_to_xlsx**
- **System**: system_exec (shell commands), system_info, system_processes, system_clipboard_read/write, system_notify
- **Applications**: app_open, app_find, app_list, app_focus, app_quit, app_screenshot
- **Browser/UI**: browser_navigate, browser_click, browser_type, browser_key
- **Web**: web_search, web_fetch, web_fetch_json, web_download
- **AI**: llm_query, llm_summarize, llm_extract, llm_code
- **Google connectors**: connector_drive_search, connector_drive_read, connector_gmail_search, connector_gmail_read, connector_calendar_events — require the user to connect via the connector button first
- **Browser tabs**: tabs_list, tabs_navigate, tabs_close, tabs_read, tabs_focus, tabs_find_duplicates, tabs_find_forms, tabs_fill_form, tabs_run_js — manage open tabs in Chrome, Safari, Firefox, Brave, Edge, Arc
- **Reminders**: reminder_set, reminder_list, reminder_cancel — schedule native OS notifications; use \`reminder_list\` to show what's pending; use \`reminder_cancel\` to delete one
- **Presentation builder**: **pptx_ai_build** — the tool to use for NEW presentations. AI engine handles slide selection, content, and rendering. Pass research/data via additional_context.
- **Presentation editing**: pptx_edit_get_state, pptx_edit_add_slide, pptx_edit_remove_slide, pptx_edit_move_slide, pptx_edit_update_content, pptx_edit_regenerate, pptx_edit_set_theme, pptx_edit_rebuild, pptx_edit_rename_section, pptx_edit_add_section — iteratively edit an existing presentation using the session file from pptx_ai_build
- **MCP tools**: Any tools prefixed with \`mcp_\` come from connected MCP servers — use them as appropriate for specialized tasks

## Critical operating principles
1. **Be autonomous and decisive** — Don't ask for permission for safe read operations. Use tools first.
2. **Explore before acting** — When a path or app name is uncertain, search or list first. Never assume.
3. **Chain tools intelligently** — Use the output of one tool as the exact input to the next.
4. **Parallel when independent** — Call multiple tools in the same turn when they don't depend on each other.
5. **Recover from errors** — If a tool fails, try an alternative approach. Adapt to what you discover. If fs_search returns no results, retry with a broader pattern or a parent directory.
6. **Be complete** — If asked to organize files, actually move them. Don't stop at listing them.
7. **Summarize clearly** — After completing a task, give a clear, concise summary of what was done.
8. **Tool fallback** — If a tool fails, try the next best option before giving up:
   - File read: fs_read → office_read_* → system_exec
   - Web: web_fetch → web_search for cached copy → tabs_read
   - PDF: office_read_pdf → office_pdf_search → system_exec pdftotext
9. **Clarification discipline** — Only ask the user when ambiguity is truly blocking AND exploring first (listing files, reading docs) can't resolve it AND wrong assumption would be destructive. If in doubt, state your assumption and proceed. Never ask multiple questions at once.

## Tool guidelines
- File paths: always use absolute paths. Working directory: \`${this.settings.workingDirectory}\` — default location for all file operations unless the user specifies otherwise.
- Directory exploration: prefer \`fs_list\` or \`fs_tree\` over \`system_exec ls\`
- Finding files: use \`fs_search\` with glob patterns (e.g. \`**/*.pdf\`, \`*.jpg\`)
- **Organizing directories**: ALWAYS use \`fs_organize\` — it is atomic and correctly classifies ONLY files (not subdirectories) to avoid moving already-organized folders into "others". Never manually move folder-by-folder.
- **Reading documents**: Use \`office_read_pdf\`, \`office_read_docx\`, \`office_read_xlsx\`, \`office_read_pptx\`, \`office_read_csv\` for rich content extraction with formatting. Fall back to \`fs_read\` for plain text files.
- **DOCX workflow**:
  1. **To read content**: \`office_read_docx\` with format="text" (default) or format="structured" to see heading hierarchy, tables, and metadata before editing.
  2. **To find a term in ONE DOCX**: \`office_search_docx\` — returns paragraph context + section heading.
  3. **To search MULTIPLE DOCX files**: \`office_search_docxs\` — one call, one Python process, searches entire directory.
  4. **To create/overwrite**: \`office_write_docx\` — supports **bold**, *italic*, tables (| col | col |), page breaks (---), headings (#, ##, ###, ####), bullets, numbered lists.
- **PDF workflow — CRITICAL**:
  1. **To answer a question from a PDF**: ALWAYS use \`office_pdf_ask\` first — it sends the whole PDF to the AI natively (for Anthropic/Google). Never just read and try to answer from memory.
  2. **To find a term across MULTIPLE PDFs** (e.g. "search all PDFs in my Downloads"): use \`office_search_pdfs\` — ONE call, ONE Python process, searches hundreds of files. NEVER call \`office_pdf_search\` in a loop per file.
  3. **To find specific info in ONE PDF**: use \`office_pdf_search\` with keywords — returns exact page + context. Handles cross-line phrases correctly.
  4. **To summarize a large PDF**: call \`office_read_pdf\` with \`mode="overview"\` first to see the full structure, then read specific page ranges (e.g. 5 pages at a time) and synthesize. Do NOT try to summarize from a single read of a 50-page PDF.
  5. **Paginated reading**: always use startPage/endPage to chunk large PDFs — read 10–15 pages at a time, then continue. Never skip pages.
  6. Output has \`--- Page N / TOTAL ---\` markers — use them to track coverage and cite sources.
- **TOOL ROUTING — CRITICAL**:
  - **New presentation/deck/pitch/PowerPoint/slides/PPTX** → **ALWAYS use \`pptx_ai_build\`**. Never use \`pptx_build\`, \`office_write_pptx\`, or any other tool for NEW presentations.
  - **Edit existing presentation** (add/remove/move slides, change theme, update content) → use \`pptx_edit_*\` tools with the session file from the original build.
  - Excel/spreadsheet → \`office_write_xlsx\` ONLY. Never mix these.
  - **Dashboard/report/visualization requests → \`office_python_dashboard\` ONLY. NEVER use \`office_dashboard_xlsx\`, \`excel_vba_dashboard\`, or \`llm_code\` when the user asks to "build a dashboard", "create a report", "visualize data", or "make charts".** Follow the 6-step skill guide workflow — analyze data, read the guide, design, write pythonScript, call the tool.
- **Presentations — MANDATORY workflow using \`pptx_ai_build\`**:
  The AI engine inside pptx_ai_build handles all slide selection, content generation, and rendering. Your job is ONLY to gather context and call the tool.
  - **Scenario 1 — "Create a presentation about X"**: Call \`pptx_ai_build\` directly with topic, company_name, theme_key, industry. Done.
  - **Scenario 2 — "Research X and create a presentation"**: First do the research (web_search, web_fetch, fs_read, etc.), then call \`pptx_ai_build\` with topic and pass ALL research findings as \`additional_context\`. The AI engine will weave the research into professional slides.
  - **Scenario 3 — "Create a presentation from this file/data"**: First read the file (office_read_xlsx, office_read_csv, office_read_pdf, fs_read), then call \`pptx_ai_build\` with topic and pass the file contents/data as \`additional_context\`.
  - **Theme auto-selection**: retail/corporate→corporate, tech/software→technology, banking/insurance→finance, medical/pharma→healthcare, university→education, VC/pitch→startup, eco/green→sustainability, fashion→luxury, public-sector→government.
  - **NEVER** try to generate slide content yourself. NEVER call pptx_build, pptx_list_slide_types, or office_write_pptx for presentations. The AI engine produces 15-22 professional slides with charts, KPIs, SWOT, roadmaps, etc. — far better than manually constructing content.
- **Presentation editing workflow** (for existing presentations):
  After \`pptx_ai_build\` or \`pptx_build\` completes, a \`.session.json\` file is saved alongside the PPTX. Use this for iterative edits:
  1. **"What slides are in it?"** → \`pptx_edit_get_state\` — shows sections, slide types, theme
  2. **"Add a SWOT slide"** → \`pptx_edit_add_slide\` with slide_type="swot_matrix" — AI generates content and rebuilds
  3. **"Remove the team slide"** → \`pptx_edit_remove_slide\` with slide_type="team_leadership"
  4. **"Move the chart before the summary"** → \`pptx_edit_move_slide\` with after="executive_summary"
  5. **"Update the title to X"** → \`pptx_edit_update_content\` with specific content key updates
  6. **"Regenerate the KPI dashboard"** → \`pptx_edit_regenerate\` with optional instruction
  7. **"Change theme to technology"** → \`pptx_edit_set_theme\`
  8. **"Rename the Analysis section"** → \`pptx_edit_rename_section\`
  The session file persists across conversation turns. Always pass the session_path from the original build result.
- **Excel Python dashboard workflow** (dashboard/report/visualization requests — see TOOL ROUTING above):
  1. For **CSV source**: call \`office_read_csv\` (NOT \`office_analyze_xlsx\` — that fails on CSV). For XLSX source: call \`office_read_xlsx\` with summaryOnly=true.
  2. Call \`fs_read("${path.join(__dirname, 'skills', 'excel-dashboard.md')}")\` to load the complete Python template and skill guide.
  3. Design: choose 4–6 KPIs (with Excel formula strings), 3–4 charts, and 2–3 analysis sheets. Announce plan in one paragraph — do NOT wait for approval.
  4. Write \`pythonScript\`. **The framework pre-initializes \`wb\`, \`df\`, and the Data sheet — your script must NOT recreate them.** CRITICAL RULES:
     - **\`wb\`, \`df\`, and the Data sheet are already created.** Your script starts at step 1 (analysis sheets).
     - **NEVER** write \`wb = openpyxl.Workbook()\` or \`df = pd.read_csv/excel(SOURCE)\` or \`build_data_sheet(wb, df)\` — already done.
     - Use \`build_analysis_sheet(wb, 'Name', grouped_df)\` for quick styled analysis sheets from a DataFrame.
     - **NEVER** use \`build_dashboard_shell\`, \`kpi_card\`, \`add_bar_chart\`, \`add_line_chart\`, \`add_pie_chart\`, \`build_data_sheet\`, or \`build_analysis_sheet\` as variable names — they are framework functions.
     - **NEVER** pass a number to \`formula=\` in \`kpi_card\` — always use Excel formula strings: \`formula='=SUM(Data!C:C)'\`
     - Call \`build_dashboard_shell(wb, title, subtitle)\` AFTER all analysis sheets are created.
     - End with: \`wb.save(OUTPUT); write_result({'ok': True, 'sheets': wb.sheetnames, 'summary': '...'})\`
  5. Call \`office_python_dashboard\` — KPI formulas reference Data/Analysis sheets (live recalculation, no hardcoded values).
  6. **ALWAYS call \`office_validate_dashboard\` immediately after** — read the review workflow from \`fs_read("${path.join(__dirname, 'skills', 'dashboard-review.md')}")\`. Fix any failed checks and rebuild until score ≥ 24/25.
  7. After passing validation: describe each sheet, each KPI metric, and that formulas auto-recalculate when data changes.
- **CSV → Excel conversion**: Use \`office_csv_to_xlsx\` whenever the user wants to convert a CSV to Excel OR when the CSV has more than ~300 rows. NEVER use office_read_csv + office_write_xlsx for this — office_read_csv only returns 200 rows by default, producing a truncated file. office_csv_to_xlsx reads the entire file directly.
- **Excel general workflow**:
  1. **Understand the data first**: For XLSX files, call \`office_analyze_xlsx\`. For CSV files, call \`office_read_csv\` (office_analyze_xlsx does NOT work on CSV files). Never assume structure — analyze it first.
  2. **Write or modify data**: Use \`office_write_xlsx\` with sheetData+autoFormat=true for bulk tables. Use operations for precision: set_cell, format_range, freeze_panes, merge_cells, create_table. ALWAYS use Excel formulas (=SUM, =IF, =VLOOKUP) not hardcoded values. Financial color coding: financial_type "input"=blue, "formula"=black, "cross_sheet"=green, "external"=red, "assumption"=yellow bg.
  3. **Create charts**: Use \`office_chart_xlsx\` to embed real chart objects (column, bar, line, pie, area, scatter). Pass dataRange where col 1 = categories, remaining cols = data series (with header in row 1). Multiple charts supported per call. Charts go into a "Charts" sheet by default, or specify targetSheet.
  4. **Provide analysis**: After using the tools, synthesize findings into either:
     - **Executive Summary**: 3-5 bullet points covering the headline numbers, trend direction, and top insight. Lead with the most important finding.
     - **Deep Dive**: Full breakdown by category/time period/segment with specific numbers, anomalies, and recommendations. Include data quality observations (missing values, outliers).
  - For \`office_read_xlsx\`: use summaryOnly=true for quick structure check, or full read for data analysis.
  - TOOL ROUTING: Excel/data → \`office_write_xlsx\` only. Presentations → \`office_write_pptx\` only.
- **Reminders workflow**:
  - When a user says "remind me at X to do Y", call \`reminder_set\` with message=Y and at=ISO-8601 datetime (convert their natural language to "YYYY-MM-DDTHH:MM:SS" using today's date). Example: "8pm tonight" → "${new Date().toISOString().slice(0,10)}T20:00:00".
  - To see pending reminders: \`reminder_list\` (no args). To cancel: \`reminder_cancel\` with the reminder ID.
  - The reminder fires as a native OS notification even when the app is minimized.
- Shell commands not covered by specific tools: use \`system_exec\`
- Opening apps: just use the app name (e.g. "Safari", "Finder", "VS Code")
- **Web research**: Generate 2–3 search queries from different angles; fetch 2+ sources; cross-verify conflicting info; always cite source URL + excerpt for each claim.
- For code generation: use \`llm_code\` then \`fs_write\` to save it.

## Content summarization workflow
- **YouTube videos / podcast feeds / audio files / video files / web articles** → use \`content_summarize\` (single tool, handles transcription automatically)
  - See full skill guide: \`fs_read("${path.join(__dirname, 'skills', 'summarize-content.md')}")\`
  - Length guide: "summarize" → medium (default); "detailed" → long; "quick" → short; "full transcript" → extract=true
  - For YouTube: pass the URL directly — transcript-first, falls back to Whisper audio transcription
  - For local audio/video files: pass the absolute path — Whisper transcription runs automatically
  - For podcast RSS/Apple Podcasts/Spotify URLs: pass the URL directly
  - If the CLI isn't installed: tell user to run \`npm install -g @steipete/summarize\`

## Parallel execution
When asked to compare, contrast, or research multiple entities:
1. Use \`agent_fanout\` to research each entity in parallel (one prompt per entity)
2. Use \`agent_reduce\` to synthesize results into a structured comparison
This is MUCH faster than researching sequentially. Example:
- "Compare AWS vs Azure" → agent_fanout with ["Research AWS...", "Research Azure..."] → agent_reduce

## Browser tab workflow
- **Listing tabs**: \`tabs_list\` (browser="all"). Returns [W{window}T{tab}] indices needed for all other tab tools.
- **Navigating**: \`tabs_navigate\` — ALWAYS use this to open URLs in the user's existing browser. NEVER use \`browser_navigate\`, \`app_open\`, or \`system_exec open url\` for this — those open the system default browser instead.
  - Navigate existing tab: tabs_navigate with browser, windowIndex, tabIndex, url
  - Open new tab: tabs_navigate with browser, url, newTab=true
- **Reading content**: \`tabs_read\` to get page text (automatically falls back to URL-fetch if JS is blocked) → then \`llm_summarize\` to summarize.
- **Cleaning up**: \`tabs_find_duplicates\` → \`tabs_close\` with duplicatesOnly=true or urlPattern.
- **Forms**: \`tabs_find_forms\` to see all fields → fill known fields with \`tabs_fill_form\`, ask user for sensitive fields (password, CVV) → only set submit=true after user explicitly confirms.
- **Custom JS**: \`tabs_run_js\` (document.title, DOM queries, etc.)
- **JavaScript blocked?**: If \`tabs_read\`/\`tabs_find_forms\`/\`tabs_fill_form\`/\`tabs_run_js\` return a "JavaScript blocked" message, relay the exact instructions to the user (one-time Chrome setup: View > Developer > Allow JavaScript from Apple Events; Safari: Develop > Allow JavaScript from Apple Events).
- **Firefox**: requires \`--remote-debugging-port=9223\` — run \`scripts/launch-firefox-debug.sh\` once. Chrome/Safari/Brave work with zero setup.

## Current environment
- Platform: ${platform} (${os.arch()})
- User: ${user}
- Home: ${home}
- Active app: ${context.activeApp || 'unknown'}
- Time: ${now}${runningApps}${memorySection}`;
  }

  // ---------------------------------------------------------------------------
  // Auto-persona selection (multi-signal scoring)
  // ---------------------------------------------------------------------------

  async _autoSelectPersona(message, complexity = 'moderate') {
    const msg = message.toLowerCase();

    // Strong and weak signal patterns for each persona
    const signals = {
      executor: {
        strong: /\b(move|copy|delete|rename|mkdir|install|execute|run|launch|organize|sort|download|upload|chmod|compress|extract|deploy|push|pull|git|npm|pip|brew|format|convert|resize|merge|split|zip|unzip|backup|sync|transfer|automate|schedule|trigger|import|export)\b/,
        weak:   /\b(create|make|write|save|open|start|build|generate|setup|init|do|apply|fix|clean|update|add|remove|change|edit|modify)\b/,
      },
      researcher: {
        strong: /\b(search|look up|find info|research|what is|who is|explain|compare|how does|why does|tell me about|summarize|documentation|describe|difference between|history of|overview|analyze|review)\b/,
        weak:   /\b(what|why|how|when|where|which|who|learn|understand|read|find out|check)\b/,
      },
      planner: {
        strong: /\b(plan|design|architect|break down|strategy|roadmap|outline|step.?by.?step|how should i|approach|workflow|think through|advise|recommend|help me decide|best way to|consider|structure|organize my|prioritize|blueprint|proposal|spec)\b/,
        weak:   /\b(should|could|would|might|maybe|option|approach|idea|suggestion|advice|framework|methodology)\b/,
      },
    };

    const scores = { executor: 0, researcher: 0, planner: 0 };

    for (const [persona, { strong, weak }] of Object.entries(signals)) {
      const strongMatches = (msg.match(new RegExp(strong.source, 'g')) || []).length;
      const weakMatches   = (msg.match(new RegExp(weak.source,   'g')) || []).length;
      scores[persona] = strongMatches * 3 + weakMatches;
    }

    const maxScore = Math.max(...Object.values(scores));
    const winner   = Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];

    // Trust regex scoring at lower threshold (was 3, now 2)
    if (maxScore >= 2) {
      return winner;
    }

    // For simple queries: skip LLM fallback entirely — use 'researcher' as default
    if (complexity === 'simple') {
      return maxScore > 0 ? winner : 'researcher';
    }

    // Ambiguous moderate/complex — ask LLM for classification
    try {
      const result = await callLLM(
        'You are a task classifier. Classify user requests into one of three categories:\n- executor: the user wants to DO something (create, move, run, install, open, organize files, automate)\n- researcher: the user wants to KNOW something (search, explain, summarize, find information, describe)\n- planner: the user wants to PLAN something (design, strategize, break down steps, decide approach)\n\nReply with ONLY one lowercase word: executor, researcher, or planner.',
        `User request: "${message.slice(0, 400)}"\n\nClassification (one word):`
      );
      const cleaned = result.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (['executor', 'researcher', 'planner'].includes(cleaned)) return cleaned;
    } catch (err) {
      console.error('[AgentCore] autoSelectPersona error:', err.message);
    }

    // If no strong signal but some score, go with the highest
    if (maxScore > 0) return winner;

    // True fallback: executor (most common general-purpose task)
    return 'executor';
  }

  // ---------------------------------------------------------------------------
  // Complexity classifier — pure regex, zero LLM calls
  // ---------------------------------------------------------------------------

  _classifyComplexity(message) {
    const msg = message.trim();
    const lower = msg.toLowerCase();
    const wordCount = msg.split(/\s+/).length;

    // Simple: greetings, short factual questions, single-action requests
    if (wordCount <= 5 && /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no)\b/i.test(lower)) return 'simple';
    if (wordCount <= 12 && /^(what|who|when|where|how much|how many|what's|who's)\b/.test(lower) && !/\b(and|compare|versus|vs|both|research|analyze|create|build|make|generate)\b/.test(lower)) return 'simple';
    if (wordCount <= 8 && /^(tell me the time|what time|current date|what day)/i.test(lower)) return 'simple';

    // Complex: multi-entity, comparisons, research + creation, long instructions
    if (/\b(compare|versus|vs\.?)\b/.test(lower)) return 'complex';
    if (/\b(research|analyze|investigate)\b/.test(lower) && /\b(and|then|also|create|build|make|present)\b/.test(lower)) return 'complex';
    if (wordCount > 40) return 'complex';

    // Moderate: everything in between
    return 'moderate';
  }

  // ---------------------------------------------------------------------------
  // Parallel pattern detector — finds multi-entity comparison/research tasks
  // ---------------------------------------------------------------------------

  _detectParallelPattern(message) {
    const lower = message.toLowerCase();

    // Pattern: "compare X vs/versus/and Y" or "X vs Y"
    const vsMatch = message.match(/(?:compare\s+)?(.+?)\s+(?:vs\.?|versus|compared?\s+(?:to|with))\s+(.+?)(?:\s*[-–—]\s*|\s+(?:in terms of|regarding|for|on|over|using|based)\s+|\.|,|$)/i);
    if (vsMatch) {
      const [, entityA, entityB] = vsMatch;
      const context = message.replace(vsMatch[0], '').trim();
      return { entities: [entityA.trim(), entityB.trim()], task: context || 'comprehensive comparison', type: 'compare' };
    }

    // Pattern: "research/analyze X, Y, and Z"
    const multiMatch = message.match(/(?:research|analyze|investigate|look into|find out about)\s+(.+)/i);
    if (multiMatch) {
      const entitiesStr = multiMatch[1];
      const entities = entitiesStr.split(/\s*(?:,\s*(?:and\s+)?|(?:\s+and\s+))\s*/).map(e => e.trim()).filter(e => e.length > 0 && e.length < 60);
      if (entities.length >= 2 && entities.length <= 5) {
        return { entities, task: 'research', type: 'research' };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Parallel executor — uses AgentSpawner.fanOut() + reduce()
  // ---------------------------------------------------------------------------

  async _executeParallel(pattern, originalMessage, taskId, systemPrompt) {
    this.emit('agent:step-update', { taskId, phase: 'parallel', message: `Researching ${pattern.entities.length} entities in parallel...` });

    const subPrompts = pattern.entities.map(entity =>
      `Research "${entity}" thoroughly. ${pattern.task && pattern.task !== 'research' && pattern.task !== 'comprehensive comparison' ? `Focus on: ${pattern.task}.` : ''} ` +
      `Use web_search to find current information, web_fetch to read sources. ` +
      `Provide a comprehensive, well-structured summary with key facts, numbers, and sources.`
    );

    try {
      const results = await this._spawner.fanOut({ prompts: subPrompts, maxTurns: 10 });

      const successResults = results.filter(r => !r.error).map(r => r.result);
      if (successResults.length === 0) return null; // Fall back to normal flow

      const synthesisPrompt = pattern.type === 'compare'
        ? `The user asked: "${originalMessage}"\n\nYou researched ${pattern.entities.length} entities in parallel. ` +
          `Synthesize a structured comparison with: executive summary, side-by-side comparison table, ` +
          `key differences, strengths/weaknesses of each, and a conclusion.`
        : `The user asked: "${originalMessage}"\n\nSynthesize these ${pattern.entities.length} research results ` +
          `into a single comprehensive response.`;

      const synthesis = await this._spawner.reduce({ results: successResults, combinePrompt: synthesisPrompt, maxTurns: 5 });
      return synthesis;
    } catch (err) {
      console.warn('[AgentCore] Parallel execution failed, falling back:', err.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Start a new conversation session
  // ---------------------------------------------------------------------------

  newSession() {
    this.sessionMessages = [];
    this.sessionId = uuidv4();
    return this.sessionId;
  }

  getSessionMessages() {
    return [...this.sessionMessages];
  }

  // ---------------------------------------------------------------------------
  // Structured planning (comprehensive mode only)
  // ---------------------------------------------------------------------------

  async _generatePlan(message) {
    if (this.settings.agentMode === 'fast' || message.trim().length < 80) return null;
    try {
      // Inject routing constraints for specific task types
      let routingHint = '';
      const ml = message.toLowerCase();
      if (/\b(presentation|pptx|powerpoint|pitch\s*deck|slide\s*deck|slides)\b/.test(ml)) {
        routingHint = '\nCRITICAL: The final step to create the presentation MUST use tool "pptx_ai_build". '
          + 'Do research first if needed, then call pptx_ai_build with all findings as additional_context. '
          + 'NEVER use system_exec, office_write_pptx, or pptx_build for presentations.';
      }
      const raw = await callLLM(
        'You are a task planner. Output ONLY valid JSON. No markdown fences.',
        `Produce a structured execution plan for: "${message}"${routingHint}\nJSON: { "goal":"...", "steps":[{"id":1,"action":"...","tool":"tool_name_or_null","depends_on":[]},...], "success_criteria":"..." }`
      );
      return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
    } catch (err) {
      console.warn('[AgentCore] Plan generation failed:', err.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Self-verification (comprehensive mode only)
  // ---------------------------------------------------------------------------

  async _verifyGoal(originalMessage, finalAnswer, taskPlan) {
    if (this.settings.agentMode === 'fast') return { verified: true };
    try {
      const criteria = taskPlan?.success_criteria || `Task: "${originalMessage}"`;
      const raw = await callLLM(
        'You are a task verifier. Output ONLY valid JSON.',
        `Goal: ${criteria}\nResponse (last 3000 chars):\n${finalAnswer.slice(-3000)}\nJSON: {"verified":true/false,"reason":"one sentence","missing":"what is missing if not verified"}`
      );
      return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
    } catch {
      return { verified: true };
    }
  }

  // ---------------------------------------------------------------------------
  // Extract a simplified step list from the loop's message history (for UI)
  // ---------------------------------------------------------------------------

  _extractStepsFromMessages(messages) {
    const steps = [];
    let stepIdx = 0;

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const content = Array.isArray(msg.content) ? msg.content : [];

      for (const block of content) {
        if (block.type === 'tool_use') {
          steps.push({
            id: stepIdx++,
            tool: block.name,
            description: `${block.name}(${JSON.stringify(block.input).slice(0, 80)})`,
            params: block.input,
            result: { success: true }, // Tool results tracked separately
          });
        }
      }
    }

    return steps;
  }
}

module.exports = { AgentCore };
