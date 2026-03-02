/**
 * AgentSpawner — Multi-agent orchestration helper.
 *
 * Creates isolated sub-agent loops for parallel task execution.
 * Used by orchestration-tools.js.
 */

const { AgentLoop } = require('./loop');

class AgentSpawner {
  constructor({ toolRegistry, llm, permissions, emit }) {
    this.toolRegistry = toolRegistry;
    this.llm          = llm;
    this.permissions  = permissions;
    this.emit         = emit || (() => {});
  }

  /**
   * Run a sub-agent with a given prompt.
   * @param {object} opts
   * @param {string}        opts.prompt         - Task prompt
   * @param {string[]}      opts.tools          - Restrict to these tool names (null = all)
   * @param {number}        opts.maxTurns       - Max turns (default: 15)
   * @param {string}        opts.systemPrompt   - Optional system prompt override
   * @param {Function|null} opts.emitToRenderer - Optional emit fn for Work Mode step streaming
   * @param {string|null}   opts.workTaskId     - Task ID to tag work step events with
   * @param {string|null}   opts.llmProvider    - Override LLM provider (e.g. 'anthropic')
   * @param {string|null}   opts.llmModel       - Override LLM model (e.g. 'claude-sonnet-4-6')
   * @returns {Promise<string>}
   */
  async spawn({ prompt, tools = null, maxTurns = 15, systemPrompt = null,
                emitToRenderer = null, workTaskId = null,
                llmProvider = null, llmModel = null }) {
    let registry = this.toolRegistry;
    if (tools && Array.isArray(tools) && tools.length > 0) {
      registry = this._createRestrictedRegistry(tools);
    }

    // Build emit function: if emitToRenderer provided, tag every event with workTaskId + _workStep
    const emitFn = emitToRenderer
      ? (event, data) => emitToRenderer(event, { ...data, taskId: workTaskId, _workStep: true })
      : () => {};

    const subLoop = new AgentLoop({
      toolRegistry: registry,
      llm:          this.llm,
      permissions:  this.permissions,
      emit:         emitFn,
    });

    const sysPrompt = systemPrompt || [
      'You are a focused sub-agent. Complete the task concisely.',
      'Use tools when needed. Return a clear, structured result.',
      'Do not ask clarifying questions — make reasonable assumptions.',
    ].join('\n');

    const messages = [{ role: 'user', content: prompt }];

    try {
      const result = await subLoop.run({
        messages,
        systemPrompt: sysPrompt,
        taskId:       workTaskId || `spawn_${Date.now()}`,
        options:      {
          maxTurns,
          ...(llmProvider ? { provider: llmProvider } : {}),
          ...(llmModel    ? { model:    llmModel    } : {}),
        },
        pendingApprovals: new Map(),
      });
      return result.text || '(no response)';
    } catch (err) {
      return `Sub-agent error: ${err.message}`;
    }
  }

  /**
   * Run multiple prompts in parallel.
   * @param {object} opts
   * @param {string[]} opts.prompts
   * @param {string[]} opts.tools
   * @param {number}   opts.maxTurns
   * @returns {Promise<Array<{index, prompt, result, error}>>}
   */
  async fanOut({ prompts, tools = null, maxTurns = 15 }) {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('prompts must be a non-empty array');
    }

    return Promise.all(
      prompts.map(async (prompt, idx) => {
        try {
          const result = await this.spawn({ prompt, tools, maxTurns });
          return { index: idx, prompt, result, error: null };
        } catch (err) {
          return { index: idx, prompt, result: null, error: err.message };
        }
      })
    );
  }

  /**
   * Apply a prompt template to each item in an array.
   * Use {{item}} as the placeholder.
   */
  async map({ template, items, tools = null, maxTurns = 15 }) {
    if (!template || !Array.isArray(items)) {
      throw new Error('template and items are required');
    }

    const prompts = items.map((item) => template.replace(/\{\{item\}\}/g, String(item)));
    const results = await this.fanOut({ prompts, tools, maxTurns });
    return results.map((r, i) => ({ item: items[i], ...r }));
  }

  /**
   * Combine multiple results with a synthesizing sub-agent.
   */
  async reduce({ results, combinePrompt, maxTurns = 10 }) {
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('results must be a non-empty array');
    }

    const numbered = results.map((r, i) => `## Result ${i + 1}\n${r}`).join('\n\n');
    const prompt   = [
      combinePrompt || 'Synthesize these results into a single comprehensive response.',
      '',
      numbered,
    ].join('\n');

    return this.spawn({ prompt, tools: null, maxTurns });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _createRestrictedRegistry(toolNames) {
    const toolSet = new Set(toolNames);
    return {
      get:              (name)     => toolSet.has(name) ? this.toolRegistry.get(name) : null,
      listTools:        ()         => this.toolRegistry.listTools().filter((t) => toolSet.has(t.name)),
      getToolDefinitions: (provider) => {
        const fullDefs = this.toolRegistry.getToolDefinitions(provider);
        if (Array.isArray(fullDefs)) {
          return fullDefs.filter((d) => {
            const name = d.name || d.function?.name;
            return toolSet.has(name);
          });
        }
        // Gemini format
        if (fullDefs[0]?.functionDeclarations) {
          return [{ functionDeclarations: fullDefs[0].functionDeclarations.filter((d) => toolSet.has(d.name)) }];
        }
        return fullDefs;
      },
    };
  }
}

module.exports = { AgentSpawner };
