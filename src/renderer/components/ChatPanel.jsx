import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, StopCircle, Brain, Zap, Search, Settings,
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Wrench, Bot, Sparkles,
  Terminal, Globe, FolderOpen, Cpu, RefreshCw, Eye,
  Paperclip, X as XIcon, Plug, HardDrive, Check,
  Calendar, Mail, Layers, Bell,
} from 'lucide-react';

const api = window.api;

const PERSONA_ICONS  = { auto: Sparkles, planner: Brain, executor: Zap, researcher: Search, custom: Settings };
const PERSONA_COLORS = {
  auto:       'from-violet-500 to-purple-600',
  planner:    'from-indigo-500 to-violet-600',
  executor:   'from-emerald-500 to-teal-600',
  researcher: 'from-amber-500 to-orange-600',
  custom:     'from-zinc-500 to-zinc-600',
};

// Map tool categories to icons
function toolIcon(name = '') {
  if (name.startsWith('fs_'))        return FolderOpen;
  if (name.startsWith('system_'))    return Cpu;
  if (name.startsWith('app_'))       return Terminal;
  if (name.startsWith('web_') || name.startsWith('browser_')) return Globe;
  if (name.startsWith('llm_'))       return Brain;
  return Wrench;
}

export default function ChatPanel({ messages, isProcessing, phaseLabel, onSend, onCancel, activePersona, settings, isHistoryReplay, onSettingsChange }) {
  const [input, setInput]           = useState('');
  const [attachments, setAttachments] = useState([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showConnectors, setShowConnectors]   = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const modelPickerRef = useRef(null);
  const connectorsRef  = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isProcessing) inputRef.current?.focus();
  }, [isProcessing]);

  // Close popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target)) {
        setShowModelPicker(false);
      }
      if (connectorsRef.current && !connectorsRef.current.contains(e.target)) {
        setShowConnectors(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close popovers on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setShowModelPicker(false); setShowConnectors(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSend(input, attachments);
      setInput('');
      setAttachments([]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleAttach = async () => {
    const files = await api?.selectFiles();
    if (files && files.length > 0) {
      setAttachments((prev) => [...new Set([...prev, ...files])]);
    }
  };

  const removeAttachment = (fp) => {
    setAttachments((prev) => prev.filter((f) => f !== fp));
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* History replay banner */}
      {isHistoryReplay && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
          <RefreshCw size={11} className="shrink-0" />
          <span>Viewing past session — type a message to start a new conversation</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <WelcomeScreen activePersona={activePersona} onSend={onSend} />
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} activePersona={activePersona} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Phase banner */}
      {isProcessing && phaseLabel && (
        <div className="px-6 pb-1">
          <div className="flex items-center gap-2 text-xs text-zinc-500 animate-pulse-slow">
            <Loader2 size={11} className="animate-spin shrink-0" />
            <span>{phaseLabel}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-surface-3 bg-surface-1 px-4 py-3">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((fp) => (
              <div key={fp} className="flex items-center gap-1 bg-accent/10 border border-accent/20 rounded-lg px-2 py-0.5">
                <Paperclip size={10} className="text-accent shrink-0" />
                <span className="text-[10px] text-accent max-w-[180px] truncate" title={fp}>
                  {fp.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(fp)}
                  className="text-accent/60 hover:text-accent transition-colors ml-0.5"
                >
                  <XIcon size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Attach file button */}
          <button
            type="button"
            onClick={handleAttach}
            disabled={isProcessing}
            title="Attach files"
            className="shrink-0 p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-surface-3 transition-colors disabled:opacity-40"
          >
            <Paperclip size={16} />
          </button>

          {/* Connectors button */}
          <div className="relative shrink-0" ref={connectorsRef}>
            <button
              type="button"
              onClick={() => { setShowConnectors(!showConnectors); setShowModelPicker(false); }}
              title="Google connectors"
              className={`p-2 rounded-lg transition-colors ${showConnectors ? 'text-accent bg-accent/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-3'}`}
            >
              <Plug size={16} />
            </button>
            {showConnectors && (
              <ConnectorsPopover onClose={() => setShowConnectors(false)} />
            )}
          </div>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${activePersona} to do something...`}
              disabled={isProcessing}
              rows={1}
              className="w-full bg-surface-2 border border-surface-4 rounded-xl px-4 py-3 pr-12 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none transition-all disabled:opacity-50"
              style={{ minHeight: '44px', maxHeight: '160px' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
            />
            <div className="absolute right-2 bottom-2">
              {isProcessing ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  title="Cancel"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-zinc-600">
            Shift+Enter for new line · Enter to send
          </span>
          {/* Inline model picker trigger */}
          <div className="relative" ref={modelPickerRef}>
            <button
              type="button"
              onClick={() => { setShowModelPicker(!showModelPicker); setShowConnectors(false); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-3 transition-colors"
              title="Click to change model / mode"
            >
              {settings?.agentMode === 'fast'
                ? <Zap size={10} className="text-amber-400" />
                : <Layers size={10} className="text-violet-400" />}
              <Cpu size={10} />
              {settings?.llmProvider || 'ollama'}/{settings?.llmModel || '...'}
              <ChevronDown size={9} className="opacity-60" />
              <span className="mx-0.5 text-zinc-700">·</span>
              {(() => { const Icon = PERSONA_ICONS[activePersona]; return Icon ? <Icon size={10} /> : null; })()}
              {activePersona}
            </button>
            {showModelPicker && (
              <ModelPickerPopover
                settings={settings}
                onApply={() => { setShowModelPicker(false); onSettingsChange?.(); }}
                onClose={() => setShowModelPicker(false)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Model Picker Popover ──────────────────────────────────────────────────────

function ModelPickerPopover({ settings, onApply, onClose }) {
  const [catalog, setCatalog]         = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [provider, setProvider]       = useState(settings?.llmProvider || 'ollama');
  const [model, setModel]             = useState(settings?.llmModel || '');
  const [mode, setMode]               = useState(settings?.agentMode || 'comprehensive');
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    api?.getModelCatalog().then(setCatalog).catch(console.error);
  }, []);

  useEffect(() => {
    if (provider === 'ollama') {
      api?.listOllamaModels().then(setOllamaModels).catch(() => setOllamaModels([]));
    }
  }, [provider]);

  const providerCatalog = catalog?.[provider];
  let modelList = providerCatalog?.models || [];
  if (provider === 'ollama' && ollamaModels.length > 0) {
    const catalogIds = new Set(modelList.map((m) => m.id));
    const extra = ollamaModels.filter((m) => !catalogIds.has(m.id)).map((m) => ({ id: m.id, name: m.name }));
    modelList = [...modelList, ...extra];
  }

  const providers = catalog ? Object.keys(catalog) : ['ollama', 'anthropic', 'openai', 'google', 'deepseek'];

  const handleApply = async () => {
    setSaving(true);
    await api?.updateSettings({ llmProvider: provider, llmModel: model, agentMode: mode });
    setSaving(false);
    onApply();
  };

  return (
    <div className="absolute bottom-full right-0 mb-2 w-72 bg-surface-1 border border-surface-3 rounded-xl shadow-2xl animate-fade-in z-50 p-3 space-y-3">
      <p className="text-xs font-medium text-zinc-300">Change Model</p>

      {/* Provider */}
      <div>
        <label className="text-[10px] text-zinc-500 mb-1 block">Provider</label>
        <div className="relative">
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              const first = catalog?.[e.target.value]?.models?.[0]?.id;
              if (first) setModel(first);
            }}
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 appearance-none pr-6 focus:outline-none focus:border-accent/40"
          >
            {providers.map((p) => (
              <option key={p} value={p}>{catalog?.[p]?.label || p}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
        </div>
      </div>

      {/* Model */}
      <div>
        <label className="text-[10px] text-zinc-500 mb-1 block">Model</label>
        {modelList.length > 0 ? (
          <div className="relative">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 appearance-none pr-6 focus:outline-none focus:border-accent/40"
            >
              {modelList.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          </div>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model name"
            className="w-full bg-surface-2 border border-surface-3 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent/40"
          />
        )}
      </div>

      {/* Mode */}
      <div>
        <label className="text-[10px] text-zinc-500 mb-1.5 block">Mode</label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { value: 'fast',          label: 'Fast',          Icon: Zap,    desc: '15 turns · concise',  color: 'text-amber-400'  },
            { value: 'comprehensive', label: 'Comprehensive', Icon: Layers, desc: '50 turns · thorough', color: 'text-violet-400' },
          ].map(({ value, label, Icon, desc, color }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-xs transition-colors ${
                mode === value
                  ? 'border-accent/50 bg-accent/10 text-zinc-200'
                  : 'border-surface-3 bg-surface-2 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon size={13} className={mode === value ? color : ''} />
              <span className="font-medium">{label}</span>
              <span className="text-[9px] opacity-60">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={saving || !model}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent/20 text-accent border border-accent/30 text-xs hover:bg-accent/30 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          Apply
        </button>
      </div>
    </div>
  );
}

// ── Connectors Popover ────────────────────────────────────────────────────────

const CONNECTOR_SERVICES = [
  { id: 'drive',    label: 'Google Drive',    icon: HardDrive, color: 'text-blue-400' },
  { id: 'gmail',    label: 'Gmail',           icon: Mail,      color: 'text-red-400'  },
  { id: 'calendar', label: 'Google Calendar', icon: Calendar,  color: 'text-green-400' },
];

function ConnectorsPopover({ onClose }) {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading]   = useState({});
  const [errors, setErrors]     = useState({});

  const refreshStatuses = useCallback(async () => {
    const results = await Promise.all(
      CONNECTOR_SERVICES.map(async (s) => [s.id, await api?.connectorStatus(s.id).catch(() => false)])
    );
    setStatuses(Object.fromEntries(results));
  }, []);

  useEffect(() => { refreshStatuses(); }, [refreshStatuses]);

  const handleConnect = async (service) => {
    setLoading((p) => ({ ...p, [service]: true }));
    setErrors((p) => ({ ...p, [service]: null }));
    try {
      const result = await api?.connectorConnect(service);
      if (result?.error) throw new Error(result.error);
      await refreshStatuses();
    } catch (err) {
      setErrors((p) => ({ ...p, [service]: err.message }));
    } finally {
      setLoading((p) => ({ ...p, [service]: false }));
    }
  };

  const handleDisconnect = async (service) => {
    setLoading((p) => ({ ...p, [service]: true }));
    try {
      await api?.connectorDisconnect(service);
      await refreshStatuses();
    } catch { /* ignore */ } finally {
      setLoading((p) => ({ ...p, [service]: false }));
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-1 border border-surface-3 rounded-xl shadow-2xl animate-fade-in z-50 p-3 space-y-2">
      <p className="text-xs font-medium text-zinc-300 mb-2">Google Connectors</p>
      {CONNECTOR_SERVICES.map(({ id, label, icon: Icon, color }) => {
        const connected = statuses[id];
        const isLoading = loading[id];
        const err = errors[id];
        return (
          <div key={id} className={`flex items-center gap-2 px-2 py-2 rounded-lg border ${connected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-surface-2 border-surface-3'}`}>
            <Icon size={14} className={color} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300">{label}</p>
              {err && <p className="text-[10px] text-red-400 truncate">{err}</p>}
            </div>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <button
              type="button"
              onClick={() => connected ? handleDisconnect(id) : handleConnect(id)}
              disabled={isLoading}
              className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors shrink-0 ${
                connected
                  ? 'text-zinc-500 border-surface-4 hover:text-red-400 hover:border-red-500/30'
                  : 'text-accent border-accent/30 hover:bg-accent/10'
              } disabled:opacity-50`}
            >
              {isLoading ? <Loader2 size={10} className="animate-spin" /> : connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        );
      })}
      <p className="text-[10px] text-zinc-600 pt-1">
        Connect Google services to let the agent read Drive, Gmail, and Calendar.
        Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
      </p>
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ activePersona, onSend }) {
  const suggestions = {
    auto: [
      'Organize my Downloads folder by file type',
      'Show me what\'s on my Desktop and summarize the contents',
      'Open Finder and check my system information',
    ],
    planner: [
      'Help me plan a project folder structure for a React app',
      'Break down the steps to set up a Python development environment',
      'Design a workflow to back up my documents automatically',
    ],
    executor: [
      'Create a folder called "Projects" on my Desktop',
      'Read my ~/.zshrc file and show me the aliases',
      'Find all PDF files in my Downloads folder',
      'Show me all my open browser tabs and close duplicates',
      'What\'s on my active Chrome tab? Summarize it',
      'Find and fill the form on my current browser tab',
    ],
    researcher: [
      'Search the web for the latest Claude API documentation',
      'What processes are using the most memory right now?',
      'Find and summarize all .md files in my Documents folder',
    ],
    custom: [
      'Browse my Desktop folder',
      'What files are in my home directory?',
      'Show me my system information',
    ],
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in">
      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${PERSONA_COLORS[activePersona] || PERSONA_COLORS.auto} flex items-center justify-center mb-6 shadow-lg shadow-accent/20`}>
        {(() => { const Icon = PERSONA_ICONS[activePersona] || Sparkles; return <Icon size={28} className="text-white" />; })()}
      </div>
      <h2 className="text-xl font-semibold text-zinc-200 mb-1">OpenDesktop Agent</h2>
      <p className="text-sm text-muted mb-8 max-w-md">
        Autonomous AI agent — reads & writes files, runs commands, controls apps, searches the web, and more. All locally on your machine.
      </p>
      <div className="space-y-2 w-full max-w-lg">
        {(suggestions[activePersona] || suggestions.custom).map((s, i) => (
          <button
            key={i}
            onClick={() => onSend && onSend(s)}
            className="w-full text-left px-4 py-2.5 rounded-xl bg-surface-2 border border-surface-3 text-sm text-zinc-400 hover:text-zinc-200 hover:border-surface-4 hover:bg-surface-3 transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message, activePersona }) {
  const [showTools, setShowTools] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="max-w-[75%] bg-accent/15 border border-accent/20 rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{message.content}</p>
          <span className="text-[10px] text-zinc-600 mt-1 block text-right">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="flex gap-3 animate-slide-up">
        <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={15} className="text-red-400" />
        </div>
        <div className="max-w-[75%] bg-red-500/10 border border-red-500/20 rounded-2xl rounded-bl-md px-4 py-2.5">
          <p className="text-sm text-red-300">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.role === 'reminder') {
    return (
      <div className="flex justify-center animate-slide-up my-1">
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 max-w-[80%]">
          <Bell size={14} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">{message.content}</p>
          <span className="text-[10px] text-amber-500/60 shrink-0 ml-1">
            {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>
    );
  }

  // Assistant message
  const Icon = PERSONA_ICONS[activePersona] || Bot;
  const allTools = message.toolHistory || [];
  const activeCalls = message.activeCalls || [];
  const displayText = message.completed ? message.content : (message.streamText || '');
  const isThinking  = !message.completed && message.phase !== 'streaming';

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PERSONA_COLORS[activePersona] || PERSONA_COLORS.auto} flex items-center justify-center shrink-0 mt-0.5 ${!message.completed ? 'step-active' : ''}`}>
        {!message.completed
          ? <Loader2 size={15} className="text-white animate-spin" />
          : <Icon size={15} className="text-white" />
        }
      </div>

      <div className="max-w-[82%] min-w-0 space-y-1.5">
        {/* Live tool calls (active / in-progress) */}
        {activeCalls.length > 0 && (
          <div className="space-y-1">
            {activeCalls.map((call, i) => (
              <LiveToolCall key={i} call={call} />
            ))}
          </div>
        )}

        {/* Streaming text or final response */}
        {(displayText || isThinking) && (
          <div className="bg-surface-2 border border-surface-3 rounded-2xl rounded-bl-md px-4 py-2.5">
            {displayText ? (
              <div
                className="markdown-content text-sm text-zinc-300"
                dangerouslySetInnerHTML={{ __html: simpleMarkdown(displayText) }}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted">
                <RefreshCw size={13} className="animate-spin" />
                <span>
                  {message.phase === 'context'     ? 'Gathering context...' :
                   message.phase === 'thinking'    ? 'Reasoning...' :
                   message.phase === 'tool-calls'  ? 'Executing tools...' :
                   message.phase === 'tool-results'? 'Processing results...' :
                   'Working...'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Completed tool history (collapsible) */}
        {allTools.length > 0 && (
          <div>
            <button
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-zinc-300 transition-colors"
            >
              {showTools ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Wrench size={11} />
              {allTools.length} tool call{allTools.length !== 1 ? 's' : ''}
              {message.completed && message.status === 'completed' && (
                <CheckCircle2 size={11} className="text-emerald-500 ml-1" />
              )}
              {message.status === 'cancelled' && (
                <XCircle size={11} className="text-zinc-500 ml-1" />
              )}
            </button>

            {showTools && (
              <div className="mt-1.5 space-y-1 animate-fade-in">
                {allTools.map((t, i) => (
                  <CompletedToolCall key={i} tool={t} />
                ))}
              </div>
            )}
          </div>
        )}

        <span className="text-[10px] text-zinc-600 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

// ── Live tool call (while running) ────────────────────────────────────────────

function LiveToolCall({ call }) {
  const Icon = toolIcon(call.name);
  const isRunning = call.status === 'running' || call.status === 'pending';
  const isDone    = call.status === 'done';
  const isError   = call.status === 'error';

  return (
    <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 border transition-all ${
      isRunning ? 'bg-accent/5 border-accent/20 animate-pulse-slow' :
      isDone    ? 'bg-emerald-500/5 border-emerald-500/20' :
      isError   ? 'bg-red-500/5 border-red-500/20' :
      'bg-surface-2 border-surface-3'
    }`}>
      <div className="mt-px shrink-0">
        {isRunning ? <Loader2 size={12} className="text-accent animate-spin" />
          : isDone ? <CheckCircle2 size={12} className="text-emerald-500" />
          : isError ? <XCircle size={12} className="text-red-400" />
          : <Icon size={12} className="text-zinc-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-zinc-300">{call.name}</span>
        {call.input && (
          <span className="text-zinc-600 ml-1.5">
            {formatToolInput(call.input)}
          </span>
        )}
        {isError && call.error && (
          <div className="text-red-400 mt-0.5 truncate">{call.error}</div>
        )}
      </div>
    </div>
  );
}

// ── Completed tool call (in history) ─────────────────────────────────────────

function CompletedToolCall({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcon(tool.name);

  return (
    <div className="bg-surface-1 rounded-lg border border-surface-3 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors"
      >
        <Icon size={11} className={tool.success ? 'text-zinc-500' : 'text-red-400'} />
        <span className="font-mono text-zinc-400 flex-1 text-left">{tool.name}</span>
        {tool.success
          ? <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
          : <XCircle      size={10} className="text-red-400 shrink-0"    />
        }
        {expanded ? <ChevronDown size={10} className="text-zinc-600" /> : <ChevronRight size={10} className="text-zinc-600" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 border-t border-surface-3">
          {tool.error ? (
            <p className="text-red-400 text-xs mt-1">{tool.error}</p>
          ) : tool.content ? (
            <pre className="text-zinc-400 text-xs mt-1 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {tool.content.slice(0, 2000)}{tool.content.length > 2000 ? '\n…(truncated)' : ''}
            </pre>
          ) : (
            <p className="text-zinc-600 text-xs mt-1 italic">No output</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatToolInput(input) {
  if (!input || typeof input !== 'object') return '';
  const entries = Object.entries(input);
  if (entries.length === 0) return '';
  // Show up to 2 key=value pairs, truncated
  return entries
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${val.slice(0, 40)}${val.length > 40 ? '…' : ''}`;
    })
    .join(', ');
}

function simpleMarkdown(text) {
  if (!text) return '';

  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (preserve content inside)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Linkify URLs (http/https) — skip if already inside a tag or code block
  html = html.replace(
    /(?<!["'>])(https?:\/\/[^\s<)\]]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">$1</a>'
  );

  // Linkify absolute file/directory paths (e.g. /Users/..., ~/Documents/...)
  // Only match paths that look like real filesystem paths (contain at least one /)
  html = html.replace(
    /(?<!["'\/a-zA-Z])((?:~|\/(?:Users|home|tmp|var|opt|etc|Volumes))[^\s<,;:)\]"']+)/g,
    '<a href="file://$1" target="_blank" class="text-blue-400 hover:underline cursor-pointer">$1</a>'
  );

  // Markdown formatting
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/gs, '<ul>$&</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return html;
}
