import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  Server,
  Key,
  Sliders,
  Shield,
  Brain,
  Zap,
  RotateCcw,
  RefreshCw,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  ChevronDown,
  ExternalLink,
  Cpu,
  Cloud,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Globe,
  Rocket,
  Wind,
  Activity,
  Layers,
  Search,
  Plus,
  Plug,
  PlugZap,
  Terminal,
  Wifi,
  WifiOff,
  Palette,
  Sun,
  Moon,
  Sunset,
  FolderOpen,
  Plug2,
  Database,
  GitMerge,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';

const api = window.api;

const PROVIDER_META = {
  ollama: {
    icon: HardDrive,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/25',
    activeBorder: 'border-blue-500/60',
    description: 'Run models locally — fully private, no API key needed',
    docsUrl: 'https://ollama.ai',
  },
  openai: {
    icon: Sparkles,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    activeBorder: 'border-emerald-500/60',
    description: 'GPT-4o, o1, o3 and more from OpenAI',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    icon: Brain,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
    activeBorder: 'border-orange-500/60',
    description: 'Claude Sonnet 4, Opus, Haiku from Anthropic',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    icon: Globe,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/25',
    activeBorder: 'border-sky-500/60',
    description: 'Gemini 2.5 Pro/Flash and more from Google',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  deepseek: {
    icon: Cpu,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/25',
    activeBorder: 'border-violet-500/60',
    description: 'DeepSeek V3, R1 — high performance, low cost',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  xai: {
    icon: Rocket,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    activeBorder: 'border-rose-500/60',
    description: 'Grok 3, Grok 2 — powerful reasoning from xAI',
    docsUrl: 'https://console.x.ai',
  },
  mistral: {
    icon: Wind,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    activeBorder: 'border-amber-500/60',
    description: 'Mistral Large, Codestral, Pixtral from Mistral AI',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  groq: {
    icon: Activity,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/25',
    activeBorder: 'border-teal-500/60',
    description: 'Ultra-fast inference — Llama, Mixtral, Gemma on Groq LPUs',
    docsUrl: 'https://console.groq.com/keys',
  },
  together: {
    icon: Layers,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/25',
    activeBorder: 'border-pink-500/60',
    description: 'Llama 405B, Qwen, DeepSeek and more on Together AI',
    docsUrl: 'https://api.together.ai/settings/api-keys',
  },
  minimax: {
    icon: Cloud,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/25',
    activeBorder: 'border-indigo-500/60',
    description: 'MiniMax M2.5 — agentic model with exceptional tool use, 1M context',
    docsUrl: 'https://platform.minimax.io',
  },
};

const DEFAULT_SETTINGS = {
  llmProvider:      'ollama',
  llmModel:         'llama3',
  maxSteps:         20,
  autoApproveRead:  true,
  autoApproveWrite: false,
  defaultPersona:   'planner',
  temperature:      0.7,
  maxTokens:        4096,
  workingDirectory: '',
};

export default function SettingsModal({ onClose, theme = 'dark', onThemeChange }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('llm');

  // Model catalog from backend
  const [catalog, setCatalog] = useState(null);
  // Stored (masked) keys
  const [storedKeys, setStoredKeys] = useState({});
  // New key being entered
  const [newKeyInput, setNewKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // 'saved' | 'removed' | null
  // Ollama local models
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState(null);

  // MCP server management
  const [mcpServers, setMCPServers] = useState([]);
  const [mcpLoading, setMCPLoading] = useState(false);
  const [showAddMCP, setShowAddMCP] = useState(false);
  const [mcpForm, setMCPForm] = useState({
    name: '', transport: 'stdio', command: '', args: '', url: '', env: '',
  });
  const [mcpAddError, setMCPAddError] = useState(null);

  // Integrations tab
  const [integrationKeys, setIntegrationKeys] = useState({});
  const [apiServerStatus, setApiServerStatus] = useState({ running: false, port: 57000 });

  // Databases tab
  const [dbConnections, setDbConnections] = useState([]);
  const [showDbForm, setShowDbForm] = useState(false);
  const [dbForm, setDbForm] = useState({ name: '', type: 'sqlite', host: '', port: '', database: '', user: '', password: '' });
  const [dbLoading, setDbLoading] = useState(false);
  const [dbTestResults, setDbTestResults] = useState({});

  // Workflows tab
  const [workflows, setWorkflows] = useState([]);
  const [showWorkflowForm, setShowWorkflowForm] = useState(false);
  const [workflowForm, setWorkflowForm] = useState({ name: '', description: '', prompt: '' });
  const [workflowLoading, setWorkflowLoading] = useState(false);

  // Policies tab
  const [policies, setPolicies] = useState([]);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState({ name: '', tool: '', action: 'block', pattern: '' });

  // Usage tab
  const [usageSummary, setUsageSummary] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');

  const refreshMCPServers = useCallback(async () => {
    try {
      const servers = await api?.listMCPServers();
      setMCPServers(servers || []);
    } catch (e) {
      console.error('Failed to list MCP servers:', e);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    api?.getSettings().then((s) => {
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    });
    api?.getModelCatalog().then(setCatalog).catch(console.error);
    api?.listApiKeys().then(setStoredKeys).catch(console.error);
    refreshMCPServers();
  }, [refreshMCPServers]);

  // Auto-discover Ollama models when provider changes to ollama
  useEffect(() => {
    if (settings.llmProvider === 'ollama') {
      refreshOllamaModels();
    }
  }, [settings.llmProvider]);

  // Load data for new tabs on activation
  useEffect(() => {
    if (activeTab === 'integrations') {
      api?.listApiKeys?.().then((k) => setIntegrationKeys(k || {})).catch(console.error);
      api?.getApiServerStatus?.().then((s) => { if (s) setApiServerStatus(s); }).catch(console.error);
    }
    if (activeTab === 'databases') {
      api?.listDbConnections?.().then((c) => setDbConnections(c || [])).catch(console.error);
    }
    if (activeTab === 'workflows') {
      api?.listWorkflows?.().then((r) => setWorkflows(r?.workflows || [])).catch(console.error);
    }
    if (activeTab === 'policies') {
      api?.listPolicies?.().then((r) => setPolicies(r?.rules || [])).catch(console.error);
    }
    if (activeTab === 'usage') {
      api?.getUsageSummary?.().then((s) => { if (s) setUsageSummary(s); }).catch(console.error);
      api?.getAuditLog?.({ limit: 50 }).then((r) => setAuditLog(r?.entries || [])).catch(console.error);
    }
  }, [activeTab]);

  const refreshOllamaModels = useCallback(async () => {
    setOllamaLoading(true);
    setOllamaError(null);
    try {
      const models = await api?.listOllamaModels();
      setOllamaModels(models || []);
      if (!models || models.length === 0) {
        setOllamaError('No models found. Run: ollama pull llama3');
      }
    } catch (err) {
      setOllamaError('Ollama not reachable. Is it running?');
      setOllamaModels([]);
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  const handleSave = async () => {
    await api?.updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveKey = async () => {
    if (!newKeyInput.trim()) return;
    setKeySaving(true);
    try {
      await api?.setApiKey(settings.llmProvider, newKeyInput.trim());
      const keys = await api?.listApiKeys();
      setStoredKeys(keys || {});
      setNewKeyInput('');
      setShowKeyInput(false);
      setKeyStatus('saved');
      setTimeout(() => setKeyStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save key:', err);
    } finally {
      setKeySaving(false);
    }
  };

  const handleRemoveKey = async (provider) => {
    await api?.removeApiKey(provider);
    const keys = await api?.listApiKeys();
    setStoredKeys(keys || {});
    setKeyStatus('removed');
    setTimeout(() => setKeyStatus(null), 3000);
  };

  const selectProvider = (providerKey) => {
    updateField('llmProvider', providerKey);
    // Auto-select first model for the new provider
    const providerCatalog = catalog?.[providerKey];
    if (providerCatalog?.models?.length > 0) {
      updateField('llmModel', providerCatalog.models[0].id);
    }
    setShowKeyInput(false);
    setNewKeyInput('');
    setKeyVisible(false);
  };

  const currentProvider = settings.llmProvider;
  const providerInfo = catalog?.[currentProvider];
  const meta = PROVIDER_META[currentProvider] || PROVIDER_META.ollama;
  const requiresKey = providerInfo?.requiresKey;
  const hasKey = !!storedKeys[currentProvider];

  const handleAddMCPServer = async () => {
    setMCPAddError(null);
    setMCPLoading(true);
    try {
      const config = {
        name:      mcpForm.name.trim(),
        transport: mcpForm.transport,
        command:   mcpForm.transport === 'stdio' ? mcpForm.command.trim() : undefined,
        args:      mcpForm.transport === 'stdio'
          ? mcpForm.args.trim().split(/\s+/).filter(Boolean)
          : undefined,
        url:       mcpForm.transport === 'sse' ? mcpForm.url.trim() : undefined,
        env:       mcpForm.env.trim()
          ? Object.fromEntries(
              mcpForm.env.trim().split('\n').map((line) => line.split('=').map((s) => s.trim()))
            )
          : {},
      };
      if (!config.name) { setMCPAddError('Server name is required'); return; }
      if (config.transport === 'stdio' && !config.command) { setMCPAddError('Command is required for stdio transport'); return; }
      if (config.transport === 'sse' && !config.url) { setMCPAddError('URL is required for SSE transport'); return; }

      const result = await api?.addMCPServer(config);
      if (result?.error) { setMCPAddError(result.error); return; }

      setShowAddMCP(false);
      setMCPForm({ name: '', transport: 'stdio', command: '', args: '', url: '', env: '' });
      await refreshMCPServers();
    } catch (err) {
      setMCPAddError(err.message);
    } finally {
      setMCPLoading(false);
    }
  };

  const handleRemoveMCPServer = async (id) => {
    await api?.removeMCPServer(id);
    await refreshMCPServers();
  };

  const handleReconnectMCPServer = async (id) => {
    setMCPLoading(true);
    try {
      await api?.reconnectMCPServer(id);
      await refreshMCPServers();
    } catch (e) {
      console.error('Reconnect failed:', e);
    } finally {
      setMCPLoading(false);
    }
  };

  const tabs = [
    { id: 'llm',          label: 'LLM & Models',  icon: Brain       },
    { id: 'agent',        label: 'Agent',          icon: Zap         },
    { id: 'permissions',  label: 'Permissions',    icon: Shield      },
    { id: 'mcp',          label: 'MCP Servers',    icon: Plug        },
    { id: 'integrations', label: 'Integrations',   icon: Plug2       },
    { id: 'databases',    label: 'Databases',      icon: Database    },
    { id: 'workflows',    label: 'Workflows',      icon: GitMerge    },
    { id: 'policies',     label: 'Policies',       icon: ShieldCheck },
    { id: 'usage',        label: 'Usage & Audit',  icon: BarChart3   },
    { id: 'appearance',   label: 'Appearance',     icon: Palette     },
  ];

  // Build model list — merge catalog with Ollama-discovered models
  let modelList = providerInfo?.models || [];
  if (currentProvider === 'ollama' && ollamaModels.length > 0) {
    const catalogIds = new Set(modelList.map((m) => m.id));
    const discovered = ollamaModels
      .filter((m) => !catalogIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: `${m.name}${m.parameterSize ? ` (${m.parameterSize})` : ''}`,
        ctx: null,
        local: true,
      }));
    // Mark installed models
    const installedIds = new Set(ollamaModels.map((m) => m.id));
    modelList = [
      ...modelList.map((m) => ({ ...m, installed: installedIds.has(m.id) })),
      ...discovered,
    ];
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl mx-4 bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-zinc-200">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-3 text-muted hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-3 gap-1 border-b border-surface-3 overflow-x-auto scrollbar-none">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                activeTab === id
                  ? 'bg-surface-2 text-zinc-200 border-b-2 border-accent'
                  : 'text-muted hover:text-zinc-300 hover:bg-surface-2/50'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-[480px] overflow-y-auto space-y-4">
          {activeTab === 'llm' && (
            <>
              {/* Provider Selector Cards */}
              <div>
                <label className="text-xs text-zinc-400 mb-2 block">Provider</label>
                <div className="grid grid-cols-5 gap-1.5 max-h-[140px] overflow-y-auto">
                  {Object.entries(PROVIDER_META).map(([key, pm]) => {
                    const Icon = pm.icon;
                    const isActive = currentProvider === key;
                    return (
                      <button
                        key={key}
                        onClick={() => selectProvider(key)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                          isActive
                            ? `${pm.bg} ${pm.activeBorder} border`
                            : 'border-surface-3 hover:border-surface-4 hover:bg-surface-2/50'
                        }`}
                      >
                        <Icon size={18} className={isActive ? pm.color : 'text-zinc-500'} />
                        <span className={`text-[11px] font-medium ${isActive ? pm.color : 'text-zinc-500'}`}>
                          {catalog?.[key]?.label?.split(' ')[0] || key}
                        </span>
                        {key !== 'ollama' && storedKeys[key] && (
                          <Lock size={8} className="text-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Provider description */}
              <div className={`rounded-xl p-3 ${meta.bg} border ${meta.border}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">{meta.description}</p>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); }}
                    className={`text-[10px] ${meta.color} flex items-center gap-1 hover:underline`}
                    title={meta.docsUrl}
                  >
                    Docs <ExternalLink size={9} />
                  </a>
                </div>
              </div>

              {/* API Key Section (for cloud providers) */}
              {requiresKey && (
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <Key size={11} /> API Key
                    {keyStatus === 'saved' && (
                      <span className="text-emerald-400 flex items-center gap-0.5 animate-fade-in">
                        <CheckCircle2 size={10} /> Encrypted & saved
                      </span>
                    )}
                    {keyStatus === 'removed' && (
                      <span className="text-red-400 flex items-center gap-0.5 animate-fade-in">
                        <Trash2 size={10} /> Removed
                      </span>
                    )}
                  </label>

                  {hasKey && !showKeyInput ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-0/60 border border-surface-3 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Lock size={12} className="text-emerald-500 shrink-0" />
                        <span className="text-xs text-zinc-400 font-mono flex-1">
                          {storedKeys[currentProvider]}
                        </span>
                        <span className="text-[9px] text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          encrypted
                        </span>
                      </div>
                      <button
                        onClick={() => { setShowKeyInput(true); setNewKeyInput(''); }}
                        className="px-2.5 py-2 rounded-lg text-xs bg-surface-2 text-zinc-400 hover:text-zinc-200 hover:bg-surface-3 transition-colors border border-surface-3"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => handleRemoveKey(currentProvider)}
                        className="p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remove key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type={keyVisible ? 'text' : 'password'}
                          value={newKeyInput}
                          onChange={(e) => setNewKeyInput(e.target.value)}
                          className="input-field pr-8"
                          placeholder={`Paste your ${catalog?.[currentProvider]?.label || ''} API key...`}
                          autoFocus
                        />
                        <button
                          onClick={() => setKeyVisible(!keyVisible)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          {keyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <button
                        onClick={handleSaveKey}
                        disabled={!newKeyInput.trim() || keySaving}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 text-xs font-medium border border-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {keySaving ? <RefreshCw size={11} className="animate-spin" /> : <Lock size={11} />}
                        {keySaving ? 'Saving...' : 'Save Key'}
                      </button>
                      {hasKey && (
                        <button
                          onClick={() => { setShowKeyInput(false); setNewKeyInput(''); }}
                          className="px-2 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-zinc-600 flex items-center gap-1">
                    <Lock size={9} />
                    Keys are encrypted with AES-256-GCM and stored locally on your machine only.
                  </p>
                </div>
              )}

              {/* Ollama Local Discovery */}
              {currentProvider === 'ollama' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <HardDrive size={11} /> Installed Models
                    </label>
                    <button
                      onClick={refreshOllamaModels}
                      disabled={ollamaLoading}
                      className="flex items-center gap-1 text-[10px] text-muted hover:text-zinc-300 transition-colors"
                    >
                      <RefreshCw size={10} className={ollamaLoading ? 'animate-spin' : ''} />
                      {ollamaLoading ? 'Scanning...' : 'Refresh'}
                    </button>
                  </div>
                  {ollamaError && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <AlertCircle size={12} />
                      {ollamaError}
                    </div>
                  )}
                  {ollamaModels.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto">
                      {ollamaModels.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => updateField('llmModel', m.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                            settings.llmModel === m.id
                              ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
                              : 'bg-surface-0/40 border border-surface-3 text-zinc-500 hover:text-zinc-300 hover:bg-surface-2'
                          }`}
                        >
                          {settings.llmModel === m.id && <Check size={10} />}
                          <span className="font-mono truncate">{m.name}</span>
                          {m.parameterSize && (
                            <span className="text-[9px] text-zinc-600 ml-auto">{m.parameterSize}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Model Selector */}
              <Field label="Model">
                <div className="relative">
                  <select
                    value={settings.llmModel}
                    onChange={(e) => updateField('llmModel', e.target.value)}
                    className="input-field appearance-none pr-8"
                  >
                    {modelList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.ctx ? ` — ${formatCtx(m.ctx)} ctx` : ''}
                        {m.installed ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                </div>
                {/* Show context window info for selected model */}
                {(() => {
                  const sel = modelList.find((m) => m.id === settings.llmModel);
                  if (sel?.ctx) {
                    return (
                      <p className="text-[10px] text-zinc-600 mt-1">
                        Context window: <span className="text-zinc-500">{sel.ctx.toLocaleString()} tokens</span>
                        {sel.installed !== undefined && (
                          <span className={sel.installed ? 'text-emerald-500 ml-2' : 'text-zinc-600 ml-2'}>
                            {sel.installed ? '● Installed locally' : '○ Not installed — run: ollama pull ' + sel.id}
                          </span>
                        )}
                      </p>
                    );
                  }
                  return null;
                })()}
              </Field>

              {/* Temperature */}
              <Field label="Temperature">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-xs text-zinc-400 font-mono w-8">
                    {settings.temperature}
                  </span>
                </div>
              </Field>

              {/* Max Tokens */}
              <Field label="Max Tokens">
                <input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => updateField('maxTokens', parseInt(e.target.value) || 4096)}
                  className="input-field"
                  min="256"
                  max="128000"
                />
              </Field>

              {/* Stored Keys Overview */}
              {Object.keys(storedKeys).length > 0 && (
                <div className="mt-2 pt-3 border-t border-surface-3">
                  <label className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5 block">
                    Stored API Keys
                  </label>
                  <div className="space-y-1">
                    {Object.entries(storedKeys).map(([provider, masked]) => (
                      <div key={provider} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-0/40">
                        <div className="flex items-center gap-2">
                          <Lock size={10} className="text-emerald-500/60" />
                          <span className="text-xs text-zinc-400 capitalize">{catalog?.[provider]?.label || provider}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-600 font-mono">{masked}</span>
                          <button
                            onClick={() => handleRemoveKey(provider)}
                            className="text-zinc-600 hover:text-red-400 transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'agent' && (
            <>
              <Field label="Working Directory" icon={FolderOpen}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={settings.workingDirectory || ''}
                    onChange={(e) => updateField('workingDirectory', e.target.value)}
                    className="input-field flex-1"
                    placeholder="e.g. /Users/you/Desktop"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const dir = await api?.selectDirectory();
                      if (dir) updateField('workingDirectory', dir);
                    }}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface-2 border border-surface-3 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-3 transition-colors"
                  >
                    <FolderOpen size={12} />
                    Browse
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Default location for file operations. The agent will use this directory unless you specify another path.
                </p>
              </Field>

              <Field label="Default Persona">
                <select
                  value={settings.defaultPersona}
                  onChange={(e) => updateField('defaultPersona', e.target.value)}
                  className="input-field"
                >
                  <option value="planner">Planner</option>
                  <option value="executor">Executor</option>
                  <option value="researcher">Researcher</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>

              <Field label="Max Steps Per Task">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={settings.maxSteps}
                    onChange={(e) => updateField('maxSteps', parseInt(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <span className="text-xs text-zinc-400 font-mono w-8">
                    {settings.maxSteps}
                  </span>
                </div>
              </Field>
            </>
          )}

          {activeTab === 'permissions' && (
            <>
              <Field label="Auto-approve read operations">
                <Toggle
                  checked={settings.autoApproveRead}
                  onChange={(v) => updateField('autoApproveRead', v)}
                />
              </Field>

              <Field label="Auto-approve write operations">
                <Toggle
                  checked={settings.autoApproveWrite}
                  onChange={(v) => updateField('autoApproveWrite', v)}
                />
              </Field>

              <div className="bg-surface-0/50 border border-surface-3 rounded-xl p-3 mt-2">
                <p className="text-xs text-zinc-500">
                  <strong className="text-zinc-400">Safe</strong> actions (read files, search, fetch) are auto-approved by default.
                  <br /><br />
                  <strong className="text-amber-400">Sensitive</strong> actions (write files, run commands, open apps) require approval unless auto-approve write is on.
                  <br /><br />
                  <strong className="text-red-400">Dangerous</strong> actions (delete files, sudo commands, form submissions with credentials) always require explicit approval.
                </p>
              </div>
            </>
          )}

          {activeTab === 'mcp' && (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-400">
                    Connect external MCP servers to give the agent new tools and capabilities.
                  </p>
                </div>
                <button
                  onClick={() => { setShowAddMCP(!showAddMCP); setMCPAddError(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs hover:bg-accent/25 transition-colors"
                >
                  <Plus size={12} /> Add Server
                </button>
              </div>

              {/* Add server form */}
              {showAddMCP && (
                <div className="bg-surface-0/60 border border-surface-3 rounded-xl p-4 space-y-3 animate-fade-in">
                  <p className="text-xs font-medium text-zinc-300">New MCP Server</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Name</label>
                      <input
                        type="text"
                        value={mcpForm.name}
                        onChange={(e) => setMCPForm((f) => ({ ...f, name: e.target.value }))}
                        className="input-field"
                        placeholder="My MCP Server"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Transport</label>
                      <div className="relative">
                        <select
                          value={mcpForm.transport}
                          onChange={(e) => setMCPForm((f) => ({ ...f, transport: e.target.value }))}
                          className="input-field appearance-none pr-7"
                        >
                          <option value="stdio">stdio (local process)</option>
                          <option value="sse">SSE (HTTP)</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {mcpForm.transport === 'stdio' ? (
                    <>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1">
                          <Terminal size={10} /> Command
                        </label>
                        <input
                          type="text"
                          value={mcpForm.command}
                          onChange={(e) => setMCPForm((f) => ({ ...f, command: e.target.value }))}
                          className="input-field font-mono"
                          placeholder="npx"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Args (space-separated)</label>
                        <input
                          type="text"
                          value={mcpForm.args}
                          onChange={(e) => setMCPForm((f) => ({ ...f, args: e.target.value }))}
                          className="input-field font-mono"
                          placeholder="-y @modelcontextprotocol/server-filesystem /path/to/dir"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block flex items-center gap-1">
                        <Wifi size={10} /> Server URL
                      </label>
                      <input
                        type="text"
                        value={mcpForm.url}
                        onChange={(e) => setMCPForm((f) => ({ ...f, url: e.target.value }))}
                        className="input-field font-mono"
                        placeholder="http://localhost:3001/sse"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">
                      Env vars (one per line: KEY=VALUE)
                    </label>
                    <textarea
                      value={mcpForm.env}
                      onChange={(e) => setMCPForm((f) => ({ ...f, env: e.target.value }))}
                      className="input-field font-mono resize-none"
                      rows={2}
                      placeholder="API_KEY=abc123"
                    />
                  </div>

                  {mcpAddError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <AlertCircle size={12} /> {mcpAddError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => { setShowAddMCP(false); setMCPAddError(null); }}
                      className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddMCPServer}
                      disabled={mcpLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs hover:bg-accent/30 transition-colors disabled:opacity-50"
                    >
                      {mcpLoading
                        ? <><RefreshCw size={11} className="animate-spin" /> Connecting...</>
                        : <><PlugZap size={11} /> Connect</>
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Server list */}
              {mcpServers.length === 0 && !showAddMCP ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Plug size={24} className="text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">No MCP servers configured</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Add a server to extend the agent with custom tools</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mcpServers.map((server) => (
                    <div
                      key={server.id}
                      className={`rounded-xl p-3 border ${
                        server.status === 'connected'
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {server.status === 'connected'
                            ? <Wifi size={13} className="text-emerald-400 shrink-0" />
                            : <WifiOff size={13} className="text-red-400 shrink-0" />
                          }
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-300 truncate">{server.name}</p>
                            <p className="text-[10px] text-zinc-600 font-mono truncate">
                              {server.transport === 'stdio'
                                ? `${server.command || ''}`
                                : server.url || ''
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {server.status === 'connected' ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleReconnectMCPServer(server.id)}
                              className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                            >
                              <RefreshCw size={9} /> Retry
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMCPServer(server.id)}
                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
                            title="Remove server"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {server.status === 'error' && server.error && (
                        <p className="text-[10px] text-red-400 mt-1.5 bg-red-500/5 px-2 py-1 rounded">
                          {server.error}
                        </p>
                      )}

                      {server.status === 'connected' && server.tools?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {server.tools.slice(0, 6).map((t) => (
                            <span key={t.name} className="text-[9px] text-zinc-600 bg-surface-2 px-1.5 py-0.5 rounded font-mono">
                              {t.name}
                            </span>
                          ))}
                          {server.tools.length > 6 && (
                            <span className="text-[9px] text-zinc-700 px-1.5 py-0.5">
                              +{server.tools.length - 6} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Hint */}
              <div className="bg-surface-0/40 border border-surface-3 rounded-xl p-3 mt-2">
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  <strong className="text-zinc-500">MCP</strong> (Model Context Protocol) lets the agent use tools from external servers.
                  Try <span className="font-mono text-zinc-500">npx -y @modelcontextprotocol/server-filesystem /path</span> for local filesystem access,
                  or connect to any MCP-compatible server via SSE.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Developer Platforms</h3>
                <IntKeyField keyName="github" label="GitHub Personal Access Token" placeholder="ghp_..." stored={integrationKeys} onSaved={setIntegrationKeys} />
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Project Management</h3>
                <IntKeyField keyName="jira_token" label="Jira API Token" placeholder="ATATT3..." stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="jira_email" label="Jira Account Email" placeholder="you@company.com" stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="jira_base_url" label="Jira Base URL" placeholder="https://myorg.atlassian.net" stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="linear_token" label="Linear API Key" placeholder="lin_api_..." stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="notion_token" label="Notion Integration Token" placeholder="secret_..." stored={integrationKeys} onSaved={setIntegrationKeys} />
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Messaging</h3>
                <IntKeyField keyName="slack_webhook" label="Slack Incoming Webhook URL" placeholder="https://hooks.slack.com/services/..." stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="slack_bot_token" label="Slack Bot Token (for search)" placeholder="xoxb-..." stored={integrationKeys} onSaved={setIntegrationKeys} />
                <IntKeyField keyName="teams_webhook" label="Microsoft Teams Webhook URL" placeholder="https://...webhook.office.com/..." stored={integrationKeys} onSaved={setIntegrationKeys} />
              </div>

              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">HTTP API Server</h3>
                <div className="flex items-center justify-between p-3 bg-surface-0/50 border border-surface-3 rounded-xl">
                  <div>
                    <p className="text-xs font-medium text-zinc-300">Local REST API</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {apiServerStatus.running
                        ? `Running · http://localhost:${apiServerStatus.port}/v1/`
                        : 'Stopped — enables programmatic access to the agent'}
                    </p>
                  </div>
                  <Toggle
                    checked={apiServerStatus.running}
                    onChange={async (v) => {
                      await api?.toggleApiServer?.(v);
                      const s = await api?.getApiServerStatus?.();
                      if (s) setApiServerStatus(s);
                    }}
                  />
                </div>
                {apiServerStatus.running && (
                  <p className="text-[10px] text-zinc-600 px-1">
                    Auth: <span className="font-mono text-zinc-500">X-API-Key: &lt;your-key&gt;</span>.{' '}
                    Endpoints: <span className="font-mono text-zinc-500">POST /v1/agent/run</span>,{' '}
                    <span className="font-mono text-zinc-500">GET /v1/tools</span>,{' '}
                    <span className="font-mono text-zinc-500">GET /v1/health</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'databases' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">Connect SQLite, PostgreSQL, or MySQL databases.</p>
                <button
                  onClick={() => setShowDbForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs hover:bg-accent/25 transition-colors"
                >
                  <Plus size={12} /> Add Connection
                </button>
              </div>

              {showDbForm && (
                <div className="bg-surface-0/60 border border-surface-3 rounded-xl p-4 space-y-3 animate-fade-in">
                  <p className="text-xs font-medium text-zinc-300">New Database Connection</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Display Name</label>
                      <input type="text" value={dbForm.name} onChange={(e) => setDbForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="My Database" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Type</label>
                      <div className="relative">
                        <select value={dbForm.type} onChange={(e) => setDbForm((f) => ({ ...f, type: e.target.value }))} className="input-field appearance-none pr-7">
                          <option value="sqlite">SQLite</option>
                          <option value="postgresql">PostgreSQL</option>
                          <option value="mysql">MySQL</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  {dbForm.type === 'sqlite' ? (
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">File Path</label>
                      <input type="text" value={dbForm.database} onChange={(e) => setDbForm((f) => ({ ...f, database: e.target.value }))} className="input-field font-mono" placeholder="/Users/you/data.db" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[10px] text-zinc-500 mb-1 block">Host</label>
                          <input type="text" value={dbForm.host} onChange={(e) => setDbForm((f) => ({ ...f, host: e.target.value }))} className="input-field" placeholder="localhost" />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Port</label>
                          <input type="text" value={dbForm.port} onChange={(e) => setDbForm((f) => ({ ...f, port: e.target.value }))} className="input-field" placeholder={dbForm.type === 'postgresql' ? '5432' : '3306'} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Database</label>
                          <input type="text" value={dbForm.database} onChange={(e) => setDbForm((f) => ({ ...f, database: e.target.value }))} className="input-field" placeholder="mydb" />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">User</label>
                          <input type="text" value={dbForm.user} onChange={(e) => setDbForm((f) => ({ ...f, user: e.target.value }))} className="input-field" placeholder="postgres" />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 mb-1 block">Password</label>
                          <input type="password" value={dbForm.password} onChange={(e) => setDbForm((f) => ({ ...f, password: e.target.value }))} className="input-field" placeholder="••••••••" />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={() => { setShowDbForm(false); setDbForm({ name: '', type: 'sqlite', host: '', port: '', database: '', user: '', password: '' }); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                    <button
                      onClick={async () => {
                        setDbLoading(true);
                        try {
                          await api?.addDbConnection?.(dbForm);
                          setShowDbForm(false);
                          setDbForm({ name: '', type: 'sqlite', host: '', port: '', database: '', user: '', password: '' });
                          const conns = await api?.listDbConnections?.();
                          setDbConnections(conns || []);
                        } catch (e) { console.error(e); }
                        setDbLoading(false);
                      }}
                      disabled={dbLoading || !dbForm.name || !dbForm.database}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs hover:bg-accent/30 transition-colors disabled:opacity-50"
                    >
                      {dbLoading ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
                      Add
                    </button>
                  </div>
                </div>
              )}

              {dbConnections.length === 0 && !showDbForm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Database size={24} className="text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">No database connections</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Add a connection to query databases with the agent</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dbConnections.map((conn) => (
                    <div key={conn.id} className="flex items-center justify-between px-3 py-2.5 bg-surface-0/50 border border-surface-3 rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <Database size={13} className="text-zinc-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-300 truncate">{conn.name}</p>
                          <p className="text-[10px] text-zinc-600 font-mono truncate">
                            {conn.type}{conn.host ? ` · ${conn.host}` : ''}{conn.database ? ` / ${conn.database}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {dbTestResults[conn.id] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${dbTestResults[conn.id] === 'ok' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {dbTestResults[conn.id] === 'ok' ? '✓ OK' : '✗ Failed'}
                          </span>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              await api?.testDbConnection?.(conn.id);
                              setDbTestResults((r) => ({ ...r, [conn.id]: 'ok' }));
                            } catch { setDbTestResults((r) => ({ ...r, [conn.id]: 'error' })); }
                          }}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-surface-3 transition-colors"
                        >Test</button>
                        <button
                          onClick={async () => {
                            await api?.removeDbConnection?.(conn.id);
                            setDbConnections((cs) => cs.filter((c) => c.id !== conn.id));
                          }}
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
                        ><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'workflows' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">Saved prompt workflows with variable substitution.</p>
                <button
                  onClick={() => setShowWorkflowForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs hover:bg-accent/25 transition-colors"
                >
                  <Plus size={12} /> New Workflow
                </button>
              </div>

              {showWorkflowForm && (
                <div className="bg-surface-0/60 border border-surface-3 rounded-xl p-4 space-y-3 animate-fade-in">
                  <p className="text-xs font-medium text-zinc-300">New Workflow</p>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">Name</label>
                    <input type="text" value={workflowForm.name} onChange={(e) => setWorkflowForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="weekly-report" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">Description (optional)</label>
                    <input type="text" value={workflowForm.description} onChange={(e) => setWorkflowForm((f) => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Brief description" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">{'Prompt — use {{variableName}} for dynamic substitution'}</label>
                    <textarea
                      value={workflowForm.prompt}
                      onChange={(e) => setWorkflowForm((f) => ({ ...f, prompt: e.target.value }))}
                      className="input-field resize-none font-mono"
                      rows={4}
                      placeholder="Summarize the GitHub issues for {{repo}} and write a report..."
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={() => { setShowWorkflowForm(false); setWorkflowForm({ name: '', description: '', prompt: '' }); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                    <button
                      onClick={async () => {
                        setWorkflowLoading(true);
                        try {
                          await api?.saveWorkflow?.(workflowForm);
                          setShowWorkflowForm(false);
                          setWorkflowForm({ name: '', description: '', prompt: '' });
                          const r = await api?.listWorkflows?.();
                          setWorkflows(r?.workflows || []);
                        } catch (e) { console.error(e); }
                        setWorkflowLoading(false);
                      }}
                      disabled={workflowLoading || !workflowForm.name || !workflowForm.prompt}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs hover:bg-accent/30 transition-colors disabled:opacity-50"
                    >
                      {workflowLoading ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                      Save
                    </button>
                  </div>
                </div>
              )}

              {workflows.length === 0 && !showWorkflowForm ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <GitMerge size={24} className="text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">No saved workflows</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">{'Create reusable prompts with {{variable}} substitution'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {workflows.map((wf) => (
                    <div key={wf.id} className="bg-surface-0/50 border border-surface-3 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-300 truncate">{wf.name}</p>
                          {wf.description && <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{wf.description}</p>}
                          {wf.variables?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {wf.variables.map((v) => (
                                <span key={v} className="text-[9px] text-accent/80 bg-accent/10 px-1.5 py-0.5 rounded font-mono">{`{{${v}}}`}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-zinc-600">{wf.runCount || 0} runs</span>
                          <button
                            onClick={() => api?.runWorkflow?.(wf.id)}
                            className="text-[10px] text-accent/80 bg-accent/10 border border-accent/20 px-2 py-0.5 rounded hover:bg-accent/20 transition-colors"
                          >Run</button>
                          <button
                            onClick={async () => {
                              await api?.deleteWorkflow?.(wf.id);
                              setWorkflows((ws) => ws.filter((w) => w.id !== wf.id));
                            }}
                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
                          ><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'policies' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-400">Control which tools the agent can run and when approval is required.</p>
                <button
                  onClick={() => setShowPolicyForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs hover:bg-accent/25 transition-colors"
                >
                  <Plus size={12} /> Add Rule
                </button>
              </div>

              {showPolicyForm && (
                <div className="bg-surface-0/60 border border-surface-3 rounded-xl p-4 space-y-3 animate-fade-in">
                  <p className="text-xs font-medium text-zinc-300">New Policy Rule</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Rule Name</label>
                      <input type="text" value={policyForm.name} onChange={(e) => setPolicyForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Protect sensitive files" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 mb-1 block">Action</label>
                      <div className="relative">
                        <select value={policyForm.action} onChange={(e) => setPolicyForm((f) => ({ ...f, action: e.target.value }))} className="input-field appearance-none pr-7">
                          <option value="block">Block (deny completely)</option>
                          <option value="require_approval">Require approval</option>
                          <option value="warn">Warn (allow with warning)</option>
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">Tool(s) — comma-separated (e.g. fs_write, fs_delete)</label>
                    <input type="text" value={policyForm.tool} onChange={(e) => setPolicyForm((f) => ({ ...f, tool: e.target.value }))} className="input-field font-mono" placeholder="fs_write, fs_delete" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">Path pattern to match (optional)</label>
                    <input type="text" value={policyForm.pattern} onChange={(e) => setPolicyForm((f) => ({ ...f, pattern: e.target.value }))} className="input-field font-mono" placeholder="/Sensitive/ or .env" />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={() => { setShowPolicyForm(false); setPolicyForm({ name: '', tool: '', action: 'block', pattern: '' }); }} className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                    <button
                      onClick={async () => {
                        try {
                          const rule = {
                            name: policyForm.name,
                            tool: policyForm.tool.includes(',') ? policyForm.tool.split(',').map((t) => t.trim()) : policyForm.tool.trim(),
                            action: policyForm.action,
                            ...(policyForm.pattern && { condition: { path: { contains: policyForm.pattern } } }),
                          };
                          await api?.addPolicy?.(rule);
                          setShowPolicyForm(false);
                          setPolicyForm({ name: '', tool: '', action: 'block', pattern: '' });
                          const r = await api?.listPolicies?.();
                          setPolicies(r?.rules || []);
                        } catch (e) { console.error(e); }
                      }}
                      disabled={!policyForm.name || !policyForm.tool}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs hover:bg-accent/30 transition-colors disabled:opacity-50"
                    >
                      <ShieldCheck size={11} /> Add Rule
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {policies.length === 0 && !showPolicyForm && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ShieldCheck size={24} className="text-zinc-700 mb-2" />
                    <p className="text-xs text-zinc-600">No policy rules</p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">Add rules to govern tool access and require approval for sensitive actions</p>
                  </div>
                )}
                {policies.map((rule) => (
                  <div key={rule.id} className={`flex items-start justify-between gap-2 px-3 py-2.5 border rounded-xl ${
                    rule.action === 'block' ? 'bg-red-500/5 border-red-500/20' :
                    rule.action === 'require_approval' ? 'bg-amber-500/5 border-amber-500/20' :
                    'bg-zinc-500/5 border-surface-3'
                  }`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-zinc-300">{rule.name}</p>
                        {rule.builtin && <span className="text-[9px] text-zinc-600 bg-surface-2 px-1.5 py-0.5 rounded">built-in</span>}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5 font-mono truncate">
                        {Array.isArray(rule.tool) ? rule.tool.join(', ') : rule.tool}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        rule.action === 'block' ? 'text-red-400 bg-red-500/10' :
                        rule.action === 'require_approval' ? 'text-amber-400 bg-amber-500/10' :
                        'text-zinc-400 bg-surface-2'
                      }`}>
                        {rule.action === 'require_approval' ? 'approve' : rule.action}
                      </span>
                      {!rule.builtin && (
                        <button
                          onClick={async () => {
                            await api?.removePolicy?.(rule.id);
                            setPolicies((ps) => ps.filter((p) => p.id !== rule.id));
                          }}
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
                        ><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'usage' && (
            <div className="space-y-4">
              {usageSummary ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-0/50 border border-surface-3 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 mb-1">30-Day Cost</p>
                      <p className="text-lg font-bold text-zinc-200">${(usageSummary.totalCostUsd || 0).toFixed(4)}</p>
                    </div>
                    <div className="bg-surface-0/50 border border-surface-3 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 mb-1">Input Tokens</p>
                      <p className="text-sm font-semibold text-zinc-300">{((usageSummary.totalInputTokens || 0) / 1000).toFixed(1)}K</p>
                    </div>
                    <div className="bg-surface-0/50 border border-surface-3 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-zinc-500 mb-1">Output Tokens</p>
                      <p className="text-sm font-semibold text-zinc-300">{((usageSummary.totalOutputTokens || 0) / 1000).toFixed(1)}K</p>
                    </div>
                  </div>
                  {usageSummary.byProvider?.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">By Provider / Model</h3>
                      <div className="space-y-1.5">
                        {usageSummary.byProvider.slice(0, 8).map((row, i) => {
                          const maxCost = Math.max(...usageSummary.byProvider.map((r) => r.estimatedCostUsd || 0), 0.0001);
                          const pct = Math.round(((row.estimatedCostUsd || 0) / maxCost) * 100);
                          return (
                            <div key={i} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-zinc-400 font-mono truncate max-w-[200px]">{row.provider} / {row.model}</span>
                                <span className="text-zinc-500 shrink-0 ml-2">${(row.estimatedCostUsd || 0).toFixed(4)}</span>
                              </div>
                              <div className="h-1 rounded-full bg-surface-2">
                                <div className="h-1 rounded-full bg-accent/50" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <BarChart3 size={24} className="text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">No usage data yet</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Token costs appear after running tasks with cloud providers</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Audit Log</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Filter by tool..."
                      className="text-[10px] bg-surface-0/60 border border-surface-3 rounded-lg px-2 py-1 text-zinc-400 placeholder-zinc-700 outline-none focus:border-accent/40 w-32"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const csv = await api?.exportAuditLog?.();
                          if (csv) {
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'audit-log.csv'; a.click();
                            URL.revokeObjectURL(url);
                          }
                        } catch (e) { console.error(e); }
                      }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-surface-2 hover:bg-surface-3 border border-surface-3 transition-colors"
                    >Export CSV</button>
                  </div>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {auditLog
                    .filter((e) => !auditSearch || e.toolName?.toLowerCase().includes(auditSearch.toLowerCase()))
                    .slice(0, 30)
                    .map((entry, i) => (
                      <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] ${entry.success ? 'bg-surface-0/40' : 'bg-red-500/5 border border-red-500/10'}`}>
                        <span className={entry.success ? 'text-emerald-500' : 'text-red-400'}>{entry.success ? '✓' : '✗'}</span>
                        <span className="font-mono text-zinc-400 w-32 shrink-0 truncate">{entry.toolName}</span>
                        <span className="text-zinc-600 flex-1 truncate">{entry.outputPreview || entry.error || ''}</span>
                        <span className="text-zinc-700 shrink-0">{entry.durationMs ? `${entry.durationMs}ms` : ''}</span>
                      </div>
                    ))}
                  {auditLog.length === 0 && (
                    <p className="text-[10px] text-zinc-700 py-4 text-center">No audit log entries yet</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-5">
              <p className="text-xs text-zinc-400">Choose the visual theme for the app. Your selection is saved instantly.</p>

              <div className="grid grid-cols-3 gap-3">
                {/* Dark */}
                <button
                  onClick={() => onThemeChange?.('dark')}
                  className={`group relative rounded-xl border-2 overflow-hidden transition-all ${
                    theme === 'dark'
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-surface-3 hover:border-surface-4'
                  }`}
                >
                  {/* Mini preview */}
                  <div className="h-24 bg-[#0a0a0f] p-2 space-y-1.5">
                    <div className="h-3 rounded bg-[#12121a] w-full" />
                    <div className="flex gap-1.5 h-14">
                      <div className="w-10 rounded bg-[#12121a]" />
                      <div className="flex-1 rounded bg-[#12121a] p-1.5 space-y-1">
                        <div className="h-1.5 rounded-full bg-[#6366f1]/60 w-3/4" />
                        <div className="h-1.5 rounded-full bg-[#2a2a3a] w-full" />
                        <div className="h-1.5 rounded-full bg-[#2a2a3a] w-5/6" />
                      </div>
                    </div>
                    <div className="h-3 rounded bg-[#1a1a25] w-full" />
                  </div>
                  <div className="px-3 py-2 bg-surface-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Moon size={11} className="text-indigo-400" />
                      <span className="text-xs font-medium text-zinc-300">Dark</span>
                    </div>
                    {theme === 'dark' && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                </button>

                {/* Light */}
                <button
                  onClick={() => onThemeChange?.('light')}
                  className={`group relative rounded-xl border-2 overflow-hidden transition-all ${
                    theme === 'light'
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-surface-3 hover:border-surface-4'
                  }`}
                >
                  <div className="h-24 bg-[#eef1f7] p-2 space-y-1.5">
                    <div className="h-3 rounded bg-[#ffffff] w-full shadow-sm" />
                    <div className="flex gap-1.5 h-14">
                      <div className="w-10 rounded bg-[#ffffff] shadow-sm" />
                      <div className="flex-1 rounded bg-[#ffffff] shadow-sm p-1.5 space-y-1">
                        <div className="h-1.5 rounded-full bg-[#4f46e5]/50 w-3/4" />
                        <div className="h-1.5 rounded-full bg-[#d2d6e2] w-full" />
                        <div className="h-1.5 rounded-full bg-[#d2d6e2] w-5/6" />
                      </div>
                    </div>
                    <div className="h-3 rounded bg-[#e9ecf3] w-full" />
                  </div>
                  <div className="px-3 py-2 bg-surface-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sun size={11} className="text-yellow-500" />
                      <span className="text-xs font-medium text-zinc-300">Light</span>
                    </div>
                    {theme === 'light' && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                </button>

                {/* Warm */}
                <button
                  onClick={() => onThemeChange?.('warm')}
                  className={`group relative rounded-xl border-2 overflow-hidden transition-all ${
                    theme === 'warm'
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-surface-3 hover:border-surface-4'
                  }`}
                >
                  <div className="h-24 bg-[#f5f0e8] p-2 space-y-1.5">
                    <div className="h-3 rounded bg-[#fdf9f3] w-full shadow-sm" />
                    <div className="flex gap-1.5 h-14">
                      <div className="w-10 rounded bg-[#fdf9f3] shadow-sm" />
                      <div className="flex-1 rounded bg-[#fdf9f3] shadow-sm p-1.5 space-y-1">
                        <div className="h-1.5 rounded-full bg-[#e08a06]/60 w-3/4" />
                        <div className="h-1.5 rounded-full bg-[#ede4d4] w-full" />
                        <div className="h-1.5 rounded-full bg-[#ede4d4] w-5/6" />
                      </div>
                    </div>
                    <div className="h-3 rounded bg-[#ede4d4] w-full" />
                  </div>
                  <div className="px-3 py-2 bg-surface-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sunset size={11} className="text-amber-500" />
                      <span className="text-xs font-medium text-zinc-300">Warm</span>
                    </div>
                    {theme === 'warm' && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                </button>
              </div>

              {/* Active theme badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-0/60 border border-surface-3">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-xs text-zinc-400">
                  Active theme: <span className="text-zinc-200 font-medium capitalize">{theme}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-surface-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-zinc-300 hover:bg-surface-2 transition-colors"
          >
            <RotateCcw size={12} />
            Reset
          </button>

          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-400 animate-fade-in">Saved!</span>
            )}
            {activeTab !== 'appearance' && (
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 text-xs font-medium border border-accent/30 transition-colors"
              >
                <Save size={12} />
                Save Settings
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: rgba(99, 102, 241, 0.4);
        }
        .input-field option {
          background: hsl(var(--surface-1));
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}

function Field({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
        {Icon && <Icon size={11} />}
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-surface-4'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function formatCtx(tokens) {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return tokens.toString();
}

function IntKeyField({ keyName, label, placeholder, stored, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const hasKey = !!stored[keyName];

  const save = async () => {
    if (!val.trim()) return;
    setSaving(true);
    try {
      await api?.setApiKey(keyName, val.trim());
      const keys = await api?.listApiKeys();
      onSaved(keys || {});
      setVal('');
      setEditing(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const remove = async () => {
    await api?.removeApiKey(keyName);
    const keys = await api?.listApiKeys();
    onSaved(keys || {});
  };

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-zinc-500 block">{label}</label>
      {hasKey && !editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-surface-0/60 border border-surface-3 rounded-lg px-3 py-1.5">
            <Lock size={10} className="text-emerald-500 shrink-0" />
            <span className="text-xs text-zinc-400 font-mono flex-1">{stored[keyName]}</span>
            <span className="text-[9px] text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">saved</span>
          </div>
          <button onClick={() => setEditing(true)} className="px-2 py-1.5 rounded-lg text-xs bg-surface-2 text-zinc-400 hover:text-zinc-200 hover:bg-surface-3 transition-colors border border-surface-3">Edit</button>
          <button onClick={remove} className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={11} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className="input-field flex-1"
            placeholder={placeholder}
            autoComplete="off"
          />
          <button onClick={save} disabled={!val.trim() || saving} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 text-xs border border-emerald-500/30 transition-colors disabled:opacity-40">
            {saving ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
            Save
          </button>
          {hasKey && <button onClick={() => { setEditing(false); setVal(''); }} className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>}
        </div>
      )}
    </div>
  );
}
