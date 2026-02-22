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

export default function SettingsModal({ onClose }) {
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

  // Load initial data
  useEffect(() => {
    api?.getSettings().then((s) => {
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    });
    api?.getModelCatalog().then(setCatalog).catch(console.error);
    api?.listApiKeys().then(setStoredKeys).catch(console.error);
  }, []);

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

  const tabs = [
    { id: 'llm', label: 'LLM & Models', icon: Brain },
    { id: 'agent', label: 'Agent', icon: Zap },
    { id: 'permissions', label: 'Permissions', icon: Shield },
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
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 text-xs font-medium border border-accent/30 transition-colors"
            >
              <Save size={12} />
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .input-field {
          width: 100%;
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid rgba(42, 42, 58, 0.8);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: #d4d4d8;
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: rgba(99, 102, 241, 0.4);
        }
        .input-field option {
          background: #12121a;
          color: #d4d4d8;
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
