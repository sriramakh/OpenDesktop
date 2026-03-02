/**
 * DatabaseTools — SQL database access tools.
 *
 * Supports: SQLite (better-sqlite3), PostgreSQL (pg), MySQL (mysql2).
 * Connection configs in {OPENDESKTOP_DATA}/db-connections.json.
 * Passwords stored in KeyStore as "db_{id}".
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');

let Database;
try { Database = require('better-sqlite3'); } catch { Database = null; }

let pg;
try { pg = require('pg'); } catch { pg = null; }

let mysql2;
try { mysql2 = require('mysql2/promise'); } catch { mysql2 = null; }

const CONNECTIONS_FILE = () => {
  const base = process.env.OPENDESKTOP_DATA || path.join(os.homedir(), 'Library/Application Support/OpenDesktop');
  return path.join(base, 'db-connections.json');
};

let _keyStore = null;
function setKeyStore(ks) { _keyStore = ks; }

function loadConnections() {
  const file = CONNECTIONS_FILE();
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) || []; } catch { return []; }
}

function saveConnections(conns) {
  const file = CONNECTIONS_FILE();
  const dir  = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(conns, null, 2), 'utf-8');
}

function getPassword(id) {
  return _keyStore?.getKey ? _keyStore.getKey(`db_${id}`) : null;
}

const DML_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE)\s/i;
function isDML(q) { return DML_PATTERN.test(q.trim()); }

async function runSQLite(conn, query, maxRows) {
  if (!Database) throw new Error('better-sqlite3 not available');
  const db = new Database(conn.database, { readonly: !isDML(query) });
  try {
    if (isDML(query)) {
      const info = db.prepare(query).run();
      return { rows: [], rowsAffected: info.changes, lastInsertRowid: info.lastInsertRowid };
    }
    const rows = db.prepare(query).all();
    return { rows: rows.slice(0, maxRows), totalRows: rows.length };
  } finally { db.close(); }
}

async function runPostgres(conn, query, maxRows) {
  if (!pg) throw new Error('pg package not installed. Run: npm install pg');
  const password = getPassword(conn.id) || conn.password;
  const client   = new pg.Client({
    host: conn.host || 'localhost', port: conn.port || 5432,
    database: conn.database, user: conn.user, password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    const result = await client.query(query);
    return {
      rows: result.rows.slice(0, maxRows), totalRows: result.rowCount,
      rowsAffected: isDML(query) ? result.rowCount : undefined,
      fields: result.fields?.map((f) => f.name),
    };
  } finally { await client.end(); }
}

async function runMySQL(conn, query, maxRows) {
  if (!mysql2) throw new Error('mysql2 package not installed. Run: npm install mysql2');
  const password = getPassword(conn.id) || conn.password;
  const c = await mysql2.createConnection({
    host: conn.host || 'localhost', port: conn.port || 3306,
    database: conn.database, user: conn.user, password,
    connectTimeout: 10000,
  });
  try {
    const [rows, fields] = await c.execute(query);
    return {
      rows: Array.isArray(rows) ? rows.slice(0, maxRows) : [],
      totalRows: Array.isArray(rows) ? rows.length : undefined,
      rowsAffected: isDML(query) ? rows.affectedRows : undefined,
      fields: fields?.map((f) => f.name),
    };
  } finally { await c.end(); }
}

async function executeQuery(conn, query, maxRows = 100) {
  switch (conn.type) {
    case 'sqlite':   return runSQLite(conn, query, maxRows);
    case 'postgres': return runPostgres(conn, query, maxRows);
    case 'mysql':    return runMySQL(conn, query, maxRows);
    default:         throw new Error(`Unsupported database type: ${conn.type}`);
  }
}

async function getSchema(conn) {
  switch (conn.type) {
    case 'sqlite':   return (await executeQuery(conn, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name", 200)).rows;
    case 'postgres': return (await executeQuery(conn, "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name", 200)).rows;
    case 'mysql':    return (await executeQuery(conn, 'SHOW TABLES', 200)).rows;
    default:         throw new Error(`Schema not supported for: ${conn.type}`);
  }
}

// Validate identifier (table/column name) to prevent SQL injection.
// Only allows alphanumeric, underscores, dots, and hyphens.
function sanitizeIdentifier(name) {
  if (!name || typeof name !== 'string') throw new Error('Invalid identifier');
  if (!/^[a-zA-Z_][a-zA-Z0-9_.\\-]*$/.test(name)) {
    throw new Error(`Invalid identifier: "${name}". Only alphanumeric, underscore, dot, and hyphen are allowed.`);
  }
  return name;
}

async function describeTable(conn, tableName) {
  const safe = sanitizeIdentifier(tableName);
  switch (conn.type) {
    case 'sqlite':   return (await executeQuery(conn, `PRAGMA table_info("${safe}")`, 200)).rows;
    case 'postgres': return (await executeQuery(conn, `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='${safe}' ORDER BY ordinal_position`, 200)).rows;
    case 'mysql':    return (await executeQuery(conn, `DESCRIBE \`${safe}\``, 200)).rows;
    default:         throw new Error(`Describe not supported for: ${conn.type}`);
  }
}

const DATABASE_TOOLS = [
  {
    name: 'db_list_connections', description: 'List all configured database connections.',
    category: 'database', permissionLevel: 'safe', params: [],
    execute: async () => {
      const conns = loadConnections();
      return JSON.stringify(conns.map(({ id, name, type, host, database }) => ({ id, name, type, host, database })));
    },
  },
  {
    name: 'db_add_connection', description: 'Add a new database connection.',
    category: 'database', permissionLevel: 'sensitive', params: ['name', 'type', 'database'],
    execute: async ({ name, type, host, port, database, user, password, ssl, description }) => {
      if (!name || !type || !database) throw new Error('name, type, and database are required');
      const { v4: uuidv4 } = require('uuid');
      const id   = `db_${uuidv4().slice(0, 8)}`;
      const conn = { id, name, type: type.toLowerCase(), host, port, database, user, ssl: !!ssl, description: description || '' };
      const conns = loadConnections();
      conns.push(conn);
      saveConnections(conns);
      if (password && _keyStore?.setKey) await _keyStore.setKey(`db_${id}`, password);
      return JSON.stringify({ ok: true, id, name, type: conn.type });
    },
  },
  {
    name: 'db_test_connection', description: 'Test a database connection.',
    category: 'database', permissionLevel: 'safe', params: ['connectionId'],
    execute: async ({ connectionId }) => {
      const conn = loadConnections().find((c) => c.id === connectionId || c.name === connectionId);
      if (!conn) throw new Error(`Connection "${connectionId}" not found`);
      try {
        const result = await executeQuery(conn, 'SELECT 1 AS ok', 1);
        return JSON.stringify({ ok: true, message: `Connected to ${conn.type}:${conn.database}`, result: result.rows });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err.message });
      }
    },
  },
  {
    name: 'db_schema', description: 'List all tables/views in a database.',
    category: 'database', permissionLevel: 'safe', params: ['connectionId'],
    execute: async ({ connectionId }) => {
      const conn = loadConnections().find((c) => c.id === connectionId || c.name === connectionId);
      if (!conn) throw new Error(`Connection "${connectionId}" not found`);
      const tables = await getSchema(conn);
      return JSON.stringify({ connection: conn.name, tables });
    },
  },
  {
    name: 'db_describe', description: 'Describe the columns of a table.',
    category: 'database', permissionLevel: 'safe', params: ['connectionId', 'table'],
    execute: async ({ connectionId, table }) => {
      const conn = loadConnections().find((c) => c.id === connectionId || c.name === connectionId);
      if (!conn) throw new Error(`Connection "${connectionId}" not found`);
      const columns = await describeTable(conn, table);
      return JSON.stringify({ connection: conn.name, table, columns });
    },
  },
  {
    name: 'db_query', description: 'Execute a SQL query. Returns up to maxRows rows.',
    category: 'database', permissionLevel: 'sensitive', params: ['connectionId', 'query'],
    execute: async ({ connectionId, query, maxRows = 100 }) => {
      if (!connectionId || !query) throw new Error('connectionId and query are required');
      const conn = loadConnections().find((c) => c.id === connectionId || c.name === connectionId);
      if (!conn) throw new Error(`Connection "${connectionId}" not found`);
      const result = await executeQuery(conn, query, Math.min(maxRows, 1000));
      return JSON.stringify(result, null, 2);
    },
  },
];

module.exports = { DATABASE_TOOLS, setKeyStore };
