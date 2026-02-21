const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Agent
  sendMessage: (message, persona) =>
    ipcRenderer.invoke('agent:send-message', { message, persona }),
  cancelTask: () => ipcRenderer.invoke('agent:cancel'),
  approvalResponse: (requestId, approved, note) =>
    ipcRenderer.invoke('agent:approval-response', { requestId, approved, note }),

  // Streaming events from agent
  onAgentStream: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:stream', handler);
    return () => ipcRenderer.removeListener('agent:stream', handler);
  },
  onAgentToolCall: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:tool-call', handler);
    return () => ipcRenderer.removeListener('agent:tool-call', handler);
  },
  onAgentStepUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:step-update', handler);
    return () => ipcRenderer.removeListener('agent:step-update', handler);
  },
  onApprovalRequest: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:approval-request', handler);
    return () => ipcRenderer.removeListener('agent:approval-request', handler);
  },
  onAgentError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:error', handler);
    return () => ipcRenderer.removeListener('agent:error', handler);
  },
  onAgentComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('agent:complete', handler);
    return () => ipcRenderer.removeListener('agent:complete', handler);
  },

  // Memory
  searchMemory: (query, limit) =>
    ipcRenderer.invoke('memory:search', { query, limit }),
  getHistory: (limit) =>
    ipcRenderer.invoke('memory:get-history', { limit }),

  // Context
  getActiveContext: () => ipcRenderer.invoke('context:get-active'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // Tools
  listTools: () => ipcRenderer.invoke('tools:list'),

  // Model catalog & Ollama discovery
  getModelCatalog: () => ipcRenderer.invoke('models:catalog'),
  listOllamaModels: (endpoint) =>
    ipcRenderer.invoke('models:ollama-list', { endpoint }),

  // Encrypted API key management
  setApiKey: (provider, apiKey) =>
    ipcRenderer.invoke('keys:set', { provider, apiKey }),
  removeApiKey: (provider) =>
    ipcRenderer.invoke('keys:remove', { provider }),
  listApiKeys: () => ipcRenderer.invoke('keys:list'),
  hasApiKey: (provider) =>
    ipcRenderer.invoke('keys:has', { provider }),

  // Window
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
});
