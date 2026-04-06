/**
 * AgentLoop — True ReAct (Reasoning + Acting) agent loop.
 *
 * Architecture:
 *   1. Receive user message + conversation history
 *   2. Build messages array with full history + system prompt
 *   3. Call LLM with tool definitions (native tool calling API)
 *   4. If LLM returns a text response → done, emit final answer
 *   5. If LLM returns tool calls → execute in parallel, append results → go to 3
 *   6. Repeat until final text response or maxTurns
 *
 * This is the same pattern used by Claude Code, OpenAI Assistants, and all
 * modern autonomous agents. The key improvement over the old planner:
 *   - No upfront plan: the model decides what to do next at every step
 *   - Full context: every LLM call sees all prior tool results
 *   - Dynamic: the model can react to failures, explore paths, chain discoveries
 *   - Parallel: multiple independent tool calls in a single turn
 */

const { v4: uuidv4 } = require('uuid');
const { TOOL_SCHEMAS } = require('./tools/tool-schemas');

class AgentLoop {
  constructor({ toolRegistry, llm, permissions, emit, summarizer, memory, piiDetector, policyEngine }) {
    this.toolRegistry = toolRegistry;
    this.llm = llm;
    this.permissions = permissions;
    this.emit = emit;
    this.summarizer   = summarizer   || null;
    this.memory       = memory       || null;
    this.piiDetector  = piiDetector  || null;
    this.policyEngine = policyEngine || null;
    this.cancelled = false;
    this.pendingApprovals = new Map();
    this._sessionId = null; // Set by caller if available
    this._toolDefsCache = new Map(); // provider → { version, defs }
    this._toolDefsVersion = 0;
  }

  cancel() {
    this.cancelled = true;
  }


  // --------------------------------------------------------------------------
  // Main entry point
  // --------------------------------------------------------------------------

