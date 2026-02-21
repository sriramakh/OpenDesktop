import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Terminal,
  FileEdit,
  Trash2,
  Globe,
  Key,
} from 'lucide-react';

const RISK_CONFIG = {
  dangerous: {
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    title: 'Dangerous Action',
    description: 'This action may cause irreversible changes. Review carefully.',
  },
  sensitive: {
    icon: Shield,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    title: 'Sensitive Action',
    description: 'This action modifies your system. Please confirm.',
  },
};

const TOOL_ICONS = {
  fs_delete: Trash2,
  fs_move: FileEdit,
  fs_write: FileEdit,
  fs_edit: FileEdit,
  system_exec: Terminal,
  browser_submit_form: Globe,
  browser_type: Key,
};

export default function ApprovalDialog({ request, onApprove, onDeny }) {
  const [note, setNote] = useState('');
  const [countdown, setCountdown] = useState(300); // 5 minute timeout

  const risk = RISK_CONFIG[request.action?.riskLevel] || RISK_CONFIG.sensitive;
  const RiskIcon = risk.icon;
  const ToolIcon = TOOL_ICONS[request.action?.tool] || Terminal;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDeny('Timed out');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDeny]);

  const formatParams = (params) => {
    if (!params) return null;
    return Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => {
        const val = typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '...' : String(v);
        return { key: k, value: val };
      });
  };

  const paramList = formatParams(request.action?.params);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onDeny('Dismissed')} />

      {/* Dialog */}
      <div className={`relative w-full max-w-lg mx-4 rounded-2xl ${risk.bg} border ${risk.border} shadow-2xl animate-slide-up overflow-hidden`}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl ${risk.bg} border ${risk.border} flex items-center justify-center shrink-0`}>
              <RiskIcon size={20} className={risk.color} />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${risk.color}`}>{risk.title}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{risk.description}</p>
            </div>
          </div>
        </div>

        {/* Action details */}
        <div className="px-6 pb-4">
          <div className="bg-surface-0/60 rounded-xl border border-surface-3 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ToolIcon size={14} className="text-zinc-400" />
              <span className="text-sm font-mono text-zinc-300">{request.action?.tool}</span>
            </div>

            {request.action?.description && (
              <p className="text-sm text-zinc-400 mb-3">{request.action.description}</p>
            )}

            {paramList && paramList.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Parameters</span>
                {paramList.map(({ key, value }) => (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-xs text-zinc-500 font-mono shrink-0 min-w-[80px]">{key}:</span>
                    <span className="text-xs text-zinc-300 font-mono break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional note */}
          <div className="mt-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)..."
              className="w-full bg-surface-0/40 border border-surface-3 rounded-lg px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-accent/40"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Clock size={10} />
            <span>Auto-deny in {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onDeny(note || 'User denied')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-3 text-zinc-400 hover:text-zinc-200 hover:bg-surface-4 text-sm font-medium transition-colors"
            >
              <XCircle size={14} />
              Deny
            </button>
            <button
              onClick={() => onApprove(note)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                request.action?.riskLevel === 'dangerous'
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
              }`}
            >
              <CheckCircle2 size={14} />
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
