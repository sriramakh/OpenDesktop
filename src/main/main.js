// Load .env from project root in development only
try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch (_) {}

const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const { AgentCore }        = require('./agent/core');
const { ToolRegistry }     = require('./agent/tools/registry');
const { MemorySystem }     = require('./agent/memory');
const { PermissionManager } = require('./agent/permissions');
const { ContextAwareness } = require('./agent/context');
const { KeyStore }         = require('./agent/keystore');
const { MCPManager }       = require('./agent/mcp/manager');
const { AgentSpawner }     = require('./agent/spawner');
const { getModelCatalog, listOllamaModels, callWithTools, getCurrentProvider } = require('./agent/llm');
const piiDetector     = require('./agent/pii-detector');
const policyEngine    = require('./agent/policy-engine');
const schedulerService = require('./scheduler-service');
const workflowService  = require('./workflow-service');
const workService      = require('./work-service');
const apiServer        = require('./api-server');
const google          = require('./connectors/google');
const reminderService = require('./reminder-service');

// Tool wiring (for keyStore injection at startup)
const { setKeyStore: setGitHubKeyStore }       = require('./agent/tools/github-tools');
const { setKeyStore: setProductivityKeyStore } = require('./agent/tools/productivity-tools');
const { setKeyStore: setMessagingKeyStore }    = require('./agent/tools/messaging-tools');
const { setKeyStore: setDatabaseKeyStore }     = require('./agent/tools/database-tools');
const { setKeyStore: setConnectorSDKKeyStore } = require('./agent/connector-sdk');
const { setWorkflowService, setAgentCore: setWorkflowAgentCore } = require('./agent/tools/workflow-tools');
const { setSchedulerService }                  = require('./agent/tools/scheduler-tools');

let mainWindow   = null;
let agentCore    = null;
let mcpManager   = null;
let toolRegistry = null;
let spawner      = null;

