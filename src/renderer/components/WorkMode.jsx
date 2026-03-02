import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Plus, Play, RotateCcw, Trash2,
  FileText, Link, AlignLeft, X,
  Loader2, CheckCircle2, AlertCircle,
  Edit3, GitBranch, Briefcase,
  ZoomIn, ZoomOut, Maximize2, RefreshCcw,
  Search, Globe, PenLine, Mail, Database, Terminal,
  BarChart2, Brain, MessageSquare, ClipboardList,
  CheckSquare, Zap, ArrowRightLeft, Image,
  Upload, Cloud, ChevronLeft,
} from 'lucide-react';
import { marked } from 'marked';

const api = window.api;

// ── Constants ───────────────────────────────────────────────────────────────────
const NODE_W     = 224;
const NODE_H     = 88;   // estimated card height for layout math
const ROOT_X     = 90;
const SEQ_GAP    = 72;
const SUB_GAP_X  = 88;
const SUB_GAP_Y  = 38;
const MIN_NODE_W = 180;
const MAX_NODE_W = 420;

const ITEM_STATUS_BADGE = {
  todo:        { cls: 'bg-zinc-700 text-zinc-300',          label: 'To Do' },
  in_progress: { cls: 'bg-amber-500/20 text-amber-300',     label: 'In Progress' },
  done:        { cls: 'bg-emerald-500/20 text-emerald-300', label: 'Done' },
};

// ── Keyword → icon + accent color ──────────────────────────────────────────────
function inferNodeMeta(step) {
  const text = [step.title, step.prompt, ...(step.toolHints || [])].join(' ').toLowerCase();
  if (/pdf|docx|xlsx|file|document|report/.test(text))     return { Icon: FileText,      color: '#818cf8' };
  if (/web|url|http|fetch|scrape|browse/.test(text))       return { Icon: Globe,          color: '#22d3ee' };
  if (/search|find|lookup|query|filter/.test(text))        return { Icon: Search,         color: '#c084fc' };
  if (/write|draft|generate|create|compose/.test(text))    return { Icon: PenLine,        color: '#34d399' };
  if (/email|gmail|mail|inbox/.test(text))                 return { Icon: Mail,           color: '#60a5fa' };
  if (/database|sql|\bdb\b|postgres|mysql/.test(text))     return { Icon: Database,       color: '#fb923c' };
  if (/code|script|python|run|execute|bash/.test(text))    return { Icon: Terminal,       color: '#4ade80' };
  if (/git|github|repo|branch|commit|\bpr\b/.test(text))   return { Icon: GitBranch,      color: '#94a3b8' };
  if (/chart|graph|dashboard|analytics/.test(text))        return { Icon: BarChart2,      color: '#fbbf24' };
  if (/\bai\b|llm|claude|gpt|model|summarize/.test(text))  return { Icon: Brain,          color: '#e879f9' };
  if (/slack|teams|discord|message|notify/.test(text))     return { Icon: MessageSquare,  color: '#38bdf8' };
  if (/jira|ticket|issue|bug|sprint/.test(text))           return { Icon: ClipboardList,  color: '#60a5fa' };
  if (/test|verify|validate|check|assert/.test(text))      return { Icon: CheckSquare,    color: '#86efac' };
  if (/api|endpoint|rest|webhook/.test(text))              return { Icon: Zap,            color: '#fb7185' };
  if (/transform|convert|process|parse/.test(text))        return { Icon: ArrowRightLeft, color: '#a78bfa' };
  if (/image|photo|screenshot|vision/.test(text))          return { Icon: Image,          color: '#f472b6' };
  return { Icon: Play, color: '#64748b' };
}

// ── Auto layout ─────────────────────────────────────────────────────────────────
function computeAutoLayout(steps) {
  const sorted  = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const allIds  = new Set(steps.map((s) => s.id));
  // Treat steps with missing parent as root
  const roots   = sorted.filter((s) => !s.parentStepId || !allIds.has(s.parentStepId));
  const pos     = {};
  let currentY  = 90;

  for (const root of roots) {
    const children    = sorted.filter((s) => s.parentStepId === root.id);
    const childGroupH = children.length * NODE_H + Math.max(0, children.length - 1) * SUB_GAP_Y;
    const rootY       = currentY + (childGroupH > NODE_H ? (childGroupH - NODE_H) / 2 : 0);
    pos[root.id]      = { x: ROOT_X, y: rootY };
    for (let i = 0; i < children.length; i++) {
      pos[children[i].id] = {
        x: ROOT_X + NODE_W + SUB_GAP_X,
        y: currentY + i * (NODE_H + SUB_GAP_Y),
      };
    }
    currentY += Math.max(NODE_H, childGroupH) + SEQ_GAP;
  }
  return pos;
}

