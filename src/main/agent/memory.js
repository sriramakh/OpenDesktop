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
