import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import ContextPanel from './components/ContextPanel';
import ApprovalDialog from './components/ApprovalDialog';
import SettingsModal from './components/SettingsModal';

const api = window.api;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [activePersona, setActivePersona] = useState('planner');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSteps, setCurrentSteps] = useState(null);
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [contextData, setContextData] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(true);
  const [history, setHistory] = useState([]);
  const [tools, setTools] = useState([]);

  // Load initial data
  useEffect(() => {
    api?.listTools().then(setTools).catch(console.error);
    api?.getHistory(20).then(setHistory).catch(console.error);
    api?.getActiveContext().then(setContextData).catch(console.error);

    // Refresh context periodically
    const interval = setInterval(() => {
      api?.getActiveContext().then(setContextData).catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Agent event listeners
  useEffect(() => {
    if (!api) return;

    const cleanups = [
      api.onAgentStream((data) => {
        if (data.type === 'step-result') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.taskId === data.taskId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  stepResults: [...(last.stepResults || []), data],
                },
              ];
            }
            return prev;
          });
        }
      }),

      api.onAgentStepUpdate((data) => {
        setCurrentSteps(data);
      }),

      api.onApprovalRequest((data) => {
        setApprovalRequest(data);
      }),

      api.onAgentError((data) => {
        setIsProcessing(false);
        setCurrentSteps(null);
        setMessages((prev) => [
          ...prev,
          {
            role: 'error',
            content: data.error,
            taskId: data.taskId,
            timestamp: Date.now(),
          },
        ]);
      }),

      api.onAgentComplete((data) => {
        setIsProcessing(false);
        setCurrentSteps(null);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.taskId === data.taskId) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: data.summary,
                steps: data.steps,
                status: data.status,
                completed: true,
              },
            ];
          }
          return [
            ...prev,
            {
              role: 'assistant',
              content: data.summary,
              steps: data.steps,
              status: data.status,
              taskId: data.taskId,
              timestamp: Date.now(),
              completed: true,
            },
          ];
        });
        // Refresh history
        api.getHistory(20).then(setHistory).catch(() => {});
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const handleSend = useCallback(
    async (message) => {
      if (!message.trim() || isProcessing) return;

      const userMsg = {
        role: 'user',
        content: message.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);

      // Add a placeholder assistant message
      const placeholderTaskId = `pending_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          taskId: placeholderTaskId,
          timestamp: Date.now(),
          completed: false,
          stepResults: [],
        },
      ]);

      try {
        const result = await api.sendMessage(message.trim(), activePersona);
        if (result?.error) {
          setMessages((prev) => [
            ...prev.filter((m) => m.taskId !== placeholderTaskId),
            {
              role: 'error',
              content: result.error,
              timestamp: Date.now(),
            },
          ]);
          setIsProcessing(false);
        }
      } catch (err) {
        setIsProcessing(false);
        setMessages((prev) => [
          ...prev.filter((m) => m.taskId !== placeholderTaskId),
          {
            role: 'error',
            content: err.message,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [isProcessing, activePersona]
  );

  const handleCancel = useCallback(() => {
    api?.cancelTask();
    setIsProcessing(false);
    setCurrentSteps(null);
  }, []);

  const handleApproval = useCallback((requestId, approved, note) => {
    api?.approvalResponse(requestId, approved, note);
    setApprovalRequest(null);
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
        />

        <ChatPanel
          messages={messages}
          isProcessing={isProcessing}
          currentSteps={currentSteps}
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
          onDeny={(note) => handleApproval(approvalRequest.requestId, false, note)}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
