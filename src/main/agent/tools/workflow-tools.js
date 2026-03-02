/**
 * WorkflowTools — Saved prompt workflow library tools.
 * Uses workflow-service.js singleton.
 */

let _workflowService = null;
let _agentCoreRef    = null;

function setWorkflowService(ws) { _workflowService = ws; }
function setAgentCore(core)     { _agentCoreRef = core; }

function getService() {
  if (!_workflowService) throw new Error('WorkflowService not initialized');
  return _workflowService;
}

const WORKFLOW_TOOLS = [
  {
    name: 'workflow_save', description: 'Save a reusable workflow prompt. Use {{variableName}} for dynamic substitution.',
    category: 'workflow', permissionLevel: 'safe', params: ['name', 'prompt'],
    execute: async ({ name, prompt, description, tags }) => {
      if (!name || !prompt) throw new Error('name and prompt are required');
      const wf = getService().save({ name, prompt, description, tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [] });
      return JSON.stringify({ ok: true, id: wf.id, name: wf.name, variables: wf.variables });
    },
  },
  {
    name: 'workflow_list', description: 'List all saved workflows.',
    category: 'workflow', permissionLevel: 'safe', params: [],
    execute: async ({ search, tag } = {}) => {
      const workflows = getService().list({ search, tag });
      return JSON.stringify({
        count: workflows.length,
        workflows: workflows.map((w) => ({ id: w.id, name: w.name, description: w.description, variables: w.variables, tags: w.tags, runCount: w.runCount, updatedAt: new Date(w.updatedAt).toISOString() })),
      });
    },
  },
  {
    name: 'workflow_run', description: 'Run a saved workflow by name or ID.',
    category: 'workflow', permissionLevel: 'sensitive', params: ['workflowId'],
    execute: async ({ workflowId, variables }) => {
      if (!workflowId) throw new Error('workflowId is required');
      let vars = variables || {};
      if (typeof variables === 'string') {
        try { vars = JSON.parse(variables); } catch { throw new Error('Invalid JSON for "variables": expected valid JSON object'); }
      }
      const result = await getService().run(workflowId, vars, _agentCoreRef);
      return JSON.stringify({ ok: true, workflow: result.workflow, prompt: result.prompt, summary: result.result?.summary });
    },
  },
  {
    name: 'workflow_delete', description: 'Delete a saved workflow.',
    category: 'workflow', permissionLevel: 'sensitive', params: ['workflowId'],
    execute: async ({ workflowId }) => {
      if (!workflowId) throw new Error('workflowId is required');
      const deleted = getService().delete(workflowId);
      return JSON.stringify({ ok: deleted, message: deleted ? `Workflow "${workflowId}" deleted` : 'Workflow not found' });
    },
  },
  {
    name: 'workflow_export', description: 'Export a workflow as JSON.',
    category: 'workflow', permissionLevel: 'safe', params: ['workflowId'],
    execute: async ({ workflowId }) => getService().export(workflowId),
  },
  {
    name: 'workflow_import', description: 'Import a workflow from JSON.',
    category: 'workflow', permissionLevel: 'sensitive', params: ['json'],
    execute: async ({ json }) => {
      if (!json) throw new Error('json is required');
      const wf = getService().import(json);
      return JSON.stringify({ ok: true, id: wf.id, name: wf.name });
    },
  },
];

module.exports = { WORKFLOW_TOOLS, setWorkflowService, setAgentCore };
