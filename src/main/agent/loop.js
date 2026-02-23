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
  constructor({ toolRegistry, llm, permissions, emit }) {
    this.toolRegistry = toolRegistry;
    this.llm = llm;
    this.permissions = permissions;
    this.emit = emit;
    this.cancelled = false;
    this.pendingApprovals = new Map();
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
  async run({ messages, systemPrompt, taskId, options = {}, pendingApprovals }) {
    const maxTurns = options.maxTurns || 50;
    this.cancelled = false;

    if (pendingApprovals) {
      this.pendingApprovals = pendingApprovals;
    }

    // Work on a copy so caller's array is unchanged
    const conversation = [...messages];

    let turns = 0;
    let accumulatedText = '';

    while (turns < maxTurns && !this.cancelled) {
      turns++;

      this.emit('agent:thinking', { taskId, turn: turns });

      // Get tool definitions in the format the current provider expects
      const toolDefs = this.toolRegistry.getToolDefinitions(
        this.llm.getCurrentProvider()
      );

      // Truncate conversation if it's getting too large for the model's context
      this._truncateConversation(conversation, systemPrompt);

      // Call LLM — returns { text, toolCalls, rawContent, stopReason }
      let response;
      try {
        response = await this.llm.callWithTools(systemPrompt, conversation, toolDefs, {
          onTextToken: (token) => {
            accumulatedText += token;
            this.emit('agent:token', { taskId, token });
          },
        });
      } catch (err) {
        // Surface LLM errors clearly
        throw new Error(`LLM call failed (turn ${turns}): ${err.message}`);
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
        return { text: finalText, messages: conversation, turns };
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

      // Trim large tool results before appending to conversation
      const trimmedResults = toolResults.map((r) => ({
        ...r,
        content: r.content && r.content.length > 8000
          ? r.content.slice(0, 8000) + '\n... [output truncated — ' + r.content.length + ' chars total]'
          : r.content,
      }));

      // Append tool results to conversation (provider-specific format handled by llm module)
      conversation.push({
        role: 'tool_results',
        results: trimmedResults,
      });

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
      return { text: accumulatedText, messages: conversation, turns, cancelled: true };
    }

    throw new Error(
      `Agent reached maximum turns (${maxTurns}). The task may be too complex or the model is looping.`
    );
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

    // Execute all approved calls in parallel
    const toExecute = [...safe, ...approvedDangerous];
    const results = await Promise.allSettled(
      toExecute.map((tc) => this._executeSingleTool(tc, taskId))
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

    this.emit('agent:tool-start', {
      taskId,
      id: tc.id,
      name: tc.name,
      input: normalizedInput,
    });

    // Determine timeout: office_* and browser_* tools get 120s; others get 30s
    const isLongRunning = tc.name.startsWith('office_') || tc.name.startsWith('browser_');
    const timeoutMs = isLongRunning ? 120_000 : 30_000;

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

        this.emit('agent:tool-end', {
          taskId,
          id: tc.id,
          name: tc.name,
          success: true,
          outputPreview: content.slice(0, 300),
        });

        return { id: tc.id, name: tc.name, content };
      } catch (err) {
        lastErr = err;
        // Only retry on transient errors, and not on the last attempt
        if (isTransient(err) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        break;
      }
    }

    this.emit('agent:tool-end', {
      taskId,
      id: tc.id,
      name: tc.name,
      success: false,
      error: lastErr.message,
    });

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

    // Estimate current conversation size
    let totalTokens = 0;
    for (const msg of conversation) {
      totalTokens += this._estimateTokens(msg.content);
      if (msg.results) {
        for (const r of msg.results) {
          totalTokens += this._estimateTokens(r.content);
        }
      }
    }

    if (totalTokens <= budget) return;

    // Strategy: keep the first user message and the most recent messages.
    // Remove older assistant/tool_results pairs from the middle.
    while (totalTokens > budget && conversation.length > 3) {
      // Find the first removable message (skip index 0 = first user message)
      const removed = conversation.splice(1, 1)[0];
      let removedTokens = this._estimateTokens(removed.content);
      if (removed.results) {
        for (const r of removed.results) {
          removedTokens += this._estimateTokens(r.content);
        }
      }
      totalTokens -= removedTokens;
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

      // Auto-timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingApprovals.has(requestId)) {
          this.pendingApprovals.delete(requestId);
          resolve(false);
        }
      }, 300_000);
    });
  }
}

module.exports = { AgentLoop };
