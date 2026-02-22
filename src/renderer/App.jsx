import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar       from './components/TitleBar';
import Sidebar        from './components/Sidebar';
import ChatPanel      from './components/ChatPanel';
import ContextPanel   from './components/ContextPanel';
import ApprovalDialog from './components/ApprovalDialog';
import SettingsModal  from './components/SettingsModal';

const api = window.api;

// Unique ID helper
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [messages,       setMessages]       = useState([]);
  const [activePersona,  setActivePersona]  = useState('auto');
  const [isProcessing,   setIsProcessing]   = useState(false);
  const [phaseLabel,     setPhaseLabel]     = useState('');
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [contextData,    setContextData]    = useState(null);
  const [showSettings,   setShowSettings]   = useState(false);
  const [showContext,    setShowContext]     = useState(true);
  const [history,        setHistory]        = useState([]);
  const [tools,          setTools]          = useState([]);

  // activeTaskId — the ID of the currently running task (for event correlation)
  const activeTaskIdRef = useRef(null);

  // ── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    api?.listTools().then(setTools).catch(console.error);
    api?.getHistory(20).then(setHistory).catch(console.error);
    api?.getActiveContext().then(setContextData).catch(console.error);

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

      // LLM is starting a new reasoning turn
      api.onAgentThinking(({ taskId, turn }) => {
        patchLastAssistant(taskId, (m) => ({
          ...m,
          phase: 'thinking',
          turn,
          streamText: m.streamText || '',
        }));
      }),

      // Streaming text token
      api.onAgentToken(({ taskId, token }) => {
        patchLastAssistant(taskId, (m) => ({
          ...m,
          phase: 'streaming',
          streamText: (m.streamText || '') + token,
        }));
      }),

      // Tool calls announced (before execution)
      api.onAgentToolCalls(({ taskId, turn, calls }) => {
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
      api.onAgentToolStart(({ taskId, id, name, input }) => {
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
      api.onAgentToolEnd(({ taskId, id, name, success, error, outputPreview }) => {
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
      api.onAgentToolResults(({ taskId, turn, results }) => {
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
      api.onAgentStepUpdate(({ taskId, phase, message: msg }) => {
        setPhaseLabel(msg || phase || '');
        if (taskId) {
          patchLastAssistant(taskId, (m) => ({ ...m, phase }));
        }
      }),

      // Approval request
      api.onApprovalRequest((data) => setApprovalRequest(data)),

      // Error
      api.onAgentError(({ taskId, error }) => {
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
      api.onAgentComplete(({ taskId, status, summary, steps }) => {
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

    return () => cleanups.forEach((c) => c());
  }, []);

  // ── Send a message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (message) => {
      if (!message.trim() || isProcessing) return;

      const taskId = uid();
      activeTaskIdRef.current = taskId;

      const userMsg = { role: 'user', content: message.trim(), timestamp: Date.now() };

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

      setMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setIsProcessing(true);
      setPhaseLabel('Gathering context...');

      try {
        const result = await api.sendMessage(message.trim(), activePersona);
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

  const handleApproval = useCallback((requestId, approved, note) => {
    api?.approvalResponse(requestId, approved, note);
    setApprovalRequest(null);
  }, []);

  const handleNewSession = useCallback(() => {
    api?.newSession();
    setMessages([]);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <TitleBar onSettings={() => setShowSettings(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activePersona={activePersona}
          onPersonaChange={setActivePersona}
          history={history}
          tools={tools}
          showContext={showContext}
          onToggleContext={() => setShowContext(!showContext)}
          onNewSession={handleNewSession}
        />

        <ChatPanel
          messages={messages}
          isProcessing={isProcessing}
          phaseLabel={phaseLabel}
          onSend={handleSend}
          onCancel={handleCancel}
          activePersona={activePersona}
        />

        {showContext && <ContextPanel contextData={contextData} tools={tools} />}
      </div>

      {approvalRequest && (
        <ApprovalDialog
          request={approvalRequest}
          onApprove={(note) => handleApproval(approvalRequest.requestId, true, note)}
          onDeny={(note)    => handleApproval(approvalRequest.requestId, false, note)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
