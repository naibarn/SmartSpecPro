import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PtyXterm from "../components/PtyXterm";
import MediaGallery from "../components/MediaGallery";
import { openPtyWs, ptyAttach, ptyCreate, ptyInput, ptySignal, ptyKill, ptyResize, PtyMessage, ptyPoll } from "../services/pty";
import { createWsTicket } from "../services/wsTicket";
import { loadProxyToken } from "../services/authStore";
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

  const ptyWsRef = useRef<WebSocket | null>(null);
  const mediaWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeTab = useMemo(() => tabs.find(t => t.id === active), [tabs, active]);

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
        setErrorMessage("WebSocket connection error. Make sure the backend is running.");
      };

      pws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as PtyMessage;

        if (msg.type === "created") {
          const sid = msg.sessionId;
          setTabs(prev => [{ id: sid, title: sid.slice(0, 6), command, status: "running", seq: 0, mediaSeq: 0, media: [] }, ...prev]);
          setActive(sid);
          if (mws && mws.readyState === 1) mediaAttach(mws, sid, 0);
          return;
        }

        if (msg.type === "error") {
          setErrorMessage(msg.message);
          return;
        }

        if (msg.type === "stdout") {
          // write to xterm
          window.__ptyWrite?.(msg.data);

          // track seq for reconnect
          setTabs(prev => prev.map(t => t.id === active ? { ...t, seq: msg.seq } : t));
        } else if (msg.type === "status") {
          setTabs(prev => prev.map(t => t.id === active ? { ...t, status: msg.status, seq: msg.seq } : t));
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
    // Use home directory if no workspace specified
    const ws_path = workspace || "";
    // Empty command will open interactive shell
    ptyCreate(ws, ws_path, command);
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
    
    // Kill the session if still running
    if (ws && ws.readyState === 1 && tab && tab.status === "running") {
      ptyKill(ws);
    }
    
    setTabs(prev => prev.filter(t => t.id !== id));
    if (active === id) setActive(tabs.find(t => t.id !== id)?.id || "");
  }, [active, tabs]);

  // terminal input passthrough
  const onTermData = useCallback((data: string) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ptyInput(ws, data);
  }, []);

  // terminal resize
  const onTermResize = useCallback((rows: number, cols: number) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ptyResize(ws, rows, cols);
  }, []);

  // shortcuts
  const onKey = useCallback((e: KeyboardEvent) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    if (!activeTab) return;

    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      ptySignal(ws, "SIGINT");
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      ptyInput(ws, "\x12");
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      createSession();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      closeTab(activeTab.id);
      return;
    }
  }, [activeTab, createSession, closeTab]);

  // Media insert (UI-level). NOTE: currently uses object URL; next step wire to artifact storage.
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

      // also inject a structured tag into terminal so workflows/LLM can reference it later
      const pws = ptyWsRef.current;
      if (pws && pws.readyState === 1) {
        ptyInput(pws, `\n@media type=${kind} name="${f.name}" mime="${f.type}" size=${f.size}\n`);
      }
    };
    input.click();
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case "connected": return "#22c55e";
      case "connecting": return "#f59e0b";
      case "disconnected": return "#6b7280";
      case "error": return "#ef4444";
    }
  };

  const getTabStatusColor = (status: string) => {
    switch (status) {
      case "running": return "#22c55e";
      case "completed": return "#3b82f6";
      case "failed": return "#ef4444";
      case "cancelled": return "#f59e0b";
      case "killed": return "#6b7280";
      default: return "#6b7280";
    }
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Terminal (PTY + Media Channel)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: getStatusColor(connectionStatus)
            }} />
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              {connectionStatus === "connected" ? "Connected" :
               connectionStatus === "connecting" ? "Connecting..." :
               connectionStatus === "error" ? "Error" : "Disconnected"}
            </span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Shortcuts: Ctrl+C, Ctrl+R, Ctrl+Shift+T (new tab), Ctrl+W (close)
          </div>
        </div>
      </div>

      {errorMessage && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          color: "#dc2626",
          fontSize: 13
        }}>
          {errorMessage}
          <button
            onClick={() => setErrorMessage("")}
            style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
        <input
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="(empty = home directory)"
          style={{ minWidth: 360 }}
        />
        <button disabled={!workspace} onClick={refreshWorkflows}>Refresh workflows</button>

        {workflows.length > 0 && (
          <select value="" onChange={(e) => e.target.value && setCommand(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">(select workflow)</option>
            {workflows.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        )}

        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Command (empty = interactive shell)"
          style={{ minWidth: 300 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && connectionStatus === "connected") {
              createSession();
            }
          }}
        />
        <button
          disabled={connectionStatus !== "connected"}
          onClick={createSession}
          style={{
            backgroundColor: connectionStatus === "connected" ? "#111827" : "#d1d5db",
            color: connectionStatus === "connected" ? "white" : "#6b7280"
          }}
        >
          New Tab
        </button>

        <button disabled={!activeTab} onClick={() => insertMedia("image")}>Insert Image</button>
        <button disabled={!activeTab} onClick={() => insertMedia("video")}>Insert Video</button>
      </div>

      {tabs.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={() => attachTab(t.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px 0 0 999px",
                  border: "1px solid #e5e7eb",
                  borderRight: "none",
                  background: t.id === active ? "#111827" : "white",
                  color: t.id === active ? "white" : "#111827",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
                title={t.command || "(interactive shell)"}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: getTabStatusColor(t.status)
                }} />
                {t.title} • {t.status}
              </button>
              <button
                onClick={() => closeTab(t.id)}
                style={{
                  padding: "6px 8px",
                  borderRadius: "0 999px 999px 0",
                  border: "1px solid #e5e7eb",
                  background: t.id === active ? "#374151" : "#f3f4f6",
                  color: t.id === active ? "white" : "#6b7280",
                  fontSize: 12,
                  cursor: "pointer"
                }}
                title="Close tab"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.7, padding: "12px 0" }}>
          No tabs. Click "New Tab" to start an interactive shell or run a command.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 10 }}>
          <PtyXterm onData={onTermData} onKey={onKey} onResize={onTermResize} />
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            {activeTab ? (
              <>
                sessionId: <span style={{ fontFamily: "monospace" }}>{activeTab.id}</span> |
                status: <span style={{ color: getTabStatusColor(activeTab.status) }}>{activeTab.status}</span> |
                command: {activeTab.command || "(interactive shell)"}
              </>
            ) : (
              <span style={{ opacity: 0.6 }}>No active session</span>
            )}
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 10 }}>
          <MediaGallery items={activeTab?.media || []} />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>
            Media channel แยกจาก terminal เพื่อรองรับภาพ/วิดีโอ และไฟล์ใหญ่ได้จริง
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        หมายเหตุ: ตอนนี้ Insert Media ยังใช้ object URL (ชั่วคราว). ขั้นต่อไปจะผูกกับ Control Plane artifacts เพื่อให้ LLM/workflow เข้าถึงได้จริงผ่าน URL/presigned.
      </div>
    </div>
  );
}
