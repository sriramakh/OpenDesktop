/**
 * MCPManager — Manages connections to MCP (Model Context Protocol) servers.
 *
 * Supports:
 *  - stdio transport  (local process, e.g. "npx @modelcontextprotocol/server-filesystem /path")
 *  - SSE transport    (HTTP endpoint, e.g. "http://localhost:3001/sse")
 *
 * Server configs are persisted to mcp-servers.json in the Electron userData dir so they
 * survive app restarts. On startup, initialize() reconnects all saved servers.
 */

const fs   = require('fs');
const path = require('path');

const { Client }             = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { SSEClientTransport }   = require('@modelcontextprotocol/sdk/client/sse.js');

class MCPManager {
  constructor(userDataPath) {
    this._configPath  = path.join(userDataPath, 'mcp-servers.json');
    // Map of serverId → { config, client, tools, status, error }
    this._connections = new Map();
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  _loadConfigs() {
    try {
      if (fs.existsSync(this._configPath)) {
        return JSON.parse(fs.readFileSync(this._configPath, 'utf-8'));
      }
    } catch (e) {
      console.error('[MCP] Failed to load configs:', e.message);
    }
    return [];
  }

  _saveConfigs() {
    const configs = Array.from(this._connections.values()).map((s) => s.config);
    try {
      fs.writeFileSync(this._configPath, JSON.stringify(configs, null, 2));
    } catch (e) {
      console.error('[MCP] Failed to save configs:', e.message);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /** Reconnect all saved servers. Called once at app startup. */
  async initialize() {
    const configs = this._loadConfigs();
    for (const config of configs) {
      try {
        await this._connect(config);
        console.log(`[MCP] Connected: ${config.name}`);
      } catch (err) {
        console.error(`[MCP] Failed to connect to ${config.name}: ${err.message}`);
        this._connections.set(config.id, {
          config,
          client: null,
          tools:  [],
          status: 'error',
          error:  err.message,
        });
      }
    }
  }

  /** Add a new MCP server, connect it, and persist the config. */
  async addServer(config) {
    if (!config.id) {
      config.id = `mcp_${Date.now()}`;
    }
    config._nameSlug = _slugify(config.name);

    await this._connect(config);
    this._saveConfigs();

    const conn = this._connections.get(config.id);
    return {
      id:        config.id,
      name:      config.name,
      status:    conn.status,
      toolCount: conn.tools.length,
      tools:     conn.tools.map((t) => t.name),
    };
  }

  /** Disconnect and remove a server. */
  async removeServer(serverId) {
    const conn = this._connections.get(serverId);
    if (!conn) throw new Error(`MCP server '${serverId}' not found`);

    try { if (conn.client) await conn.client.close(); } catch (_) {}
    this._connections.delete(serverId);
    this._saveConfigs();
    return { ok: true };
  }

  /** Retry connecting a server that's in an error state. */
  async reconnectServer(serverId) {
    const conn = this._connections.get(serverId);
    if (!conn) throw new Error(`MCP server '${serverId}' not found`);

    try { if (conn.client) await conn.client.close(); } catch (_) {}
    this._connections.delete(serverId);

    await this._connect(conn.config);
    this._saveConfigs();

    const updated = this._connections.get(serverId);
    return {
      id:        serverId,
      name:      conn.config.name,
      status:    updated.status,
      toolCount: updated.tools.length,
    };
  }

  // ── Internal connection ───────────────────────────────────────────────────────

  async _connect(config) {
    let transport;

    if (config.transport === 'stdio') {
      transport = new StdioClientTransport({
        command: config.command,
        args:    config.args || [],
        env:     { ...process.env, ...(config.env || {}) },
      });
    } else if (config.transport === 'sse') {
      transport = new SSEClientTransport(new URL(config.url));
    } else {
      throw new Error(`Unknown MCP transport type: '${config.transport}'`);
    }

    const client = new Client(
      { name: 'opendesktop', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);

    const listResult = await client.listTools();
    const tools = listResult.tools || [];

    this._connections.set(config.id, {
      config,
      client,
      tools,
      status: 'connected',
      error:  null,
    });
  }

  // ── Tool execution ────────────────────────────────────────────────────────────

  async callTool(serverId, toolName, args) {
    const conn = this._connections.get(serverId);
    if (!conn || !conn.client) {
      throw new Error(`MCP server '${serverId}' is not connected`);
    }

    const result = await conn.client.callTool({ name: toolName, arguments: args });

    // MCP result format: { content: [{ type, text }], isError }
    const content = result.content || [];
    if (content.length === 0) return '(no output)';

    return content
      .map((c) => {
        if (c.type === 'text')  return c.text;
        if (c.type === 'image') return `[Image: ${c.mimeType}]`;
        return JSON.stringify(c);
      })
      .join('\n');
  }

  // ── Status queries ────────────────────────────────────────────────────────────

  listServers() {
    return Array.from(this._connections.values()).map((conn) => ({
      id:        conn.config.id,
      name:      conn.config.name,
      transport: conn.config.transport,
      command:   conn.config.command || null,
      url:       conn.config.url     || null,
      status:    conn.status,
      error:     conn.error  || null,
      toolCount: conn.tools.length,
      tools:     conn.tools.map((t) => ({ name: t.name, description: t.description })),
    }));
  }

  /**
   * Returns ToolRegistry-compatible tool objects for all connected MCP tools.
   * Each tool's name is prefixed with `mcp_{serverSlug}_` to avoid collisions.
   * A `_schema` property carries the JSON Schema for provider-specific formatting.
   */
  getRegistryTools() {
    const registryTools = [];

    for (const conn of this._connections.values()) {
      if (conn.status !== 'connected') continue;

      const slug = conn.config._nameSlug || _slugify(conn.config.name);

      for (const mcpTool of conn.tools) {
        const registryName = `mcp_${slug}_${mcpTool.name}`;
        const inputSchema  = mcpTool.inputSchema || { type: 'object', properties: {} };

        // Capture for closure
        const serverId = conn.config.id;
        const toolName = mcpTool.name;

        registryTools.push({
          name:           registryName,
          category:       'mcp',
          description:    `[MCP:${conn.config.name}] ${mcpTool.description || mcpTool.name}`,
          permissionLevel:'sensitive',
          params:         Object.keys(inputSchema.properties || {}),
          // Inline schema for the registry's provider-format methods
          _schema: {
            description: `[MCP:${conn.config.name}] ${mcpTool.description || mcpTool.name}`,
            properties:  inputSchema.properties || {},
            required:    inputSchema.required   || [],
          },
          execute: async (params) => {
            return this.callTool(serverId, toolName, params);
          },
        });
      }
    }

    return registryTools;
  }

  async close() {
    for (const conn of this._connections.values()) {
      try { if (conn.client) await conn.client.close(); } catch (_) {}
    }
    this._connections.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _slugify(name) {
  return (name || 'server')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

module.exports = { MCPManager };
