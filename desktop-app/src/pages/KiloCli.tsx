import { useEffect, useMemo, useRef, useState } from "react";
import { kiloCancel, kiloListWorkflows, kiloRun, kiloSendInput, kiloStreamNdjson, StreamMessage, WorkflowSchema } from "../services/kiloCli";
import { Terminal } from "../components/Terminal";
import { CommandPalette } from "../components/CommandPalette";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";
const LS_KEY = "smartspec.kilo.history.v1";

type HistoryItem = { command: string; ts: number };

export default function KiloCliPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [workflowSchemas, setWorkflowSchemas] = useState<WorkflowSchema[]>([]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [command, setCommand] = useState("/test_hello.md");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<string>("-");
  const [lines, setLines] = useState<string[]>([]);
  const [stdin, setStdin] = useState<string>("");
  const [isWaitingForFirstOutput, setIsWaitingForFirstOutput] = useState(false);

  const [lastSeq, setLastSeq] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");

  const history: HistoryItem[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  const append = (s: string) => setLines((prev) => [...prev, s]);

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
      if (res.workflows && res.workflows.length > 0) {
        append(`Found ${res.workflows.length} workflows\n`);
      } else {
        append(`No workflows found in ${workspace}/.smartspec/workflows/\n`);
      }
    } catch (err) {
      console.error("❌ Error refreshing workflows:", err);
      append(`Error: ${err}\n`);
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
      try { abortRef.current?.abort(); } catch {}
    };
  }, []);

  const onSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) {
      append("❌ Error: Token cannot be empty\n");
      return;
    }
    console.log("💾 Saving token:", token.substring(0, 10) + "...");
    await setProxyToken(token);
    setTokenInput("");
    setTokenHint(getProxyTokenHint());
    append(`✅ Token saved: ${token.substring(0, 10)}...\n`);
    alert("Saved proxy token locally (OS keychain when available).");
  };

  function saveHistory(cmd: string) {
    const item: HistoryItem = { command: cmd, ts: Date.now() };
    const next = [item, ...history].slice(0, 50);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }

  async function connectStream(currentJobId: string, from: number) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    await kiloStreamNdjson(
      currentJobId,
      from,
      (m: StreamMessage) => {
        if (m.type === "stdout") {
          setLastSeq(m.seq);
          const text = m.data || m.line || "";
          append(text);
        } else if (m.type === "status") {
          // Backend sends type "status" when job completes - close overlay here
          setStatus(m.status || "done");
          append(`\n[done] status=${m.status} rc=${m.returncode}\n`);
          setIsWaitingForFirstOutput(false);
        } else if (m.type === "done") {
          // Job completed - close overlay here
          setStatus(m.status || "done");
          append(`\n[done] status=${m.status} rc=${m.returncode}\n`);
          setIsWaitingForFirstOutput(false);
        } else if (m.type === "error") {
          // Error occurred - close overlay here
          setStatus("error");
          append(`\n[error] ${m.message}\n`);
          setIsWaitingForFirstOutput(false);
        }
      },
      ac.signal
    );
  }

  async function run(planOnly = false) {
    if (!workspace) {
      append("❌ Error: Please set workspace path\n");
      return;
    }
    if (!command) {
      append("❌ Error: Please enter a command\n");
      return;
    }

    console.log("▶️ Running:", { workspace, command, planOnly });
    setLines([]);
    setStatus("starting");
    setLastSeq(0);
    setIsWaitingForFirstOutput(true);  // Set waiting state

    const cmd = planOnly ? `${command} --plan-only` : command;
    saveHistory(cmd);

    try {
      // Add separator and command header for easy scrollback reference
      append(`\n${"=".repeat(80)}\n`);
      append(`📝 Command: ${cmd}\n`);
      append(`⏰ Time: ${new Date().toLocaleString('th-TH')}\n`);
      append(`📁 Workspace: ${workspace}\n`);
      append(`${"=".repeat(80)}\n\n`);
      append(`⏳ Starting workflow... please wait\n\n`);

      // Clear command input for next command (Kilo Code CLI behavior)
      setCommand("");

      const res = await kiloRun(workspace, cmd);
      console.log("✅ Got jobId:", res.jobId);
      setJobId(res.jobId);
      setStatus("running");

      await connectStream(res.jobId, 0);
    } catch (err) {
      console.error("❌ Error running workflow:", err);
      append(`\n❌ Error: ${err}\n`);
      setStatus("error");
      setIsWaitingForFirstOutput(false);
    }
  }

  async function reconnect() {
    if (!jobId) return;
    setStatus("reconnecting");
    await connectStream(jobId, lastSeq);
    setStatus("running");
  }

  async function cancel() {
    if (!jobId) return;
    await kiloCancel(jobId);
    setStatus("cancelled");
    abortRef.current?.abort();
    append("\n[cancel requested]\n");
  }

  async function sendInput() {
    if (!jobId || !stdin.trim()) return;
    const text = stdin;
    setStdin("");
    append(`\n> ${text}\n`);
    await kiloSendInput(jobId, text);
  }

  const buttonStyle = {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
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

  const inputStyle = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
  };

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

        <div style={{
          fontSize: 12,
          padding: "12px",
          background: "#f9fafb",
          borderRadius: "8px",
          border: "1px solid #e5e7eb"
        }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <strong>Job ID:</strong> <span style={{ fontFamily: "monospace", color: "#6366f1" }}>{jobId || "-"}</span>
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <span style={{
                fontFamily: "monospace",
                color: status === "running" || status === "starting" ? "#10b981" : status === "done" || status === "completed" ? "#3b82f6" : "#6b7280"
              }}>
                {status === "starting" && "⏳ Starting..."}
                {status === "running" && "⚡ Running..."}
                {status === "reconnecting" && "🔄 Reconnecting..."}
                {(status === "done" || status === "completed") && "✅ Completed"}
                {status === "error" && "❌ Error"}
                {status === "cancelled" && "⏹️ Cancelled"}
                {!["starting", "running", "reconnecting", "done", "completed", "error", "cancelled"].includes(status) && status}
              </span>
            </div>
            <div>
              <strong>Last Seq:</strong> <span style={{ fontFamily: "monospace" }}>{lastSeq}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            💡 <strong>Natural language supported:</strong> พิมพ์คำถามหรือคำสั่งเป็นภาษาธรรมดาได้เลย ระบบจะ route ไปที่ SmartSpec Copilot อัตโนมัติ<br/>
            📋 <strong>Workflows:</strong> ใช้ <code>/workflow_name</code> เพื่อเรียกใช้ workflow เฉพาะ<br/>
            ⌨️ <strong>Interactive mode:</strong> ใช้ช่อง stdin ด้านล่างเพื่อส่งข้อมูลเข้า workflow ที่กำลังรันอยู่
          </div>
        </div>
      </div>

      {/* Loading indicator overlay */}
      {isWaitingForFirstOutput && (
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
              Job ID: {jobId || "กำลังสร้าง..."}
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

      <Terminal lines={lines} />

      {/* Command input section - moved below terminal for natural typing experience */}
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
              } else if (e.key === "/") {
                e.preventDefault();
                setIsPaletteOpen(true);
              }
            }}
          />
          <button onClick={() => setCommand("/test_hello.md")} style={buttonStyle}>
            /test_hello
          </button>
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
            style={workspace && command ? { ...primaryButtonStyle, fontSize: "16px", padding: "10px 24px" } : buttonStyle}
          >
            ▶️ Run
          </button>
          <button
            disabled={!workspace || !command}
            onClick={() => run(true)}
            style={workspace && command ? buttonStyle : buttonStyle}
          >
            📝 Plan-only
          </button>
          <button disabled={!jobId} onClick={cancel} style={jobId ? dangerButtonStyle : buttonStyle}>
            ⏹️ Cancel
          </button>
          <button disabled={!jobId} onClick={reconnect} style={jobId ? buttonStyle : buttonStyle}>
            🔌 Reconnect
          </button>
          <button onClick={() => setLines([])} style={buttonStyle}>
            🗑️ Clear
          </button>

          <div style={{ width: 1, height: 24, background: "#d1d5db", margin: "0 4px" }} />

          <button
            disabled={!workspace}
            onClick={refreshWorkflows}
            style={workspace ? primaryButtonStyle : buttonStyle}
          >
            🔄 Refresh workflows
          </button>

          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                // Auto-add / and .md if needed
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
            disabled={!jobId || !stdin.trim()}
            onClick={sendInput}
            style={jobId && stdin.trim() ? primaryButtonStyle : buttonStyle}
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