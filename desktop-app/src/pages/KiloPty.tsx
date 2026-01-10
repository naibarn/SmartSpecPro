import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PtyXterm from "../components/PtyXterm";
import MediaGallery from "../components/MediaGallery";
import { openPtyWs, ptyAttach, ptyCreate, ptyInput, ptySignal, ptyKill, ptyResize, PtyMessage, ptyPoll } from "../services/pty";
import { createWsTicket } from "../services/wsTicket";
import { loadProxyToken, getProxyTokenHint, setProxyToken } from "../services/authStore";
import { openMediaWs, mediaAttach, mediaEmit, MediaMessage, MediaEvent } from "../services/mediaChannel";
import { kiloListWorkflows } from "../services/kiloCli";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";

type Tab = {
  id: string;
  title: string;
  command: string;
  status: string;
  seq: number;
  mediaSeq: number;
  media: MediaEvent[];
};

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export default function KiloPtyPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");

  const ptyWsRef = useRef<WebSocket | null>(null);
  const mediaWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const terminalRef = useRef<{ focus: () => void } | null>(null);

  const activeTab = useMemo(() => tabs.find(t => t.id === active), [tabs, active]);

  // Styles matching KiloCli.tsx
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

  const dangerButtonStyle = {
    ...buttonStyle,
    background: "#ef4444",
    color: "#ffffff",
    border: "1px solid #dc2626",
  };

  const successButtonStyle = {
    ...buttonStyle,
    background: "#10b981",
    color: "#ffffff",
    border: "1px solid #059669",
  };

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
  };

  // Token management
  useEffect(() => {
    const initToken = async () => {
      await loadProxyToken();
      setTokenHint(getProxyTokenHint());
    };
    initToken();
  }, []);

  const onSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    await setProxyToken(token);
    setTokenInput("");
    setTokenHint(getProxyTokenHint());
  };

  const refreshWorkflows = useCallback(async () => {
    if (!workspace) return;
    try {
      await loadProxyToken();
      const res = await kiloListWorkflows(workspace);
      setWorkflows(res.workflows || []);
    } catch {
      setWorkflows([]);
    }
  }, [workspace]);

  useEffect(() => { refreshWorkflows(); }, [refreshWorkflows]);

  // Start polling when we have an active session
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (active && connectionStatus === "connected") {
      pollIntervalRef.current = setInterval(() => {
        const ws = ptyWsRef.current;
        if (ws && ws.readyState === 1) {
          ptyPoll(ws);
        }
      }, 200); // Poll every 200ms
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [active, connectionStatus]);

  const connectWebSockets = useCallback(async () => {
    setConnectionStatus("connecting");
    setErrorMessage("");

    try {
      // Close existing connections
      if (ptyWsRef.current) {
        try { ptyWsRef.current.close(); } catch {}
      }
      if (mediaWsRef.current) {
        try { mediaWsRef.current.close(); } catch {}
      }

      const pTicket = await createWsTicket("pty");
      const pws = openPtyWs(pTicket.ticket);
      
      const mTicket = await createWsTicket("media");
      const mws = openMediaWs(mTicket.ticket);
      
      ptyWsRef.current = pws;
      mediaWsRef.current = mws;

      pws.onopen = () => {
        setConnectionStatus("connected");
        setErrorMessage("");
      };

      pws.onclose = () => {
        setConnectionStatus("disconnected");
        // Auto-reconnect after 3 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSockets();
        }, 3000);
      };

      pws.onerror = () => {
        setConnectionStatus("error");
        setErrorMessage("WebSocket connection error. Make sure the backend is running on port 8000.");
      };

      pws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as PtyMessage;

        if (msg.type === "created") {
          const sid = msg.sessionId;
          setTabs(prev => [{ id: sid, title: sid.slice(0, 6), command, status: "running", seq: 0, mediaSeq: 0, media: [] }, ...prev]);
          setActive(sid);
          if (mws && mws.readyState === 1) mediaAttach(mws, sid, 0);
          // Focus terminal after creation
          setTimeout(() => {
            window.__ptyWrite?.("\r\n");  // Send a newline to trigger prompt
          }, 300);
          return;
        }

        if (msg.type === "error") {
          console.error("PTY error:", msg.message);
          setErrorMessage(msg.message);
          return;
        }

        if (msg.type === "stdout") {
          // Write to terminal
          window.__ptyWrite?.(msg.data);
          // Update seq for the active tab
          setTabs(prev => prev.map(t => t.id === active ? { ...t, seq: msg.seq } : t));
        } else if (msg.type === "status") {
          setTabs(prev => prev.map(t => t.id === active ? { ...t, status: msg.status, seq: msg.seq } : t));
        } else if (msg.type === "ack") {
          // Acknowledgment received
        }
      };

      mws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as MediaMessage;
        if (msg.type === "event") {
          const e = msg.event;
          setTabs(prev => prev.map(t => t.id === e.sessionId ? { ...t, mediaSeq: msg.seq, media: [e, ...t.media].slice(0, 200) } : t));
        }
      };
    } catch (err) {
      setConnectionStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [active, command]);

  useEffect(() => {
    connectWebSockets();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      try {
        if (ptyWsRef.current) ptyWsRef.current.close();
      } catch {}
      try {
        if (mediaWsRef.current) mediaWsRef.current.close();
      } catch {}
    };
  }, []);

  const createSession = useCallback(() => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) {
      setErrorMessage("Not connected. Please wait for reconnection.");
      return;
    }
    const ws_path = workspace || "";
    ptyCreate(ws, ws_path, command);
    setCommand(""); // Clear command after creating session
  }, [workspace, command]);

  const attachTab = useCallback((id: string) => {
    setActive(id);
    const ws = ptyWsRef.current;
    const mws = mediaWsRef.current;
    const tab = tabs.find(t => t.id === id);
    if (!ws || ws.readyState !== 1 || !tab) return;
    ptyAttach(ws, id, tab.seq);
    if (mws && mws.readyState === 1) mediaAttach(mws, id, tab.mediaSeq);
    ptyPoll(ws);
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    const ws = ptyWsRef.current;
    const tab = tabs.find(t => t.id === id);
    
    if (ws && ws.readyState === 1 && tab && tab.status === "running") {
      ptyKill(ws);
    }
    
    setTabs(prev => prev.filter(t => t.id !== id));
    if (active === id) setActive(tabs.find(t => t.id !== id)?.id || "");
  }, [active, tabs]);

  const onTermData = useCallback((data: string) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) {
      console.log("Cannot send data: WebSocket not connected");
      return;
    }
    console.log("Sending input:", JSON.stringify(data));
    ptyInput(ws, data);
  }, []);

  const onTermResize = useCallback((rows: number, cols: number) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ptyResize(ws, rows, cols);
  }, []);

  const onKey = useCallback((e: KeyboardEvent) => {
    // Don't handle keys if terminal should handle them
    // Only handle specific shortcuts
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (!activeTab) return;

    // Ctrl+Shift+T for new tab
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      createSession();
      return;
    }
    // Ctrl+W for close tab
    if (e.ctrlKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      closeTab(activeTab.id);
      return;
    }
    // Don't intercept Ctrl+C - let xterm handle it
  }, [activeTab, createSession, closeTab]);

  const insertMedia = async (kind: "image" | "video") => {
    if (!activeTab) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "image" ? "image/*" : "video/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const url = URL.createObjectURL(f);

      const ev: MediaEvent = { sessionId: activeTab.id, type: kind, title: f.name, url, mime: f.type, meta: { size: f.size } };
      const mws = mediaWsRef.current;
      if (mws && mws.readyState === 1) mediaEmit(mws, ev);

      const pws = ptyWsRef.current;
      if (pws && pws.readyState === 1) {
        ptyInput(pws, `\n@media type=${kind} name="${f.name}" mime="${f.type}" size=${f.size}\n`);
      }
    };
    input.click();
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case "connected": return "#10b981";
      case "connecting": return "#f59e0b";
      case "disconnected": return "#6b7280";
      case "error": return "#ef4444";
    }
  };

  const getTabStatusColor = (status: string) => {
    switch (status) {
      case "running": return "#10b981";
      case "completed": return "#3b82f6";
      case "failed": return "#ef4444";
      case "cancelled": return "#f59e0b";
      case "killed": return "#6b7280";
      default: return "#6b7280";
    }
  };

  const getStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case "connected": return "⚡ Connected";
      case "connecting": return "🔄 Connecting...";
      case "disconnected": return "⏸️ Disconnected";
      case "error": return "❌ Error";
    }
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: "1400px", margin: "0 auto" }}>
      <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "#111827" }}>
        Terminal (PTY + Media Channel)
      </h2>

      {/* Token and Workspace Section */}
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
            (required for PTY WebSocket access)
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.9, fontWeight: 500 }}>Workspace</label>
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="(empty = home directory)"
            style={{ ...inputStyle, minWidth: 520 }}
          />
        </div>

        {/* Status Panel */}
        <div style={{
          fontSize: 12,
          padding: "12px",
          background: "#f9fafb",
          borderRadius: "8px",
          border: "1px solid #e5e7eb"
        }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <strong>Connection:</strong>{" "}
              <span style={{ fontFamily: "monospace", color: getStatusColor(connectionStatus) }}>
                {getStatusText(connectionStatus)}
              </span>
            </div>
            <div>
              <strong>Active Tab:</strong>{" "}
              <span style={{ fontFamily: "monospace", color: "#6366f1" }}>
                {activeTab?.id.slice(0, 8) || "-"}
              </span>
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <span style={{ fontFamily: "monospace", color: activeTab ? getTabStatusColor(activeTab.status) : "#6b7280" }}>
                {activeTab?.status || "-"}
              </span>
            </div>
            <div>
              <strong>Tabs:</strong>{" "}
              <span style={{ fontFamily: "monospace" }}>{tabs.length}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            💡 <strong>Interactive Shell:</strong> เว้นว่าง Command แล้วกด New Tab เพื่อเปิด shell แบบ interactive<br/>
            ⌨️ <strong>พิมพ์คำสั่ง:</strong> คลิกที่หน้าต่าง Terminal สีดำด้านล่าง แล้วพิมพ์คำสั่งได้เลย (เช่น <code>ls -la</code>, <code>cd /path</code>)<br/>
            🔧 <strong>Shortcuts:</strong> Ctrl+Shift+T (new tab), Ctrl+W (close tab)
          </div>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div style={{
          padding: "12px 16px",
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          color: "#dc2626",
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>❌ {errorMessage}</span>
          <button onClick={() => setErrorMessage("")} style={{ ...buttonStyle, padding: "4px 12px", fontSize: 12 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Command Input Section */}
      <div style={{ display: "grid", gap: 8, background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>Command</label>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter command (empty = interactive shell)"
            style={{ ...inputStyle, flex: 1, minWidth: 400, fontFamily: "monospace" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && connectionStatus === "connected") {
                createSession();
              }
            }}
          />
          {workflows.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && setCommand(e.target.value)}
              style={{ ...inputStyle, minWidth: 200 }}
            >
              <option value="">(select workflow)</option>
              {workflows.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            disabled={connectionStatus !== "connected"}
            onClick={createSession}
            style={connectionStatus === "connected" ? { ...successButtonStyle, fontSize: "16px", padding: "10px 24px" } : buttonStyle}
          >
            ▶️ New Tab
          </button>
          <button
            disabled={!activeTab || activeTab.status !== "running"}
            onClick={() => {
              const ws = ptyWsRef.current;
              if (ws && ws.readyState === 1) ptySignal(ws, "SIGINT");
            }}
            style={activeTab && activeTab.status === "running" ? dangerButtonStyle : buttonStyle}
          >
            ⏹️ Interrupt (Ctrl+C)
          </button>
          <button
            disabled={!activeTab}
            onClick={() => activeTab && closeTab(activeTab.id)}
            style={activeTab ? buttonStyle : buttonStyle}
          >
            ❌ Close Tab
          </button>
          <button
            onClick={connectWebSockets}
            disabled={connectionStatus === "connecting"}
            style={connectionStatus !== "connected" ? primaryButtonStyle : buttonStyle}
          >
            🔌 Reconnect
          </button>

          <div style={{ width: 1, height: 24, background: "#d1d5db", margin: "0 4px" }} />

          <button
            disabled={!workspace}
            onClick={refreshWorkflows}
            style={workspace ? primaryButtonStyle : buttonStyle}
          >
            🔄 Refresh workflows
          </button>
          <button disabled={!activeTab} onClick={() => insertMedia("image")} style={activeTab ? buttonStyle : buttonStyle}>
            🖼️ Insert Image
          </button>
          <button disabled={!activeTab} onClick={() => insertMedia("video")} style={activeTab ? buttonStyle : buttonStyle}>
            🎬 Insert Video
          </button>
        </div>
      </div>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 0" }}>
          {tabs.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => attachTab(t.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px 0 0 8px",
                  border: "1px solid #d1d5db",
                  borderRight: "none",
                  background: t.id === active ? "#111827" : "white",
                  color: t.id === active ? "white" : "#111827",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                title={t.command || "(interactive shell)"}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: getTabStatusColor(t.status)
                }} />
                <span>{t.title}</span>
                <span style={{ opacity: 0.7, fontSize: 11 }}>{t.status}</span>
              </button>
              <button
                onClick={() => closeTab(t.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "0 8px 8px 0",
                  border: "1px solid #d1d5db",
                  background: t.id === active ? "#374151" : "#f3f4f6",
                  color: t.id === active ? "white" : "#6b7280",
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                title="Close tab"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Terminal and Media Gallery */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div>
          {tabs.length === 0 ? (
            <div style={{
              height: "60vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "#0b0f14",
              borderRadius: 12,
              color: "#9ca3af",
              gap: 16
            }}>
              <div style={{ fontSize: 48 }}>🖥️</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#d1d5db" }}>
                Terminal Ready
              </div>
              <div style={{ fontSize: 14, textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
                คลิก <strong style={{ color: "#10b981" }}>▶️ New Tab</strong> เพื่อเปิด interactive shell<br/>
                หรือใส่ command แล้วกด Enter
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                Connection: <span style={{ color: getStatusColor(connectionStatus) }}>{getStatusText(connectionStatus)}</span>
              </div>
            </div>
          ) : (
            <>
              <PtyXterm onData={onTermData} onKey={onKey} onResize={onTermResize} />
              <div style={{
                fontSize: 12,
                opacity: 0.8,
                marginTop: 8,
                padding: "8px 12px",
                background: "#f9fafb",
                borderRadius: 6,
                border: "1px solid #e5e7eb"
              }}>
                {activeTab ? (
                  <>
                    <strong>Session:</strong> <span style={{ fontFamily: "monospace" }}>{activeTab.id}</span> |{" "}
                    <strong>Status:</strong> <span style={{ color: getTabStatusColor(activeTab.status) }}>{activeTab.status}</span> |{" "}
                    <strong>Command:</strong> {activeTab.command || "(interactive shell)"} |{" "}
                    <strong>Tip:</strong> คลิกที่หน้าต่างสีดำด้านบนเพื่อพิมพ์คำสั่ง
                  </>
                ) : (
                  <span style={{ opacity: 0.6 }}>Select a tab to view session details</span>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
            📎 Media Gallery
          </div>
          <MediaGallery items={activeTab?.media || []} />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 10, lineHeight: 1.5 }}>
            Media channel แยกจาก terminal เพื่อรองรับภาพ/วิดีโอ และไฟล์ใหญ่ได้จริง
          </div>
        </div>
      </div>
    </div>
  );
}
