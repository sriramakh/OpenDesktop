/**
 * SchedulerTools — Cron scheduler management tools.
 * Uses scheduler-service.js singleton.
 */

let _schedulerService = null;
function setSchedulerService(ss) { _schedulerService = ss; }
function getService() {
  if (!_schedulerService) throw new Error('SchedulerService not initialized');
  return _schedulerService;
}

const SCHEDULER_TOOLS = [
  {
    name: 'schedule_create', description: 'Create a scheduled task using a cron expression. Example: "0 9 * * 1-5" runs Mon-Fri at 9am.',
    category: 'scheduler', permissionLevel: 'sensitive', params: ['name', 'prompt', 'schedule'],
    execute: async ({ name, prompt, schedule, enabled = true, timezone, description }) => {
      if (!name || !prompt || !schedule) throw new Error('name, prompt, and schedule are required');
      const task = getService().createTask({ name, prompt, schedule, enabled, timezone, description });
      return JSON.stringify({ ok: true, id: task.id, name: task.name, schedule: task.schedule, enabled: task.enabled });
    },
  },
  {
    name: 'schedule_list', description: 'List all scheduled tasks.',
    category: 'scheduler', permissionLevel: 'safe', params: [],
    execute: async () => {
      const tasks = getService().listTasks();
      return JSON.stringify({
        count: tasks.length,
        tasks: tasks.map((t) => ({ id: t.id, name: t.name, schedule: t.schedule, enabled: t.enabled, isRunning: t.isRunning, runCount: t.runCount, lastRunAt: t.lastRunAt ? new Date(t.lastRunAt).toISOString() : null, description: t.description })),
      });
    },
  },
  {
    name: 'schedule_delete', description: 'Delete a scheduled task.',
    category: 'scheduler', permissionLevel: 'sensitive', params: ['taskId'],
    execute: async ({ taskId }) => {
      if (!taskId) throw new Error('taskId is required');
      const deleted = getService().deleteTask(taskId);
      return JSON.stringify({ ok: deleted, message: deleted ? `Task deleted` : 'Task not found' });
    },
  },
  {
    name: 'schedule_enable', description: 'Enable a paused scheduled task.',
    category: 'scheduler', permissionLevel: 'sensitive', params: ['taskId'],
    execute: async ({ taskId }) => {
      if (!taskId) throw new Error('taskId is required');
      const task = getService().toggleTask(taskId, true);
      return JSON.stringify({ ok: !!task, task });
    },
  },
  {
    name: 'schedule_disable', description: 'Disable (pause) a scheduled task without deleting it.',
    category: 'scheduler', permissionLevel: 'sensitive', params: ['taskId'],
    execute: async ({ taskId }) => {
      if (!taskId) throw new Error('taskId is required');
      const task = getService().toggleTask(taskId, false);
      return JSON.stringify({ ok: !!task, task });
    },
  },
  {
    name: 'schedule_run_now', description: 'Immediately run a scheduled task once.',
    category: 'scheduler', permissionLevel: 'sensitive', params: ['taskId'],
    execute: async ({ taskId }) => {
      if (!taskId) throw new Error('taskId is required');
      await getService().runNow(taskId);
      return JSON.stringify({ ok: true, message: `Task "${taskId}" triggered` });
    },
  },
];

module.exports = { SCHEDULER_TOOLS, setSchedulerService };
