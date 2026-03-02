/**
 * APIServer — Express HTTP API server for external integrations.
 *
 * Provides a REST API allowing external tools to interact with the agent.
 * Protected by an API key in X-API-Key header.
 */

const express = require('express');

class APIServer {
  constructor() {
    this._app          = null;
    this._server       = null;
    this._agentCore    = null;
    this._toolRegistry = null;
    this._memory       = null;
    this._apiKey       = null;
    this._port         = 57000;
    this._running      = false;
  }

  async start(agentCore, toolRegistry, memory, port = 57000, apiKey = null) {
    if (this._running) return { ok: true, port: this._port, message: 'Already running' };

    this._agentCore    = agentCore;
    this._toolRegistry = toolRegistry;
    this._memory       = memory;
    this._port         = port;
    this._apiKey       = apiKey;

    this._app = express();
    this._app.use(express.json({ limit: '10mb' }));

    // CORS for local tools
    this._app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Auth middleware
    this._app.use((req, res, next) => {
      if (req.path === '/v1/health') return next();
      if (this._apiKey) {
        const provided = req.headers['x-api-key'];
        if (provided !== this._apiKey) {
          return res.status(401).json({ error: 'Invalid or missing X-API-Key header' });
        }
      }
      next();
    });

    this._registerRoutes();

    return new Promise((resolve, reject) => {
      this._server = this._app.listen(this._port, '127.0.0.1', (err) => {
        if (err) { this._running = false; return reject(err); }
        this._running = true;
        console.log(`[APIServer] Listening on http://127.0.0.1:${this._port}`);
        resolve({ ok: true, port: this._port });
      });
      this._server.on('error', (err) => { this._running = false; reject(err); });
    });
  }

  async stop() {
    if (!this._running || !this._server) return { ok: true };
    return new Promise((resolve) => {
      this._server.close(() => {
        this._running = false;
        this._server  = null;
        console.log('[APIServer] Stopped');
        resolve({ ok: true });
      });
    });
  }

  isRunning() { return this._running; }
  getPort()   { return this._port;    }

  _registerRoutes() {
    this._app.get('/v1/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
    });

    this._app.get('/v1/tools', (req, res) => {
      try {
        const tools = this._toolRegistry.listTools();
        res.json({ tools, count: tools.length });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    this._app.post('/v1/agent/run', async (req, res) => {
      const { message, persona, attachments } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });
      try {
        const result = await this._agentCore.handleUserMessage(
          message, persona || 'auto', attachments || []
        );
        res.json(result);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    this._app.post('/v1/agent/cancel', (req, res) => {
      try { this._agentCore.cancel(); res.json({ ok: true }); }
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    this._app.get('/v1/memory/search', async (req, res) => {
      const { query, limit = 10 } = req.query;
      if (!query) return res.status(400).json({ error: 'query parameter required' });
      try {
        const results = this._memory.search(query, Number(limit));
        res.json({ results, count: results.length });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    this._app.get('/v1/usage/summary', async (req, res) => {
      try {
        const days    = Number(req.query.days) || 30;
        const summary = this._memory.getUsageSummary ? await this._memory.getUsageSummary(days) : {};
        res.json(summary);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    this._app.get('/v1/audit/log', async (req, res) => {
      try {
        const { limit = 50, offset = 0, taskId, toolName } = req.query;
        const entries = this._memory.getAuditLog
          ? this._memory.getAuditLog({ limit: Number(limit), offset: Number(offset), taskId, toolName })
          : [];
        res.json({ entries, count: entries.length });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  }
}

const apiServer = new APIServer();
module.exports = apiServer;