  /**
   * Run the agent loop for a given conversation.
   *
   * @param {object} opts
   * @param {Array}  opts.messages          - Full conversation history (internal format)
   * @param {string} opts.systemPrompt      - System prompt for the LLM
   * @param {string} opts.taskId            - For event correlation
   * @param {object} opts.options           - maxTurns, etc.
   * @param {Map}    opts.pendingApprovals  - Shared approval map from core
   * @returns {{ text: string, messages: Array, turns: number }}
   */
  async run({ messages, systemPrompt, taskId, options = {}, pendingApprovals, _noTools }) {
    const maxTurns = options.maxTurns || 50;
    this.cancelled = false;

    if (pendingApprovals) {
      this.pendingApprovals = pendingApprovals;
    }

    // Work on a copy so caller's array is unchanged
    const conversation = [...messages];

    let turns = 0;
    let accumulatedText = '';

    // Task state tracking
    const taskState = { filesModified: [], toolOutputsSummary: [], completedSteps: [] };
    const consecutiveFailures = new Map();
    const FILE_WRITE_TOOLS = new Set(['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir', 'fs_organize']);

    while (turns < maxTurns && !this.cancelled) {
      turns++;

      this.emit('agent:thinking', { taskId, turn: turns });

      // Get tool definitions — skip entirely for fast-path (no-tools) calls
      const effectiveProvider = options.provider || this.llm.getCurrentProvider();
      let toolDefs;
      if (_noTools) {
        toolDefs = [];
      } else {
        const regVersion = this.toolRegistry._toolDefsVersion || 0;
        const cached = this._toolDefsCache.get(effectiveProvider);
        if (!cached || cached.version !== regVersion) {
          this._toolDefsCache.set(effectiveProvider, {
            version: regVersion,
            defs: this.toolRegistry.getToolDefinitions(effectiveProvider),
          });
        }
        toolDefs = this._toolDefsCache.get(effectiveProvider).defs;
      }

      // Truncate conversation if it's getting too large for the model's context
      this._truncateConversation(conversation, systemPrompt);

      // Call LLM — returns { text, toolCalls, rawContent, stopReason, usage }
      let response;
      try {
        response = await this.llm.callWithTools(systemPrompt, conversation, toolDefs, {
          onTextToken: (token) => {
            accumulatedText += token;
            this.emit('agent:token', { taskId, token });
          },
          ...(options.provider ? { provider: options.provider } : {}),
          ...(options.model    ? { model:    options.model    } : {}),
        });
      } catch (err) {
        // Surface LLM errors clearly
        throw new Error(`LLM call failed (turn ${turns}): ${err.message}`);
      }

      // Log token usage and cost
      if (response.usage && this.memory) {
        try {
          const { estimateCost } = require('./llm');
          const provider = this.llm.getCurrentProvider();
          const model    = options.model || '';
          const cost     = estimateCost(model, response.usage);
          this.memory.logUsage({
            taskId,
            sessionId:        this._sessionId,
            provider,
            model,
            inputTokens:      response.usage.inputTokens,
            outputTokens:     response.usage.outputTokens,
            estimatedCostUsd: cost,
            turn:             turns,
          });
        } catch { /* non-critical */ }
      }

      // Append assistant turn to conversation history
      // rawContent preserves the full Anthropic-style content array
      conversation.push({
        role: 'assistant',
        content: response.rawContent || response.text || '',
      });

      // If no tool calls → we have the final answer
      if (!response.toolCalls || response.toolCalls.length === 0) {
        const finalText = response.text || accumulatedText;
        this.emit('agent:text-complete', { taskId, text: finalText });
        return { text: finalText, messages: conversation, turns, taskState };
      }

      // Emit tool calls so the UI can render them before execution
      this.emit('agent:tool-calls', {
        taskId,
        turn: turns,
        calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      });

      // Execute all tool calls — parallel by default, serial for dangerous ones
      const toolResults = await this._executeToolCalls(
        response.toolCalls,
        taskId
      );

      // Condense large tool results before appending to conversation
      const trimmedResults = await Promise.all(toolResults.map((r) => this._condenseOutput(r)));

      // Append tool results to conversation (provider-specific format handled by llm module)
      conversation.push({
        role: 'tool_results',
        results: trimmedResults,
      });

      // Update taskState from results
      for (const r of toolResults) {
        if (!r.error && FILE_WRITE_TOOLS.has(r.name)) {
          const tc = response.toolCalls.find((t) => t.id === r.id);
          const p = tc?.input?.path || tc?.input?.destination;
          if (p && !taskState.filesModified.includes(p)) taskState.filesModified.push(p);
          taskState.completedSteps.push(r.name);
        }
        if (!r.error && r.content?.length > 100) {
          taskState.toolOutputsSummary.push({ tool: r.name, summary: r.content.slice(0, 200) });
        }
        // Track consecutive failures for re-plan injection
        if (r.error) {
          consecutiveFailures.set(r.name, (consecutiveFailures.get(r.name) || 0) + 1);
        } else {
          consecutiveFailures.delete(r.name);
        }
      }

      // Inject re-plan hint if any tool fails 2+ times
      if (options.taskPlan) {
        for (const [toolName, count] of consecutiveFailures) {
          if (count >= 2) {
            const r = toolResults.find((x) => x.name === toolName && x.error);
            if (r) r.content += `\n\n[REPLAN HINT] "${toolName}" has failed ${count} times. Try an alternative approach or skip this step.`;
          }
        }
      }

      // Emit results for UI live-update
      this.emit('agent:tool-results', {
        taskId,
        turn: turns,
        results: toolResults.map((r) => ({
          id: r.id,
          name: r.name,
          success: !r.error,
          content: r.content ? r.content.slice(0, 2000) : '',
          error: r.error || null,
        })),
      });
    }

    if (this.cancelled) {
      return { text: accumulatedText, messages: conversation, turns, cancelled: true, taskState };
    }

    throw new Error(
      `Agent reached maximum turns (${maxTurns}). The task may be too complex or the model is looping.`
    );
  }

  // --------------------------------------------------------------------------
  // Concurrency limiter
  // --------------------------------------------------------------------------

