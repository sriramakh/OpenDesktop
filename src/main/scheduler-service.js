/**
 * SchedulerService — Cron-based task scheduler singleton.
 *
 * Mirrors reminder-service.js architecture.
 * Persists tasks to {userData}/scheduled-tasks.json.
 * Uses node-cron for cron expression scheduling.
 */

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

class SchedulerService {
  constructor() {
    this._userDataPath = null;
    this._tasksFile    = null;
    this._agentCoreRef = null;
    this._emitFn       = null;
    this._tasks        = [];
    this._cronJobs     = new Map();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  init(userDataPath, agentCoreRef, emitFn) {
    this._userDataPath = userDataPath;
    this._tasksFile    = path.join(userDataPath, 'scheduled-tasks.json');
    this._agentCoreRef = agentCoreRef;
    this._emitFn       = emitFn;

    this._load();
    this._scheduleAll();
    console.log(`[Scheduler] Initialized with ${this._tasks.length} tasks`);
  }

  _load() {
    try {
      if (fs.existsSync(this._tasksFile)) {
        const raw = fs.readFileSync(this._tasksFile, 'utf-8');
        this._tasks = JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[Scheduler] Failed to load tasks:', err.message);
      this._tasks = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._tasksFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._tasksFile, JSON.stringify(this._tasks, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[Scheduler] Failed to save tasks:', err.message);
    }
  }

  _scheduleAll() {
    for (const task of this._tasks) {
      if (task.enabled !== false) {
        this._scheduleTask(task);
      }
    }
  }

  _scheduleTask(task) {
    if (!cron.validate(task.schedule)) {
      console.warn(`[Scheduler] Invalid cron for "${task.name}": ${task.schedule}`);
      return;
    }

    this._cancelJob(task.id);

    const job = cron.schedule(task.schedule, async () => {
      await this._runTask(task);
    }, { timezone: task.timezone || 'America/New_York' });

    this._cronJobs.set(task.id, job);
    console.log(`[Scheduler] Scheduled "${task.name}" (${task.schedule})`);
  }

  _cancelJob(id) {
    const existing = this._cronJobs.get(id);
    if (existing) {
      existing.destroy();
      this._cronJobs.delete(id);
    }
  }

  async _runTask(task) {
    const startTime = Date.now();
    console.log(`[Scheduler] Running "${task.name}"`);

    this._emitFn?.('scheduler:task-started', { id: task.id, name: task.name, startTime });

    task.lastRunAt = startTime;
    task.runCount  = (task.runCount || 0) + 1;
    this._save();

    try {
      if (!this._agentCoreRef) throw new Error('Agent core not available');
      const result = await this._agentCoreRef.handleUserMessage(task.prompt, 'auto', []);

      this._emitFn?.('scheduler:task-completed', {
        id:       task.id,
        name:     task.name,
        duration: Date.now() - startTime,
        summary:  result?.summary || '(no summary)',
      });
    } catch (err) {
      console.error(`[Scheduler] Task "${task.name}" failed:`, err.message);
      this._emitFn?.('scheduler:task-error', {
        id:       task.id,
        name:     task.name,
        error:    err.message,
        duration: Date.now() - startTime,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  createTask({ id, name, prompt, schedule, enabled = true, timezone, description }) {
    if (!name || !prompt || !schedule) throw new Error('name, prompt, and schedule are required');
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: "${schedule}". Example: "0 9 * * 1-5" for weekdays at 9am`);
    }

    const task = {
      id:          id || `sched_${uuidv4().slice(0, 8)}`,
      name,
      prompt,
      schedule,
      enabled,
      timezone:    timezone || 'America/New_York',
      description: description || '',
      createdAt:   Date.now(),
      lastRunAt:   null,
      runCount:    0,
    };

    this._tasks.push(task);
    this._save();

    if (enabled) this._scheduleTask(task);
    return task;
  }

  listTasks() {
    return this._tasks.map((t) => ({ ...t, isRunning: this._cronJobs.has(t.id) }));
  }

  getTask(id) {
    return this._tasks.find((t) => t.id === id) || null;
  }

  deleteTask(id) {
    this._cancelJob(id);
    const before = this._tasks.length;
    this._tasks = this._tasks.filter((t) => t.id !== id);
    if (this._tasks.length < before) { this._save(); return true; }
    return false;
  }

  toggleTask(id, enabled) {
    const task = this._tasks.find((t) => t.id === id);
    if (!task) return null;
    task.enabled = enabled;
    this._save();
    if (enabled) { this._scheduleTask(task); } else { this._cancelJob(id); }
    return task;
  }

  async runNow(id) {
    const task = this._tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task "${id}" not found`);
    await this._runTask(task);
    return { ok: true };
  }

  stop() {
    for (const [id] of this._cronJobs) this._cancelJob(id);
    console.log('[Scheduler] All cron jobs stopped');
  }
}

const schedulerService = new SchedulerService();
module.exports = schedulerService;
