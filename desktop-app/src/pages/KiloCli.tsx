import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kiloCancel, kiloListWorkflows, kiloRun, kiloSendInput, kiloStreamNdjson, kiloRecordResponse, StreamMessage, WorkflowSchema, ConversationMessage, ConversationContext } from "../services/kiloCli";
import { Terminal } from "../components/Terminal";
import { CommandPalette } from "../components/CommandPalette";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";
import { useMemoryStore, detectImportantContent } from "../stores/memoryStore";
import { MemoryPanel, MemoryContextMenu, MemorySaveDialog, MemoryButton, useMemoryTextSelection } from "../components/MemoryPanel";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";
const LS_KEY = "smartspec.kilo.history.v1";

type HistoryItem = { command: string; ts: number };

type Tab = {
  id: string;
  title: string;
  command: string;
  jobId: string;
  status: string;
  lines: string[];
  lastSeq: number;
  isWaiting: boolean;
  // Context management
  sessionId: string;
  conversationHistory: ConversationMessage[];
  contextUsagePercent: number;
};

export default function KiloCliPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [workflowSchemas, setWorkflowSchemas] = useState<WorkflowSchema[]>([]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [stdin, setStdin] = useState<string>("");

  // Multi-tab state
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");

  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");

  // Use shared memory store
  const {
    project,
    memories: projectMemories,
    initProject,
    getRelevantMemories,
    extractMemories,
    openMemoryDialog,
    setContextMenuPos,
  } = useMemoryStore();

  // Use shared text selection hook
  const { handleTextSelection, handleContextMenu } = useMemoryTextSelection();

  const history: HistoryItem[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const appendToTab = useCallback((tabId: string, text: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, lines: [...t.lines, text] } : t));
  }, []);

  async function refreshWorkflows() {
    if (!workspace) {
      console.log("⚠️ No workspace set");
      return;
    }
    console.log("🔄 Refreshing workflows for:", workspace);
    try {
      const res = await kiloListWorkflows(workspace);
      console.log("✅ Got workflows:", res);
      setWorkflows(res.workflows || []);
      setWorkflowSchemas(res.schemas || []);
    } catch (err) {
      console.error("❌ Error refreshing workflows:", err);
      setWorkflows([]);
      setWorkflowSchemas([]);
    }
  }

  useEffect(() => {
    const initToken = async () => {
      await loadProxyToken();
      setTokenHint(getProxyTokenHint());
    };
    initToken();
  }, []);

  useEffect(() => {
    refreshWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  // Initialize project when workspace changes (using shared store)
  useEffect(() => {
    if (workspace) {
      initProject(workspace);
    }
  }, [workspace, initProject]);

  useEffect(() => {
    return () => {
      // Cleanup all abort controllers
      abortRefs.current.forEach(ac => {
        try { ac.abort(); } catch {}
      });
    };
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenuPos(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [setContextMenuPos]);

  const onSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    console.log("💾 Saving token:", token.substring(0, 10) + "...");
    await setProxyToken(token);
    setTokenInput("");
    setTokenHint(getProxyTokenHint());
    alert("Saved proxy token locally (OS keychain when available).");
  };

  function saveHistory(cmd: string) {
    const item: HistoryItem = { command: cmd, ts: Date.now() };
    const next = [item, ...history].slice(0, 50);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  async function connectStream(tabId: string, jobId: string, from: number) {
    // Abort existing stream for this tab
    const existingAc = abortRefs.current.get(tabId);
    if (existingAc) {
      try { existingAc.abort(); } catch {}
    }

    const ac = new AbortController();
    abortRefs.current.set(tabId, ac);

    await kiloStreamNdjson(
      jobId,
      from,
      (m: StreamMessage) => {
        if (m.type === "stdout") {
          updateTab(tabId, { lastSeq: m.seq });
          const text = m.data || m.line || "";
          appendToTab(tabId, text);
        } else if (m.type === "status" || m.type === "done") {
          updateTab(tabId, { 
            status: m.status || "done", 
            isWaiting: false 
          });
          appendToTab(tabId, `\n[done] status=${m.status} rc=${m.returncode}\n`);
        } else if (m.type === "error") {
          updateTab(tabId, { status: "error", isWaiting: false });
          appendToTab(tabId, `\n[error] ${m.message}\n`);
        }
      },
      ac.signal
    );
  }

  // Connect to stream and collect response content for history
  async function connectStreamWithResponse(
    tabId: string, 
    jobId: string, 
    from: number,
    onComplete: (content: string) => void
  ) {
    const existingAc = abortRefs.current.get(tabId);
    if (existingAc) {
      try { existingAc.abort(); } catch {}
    }

    const ac = new AbortController();
    abortRefs.current.set(tabId, ac);

    let collectedContent = '';

    await kiloStreamNdjson(
      jobId,
      from,
      (m: StreamMessage) => {
        if (m.type === "stdout") {
          updateTab(tabId, { lastSeq: m.seq });
          const text = m.data || m.line || "";
          appendToTab(tabId, text);
          // Collect content for history (limit to prevent huge history)
          if (collectedContent.length < 50000) {
            collectedContent += text;
          }
        } else if (m.type === "status" || m.type === "done") {
          updateTab(tabId, { 
            status: m.status || "done", 
            isWaiting: false 
          });
          appendToTab(tabId, `\n[done] status=${m.status} rc=${m.returncode}\n`);
          // Call completion callback with collected content
          onComplete(collectedContent.trim());
        } else if (m.type === "error") {
          updateTab(tabId, { status: "error", isWaiting: false });
          appendToTab(tabId, `\n[error] ${m.message}\n`);
          onComplete(collectedContent.trim());
        }
      },
      ac.signal
    );
  }

  // Run in active tab (continue context) or create new tab if none exists
  async function runInActiveTab(planOnly = false) {
    if (!workspace) {
      alert("Please set workspace path");
      return;
    }
    if (!command) {
      alert("Please enter a command");
      return;
    }

    const cmd = planOnly ? `${command} --plan-only` : command;
    saveHistory(cmd);

    // If no active tab, create one first
    if (!activeTab) {
      await runInNewTab(planOnly);
      return;
    }

    const tabId = activeTab.id;
    
    // Update tab status
    updateTab(tabId, { status: "starting", isWaiting: true });
    setCommand(""); // Clear for next command

    // Add user message to conversation history
    const userMessage: ConversationMessage = {
      role: "user",
      content: cmd,
      timestamp: Date.now()
    };
    const updatedHistory = [...activeTab.conversationHistory, userMessage];
    updateTab(tabId, { conversationHistory: updatedHistory });

    // Add separator and new command header
    const contextInfo = activeTab.contextUsagePercent > 0 
      ? `📊 Context: ${activeTab.contextUsagePercent.toFixed(1)}%\n` 
      : '';
    const header = [
      `\n${"─".repeat(80)}\n`,
      `📝 Command: ${cmd}\n`,
      `⏰ Time: ${new Date().toLocaleString('th-TH')}\n`,
      contextInfo,
      `${"─".repeat(80)}\n\n`,
      `⏳ Processing... please wait\n\n`
    ];
    
    header.forEach(line => appendToTab(tabId, line));

    try {
      // Fetch relevant long-term memories if context is getting low
      let memoryContext = '';
      if (project?.id && activeTab.contextUsagePercent < 50) {
        try {
          const { context: memCtx } = await getRelevantMemories(cmd, { limit: 3 });
          if (memCtx) {
            memoryContext = memCtx;
          }
        } catch (memErr) {
          console.warn('Failed to retrieve memories:', memErr);
        }
      }

      // Build context for API call
      const context: ConversationContext = {
        sessionId: activeTab.sessionId,
        recentMessages: updatedHistory.slice(-10), // Keep last 10 messages
        summary: memoryContext || undefined  // Include memory context
      };

      const res = await kiloRun(workspace, cmd, context);
      console.log("✅ Got jobId:", res.jobId, "sessionId:", res.sessionId);
      
      // Update session ID and context info
      updateTab(tabId, { 
        jobId: res.jobId, 
        status: "running", 
        command: cmd,
        sessionId: res.sessionId || activeTab.sessionId,
        contextUsagePercent: res.contextInfo?.usagePercent || activeTab.contextUsagePercent
      });

      // Connect to stream and collect response
      let responseContent = '';
      await connectStreamWithResponse(tabId, res.jobId, 0, (content) => {
        responseContent = content;
      });

      // Record assistant response in history
      if (responseContent) {
        const assistantMessage: ConversationMessage = {
          role: "assistant",
          content: responseContent,
          timestamp: Date.now()
        };
        const newHistory = [...updatedHistory, assistantMessage];
        updateTab(tabId, { 
          conversationHistory: newHistory 
        });
        // Also record on backend
        await kiloRecordResponse(res.jobId, responseContent).catch(console.warn);
        
        // Extract memories periodically (every 5 messages or when response is substantial)
        if (project?.id && (newHistory.length % 5 === 0 || responseContent.length > 500)) {
          try {
            const recentConvo = newHistory.slice(-6); // Last 3 exchanges
            await extractMemories(recentConvo, activeTab.sessionId);
          } catch (memErr) {
            console.warn('Failed to extract memories:', memErr);
          }
        }
        
        // Check for important content and suggest saving
        const detected = detectImportantContent(responseContent);
        if (detected && detected.importance >= 8) {
          // High importance content - suggest saving
          setTimeout(() => {
            openMemoryDialog(responseContent.substring(0, 1000), true);
          }, 500);
        }
      }
    } catch (err) {
      console.error("❌ Error running workflow:", err);
      updateTab(tabId, { status: "error", isWaiting: false });
      appendToTab(tabId, `\n❌ Error: ${err}\n`);
    }
  }

  // Run in new tab (fresh context)
  async function runInNewTab(planOnly = false) {
    if (!workspace) {
      alert("Please set workspace path");
      return;
    }
    if (!command) {
      alert("Please enter a command");
      return;
    }

    const cmd = planOnly ? `${command} --plan-only` : command;
    saveHistory(cmd);

    // Create new tab with fresh session
    const tabId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const tabTitle = cmd.length > 30 ? cmd.substring(0, 27) + "..." : cmd;
    
    // Initial user message for history
    const initialHistory: ConversationMessage[] = [{
      role: "user",
      content: cmd,
      timestamp: Date.now()
    }];
    
    const newTab: Tab = {
      id: tabId,
      title: tabTitle,
      command: cmd,
      jobId: "",
      status: "starting",
      lines: [],
      lastSeq: 0,
      isWaiting: true,
      sessionId: "",  // Will be set from API response
      conversationHistory: initialHistory,
      contextUsagePercent: 0,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
    setCommand(""); // Clear for next command

    // Add header to tab
    const header = [
      `\n${"=".repeat(80)}\n`,
      `📝 Command: ${cmd}\n`,
      `⏰ Time: ${new Date().toLocaleString('th-TH')}\n`,
      `📁 Workspace: ${workspace}\n`,
      `🆕 New Session (fresh context)\n`,
      `${"=".repeat(80)}\n\n`,
      `⏳ Starting workflow... please wait\n\n`
    ];
    
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, lines: header } : t));

    try {
      // Fetch relevant long-term memories for the command
      let memoryContext = '';
      if (project?.id) {
        try {
          const { context } = await getRelevantMemories(cmd, { limit: 5 });
          if (context) {
            memoryContext = context;
            appendToTab(tabId, `🧠 Retrieved ${context.split('\n').length} relevant memories from project history\n\n`);
          }
        } catch (memErr) {
          console.warn('Failed to retrieve memories:', memErr);
        }
      }

      // Build context with long-term memory
      const context: ConversationContext = {
        recentMessages: initialHistory,
        summary: memoryContext || undefined  // Include memory context as summary
      };

      const res = await kiloRun(workspace, cmd, context);
      console.log("✅ Got jobId:", res.jobId, "sessionId:", res.sessionId);
      
      updateTab(tabId, { 
        jobId: res.jobId, 
        status: "running",
        sessionId: res.sessionId || "",
        contextUsagePercent: res.contextInfo?.usagePercent || 0
      });

      // Connect to stream and collect response
      let responseContent = '';
      await connectStreamWithResponse(tabId, res.jobId, 0, (content) => {
        responseContent = content;
      });

      // Record assistant response in history
      if (responseContent) {
        const assistantMessage: ConversationMessage = {
          role: "assistant",
          content: responseContent,
          timestamp: Date.now()
        };
        updateTab(tabId, { 
          conversationHistory: [...initialHistory, assistantMessage] 
        });
        // Also record on backend
        await kiloRecordResponse(res.jobId, responseContent).catch(console.warn);
        
        // Extract and save important memories from this conversation
        if (project?.id && responseContent.length > 100) {
          try {
            await extractMemories([...initialHistory, assistantMessage], tabId);
          } catch (memErr) {
            console.warn('Failed to extract memories:', memErr);
          }
        }
      }
    } catch (err) {
      console.error("❌ Error running workflow:", err);
      updateTab(tabId, { status: "error", isWaiting: false });
      appendToTab(tabId, `\n❌ Error: ${err}\n`);
    }
  }

  async function reconnect() {
    if (!activeTab || !activeTab.jobId) return;
    updateTab(activeTab.id, { status: "reconnecting" });
    await connectStream(activeTab.id, activeTab.jobId, activeTab.lastSeq);
    updateTab(activeTab.id, { status: "running" });
  }

  async function cancel() {
    if (!activeTab || !activeTab.jobId) return;
    await kiloCancel(activeTab.jobId);
    updateTab(activeTab.id, { status: "cancelled", isWaiting: false });
    
    const ac = abortRefs.current.get(activeTab.id);
    if (ac) {
      try { ac.abort(); } catch {}
    }
    
    appendToTab(activeTab.id, "\n[cancel requested]\n");
  }

  async function sendInput() {
    if (!activeTab || !activeTab.jobId || !stdin.trim()) return;
    const text = stdin;
    setStdin("");
    appendToTab(activeTab.id, `\n> ${text}\n`);
    await kiloSendInput(activeTab.jobId, text);
  }

  function closeTab(tabId: string) {
    // Abort stream
    const ac = abortRefs.current.get(tabId);
    if (ac) {
      try { ac.abort(); } catch {}
      abortRefs.current.delete(tabId);
    }

    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      // If closing active tab, switch to another
      if (tabId === activeTabId && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId("");
      }
      return newTabs;
    });
  }

  function clearActiveTab() {
    if (!activeTab) return;
    updateTab(activeTab.id, { lines: [] });
  }

  function createEmptyTab() {
    const tabId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const newTab: Tab = {
      id: tabId,
      title: "New Tab",
      command: "",
      jobId: "",
      status: "idle",
      lines: [],
      lastSeq: 0,
      isWaiting: false,
      sessionId: "",
      conversationHistory: [],
      contextUsagePercent: 0,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);
  }

  const getStatusColor = (status: string) => {
    if (status === "running" || status === "starting") return "#10b981";
    if (status === "done" || status === "completed") return "#3b82f6";
    if (status === "error") return "#ef4444";
    if (status === "cancelled") return "#f59e0b";
    if (status === "idle") return "#6b7280";
    return "#6b7280";
  };

  const getStatusIcon = (status: string) => {
    if (status === "starting") return "⏳";
    if (status === "running") return "⚡";
    if (status === "reconnecting") return "🔄";
    if (status === "done" || status === "completed") return "✅";
    if (status === "error") return "❌";
    if (status === "cancelled") return "⏹️";
    if (status === "idle") return "○";
    return "○";
  };

  const buttonStyle = {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500 as const,
    transition: "all 0.2s",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    background: "#3b82f6",
    color: "#ffffff",
    border: "1px solid #2563eb",
  };

  const successButtonStyle = {
    ...buttonStyle,
    background: "#10b981",
    color: "#ffffff",
    border: "1px solid #059669",
  };

  const dangerButtonStyle = {
    ...buttonStyle,
    background: "#ef4444",
    color: "#ffffff",
    border: "1px solid #dc2626",
  };

  const disabledButtonStyle = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: "not-allowed",
  };

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
  };

  // Check if active tab is waiting
  const isActiveTabWaiting = activeTab?.isWaiting || false;

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "#111827" }}>CLI (Terminal)</h2>
        <MemoryButton />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Proxy token</label>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={tokenHint ? `saved (${tokenHint})` : "paste dev-token-smartspec-2026"}
            style={{ ...inputStyle, minWidth: 320 }}
            type="password"
          />
          <button
            onClick={onSaveToken}
            disabled={!tokenInput.trim()}
            style={tokenInput.trim() ? primaryButtonStyle : buttonStyle}
          >
            Save Token
          </button>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            (required for Kilo CLI API access)
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.9, fontWeight: 500 }}>Workspace</label>
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="/path/to/workspace"
            style={{ ...inputStyle, minWidth: 520 }}
          />
        </div>

        {/* Active Tab Info */}
        {activeTab && (
          <div style={{
            fontSize: 12,
            padding: "12px",
            background: "#f9fafb",
            borderRadius: "8px",
            border: "1px solid #e5e7eb"
          }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <strong>Job ID:</strong> <span style={{ fontFamily: "monospace", color: "#6366f1" }}>{activeTab.jobId || "-"}</span>
              </div>
              <div>
                <strong>Status:</strong>{" "}
                <span style={{ fontFamily: "monospace", color: getStatusColor(activeTab.status) }}>
                  {getStatusIcon(activeTab.status)} {activeTab.status}
                  {isActiveTabWaiting && " (กำลังประมวลผล...)"}
                </span>
              </div>
              <div>
                <strong>Last Seq:</strong> <span style={{ fontFamily: "monospace" }}>{activeTab.lastSeq}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              💡 <strong>Natural language supported:</strong> พิมพ์คำถามหรือคำสั่งเป็นภาษาธรรมดาได้เลย ระบบจะ route ไปที่ SmartSpec Copilot อัตโนมัติ<br/>
              📋 <strong>Workflows:</strong> ใช้ <code>/workflow_name</code> เพื่อเรียกใช้ workflow เฉพาะ<br/>
              ⌨️ <strong>Context:</strong> ใช้ <strong>▶️ Run</strong> เพื่อต่อเนื่องจากบริบทเดิม หรือ <strong>➕ New Tab</strong> เพื่อเริ่มใหม่
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 0", alignItems: "center" }}>
        <button
          onClick={createEmptyTab}
          style={{
            ...buttonStyle,
            padding: "6px 12px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}
        >
          ➕ New Tab
        </button>
        
        {tabs.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => setActiveTabId(t.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px 0 0 8px",
                border: "1px solid #d1d5db",
                borderRight: "none",
                background: t.id === activeTabId ? "#111827" : "white",
                color: t.id === activeTabId ? "white" : "#111827",
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              title={t.command || "(empty tab)"}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: getStatusColor(t.status),
                animation: t.isWaiting ? "pulse 1.5s infinite" : "none"
              }} />
              {t.title || "New Tab"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: "0 8px 8px 0",
                border: "1px solid #d1d5db",
                background: t.id === activeTabId ? "#374151" : "#f3f4f6",
                color: t.id === activeTabId ? "white" : "#6b7280",
                cursor: "pointer",
                fontSize: 12,
                transition: "all 0.2s"
              }}
              title="Close tab"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Terminal with text selection handlers */}
      <div 
        onMouseUp={handleTextSelection}
        onContextMenu={handleContextMenu}
      >
        <Terminal lines={activeTab?.lines || []} />
      </div>

      {/* Command input section */}
      <div style={{ display: "grid", gap: 8, background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>Command</label>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Ask anything or use /workflow.md [args...]"
            style={{ ...inputStyle, flex: 1, minWidth: 500, fontFamily: "monospace" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && workspace && command) {
                runInActiveTab(false);
              } else if (e.key === "/" && command === "") {
                e.preventDefault();
                setIsPaletteOpen(true);
              }
            }}
          />
          <button type="button" onClick={() => setIsPaletteOpen((prev) => !prev)} style={buttonStyle}>
            📋 Command Palette
          </button>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Ctrl+K</span>
        </div>

        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          workflows={workflows}
          schemas={workflowSchemas}
          onApplyCommand={(cmd) => {
            setCommand(cmd);
            setIsPaletteOpen(false);
          }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            disabled={!workspace || !command || isActiveTabWaiting}
            onClick={() => runInActiveTab(false)}
            style={workspace && command && !isActiveTabWaiting ? { ...successButtonStyle, fontSize: "16px", padding: "10px 24px" } : disabledButtonStyle}
            title="Run in current tab (continue context)"
          >
            ▶️ Run
          </button>
          <button
            disabled={!workspace || !command || isActiveTabWaiting}
            onClick={() => runInNewTab(false)}
            style={workspace && command && !isActiveTabWaiting ? primaryButtonStyle : disabledButtonStyle}
            title="Run in new tab (fresh context)"
          >
            ➕ Run in New Tab
          </button>
          <button
            disabled={!workspace || !command || isActiveTabWaiting}
            onClick={() => runInActiveTab(true)}
            style={workspace && command && !isActiveTabWaiting ? buttonStyle : disabledButtonStyle}
            title="Plan only (no execution)"
          >
            📋 Plan Only
          </button>
          <button
            disabled={!activeTab || !activeTab.jobId}
            onClick={reconnect}
            style={activeTab && activeTab.jobId ? buttonStyle : disabledButtonStyle}
          >
            🔄 Reconnect
          </button>
          <button
            disabled={!activeTab || !activeTab.jobId}
            onClick={cancel}
            style={activeTab && activeTab.jobId ? dangerButtonStyle : disabledButtonStyle}
          >
            ⏹️ Cancel
          </button>
          <button
            disabled={!activeTab}
            onClick={clearActiveTab}
            style={activeTab ? buttonStyle : disabledButtonStyle}
          >
            🗑️ Clear
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Workflow</label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setCommand(`/${e.target.value}`);
              }
            }}
            style={{ ...inputStyle, minWidth: 200 }}
          >
            <option value="">Select workflow...</option>
            {workflows.map(w => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
          <input
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="stdin input (press Enter to send to running workflow)"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendInput();
            }}
          />
          <button
            disabled={!activeTab || !activeTab.jobId || !stdin.trim()}
            onClick={sendInput}
            style={activeTab && activeTab.jobId && stdin.trim() ? primaryButtonStyle : disabledButtonStyle}
          >
            📤 Send
          </button>
        </div>

        {history.length > 0 ? (
          <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Command History</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {history.slice(0, 20).map((h, idx) => (
                <button key={idx} onClick={() => setCommand(h.command)} style={{ textAlign: "left", ...buttonStyle }}>
                  {new Date(h.ts).toLocaleString()} — {h.command}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {/* Shared Memory Components */}
      <MemoryContextMenu />
      <MemorySaveDialog />
      <MemoryPanel />
    </div>
  );
}