  async _parallelWithLimit(items, fn, limit) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        try { results[i] = { status: 'fulfilled', value: await fn(items[i]) }; }
        catch (reason) { results[i] = { status: 'rejected', reason }; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  // --------------------------------------------------------------------------
  // Output condensation (replaces hard 8000-char slice)
  // --------------------------------------------------------------------------

  async _condenseOutput(result) {
    if (!result.content || result.content.length <= 8000) return result;
    const rawPath = this._storeRawOutput(result);
    if (this.summarizer) {
      try {
        const summary = await this.summarizer(result.content, result.name);
        return { ...result, content: `[Summarized ${result.content.length} chars → raw at ${rawPath}]\n\n${summary}` };
      } catch { /* fall through to graceful truncation */ }
    }
    return {
      ...result,
      content:
        result.content.slice(0, 4000) +
        `\n\n...[${result.content.length - 6000} chars omitted]...\n\n` +
        result.content.slice(-2000),
    };
  }

  _storeRawOutput(result) {
    try {
      const dir = require('path').join(require('os').tmpdir(), 'opendesktop-tool-outputs');
      require('fs').mkdirSync(dir, { recursive: true });
      const p = require('path').join(dir, `${result.name}_${Date.now()}.txt`);
      require('fs').writeFileSync(p, result.content, 'utf-8');
      return p;
    } catch { return '(raw storage unavailable)'; }
  }

  // --------------------------------------------------------------------------
  // Tool execution
  // --------------------------------------------------------------------------

  async _executeToolCalls(toolCalls, taskId) {
    // Separate into safe/sensitive vs dangerous for approval gating
    const safe = [];
    const dangerous = [];

    for (const tc of toolCalls) {
      const tool = this.toolRegistry.get(tc.name);
      if (!tool) {
        safe.push({ ...tc, _missing: true });
        continue;
      }
      const level = this.permissions.classify(tc.name, tc.input);
      if (level === 'dangerous') {
        dangerous.push({ ...tc, _level: level });
      } else {
        safe.push({ ...tc, _level: level });
      }
    }

    // Gate dangerous tools through approval
    const approvedDangerous = [];
    for (const tc of dangerous) {
      if (this.cancelled) break;
      const approved = await this._requestApproval(
        { tool: tc.name, params: tc.input, riskLevel: 'dangerous' },
        taskId
      );
      if (approved) {
        approvedDangerous.push(tc);
      } else {
        // Return a skipped result
        safe.push({ ...tc, _skipped: true });
      }
    }

    // Execute all approved calls in parallel (capped at 6 concurrent)
    const toExecute = [...safe, ...approvedDangerous];
    const results = await this._parallelWithLimit(
      toExecute,
      (tc) => this._executeSingleTool(tc, taskId),
      6
    );

    return results.map((r, i) => {
      const tc = toExecute[i];
      if (r.status === 'fulfilled') return r.value;
      return {
        id: tc.id,
        name: tc.name,
        content: `Tool execution error: ${r.reason?.message || r.reason}`,
        error: r.reason?.message || String(r.reason),
      };
    });
  }

  async _executeSingleTool(tc, taskId) {
    // Missing tool
    if (tc._missing) {
      return {
        id: tc.id,
        name: tc.name,
        content: `Unknown tool: "${tc.name}". Available tools: ${this.toolRegistry.listTools().map((t) => t.name).join(', ')}`,
        error: 'unknown_tool',
      };
    }

    // Skipped (user denied approval)
    if (tc._skipped) {
      return {
        id: tc.id,
        name: tc.name,
        content: 'User denied permission for this operation.',
        error: 'denied',
      };
    }

    const tool = this.toolRegistry.get(tc.name);

    // Normalize inputs: Ollama may send JSON strings for array/object params
    const normalizedInput = this._normalizeToolInput(tc.name, tc.input);

    // ── Policy engine check ────────────────────────────────────────────────
    if (this.policyEngine) {
      try {
        const policy = this.policyEngine.evaluate(tc.name, normalizedInput);
        if (!policy.allowed && policy.action === 'block') {
          return {
            id: tc.id, name: tc.name,
            content: `[Policy Block] ${policy.message}`,
            error: 'policy_block',
          };
        }
        if (policy.action === 'require_approval') {
          const approved = await this._requestApproval(
            { tool: tc.name, params: normalizedInput, riskLevel: 'policy', policyMessage: policy.message },
            taskId
          );
          if (!approved) {
            return { id: tc.id, name: tc.name, content: `Policy approval denied: ${policy.message}`, error: 'denied' };
          }
        }
      } catch { /* policy check is non-critical */ }
    }

    // ── PII detection (write tools only) ──────────────────────────────────
    if (this.piiDetector) {
      try {
        const { WRITE_TOOLS } = this.piiDetector;
        if (WRITE_TOOLS && WRITE_TOOLS.has(tc.name)) {
          const scan = this.piiDetector.scan(JSON.stringify(normalizedInput));
          if (scan.found) {
            const summary = this.piiDetector.summarizeFindings(scan.findings);
            const approved = await this._requestApproval(
              { tool: tc.name, params: normalizedInput, riskLevel: 'pii', piiSummary: summary },
              taskId
            );
            if (!approved) {
              return { id: tc.id, name: tc.name, content: `PII approval denied. Detected: ${summary}`, error: 'denied' };
            }
          }
        }
      } catch { /* pii check is non-critical */ }
    }

    this.emit('agent:tool-start', {
      taskId,
      id: tc.id,
      name: tc.name,
      input: normalizedInput,
    });

    const startTime = Date.now();

    // Determine timeout: office_*, browser_* get 120s; pptx_* get 360s (LLM call + Python render); others get 30s
    const isLongRunning = tc.name.startsWith('office_') || tc.name.startsWith('browser_');
    const isPptx = tc.name.startsWith('pptx_');
    const timeoutMs = isPptx ? 360_000 : isLongRunning ? 120_000 : 30_000;

    // Transient errors worth retrying
    const isTransient = (err) =>
      err && /EBUSY|ETIMEDOUT|EAGAIN/i.test(err.code || err.message || '');

    const MAX_RETRIES = 2;
    let lastErr = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const output = await Promise.race([
          tool.execute(normalizedInput),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Tool "${tc.name}" timed out after ${timeoutMs / 1000}s`)), timeoutMs)
          ),
        ]);

        const content = output === undefined || output === null ? '' : String(output);
        const durationMs = Date.now() - startTime;

        this.emit('agent:tool-end', {
          taskId,
          id: tc.id,
          name: tc.name,
          success: true,
          outputPreview: content.slice(0, 300),
        });

        // Audit log
        if (this.memory) {
          try {
            const permLevel = this.permissions?.classify ? this.permissions.classify(tc.name, normalizedInput) : null;
            this.memory.logToolCall({
              taskId, sessionId: this._sessionId,
              toolName: tc.name, toolInput: normalizedInput,
              outputPreview: content.slice(0, 500), success: true,
              permissionLevel: permLevel, durationMs,
            });
          } catch { /* non-critical */ }
        }

        return { id: tc.id, name: tc.name, content };
      } catch (err) {
        lastErr = err;
        // Only retry on transient errors, and not on the last attempt (exponential backoff)
        if (isTransient(err) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 300 * (2 ** attempt)));
          continue;
        }
        break;
      }
    }

    const durationMs = Date.now() - startTime;

    this.emit('agent:tool-end', {
      taskId,
      id: tc.id,
      name: tc.name,
      success: false,
      error: lastErr.message,
    });

    // Audit log (failure)
    if (this.memory) {
      try {
        this.memory.logToolCall({
          taskId, sessionId: this._sessionId,
          toolName: tc.name, toolInput: normalizedInput,
          success: false, error: lastErr.message,
          durationMs,
        });
      } catch { /* non-critical */ }
    }

    // Return error as content so the LLM can recover
    return {
      id: tc.id,
      name: tc.name,
      content: `Error executing ${tc.name}: ${lastErr.message}`,
      error: lastErr.message,
    };
  }

  // --------------------------------------------------------------------------
  // Conversation truncation to stay within context limits
  // --------------------------------------------------------------------------

  _estimateTokens(text) {
    if (!text) return 0;
    if (typeof text === 'string') return Math.ceil(text.length / 3.5);
    return Math.ceil(JSON.stringify(text).length / 3.5);
  }

  _truncateConversation(conversation, systemPrompt) {
    // Rough token budget: reserve tokens for system prompt, tools, and completion
    const MAX_CONVERSATION_TOKENS = 80000;
    const systemTokens = this._estimateTokens(systemPrompt);
    const budget = MAX_CONVERSATION_TOKENS - systemTokens;

    // Single-pass token estimation — O(n) instead of O(n²)
    const tokenCounts = conversation.map((msg) => {
      let t = this._estimateTokens(msg.content);
      if (msg.results) {
        for (const r of msg.results) t += this._estimateTokens(r.content);
      }
      return t;
    });

    let totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
    if (totalTokens <= budget) return;

    // Strategy: keep index 0 (first user message) + most recent messages.
    // Find how many messages to remove from position 1 in a single pass,
    // then do ONE splice — O(n) total instead of O(n²) from repeated splice(1,1).
    let removeCount = 0;
    for (let i = 1; i < conversation.length - 2 && totalTokens > budget; i++) {
      totalTokens -= tokenCounts[i];
      removeCount++;
    }

    if (removeCount > 0) {
      conversation.splice(1, removeCount);
    }
  }

  // --------------------------------------------------------------------------
  // Input normalization (for Ollama simplified schemas)
  // --------------------------------------------------------------------------

  _normalizeToolInput(toolName, input) {
    // Gemini sometimes wraps the entire args object as a JSON string
    if (input && typeof input === 'string') {
      try {
        input = JSON.parse(input);
      } catch {
        return {};
      }
    }

    if (!input || typeof input !== 'object') return input || {};
    const schema = TOOL_SCHEMAS[toolName];
    if (!schema || !schema.properties) return input;

    const normalized = { ...input };
    for (const [key, val] of Object.entries(normalized)) {
      const propSchema = schema.properties[key];
      if (!propSchema) continue;

      // If the schema says array or object but we received a string, try to parse it
      if ((propSchema.type === 'array' || propSchema.type === 'object') && typeof val === 'string') {
        try {
          normalized[key] = JSON.parse(val);
        } catch {
          // Leave as-is if it's not valid JSON
        }
      }
    }
    return normalized;
  }

  // --------------------------------------------------------------------------
  // Approval flow
  // --------------------------------------------------------------------------

  async _requestApproval(action, taskId) {
    const requestId = uuidv4();

    this.emit('agent:approval-request', {
      requestId,
      taskId,
      action,
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, ({ approved }) => resolve(approved));

      // Auto-timeout after 1 minute
      setTimeout(() => {
        if (this.pendingApprovals.has(requestId)) {
          this.pendingApprovals.delete(requestId);
          resolve(false);
        }
      }, 60_000);
    });
  }
}

module.exports = { AgentLoop };
