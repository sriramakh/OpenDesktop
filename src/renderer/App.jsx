import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar        from './components/TitleBar';
import Sidebar         from './components/Sidebar';
import ChatPanel       from './components/ChatPanel';
import ContextPanel    from './components/ContextPanel';
import ApprovalDialog  from './components/ApprovalDialog';
import SettingsModal   from './components/SettingsModal';
import WorkMode        from './components/WorkMode';
import JiraImportModal from './components/JiraImportModal';

const api = window.api;

// Unique ID helper
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Apply theme to the document root (persisted in localStorage)
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('od-theme', theme);
}

export default function App() {
  const [messages,          setMessages]          = useState([]);
  const [activePersona,     setActivePersona]     = useState('auto');
  const [isProcessing,      setIsProcessing]      = useState(false);
  const [phaseLabel,        setPhaseLabel]        = useState('');
  const [approvalRequest,   setApprovalRequest]   = useState(null);
  const [contextData,       setContextData]       = useState(null);
  const [showSettings,      setShowSettings]      = useState(false);
  const [showContext,       setShowContext]        = useState(true);
  const [history,           setHistory]           = useState([]);
  const [tools,             setTools]             = useState([]);
  const [settings,          setSettings]          = useState(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [mcpServers,        setMCPServers]        = useState([]);
  const [theme,             setTheme]             = useState(() => localStorage.getItem('od-theme') || 'dark');

  // Work Mode state
  const [workItems,      setWorkItems]      = useState([]);
  const [activeWorkItem, setActiveWorkItem] = useState(null);
  const [showJiraImport, setShowJiraImport] = useState(false);

  // activeTaskId — the ID of the currently running task (for event correlation)
  const activeTaskIdRef = useRef(null);

  // Apply theme on mount and whenever it changes
  useEffect(() => { applyTheme(theme); }, [theme]);

  const handleThemeChange = useCallback((t) => { setTheme(t); }, []);

  const loadSettings = () => api?.getSettings().then(setSettings).catch(console.error);
  const refreshMCP   = () => api?.listMCPServers().then(setMCPServers).catch(console.error);

  // ── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    api?.listTools().then(setTools).catch(console.error);
    api?.getHistory(20).then(setHistory).catch(console.error);
    api?.getActiveContext().then(setContextData).catch(console.error);
    api?.listMCPServers().then(setMCPServers).catch(console.error);
    api?.listWorkItems?.().then(setWorkItems).catch(console.error);
    loadSettings();

    const interval = setInterval(() => {
      api?.getActiveContext().then(setContextData).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ── Agent event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return;

    // Helper to patch the last assistant message
    const patchLastAssistant = (taskId, patcher) => {
      setMessages((prev) => {
        const idx = prev.findLastIndex(
          (m) => m.role === 'assistant' && m.taskId === taskId
        );
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = patcher(updated[idx]);
        return updated;
      });
    };

    const cleanups = [

      // Server assigns the real taskId — patch the latest placeholder to adopt it
      api.onAgentTaskStart(({ taskId: serverTaskId, _workStep }) => {
        if (_workStep) return; // WorkMode handles work step events
        activeTaskIdRef.current = serverTaskId;
        setMessages((prev) => {
          // Find the last assistant placeholder that hasn't completed yet
          const idx = prev.findLastIndex(
            (m) => m.role === 'assistant' && !m.completed
          );
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], taskId: serverTaskId };
          return updated;
        });
      }),

      // LLM is starting a new reasoning turn
      api.onAgentThinking(({ taskId, turn, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => ({
          ...m,
          phase: 'thinking',
          turn,
          streamText: m.streamText || '',
        }));
      }),

      // Streaming text token
      api.onAgentToken(({ taskId, token, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => ({
          ...m,
          phase: 'streaming',
          streamText: (m.streamText || '') + token,
        }));
      }),

      // Tool calls announced (before execution)
      api.onAgentToolCalls(({ taskId, turn, calls, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => ({
          ...m,
          phase: 'tool-calls',
          activeCalls: calls.map((c) => ({
            ...c,
            status: 'pending',
            id: c.id || uid(),
          })),
        }));
      }),

      // A single tool started
      api.onAgentToolStart(({ taskId, id, name, input, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => ({
          ...m,
          activeCalls: (m.activeCalls || []).map((c) =>
            c.id === id || c.name === name
              ? { ...c, status: 'running' }
              : c
          ),
        }));
        setPhaseLabel(`Running ${name}...`);
      }),

      // A single tool finished
      api.onAgentToolEnd(({ taskId, id, name, success, error, outputPreview, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => ({
          ...m,
          activeCalls: (m.activeCalls || []).map((c) =>
            c.id === id || c.name === name
              ? { ...c, status: success ? 'done' : 'error', error, outputPreview }
              : c
          ),
        }));
      }),

      // Batch of tool results returned (a "turn" completed)
      api.onAgentToolResults(({ taskId, turn, results, _workStep }) => {
        if (_workStep) return;
        patchLastAssistant(taskId, (m) => {
          const completedTools = results.map((r) => ({
            id:      r.id,
            name:    r.name,
            success: !r.error,
            content: r.content,
            error:   r.error,
          }));
          return {
            ...m,
            phase: 'tool-results',
            toolHistory: [...(m.toolHistory || []), ...completedTools],
            activeCalls: [],
          };
        });
      }),

      // Phase updates (context-gathering, etc.)
      api.onAgentStepUpdate(({ taskId, phase, message: msg, _workStep }) => {
        if (_workStep) return;
        setPhaseLabel(msg || phase || '');
        if (taskId) {
          patchLastAssistant(taskId, (m) => ({ ...m, phase }));
        }
      }),

      // Approval request
      api.onApprovalRequest((data) => setApprovalRequest(data)),

      // Error
      api.onAgentError(({ taskId, error, _workStep }) => {
        if (_workStep) return;
        setIsProcessing(false);
        setPhaseLabel('');
        setMessages((prev) => {
          // Replace the placeholder if it exists
          const filtered = prev.filter((m) => !(m.role === 'assistant' && m.taskId === taskId && !m.completed));
          return [
            ...filtered,
            { role: 'error', content: error, taskId, timestamp: Date.now() },
          ];
        });
      }),

      // Task complete
      api.onAgentComplete(({ taskId, status, summary, steps, _workStep }) => {
        if (_workStep) return;
        setIsProcessing(false);
        setPhaseLabel('');
        setMessages((prev) => {
          const idx = prev.findLastIndex((m) => m.role === 'assistant' && m.taskId === taskId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              content:    summary,
              streamText: '',
              steps:      steps || [],
              status,
              completed:  true,
              phase:      'complete',
            };
            return updated;
          }
          return [
            ...prev,
            {
              role:       'assistant',
              content:    summary,
              steps:      steps || [],
              status,
              taskId,
              timestamp:  Date.now(),
              completed:  true,
              phase:      'complete',
            },
          ];
        });
        api?.getHistory(20).then(setHistory).catch(() => {});
      }),
    ];

    // Reminder fired — inject a system message into the chat
    const reminderCleanup = api.onReminderFired?.
      (({ message, firedAt }) => {
        setMessages((prev) => [
          ...prev,
          {
            role:      'reminder',
            content:   message,
            timestamp: firedAt || Date.now(),
            completed: true,
          },
        ]);
      });

    // Scheduler task completed — inject an amber card into the chat
    const schedulerCompleteCleanup = api.onSchedulerTaskComplete?.
      (({ task, result }) => {
        setMessages((prev) => [
          ...prev,
          {
            role:      'scheduler',
            content:   `Scheduled task "${task?.name || 'unknown'}" completed.${result ? '\n\n' + result : ''}`,
            taskName:  task?.name,
            timestamp: Date.now(),
            completed: true,
          },
        ]);
      });

    // Scheduler task error — inject an error card
    const schedulerErrorCleanup = api.onSchedulerTaskError?.
      (({ task, error }) => {
        setMessages((prev) => [
          ...prev,
          {
            role:      'error',
            content:   `Scheduled task "${task?.name || 'unknown'}" failed: ${error}`,
            timestamp: Date.now(),
          },
        ]);
      });

    return () => {
      cleanups.forEach((c) => c());
      if (typeof reminderCleanup === 'function') reminderCleanup();
      if (typeof schedulerCompleteCleanup === 'function') schedulerCompleteCleanup();
      if (typeof schedulerErrorCleanup === 'function') schedulerErrorCleanup();
    };
  }, []);

  // ── Send a message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (message, attachments) => {
      if (!message.trim() || isProcessing) return;

      const taskId = uid();
      activeTaskIdRef.current = taskId;

      const userMsg = {
        role: 'user',
        content: message.trim(),
        attachments: attachments || [],
        timestamp: Date.now(),
      };

      const placeholderMsg = {
        role:       'assistant',
        content:    '',
        streamText: '',
        taskId,
        timestamp:  Date.now(),
        completed:  false,
        phase:      'context',
        activeCalls: [],
        toolHistory: [],
        steps:      [],
      };

      setSelectedHistoryId(null);
      setMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setIsProcessing(true);
      setPhaseLabel('Gathering context...');

      try {
        const result = await api.sendMessage(message.trim(), activePersona, attachments || []);
        if (result?.error) {
          setIsProcessing(false);
          setPhaseLabel('');
          setMessages((prev) => [
            ...prev.filter((m) => !(m.role === 'assistant' && m.taskId === taskId && !m.completed)),
            { role: 'error', content: result.error, timestamp: Date.now() },
          ]);
        }
      } catch (err) {
        setIsProcessing(false);
        setPhaseLabel('');
        setMessages((prev) => [
          ...prev.filter((m) => !(m.role === 'assistant' && m.taskId === taskId && !m.completed)),
          { role: 'error', content: err.message, timestamp: Date.now() },
        ]);
      }
    },
    [isProcessing, activePersona]
  );

  const handleCancel = useCallback(() => {
    api?.cancelTask();
    setIsProcessing(false);
    setPhaseLabel('');
  }, []);

  // ── Work Mode handlers ───────────────────────────────────────────────────────
  const handleSelectWorkItem = useCallback((item) => {
    setActiveWorkItem(item);
  }, []);

  const handleBackFromWork = useCallback(() => {
    setActiveWorkItem(null);
    api?.listWorkItems?.().then(setWorkItems).catch(console.error);
  }, []);

  const handleNewWorkItem = useCallback(async () => {
    try {
      const w = await api.saveWorkItem({
        title: 'New Work Item',
        description: '',
        status: 'todo',
        steps: [],
        tags: [],
        jiraKey: null,
      });
      setWorkItems((prev) => [w, ...prev.filter((x) => x.id !== w.id)]);
      setActiveWorkItem(w);
    } catch (err) {
      console.error('Failed to create work item:', err);
    }
  }, []);

  const handleWorkItemUpdate = useCallback((updated) => {
    setWorkItems((prev) => prev.map((wi) => wi.id === updated.id ? updated : wi));
    setActiveWorkItem(updated);
  }, []);

  const handleImportJira = useCallback(() => {
    setShowJiraImport(true);
  }, []);

  const handleJiraImportSubmit = useCallback(async (key) => {
    try {
      const r = await api.importJiraTicket(key);
      if (r.error) return r.error;
      setWorkItems((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
      setActiveWorkItem(r);
      setShowJiraImport(false);
      return null;
    } catch (err) {
      return err.message;
    }
  }, []);

  const handleApproval = useCallback((requestId, approved, note) => {
    api?.approvalResponse(requestId, approved, note);
    setApprovalRequest(null);
  }, []);

  const handleNewSession = useCallback(() => {
    api?.newSession();
    setMessages([]);
    setSelectedHistoryId(null);
  }, []);

  // Restore a past session from history — reconstruct messages from stored query + summary
  const handleSelectHistory = useCallback((item) => {
    if (isProcessing) return;
    setSelectedHistoryId(item.id);
    api?.newSession();

    const restored = [
      {
        role:      'user',
        content:   item.query,
        timestamp: item.timestamp,
      },
      {
        role:       'assistant',
        content:    item.summary || '(no summary recorded)',
        taskId:     item.id,
        timestamp:  item.timestamp,
        completed:  true,
        status:     item.status,
        phase:      'complete',
        steps:      [],
        toolHistory: [],
        activeCalls: [],
        streamText:  '',
        _isHistoryReplay: true,
      },
    ];
    setMessages(restored);
  }, [isProcessing]);

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <TitleBar onSettings={() => setShowSettings(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activePersona={activePersona}
          onPersonaChange={setActivePersona}
          history={history}
          selectedHistoryId={selectedHistoryId}
          onSelectHistory={handleSelectHistory}
          tools={tools}
          mcpServers={mcpServers}
          showContext={showContext}
          onToggleContext={() => setShowContext(!showContext)}
          onNewSession={handleNewSession}
          workItems={workItems}
          selectedWorkItemId={activeWorkItem?.id || null}
          onSelectWorkItem={handleSelectWorkItem}
          onNewWorkItem={handleNewWorkItem}
          onImportJira={handleImportJira}
        />

        {activeWorkItem ? (
          <WorkMode
            workItem={activeWorkItem}
            onBack={handleBackFromWork}
            onItemUpdate={handleWorkItemUpdate}
          />
        ) : (
          <ChatPanel
            messages={messages}
            isProcessing={isProcessing}
            phaseLabel={phaseLabel}
            onSend={handleSend}
            onCancel={handleCancel}
            activePersona={activePersona}
            settings={settings}
            isHistoryReplay={selectedHistoryId !== null}
            onSettingsChange={loadSettings}
          />
        )}

        {!activeWorkItem && showContext && <ContextPanel contextData={contextData} tools={tools} />}
      </div>

      {approvalRequest && (
        <ApprovalDialog
          request={approvalRequest}
          onApprove={(note) => handleApproval(approvalRequest.requestId, true, note)}
          onDeny={(note)    => handleApproval(approvalRequest.requestId, false, note)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => { setShowSettings(false); loadSettings(); refreshMCP(); }}
          theme={theme}
          onThemeChange={handleThemeChange}
        />
      )}

      {showJiraImport && (
        <JiraImportModal
          onSubmit={handleJiraImportSubmit}
          onClose={() => setShowJiraImport(false)}
        />
      )}
    </div>
  );
}
