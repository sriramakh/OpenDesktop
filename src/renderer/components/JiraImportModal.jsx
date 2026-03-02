import React, { useState, useRef, useEffect } from 'react';
import { X, Import, Loader2, AlertCircle } from 'lucide-react';

/**
 * JiraImportModal — overlay for importing a Jira ticket by issue key.
 * Props:
 *   onSubmit(key) → Promise<errorString|null>
 *   onClose()
 */
export default function JiraImportModal({ onSubmit, onClose }) {
  const [issueKey, setIssueKey] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const key = issueKey.trim().toUpperCase();
    if (!key) return;

    setLoading(true);
    setError(null);

    const err = await onSubmit(key);
    if (err) {
      setError(err);
      setLoading(false);
    }
    // On success, onSubmit closes the modal via setShowJiraImport(false)
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Import size={18} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">Import from Jira</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Enter a Jira issue key to create a work item.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1.5">
              Issue Key
            </label>
            <input
              ref={inputRef}
              className="input-field w-full text-sm font-mono"
              placeholder="e.g. PROJ-123"
              value={issueKey}
              onChange={(e) => { setIssueKey(e.target.value); setError(null); }}
              disabled={loading}
              spellCheck={false}
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Requires Jira credentials set in Settings → API Keys.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!issueKey.trim() || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-amber-500 text-white font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={12} className="animate-spin" /> Importing...</>
                : <><Import size={12} /> Import</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
