/**
 * WorkService — AI-powered task breakdown & execution.
 *
 * Manages WorkItems and their WorkSteps.
 * Persisted to {userData}/work-items.json.
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class WorkService {
  constructor() {
    this._itemsFile = null;
    this._items     = [];
  }

  init(userDataPath) {
    this._itemsFile = path.join(userDataPath, 'work-items.json');
    this._load();
    console.log(`[WorkService] Initialized with ${this._items.length} work items`);
  }

  _load() {
    try {
      if (fs.existsSync(this._itemsFile)) {
        const raw = fs.readFileSync(this._itemsFile, 'utf-8');
        this._items = JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[WorkService] Failed to load work items:', err.message);
      this._items = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._itemsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._itemsFile, JSON.stringify(this._items, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[WorkService] Failed to save work items:', err.message);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  listItems({ status, search } = {}) {
    let results = [...this._items];
    if (status) results = results.filter((w) => w.status === status);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (w) => w.title.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q)
      );
    }
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getItem(id) {
    return this._items.find((w) => w.id === id) || null;
  }

  saveItem(data) {
    const existing = data.id ? this._items.find((w) => w.id === data.id) : null;
    const item = {
      id:          existing?.id || `wi_${uuidv4().slice(0, 8)}`,
      title:       (data.title || 'Untitled').trim(),
      description: data.description || '',
      status:      data.status || 'todo',
      steps:       data.steps || existing?.steps || [],
      jiraKey:     data.jiraKey   !== undefined ? data.jiraKey   : (existing?.jiraKey   || null),
      jiraUrl:     data.jiraUrl   !== undefined ? data.jiraUrl   : (existing?.jiraUrl   || null),
      tags:        data.tags      !== undefined ? data.tags      : (existing?.tags      || []),
      createdAt:   existing?.createdAt || Date.now(),
      updatedAt:   Date.now(),
    };

    if (existing) {
      const idx = this._items.indexOf(existing);
      this._items[idx] = item;
    } else {
      this._items.unshift(item);
    }

    this._save();
    return item;
  }

  deleteItem(id) {
    const before = this._items.length;
    this._items = this._items.filter((w) => w.id !== id);
    if (this._items.length < before) { this._save(); return true; }
    return false;
  }

  // ── Step CRUD ───────────────────────────────────────────────────────────────

  addStep(itemId, stepData) {
    const item = this.getItem(itemId);
    if (!item) throw new Error(`Work item "${itemId}" not found`);

    const maxOrder = item.steps.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
    const step = {
      id:             `ws_${uuidv4().slice(0, 8)}`,
      title:          (stepData.title || 'New Step').trim(),
      prompt:         stepData.prompt         || '',
      expectedOutput: stepData.expectedOutput || '',
      resources:      stepData.resources      || [],
      toolHints:      stepData.toolHints      || [],
      status:         'pending',
      result:         null,
      taskId:         null,
      parentStepId:   stepData.parentStepId   || null,
      order:          stepData.order !== undefined ? stepData.order : maxOrder + 1,
      createdAt:      Date.now(),
    };

    item.steps.push(step);
    item.updatedAt = Date.now();
    this._recalcItemStatus(item);
    this._save();
    return item;
  }

  updateStep(itemId, stepId, patch) {
    const item = this.getItem(itemId);
    if (!item) throw new Error(`Work item "${itemId}" not found`);

    const idx = item.steps.findIndex((s) => s.id === stepId);
    if (idx === -1) throw new Error(`Step "${stepId}" not found`);

    item.steps[idx] = { ...item.steps[idx], ...patch };
    item.updatedAt = Date.now();
    this._recalcItemStatus(item);
    this._save();
    return item;
  }

  deleteStep(itemId, stepId) {
    const item = this.getItem(itemId);
    if (!item) throw new Error(`Work item "${itemId}" not found`);

    // Remove step and all children
    const idsToRemove = new Set([stepId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of item.steps) {
        if (!idsToRemove.has(s.id) && idsToRemove.has(s.parentStepId)) {
          idsToRemove.add(s.id);
          changed = true;
        }
      }
    }

    item.steps = item.steps.filter((s) => !idsToRemove.has(s.id));
    item.updatedAt = Date.now();
    this._recalcItemStatus(item);
    this._save();
    return item;
  }

  reorderSteps(itemId, orderedIds) {
    const item = this.getItem(itemId);
    if (!item) throw new Error(`Work item "${itemId}" not found`);

    orderedIds.forEach((id, idx) => {
      const step = item.steps.find((s) => s.id === id);
      if (step) step.order = idx;
    });

    item.updatedAt = Date.now();
    this._save();
    return item;
  }

  // ── Step lifecycle ──────────────────────────────────────────────────────────

  markStepRunning(itemId, stepId, taskId) {
    return this.updateStep(itemId, stepId, { status: 'running', taskId, result: null });
  }

  markStepDone(itemId, stepId, result) {
    return this.updateStep(itemId, stepId, { status: 'done', result: result || null, taskId: null });
  }

  markStepError(itemId, stepId, error) {
    return this.updateStep(itemId, stepId, { status: 'error', result: error || 'Unknown error', taskId: null });
  }

  resetStep(itemId, stepId) {
    return this.updateStep(itemId, stepId, { status: 'pending', result: null, taskId: null });
  }

  // ── Jira import ─────────────────────────────────────────────────────────────

  importFromJira(jiraIssue) {
    const title       = jiraIssue.fields?.summary     || jiraIssue.summary     || 'Jira Issue';
    const description = jiraIssue.fields?.description || jiraIssue.description || '';
    const key         = jiraIssue.key || null;
    const url         = key && jiraIssue.self
      ? jiraIssue.self.replace(/\/rest\/api\/.*$/, '') + '/browse/' + key
      : null;

    const item = this.saveItem({
      title,
      description: typeof description === 'string' ? description : JSON.stringify(description),
      status: 'todo',
      jiraKey: key,
      jiraUrl: url,
      tags: ['jira'],
      steps: [],
    });

    // Add a starter step using the description as the prompt
    return this.addStep(item.id, {
      title:          `Implement: ${title}`,
      prompt:         `${description || title}\n\nComplete this Jira task as described above.`,
      expectedOutput: 'Implementation complete, all acceptance criteria met.',
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _recalcItemStatus(item) {
    if (!item.steps.length) return;
    const statuses = item.steps.map((s) => s.status);
    if (statuses.every((s) => s === 'done')) {
      item.status = 'done';
    } else if (statuses.some((s) => s === 'running' || s === 'done' || s === 'error')) {
      item.status = 'in_progress';
    } else {
      item.status = 'todo';
    }
  }
}

const workService = new WorkService();
module.exports = workService;
