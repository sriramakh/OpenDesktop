const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const { AgentCore }        = require('./agent/core');
const { ToolRegistry }     = require('./agent/tools/registry');
const { MemorySystem }     = require('./agent/memory');
const { PermissionManager } = require('./agent/permissions');
const { ContextAwareness } = require('./agent/context');
const { KeyStore }         = require('./agent/keystore');
const { MCPManager }       = require('./agent/mcp/manager');
const { getModelCatalog, listOllamaModels } = require('./agent/llm');
const google = require('./connectors/google');

let mainWindow  = null;
let agentCore   = null;
let mcpManager  = null;
let toolRegistry = null;

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

  agentCore = new AgentCore({
    memory,
    permissions,
    context,
    toolRegistry,
    keyStore,
    emit: (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    },
  });

  await memory.initialize();
  await keyStore.initialize();
  await toolRegistry.registerBuiltinTools();

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
  if (agentCore) {
    agentCore.memory.close();
    agentCore.keyStore.close();
  }
  if (mcpManager) {
    await mcpManager.close();
  }
});
