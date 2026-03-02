/**
 * MemorySystem — Persistent, searchable agent memory.
 *
 * Storage: better-sqlite3 (already a dependency) with WAL mode.
 * Falls back to JSON file if SQLite fails (e.g., native module not built).
 *
 * Tables:
 *   sessions     — conversation sessions (id, title, created_at, updated_at)
 *   long_term    — persistent task records and summaries
 *   long_term_fts — FTS5 virtual table for full-text search on long_term
 *
 * In-memory:
 *   shortTerm[]  — rolling window of the current session's messages
 */

const path = require('path');
const fs   = require('fs');

// Try to load better-sqlite3; fall back gracefully if native module not built
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
  console.warn('[Memory] better-sqlite3 not available, using JSON fallback:', e.message);
}

class MemorySystem {
  constructor(userDataPath) {
    this.userDataPath  = userDataPath;
    this.dbPath        = path.join(userDataPath, 'memory.db');
    this.jsonFallback  = path.join(userDataPath, 'memory.json');
    this.db            = null;
    this.useSQLite     = !!Database;

    this.shortTerm     = [];
    this.longTerm      = [];   // used in JSON fallback
    this.maxShortTerm  = 100;
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  async initialize() {
    if (this.useSQLite) {
      try {
        await this._initSQLite();
        return;
      } catch (err) {
        console.error('[Memory] SQLite init failed, falling back to JSON:', err.message);
        this.useSQLite = false;
      }
    }
    this._initJSON();
  }

  async _initSQLite() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        title       TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS long_term (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        query       TEXT,
        summary     TEXT,
        persona     TEXT,
        status      TEXT,
        turns       INTEGER,
        session_id  TEXT,
        timestamp   INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS long_term_fts
        USING fts5(id UNINDEXED, query, summary, content='long_term', content_rowid='rowid');

      CREATE TRIGGER IF NOT EXISTS lt_ai AFTER INSERT ON long_term BEGIN
        INSERT INTO long_term_fts(rowid, id, query, summary)
          VALUES (new.rowid, new.id, new.query, new.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS lt_ad AFTER DELETE ON long_term BEGIN
        INSERT INTO long_term_fts(long_term_fts, rowid, id, query, summary)
          VALUES ('delete', old.rowid, old.id, old.query, old.summary);
      END;

      CREATE TABLE IF NOT EXISTS task_state (
        id              TEXT PRIMARY KEY,
        session_id      TEXT NOT NULL,
        query           TEXT,
        goal            TEXT,
        plan            TEXT,
        completed_steps TEXT,
        files_modified  TEXT,
        tool_outputs_summary TEXT,
        decisions       TEXT,
        status          TEXT DEFAULT 'running',
        turns           INTEGER,
        created_at      INTEGER NOT NULL,
        completed_at    INTEGER
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id         TEXT PRIMARY KEY,
        message    TEXT NOT NULL,
        fire_at    INTEGER NOT NULL,
        status     TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        fired_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_fire_at ON reminders(fire_at, status);

      -- Audit log (Feature 1)
      CREATE TABLE IF NOT EXISTS audit_log (
        id              TEXT PRIMARY KEY,
        task_id         TEXT,
        session_id      TEXT,
        tool_name       TEXT NOT NULL,
        tool_input      TEXT,
        output_preview  TEXT,
        success         INTEGER NOT NULL,
        error           TEXT,
        permission_level TEXT,
        duration_ms     INTEGER,
        timestamp       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts   ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_log(task_id);

      -- Token/cost usage log (Feature 11)
      CREATE TABLE IF NOT EXISTS usage_log (
        id                  TEXT PRIMARY KEY,
        task_id             TEXT,
        session_id          TEXT,
        provider            TEXT NOT NULL,
        model               TEXT NOT NULL,
        input_tokens        INTEGER,
        output_tokens       INTEGER,
        estimated_cost_usd  REAL,
        turn                INTEGER,
        timestamp           INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(timestamp);
    `);

    // Migrate old JSON data if it exists and DB is fresh
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM long_term').get().n;
    if (count === 0 && fs.existsSync(this.jsonFallback)) {
      this._migrateFromJSON();
    }

    console.log('[Memory] SQLite initialized');
  }

  _migrateFromJSON() {
    try {
      const raw  = fs.readFileSync(this.jsonFallback, 'utf-8');
      const data = JSON.parse(raw);
      const entries = data.longTerm || [];

      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO long_term (id, type, query, summary, persona, status, turns, session_id, timestamp)
        VALUES (@id, @type, @query, @summary, @persona, @status, @turns, @session_id, @timestamp)
      `);

      const tx = this.db.transaction((rows) => {
        for (const r of rows) insert.run({
          id:         r.id || `lt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type:       r.type || 'task',
          query:      r.query || null,
          summary:    r.summary || null,
          persona:    r.persona || null,
          status:     r.status || null,
          turns:      r.turns || null,
          session_id: r.sessionId || null,
          timestamp:  r.timestamp || Date.now(),
        });
      });

      tx(entries);
      console.log(`[Memory] Migrated ${entries.length} records from JSON`);
    } catch (err) {
      console.warn('[Memory] Migration from JSON failed:', err.message);
    }
  }

  _initJSON() {
    try {
      if (fs.existsSync(this.jsonFallback)) {
        const raw  = fs.readFileSync(this.jsonFallback, 'utf-8');
        const data = JSON.parse(raw);
        this.longTerm = data.longTerm || [];
      }
    } catch (err) {
      console.error('[Memory] JSON load failed:', err.message);
      this.longTerm = [];
    }
  }

  // ---------------------------------------------------------------------------
  // Short-term (session) memory
  // ---------------------------------------------------------------------------

  addToShortTerm(entry) {
    this.shortTerm.push({
      ...entry,
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    if (this.shortTerm.length > this.maxShortTerm) {
      // Evict oldest entries — they're in the session messages array anyway
      this.shortTerm = this.shortTerm.slice(-this.maxShortTerm);
    }
  }

  getShortTermContext() {
    return [...this.shortTerm];
  }

  // ---------------------------------------------------------------------------
  // Long-term (persistent) memory
  // ---------------------------------------------------------------------------

  async addToLongTerm(entry) {
    const id = `lt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = { ...entry, id };

    if (this.useSQLite && this.db) {
      this.db.prepare(`
        INSERT OR REPLACE INTO long_term (id, type, query, summary, persona, status, turns, session_id, timestamp)
        VALUES (@id, @type, @query, @summary, @persona, @status, @turns, @session_id, @timestamp)
      `).run({
        id,
        type:       record.type       || 'task',
        query:      record.query      || null,
        summary:    record.summary    || null,
        persona:    record.persona    || null,
        status:     record.status     || null,
        turns:      record.turns      || null,
        session_id: record.sessionId  || null,
        timestamp:  record.timestamp  || Date.now(),
      });
    } else {
      this.longTerm.push(record);
      this._persistJSON();
    }
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Full-text search using FTS5 (SQLite) or keyword overlap (JSON fallback).
   * @param {string} query
   * @param {number} limit
   * @returns {Array}
   */
  search(query, limit = 5) {
    if (!query) return [];

    if (this.useSQLite && this.db) {
      try {
        // Escape special FTS5 characters
        const safeTerm = query.replace(/["*^()]/g, ' ').trim();
        if (!safeTerm) return [];

        const rows = this.db.prepare(`
          SELECT l.*
          FROM long_term l
          JOIN long_term_fts f ON l.id = f.id
          WHERE long_term_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(safeTerm, limit);

        return rows;
      } catch (err) {
        // FTS query error — fall back to recency
        return this._getRecentSQL(limit);
      }
    }

    // JSON fallback: keyword overlap scoring
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    return this.longTerm
      .map((e) => {
        const text = JSON.stringify(e).toLowerCase();
        const score = tokens.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
        return { e, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.e);
  }

  _getRecentSQL(limit) {
    return this.db
      .prepare(`SELECT * FROM long_term ORDER BY timestamp DESC LIMIT ?`)
      .all(limit);
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  getRecentHistory(limit = 20) {
    if (this.useSQLite && this.db) {
      return this.db
        .prepare(`SELECT * FROM long_term WHERE type = 'task' ORDER BY timestamp DESC LIMIT ?`)
        .all(limit);
    }
    return this.longTerm
      .filter((e) => e.type === 'task')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Task state persistence
  // ---------------------------------------------------------------------------

  async saveTaskState(state) {
    if (!this.useSQLite || !this.db) return;
    const id = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO task_state
          (id, session_id, query, goal, plan, completed_steps, files_modified,
           tool_outputs_summary, decisions, status, turns, created_at, completed_at)
        VALUES
          (@id, @session_id, @query, @goal, @plan, @completed_steps, @files_modified,
           @tool_outputs_summary, @decisions, @status, @turns, @created_at, @completed_at)
      `).run({
        id,
        session_id:           state.sessionId || null,
        query:                state.query || null,
        goal:                 state.goal || null,
        plan:                 state.plan ? JSON.stringify(state.plan) : null,
        completed_steps:      state.completedSteps ? JSON.stringify(state.completedSteps) : null,
        files_modified:       state.filesModified ? JSON.stringify(state.filesModified) : null,
        tool_outputs_summary: state.toolOutputsSummary ? JSON.stringify(state.toolOutputsSummary) : null,
        decisions:            state.decisions ? JSON.stringify(state.decisions) : null,
        status:               state.status || 'completed',
        turns:                state.turns || null,
        created_at:           state.createdAt || Date.now(),
        completed_at:         state.completedAt || Date.now(),
      });
    } catch (err) {
      console.warn('[Memory] saveTaskState failed:', err.message);
    }
  }

  getTaskStateBySession(sessionId) {
    if (!this.useSQLite || !this.db) return [];
    return this.db
      .prepare('SELECT * FROM task_state WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId);
  }

  getRecentTaskStates(limit = 10) {
    if (!this.useSQLite || !this.db) return [];
    return this.db
      .prepare('SELECT * FROM task_state ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  }

  // ---------------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------------

  addReminder({ id, message, fireAt }) {
    if (!this.useSQLite || !this.db) throw new Error('SQLite not available');
    this.db
      .prepare('INSERT INTO reminders (id, message, fire_at, status, created_at) VALUES (?, ?, ?, \'pending\', ?)')
      .run(id, message, fireAt, Date.now());
    return id;
  }

  getPendingReminders() {
    if (!this.useSQLite || !this.db) return [];
    return this.db
      .prepare('SELECT * FROM reminders WHERE status = \'pending\' AND fire_at <= ?')
      .all(Date.now());
  }

  listReminders(status = 'pending') {
    if (!this.useSQLite || !this.db) return [];
    if (status === 'all') {
      return this.db
        .prepare('SELECT * FROM reminders ORDER BY fire_at DESC LIMIT 50')
        .all();
    }
    return this.db
      .prepare('SELECT * FROM reminders WHERE status = ? ORDER BY fire_at ASC')
      .all(status);
  }

  markReminderFired(id) {
    if (!this.useSQLite || !this.db) return;
    this.db
      .prepare('UPDATE reminders SET status = \'fired\', fired_at = ? WHERE id = ?')
      .run(Date.now(), id);
  }

  cancelReminder(id) {
    if (!this.useSQLite || !this.db) return false;
    const result = this.db
      .prepare('UPDATE reminders SET status = \'cancelled\' WHERE id = ? AND status = \'pending\'')
      .run(id);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Audit Log (Feature 1)
  // ---------------------------------------------------------------------------

  logToolCall({ taskId, sessionId, toolName, toolInput, outputPreview, success, error, permissionLevel, durationMs }) {
    if (!this.useSQLite || !this.db) return;
    try {
      const id = `al_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.db.prepare(`
        INSERT INTO audit_log (id, task_id, session_id, tool_name, tool_input, output_preview, success, error, permission_level, duration_ms, timestamp)
        VALUES (@id, @task_id, @session_id, @tool_name, @tool_input, @output_preview, @success, @error, @permission_level, @duration_ms, @timestamp)
      `).run({
        id,
        task_id:          taskId || null,
        session_id:       sessionId || null,
        tool_name:        toolName,
        tool_input:       toolInput ? JSON.stringify(toolInput).slice(0, 2000) : null,
        output_preview:   outputPreview ? String(outputPreview).slice(0, 500) : null,
        success:          success ? 1 : 0,
        error:            error || null,
        permission_level: permissionLevel || null,
        duration_ms:      durationMs || null,
        timestamp:        Date.now(),
      });
    } catch (err) {
      // Non-critical — don't let audit failures break tool execution
      console.warn('[Memory] logToolCall failed:', err.message);
    }
  }

  getAuditLog({ limit = 50, offset = 0, taskId, toolName, startTime, endTime } = {}) {
    if (!this.useSQLite || !this.db) return [];
    try {
      let sql = 'SELECT * FROM audit_log WHERE 1=1';
      const params = [];
      if (taskId)    { sql += ' AND task_id = ?';      params.push(taskId); }
      if (toolName)  { sql += ' AND tool_name = ?';    params.push(toolName); }
      if (startTime) { sql += ' AND timestamp >= ?';   params.push(startTime); }
      if (endTime)   { sql += ' AND timestamp <= ?';   params.push(endTime); }
      sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      return this.db.prepare(sql).all(...params);
    } catch (err) {
      console.warn('[Memory] getAuditLog failed:', err.message);
      return [];
    }
  }

  exportAuditLog({ taskId, startTime, endTime } = {}) {
    const rows = this.getAuditLog({ limit: 10000, offset: 0, taskId, startTime, endTime });
    const header = ['id', 'timestamp', 'task_id', 'tool_name', 'success', 'duration_ms', 'error', 'output_preview'].join(',');
    const csvRows = rows.map((r) => [
      r.id, r.timestamp, r.task_id || '', r.tool_name, r.success, r.duration_ms || '',
      `"${(r.error || '').replace(/"/g, '""')}"`,
      `"${(r.output_preview || '').replace(/"/g, '""')}"`,
    ].join(','));
    return [header, ...csvRows].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Usage / Cost Log (Feature 11)
  // ---------------------------------------------------------------------------

  logUsage({ taskId, sessionId, provider, model, inputTokens, outputTokens, estimatedCostUsd, turn }) {
    if (!this.useSQLite || !this.db) return;
    try {
      const id = `ul_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.db.prepare(`
        INSERT INTO usage_log (id, task_id, session_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, turn, timestamp)
        VALUES (@id, @task_id, @session_id, @provider, @model, @input_tokens, @output_tokens, @estimated_cost_usd, @turn, @timestamp)
      `).run({
        id,
        task_id:            taskId || null,
        session_id:         sessionId || null,
        provider,
        model,
        input_tokens:       inputTokens || 0,
        output_tokens:      outputTokens || 0,
        estimated_cost_usd: estimatedCostUsd || 0,
        turn:               turn || null,
        timestamp:          Date.now(),
      });
    } catch (err) {
      console.warn('[Memory] logUsage failed:', err.message);
    }
  }

  getUsageSummary(days = 30) {
    if (!this.useSQLite || !this.db) return {};
    try {
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const totals = this.db.prepare(`
        SELECT
          SUM(input_tokens)  AS total_input_tokens,
          SUM(output_tokens) AS total_output_tokens,
          SUM(estimated_cost_usd) AS total_cost_usd,
          COUNT(*) AS total_calls
        FROM usage_log WHERE timestamp >= ?
      `).get(since);

      const byProvider = this.db.prepare(`
        SELECT provider, model,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(estimated_cost_usd) AS cost_usd,
          COUNT(*) AS calls
        FROM usage_log WHERE timestamp >= ?
        GROUP BY provider, model
        ORDER BY cost_usd DESC
      `).all(since);

      const recent = this.db.prepare(`
        SELECT * FROM usage_log WHERE timestamp >= ?
        ORDER BY timestamp DESC LIMIT 20
      `).all(since);

      return { days, totals, byProvider, recent };
    } catch (err) {
      console.warn('[Memory] getUsageSummary failed:', err.message);
      return {};
    }
  }

  // ---------------------------------------------------------------------------
  // JSON fallback persistence
  // ---------------------------------------------------------------------------

  _persistJSON() {
    try {
      const dir = path.dirname(this.jsonFallback);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.jsonFallback,
        JSON.stringify({ longTerm: this.longTerm }, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('[Memory] JSON persist failed:', err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  close() {
    if (this.useSQLite && this.db) {
      try { this.db.close(); } catch { /* ignore */ }
    } else {
      this._persistJSON();
    }
  }
}

module.exports = { MemorySystem };
