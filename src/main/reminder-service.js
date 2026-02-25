/**
 * ReminderService — self-contained reminder scheduler.
 *
 * Persists reminders to {userData}/reminders.json — no SQLite dependency.
 * Polls every 30 s and fires native OS notifications via Electron.
 *
 * Usage (in main.js):
 *   reminderService.init(app.getPath('userData'), emitFn);
 */

const path = require('path');
const fs   = require('fs');

let _dataFile  = null;   // absolute path to reminders.json
let _reminders = [];     // in-memory array of reminder objects
let _emitFn    = null;
let _timer     = null;

const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function init(userDataPath, emitFn) {
  _dataFile = path.join(userDataPath, 'reminders.json');
  _emitFn   = emitFn;
  _loadFromDisk();
  _startPolling();
  console.log(`[ReminderService] Initialized (${_reminders.filter(r => r.status === 'pending').length} pending)`);
}

function addReminder({ id, message, fireAt }) {
  _reminders.push({
    id,
    message,
    fire_at:    fireAt,
    status:     'pending',
    created_at: Date.now(),
    fired_at:   null,
  });
  _saveToDisk();
  return id;
}

function listReminders(status = 'pending') {
  if (status === 'all') return [..._reminders].sort((a, b) => b.created_at - a.created_at).slice(0, 50);
  return _reminders
    .filter((r) => r.status === status)
    .sort((a, b) => a.fire_at - b.fire_at);
}

function cancelReminder(id) {
  const r = _reminders.find((r) => r.id === id && r.status === 'pending');
  if (!r) return false;
  r.status = 'cancelled';
  _saveToDisk();
  return true;
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

function _loadFromDisk() {
  try {
    if (_dataFile && fs.existsSync(_dataFile)) {
      _reminders = JSON.parse(fs.readFileSync(_dataFile, 'utf-8'));
    }
  } catch (err) {
    console.warn('[ReminderService] Could not load reminders.json:', err.message);
    _reminders = [];
  }
}

function _saveToDisk() {
  try {
    if (_dataFile) {
      fs.writeFileSync(_dataFile, JSON.stringify(_reminders, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('[ReminderService] Could not save reminders.json:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

function _startPolling() {
  if (_timer) clearInterval(_timer);
  _timer = setInterval(_checkReminders, POLL_INTERVAL_MS);
  // Check shortly after startup in case reminders survived a restart
  setTimeout(_checkReminders, 3_000);
}

function _checkReminders() {
  const now = Date.now();
  const due = _reminders.filter((r) => r.status === 'pending' && r.fire_at <= now);
  for (const r of due) _fireReminder(r);
}

function _fireReminder(reminder) {
  try {
    // Mark fired before showing notification so a crash doesn't double-fire
    reminder.status   = 'fired';
    reminder.fired_at = Date.now();
    _saveToDisk();

    // Native OS notification
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      const n = new Notification({
        title: '⏰ OpenDesktop Reminder',
        body:  reminder.message,
        silent: false,
      });
      n.on('click', () => {
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.getAllWindows()[0];
        if (win) { win.show(); win.focus(); }
      });
      n.show();
    }

    // Emit to renderer so the chat can show a reminder card
    if (_emitFn) {
      _emitFn('reminder:fired', {
        id:      reminder.id,
        message: reminder.message,
        firedAt: reminder.fired_at,
      });
    }

    console.log(`[ReminderService] Fired: "${reminder.message}"`);
  } catch (err) {
    console.error('[ReminderService] Fire error:', err.message);
  }
}

module.exports = { init, addReminder, listReminders, cancelReminder, stop };
