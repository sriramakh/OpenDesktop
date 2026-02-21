import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  StopCircle,
  Brain,
  Zap,
  Search,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Wrench,
  Clock,
  User,
  Bot,
} from 'lucide-react';

const PERSONA_ICONS = { planner: Brain, executor: Zap, researcher: Search, custom: Settings };
const PERSONA_COLORS = {
  planner: 'from-indigo-500 to-violet-600',
  executor: 'from-emerald-500 to-teal-600',
  researcher: 'from-amber-500 to-orange-600',
  custom: 'from-zinc-500 to-zinc-600',
};

export default function ChatPanel({ messages, isProcessing, currentSteps, onSend, onCancel, activePersona }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentSteps]);

  useEffect(() => {
    inputRef.current?.focus();
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

        {/* Active step indicator */}
        {isProcessing && currentSteps && (
          <StepProgress steps={currentSteps} />
        )}

        {isProcessing && !currentSteps && (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted animate-pulse-slow">
            <Loader2 size={14} className="animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
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

function WelcomeScreen({ activePersona, onSend }) {
  const suggestions = {
    planner: [
      'Show me what\'s on my Desktop',
      'List all files in my Downloads folder',
      'Find all .pdf files in my Documents',
    ],
    executor: [
      'Show a tree view of my Desktop folder',
      'Read the contents of ~/.zshrc',
      'Open Finder and show my home directory',
    ],
    researcher: [
      'Search the web for the latest Node.js LTS version',
      'What processes are using the most memory right now?',
      'Get my system information',
    ],
    custom: [
      'Browse my Desktop folder',
      'What files are in my home directory?',
      'What tools do you have available?',
    ],
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in">
      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${PERSONA_COLORS[activePersona]} flex items-center justify-center mb-6 shadow-lg shadow-accent/20`}>
        {(() => { const Icon = PERSONA_ICONS[activePersona]; return Icon ? <Icon size={28} className="text-white" /> : null; })()}
      </div>
      <h2 className="text-xl font-semibold text-zinc-200 mb-1">
        OpenDesktop Agent
      </h2>
      <p className="text-sm text-muted mb-8 max-w-md">
        I can read/write files, run commands, search the web, control apps, and automate browser tasks — all locally on your machine.
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

function MessageBubble({ message, activePersona }) {
  const [showSteps, setShowSteps] = useState(false);

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

  return (
    <div className="flex gap-3 animate-slide-up">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${PERSONA_COLORS[activePersona]} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={15} className="text-white" />
      </div>
      <div className="max-w-[80%] min-w-0">
        <div className="bg-surface-2 border border-surface-3 rounded-2xl rounded-bl-md px-4 py-2.5">
          {message.content ? (
            <div
              className="markdown-content text-sm text-zinc-300"
              dangerouslySetInnerHTML={{ __html: simpleMarkdown(message.content) }}
            />
          ) : !message.completed ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" />
              <span>Working on it...</span>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">No response</p>
          )}
        </div>

        {/* Step details toggle */}
        {message.steps && message.steps.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-zinc-300 transition-colors"
            >
              {showSteps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Wrench size={11} />
              {message.steps.length} step{message.steps.length !== 1 ? 's' : ''}
              {message.status === 'completed' && (
                <CheckCircle2 size={11} className="text-emerald-500" />
              )}
              {message.status === 'cancelled' && (
                <XCircle size={11} className="text-zinc-500" />
              )}
            </button>

            {showSteps && (
              <div className="mt-2 space-y-1.5 pl-1 animate-fade-in">
                {message.steps.map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs bg-surface-1 rounded-lg px-3 py-2 border border-surface-3"
                  >
                    <span className="text-zinc-600 font-mono shrink-0 mt-px">{i + 1}.</span>
                    <div className="min-w-0">
                      <span className="text-zinc-400">{step.description}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-zinc-600 font-mono">{step.tool}</span>
                        {step.result?.success && (
                          <CheckCircle2 size={10} className="text-emerald-500" />
                        )}
                        {step.result?.error && (
                          <span className="text-red-400 truncate">{step.result.error}</span>
                        )}
                        {step.result?.skipped && (
                          <span className="text-zinc-500">skipped</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <span className="text-[10px] text-zinc-600 mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function StepProgress({ steps }) {
  const phaseLabels = {
    context: 'Gathering context',
    planning: 'Decomposing task',
    'plan-ready': 'Plan ready',
    executing: 'Executing',
    replanning: 'Adjusting plan',
    synthesizing: 'Preparing response',
  };

  return (
    <div className="flex items-start gap-3 animate-slide-up">
      <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5 step-active">
        <Loader2 size={15} className="text-accent animate-spin" />
      </div>
      <div className="bg-surface-2 border border-accent/20 rounded-2xl rounded-bl-md px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-accent font-medium">
            {phaseLabels[steps.phase] || steps.phase}
          </span>
          {steps.phase === 'executing' && steps.totalSteps && (
            <span className="text-xs text-muted">
              ({steps.stepIndex + 1}/{steps.totalSteps})
            </span>
          )}
        </div>
        {steps.message && (
          <p className="text-xs text-zinc-500 mt-0.5">{steps.message}</p>
        )}
        {steps.step && (
          <p className="text-xs text-zinc-400 mt-1">
            <span className="text-zinc-600 font-mono">{steps.step.tool}</span>{' '}
            — {steps.step.description}
          </p>
        )}
        {steps.plan && (
          <div className="mt-2 space-y-1">
            {steps.plan.steps?.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="font-mono text-zinc-600 w-4">{s.id}.</span>
                <span>{s.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^(.+)$/gm, (match) => {
      if (match.startsWith('<')) return match;
      return match;
    });
}
