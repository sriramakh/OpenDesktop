const { v4: uuidv4 } = require('uuid');
const { PersonaManager } = require('./personas');
const { TaskPlanner } = require('./planner');
const { configure: configureLLM, setKeyStore: setLLMKeyStore, callLLM } = require('./llm');

class AgentCore {
  constructor({ memory, permissions, context, toolRegistry, keyStore, emit }) {
    this.memory = memory;
    this.permissions = permissions;
    this.context = context;
    this.toolRegistry = toolRegistry;
    this.keyStore = keyStore;
    this.emit = emit;

    this.personaManager = new PersonaManager();
    this.planner = new TaskPlanner();

    this.currentTask = null;
    this.cancelled = false;
    this.pendingApprovals = new Map();

    this.settings = {
      llmProvider: 'ollama',
      llmModel: 'llama3',
      maxSteps: 20,
      autoApproveRead: true,
      autoApproveWrite: false,
      defaultPersona: 'auto',
      temperature: 0.7,
      maxTokens: 4096,
    };

    // Wire keystore into LLM module
    if (keyStore) {
      setLLMKeyStore(keyStore);
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    // Sync LLM module config
    configureLLM({
      provider: this.settings.llmProvider,
      model: this.settings.llmModel,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens,
    });
    return this.settings;
  }

  cancel() {
    this.cancelled = true;
    if (this.currentTask) {
      this.currentTask.status = 'cancelled';
      this.emit('agent:complete', {
        taskId: this.currentTask.id,
        status: 'cancelled',
      });
    }
  }

  resolveApproval(requestId, approved, note) {
    const resolver = this.pendingApprovals.get(requestId);
    if (resolver) {
      resolver({ approved, note });
      this.pendingApprovals.delete(requestId);
    }
  }

  async requestApproval(action) {
    const requestId = uuidv4();
    this.emit('agent:approval-request', {
      requestId,
      action,
      timestamp: Date.now(),
    });

    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, resolve);
      // Auto-timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingApprovals.has(requestId)) {
          this.pendingApprovals.delete(requestId);
          resolve({ approved: false, note: 'Approval timed out' });
        }
      }, 300000);
    });
  }

  async handleUserMessage(message, personaName) {
    this.cancelled = false;
    const taskId = uuidv4();

    // Auto-select persona if not explicitly chosen or set to 'auto'
    let resolvedPersonaName = personaName || this.settings.defaultPersona;
    if (resolvedPersonaName === 'auto' || !personaName) {
      resolvedPersonaName = await this.autoSelectPersona(message);
    }
    const persona = this.personaManager.get(resolvedPersonaName);

    this.currentTask = {
      id: taskId,
      message,
      persona: persona.name,
      status: 'running',
      steps: [],
      startTime: Date.now(),
    };

    // Store in short-term memory
    this.memory.addToShortTerm({
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });

    try {
      // Phase 1: Gather context
      this.emit('agent:step-update', {
        taskId,
        phase: 'context',
        message: 'Gathering context...',
      });

      const activeContext = await this.context.getActiveContext();
      const relevantMemories = await this.memory.search(message, 5);

      // Phase 2: Plan — decompose intent into steps
      this.emit('agent:step-update', {
        taskId,
        phase: 'planning',
        message: 'Decomposing task...',
      });

      // Build conversation history for context continuity
      const conversationHistory = this.memory.getShortTermContext()
        .slice(-10)
        .map((e) => `[${e.role}]: ${(e.content || '').slice(0, 300)}`)
        .join('\n');

      const plan = await this.planner.decompose(message, {
        persona,
        context: activeContext,
        memories: relevantMemories,
        availableTools: this.toolRegistry.listTools(),
        conversationHistory,
      });

      this.emit('agent:step-update', {
        taskId,
        phase: 'plan-ready',
        plan,
      });

      // Phase 3: Execute each step with result chaining
      const results = [];
      const stepResults = {}; // Map step id → result for dependency resolution

      for (let i = 0; i < plan.steps.length && i < this.settings.maxSteps; i++) {
        if (this.cancelled) break;

        let step = plan.steps[i];

        // Resolve params for steps that depend on prior outputs
        if (step.dependsOn && step.dependsOn.length > 0) {
          const depOutputs = {};
          for (const depId of step.dependsOn) {
            if (stepResults[depId]) depOutputs[depId] = stepResults[depId];
          }
          if (Object.keys(depOutputs).length > 0) {
            step = await this.resolveStepParams(step, depOutputs, persona);
          }
        }

        this.emit('agent:step-update', {
          taskId,
          phase: 'executing',
          stepIndex: i,
          totalSteps: plan.steps.length,
          step,
        });

        const result = await this.executeStep(step, taskId);
        results.push(result);

        // Store result indexed by step id for dependency chaining
        const stepId = step.id || (i + 1);
        stepResults[stepId] = {
          description: step.description,
          tool: step.tool,
          success: result.success || false,
          data: result.data ? String(result.data).slice(0, 4000) : null,
          error: result.error || null,
        };

        this.currentTask.steps.push({
          ...step,
          result,
          completedAt: Date.now(),
        });

        // Stream partial results
        this.emit('agent:stream', {
          taskId,
          type: 'step-result',
          stepIndex: i,
          result,
        });

        // Check if we need to re-plan based on result
        if (result.error && i < plan.steps.length - 1) {
          this.emit('agent:step-update', {
            taskId,
            phase: 'replanning',
            message: `Step failed: ${result.error}. Adjusting plan...`,
          });

          const revisedPlan = await this.planner.revise(plan, i, result, {
            persona,
            context: activeContext,
            priorResults: stepResults,
          });

          if (revisedPlan) {
            plan.steps = revisedPlan.steps;
          }
        }
      }

      // Phase 4: Synthesize final response
      this.emit('agent:step-update', {
        taskId,
        phase: 'synthesizing',
        message: 'Preparing response...',
      });

      const summary = await this.planner.synthesize(message, results, persona, stepResults);

      // Store in memory
      this.memory.addToShortTerm({
        role: 'assistant',
        content: summary,
        taskId,
        timestamp: Date.now(),
      });

      await this.memory.addToLongTerm({
        type: 'task',
        query: message,
        summary,
        steps: this.currentTask.steps.length,
        status: this.cancelled ? 'cancelled' : 'completed',
        timestamp: Date.now(),
      });

      this.currentTask.status = this.cancelled ? 'cancelled' : 'completed';

      this.emit('agent:complete', {
        taskId,
        status: this.currentTask.status,
        summary,
        steps: this.currentTask.steps,
      });

      return { taskId, summary, steps: this.currentTask.steps };
    } catch (err) {
      this.currentTask.status = 'error';
      this.emit('agent:error', {
        taskId,
        error: err.message,
      });
      return { taskId, error: err.message };
    }
  }

  /**
   * Auto-select the best persona based on user message intent.
   * Uses fast keyword heuristics first, falls back to LLM classification.
   */
  async autoSelectPersona(message) {
    const msg = message.toLowerCase();

    // Fast heuristic classification
    const executorPatterns = /\b(create|make|move|copy|delete|rename|write|save|mkdir|install|run|execute|open|launch|start|organize|sort|clean|set up|init)\b/;
    const researcherPatterns = /\b(search|find info|research|look up|what is|who is|explain|compare|difference between|how does|why does|tell me about|summarize|documentation)\b/;
    const plannerPatterns = /\b(plan|design|architect|break down|strategy|roadmap|outline|step.?by.?step|how (should|can|do) (i|we)|approach|workflow)\b/;

    if (executorPatterns.test(msg)) return 'executor';
    if (researcherPatterns.test(msg)) return 'researcher';
    if (plannerPatterns.test(msg)) return 'planner';

    // LLM fallback for ambiguous messages
    try {
      const classifyPrompt = `Classify this user request into exactly one category. Reply with ONLY the category name, nothing else.

Categories:
- executor: User wants to DO something (create files, move files, open apps, run commands, organize folders)
- researcher: User wants to KNOW something (search, lookup, explain, compare, summarize)
- planner: User wants to PLAN something (design, architect, strategize, outline steps)

User request: "${message.slice(0, 200)}"

Category:`;
      const result = await callLLM('You are a classifier. Reply with a single word.', classifyPrompt);
      const cleaned = result.trim().toLowerCase().replace(/[^a-z]/g, '');
      if (['executor', 'researcher', 'planner'].includes(cleaned)) return cleaned;
    } catch (err) {
      console.error('[AgentCore] autoSelectPersona LLM error:', err.message);
    }

    return 'executor'; // Default to executor for action-oriented tasks
  }

  /**
   * Use the LLM to resolve step params at runtime using outputs from prior steps.
   */
  async resolveStepParams(step, priorResults, persona) {
    const priorSummary = Object.entries(priorResults)
      .map(([id, r]) => `Step ${id} (${r.tool}): ${r.success ? 'SUCCESS' : 'FAILED'}\nOutput: ${(r.data || r.error || 'no output').slice(0, 1500)}`)
      .join('\n---\n');

    const prompt = `You are resolving parameters for the next step in a task plan.

Prior step results:
${priorSummary}

Next step to execute:
- Tool: ${step.tool}
- Description: ${step.description}
- Current params: ${JSON.stringify(step.params)}

Based on the prior results, fill in or correct the params for this step. Return ONLY a JSON object with the resolved params, nothing else. If the current params are already correct, return them unchanged.`;

    try {
      const response = await callLLM(persona.systemPrompt, prompt);
      const parsed = this.planner.parseJSON(response);
      if (parsed && typeof parsed === 'object') {
        return { ...step, params: { ...step.params, ...parsed } };
      }
    } catch (err) {
      console.error('[AgentCore] resolveStepParams error:', err.message);
    }
    return step;
  }

  async executeStep(step, taskId) {
    const tool = this.toolRegistry.get(step.tool);
    if (!tool) {
      return { error: `Unknown tool: ${step.tool}` };
    }

    // Check permissions
    const permLevel = this.permissions.classify(step.tool, step.params);

    if (permLevel === 'dangerous') {
      const { approved, note } = await this.requestApproval({
        tool: step.tool,
        params: step.params,
        description: step.description,
        riskLevel: 'dangerous',
      });

      if (!approved) {
        return {
          skipped: true,
          reason: note || 'User denied approval',
        };
      }
    } else if (permLevel === 'sensitive' && !this.settings.autoApproveWrite) {
      const { approved, note } = await this.requestApproval({
        tool: step.tool,
        params: step.params,
        description: step.description,
        riskLevel: 'sensitive',
      });

      if (!approved) {
        return {
          skipped: true,
          reason: note || 'User denied approval',
        };
      }
    }

    // Execute
    this.emit('agent:tool-call', {
      taskId,
      tool: step.tool,
      params: step.params,
      timestamp: Date.now(),
    });

    try {
      const result = await tool.execute(step.params);
      return { success: true, data: result };
    } catch (err) {
      return { error: err.message };
    }
  }
}

module.exports = { AgentCore };
