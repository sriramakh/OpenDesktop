const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Agent ──────────────────────────────────────────────────────────────────
  sendMessage: (message, persona, attachments) =>
    ipcRenderer.invoke('agent:send-message', { message, persona, attachments }),
  cancelTask: () =>
    ipcRenderer.invoke('agent:cancel'),
  approvalResponse: (requestId, approved, note) =>
    ipcRenderer.invoke('agent:approval-response', { requestId, approved, note }),
  newSession: () =>
    ipcRenderer.invoke('agent:new-session'),

  // ── Streaming / event callbacks ────────────────────────────────────────────

  // Server-side taskId assignment (first event for every request)
  onAgentTaskStart: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:task-start', handler);
    return () => ipcRenderer.removeListener('agent:task-start', handler);
  },

  // Streaming text token from LLM
  onAgentToken: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:token', handler);
    return () => ipcRenderer.removeListener('agent:token', handler);
  },

  // Tool calls about to be executed (array)
  onAgentToolCalls: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:tool-calls', handler);
    return () => ipcRenderer.removeListener('agent:tool-calls', handler);
  },

  // Single tool starting execution
  onAgentToolStart: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:tool-start', handler);
    return () => ipcRenderer.removeListener('agent:tool-start', handler);
  },

  // Single tool finished execution
  onAgentToolEnd: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:tool-end', handler);
    return () => ipcRenderer.removeListener('agent:tool-end', handler);
  },

  // Batch of tool results returned to the LLM
  onAgentToolResults: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:tool-results', handler);
    return () => ipcRenderer.removeListener('agent:tool-results', handler);
  },

  // LLM is thinking (new turn starting)
  onAgentThinking: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:thinking', handler);
    return () => ipcRenderer.removeListener('agent:thinking', handler);
  },

  // Step-level phase updates (context, running, etc.)
  onAgentStepUpdate: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:step-update', handler);
    return () => ipcRenderer.removeListener('agent:step-update', handler);
  },

  // Approval required
  onApprovalRequest: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:approval-request', handler);
    return () => ipcRenderer.removeListener('agent:approval-request', handler);
  },

  // Error
  onAgentError: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },

  // Task complete
  onAgentComplete: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:complete', handler);
    return () => ipcRenderer.removeListener('agent:complete', handler);
  },

  // Legacy: keep for backward compat with any remaining listeners
  onAgentStream: (cb) => {
    const handler = (_e, d) => cb(d);
    ipcRenderer.on('agent:stream', handler);
    return () => ipcRenderer.removeListener('agent:stream', handler);
  },

  // ── Memory ─────────────────────────────────────────────────────────────────
  searchMemory: (query, limit) =>
    ipcRenderer.invoke('memory:search', { query, limit }),
  getHistory: (limit) =>
    ipcRenderer.invoke('memory:get-history', { limit }),

  // ── Context ────────────────────────────────────────────────────────────────
  getActiveContext: () => ipcRenderer.invoke('context:get-active'),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings:    ()         => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // ── Tools ──────────────────────────────────────────────────────────────────
  listTools: () => ipcRenderer.invoke('tools:list'),

  // ── Models ─────────────────────────────────────────────────────────────────
  getModelCatalog:   ()         => ipcRenderer.invoke('models:catalog'),
  listOllamaModels:  (endpoint) => ipcRenderer.invoke('models:ollama-list', { endpoint }),

  // ── API Keys ───────────────────────────────────────────────────────────────
  setApiKey:    (provider, apiKey) => ipcRenderer.invoke('keys:set',    { provider, apiKey }),
  removeApiKey: (provider)         => ipcRenderer.invoke('keys:remove', { provider }),
  listApiKeys:  ()                 => ipcRenderer.invoke('keys:list'),
  hasApiKey:    (provider)         => ipcRenderer.invoke('keys:has',    { provider }),

  // ── Dialogs ────────────────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  selectFiles:     () => ipcRenderer.invoke('dialog:select-files'),

  // ── Google Connectors ──────────────────────────────────────────────────────
  connectorConnect:    (service) => ipcRenderer.invoke('connector:connect',    { service }),
  connectorDisconnect: (service) => ipcRenderer.invoke('connector:disconnect', { service }),
  connectorStatus:     (service) => ipcRenderer.invoke('connector:status',     { service }),

  // ── MCP Servers ────────────────────────────────────────────────────────────
  listMCPServers:     ()       => ipcRenderer.invoke('mcp:list-servers'),
  addMCPServer:       (config) => ipcRenderer.invoke('mcp:add-server', config),
  removeMCPServer:    (id)     => ipcRenderer.invoke('mcp:remove-server', { id }),
  reconnectMCPServer: (id)     => ipcRenderer.invoke('mcp:reconnect-server', { id }),

  // ── Window ─────────────────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),
});
