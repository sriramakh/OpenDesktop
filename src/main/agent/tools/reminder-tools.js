/**
 * Reminder tools — schedule, list, and cancel native OS reminder notifications.
 *
 * Requires reminderService.init() to be called in main.js before these run.
 */

const reminderService = require('../../reminder-service');

// ---------------------------------------------------------------------------
// Time parser
// Accepts ISO 8601, relative ("in 30 minutes"), or natural ("8pm", "tomorrow at 9am")
// ---------------------------------------------------------------------------

function parseReminderTime(str) {
  if (!str) throw new Error('No time specified');
  const clean = str.trim();

  // 1. ISO 8601 / native Date — most reliable, agent should prefer this
  const d = new Date(clean);
  if (!isNaN(d.getTime()) && d.getTime() > Date.now() - 5000) return d;

  const lower = clean.toLowerCase();
  const now   = new Date();

  // 2. Relative: "in 30 minutes", "in 2 hours", "in 1 hour 30 minutes"
  const relMatch = lower.match(
    /in\s+(\d+(?:\.\d+)?)\s*(minute|min|hour|hr|day)s?(?:\s+(?:and\s+)?(\d+)\s*(minute|min)s?)?/
  );
  if (relMatch) {
    let ms = 0;
    const val1  = parseFloat(relMatch[1]);
    const unit1 = relMatch[2];
    if (/^(hour|hr)/.test(unit1)) ms += val1 * 3_600_000;
    else if (/^day/.test(unit1))  ms += val1 * 86_400_000;
    else                          ms += val1 * 60_000;
    if (relMatch[3]) ms += parseInt(relMatch[3]) * 60_000;
    return new Date(Date.now() + ms);
  }

  // 3. Named day or "tomorrow" anchor
  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayMatch = lower.match(
    /\b(tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  let baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dayMatch) {
    if (dayMatch[1] === 'tomorrow') {
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else {
      const targetDay = DAYS.indexOf(dayMatch[1]);
      let diff = targetDay - now.getDay();
      if (diff <= 0) diff += 7;
      baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    }
  }

  // 4. Parse time component: "8pm", "8:30pm", "20:00", "noon", "midnight"
  if (/\bnoon\b/.test(lower))     { baseDate.setHours(12, 0, 0, 0); }
  else if (/\bmidnight\b/.test(lower)) { baseDate.setHours(0, 0, 0, 0); }
  else {
    const ampmMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    const h24Match  = lower.match(/\b(\d{1,2}):(\d{2})\b/);

    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1]);
      const mins = parseInt(ampmMatch[2] || '0');
      if (ampmMatch[3] === 'pm' && hours !== 12) hours += 12;
      if (ampmMatch[3] === 'am' && hours === 12) hours = 0;
      baseDate.setHours(hours, mins, 0, 0);
    } else if (h24Match) {
      baseDate.setHours(parseInt(h24Match[1]), parseInt(h24Match[2]), 0, 0);
    } else {
      throw new Error(
        `Could not parse time: "${str}". ` +
        'Use ISO format (e.g. "2026-02-26T20:00:00"), ' +
        'relative (e.g. "in 30 minutes", "in 2 hours"), ' +
        'or natural (e.g. "8pm", "8:30am", "tomorrow at 9am", "friday at 6pm").'
      );
    }
  }

  // If the computed time is in the past and no explicit day was given, move to tomorrow
  if (baseDate.getTime() <= Date.now() && !dayMatch) {
    baseDate.setDate(baseDate.getDate() + 1);
  }

  return baseDate;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const ReminderTools = [
  {
    name: 'reminder_set',
    category: 'system',
    permissionLevel: 'safe',
    description: 'Schedule a native OS notification reminder at a specific time. Converts natural language time to an OS notification.',
    params: ['message', 'at'],
    async execute({ message, at }) {
      if (!message?.trim()) throw new Error('"message" is required — what should the reminder say?');
      if (!at?.trim())      throw new Error('"at" is required — when should the reminder fire?');

      const fireDate = parseReminderTime(at);
      const msUntil  = fireDate.getTime() - Date.now();
      if (msUntil < 0) throw new Error(`Computed fire time is in the past: ${fireDate.toLocaleString()}`);

      const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      reminderService.addReminder({ id, message: message.trim(), fireAt: fireDate.getTime() });

      const timeStr = fireDate.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
      const mins   = Math.round(msUntil / 60_000);
      const delay  = mins < 60
        ? `${mins} min`
        : mins < 1440
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;

      return `Reminder set ✓\nID: ${id}\nMessage: "${message.trim()}"\nFires: ${timeStr} (in ${delay})`;
    },
  },

  {
    name: 'reminder_list',
    category: 'system',
    permissionLevel: 'safe',
    description: 'List pending reminders (or all reminders if status="all").',
    params: ['status'],
    async execute({ status = 'pending' } = {}) {
      const reminders = reminderService.listReminders(status);
      if (!reminders.length) {
        return status === 'all'
          ? 'No reminders found.'
          : 'No pending reminders.';
      }

      const now = Date.now();
      return reminders.map((r) => {
        const fireDate = new Date(r.fire_at);
        const timeStr  = fireDate.toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
        const msLeft = r.fire_at - now;
        const detail = r.status === 'pending'
          ? (msLeft > 0 ? `in ${Math.round(msLeft / 60_000)} min` : 'overdue')
          : r.status;
        return `[${r.id}] "${r.message}" — ${timeStr} (${detail})`;
      }).join('\n');
    },
  },

  {
    name: 'reminder_cancel',
    category: 'system',
    permissionLevel: 'safe',
    description: 'Cancel a pending reminder by its ID.',
    params: ['id'],
    async execute({ id }) {
      if (!id?.trim()) throw new Error('"id" is required');
      const ok = reminderService.cancelReminder(id.trim());
      if (!ok) throw new Error(`No pending reminder found with ID: ${id}`);
      return `Reminder "${id}" cancelled.`;
    },
  },
];

module.exports = { ReminderTools };
