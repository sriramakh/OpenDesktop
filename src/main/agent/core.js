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
  constructor({ memory, permissions, context, toolRegistry, keyStore, emit }) {
    this.memory      = memory;
    this.permissions = permissions;
    this.context     = context;
    this.toolRegistry = toolRegistry;
    this.keyStore    = keyStore;
    this.emit        = emit;

    this.personaManager = new PersonaManager();

    this.currentTaskId  = null;
    this.cancelled      = false;
    this.pendingApprovals = new Map();

    // Current session conversation (persisted across messages within a session)
    this.sessionMessages = [];
    this.sessionId = uuidv4();

    this.settings = {
      llmProvider:     'ollama',
      llmModel:        'llama3.2',
      maxTurns:        50,
      autoApproveRead: true,
      autoApproveWrite: false,
      defaultPersona:  'auto',
      temperature:     0.7,
      maxTokens:       8096,
    };

    if (keyStore) {
      setLLMKeyStore(keyStore);
    }

    // Create the agent loop (stateless — reused for every message)
    this._loop = new AgentLoop({
      toolRegistry,
      llm: { callWithTools, getCurrentProvider },
      permissions,
      emit: this._emitWrapper.bind(this),
    });
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

  async handleUserMessage(message, personaName) {
    this.cancelled = false;
    const taskId = uuidv4();
    this.currentTaskId = taskId;

    // Notify the renderer immediately so it can adopt this taskId
    this.emit('agent:task-start', { taskId });

    // Resolve persona
    let resolvedPersona = personaName || this.settings.defaultPersona;
    if (resolvedPersona === 'auto' || !personaName) {
      resolvedPersona = await this._autoSelectPersona(message);
    }
    const persona = this.personaManager.get(resolvedPersona);

    // Add user message to session
    this.sessionMessages.push({ role: 'user', content: message });

    // Store in short-term memory
    this.memory.addToShortTerm({ role: 'user', content: message, timestamp: Date.now() });

    try {
      // Gather live OS context
      this.emit('agent:step-update', { taskId, phase: 'context', message: 'Gathering context...' });
      const activeContext = await this.context.getActiveContext().catch(() => ({}));
      const relevantMemories = await this.memory.search(message, 3);

      // Build the system prompt
      const systemPrompt = this._buildSystemPrompt(persona, activeContext, relevantMemories);

      this.emit('agent:step-update', { taskId, phase: 'running', message: 'Agent is working...' });

      // Build messages for this turn: past session + current user message already added above
      // (session messages already contains the latest user message)
      const messagesForLoop = this.sessionMessages.slice(); // shallow copy

      // Run the ReAct loop
      const result = await this._loop.run({
        messages: messagesForLoop,
        systemPrompt,
        taskId,
        options: {
          maxTurns: this.settings.maxTurns,
        },
        pendingApprovals: this.pendingApprovals,
      });

      const summary = result.text || '(No response)';

      // Update session with the full conversation returned from the loop
      // The loop returns the expanded conversation including tool calls/results
      this.sessionMessages = result.messages;

      // Persist to memory
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

    return `${persona.systemPrompt}

You are OpenDesktop, an autonomous AI agent running natively on ${user}'s ${platform} computer.

## Your capabilities
You have real tools that execute directly on this machine:
- **Filesystem**: fs_read, fs_write, fs_edit, fs_list, fs_search, fs_move, fs_delete, fs_mkdir, fs_tree, fs_info, fs_organize
- **Office Documents**: office_read_pdf, office_read_docx, office_write_docx, office_read_xlsx, office_write_xlsx, office_chart_xlsx, office_read_pptx, office_write_pptx, office_read_csv, office_write_csv
- **System**: system_exec (shell commands), system_info, system_processes, system_clipboard_read/write, system_notify
- **Applications**: app_open, app_find, app_list, app_focus, app_quit, app_screenshot
- **Browser/UI**: browser_navigate, browser_click, browser_type, browser_key
- **Web**: web_search, web_fetch, web_fetch_json, web_download
- **AI**: llm_query, llm_summarize, llm_extract, llm_code
- **MCP tools**: Any tools prefixed with \`mcp_\` come from connected MCP servers — use them as appropriate for specialized tasks

## Critical operating principles
1. **Be autonomous and decisive** — Don't ask for permission for safe read operations. Use tools first.
2. **Explore before acting** — When a path or app name is uncertain, search or list first. Never assume.
3. **Chain tools intelligently** — Use the output of one tool as the exact input to the next.
4. **Parallel when independent** — Call multiple tools in the same turn when they don't depend on each other.
5. **Recover from errors** — If a tool fails, try an alternative approach. Adapt to what you discover.
6. **Be complete** — If asked to organize files, actually move them. Don't stop at listing them.
7. **Summarize clearly** — After completing a task, give a clear, concise summary of what was done.

## Tool guidelines
- File paths: always use absolute paths. Desktop = \`${home}/Desktop\`, Downloads = \`${home}/Downloads\`
- Directory exploration: prefer \`fs_list\` or \`fs_tree\` over \`system_exec ls\`
- Finding files: use \`fs_search\` with glob patterns (e.g. \`**/*.pdf\`, \`*.jpg\`)
- **Organizing directories**: ALWAYS use \`fs_organize\` — it is atomic and correctly classifies ONLY files (not subdirectories) to avoid moving already-organized folders into "others". Never manually move folder-by-folder.
- **Reading documents**: Use \`office_read_pdf\`, \`office_read_docx\`, \`office_read_xlsx\`, \`office_read_pptx\`, \`office_read_csv\` for rich content extraction with formatting. Fall back to \`fs_read\` for plain text files.
- **TOOL ROUTING — CRITICAL**: PowerPoint/presentation → \`office_write_pptx\` ONLY. Excel/spreadsheet/data → \`office_write_xlsx\` ONLY. NEVER call office_write_xlsx for a presentation, and NEVER call office_write_pptx for a spreadsheet.
- **Creating PowerPoint (.pptx)**:
  1. First ask: "Do you have a template .pptx to base the design on?" — if yes use templatePath, else pick theme (professional/dark/minimal/vibrant).
  2. PLAN every slide BEFORE calling the tool: decide layout, write the talking header (complete sentence insight, NOT a topic label), list 4–6 bullet points.
  3. Talking headers: "Enterprise AI Adoption Tripled in 2025" ✓ — "AI Adoption" ✗
  4. Structure: slide 1 = title (cover), last slide = title (closing), use section slides as chapter dividers, two-column for comparisons, table for structured data.
  5. Generate EXACTLY the number of slides requested. Add speaker notes to every slide.
  6. Call \`office_write_pptx\` once with the complete fully-planned slides array.
- **Excel work**: Start with \`office_read_xlsx\` (summaryOnly=true for large files) to understand structure. Use \`office_write_xlsx\` with sheetData+autoFormat=true for fast formatted tables; use operations for precision (format_range, freeze_panes, set_column_width, merge_cells, create_table). ALWAYS write Excel formulas (=SUM, =IF, =VLOOKUP) instead of hardcoded values. For financial models: tag cells with financial_type ("input"=blue, "formula"=black, "cross_sheet"=green, "external"=red, "assumption"=yellow bg). Use \`office_chart_xlsx\` to generate SUMIF-based pivot/summary tables from raw data.
- Shell commands not covered by specific tools: use \`system_exec\`
- Opening apps: just use the app name (e.g. "Safari", "Finder", "VS Code")
- Web research: \`web_search\` first, then \`web_fetch\` specific pages
- For code generation: use \`llm_code\` then \`fs_write\` to save it

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

  async _autoSelectPersona(message) {
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

    // If there's a clear winner with strong signal, trust it
    if (maxScore >= 3) {
      return winner;
    }

    // Ambiguous — ask LLM for classification
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
