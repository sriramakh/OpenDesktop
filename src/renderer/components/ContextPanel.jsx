import React from 'react';
import {
  Monitor,
  Cpu,
  HardDrive,
  Clock,
  User,
  Laptop,
  Activity,
  Wifi,
  Folder,
  Globe,
  Terminal,
  Search,
  Code,
  Wrench,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

const TOOL_CATEGORY_ICONS = {
  filesystem: Folder,
  'app-control': Monitor,
  browser: Globe,
  search: Search,
  system: Terminal,
  llm: Code,
};

const PERM_CONFIG = {
  safe: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  sensitive: { icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  dangerous: { icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10' },
};

export default function ContextPanel({ contextData, tools }) {
  const ctx = contextData || {};

  return (
    <div className="w-72 bg-surface-1 border-l border-surface-3 flex flex-col shrink-0 overflow-hidden">
      <div className="p-3 border-b border-surface-3">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1.5">
          <Activity size={11} /> System Context
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Active App */}
        <Section icon={Monitor} title="Active App">
          <InfoRow label="App" value={ctx.activeApp || 'Unknown'} />
          {ctx.activeWindow && <InfoRow label="Window" value={ctx.activeWindow} />}
        </Section>

        {/* System */}
        <Section icon={Laptop} title="System">
          <InfoRow label="Platform" value={`${ctx.platform || '?'} / ${ctx.arch || '?'}`} />
          <InfoRow label="Host" value={ctx.hostname || '?'} />
          <InfoRow label="User" value={ctx.username || '?'} />
          <InfoRow label="Node" value={ctx.nodeVersion || '?'} />
        </Section>

        {/* Resources */}
        <Section icon={Cpu} title="Resources">
          <InfoRow label="CPUs" value={ctx.cpus || '?'} />
          <InfoRow
            label="Memory"
            value={
              ctx.totalMemory
                ? `${formatBytes(ctx.freeMemory)} free / ${formatBytes(ctx.totalMemory)}`
                : '?'
            }
          />
          {ctx.totalMemory && ctx.freeMemory && (
            <div className="mt-1.5">
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-purple-500 transition-all"
                  style={{
                    width: `${((ctx.totalMemory - ctx.freeMemory) / ctx.totalMemory * 100).toFixed(0)}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-600 mt-0.5 block">
                {((ctx.totalMemory - ctx.freeMemory) / ctx.totalMemory * 100).toFixed(0)}% used
              </span>
            </div>
          )}
          <InfoRow label="Uptime" value={ctx.uptime ? formatUptime(ctx.uptime) : '?'} />
        </Section>

        {/* Running Apps */}
        {ctx.runningApps && ctx.runningApps.length > 0 && (
          <Section icon={HardDrive} title={`Running Apps (${ctx.runningApps.length})`}>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {ctx.runningApps.map((app, i) => (
                <div key={i} className="text-xs text-zinc-500 truncate py-0.5">
                  {app}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tool Permissions Overview */}
        <Section icon={Shield} title="Tool Permissions">
          <div className="space-y-1">
            {Object.entries(PERM_CONFIG).map(([level, config]) => {
              const Icon = config.icon;
              const count = tools.filter((t) => t.permissionLevel === level).length;
              return (
                <div key={level} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon size={11} className={config.color} />
                    <span className="text-xs text-zinc-400 capitalize">{level}</span>
                  </div>
                  <span className={`text-xs font-mono ${config.color}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Working Directory */}
        <Section icon={Folder} title="Working Dir">
          <p className="text-xs text-zinc-500 font-mono break-all">{ctx.cwd || '?'}</p>
        </Section>
      </div>

      <div className="p-3 border-t border-surface-3">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Clock size={10} />
          <span>
            Updated {ctx.timestamp ? new Date(ctx.timestamp).toLocaleTimeString() : 'never'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className="text-muted" />
        <span className="text-[11px] font-medium text-zinc-400">{title}</span>
      </div>
      <div className="pl-[18px]">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-zinc-600 shrink-0">{label}</span>
      <span className="text-[11px] text-zinc-400 truncate text-right">{value}</span>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '?';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
