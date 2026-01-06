import { useMemo, useRef, useState } from "react";
import {
  approveTool,
  buildUserMessageWithOptionalImage,
  chatStream,
  ChatMessage,
  ToolApprovalRequired,
  ToolStatus,
} from "../services/llmOpenAI";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";

type UIMessage = { role: "user" | "assistant" | "system"; text: string };

type ToolActivity = {
  ts: number;
  phase: string;
  name?: string;
  ok?: boolean;
  toolCallId?: string;
  argsHash?: string;
  resultHash?: string;
  message?: string;
};

type PendingApproval = {
  traceId: string;
  toolCallId: string;
  name?: string;
  reason?: string;
  writeToken?: string;
  status?: "pending" | "approved" | "denied" | "error";
  error?: string;
};

export default function LLMChatPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msgs, setMsgs] = useState<UIMessage[]>([{ role: "system", text: "You are an assistant. Reply concisely." }]);
  const [streaming, setStreaming] = useState(false);
  const [traceId, setTraceId] = useState<string>("");
  const [activity, setActivity] = useState<ToolActivity[]>([]);
  const [runningTool, setRunningTool] = useState<string>("");
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);

  const chatMessages: ChatMessage[] = useMemo(
    () => msgs.map((m) => ({ role: m.role, content: m.text })) as ChatMessage[],
    [msgs]
  );

  const assistantDraftRef = useRef<string>("");

  function handleToolStatus(s: ToolStatus) {
    if (s.phase === "start" && s.name) setRunningTool(s.name);
    if (s.phase === "end" || s.phase === "limit") setRunningTool("");

    setActivity((prev) =>
      [
        {
          ts: Date.now(),
          phase: s.phase,
          name: s.name,
          ok: s.ok,
          toolCallId: s.toolCallId,
          argsHash: s.argsHash,
          resultHash: s.resultHash,
          message: s.message,
        },
        ...prev,
      ].slice(0, 200)
    );
  }

  function handleApprovalRequired(a: ToolApprovalRequired) {
    setApprovals((prev) => {
      const exists = prev.some((p) => p.traceId === a.traceId && p.toolCallId === a.toolCallId);
      if (exists) return prev;
      return [{ traceId: a.traceId, toolCallId: a.toolCallId, name: a.name, reason: a.reason, status: "pending" }, ...prev].slice(0, 50);
    });
  }

  async function doApprove(item: PendingApproval, approved: boolean) {
    setApprovals((prev) =>
      prev.map((p) =>
        p.traceId === item.traceId && p.toolCallId === item.toolCallId ? { ...p, status: approved ? "approved" : "denied" } : p
      )
    );
    try {
      await approveTool({
        traceId: item.traceId,
        toolCallId: item.toolCallId,
        approved,
        writeToken: item.writeToken,
      });
    } catch (e: any) {
      setApprovals((prev) =>
        prev.map((p) =>
          p.traceId === item.traceId && p.toolCallId === item.toolCallId
            ? { ...p, status: "error", error: String(e?.message || e) }
            : p
        )
      );
    }
  }

  async function send() {
    if (!workspace) return;
    if (!input.trim() && !file) return;
    if (streaming) return;

    setStreaming(true);
    setActivity([]);
    setTraceId("");
    setRunningTool("");
    setApprovals([]);

    setMsgs((prev) => [...prev, { role: "user", text: file ? `${input}\n[image attached: ${file.name}]` : input }]);

    const built = await buildUserMessageWithOptionalImage({ workspace, text: input, file });
    const userMsg = built.message;

    assistantDraftRef.current = "";
    setMsgs((prev) => [...prev, { role: "assistant", text: "" }]);

    await chatStream({
      messages: [...chatMessages, userMsg],
      handlers: {
        onTrace: (id) => setTraceId(id),
        onToolStatus: handleToolStatus,
        onToolApprovalRequired: handleApprovalRequired,
        onToken: (tok) => {
          assistantDraftRef.current += tok;
          setMsgs((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i--) {
              if (copy[i].role === "assistant") {
                copy[i] = { ...copy[i], text: assistantDraftRef.current };
                break;
              }
            }
            return copy;
          });
        },
        onDone: () => {
          setStreaming(false);
          setInput("");
          setFile(null);
          setRunningTool("");
        },
        onError: (err) => {
          setStreaming(false);
          setRunningTool("");
          setMsgs((prev) => [...prev, { role: "assistant", text: `Error: ${err}` }]);
        },
      },
    });
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>LLM Chat (Streaming • Vision • MCP tools • Audit/Trace)</h2>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {streaming ? "streaming…" : ""}
          {runningTool ? ` • tool: ${runningTool}…` : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
        <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} style={{ minWidth: 520 }} />
        <button
          onClick={() => {
            setMsgs([{ role: "system", text: "You are an assistant. Reply concisely." }]);
            setInput("");
            setFile(null);
            setActivity([]);
            setTraceId("");
            setRunningTool("");
            setApprovals([]);
          }}
        >
          Clear
        </button>
        {traceId ? (
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            traceId: <code>{traceId}</code>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
          {msgs.map((m, idx) => (
            <div key={idx} style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.7 }}>{m.role}</div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{m.text}</div>
              <div style={{ borderBottom: "1px dashed #eee" }} />
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800 }}>Tool Activity</div>
            {runningTool ? (
              <div style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid #ddd" }}>
                running: <code>{runningTool}</code>
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7 }}>idle</div>
            )}
          </div>

          {approvals.length > 0 ? (
            <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Write Approval Required</div>
              <div style={{ display: "grid", gap: 10 }}>
                {approvals.map((a, idx) => (
                  <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                      {a.name || "tool"} • callId: <code>{a.toolCallId}</code>
                    </div>
                    {a.reason ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>reason: {a.reason}</div> : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        placeholder="writeToken (ถ้าตั้ง MCP_WRITE_TOKEN)"
                        value={a.writeToken || ""}
                        onChange={(e) =>
                          setApprovals((prev) =>
                            prev.map((p) =>
                              p.traceId === a.traceId && p.toolCallId === a.toolCallId ? { ...p, writeToken: e.target.value } : p
                            )
                          )
                        }
                        style={{ minWidth: 240 }}
                      />
                      <button disabled={a.status !== "pending"} onClick={() => doApprove(a, true)}>
                        Approve
                      </button>
                      <button disabled={a.status !== "pending"} onClick={() => doApprove(a, false)}>
                        Deny
                      </button>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        status: <code>{a.status}</code>
                        {a.error ? ` • ${a.error}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activity.length === 0 ? (
            <div style={{ opacity: 0.7, fontSize: 12 }}>No tool activity yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {activity.map((a, i) => (
                <div key={i} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {a.phase}
                    {a.name ? ` • ${a.name}` : ""}
                    {a.ok === true ? " • ok" : a.ok === false ? " • error" : ""}
                  </div>
                  {a.message ? <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{a.message}</div> : null}
                  {a.argsHash ? (
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                      argsHash: <code>{a.argsHash}</code>
                    </div>
                  ) : null}
                  {a.resultHash ? (
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      resultHash: <code>{a.resultHash}</code>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Write tools ต้อง approval ผ่าน SSE event <code>tool_approval_required</code> + POST <code>/v1/tool-approve</code>.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          rows={4}
          style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb", padding: 10 }}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <div style={{ fontSize: 12, opacity: 0.8 }}>Attached: {file.name}</div> : null}
          <button disabled={streaming || (!input.trim() && !file)} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
