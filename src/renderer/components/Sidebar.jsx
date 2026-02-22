import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Search,
  Settings,
  History,
  Wrench,
  PanelRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Folder,
  Globe,
  Terminal,
  Monitor as MonitorIcon,
  Code,
  Sparkles,
  Plus,
  Plug,
  Wifi,
  WifiOff,
} from 'lucide-react';

const PERSONA_ICONS = {
  auto: Sparkles,
  planner: Brain,
  executor: Zap,
  researcher: Search,
  custom: Settings,
};

const PERSONA_CONFIG = {
  auto: { label: 'Auto', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30', desc: 'Automatically picks the best persona' },
  planner: { label: 'Planner', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  executor: { label: 'Executor', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  researcher: { label: 'Researcher', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  custom: { label: 'Custom', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/30' },
};

const TOOL_CATEGORY_ICONS = {
  filesystem: Folder,
  'app-control': MonitorIcon,
  browser: Globe,
  search: Search,
  system: Terminal,
  llm: Code,
  mcp: Plug,
};

export default function Sidebar({ activePersona, onPersonaChange, history, selectedHistoryId, onSelectHistory, tools, mcpServers, showContext, onToggleContext, onNewSession }) {
  const [expandedSection, setExpandedSection] = useState('persona');

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const toolsByCategory = tools.reduce((acc, tool) => {
    const cat = tool.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tool);
    return acc;
  }, {});

  return (
    <div className="w-64 bg-surface-1 border-r border-surface-3 flex flex-col shrink-0 overflow-hidden">
      {/* Persona Selector */}
      <div className="p-3 border-b border-surface-3">
        <button
          className="flex items-center justify-between w-full text-xs font-medium text-muted uppercase tracking-wider mb-2 hover:text-zinc-300 transition-colors"
          onClick={() => toggleSection('persona')}
        >
          <span>Persona</span>
          {expandedSection === 'persona' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {expandedSection === 'persona' && (
          <div className="space-y-1 animate-fade-in">
            {Object.entries(PERSONA_CONFIG).map(([key, config]) => {
              const Icon = PERSONA_ICONS[key];
              const isActive = activePersona === key;
              return (
                <button
                  key={key}
                  onClick={() => onPersonaChange(key)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? `${config.bg} border ${config.color}`
                      : 'hover:bg-surface-2 text-zinc-400 border border-transparent'
                  }`}
                >
                  <Icon size={15} className={isActive ? config.color : ''} />
                  <span className="font-medium">{config.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="p-3 border-b border-surface-3">
        <button
          className="flex items-center justify-between w-full text-xs font-medium text-muted uppercase tracking-wider mb-2 hover:text-zinc-300 transition-colors"
          onClick={() => toggleSection('tools')}
        >
          <span className="flex items-center gap-1.5">
            <Wrench size={11} /> Tools ({tools.length})
          </span>
          {expandedSection === 'tools' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {expandedSection === 'tools' && (
          <div className="space-y-2 animate-fade-in max-h-48 overflow-y-auto">
            {Object.entries(toolsByCategory)
              .filter(([cat]) => cat !== 'mcp')
              .map(([category, catTools]) => {
                const CatIcon = TOOL_CATEGORY_ICONS[category] || Wrench;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
                      <CatIcon size={11} />
                      <span className="capitalize">{category}</span>
                    </div>
                    {catTools.map((tool) => (
                      <div
                        key={tool.name}
                        className="pl-5 py-0.5 text-xs text-zinc-500 truncate"
                        title={tool.description}
                      >
                        {tool.name}
                      </div>
                    ))}
                  </div>
                );
              })}

            {/* MCP servers */}
            {mcpServers?.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
                  <Plug size={11} />
                  <span>MCP</span>
                </div>
                {mcpServers.map((server) => (
                  <div key={server.id} className="pl-5 py-0.5 flex items-center gap-1.5">
                    {server.status === 'connected'
                      ? <Wifi size={9} className="text-emerald-500 shrink-0" />
                      : <WifiOff size={9} className="text-red-400 shrink-0" />
                    }
                    <span className="text-xs text-zinc-500 truncate" title={server.error || server.name}>
                      {server.name}
                    </span>
                    {server.status === 'connected' && (
                      <span className="text-[9px] text-zinc-700 ml-auto shrink-0">
                        {server.toolCount}t
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <button
          className="flex items-center justify-between w-full text-xs font-medium text-muted uppercase tracking-wider mb-2 hover:text-zinc-300 transition-colors"
          onClick={() => toggleSection('history')}
        >
          <span className="flex items-center gap-1.5">
            <History size={11} /> History
          </span>
          {expandedSection === 'history' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {expandedSection === 'history' && (
          <div className="flex-1 overflow-y-auto space-y-1 animate-fade-in">
            {history.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No history yet</p>
            ) : (
              history.map((item, i) => {
                const isActive = selectedHistoryId === item.id;
                return (
                  <button
                    key={item.id || i}
                    onClick={() => onSelectHistory?.(item)}
                    className={`w-full flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors group text-left ${
                      isActive
                        ? 'bg-accent/10 border border-accent/30'
                        : 'hover:bg-surface-2 border border-transparent'
                    }`}
                  >
                    {item.status === 'completed' ? (
                      <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs truncate transition-colors ${isActive ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                        {item.query}
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {item.turns ? `${item.turns} turns · ` : ''}
                        {item.persona ? `${item.persona} · ` : ''}
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="p-2 border-t border-surface-3 space-y-1">
        {onNewSession && (
          <button
            onClick={onNewSession}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted hover:bg-surface-2 hover:text-zinc-300 transition-colors"
            title="Start a new conversation"
          >
            <Plus size={13} />
            <span>New Session</span>
          </button>
        )}
        <button
          onClick={onToggleContext}
          className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
            showContext
              ? 'bg-accent/10 text-accent hover:bg-accent/20'
              : 'text-muted hover:bg-surface-2 hover:text-zinc-300'
          }`}
        >
          <PanelRight size={13} />
          <span>Context</span>
        </button>
      </div>
    </div>
  );
}
