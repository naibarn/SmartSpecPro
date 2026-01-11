import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kiloCancel, kiloListWorkflows, kiloRun, kiloSendInput, kiloStreamNdjson, StreamMessage, WorkflowSchema } from "../services/kiloCli";
import { Terminal } from "../components/Terminal";
import { CommandPalette } from "../components/CommandPalette";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";

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

  useEffect(() => {
    return () => {
      // Cleanup all abort controllers
      abortRefs.current.forEach(ac => {
        try { ac.abort(); } catch {}
      });
    };
  }, []);

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

  async function run(planOnly = false) {
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

    // Create new tab
    const tabId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const tabTitle = cmd.length > 30 ? cmd.substring(0, 27) + "..." : cmd;
    
    const newTab: Tab = {
      id: tabId,
      title: tabTitle,
      command: cmd,
      jobId: "",
      status: "starting",
      lines: [],
      lastSeq: 0,
      isWaiting: true,
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
      `${"=".repeat(80)}\n\n`,
      `⏳ Starting workflow... please wait\n\n`
    ];
    
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, lines: header } : t));

    try {
      const res = await kiloRun(workspace, cmd);
      console.log("✅ Got jobId:", res.jobId);
      
      updateTab(tabId, { jobId: res.jobId, status: "running" });
      await connectStream(tabId, res.jobId, 0);
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

  const getStatusColor = (status: string) => {
    if (status === "running" || status === "starting") return "#10b981";
    if (status === "done" || status === "completed") return "#3b82f6";
    if (status === "error") return "#ef4444";
    if (status === "cancelled") return "#f59e0b";
    return "#6b7280";
  };

  const getStatusIcon = (status: string) => {
    if (status === "starting") return "⏳";
    if (status === "running") return "⚡";
    if (status === "reconnecting") return "🔄";
    if (status === "done" || status === "completed") return "✅";
    if (status === "error") return "❌";
    if (status === "cancelled") return "⏹️";
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

  // Check if any tab is waiting
  const isAnyTabWaiting = tabs.some(t => t.isWaiting);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: "1400px", margin: "0 auto" }}>
      <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "#111827" }}>CLI (Terminal)</h2>

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
                </span>
              </div>
              <div>
                <strong>Last Seq:</strong> <span style={{ fontFamily: "monospace" }}>{activeTab.lastSeq}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              💡 <strong>Natural language supported:</strong> พิมพ์คำถามหรือคำสั่งเป็นภาษาธรรมดาได้เลย ระบบจะ route ไปที่ SmartSpec Copilot อัตโนมัติ<br/>
              📋 <strong>Workflows:</strong> ใช้ <code>/workflow_name</code> เพื่อเรียกใช้ workflow เฉพาะ<br/>
              ⌨️ <strong>Interactive mode:</strong> ใช้ช่อง stdin ด้านล่างเพื่อส่งข้อมูลเข้า workflow ที่กำลังรันอยู่
            </div>
          </div>
        )}
      </div>

      {/* Loading indicator overlay */}
      {isAnyTabWaiting && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "#1f2937",
            border: "2px solid #3b82f6",
            borderRadius: 16,
            padding: "32px 48px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
            textAlign: "center",
            maxWidth: 500
          }}>
            <div style={{
              fontSize: 48,
              marginBottom: 16,
              animation: "spin 1.5s linear infinite"
            }}>
              ⚙️
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#f9fafb",
              marginBottom: 8
            }}>
              กำลังประมวลผล...
            </div>
            <div style={{
              fontSize: 14,
              color: "#9ca3af"
            }}>
              กำลังเรียก LLM และประมวลผล workflow<br/>
              โปรดรอสักครู่ ระบบอาจใช้เวลา 5-15 วินาที
            </div>
            <div style={{
              marginTop: 20,
              padding: "8px 16px",
              background: "#111827",
              borderRadius: 8,
              fontSize: 12,
              color: "#6b7280",
              fontFamily: "monospace"
            }}>
              {tabs.filter(t => t.isWaiting).map(t => (
                <div key={t.id}>Job: {t.jobId || "กำลังสร้าง..."}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 0" }}>
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
                title={t.command}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: getStatusColor(t.status)
                }} />
                <span>{t.title}</span>
                <span style={{ opacity: 0.7, fontSize: 11 }}>{getStatusIcon(t.status)}</span>
              </button>
              <button
                onClick={() => closeTab(t.id)}
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
      )}

      {/* Terminal */}
      <Terminal lines={activeTab?.lines || []} />

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
                run(false);
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
            disabled={!workspace || !command}
            onClick={() => run(false)}
            style={workspace && command ? { ...successButtonStyle, fontSize: "16px", padding: "10px 24px" } : disabledButtonStyle}
          >
            ▶️ Run (New Tab)
          </button>
          <button
            disabled={!workspace || !command}
            onClick={() => run(true)}
            style={workspace && command ? buttonStyle : disabledButtonStyle}
          >
            📝 Plan-only
          </button>
          <button 
            disabled={!activeTab || !activeTab.jobId || activeTab.status !== "running"} 
            onClick={cancel} 
            style={activeTab && activeTab.jobId && activeTab.status === "running" ? dangerButtonStyle : disabledButtonStyle}
          >
            ⏹️ Cancel
          </button>
          <button 
            disabled={!activeTab || !activeTab.jobId} 
            onClick={reconnect} 
            style={activeTab && activeTab.jobId ? buttonStyle : disabledButtonStyle}
          >
            🔌 Reconnect
          </button>
          <button 
            disabled={!activeTab}
            onClick={clearActiveTab} 
            style={activeTab ? buttonStyle : disabledButtonStyle}
          >
            🗑️ Clear
          </button>
          <button
            disabled={!activeTab}
            onClick={() => activeTab && closeTab(activeTab.id)}
            style={activeTab ? buttonStyle : disabledButtonStyle}
          >
            ❌ Close Tab
          </button>

          <div style={{ width: 1, height: 24, background: "#d1d5db", margin: "0 4px" }} />

          <button
            disabled={!workspace}
            onClick={refreshWorkflows}
            style={workspace ? primaryButtonStyle : disabledButtonStyle}
          >
            🔄 Refresh workflows
          </button>

          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                let cmd = v;
                if (!cmd.startsWith("/")) cmd = "/" + cmd;
                if (!cmd.endsWith(".md")) cmd = cmd + ".md";
                setCommand(cmd);
              }
            }}
            style={{ ...inputStyle, minWidth: 240 }}
          >
            <option value="">(autocomplete workflows)</option>
            {workflows.map((w) => (
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
    </div>
  );
}
