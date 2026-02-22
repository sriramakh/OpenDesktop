import React, { useState, useRef, useEffect } from 'react';
import {
  Send, StopCircle, Brain, Zap, Search, Settings,
  Loader2, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Wrench, Bot, Sparkles,
  Terminal, Globe, FolderOpen, Cpu, RefreshCw, Eye,
} from 'lucide-react';

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

export default function ChatPanel({ messages, isProcessing, phaseLabel, onSend, onCancel, activePersona }) {
  const [input, setInput] = useState('');
  const messagesEndRef    = useRef(null);
  const inputRef          = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isProcessing) inputRef.current?.focus();
  }, [isProcessing]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
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
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
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
          <span className="text-[10px] text-zinc-600 flex items-center gap-1">
            {(() => { const Icon = PERSONA_ICONS[activePersona]; return Icon ? <Icon size={10} /> : null; })()}
            {activePersona}
          </span>
        </div>
      </div>
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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/gs, '<ul>$&</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}
