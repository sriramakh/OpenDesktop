import React from 'react';
import { Settings, Minus, Square, X, Monitor } from 'lucide-react';

const api = window.api;

export default function TitleBar({ onSettings }) {
  return (
    <div className="drag-region h-11 flex items-center justify-between px-4 bg-surface-1 border-b border-surface-3 shrink-0">
      <div className="flex items-center gap-2.5 no-drag">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center">
          <Monitor size={14} className="text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-zinc-200">
          OpenDesktop
        </span>
        <span className="text-[10px] font-mono text-muted bg-surface-3 px-1.5 py-0.5 rounded">
          v1.0
        </span>
      </div>

      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={onSettings}
          className="p-1.5 rounded-md hover:bg-surface-3 text-muted hover:text-zinc-300 transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </button>
        <div className="w-px h-4 bg-surface-3 mx-1" />
        <button
          onClick={() => api?.minimize()}
          className="p-1.5 rounded-md hover:bg-surface-3 text-muted hover:text-zinc-300 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => api?.maximize()}
          className="p-1.5 rounded-md hover:bg-surface-3 text-muted hover:text-zinc-300 transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => api?.close()}
          className="p-1.5 rounded-md hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
