# Database Tools Skill Guide

Last verified: 2026-04-06

## Overview

6 tools for connecting to and querying SQL databases directly from OpenDesktop.
Supports SQLite (via better-sqlite3), PostgreSQL (via pg), and MySQL (via mysql2).
Connection configurations are stored in `{userData}/db-connections.json`.
Passwords are stored securely in the KeyStore as `db_{connectionId}`.

---

## Setup

### SQLite (no extra dependencies)
SQLite is supported via better-sqlite3, which is bundled with OpenDesktop. No additional
setup is required -- just provide the path to the `.db` or `.sqlite` file.

### PostgreSQL
Requires the `pg` npm package. If not installed, the tool returns:
"pg package not installed. Run: npm install pg"

Install in the OpenDesktop project directory:
```
cd /path/to/OpenDesktop && npm install pg
```

### MySQL
Requires the `mysql2` npm package. If not installed, the tool returns:
"mysql2 package not installed. Run: npm install mysql2"

Install in the OpenDesktop project directory:
```
cd /path/to/OpenDesktop && npm install mysql2
```

---

## Tool Reference

| Tool | Permission | Required Params | Optional Params | Returns |
|------|-----------|----------------|-----------------|---------|
| `db_list_connections` | safe | -- | -- | Array of `{ id, name, type, host, database }` for all saved connections |
| `db_add_connection` | sensitive | `name`, `type`, `database` | `host`, `port`, `user`, `password`, `ssl`, `description` | `{ ok, id, name, type }` |
| `db_test_connection` | safe | `connectionId` | -- | `{ ok: true/false, message, error? }` |
| `db_schema` | safe | `connectionId` | -- | `{ connection, tables[] }` listing all tables and views |
| `db_describe` | safe | `connectionId`, `table` | -- | `{ connection, table, columns[] }` with column details |
| `db_query` | sensitive | `connectionId`, `query` | `maxRows` (default 100, max 1000) | `{ rows[], totalRows, rowsAffected?, fields? }` |

**Note**: `connectionId` accepts either the connection ID (e.g. `db_a1b2c3d4`) or the friendly name (e.g. `my-postgres`). Both are matched.

---

## Procedure: Add a New Database Connection

### SQLite
```
db_add_connection({
  name: "app-database",
  type: "sqlite",
  database: "/Users/alice/projects/myapp/data.db"
})
```
No host, port, user, or password needed. The `database` field is the absolute file path.

### PostgreSQL
```
db_add_connection({
  name: "prod-postgres",
  type: "postgres",
  host: "db.example.com",
  port: 5432,
  database: "myapp_production",
  user: "readonly_user",
  password: "s3cret",
  ssl: true
})
```
The password is stored in the KeyStore (not in the JSON config file). Default host is
`localhost`, default port is `5432`.

### MySQL
```
db_add_connection({
  name: "analytics-mysql",
  type: "mysql",
  host: "mysql.internal.example.com",
  port: 3306,
  database: "analytics",
  user: "analyst",
  password: "p@ssw0rd"
})
```
Default host is `localhost`, default port is `3306`.

After adding, always test the connection:
```
db_test_connection({ connectionId: "prod-postgres" })
```
Returns `{ ok: true, message: "Connected to postgres:myapp_production" }` on success.

---

## Procedure: Explore a Database Schema

### Step 1 -- List connections
```
db_list_connections({})
```
Returns all saved connections with their IDs, names, and types.

### Step 2 -- List all tables and views
```
db_schema({ connectionId: "prod-postgres" })
```
Returns differ by database type:
- **SQLite**: `{ name, type }` where type is "table" or "view" (from `sqlite_master`)
- **PostgreSQL**: `{ table_name, table_type }` from `information_schema.tables` (public schema only)
- **MySQL**: table names from `SHOW TABLES`

### Step 3 -- Describe a specific table
```
db_describe({ connectionId: "prod-postgres", table: "orders" })
```
Returns column-level metadata:
- **SQLite**: `{ cid, name, type, notnull, dflt_value, pk }` (from `PRAGMA table_info`)
- **PostgreSQL**: `{ column_name, data_type, is_nullable, column_default }` (from `information_schema.columns`)
- **MySQL**: `{ Field, Type, Null, Key, Default, Extra }` (from `DESCRIBE`)

### Step 4 -- Query the data
```
db_query({ connectionId: "prod-postgres", query: "SELECT * FROM orders LIMIT 10" })
```

---

## Procedure: Run Queries

### SELECT queries (read-only)
```
db_query({
  connectionId: "prod-postgres",
  query: "SELECT customer_id, SUM(amount) as total FROM orders GROUP BY customer_id ORDER BY total DESC",
  maxRows: 50
})
```
Returns `{ rows: [...], totalRows: N, fields: ["customer_id", "total"] }`.

For SQLite, the database is opened in **readonly mode** for SELECT queries automatically.

### INSERT / UPDATE / DELETE (mutations)
```
db_query({
  connectionId: "app-database",
  query: "INSERT INTO logs (message, created_at) VALUES ('Manual entry', datetime('now'))"
})
```
Returns `{ rows: [], rowsAffected: 1, lastInsertRowid: 42 }` (SQLite includes lastInsertRowid).

