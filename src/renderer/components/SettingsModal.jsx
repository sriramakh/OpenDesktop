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
  perplexity: {
    icon: Search,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/25',
    activeBorder: 'border-cyan-500/60',
    description: 'Sonar models with built-in web search from Perplexity',
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
};

const DEFAULT_SETTINGS = {
  llmProvider: 'ollama',
  llmModel: 'llama3',
  maxSteps: 20,
  autoApproveRead: true,
  autoApproveWrite: false,
  defaultPersona: 'planner',
  temperature: 0.7,
  maxTokens: 4096,
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
    { id: 'llm',        label: 'LLM & Models', icon: Brain   },
    { id: 'agent',      label: 'Agent',         icon: Zap     },
    { id: 'permissions',label: 'Permissions',   icon: Shield  },
    { id: 'mcp',        label: 'MCP Servers',   icon: Plug    },
    { id: 'appearance', label: 'Appearance',    icon: Palette },
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
        <div className="flex px-6 pt-3 gap-1 border-b border-surface-3">
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
