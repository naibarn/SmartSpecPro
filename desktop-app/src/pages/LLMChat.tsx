import { useMemo, useRef, useState } from "react";
import { buildUserMessageWithOptionalImage, chatStream, ChatMessage } from "../services/llmOpenAI";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";

type UIMessage = {
  role: "user" | "assistant" | "system";
  text: string;
};

export default function LLMChatPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msgs, setMsgs] = useState<UIMessage[]>([
    { role: "system", text: "You are an assistant. Reply concisely." },
  ]);
  const [streaming, setStreaming] = useState(false);

  const chatMessages: ChatMessage[] = useMemo(() => {
    return msgs.map(m => ({ role: m.role, content: m.text })) as ChatMessage[];
  }, [msgs]);

  const assistantDraftRef = useRef<string>("");

  async function send() {
    if (!workspace) return;
    if (!input.trim() && !file) return;
    if (streaming) return;

    setStreaming(true);

    setMsgs(prev => [...prev, { role: "user", text: file ? `${input}\n[image attached: ${file.name}]` : input }]);

    const built = await buildUserMessageWithOptionalImage({ workspace, text: input, file });
    const userMsg = built.message;

    assistantDraftRef.current = "";
    setMsgs(prev => [...prev, { role: "assistant", text: "" }]);

    await chatStream({
      messages: [...chatMessages, userMsg],
      handlers: {
        onToken: (tok) => {
          assistantDraftRef.current += tok;
          setMsgs(prev => {
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
        },
        onError: (err) => {
          setStreaming(false);
          setMsgs(prev => [...prev, { role: "assistant", text: `Error: ${err}` }]);
        },
      },
    });
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>LLM Chat (Streaming • Vision • MCP tools)</h2>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{streaming ? "streaming…" : ""}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
        <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} style={{ minWidth: 520 }} />
        <button
          onClick={() => {
            setMsgs([{ role: "system", text: "You are an assistant. Reply concisely." }]);
            setInput("");
            setFile(null);
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
        {msgs.map((m, idx) => (
          <div key={idx} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.7 }}>{m.role}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{m.text}</div>
            <div style={{ borderBottom: "1px dashed #eee" }} />
          </div>
        ))}
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

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          รูปจะถูกอัปโหลดไป Artifact Storage (presign PUT/GET) และส่งเข้า LLM ผ่าน <code>image_url</code>.
          Tool calling จะถูกทำอัตโนมัติผ่าน MCP (proxy ฝั่ง python-backend) และแสดงผลเป็นคำตอบต่อเนื่องแบบ streaming.
        </div>
      </div>
    </div>
  );
}