For PostgreSQL/MySQL, `rowsAffected` is populated from `result.rowCount` / `rows.affectedRows`.

**Important**: Mutation queries (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `REPLACE`) are detected by a regex pattern. For SQLite, mutations open the database in **read-write mode**.

### Aggregation example
```
db_query({
  connectionId: "analytics-mysql",
  query: "SELECT DATE(created_at) as day, COUNT(*) as signups FROM users WHERE created_at >= '2026-01-01' GROUP BY day ORDER BY day"
})
```

---

## Procedure: Full Database Exploration Workflow

This is the recommended sequence when the user says "look at my database" or
"tell me about the data":

1. **`db_list_connections`** -- find the right connection
2. **`db_test_connection`** -- verify it works
3. **`db_schema`** -- list all tables
4. **`db_describe`** on 3-5 key tables -- understand the structure
5. **`db_query`** with `SELECT COUNT(*) FROM table` on each table -- understand data volume
6. **`db_query`** with `SELECT * FROM table LIMIT 5` on key tables -- see sample data
7. Present findings: table count, row counts, key relationships, data types

---

## Safety: Read-Only vs Mutations

### Detection mechanism
The code uses a regex to detect DML (Data Manipulation Language) statements:
```
/^\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE)\s/i
```
This checks the **beginning** of the query string after trimming whitespace.

### SQLite behavior
- **SELECT queries**: Database opened with `{ readonly: true }` -- physically cannot modify data
- **DML queries**: Database opened in read-write mode

### PostgreSQL / MySQL behavior
- All queries go through the same connection
- The `db_query` tool has `permissionLevel: "sensitive"`, so the user must approve every call
- There is no built-in read-only enforcement for PG/MySQL beyond the permission prompt

### Recommendations for safety
- Use a **read-only database user** for PostgreSQL and MySQL connections when possible
- Avoid storing credentials for admin/root users
- Use `db_describe` and `db_schema` (both `safe` permission) to explore before running queries
- For production databases, prefer SELECT-only queries unless explicitly asked to mutate

---

## SQL Injection Prevention

### Identifier sanitization
The `db_describe` tool validates table names with:
```
/^[a-zA-Z_][a-zA-Z0-9_.\-]*$/
```
Only alphanumeric characters, underscores, dots, and hyphens are allowed. Any invalid
identifier is rejected with an error before the query executes.

### Query handling
The `db_query` tool passes the SQL string directly to the database driver. It does NOT
use parameterized queries -- the agent constructs the full SQL. This means:
- Never interpolate untrusted user input into query strings
- Use the agent's judgment to construct safe queries
- For PostgreSQL, prefer `$1` parameterized syntax when possible (not currently supported
  by the tool, but the driver handles it if manually constructed)

---

## Connection Storage

- **Config file**: `{userData}/db-connections.json` -- stores connection metadata (name, type,
  host, port, database, user, ssl, description). Does NOT store passwords.
- **KeyStore**: Passwords stored as `db_{connectionId}` -- uses the OS-level secure storage.
- **Fallback**: If the password is not in KeyStore, the code falls back to `conn.password`
  (which would only exist if manually edited into the JSON file).
- Connection IDs are auto-generated as `db_{uuid8chars}` (e.g. `db_a1b2c3d4`).

---

## Known Issues & Gotchas

- **PostgreSQL schema scope**: `db_schema` only queries the `public` schema. Tables in other
  schemas (e.g. `analytics.events`) will not appear. Use a raw query to list other schemas:
  `SELECT schema_name FROM information_schema.schemata`.
- **MySQL SHOW TABLES format**: The column name in the result varies by database name
  (e.g. `Tables_in_analytics`), which can make programmatic parsing inconsistent.
- **Connection timeout**: PostgreSQL has a 10-second connection timeout (`connectionTimeoutMillis: 10000`).
  MySQL has a 10-second connect timeout (`connectTimeout: 10000`). If the server is slow or
  behind a VPN, connections may fail.
- **maxRows cap**: The maximum is 1000 rows per query. For larger result sets, use `LIMIT`
  and `OFFSET` in the SQL query itself to paginate.
- **No connection pooling**: Each query opens a new connection and closes it after. This is
  fine for occasional queries but not for high-frequency use.
- **SQLite file path**: Must be an absolute path. Relative paths resolve from the Electron
  main process working directory, which is unpredictable.
- **SSL for PostgreSQL**: When `ssl: true`, the connection uses `{ rejectUnauthorized: false }`.
  This accepts self-signed certificates but does not verify the server certificate.
- **No stored procedures**: The tool executes raw SQL only. For PostgreSQL functions or MySQL
  stored procedures, call them via `SELECT my_function()` or `CALL my_procedure()`.
- **DML detection edge case**: The regex checks the start of the query. A query like
  `WITH cte AS (SELECT ...) INSERT INTO ...` starts with `WITH`, not `INSERT`, so it
  will be treated as a read query for SQLite (opened readonly) and will fail. Restructure
  such queries to start with the DML keyword.
