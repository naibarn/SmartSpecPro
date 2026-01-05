import { useEffect, useMemo, useRef, useState } from "react";
import { kiloCancel, kiloListWorkflows, kiloRun, kiloSendInput, kiloStreamNdjson, StreamMessage } from "../services/kiloCli";
import { Terminal } from "../components/Terminal";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";
const LS_KEY = "smartspec.kilo.history.v1";

type HistoryItem = { command: string; ts: number };

export default function KiloCliPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [command, setCommand] = useState("/sync-tasks.md");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<string>("-");
  const [lines, setLines] = useState<string[]>([]);
  const [stdin, setStdin] = useState<string>("");

  const [lastSeq, setLastSeq] = useState<number>(0);
  const abortRef = useRef<AbortController | null>(null);

  const history: HistoryItem[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  const append = (s: string) => setLines((prev) => [...prev, s]);

  async function refreshWorkflows() {
    if (!workspace) return;
    try {
      const res = await kiloListWorkflows(workspace);
      setWorkflows(res.workflows || []);
    } catch {
      setWorkflows([]);
    }
  }

  useEffect(() => {
    refreshWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  useEffect(() => {
    return () => {
      try { abortRef.current?.abort(); } catch {}
    };
  }, []);

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
          append(m.line);
        } else if (m.type === "done") {
          setStatus(m.status || "done");
          append(`\n[done] status=${m.status} rc=${m.returncode}\n`);
        }
      },
      ac.signal
    );
  }

  async function run(planOnly = false) {
    setLines([]);
    setStatus("starting");
    setLastSeq(0);

    const cmd = planOnly ? `${command} --plan-only` : command;
    saveHistory(cmd);

    const res = await kiloRun(workspace, cmd);
    setJobId(res.jobId);
    setStatus("running");

    await connectStream(res.jobId, 0);
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

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Kilo CLI (Desktop Parity)</h2>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="/path/to/workspace" style={{ minWidth: 460 }} />

          <button disabled={!workspace} onClick={refreshWorkflows}>Refresh workflows</button>

          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) setCommand(v);
            }}
            style={{ minWidth: 260 }}
          >
            <option value="">(autocomplete workflows)</option>
            {workflows.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Command</label>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="/workflow.md [args...]" style={{ minWidth: 720 }} />
          <button onClick={() => setCommand("/sync-tasks.md")}>/sync-tasks.md</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={!workspace || !command} onClick={() => run(false)}>Run</button>
          <button disabled={!workspace || !command} onClick={() => run(true)}>Plan-only</button>
          <button disabled={!jobId} onClick={cancel}>Cancel</button>
          <button disabled={!jobId} onClick={reconnect}>Reconnect</button>
          <button onClick={() => setLines([])}>Clear</button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.85 }}>
          jobId: <span style={{ fontFamily: "monospace" }}>{jobId || "-"}</span> | status: {status} | lastSeq: {lastSeq}
          <div style={{ marginTop: 6 }}>
            Interactive mode: พิมพ์ข้อความด้านล่างแล้วกด Enter เพื่อส่งเข้า stdin ของ process (เหมือน CLI)
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="stdin input (press Enter)"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendInput();
            }}
          />
          <button disabled={!jobId || !stdin.trim()} onClick={sendInput}>Send</button>
        </div>

        {history.length > 0 ? (
          <details>
            <summary>History</summary>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {history.slice(0, 20).map((h, idx) => (
                <button key={idx} onClick={() => setCommand(h.command)} style={{ textAlign: "left" }}>
                  {new Date(h.ts).toLocaleString()} — {h.command}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <Terminal lines={lines} />
    </div>
  );
}
