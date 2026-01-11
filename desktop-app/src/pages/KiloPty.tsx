import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PtyXterm from "../components/PtyXterm";
import MediaGallery from "../components/MediaGallery";
import { openPtyWs, ptyCreate, ptyAttach, ptyInput, ptySignal, ptyKill, ptyResize, ptyPoll, PtyMessage } from "../services/pty";
import { createWsTicket } from "../services/wsTicket";
import { loadProxyToken, getProxyTokenHint, setProxyToken } from "../services/authStore";
import { openMediaWs, mediaAttach, mediaEmit, MediaMessage, MediaEvent } from "../services/mediaChannel";


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
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);

  const ptyWsRef = useRef<WebSocket | null>(null);
  const mediaWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeSessionRef = useRef<string>("");  // Track active session without closure issues

  const activeTab = useMemo(() => tabs.find(t => t.id === active), [tabs, active]);

  // Update ref when active changes
  useEffect(() => {
    activeSessionRef.current = active;
  }, [active]);

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

  const disabledButtonStyle = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: "not-allowed",
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



  // No need for frontend polling - backend pushes data via WebSocket

  const connectWebSockets = useCallback(async () => {
    if (isConnecting) {
      console.log("Already connecting, skipping...");
      return;
    }
    setIsConnecting(true);
    setConnectionStatus("connecting");
    setErrorMessage("");

    // Clear any existing connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    try {
      // Close existing connections
      if (ptyWsRef.current) {
        try { ptyWsRef.current.close(); } catch {}
        ptyWsRef.current = null;
      }
      if (mediaWsRef.current) {
        try { mediaWsRef.current.close(); } catch {}
        mediaWsRef.current = null;
      }

      console.log("Creating WebSocket tickets...");
      const pTicket = await createWsTicket("pty");
      console.log("PTY ticket created:", pTicket);
      
      const mTicket = await createWsTicket("media");
      console.log("Media ticket created:", mTicket);
      
      // Create WebSocket connections
      const pws = openPtyWs(pTicket.ticket);
      const mws = openMediaWs(mTicket.ticket);
      
      console.log("PTY WebSocket created, readyState:", pws.readyState);
      console.log("Media WebSocket created, readyState:", mws.readyState);
      
      ptyWsRef.current = pws;
      mediaWsRef.current = mws;

      // Set connection timeout (10 seconds)
      connectionTimeoutRef.current = setTimeout(() => {
        console.error("WebSocket connection timeout, readyState:", pws.readyState);
        if (pws.readyState !== WebSocket.OPEN) {
          setConnectionStatus("error");
          setErrorMessage("Connection timeout. Please check if the backend is running.");
          setIsConnecting(false);
          try { pws.close(); } catch {}
          try { mws.close(); } catch {}
        }
      }, 10000);

      // Helper function to handle successful connection
      const handleConnected = () => {
        console.log("PTY WebSocket connected successfully");
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setConnectionStatus("connected");
        setErrorMessage("");
        setIsConnecting(false);
      };

      // PTY WebSocket event handlers
      pws.onopen = () => {
        console.log("PTY WebSocket onopen triggered, readyState:", pws.readyState);
        handleConnected();
      };

      // Check if already connected (in case onopen fired before we set the handler)
      if (pws.readyState === WebSocket.OPEN) {
        console.log("PTY WebSocket already open!");
        handleConnected();
      }

      pws.onclose = (event) => {
        console.log("PTY WebSocket closed:", event.code, event.reason);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        setConnectionStatus("disconnected");
        setIsConnecting(false);
        // Auto-reconnect after 3 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Auto-reconnecting...");
          connectWebSockets();
        }, 3000);
      };

      pws.onerror = (error) => {
        console.error("PTY WebSocket error:", error);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        setConnectionStatus("error");
        setErrorMessage("WebSocket connection error. Make sure the backend is running on port 8000.");
        setIsConnecting(false);
      };

      pws.onmessage = (ev) => {
        console.log("PTY message received:", ev.data.slice(0, 200));
        const msg = JSON.parse(ev.data) as PtyMessage;

        if (msg.type === "created") {
          const sid = msg.sessionId;
          console.log("Session created:", sid);
          // Add new tab and set as active
          setTabs(prev => {
            const newTabs = [{ id: sid, title: sid.slice(0, 6), command: "", status: "running", seq: 0, mediaSeq: 0, media: [] }, ...prev];
            return newTabs;
          });
          setActive(sid);
          activeSessionRef.current = sid;  // Update ref immediately
          if (mws && mws.readyState === 1) mediaAttach(mws, sid, 0);
          return;
        }

        if (msg.type === "error") {
          console.error("PTY error:", msg.message);
          setErrorMessage(msg.message);
          return;
        }

        if (msg.type === "stdout") {
          // Write to terminal - this is the key fix!
          console.log("Writing to terminal:", msg.data.length, "chars, seq:", msg.seq);
          
          // Write to xterm
          if (window.__ptyWrite) {
            window.__ptyWrite(msg.data);
          } else {
            console.error("__ptyWrite not available!");
          }
          
          // Update seq for the session (use ref to avoid closure issues)
          const currentSession = activeSessionRef.current;
          if (currentSession) {
            setTabs(prev => prev.map(t => t.id === currentSession ? { ...t, seq: msg.seq } : t));
          }
        } else if (msg.type === "status") {
          const currentSession = activeSessionRef.current;
          if (currentSession) {
            setTabs(prev => prev.map(t => t.id === currentSession ? { ...t, status: msg.status, seq: msg.seq } : t));
          }
        } else if (msg.type === "ack") {
          // Acknowledgment received
          console.log("ACK received");
        }
      };

      mws.onopen = () => {
        console.log("Media WebSocket connected");
      };

      mws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as MediaMessage;
        if (msg.type === "event") {
          const e = msg.event;
          // Only add if not already in the list (check by url to prevent duplicates)
          setTabs(prev => prev.map(t => {
            if (t.id !== e.sessionId) return t;
            // Check if media already exists (by url)
            const exists = t.media.some(m => m.url === e.url);
            if (exists) return { ...t, mediaSeq: msg.seq };
            return { ...t, mediaSeq: msg.seq, media: [e, ...t.media].slice(0, 200) };
          }));
        }
      };

      mws.onerror = (error) => {
        console.error("Media WebSocket error:", error);
      };

    } catch (err) {
      console.error("Connection error:", err);
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      setConnectionStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to connect");
      setIsConnecting(false);
    }
  }, [isConnecting]);

  useEffect(() => {
    // Delay initial connection slightly to ensure component is mounted
    const initTimeout = setTimeout(() => {
      connectWebSockets();
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
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
      setErrorMessage("Not connected. Click 'Reconnect' to try again.");
      // Try to reconnect
      connectWebSockets();
      return;
    }
    const ws_path = workspace || "";
    console.log("Creating PTY session:", { workspace: ws_path });
    ptyCreate(ws, ws_path, "");  // Always create interactive shell
  }, [workspace, connectWebSockets]);

  const attachTab = useCallback((id: string) => {
    setActive(id);
    activeSessionRef.current = id;  // Update ref
    
    // Wait for terminal to mount before attaching
    // This ensures __ptyWrite points to the correct terminal instance
    setTimeout(() => {
      const ws = ptyWsRef.current;
      const mws = mediaWsRef.current;
      const tab = tabs.find(t => t.id === id);
      if (!ws || ws.readyState !== 1 || !tab) return;
      
      // Use from: 0 to replay entire buffer when switching tabs
      // This ensures the new terminal instance gets all previous output
      console.log("Attaching to tab:", id, "replaying from seq: 0");
      ptyAttach(ws, id, 0);  // Always replay from beginning
      if (mws && mws.readyState === 1) mediaAttach(mws, id, 0);
      ptyPoll(ws);
    }, 600); // Wait for PtyXterm to mount and register __ptyWrite
  }, [tabs]);

  const closeTab = useCallback((id: string) => {
    const ws = ptyWsRef.current;
    const tab = tabs.find(t => t.id === id);
    
    if (ws && ws.readyState === 1 && tab && tab.status === "running") {
      ptyKill(ws);
    }
    
    setTabs(prev => prev.filter(t => t.id !== id));
    if (active === id) {
      const remaining = tabs.filter(t => t.id !== id);
      const newActive = remaining[0]?.id || "";
      setActive(newActive);
      activeSessionRef.current = newActive;
    }
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

  // Debounce resize to prevent too many WebSocket messages
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResizeRef = useRef<{ rows: number; cols: number } | null>(null);
  
  const onTermResize = useCallback((rows: number, cols: number) => {
    // Skip if same size
    if (lastResizeRef.current && lastResizeRef.current.rows === rows && lastResizeRef.current.cols === cols) {
      return;
    }
    lastResizeRef.current = { rows, cols };
    
    // Debounce resize messages
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      const ws = ptyWsRef.current;
      if (!ws || ws.readyState !== 1) return;
      console.log("Sending resize:", rows, cols);
      ptyResize(ws, rows, cols);
    }, 200);
  }, []);

  // Use refs for callbacks to avoid re-creating them
  const createSessionRef = useRef(createSession);
  const closeTabRef = useRef(closeTab);
  const activeTabRef = useRef(activeTab);
  
  useEffect(() => {
    createSessionRef.current = createSession;
    closeTabRef.current = closeTab;
    activeTabRef.current = activeTab;
  }, [createSession, closeTab, activeTab]);

  const onKey = useCallback((e: KeyboardEvent) => {
    // Don't handle keys if terminal should handle them
    // Only handle specific shortcuts
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const tab = activeTabRef.current;
    if (!tab) return;

    // Ctrl+Shift+T for new tab
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      createSessionRef.current();
      return;
    }
    // Ctrl+W for close tab
    if (e.ctrlKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      closeTabRef.current(tab.id);
      return;
    }
    // Don't intercept Ctrl+C - let xterm handle it
  }, []); // Empty deps - stable callback

  const insertMedia = async (kind: "image" | "video") => {
    if (!activeTab) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "image" ? "image/*" : "video/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      
      // Create blob URL for preview
      const blobUrl = URL.createObjectURL(f);
      
      // Determine save path in workspace
      const mediaDir = workspace ? `${workspace}/.media` : ".media";
      const timestamp = Date.now();
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${mediaDir}/${timestamp}_${safeName}`;
      
      // Try to upload file to workspace via backend
      let serverPath = filePath;
      try {
        const formData = new FormData();
        formData.append("file", f);
        formData.append("path", filePath);
        
        const BASE = import.meta.env.VITE_PY_BACKEND_URL || "http://localhost:8000";
        const res = await fetch(`${BASE}/api/v1/kilo/upload`, {
          method: "POST",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          serverPath = data.path || filePath;
          console.log("File uploaded to:", serverPath);
        } else {
          console.warn("Upload failed, using local path:", filePath);
        }
      } catch (err) {
        console.warn("Upload error, using local path:", err);
      }

      const ev: MediaEvent = { 
        sessionId: activeTab.id, 
        type: kind, 
        title: f.name, 
        url: blobUrl, 
        mime: f.type, 
        meta: { size: f.size, path: serverPath } 
      };
      
      // Add to local state immediately for instant feedback
      setTabs(prev => prev.map(t => 
        t.id === activeTab.id 
          ? { ...t, media: [ev, ...t.media].slice(0, 200) }
          : t
      ));
      
      // Also send to backend for persistence
      const mws = mediaWsRef.current;
      if (mws && mws.readyState === 1) {
        mediaEmit(mws, ev);
      }

      // Notify terminal about the media with full path
      const pws = ptyWsRef.current;
      if (pws && pws.readyState === 1) {
        ptyInput(pws, `\n# Media inserted: ${kind}\n# Path: ${serverPath}\n# Size: ${(f.size / 1024).toFixed(1)} KB\n`);
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

  // Check if button should be enabled
  const isNewTabEnabled = connectionStatus === "connected" && !isConnecting;

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
            style={tokenInput.trim() ? primaryButtonStyle : disabledButtonStyle}
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

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <button
          onClick={createSession}
          style={isNewTabEnabled ? { ...successButtonStyle, fontSize: "16px", padding: "10px 24px" } : { ...disabledButtonStyle, fontSize: "16px", padding: "10px 24px" }}
        >
          ▶️ New Tab {!isNewTabEnabled && `(${connectionStatus})`}
        </button>
        <button
          disabled={!activeTab || activeTab.status !== "running"}
          onClick={() => {
            const ws = ptyWsRef.current;
            if (ws && ws.readyState === 1) ptySignal(ws, "SIGINT");
          }}
          style={activeTab && activeTab.status === "running" ? dangerButtonStyle : disabledButtonStyle}
        >
          ⏹️ Interrupt (Ctrl+C)
        </button>
        <button
          disabled={!activeTab}
          onClick={() => activeTab && closeTab(activeTab.id)}
          style={activeTab ? buttonStyle : disabledButtonStyle}
        >
          ❌ Close Tab
        </button>
        <button
          onClick={() => {
            setIsConnecting(false);  // Reset connecting state
            connectWebSockets();
          }}
          style={connectionStatus !== "connected" ? primaryButtonStyle : buttonStyle}
        >
          🔌 {isConnecting ? "Connecting..." : "Reconnect"}
        </button>

        <div style={{ width: 1, height: 24, background: "#d1d5db", margin: "0 4px" }} />

        <button disabled={!activeTab} onClick={() => insertMedia("image")} style={activeTab ? buttonStyle : disabledButtonStyle}>
          🖼️ Insert Image
        </button>
        <button disabled={!activeTab} onClick={() => insertMedia("video")} style={activeTab ? buttonStyle : disabledButtonStyle}>
          🎬 Insert Video
        </button>
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
              {connectionStatus !== "connected" && (
                <button
                  onClick={() => {
                    setIsConnecting(false);
                    connectWebSockets();
                  }}
                  style={{ ...primaryButtonStyle, marginTop: 8 }}
                >
                  🔌 {isConnecting ? "Connecting..." : "Connect Now"}
                </button>
              )}
            </div>
          ) : (
            <>
              <PtyXterm key={`pty-terminal-${active}`} onData={onTermData} onKey={onKey} onResize={onTermResize} />
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
