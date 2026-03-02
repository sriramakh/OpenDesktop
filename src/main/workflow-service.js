/**
 * WorkflowService — Saved prompt workflow library.
 *
 * Workflows are named, reusable prompts with optional variable substitution.
 * Persisted to {userData}/workflows.json.
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class WorkflowService {
  constructor() {
    this._workflowsFile = null;
    this._workflows     = [];
  }

  init(userDataPath) {
    this._workflowsFile = path.join(userDataPath, 'workflows.json');
    this._load();
    console.log(`[WorkflowService] Initialized with ${this._workflows.length} workflows`);
  }

  _load() {
    try {
      if (fs.existsSync(this._workflowsFile)) {
        const raw = fs.readFileSync(this._workflowsFile, 'utf-8');
        this._workflows = JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[WorkflowService] Failed to load workflows:', err.message);
      this._workflows = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._workflowsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._workflowsFile, JSON.stringify(this._workflows, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[WorkflowService] Failed to save workflows:', err.message);
    }
  }

  _substituteVariables(prompt, variables = {}) {
    return prompt.replace(/\{\{(\w+)\}\}/g, (match, name) =>
      variables[name] !== undefined ? String(variables[name]) : match
    );
  }

  _extractVariables(prompt) {
    const matches = prompt.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.slice(2, -2)))];
  }

  save({ id, name, description, prompt, variables, tags }) {
    if (!name || !prompt) throw new Error('name and prompt are required');

    const existing = id ? this._workflows.find((w) => w.id === id) : null;
    const workflow = {
      id:          existing?.id || `wf_${uuidv4().slice(0, 8)}`,
      name:        name.trim(),
      description: description || '',
      prompt,
      variables:   variables || this._extractVariables(prompt),
      tags:        tags || [],
      createdAt:   existing?.createdAt || Date.now(),
      updatedAt:   Date.now(),
      runCount:    existing?.runCount   || 0,
      lastRunAt:   existing?.lastRunAt  || null,
    };

    if (existing) {
      const idx = this._workflows.indexOf(existing);
      this._workflows[idx] = workflow;
    } else {
      this._workflows.push(workflow);
    }

    this._save();
    return workflow;
  }

  list(filter = {}) {
    let results = [...this._workflows];
    if (filter.tag)    results = results.filter((w) => w.tags?.includes(filter.tag));
    if (filter.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (w) => w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q)
      );
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id) {
    return this._workflows.find((w) => w.id === id || w.name === id) || null;
  }

  delete(id) {
    const before = this._workflows.length;
    this._workflows = this._workflows.filter((w) => w.id !== id && w.name !== id);
    if (this._workflows.length < before) { this._save(); return true; }
    return false;
  }

  async run(id, variables, agentCoreRef) {
    const workflow = this.get(id);
    if (!workflow)     throw new Error(`Workflow "${id}" not found`);
    if (!agentCoreRef) throw new Error('Agent core reference required');

    const resolvedPrompt = this._substituteVariables(workflow.prompt, variables || {});
    workflow.runCount  = (workflow.runCount || 0) + 1;
    workflow.lastRunAt = Date.now();
    this._save();

    const result = await agentCoreRef.handleUserMessage(resolvedPrompt, 'auto', []);
    return { workflow: workflow.name, prompt: resolvedPrompt, result };
  }

  export(id) {
    const workflow = this.get(id);
    if (!workflow) throw new Error(`Workflow "${id}" not found`);
    return JSON.stringify(workflow, null, 2);
  }

  import(jsonString) {
    try {
      const data     = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      const imported = { ...data, id: `wf_${uuidv4().slice(0, 8)}`, createdAt: Date.now(), updatedAt: Date.now(), runCount: 0 };
      this._workflows.push(imported);
      this._save();
      return imported;
    } catch (err) {
      throw new Error(`Invalid workflow JSON: ${err.message}`);
    }
  }
}

const workflowService = new WorkflowService();
module.exports = workflowService;
