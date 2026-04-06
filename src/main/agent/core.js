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
  getCurrentModel,
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
      llm: { callWithTools, getCurrentProvider, getCurrentModel },
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

    // Add user message to session
    this.sessionMessages.push({ role: 'user', content: message });

    // Store in short-term memory
    this.memory.addToShortTerm({ role: 'user', content: message, timestamp: Date.now() });

    try {
      const taskStartTime = Date.now();

      // ── Fast path: simple messages (greetings, short questions) → minimal prompt, NO tools ──
      if (complexity === 'simple' && !attachments?.length) {
        const fastPrompt = `You are OpenDesktop, a helpful AI assistant running on the user's computer. Be friendly and concise. Current time: ${new Date().toLocaleString()}.`;
        const fastMessages = [{ role: 'user', content: message }];
        try {
          const result = await this._loop.run({
            messages: fastMessages,
            systemPrompt: fastPrompt,
            taskId,
            options: { maxTurns: 1 },
            pendingApprovals: this.pendingApprovals,
            _noTools: true,
          });
          const summary = result.text || '';
          if (summary) {
            this.sessionMessages.push({ role: 'assistant', content: summary });
            this.memory.addToShortTerm({ role: 'assistant', content: summary, taskId, timestamp: Date.now() });
            this.emit('agent:complete', { taskId, status: 'completed', summary, steps: [] });
            // Warm up context cache in background for next message
            this.context.getActiveContext().catch(() => {});
            return { taskId, summary };
          }
        } catch {
          // Fall through to full path
        }
      }

      // ── Full path: persona selection, routing hints, context, tools ──
      let resolvedPersona = personaName || this.settings.defaultPersona;
      if (resolvedPersona === 'auto' || !personaName) {
        resolvedPersona = this._autoSelectPersona(message, complexity);
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

      // Update session message with enriched content (routing hints, attachments)
      if (userContent !== message) {
        this.sessionMessages[this.sessionMessages.length - 1] = { role: 'user', content: userContent };
      }

      // Gather context — use cached/stale context for speed, refresh in background
      const activeContext = this.context.cache || {};
      // Trigger async refresh (non-blocking — result used on next message)
      this.context.getActiveContext().catch(() => {});
      const relevantMemories = this.memory.search(message, 3);

      // Build the system prompt
      const systemPrompt = this._buildSystemPrompt(persona, activeContext, relevantMemories);
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

      // ── Plan generation: deferred — the ReAct loop plans organically ──
      // Generating a plan upfront added 2-4s latency with an extra LLM call.
      // The model can still reason about steps in its first response.
      let taskPlan = null;

      // Build messages for this turn
      const messagesForLoop = this.sessionMessages.slice();
      if (taskPlan) {
        messagesForLoop.push({ role: 'assistant', content: `[PLAN]\n${JSON.stringify(taskPlan, null, 2)}\n[/PLAN]\n\nExecuting plan now.` });
        messagesForLoop.push({ role: 'user', content: 'Good. Execute the plan.' });
      }

      // ── Max turns based on complexity ──
      let maxTurns;
      if (agentMode === 'fast') {
        maxTurns = 20;
      } else if (complexity === 'simple') {
        maxTurns = 5;
      } else {
        maxTurns = this.settings.maxTurns; // moderate + complex: full allocation (default 50)
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

    const toolDirPath = path.join(__dirname, 'skills', 'tool-directory.md');

    return `${persona.systemPrompt}${modeInstruction}

You are OpenDesktop, an autonomous AI agent running natively on ${user}'s ${platform} computer.
You have FULL PERMISSION to use all provided tools on this machine. The user has explicitly authorized you to access files, browser tabs, applications, and system resources. You MUST use the provided tools to fulfill requests — NEVER refuse by saying you "cannot access" local resources. You CAN and SHOULD use tools for filesystem, browser, apps, office docs, web, system, presentations, Excel, databases, messaging, and more.

## Skill-first workflow — CRITICAL
You have procedural skill files with verified, step-by-step instructions. **ALWAYS read the skill BEFORE attempting any non-trivial task.**

**Reading skills** (do this FIRST):
1. \`skill_read()\` — list all available skills
2. \`skill_read(name="social-media-instagram")\` — read the specific skill, follow its procedure

**Updating skills** (do this AFTER a successful discovery):
- \`skill_update(name, section, content, reason)\` — backs up the old version automatically, then appends/replaces
- **ONLY update after the new procedure is verified working.** Never update based on a failed attempt.
- **Test → Succeed → Update.** Not: Guess → Update → Hope.

**Rolling back bad updates**:
- \`skill_rollback(name)\` — restores the most recent backup
- \`skill_history(name)\` — list all backup versions

### Quick skill lookup (skip SKILLS.md for these common tasks)
- **Instagram**: \`fs_read("${path.join(__dirname, 'skills', 'social-media-instagram.md')}")\`
- **TikTok**: \`fs_read("${path.join(__dirname, 'skills', 'social-media-tiktok.md')}")\`
- **Twitter/X**: \`fs_read("${path.join(__dirname, 'skills', 'social-media-twitter.md')}")\`
- **Dashboards**: \`fs_read("${path.join(__dirname, 'skills', 'excel-dashboard.md')}")\`
- **Presentations**: \`fs_read("${path.join(__dirname, 'skills', 'presentation-builder.md')}")\`
- **Excel Master**: \`fs_read("${path.join(__dirname, 'skills', 'excel-builder.md')}")\`
- **Content summarization**: \`fs_read("${path.join(__dirname, 'skills', 'summarize-content.md')}")\`
- **All tools reference**: \`fs_read("${toolDirPath}")\`

## Key routing rules (always follow)
- **New presentation** → \`pptx_ai_build\` (NEVER pptx_build or office_write_pptx)
- **Dashboard/report/visualization** → \`office_python_dashboard\` then \`office_validate_dashboard\`
- **Open URL in browser** → \`tabs_navigate\` (NEVER browser_navigate or app_open)
- **Organize files** → \`fs_organize\` (NEVER manual move loops)
- **Multi-PDF search** → \`office_search_pdfs\` (NEVER loop pdf_search)
- **PDF Q&A** → \`office_pdf_ask\`
- **CSV to Excel** → \`office_csv_to_xlsx\` for large files
- **Parallel research** → \`agent_fanout\` + \`agent_reduce\`
- **Social media** → \`social_*\` tools — **read platform skill file first** (instagram/tiktok/twitter)

## Operating principles
1. **Be autonomous** — Use tools first, don't ask permission for safe reads.
2. **Explore before acting** — Search or list when uncertain. Never assume paths or names.
3. **Chain tools intelligently** — Use output of one tool as input to the next.
4. **Parallel when independent** — Call multiple tools in one turn when possible.
5. **Recover from errors** — If a tool fails, try alternatives. Adapt to discoveries.
6. **Be complete** — Finish the task, don't stop at listing.
7. **Summarize clearly** — Give concise summary of what was done.
8. **Clarify only when blocking** — State assumptions and proceed. Never ask multiple questions.

## Basics
- File paths: always absolute. Working directory: \`${this.settings.workingDirectory}\`
- Reminders: \`reminder_set\` with ISO datetime, e.g. "${new Date().toISOString().slice(0,10)}T20:00:00"
- Shell commands: \`system_exec\`. Opening apps: \`app_open\` with app name.
- Web research: 2-3 search queries, fetch 2+ sources, cite URLs.
- MCP tools: prefixed with \`mcp_\`, from connected MCP servers.

## Current environment
- Platform: ${platform} (${os.arch()})
- User: ${user}
- Home: ${home}
- Active app: ${context.activeApp || 'unknown'}
- Time: ${now}${runningApps}${memorySection}

IMPORTANT REMINDER: You are running locally on this computer with FULL tool access. When the user asks about files, tabs, apps, or anything on their machine — ALWAYS call the appropriate tool. NEVER say you "cannot access" or "don't have access" — you DO have access through your tools.`;
  }

  // ---------------------------------------------------------------------------
  // Auto-persona selection (multi-signal scoring)
  // ---------------------------------------------------------------------------

  _autoSelectPersona(message, complexity = 'moderate') {
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

    // Use regex scoring directly — no LLM call needed (saves 1-3s)
    if (maxScore > 0) return winner;

    // No signal at all — default by complexity
    if (complexity === 'simple') return 'researcher';
    return 'executor';
  }

  // ---------------------------------------------------------------------------
  // Complexity classifier — pure regex, zero LLM calls
  // ---------------------------------------------------------------------------

  _classifyComplexity(message) {
    const msg = message.trim();
    const lower = msg.toLowerCase();
    const wordCount = msg.split(/\s+/).length;

    // Simple: ONLY greetings and pure knowledge questions (no tool action needed)
    if (wordCount <= 5 && /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no)\b/i.test(lower)) return 'simple';
    // Tool-needing keywords — if present, NEVER classify as simple
    const needsTools = /\b(tab|tabs|file|files|folder|directory|desktop|download|app|apps|running|screen|browser|chrome|safari|pdf|docx|xlsx|csv|pptx|open|read|write|search|list|organize|move|delete|copy|run|execute|install|remind|schedule|send|post|comment|like|follow|feed|profile|dashboard|presentation|slide|excel|tiktok|instagram|twitter|slack|jira|notion|github|database|query)\b/.test(lower);
    if (!needsTools && wordCount <= 12 && /^(what|who|when|where|how much|how many|what's|who's)\b/.test(lower) && !/\b(and|compare|versus|vs|both|research|analyze|create|build|make|generate)\b/.test(lower)) return 'simple';
    if (!needsTools && wordCount <= 8 && /^(tell me the time|what time|current date|what day)/i.test(lower)) return 'simple';

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