// Module-level emit helper — available to both initializeAgent() and setupIPC()
function emitFn(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

const isDev = !app.isPackaged;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width:  Math.min(1400, width),
    height: Math.min(900, height),
    minWidth:  800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

async function initializeAgent() {
  const userDataPath = app.getPath('userData');
  const memory       = new MemorySystem(userDataPath);
  const permissions  = new PermissionManager();
  const context      = new ContextAwareness();
  toolRegistry       = new ToolRegistry(permissions);
  const keyStore     = new KeyStore(userDataPath);
  mcpManager         = new MCPManager(userDataPath);

  // Set OPENDESKTOP_DATA env var so database-tools.js can find db-connections.json
  process.env.OPENDESKTOP_DATA = userDataPath;

  // Initialize policy engine
  policyEngine.init(userDataPath);

  agentCore = new AgentCore({
    memory,
    permissions,
    context,
    toolRegistry,
    keyStore,
    piiDetector,
    policyEngine,
    emit: emitFn,
  });

  await memory.initialize();
  await keyStore.initialize();

  // Inject keyStore into integration tools
  setGitHubKeyStore(keyStore);
  setProductivityKeyStore(keyStore);
  setMessagingKeyStore(keyStore);
  setDatabaseKeyStore(keyStore);
  setConnectorSDKKeyStore(keyStore);

  // Init reminder service before registering tools
  reminderService.init(userDataPath, emitFn);

  // Create spawner for multi-agent orchestration
  spawner = new AgentSpawner({
    toolRegistry,
    llm: { callWithTools, getCurrentProvider },
    permissions,
    emit: emitFn,
  });

  // Wire spawner into AgentCore for automatic parallel execution
  agentCore.setSpawner(spawner);

  await toolRegistry.registerBuiltinTools({ spawner });

  // Wire workflow service into workflow tools
  workflowService.init(userDataPath);
  workService.init(userDataPath);
  setWorkflowService(workflowService);
  setWorkflowAgentCore(agentCore);

  // Wire scheduler service into scheduler tools
  schedulerService.init(userDataPath, agentCore, emitFn);
  setSchedulerService(schedulerService);

  // Load custom connectors from {userData}/connectors/
  toolRegistry.loadCustomConnectors(userDataPath);

  // Connect saved MCP servers and register their tools
  await mcpManager.initialize();
  toolRegistry.registerMCPTools(mcpManager);

  console.log('[OpenDesktop] Agent initialized');
}

function setupIPC() {
  // ── Agent ──────────────────────────────────────────────────────────────────

  ipcMain.handle('agent:send-message', async (_event, { message, persona, attachments }) => {
    try {
      return await agentCore.handleUserMessage(message, persona, attachments);
    } catch (err) {
      console.error('[IPC] agent:send-message error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('agent:cancel', async () => {
    agentCore.cancel();
    return { ok: true };
  });

  ipcMain.handle('agent:approval-response', async (_event, { requestId, approved, note }) => {
    agentCore.resolveApproval(requestId, approved, note);
    return { ok: true };
  });

  // New session (clear conversation history)
  ipcMain.handle('agent:new-session', async () => {
    return agentCore.newSession();
  });

  // ── Memory ─────────────────────────────────────────────────────────────────

  ipcMain.handle('memory:search', async (_event, { query, limit }) => {
    return agentCore.memory.search(query, limit);
  });

  ipcMain.handle('memory:get-history', async (_event, { limit }) => {
    return agentCore.memory.getRecentHistory(limit);
  });

  // ── Context ────────────────────────────────────────────────────────────────

  ipcMain.handle('context:get-active', async () => {
    return agentCore.context.getActiveContext();
  });

  // ── Settings ───────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => {
    return agentCore.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, settings) => {
    return agentCore.updateSettings(settings);
  });

  // ── Tools ──────────────────────────────────────────────────────────────────

  ipcMain.handle('tools:list', async () => {
    return agentCore.toolRegistry.listTools();
  });

  // ── Models ─────────────────────────────────────────────────────────────────

  ipcMain.handle('models:catalog', async () => {
    return getModelCatalog();
  });

  ipcMain.handle('models:ollama-list', async (_event, { endpoint } = {}) => {
    return listOllamaModels(endpoint);
  });

  // ── API Keys (encrypted) ───────────────────────────────────────────────────

  ipcMain.handle('keys:set', async (_event, { provider, apiKey }) => {
    await agentCore.keyStore.setKey(provider, apiKey);
    return { ok: true };
  });

  ipcMain.handle('keys:remove', async (_event, { provider }) => {
    await agentCore.keyStore.removeKey(provider);
    return { ok: true };
  });

  ipcMain.handle('keys:list', async () => {
    return agentCore.keyStore.listKeys();
  });

  ipcMain.handle('keys:has', async (_event, { provider }) => {
    return agentCore.keyStore.hasKey(provider);
  });

  // ── MCP Servers ────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:list-servers', async () => {
    return mcpManager.listServers();
  });

  ipcMain.handle('mcp:add-server', async (_event, config) => {
    try {
      const result = await mcpManager.addServer(config);
      toolRegistry.registerMCPTools(mcpManager);
      return result;
    } catch (err) {
      console.error('[IPC] mcp:add-server error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('mcp:remove-server', async (_event, { id }) => {
    try {
      const result = await mcpManager.removeServer(id);
      toolRegistry.registerMCPTools(mcpManager);
      return result;
    } catch (err) {
      console.error('[IPC] mcp:remove-server error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('mcp:reconnect-server', async (_event, { id }) => {
    try {
      const result = await mcpManager.reconnectServer(id);
      toolRegistry.registerMCPTools(mcpManager);
      return result;
    } catch (err) {
      console.error('[IPC] mcp:reconnect-server error:', err);
      return { error: err.message };
    }
  });

  // ── Dialog ─────────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Attach Files',
    });
    return result.canceled ? [] : result.filePaths;
  });

  // ── Google Connectors ──────────────────────────────────────────────────────

  ipcMain.handle('connector:connect', async (_event, { service }) => {
    try {
      return await google.connect(service);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('connector:disconnect', async (_event, { service }) => {
    try {
      return await google.disconnect(service);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('connector:status', async (_event, { service }) => {
    return google.isConnected(service);
  });

  // ── Audit Log ─────────────────────────────────────────────────────────────

  ipcMain.handle('audit:get-log', async (_event, { limit, offset, taskId, toolName, startTime, endTime } = {}) => {
    return agentCore.memory.getAuditLog({ limit, offset, taskId, toolName, startTime, endTime });
  });

  ipcMain.handle('audit:export', async (_event, { taskId, startTime, endTime } = {}) => {
    return agentCore.memory.exportAuditLog({ taskId, startTime, endTime });
  });

  // ── Usage / Cost ──────────────────────────────────────────────────────────

  ipcMain.handle('usage:summary', async (_event, { days } = {}) => {
    return agentCore.memory.getUsageSummary(days || 30);
  });

  // ── Policy Engine ─────────────────────────────────────────────────────────

  ipcMain.handle('policy:list', async () => {
    return policyEngine.listRules();
  });

  ipcMain.handle('policy:add', async (_event, rule) => {
    return policyEngine.addRule(rule);
  });

  ipcMain.handle('policy:remove', async (_event, { id }) => {
    return policyEngine.removeRule(id);
  });

  // ── Workflows ─────────────────────────────────────────────────────────────

  ipcMain.handle('workflow:list', async (_event, filter) => {
    return workflowService.list(filter || {});
  });

  ipcMain.handle('workflow:save', async (_event, workflow) => {
    return workflowService.save(workflow);
  });

  ipcMain.handle('workflow:run', async (_event, { id, variables }) => {
    return workflowService.run(id, variables, agentCore);
  });

  ipcMain.handle('workflow:delete', async (_event, { id }) => {
    return workflowService.delete(id);
  });

  // ── Scheduler ─────────────────────────────────────────────────────────────

  ipcMain.handle('scheduler:list', async () => {
    return schedulerService.listTasks();
  });

  ipcMain.handle('scheduler:create', async (_event, task) => {
    return schedulerService.createTask(task);
  });

  ipcMain.handle('scheduler:delete', async (_event, { id }) => {
    return schedulerService.deleteTask(id);
  });

  ipcMain.handle('scheduler:toggle', async (_event, { id, enabled }) => {
    return schedulerService.toggleTask(id, enabled);
  });

  ipcMain.handle('scheduler:run-now', async (_event, { id }) => {
    return schedulerService.runNow(id);
  });

  // ── API Server ────────────────────────────────────────────────────────────

  ipcMain.handle('api-server:status', async () => {
    return { running: apiServer.isRunning(), port: apiServer.getPort() };
  });

  ipcMain.handle('api-server:toggle', async (_event, { enabled, port, apiKey }) => {
    if (enabled) {
      try {
        return await apiServer.start(agentCore, agentCore.toolRegistry, agentCore.memory, port || 57000, apiKey);
      } catch (err) {
        return { error: err.message };
      }
    } else {
      return apiServer.stop();
    }
  });

  // ── Database connections ──────────────────────────────────────────────────

  const fsp = require('fs').promises;
  const getDbConnectionsPath = () => path.join(app.getPath('userData'), 'db-connections.json');

  const readDbConnections = async () => {
    try { return JSON.parse(await fsp.readFile(getDbConnectionsPath(), 'utf8')); }
    catch { return []; }
  };

  const writeDbConnections = async (conns) => {
    await fsp.writeFile(getDbConnectionsPath(), JSON.stringify(conns, null, 2));
  };

  ipcMain.handle('db:list-connections', async () => {
    const conns = await readDbConnections();
    return conns.map(({ password: _pw, ...c }) => c); // strip passwords
  });

  ipcMain.handle('db:add-connection', async (_event, form) => {
    const { v4: uuidv4 } = require('uuid');
    const conns = await readDbConnections();
    const id = uuidv4();
    const { password, ...rest } = form;
    const conn = { id, ...rest, createdAt: Date.now() };
    if (password) keyStore.setKey(`db_${id}`, password);
    conns.push(conn);
    await writeDbConnections(conns);
    return conn;
  });

  ipcMain.handle('db:remove-connection', async (_event, id) => {
    const conns = await readDbConnections();
    await writeDbConnections(conns.filter((c) => c.id !== id));
    try { keyStore.deleteKey(`db_${id}`); } catch {}
    return { ok: true };
  });

  ipcMain.handle('db:test-connection', async (_event, id) => {
    const conns = await readDbConnections();
    const conn = conns.find((c) => c.id === id);
    if (!conn) throw new Error('Connection not found');
    const password = keyStore.getKey(`db_${id}`) || '';
    if (conn.type === 'sqlite') {
      const Database = require('better-sqlite3');
      const db = new Database(conn.database, { readonly: true });
      db.close();
    } else if (conn.type === 'postgresql') {
      const { Client } = require('pg');
      const client = new Client({ host: conn.host, port: parseInt(conn.port || '5432'), database: conn.database, user: conn.user, password });
      await client.connect(); await client.end();
    } else if (conn.type === 'mysql') {
      const mysql = require('mysql2/promise');
      const c = await mysql.createConnection({ host: conn.host, port: parseInt(conn.port || '3306'), database: conn.database, user: conn.user, password });
      await c.end();
    }
    return { ok: true };
  });

  // ── Work Mode ─────────────────────────────────────────────────────────────

  /**
   * Build a structured prompt for a single work step.
   */
  function buildStepPrompt(item, step) {
    const parts = [];

    // Work item context
    parts.push(`# Work Item: ${item.title}`);
    if (item.description) parts.push(`\n${item.description}`);

    // Step instructions
    parts.push(`\n## Step: ${step.title}`);
    if (step.prompt) parts.push(`\n${step.prompt}`);

    // Expected output
    if (step.expectedOutput) {
      parts.push(`\n## Expected Output\n${step.expectedOutput}`);
    }

    // Resources
    if (step.resources?.length) {
      parts.push('\n## Resources');
      for (const r of step.resources) {
        if (r.type === 'file') {
          parts.push(`- File: ${r.value}${r.label ? ` (${r.label})` : ''} — use fs_read to read it`);
        } else if (r.type === 'url') {
          parts.push(`- URL: ${r.value}${r.label ? ` (${r.label})` : ''} — use web_fetch to retrieve it`);
        } else {
          parts.push(`- ${r.label || 'Note'}: ${r.value}`);
        }
      }
    }

    // Tool hints
    if (step.toolHints?.length) {
      parts.push(`\n## Suggested Tools\n${step.toolHints.join(', ')}`);
    }

    // Prior completed steps for context
    const siblings = (item.steps || [])
      .filter((s) => s.id !== step.id && s.status === 'done' && !s.parentStepId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .slice(-3);

    if (siblings.length) {
      parts.push('\n## Previously Completed Steps (for context)');
      for (const s of siblings) {
        const snippet = (s.result || '').slice(0, 300);
        parts.push(`### ${s.title}\n${snippet}${s.result?.length > 300 ? '...' : ''}`);
      }
    }

    return parts.join('\n');
  }

  ipcMain.handle('work:list',          async (_e, f)            => workService.listItems(f || {}));
  ipcMain.handle('work:get',           async (_e, { id })       => workService.getItem(id));
  ipcMain.handle('work:save',          async (_e, data)         => workService.saveItem(data));
  ipcMain.handle('work:delete',        async (_e, { id })       => workService.deleteItem(id));
  ipcMain.handle('work:add-step',      async (_e, { itemId, step }) => workService.addStep(itemId, step));
  ipcMain.handle('work:update-step',   async (_e, { itemId, stepId, patch }) => workService.updateStep(itemId, stepId, patch));
  ipcMain.handle('work:delete-step',   async (_e, { itemId, stepId }) => workService.deleteStep(itemId, stepId));
  ipcMain.handle('work:reorder-steps', async (_e, { itemId, orderedIds }) => workService.reorderSteps(itemId, orderedIds));
  ipcMain.handle('work:reset-step',    async (_e, { itemId, stepId }) => workService.resetStep(itemId, stepId));

  ipcMain.handle('work:run-step', async (_e, { itemId, stepId }) => {
    const item = workService.getItem(itemId);
    const step = item?.steps.find((s) => s.id === stepId);
    if (!item || !step) return { error: 'Step not found' };

    const workTaskId = `work_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    workService.markStepRunning(itemId, stepId, workTaskId);

    // Emit task-start immediately so renderer knows the taskId before tokens arrive
    emitFn('agent:task-start', { taskId: workTaskId, _workStep: true });

    (async () => {
      try {
        // Build the same full-quality system prompt as the chat agent uses.
        // This gives the step agent knowledge of all 75+ tools, file-path guidelines,
        // workflow rules, and OS context — so it can auto-select tools without hints.
        const stepPrompt    = buildStepPrompt(item, step);
        const activeContext = await agentCore.context.getActiveContext().catch(() => ({}));
        // memory.search() is synchronous (better-sqlite3) — must NOT use .catch() on it
        let memories = [];
        try { memories = agentCore.memory.search(stepPrompt, 3); } catch {}
        // Use 'executor' persona (action-oriented); fall back gracefully if not found
        const persona       = agentCore.personaManager?.get('executor')
                           || agentCore.personaManager?.get('auto')
                           || { systemPrompt: '' };
        const systemPrompt  = agentCore._buildSystemPrompt(persona, activeContext, memories);

        // Honour per-step model/provider override; fall back to global settings
        const llmProvider = step.provider || agentCore.settings.provider;
        const llmModel    = step.model    || agentCore.settings.model;

        const result = await spawner.spawn({
          prompt:         stepPrompt,
          maxTurns:       agentCore.settings.maxTurns || 30,
          systemPrompt,
          emitToRenderer: emitFn,
          workTaskId,
          llmProvider,
          llmModel,
        });
        workService.markStepDone(itemId, stepId, result);
        emitFn('work:step-complete', { itemId, stepId, result, taskId: workTaskId });
      } catch (err) {
        workService.markStepError(itemId, stepId, err.message);
        emitFn('work:step-error', { itemId, stepId, error: err.message, taskId: workTaskId });
      }
    })();

    return { ok: true, taskId: workTaskId };
  });

  ipcMain.handle('work:import-jira', async (_e, { issueKey }) => {
    try {
      const { PRODUCTIVITY_TOOLS } = require('./agent/tools/productivity-tools');
      const tool = PRODUCTIVITY_TOOLS.find((t) => t.name === 'jira_get_issue');
      if (!tool) return { error: 'Jira tool not available — check Jira credentials in Settings' };
      const raw = JSON.parse(await tool.execute({ issueKey }));
      return workService.importFromJira(raw);
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Window controls ────────────────────────────────────────────────────────

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
}

app.whenReady().then(async () => {
  await initializeAgent();
  createWindow();
  setupIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  reminderService.stop();
  schedulerService.stop();
  await apiServer.stop();
  if (agentCore) {
    agentCore.memory.close();
    agentCore.keyStore.close();
  }
  if (mcpManager) {
    await mcpManager.close();
  }
});