// ── ResultPanel ─────────────────────────────────────────────────────────────────
function ResultPanel({ step, stream, resultVersion }) {
  const text        = step?.status === 'done' || step?.status === 'error'
    ? (step.result || '')
    : (stream?.streamText || '');
  const activeCalls = stream?.activeCalls || [];

  if (!text && !activeCalls.length && step?.status === 'pending') {
    return (
      <div className="flex items-center justify-center text-zinc-500 text-xs italic py-6">
        Run this step to see results.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {activeCalls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeCalls.map((call, i) => (
            <span
              key={call.id || i}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono border ${
                call.status === 'running' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : call.status === 'done'  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : call.status === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-zinc-700/50 border-zinc-600 text-zinc-400'
              }`}
            >
              {call.status === 'running' && <Loader2 size={9} className="animate-spin" />}
              {call.status === 'done'    && <CheckCircle2 size={9} />}
              {call.status === 'error'   && <AlertCircle size={9} />}
              {call.name}
            </span>
          ))}
        </div>
      )}
      {text && (
        <div
          className="prose prose-invert prose-sm max-w-none text-zinc-300 text-xs leading-relaxed"
          dangerouslySetInnerHTML={{ __html: marked(text, { breaks: true, gfm: true }) }}
        />
      )}
      {!text && step?.status === 'running' && (
        <div className="flex items-center gap-2 text-amber-400 text-xs">
          <Loader2 size={12} className="animate-spin" />
          <span>Agent working…</span>
        </div>
      )}
    </div>
  );
}

// ── ResourceChip ────────────────────────────────────────────────────────────────
function ResourceChip({ resource, onRemove }) {
  const icon =
    resource.type === 'file'     ? <FileText size={10} />
    : resource.type === 'url'    ? <Globe size={10} />
    : resource.type === 'drive'  ? <Cloud size={10} className="text-blue-400" />
    : resource.type === 'db_query' ? <Database size={10} className="text-orange-400" />
    : <AlignLeft size={10} />;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-3 border border-surface-3 text-[10px] text-zinc-300 group">
      {icon}
      <span className="max-w-[120px] truncate">{resource.label || resource.value}</span>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 ml-0.5"
      >
        <X size={9} />
      </button>
    </span>
  );
}

// ── AttachMenu ──────────────────────────────────────────────────────────────────
// Replaces AddResourceButton with local upload, URL, text, Drive, and Database
function AttachMenu({ onAdd }) {
  const [open,        setOpen]        = useState(false);
  const [mode,        setMode]        = useState(null); // null|'url'|'text'|'drive'|'db'
  const [val,         setVal]         = useState('');
  const [label,       setLabel]       = useState('');
  const [driveConn,   setDriveConn]   = useState(false);
  const [dbConns,     setDbConns]     = useState([]);
  const [selConn,     setSelConn]     = useState('');
  const [dbQuery,     setDbQuery]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const ref = useRef(null);

  // Fetch status when menu opens
  useEffect(() => {
    if (!open) return;
    api.connectorStatus?.('drive').then((s) => setDriveConn(!!s?.connected)).catch(() => {});
    api.listDbConnections?.().then((c) => setDbConns(c || [])).catch(() => {});
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) reset(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const reset = () => {
    setOpen(false); setMode(null); setVal(''); setLabel('');
    setDbQuery(''); setSelConn('');
  };

  const handleLocalFile = async () => {
    setLoading(true);
    try {
      const files = await api.selectFiles?.();
      if (files?.length) {
        for (const path of files) {
          const name = path.split(/[\\/]/).pop();
          onAdd({ type: 'file', value: path, label: name });
        }
      }
    } finally { setLoading(false); reset(); }
  };

  const handleAddURL = () => {
    if (!val.trim()) return;
    onAdd({ type: 'url', value: val.trim(), label: label.trim() || val.trim() });
    reset();
  };

  const handleAddText = () => {
    if (!val.trim()) return;
    onAdd({ type: 'text', value: val.trim(), label: label.trim() || 'Note' });
    reset();
  };

  const handleAddDrive = () => {
    if (!val.trim()) return;
    // Extract file ID from Drive URL if needed
    const m = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = m ? m[1] : val.trim();
    onAdd({ type: 'drive', value: fileId, label: label.trim() || `Drive: ${fileId.slice(0, 12)}…`, driveUrl: val });
    reset();
  };

  const handleAddDB = () => {
    if (!selConn || !dbQuery.trim()) return;
    const conn = dbConns.find((c) => c.id === selConn);
    onAdd({
      type: 'db_query',
      value: dbQuery.trim(),
      label: label.trim() || `${conn?.name || conn?.id}: query`,
      connectionId: selConn,
    });
    reset();
  };

  // Common input style (belt-and-suspenders in addition to .input-field CSS)
  const inputStyle = {
    color: 'var(--text-primary)',
    background: 'var(--input-bg)',
    borderColor: 'var(--input-border)',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-600 text-[10px] text-zinc-500 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />} Attach
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-30 bg-surface-2 border border-surface-3 rounded-xl shadow-2xl w-72 overflow-hidden">

          {/* Main menu */}
          {!mode && (
            <div className="p-1">
              <MenuItem
                icon={<Upload size={14} className="text-accent" />}
                title="Local File"
                desc="Upload from your computer"
                onClick={handleLocalFile}
              />
              <MenuItem
                icon={<Globe size={14} className="text-cyan-400" />}
                title="URL / Website"
                desc="Link to a web page or resource"
                onClick={() => setMode('url')}
              />
              <MenuItem
                icon={<AlignLeft size={14} className="text-emerald-400" />}
                title="Text Note"
                desc="Paste raw text content"
                onClick={() => setMode('text')}
              />
              <MenuItem
                icon={<Cloud size={14} className="text-blue-400" />}
                title="Google Drive"
                desc={driveConn ? 'Paste a Drive file URL or ID' : 'Connect Drive in Settings first'}
                onClick={() => setMode('drive')}
              />
              <MenuItem
                icon={<Database size={14} className="text-orange-400" />}
                title="Database Query"
                desc={`${dbConns.length} connection${dbConns.length !== 1 ? 's' : ''} available`}
                onClick={() => setMode('db')}
              />
            </div>
          )}

          {/* URL mode */}
          {mode === 'url' && (
            <div className="p-3 space-y-2">
              <SubHeader title="Add URL" onBack={() => setMode(null)} />
              <input
                autoFocus
                className="input-field text-xs"
                style={inputStyle}
                placeholder="https://…"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddURL()}
              />
              <input
                className="input-field text-xs"
                style={inputStyle}
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <ModalActions onBack={() => setMode(null)} onAdd={handleAddURL} disabled={!val.trim()} />
            </div>
          )}

          {/* Text mode */}
          {mode === 'text' && (
            <div className="p-3 space-y-2">
              <SubHeader title="Add Text Note" onBack={() => setMode(null)} />
              <textarea
                autoFocus
                className="input-field text-xs resize-none"
                style={{ ...inputStyle, height: 80 }}
                placeholder="Paste text content…"
                value={val}
                onChange={(e) => setVal(e.target.value)}
              />
              <input
                className="input-field text-xs"
                style={inputStyle}
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <ModalActions onBack={() => setMode(null)} onAdd={handleAddText} disabled={!val.trim()} />
            </div>
          )}

          {/* Drive mode */}
          {mode === 'drive' && (
            <div className="p-3 space-y-2">
              <SubHeader title="Google Drive File" onBack={() => setMode(null)} />
              {!driveConn && (
                <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
                  Connect Google Drive in Settings → Connectors first.
                </div>
              )}
              <input
                autoFocus
                className="input-field text-xs"
                style={inputStyle}
                placeholder="Paste Drive URL or file ID…"
                value={val}
                onChange={(e) => setVal(e.target.value)}
              />
              <input
                className="input-field text-xs"
                style={inputStyle}
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <ModalActions onBack={() => setMode(null)} onAdd={handleAddDrive} disabled={!val.trim()} />
            </div>
          )}

          {/* Database mode */}
          {mode === 'db' && (
            <div className="p-3 space-y-2">
              <SubHeader title="Database Query" onBack={() => setMode(null)} />
              {dbConns.length === 0 ? (
                <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
                  No database connections. Add one in Settings → Databases.
                </div>
              ) : (
                <>
                  <select
                    className="input-field text-xs"
                    style={inputStyle}
                    value={selConn}
                    onChange={(e) => setSelConn(e.target.value)}
                  >
                    <option value="">Select connection…</option>
                    {dbConns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.id} ({c.type})
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="input-field text-xs resize-none"
                    style={{ ...inputStyle, height: 64 }}
                    placeholder="SQL query or description…"
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                  />
                  <input
                    className="input-field text-xs"
                    style={inputStyle}
                    placeholder="Label (optional)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <ModalActions
                    onBack={() => setMode(null)}
                    onAdd={handleAddDB}
                    disabled={!selConn || !dbQuery.trim()}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-3 text-left transition-colors"
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{title}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>
      </div>
    </button>
  );
}
function SubHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <button onClick={onBack} style={{ color: 'var(--text-tertiary)' }} className="hover:opacity-80">
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</span>
    </div>
  );
}
function ModalActions({ onBack, onAdd, disabled }) {
  return (
    <div className="flex gap-2 justify-end pt-1">
      <button
        onClick={onBack}
        className="text-xs px-2 py-1 hover:opacity-80 transition-opacity"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Back
      </button>
      <button
        onClick={onAdd}
        disabled={disabled}
        className="text-xs bg-accent text-white px-3 py-1 rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

// ── ConnectingOverlay ───────────────────────────────────────────────────────────
// Fixed-position SVG overlay rendered while dragging from a port
function ConnectingOverlay({ port }) {
  if (!port) return null;
  const { startScreenX, startScreenY, curScreenX, curScreenY } = port;
  const dx = curScreenX - startScreenX;
  const cx = Math.max(60, Math.abs(dx) * 0.55);
  const d  = `M ${startScreenX} ${startScreenY} C ${startScreenX + cx} ${startScreenY} ${curScreenX - cx} ${curScreenY} ${curScreenX} ${curScreenY}`;
  return (
    <svg
      style={{
        position: 'fixed', left: 0, top: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 9999,
      }}
    >
      <defs>
        <style>{`@keyframes wm-cdash { to { stroke-dashoffset: -14; } }`}</style>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={2}
        strokeDasharray="6 3"
        style={{ animation: 'wm-cdash 0.35s linear infinite' }}
      />
      <circle cx={curScreenX} cy={curScreenY} r={6} fill="hsl(var(--accent))" opacity={0.5} />
    </svg>
  );
}

// ── EdgesLayer ──────────────────────────────────────────────────────────────────
// Direction-adaptive bezier: routes via the closest pair of sides based on relative position.
function edgePath(fp, fw, tp, tw) {
  const fcx = fp.x + fw / 2,  fcy = fp.y + NODE_H / 2;
  const tcx = tp.x + tw / 2,  tcy = tp.y + NODE_H / 2;
  const dx  = tcx - fcx,      dy  = tcy - fcy;
  let x1, y1, x2, y2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Mostly horizontal — connect left↔right sides
    if (dx >= 0) { x1 = fp.x + fw + 2; x2 = tp.x - 2; }
    else         { x1 = fp.x - 2;      x2 = tp.x + tw + 2; }
    y1 = fcy; y2 = tcy;
    const cx = Math.max(40, Math.abs(dx) * 0.45) * (dx >= 0 ? 1 : -1);
    return `M ${x1} ${y1} C ${x1 + cx} ${y1} ${x2 - cx} ${y2} ${x2} ${y2}`;
  } else {
    // Mostly vertical — connect top↔bottom sides
    if (dy >= 0) { y1 = fp.y + NODE_H + 2; y2 = tp.y - 2; }
    else         { y1 = fp.y - 2;          y2 = tp.y + NODE_H + 2; }
    x1 = fcx; x2 = tcx;
    const cy = Math.max(40, Math.abs(dy) * 0.45) * (dy >= 0 ? 1 : -1);
    return `M ${x1} ${y1} C ${x1} ${y1 + cy} ${x2} ${y2 - cy} ${x2} ${y2}`;
  }
}

function EdgesLayer({ steps, positions, sizes, runningStepId }) {
  const allIds = new Set(steps.map((s) => s.id));
  const sorted = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const roots  = sorted.filter((s) => !s.parentStepId || !allIds.has(s.parentStepId));
  const paths  = [];
  const nw     = (id) => sizes[id]?.w ?? NODE_W;

  // Sequential edges (root N → root N+1)
  for (let i = 0; i < roots.length - 1; i++) {
    const fp = positions[roots[i].id], tp = positions[roots[i + 1].id];
    if (!fp || !tp) continue;
    paths.push({
      key:    `seq-${roots[i].id}`,
      d:      edgePath(fp, nw(roots[i].id), tp, nw(roots[i + 1].id)),
      active: runningStepId === roots[i + 1].id,
    });
  }

  // Parent → child sub-step edges
  for (const step of sorted) {
    if (!step.parentStepId || !allIds.has(step.parentStepId)) continue;
    const parent = steps.find((s) => s.id === step.parentStepId);
    if (!parent) continue;
    const fp = positions[parent.id], tp = positions[step.id];
    if (!fp || !tp) continue;
    paths.push({
      key:    `sub-${step.id}`,
      d:      edgePath(fp, nw(parent.id), tp, nw(step.id)),
      active: runningStepId === step.id,
    });
  }

  return (
    // width/height must be non-zero: Chromium skips rendering zero-size SVGs
    // even with overflow:visible. Use a large value and let overflow handle the rest.
    <svg
      style={{
        position: 'absolute', left: 0, top: 0,
        width: 10000, height: 10000, overflow: 'visible', pointerEvents: 'none',
      }}
    >
      <defs>
        <marker id="wm-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
        </marker>
        <marker id="wm-arrow-act" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" />
        </marker>
        <style>{`@keyframes wm-dash { to { stroke-dashoffset: -16; } }`}</style>
      </defs>
      {paths.map(({ key, d, active }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={active ? '#f59e0b' : '#475569'}
          strokeWidth={1.5}
          strokeDasharray={active ? '8 4' : undefined}
          style={active ? { animation: 'wm-dash 0.5s linear infinite' } : undefined}
          markerEnd={active ? 'url(#wm-arrow-act)' : 'url(#wm-arrow)'}
        />
      ))}
    </svg>
  );
}

// ── StepNode ────────────────────────────────────────────────────────────────────
// Tiny circle rendered at each edge of a node — drag to create a link
function ConnectPort({ side, onMouseDown }) {
  const style = {
    top:    { position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 10 },
    bottom: { position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 10 },
    left:   { position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', zIndex: 10 },
    right:  { position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', zIndex: 10 },
  }[side];
  return (
    <div
      style={style}
      title="Drag to connect"
      className="w-3.5 h-3.5 rounded-full bg-surface-3 border-2 border-zinc-600 hover:border-accent hover:bg-accent/20 cursor-crosshair transition-colors"
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, side); }}
    />
  );
}

function StepNode({
  step, pos, stepNumber, isSelected, isRunning, stream,
  nodeW, isConnectTarget,
  onSelect, onBodyMouseDown, onPortMouseDown, onResizeMouseDown,
}) {
  const meta        = inferNodeMeta(step);
  const { Icon }    = meta;
  const activeCalls = (stream?.activeCalls || []).filter((c) => c.status === 'running').slice(0, 2);

  const statusDotCls =
    isRunning              ? 'bg-amber-400 animate-pulse'
    : step.status === 'done'  ? 'bg-emerald-400'
    : step.status === 'error' ? 'bg-red-400'
    : 'bg-zinc-600';

  // Ring / border
  let cardCls = 'border-surface-3';
  if (isConnectTarget)        cardCls = 'border-accent/60 shadow-[0_0_0_2px_hsl(var(--accent)/0.25)]';
  else if (isSelected)        cardCls = 'border-blue-500/40 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]';
  else if (isRunning)         cardCls = 'border-amber-500/40 shadow-[0_0_0_2px_rgba(245,158,11,0.15)]';
  else if (step.status === 'done')  cardCls = 'border-emerald-500/25';
  else if (step.status === 'error') cardCls = 'border-red-500/25';

  return (
    <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: nodeW }}>

      {/* 4-side connection ports — drag any to link this step to another */}
      {['top','bottom','left','right'].map((side) => (
        <ConnectPort key={side} side={side} onMouseDown={(e, s) => onPortMouseDown(e, step.id, s)} />
      ))}

      {/* Card */}
      <div
        onClick={() => onSelect(step.id)}
        onMouseDown={onBodyMouseDown}
        className={`relative rounded-xl border ${cardCls} bg-surface-1 overflow-visible shadow-lg cursor-pointer select-none transition-[border-color,box-shadow] duration-150`}
        style={isRunning ? { boxShadow: '0 0 20px rgba(245,158,11,0.10)' } : undefined}
      >
        {/* Clip inner content */}
        <div className="overflow-hidden rounded-xl">
          {/* Left accent stripe */}
          <div
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: meta.color }}
          />

          {/* Step number badge */}
          <div
            className="absolute top-2 right-2 text-[9px] font-mono px-1 rounded"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            #{stepNumber}
          </div>

          {/* Header row */}
          <div className="flex items-center gap-2 pl-4 pr-8 pt-2.5 pb-1.5">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}
            >
              <Icon size={13} style={{ color: meta.color }} />
            </div>
            <span className="text-xs font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>
              {step.title || 'Untitled Step'}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotCls}`} />
          </div>

          {/* Model override badge */}
          {step.model && (
            <div className="pl-4 pr-4 pb-0.5">
              <span
                className="inline-flex items-center gap-0.5 text-[8px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}
              >
                {step.model}
              </span>
            </div>
          )}

          {/* Prompt preview */}
          <div
            className="pl-4 pr-4 pb-2.5 text-[10px] leading-relaxed"
            style={{
              color: 'var(--text-tertiary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {step.prompt || <em>No prompt set</em>}
          </div>

          {/* Running tool chips */}
          {activeCalls.length > 0 && (
            <div className="pl-4 pr-3 pb-2 flex gap-1 flex-wrap">
              {activeCalls.map((call, i) => (
                <span
                  key={call.id || i}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300"
                >
                  <Loader2 size={7} className="animate-spin" />
                  {call.name}
                </span>
              ))}
            </div>
          )}

          {/* Resize handle (bottom-right corner) */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-0.5 opacity-0 hover:opacity-60 transition-opacity"
            onMouseDown={(e) => { e.stopPropagation(); onResizeMouseDown(e, step.id, nodeW); }}
            title="Drag to resize"
          >
            <svg viewBox="0 0 8 8" width={8} height={8}>
              <path d="M8 2L8 8L2 8" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-zinc-400" />
            </svg>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── InspectorPanel ──────────────────────────────────────────────────────────────
function InspectorPanel({
  step, steps, isRunning, runningStepId, stream, resultVersion,
  catalog, globalSettings,
  onRun, onReset, onAddSub, onDelete, onUpdateField,
  onAddResource, onRemoveResource, onUnlink, onClose,
}) {
  const hasParent = !!step.parentStepId;
  const parentStep = hasParent ? steps.find((s) => s.id === step.parentStepId) : null;

  const inputStyle = {
    color:       'var(--text-primary)',
    background:  'var(--input-bg)',
    borderColor: 'var(--input-border)',
  };

  return (
    <div className="w-80 shrink-0 border-l border-surface-3 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Configure Step
          </span>
          {hasParent && parentStep && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-surface-3 text-zinc-400 truncate max-w-[100px]">
              <GitBranch size={8} />
              {parentStep.title?.slice(0, 14) || 'sub-step'}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-2 text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
          <X size={13} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Title */}
        <input
          className="input-field text-sm font-medium"
          style={inputStyle}
          placeholder="Step title…"
          value={step.title || ''}
          onChange={(e) => onUpdateField('title', e.target.value)}
        />

        {/* Prompt */}
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Prompt
          </label>
          <textarea
            className="input-field text-xs resize-none"
            style={{ ...inputStyle, height: 96 }}
            placeholder="Describe what this step should accomplish…"
            value={step.prompt || ''}
            onChange={(e) => onUpdateField('prompt', e.target.value)}
          />
        </div>

        {/* Expected output */}
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Expected Output
          </label>
          <textarea
            className="input-field text-xs resize-none"
            style={{ ...inputStyle, height: 56 }}
            placeholder="What does success look like?"
            value={step.expectedOutput || ''}
            onChange={(e) => onUpdateField('expectedOutput', e.target.value)}
          />
        </div>

        {/* Resources */}
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
            Attachments
          </label>
          <div className="flex flex-wrap gap-1.5 items-center">
            {(step.resources || []).map((r, i) => (
              <ResourceChip key={i} resource={r} onRemove={() => onRemoveResource(i)} />
            ))}
            <AttachMenu onAdd={onAddResource} />
          </div>
        </div>

        {/* Tool hints */}
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Tool Hints
          </label>
          <input
            className="input-field text-xs"
            style={inputStyle}
            placeholder="e.g. fs_read, web_fetch, office_read_xlsx"
            value={(step.toolHints || []).join(', ')}
            onChange={(e) =>
              onUpdateField(
                'toolHints',
                e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
              )
            }
          />
        </div>

        {/* Model override */}
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Model
          </label>
          <div className="space-y-1">
            <select
              className="input-field text-xs"
              style={inputStyle}
              value={step.provider || ''}
              onChange={(e) => {
                const newProvider = e.target.value;
                onUpdateField('provider', newProvider || null);
                // Clear model when provider changes so it doesn't mismatch
                if (!newProvider || newProvider !== step.provider) {
                  onUpdateField('model', null);
                }
              }}
            >
              <option value="">Global default ({globalSettings.provider || '…'})</option>
              {Object.entries(catalog).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {step.provider && catalog[step.provider] && (
              <select
                className="input-field text-xs"
                style={inputStyle}
                value={step.model || ''}
                onChange={(e) => onUpdateField('model', e.target.value || null)}
              >
                <option value="">Provider default</option>
                {(catalog[step.provider]?.models || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}

            {!step.provider && (
              <div className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                {globalSettings.model || 'no model set'}
              </div>
            )}
          </div>
        </div>

        {/* Actions strip */}
        <div className="border-t border-surface-3 pt-3 flex gap-1.5 flex-wrap">
          <button
            onClick={onRun}
            disabled={isRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isRunning ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-accent text-white hover:bg-accent/80'
            }`}
          >
            {isRunning && runningStepId === step.id
              ? <><Loader2 size={11} className="animate-spin" /> Running…</>
              : <><Play size={11} /> Run</>
            }
          </button>

          <button
            onClick={onReset}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            <RotateCcw size={11} /> Reset
          </button>

          <button
            onClick={onAddSub}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors"
          >
            <GitBranch size={11} /> Sub-step
          </button>

          {hasParent && (
            <button
              onClick={onUnlink}
              title="Remove parent connection"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              <Link size={11} className="opacity-60" /> Unlink
            </button>
          )}

          <button
            onClick={onDelete}
            disabled={isRunning}
            className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={11} />
          </button>
        </div>

        {/* Result section */}
        <div className="border-t border-surface-3 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Result
            </span>
            {step.status !== 'pending' && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                step.status === 'done'    ? 'bg-emerald-500/20 text-emerald-400'
                : step.status === 'running' ? 'bg-amber-500/20 text-amber-400'
                : step.status === 'error'   ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-700 text-zinc-500'
              }`}>
                {step.status}
              </span>
            )}
          </div>
          <ResultPanel step={step} stream={stream} resultVersion={resultVersion} />
        </div>
      </div>
    </div>
  );
}

// ── Main WorkMode component ─────────────────────────────────────────────────────
export default function WorkMode({ workItem, onBack, onItemUpdate }) {
  const [item,           setItem]           = useState(workItem);
  const [selectedStepId, setSelectedStepId] = useState(null);
  const [isRunning,      setIsRunning]      = useState(false);
  const [catalog,        setCatalog]        = useState({});
  const [globalSettings, setGlobalSettings] = useState({});
  // runningStepId: state + ref kept in sync to avoid stale closures in event handlers
  const [_runningStepId, _setRunningStepId] = useState(null);
  const runningStepIdRef                    = useRef(null);
  const setRunningStepId = useCallback((id) => {
    _setRunningStepId(id);
    runningStepIdRef.current = id;
  }, []);
  const runningStepId = _runningStepId;

  const [runningTaskId,  setRunningTaskId]  = useState(null);
  const [editingTitle,   setEditingTitle]   = useState(false);
  const [titleVal,       setTitleVal]       = useState(item.title);
  const [resultVersion,  setResultVersion]  = useState(0);
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);

  // Canvas state
  const [pan,            setPan]            = useState({ x: 100, y: 60 });
  const [zoom,           setZoom]           = useState(1.0);
  const [positions,      setPositions]      = useState({});
  const [sizes,          setSizes]          = useState({});  // { [stepId]: { w: number } }
  const [isPanning,        setIsPanning]        = useState(false);
  const [connectingPort,   setConnectingPort]   = useState(null);
  // { fromStepId, startScreenX, startScreenY, curScreenX, curScreenY, hoverStepId }
  // Refs
  const runningTaskIdRef   = useRef(null);
  const stepStreamRef      = useRef({});
  const panRef             = useRef({ x: 100, y: 60 });
  const zoomRef            = useRef(1.0);
  const canvasRef          = useRef(null);
  const panOriginRef       = useRef(null);
  const dragRef            = useRef(null);       // node drag: { stepId, startX, startY, origX, origY }
  const resizeRef          = useRef(null);        // resize: { stepId, startX, origW }
  const isPanningRef       = useRef(false);
  const connectingPortRef  = useRef(null);        // mirrors connectingPort (from/start coords only)
  const positionsRef       = useRef({});
  const sizesRef           = useRef({});
  const itemStepsRef       = useRef(item.steps);
  // createLinkRef is updated synchronously on every render (not via useEffect)
  // so the global mouseup handler always has access to the latest version.
  const createLinkRef      = useRef(null);

  // Keep refs in sync
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { sizesRef.current = sizes; }, [sizes]);
  useEffect(() => { itemStepsRef.current = item.steps; }, [item.steps]);

  // Sync workItem prop changes
  useEffect(() => {
    setItem(workItem);
    setTitleVal(workItem.title);
  }, [workItem.id]);

  // Fetch model catalog + current settings once on mount
  useEffect(() => {
    api.getModelCatalog?.().then((c) => { if (c) setCatalog(c); }).catch(() => {});
    api.getSettings?.().then((s)     => { if (s) setGlobalSettings(s); }).catch(() => {});
  }, []);

  const selectedStep = item.steps.find((s) => s.id === selectedStepId) || null;

  const patchStep = useCallback((stepId, patch) => {
    setItem((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    }));
  }, []);

  // ── Position initialization ──────────────────────────────────────────────────
  useEffect(() => {
    const steps = item.steps;
    setPositions((prev) => {
      const auto = computeAutoLayout(steps);
      const next = { ...prev };
      for (const [id, pos] of Object.entries(auto)) {
        if (!next[id]) next[id] = pos;   // only fill new steps; preserve manual positions
      }
      // Prune deleted steps
      for (const id of Object.keys(next)) {
        if (!steps.find((s) => s.id === id)) delete next[id];
      }
      return next;
    });
  }, [item.steps]);

  // ── Wheel zoom (non-passive) ──────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const rect    = el.getBoundingClientRect();
      const cx      = e.clientX - rect.left;
      const cy      = e.clientY - rect.top;
      const factor  = e.deltaY < 0 ? 1.1 : 0.909;
      const nz      = Math.min(2.5, Math.max(0.2, zoomRef.current * factor));
      const ratio   = nz / zoomRef.current;
      panRef.current = {
        x: cx - (cx - panRef.current.x) * ratio,
        y: cy - (cy - panRef.current.y) * ratio,
      };
      zoomRef.current = nz;
      setPan({ ...panRef.current });
      setZoom(nz);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (connectingPortRef.current) {
          setConnectingPort(null);
          connectingPortRef.current = null;
        } else {
          setSelectedStepId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Global mouse handlers (pan, node drag, resize, port connect) ─────────────
  useEffect(() => {
    const findNodeAtClient = (clientX, clientY) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const wx   = (clientX - rect.left - panRef.current.x) / zoomRef.current;
      const wy   = (clientY - rect.top  - panRef.current.y) / zoomRef.current;
      for (const step of itemStepsRef.current) {
        const pos = positionsRef.current[step.id];
        if (!pos) continue;
        const w   = sizesRef.current[step.id]?.w ?? NODE_W;
        const pad = 15; // generous hit box so releasing slightly outside a node still registers
        if (wx >= pos.x - pad && wx <= pos.x + w + pad && wy >= pos.y - pad && wy <= pos.y + NODE_H + pad) {
          return step;
        }
      }
      return null;
    };

    const handleMouseMove = (e) => {
      // Node drag
      if (dragRef.current) {
        const { stepId, startX, startY, origX, origY } = dragRef.current;
        const dx = (e.clientX - startX) / zoomRef.current;
        const dy = (e.clientY - startY) / zoomRef.current;
        setPositions((prev) => ({ ...prev, [stepId]: { x: origX + dx, y: origY + dy } }));
        return;
      }
      // Node resize
      if (resizeRef.current) {
        const { stepId, startX, origW } = resizeRef.current;
        const dx   = (e.clientX - startX) / zoomRef.current;
        const newW = Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, origW + dx));
        setSizes((prev) => ({ ...prev, [stepId]: { w: newW } }));
        sizesRef.current = { ...sizesRef.current, [stepId]: { w: newW } };
        return;
      }
      // Port connecting preview
      if (connectingPortRef.current) {
        const hover = findNodeAtClient(e.clientX, e.clientY);
        setConnectingPort((prev) =>
          prev
            ? {
                ...prev,
                curScreenX: e.clientX,
                curScreenY: e.clientY,
                hoverStepId:
                  hover && hover.id !== connectingPortRef.current.fromStepId
                    ? hover.id
                    : null,
              }
            : null
        );
        return;
      }
      // Canvas pan
      if (isPanningRef.current && panOriginRef.current) {
        const { startX, startY, origPanX, origPanY } = panOriginRef.current;
        const next = {
          x: origPanX + (e.clientX - startX),
          y: origPanY + (e.clientY - startY),
        };
        panRef.current = next;
        setPan(next);
      }
    };

    const handleMouseUp = (e) => {
      // Complete port connection
      if (connectingPortRef.current) {
        const hover = findNodeAtClient(e.clientX, e.clientY);
        if (hover && hover.id !== connectingPortRef.current.fromStepId) {
          createLinkRef.current?.(connectingPortRef.current.fromStepId, hover.id);
        }
        setConnectingPort(null);
        connectingPortRef.current = null;
      }
      // End all drag operations
      dragRef.current      = null;
      resizeRef.current    = null;
      isPanningRef.current = false;
      panOriginRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup',   handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup',   handleMouseUp);
    };
  }, []); // mounted once; reads all values via refs

  // ── Canvas background → start pan ────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e) => {
    isPanningRef.current = true;
    setIsPanning(true);
    panOriginRef.current = {
      startX: e.clientX, startY: e.clientY,
      origPanX: panRef.current.x, origPanY: panRef.current.y,
    };
  }, []);

  // ── Node body → start drag ────────────────────────────────────────────────────
  const handleNodeBodyMouseDown = useCallback((e, stepId) => {
    e.stopPropagation();
    const pos = positionsRef.current[stepId];
    if (!pos) return;
    dragRef.current = {
      stepId,
      startX: e.clientX, startY: e.clientY,
      origX: pos.x,      origY: pos.y,
    };
  }, []);

  // ── Resize handle → start resize ──────────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e, stepId, currentW) => {
    e.stopPropagation();
    resizeRef.current = { stepId, startX: e.clientX, origW: currentW };
  }, []);

  // ── Port → start connecting ───────────────────────────────────────────────────
  const handlePortMouseDown = useCallback((e, stepId, side = 'right') => {
    e.stopPropagation();
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const pos = positionsRef.current[stepId];
    if (!pos) return;
    const rect = canvasEl.getBoundingClientRect();
    const w    = sizesRef.current[stepId]?.w ?? NODE_W;
    // Map side → world-space port center
    const worldPt = {
      right:  { x: pos.x + w,      y: pos.y + NODE_H / 2 },
      left:   { x: pos.x,          y: pos.y + NODE_H / 2 },
      bottom: { x: pos.x + w / 2,  y: pos.y + NODE_H },
      top:    { x: pos.x + w / 2,  y: pos.y },
    }[side] || { x: pos.x + w, y: pos.y + NODE_H / 2 };
    const portSX = rect.left + worldPt.x * zoomRef.current + panRef.current.x;
    const portSY = rect.top  + worldPt.y * zoomRef.current + panRef.current.y;
    const init = {
      fromStepId: stepId,
      startScreenX: portSX, startScreenY: portSY,
      curScreenX: e.clientX, curScreenY: e.clientY,
      hoverStepId: null,
    };
    setConnectingPort(init);
    connectingPortRef.current = { fromStepId: stepId, startScreenX: portSX, startScreenY: portSY };
  }, []);

  // ── Fit to view ───────────────────────────────────────────────────────────────
  const handleFitView = useCallback(() => {
    const ids = Object.keys(positionsRef.current);
    if (ids.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const p = positionsRef.current[id];
      const w = sizesRef.current[id]?.w ?? NODE_W;
      minX = Math.min(minX, p.x);       minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + w);   maxY = Math.max(maxY, p.y + NODE_H);
    }
    const pad = 60;
    const el  = canvasRef.current;
    if (!el) return;
    const cw  = el.clientWidth,  ch = el.clientHeight;
    const nz  = Math.min(2.5, Math.max(0.2,
      Math.min(cw / (maxX - minX + pad * 2), ch / (maxY - minY + pad * 2))
    ));
    const newPan = {
      x: (cw - (maxX + minX) * nz) / 2,
      y: (ch - (maxY + minY) * nz) / 2,
    };
    zoomRef.current = nz;  panRef.current = newPan;
    setZoom(nz);           setPan(newPan);
  }, []);

  // ── Reset to auto layout ──────────────────────────────────────────────────────
  const handleResetLayout = useCallback(() => {
    const auto = computeAutoLayout(item.steps);
    positionsRef.current = auto;
    setPositions(auto);
  }, [item.steps]);

  // ── Zoom buttons ──────────────────────────────────────────────────────────────
  const adjustZoom = useCallback((dir) => {
    const factor = dir > 0 ? 1.2 : 0.85;
    const nz     = Math.min(2.5, Math.max(0.2, zoomRef.current * factor));
    const el     = canvasRef.current;
    if (el) {
      const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
      const ratio = nz / zoomRef.current;
      panRef.current = {
        x: cx - (cx - panRef.current.x) * ratio,
        y: cy - (cy - panRef.current.y) * ratio,
      };
      setPan({ ...panRef.current });
    }
    zoomRef.current = nz;
    setZoom(nz);
  }, []);

  // ── Create / remove step links ────────────────────────────────────────────────
  const createLink = useCallback(async (parentId, childId) => {
    // Guard: don't create circular links.
    // A cycle would form if parentId is already a descendant of childId.
    const isDescendant = (ancestorId, nodeId) => {
      if (ancestorId === nodeId) return true;
      const children = itemStepsRef.current.filter((s) => s.parentStepId === nodeId);
      return children.some((c) => isDescendant(ancestorId, c.id));
    };
    if (parentId === childId || isDescendant(parentId, childId)) return;
    patchStep(childId, { parentStepId: parentId });
    try {
      await api.updateWorkStep?.(item.id, childId, { parentStepId: parentId });
      const updated = await api.getWorkItem?.(item.id);
      if (updated) {
        setItem(updated);
        onItemUpdate(updated);
        // Reset positions so the child node moves to its auto-layout position (right of parent)
        const newPos = computeAutoLayout(updated.steps);
        setPositions(newPos);
        positionsRef.current = newPos;
      }
    } catch (err) { console.error(err); }
  }, [item.id, patchStep, onItemUpdate]);

  const removeLink = useCallback(async (stepId) => {
    patchStep(stepId, { parentStepId: null });
    try {
      await api.updateWorkStep?.(item.id, stepId, { parentStepId: null });
      const updated = await api.getWorkItem?.(item.id);
      if (updated) { setItem(updated); onItemUpdate(updated); }
    } catch (err) { console.error(err); }
  }, [item.id, patchStep, onItemUpdate]);

  // Update synchronously on every render so the global mouseup handler always
  // has a fresh reference. This avoids the useEffect timing race where
  // createLinkRef.current is still null when the first mouseup fires.
  createLinkRef.current = createLink;

  // ── Agent event subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    const cleanups = [
      api.onAgentTaskStart?.(({ taskId, _workStep }) => {
        if (!_workStep) return;
        setRunningTaskId(taskId);
        runningTaskIdRef.current = taskId;
      }),
      api.onAgentThinking?.(({ taskId, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        setResultVersion((v) => v + 1);
      }),
      api.onAgentToken?.(({ taskId, token, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        const sid = runningStepIdRef.current;
        if (!sid) return;
        const s = stepStreamRef.current[sid] || (stepStreamRef.current[sid] = {});
        s.streamText = (s.streamText || '') + token;
        setResultVersion((v) => v + 1);
      }),
      api.onAgentToolStart?.(({ taskId, id, name, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        const sid = runningStepIdRef.current;
        if (!sid) return;
        const s = stepStreamRef.current[sid] || (stepStreamRef.current[sid] = {});
        s.activeCalls = [...(s.activeCalls || []), { id, name, status: 'running' }];
        setResultVersion((v) => v + 1);
      }),
      api.onAgentToolEnd?.(({ taskId, id, success, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        const sid = runningStepIdRef.current;
        if (!sid) return;
        const s = stepStreamRef.current[sid] || (stepStreamRef.current[sid] = {});
        s.activeCalls = (s.activeCalls || []).map((c) =>
          c.id === id ? { ...c, status: success ? 'done' : 'error' } : c
        );
        setResultVersion((v) => v + 1);
      }),
      api.onAgentComplete?.(({ taskId, summary, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        const sid = runningStepIdRef.current;
        if (sid) {
          patchStep(sid, { status: 'done', result: summary, taskId: null });
          api.updateWorkStep?.(item.id, sid, { status: 'done', result: summary, taskId: null });
        }
        setIsRunning(false); setRunningStepId(null); setRunningTaskId(null);
        runningTaskIdRef.current = null;
        api.getWorkItem?.(item.id).then((u) => { if (u) { setItem(u); onItemUpdate(u); } }).catch(console.error);
      }),
      api.onAgentError?.(({ taskId, error, _workStep }) => {
        if (!_workStep || taskId !== runningTaskIdRef.current) return;
        const sid = runningStepIdRef.current;
        if (sid) {
          patchStep(sid, { status: 'error', result: error, taskId: null });
          api.updateWorkStep?.(item.id, sid, { status: 'error', result: error, taskId: null });
        }
        setIsRunning(false); setRunningStepId(null); setRunningTaskId(null);
        runningTaskIdRef.current = null;
      }),
    ].filter(Boolean);
    return () => cleanups.forEach((c) => typeof c === 'function' && c());
  }, [item.id, patchStep, onItemUpdate, setRunningStepId]);

  // ── CRUD actions ─────────────────────────────────────────────────────────────

  const handleRunStep = useCallback(async (stepId) => {
    if (isRunning) return;
    const sid = stepId || selectedStepId;
    if (!sid) return;
    stepStreamRef.current[sid] = { streamText: '', activeCalls: [] };
    setRunningStepId(sid);
    setIsRunning(true);
    setSelectedStepId(sid);
    patchStep(sid, { status: 'running' });
    try {
      const r = await api.runWorkStep(item.id, sid);
      if (r?.error) {
        patchStep(sid, { status: 'error', result: r.error });
        setIsRunning(false); setRunningStepId(null);
      }
    } catch (err) {
      patchStep(sid, { status: 'error', result: err.message });
      setIsRunning(false); setRunningStepId(null);
    }
  }, [isRunning, selectedStepId, item.id, patchStep, setRunningStepId]);

  const handleResetStep = useCallback(async (stepId) => {
    const sid = stepId || selectedStepId;
    if (!sid) return;
    stepStreamRef.current[sid] = {};
    patchStep(sid, { status: 'pending', result: null, taskId: null });
    try {
      const updated = await api.resetWorkStep(item.id, sid);
      if (updated) { setItem(updated); onItemUpdate(updated); }
    } catch (err) { console.error(err); }
  }, [selectedStepId, item.id, patchStep, onItemUpdate]);

  const handleAddStep = useCallback(async (parentStepId = null) => {
    try {
      const updated = await api.addWorkStep(item.id, {
        title: 'New Step', prompt: '', expectedOutput: '', parentStepId,
      });
      if (updated) {
        setItem(updated); onItemUpdate(updated);
        const newStep = updated.steps[updated.steps.length - 1];
        if (newStep) setSelectedStepId(newStep.id);
      }
    } catch (err) { console.error(err); }
  }, [item.id, onItemUpdate]);

  const handleDeleteStep = useCallback(async (stepId) => {
    const sid = stepId || selectedStepId;
    if (!sid) return;
    try {
      const updated = await api.deleteWorkStep(item.id, sid);
      if (updated) {
        setItem(updated); onItemUpdate(updated);
        if (selectedStepId === sid) {
          const rem = updated.steps.filter((s) => !s.parentStepId);
          setSelectedStepId(rem[0]?.id || null);
        }
      }
    } catch (err) { console.error(err); }
  }, [selectedStepId, item.id, onItemUpdate]);

  const handleUpdateStepField = useCallback(async (field, value) => {
    if (!selectedStepId) return;
    patchStep(selectedStepId, { [field]: value });
    try {
      await api.updateWorkStep?.(item.id, selectedStepId, { [field]: value });
    } catch (err) { console.error(err); }
  }, [selectedStepId, item.id, patchStep]);

  const handleSaveTitle = useCallback(async () => {
    setEditingTitle(false);
    if (titleVal.trim() === item.title) return;
    try {
      const updated = await api.saveWorkItem({ ...item, title: titleVal.trim() });
      if (updated) { setItem(updated); onItemUpdate(updated); }
    } catch (err) { console.error(err); }
  }, [titleVal, item, onItemUpdate]);

  const handleDeleteItem = useCallback(async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    try { await api.deleteWorkItem(item.id); onBack(); }
    catch (err) { console.error(err); }
  }, [deleteConfirm, item.id, onBack]);

  const handleAddResource = useCallback((resource) => {
    if (!selectedStep) return;
    handleUpdateStepField('resources', [...(selectedStep.resources || []), resource]);
  }, [selectedStep, handleUpdateStepField]);

  const handleRemoveResource = useCallback((idx) => {
    if (!selectedStep) return;
    handleUpdateStepField('resources', (selectedStep.resources || []).filter((_, i) => i !== idx));
  }, [selectedStep, handleUpdateStepField]);

  const itemStatusBadge = ITEM_STATUS_BADGE[item.status] || ITEM_STATUS_BADGE.todo;

  // Build sequential order numbers for display (root steps only)
  const sorted = [...item.steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stepNumbers = {};
  let rootCounter = 0;
  for (const step of sorted) {
    if (!step.parentStepId) { rootCounter++; stepNumbers[step.id] = rootCounter; }
    else {
      const parent = item.steps.find((s) => s.id === step.parentStepId);
      const pNum   = stepNumbers[step.parentStepId] || '?';
      const siblings = sorted.filter((s) => s.parentStepId === step.parentStepId);
      stepNumbers[step.id] = `${pNum}.${siblings.indexOf(step) + 1}`;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-0">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-3 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Back to chat"
        >
          <ArrowLeft size={15} />
        </button>

        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 input-field text-sm font-semibold"
            style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--input-border)' }}
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') { setEditingTitle(false); setTitleVal(item.title); }
            }}
          />
        ) : (
          <button
            className="flex-1 text-left text-sm font-semibold hover:text-accent transition-colors truncate flex items-center gap-1.5 group"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setEditingTitle(true)}
          >
            {item.title}
            <Edit3 size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}

        {item.jiraKey && (
          <a
            href={item.jiraUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded transition-colors shrink-0"
          >
            {item.jiraKey}
          </a>
        )}

        <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${itemStatusBadge.cls}`}>
          {itemStatusBadge.label}
        </span>

        {/* Global model indicator */}
        {globalSettings.model && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border shrink-0 truncate max-w-[140px]"
            style={{
              color: 'var(--text-tertiary)',
              borderColor: 'var(--input-border)',
              background: 'var(--input-bg)',
            }}
            title={`Global model: ${globalSettings.provider} / ${globalSettings.model}`}
          >
            {globalSettings.model}
          </span>
        )}

        <button
          onClick={() => handleAddStep(null)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors border border-surface-3 shrink-0"
        >
          <Plus size={12} /> Add Step
        </button>

        <button
          onClick={handleDeleteItem}
          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
            deleteConfirm
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'hover:bg-surface-2 text-zinc-600 hover:text-red-400'
          }`}
          title={deleteConfirm ? 'Click again to confirm' : 'Delete work item'}
          onBlur={() => setDeleteConfirm(false)}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* ── Canvas + Inspector ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Flow Canvas ── */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(71,85,105,0.22) 1px, transparent 1px)',
            backgroundSize:  '24px 24px',
            backgroundPosition: `${((pan.x % 24) + 24) % 24}px ${((pan.y % 24) + 24) % 24}px`,
            cursor: connectingPort ? 'crosshair' : isPanning ? 'grabbing' : 'grab',
          }}
          onMouseDown={handleCanvasMouseDown}
        >
          {/* Transformed world */}
          <div
            style={{
              transform:       `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position:        'absolute',
              left: 0, top: 0,
            }}
          >
            {/* Bezier edges */}
            <EdgesLayer
              steps={item.steps}
              positions={positions}
              sizes={sizes}
              runningStepId={runningStepId}
            />

            {/* Step nodes */}
            {item.steps.map((step) => {
              const pos = positions[step.id];
              if (!pos) return null;
              const w   = sizes[step.id]?.w ?? NODE_W;
              return (
                <StepNode
                  key={step.id}
                  step={step}
                  pos={pos}
                  stepNumber={stepNumbers[step.id] ?? '?'}
                  nodeW={w}
                  isSelected={selectedStepId === step.id}
                  isRunning={runningStepId === step.id}
                  isConnectTarget={connectingPort?.hoverStepId === step.id}
                  stream={stepStreamRef.current[step.id]}
                  resultVersion={resultVersion}
                  onSelect={setSelectedStepId}
                  onBodyMouseDown={(e) => handleNodeBodyMouseDown(e, step.id)}
                  onPortMouseDown={handlePortMouseDown}
                  onResizeMouseDown={handleResizeMouseDown}
                />
              );
            })}
          </div>

          {/* Empty state */}
          {item.steps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-3 pointer-events-auto">
                <Briefcase size={36} className="mx-auto text-zinc-700" />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No steps yet.</p>
                <button
                  onClick={() => handleAddStep(null)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/80 transition-colors"
                >
                  <Plus size={14} /> Add First Step
                </button>
              </div>
            </div>
          )}

          {/* Floating toolbar (bottom-right) */}
          <div className="absolute bottom-4 right-4 z-10 bg-surface-2 border border-surface-3 rounded-xl p-1 flex items-center gap-0.5 shadow-lg">
            <button
              onClick={() => adjustZoom(-1)}
              title="Zoom out (scroll to zoom)"
              className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[10px] tabular-nums w-9 text-center select-none" style={{ color: 'var(--text-tertiary)' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => adjustZoom(1)}
              title="Zoom in"
              className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ZoomIn size={13} />
            </button>
            <div className="w-px h-4 bg-surface-3 mx-0.5" />
            <button
              onClick={handleFitView}
              title="Fit all nodes to view"
              className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Maximize2 size={13} />
            </button>
            <button
              onClick={handleResetLayout}
              title="Reset to auto layout"
              className="p-1.5 rounded-lg hover:bg-surface-3 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <RefreshCcw size={13} />
            </button>
          </div>

          {/* Connecting hint */}
          {connectingPort && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-[10px] px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent pointer-events-none">
              {connectingPort.hoverStepId
                ? 'Release to connect →'
                : 'Drag to a step to connect it as a sub-step'}
            </div>
          )}
        </div>

        {/* ── Inspector Panel ── */}
        {selectedStep && (
          <InspectorPanel
            step={selectedStep}
            steps={item.steps}
            isRunning={isRunning}
            runningStepId={runningStepId}
            stream={stepStreamRef.current[selectedStep.id]}
            resultVersion={resultVersion}
            catalog={catalog}
            globalSettings={globalSettings}
            onRun={() => handleRunStep(selectedStep.id)}
            onReset={() => handleResetStep(selectedStep.id)}
            onAddSub={() => handleAddStep(selectedStep.id)}
            onDelete={() => handleDeleteStep(selectedStep.id)}
            onUpdateField={handleUpdateStepField}
            onAddResource={handleAddResource}
            onRemoveResource={handleRemoveResource}
            onUnlink={() => removeLink(selectedStep.id)}
            onClose={() => setSelectedStepId(null)}
          />
        )}
      </div>

      {/* Connecting overlay (fixed, full-screen) */}
      <ConnectingOverlay port={connectingPort} />
    </div>
  );
}
