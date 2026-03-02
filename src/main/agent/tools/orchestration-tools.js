/**
 * OrchestrationTools — Multi-agent orchestration tools.
 * Uses AgentSpawner for sub-agent execution.
 */

let _spawner = null;
function setSpawner(s) { _spawner = s; }
function getSpawner() {
  if (!_spawner) throw new Error('AgentSpawner not initialized');
  return _spawner;
}

/** Safely parse JSON strings or return value as-is */
function safeJsonParse(val, fieldName) {
  if (val == null) return val;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch {
    throw new Error(`Invalid JSON for "${fieldName}": expected valid JSON array or object`);
  }
}

const ORCHESTRATION_TOOLS = [
  {
    name: 'agent_spawn', description: 'Spawn a sub-agent to complete a focused sub-task independently. Returns the sub-agent\'s final answer.',
    category: 'orchestration', permissionLevel: 'sensitive', params: ['prompt'],
    execute: async ({ prompt, tools, maxTurns = 15, systemPrompt }) => {
      if (!prompt) throw new Error('prompt is required');
      const toolList = safeJsonParse(tools, 'tools');
      return getSpawner().spawn({ prompt, tools: toolList, maxTurns, systemPrompt });
    },
  },
  {
    name: 'agent_fanout', description: 'Run multiple prompts in parallel using independent sub-agents.',
    category: 'orchestration', permissionLevel: 'sensitive', params: ['prompts'],
    execute: async ({ prompts, tools, maxTurns = 15 }) => {
      if (!prompts) throw new Error('prompts is required');
      const promptList = safeJsonParse(prompts, 'prompts');
      const toolList   = safeJsonParse(tools, 'tools');
      const results    = await getSpawner().fanOut({ prompts: promptList, tools: toolList, maxTurns });
      return JSON.stringify(results, null, 2);
    },
  },
  {
    name: 'agent_map', description: 'Apply a prompt template to each item in an array using parallel sub-agents. Use {{item}} in the template.',
    category: 'orchestration', permissionLevel: 'sensitive', params: ['template', 'items'],
    execute: async ({ template, items, tools, maxTurns = 15 }) => {
      if (!template || !items) throw new Error('template and items are required');
      const itemList = safeJsonParse(items, 'items');
      const toolList = safeJsonParse(tools, 'tools');
      const results  = await getSpawner().map({ template, items: itemList, tools: toolList, maxTurns });
      return JSON.stringify(results, null, 2);
    },
  },
  {
    name: 'agent_reduce', description: 'Combine multiple text results into one synthesized output using a sub-agent.',
    category: 'orchestration', permissionLevel: 'sensitive', params: ['results'],
    execute: async ({ results, combinePrompt, maxTurns = 10 }) => {
      if (!results) throw new Error('results is required');
      const resultList = safeJsonParse(results, 'results');
      return getSpawner().reduce({ results: resultList, combinePrompt, maxTurns });
    },
  },
];

ORCHESTRATION_TOOLS._setSpawner = setSpawner;
module.exports = { ORCHESTRATION_TOOLS, setSpawner };
