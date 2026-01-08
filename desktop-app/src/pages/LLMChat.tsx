import { useEffect, useMemo, useRef, useState } from "react";
import { chatCompletionsStream, type Message, type ContentPart } from "../services/llmOpenAI";
import { uploadToArtifactStorage } from "../services/artifacts";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";
import { ArtifactCanvas } from "../components/ArtifactCanvas";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

type Attachment = {
  kind: "image" | "video" | "file";
  name: string;
  mime: string;
  artifactKey: string;
  url: string; // presigned GET (LLM-accessible)
};

function isImage(m?: string) {
  return !!m && m.startsWith("image/");
}
function isVideo(m?: string) {
  return !!m && m.startsWith("video/");
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = "file";
    el.accept = accept;
    el.onchange = () => resolve(el.files?.[0] ?? null);
    el.click();
  });
}

export default function LLMChatPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "You are a helpful assistant. If the user provides images or videos, analyze them carefully." },
  ]);
  const [streamingText, setStreamingText] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");

  useEffect(() => {
    (async () => {
      await loadProxyToken();
      setTokenHint(getProxyTokenHint());
    })();
  }, []);


  const display = useMemo(() => messages.filter((m) => m.role !== "system"), [messages]);

  const onSaveToken = async () => {
    await setProxyToken(tokenInput.trim());
    setTokenInput("");
    setTokenHint(getProxyTokenHint());
    alert("Saved proxy token locally (OS keychain when available).");
  };

  const onInsertImage = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    if (!isImage(file.type)) return alert("Selected file is not an image.");
    if (!workspace) return alert("Workspace is required (for artifact session binding).");
    if (file.size > MAX_UPLOAD_BYTES) {
      return alert("Image is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      setAttachments((prev) => [
        ...prev,
        { kind: "image", name: up.name, mime: up.contentType, artifactKey: up.key, url: up.getUrl },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onInsertVideo = async () => {
    const file = await pickFile("video/*");
    if (!file) return;
    if (!isVideo(file.type)) return alert("Selected file is not a video.");
    if (!workspace) return alert("Workspace is required (for artifact session binding).");
    if (file.size > MAX_UPLOAD_BYTES) {
      return alert("Video is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      setAttachments((prev) => [
        ...prev,
        { kind: "video", name: up.name, mime: up.contentType, artifactKey: up.key, url: up.getUrl },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onInsertFile = async () => {
    const file = await pickFile("*/*");
    if (!file) return;
    if (!workspace) return alert("Workspace is required (for artifact session binding).");
    if (file.size > MAX_UPLOAD_BYTES) {
      return alert("File is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      setAttachments((prev) => [
        ...prev,
        { kind: "file", name: up.name, mime: up.contentType, artifactKey: up.key, url: up.getUrl },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const onCancelStream = () => abortRef.current?.abort();

  const onSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });

    for (const a of attachments) {
      if (a.kind === "image") {
        parts.push({ type: "image_url", image_url: { url: a.url, detail: "auto" } });
      } else {
        parts.push({ type: "file_url", file_url: { url: a.url, mime_type: a.mime, name: a.name } });
      }
    }

    const userMsg: Message = {
      role: "user",
      content: parts.length === 1 && parts[0].type === "text" ? text : parts,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    setStreamingText("");

    setBusy(true);
    abortRef.current = new AbortController();

    try {
      let acc = "";
      for await (const ev of chatCompletionsStream({
        model: "gpt-4o-mini",
        messages: nextMessages,
        temperature: 0.3,
        max_tokens: 2000,
      })) {
        if (abortRef.current?.signal.aborted) break;
        if (ev.text) {
          acc += ev.text;
          setStreamingText(acc);
        }
      }

      const finalText = acc || "No response";
      setMessages((prev) => [...prev, { role: "assistant", content: finalText }]);
      setStreamingText("");
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e?.message || "Unknown error"}` }]);
      setStreamingText("");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>LLM Chat (Streaming + Multi‑modal via Artifact Storage)</h2>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Desktop → python-backend <code>/v1/chat/completions</code> → SmartSpecWeb Gateway
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Proxy token</label>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder={tokenHint ? `saved (${tokenHint})` : "paste SMARTSPEC_PROXY_TOKEN"}
          style={{ minWidth: 320 }}
          type="password"
        />
        <button onClick={onSaveToken} disabled={busy}>
          Save Token
        </button>

        <span style={{ fontSize: 12, opacity: 0.6 }}>
          (runtime local only — avoid baking secrets in build)
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
        <input
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="/path/to/workspace"
          style={{ minWidth: 520 }}
        />
        <button onClick={onInsertImage} disabled={busy || !workspace}>
          Insert Picture
        </button>
        <button onClick={onInsertVideo} disabled={busy || !workspace}>
          Insert Video
        </button>
        <button onClick={onInsertFile} disabled={busy || !workspace}>
          Attach File
        </button>
        {busy ? (
          <button onClick={onCancelStream} style={{ marginLeft: 8 }}>
            Cancel
          </button>
        ) : null}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, minHeight: 360 }}>
        {display.length === 0 && !streamingText ? (
          <div style={{ opacity: 0.7 }}>No messages yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {display.map((m, idx) => (
              <div key={idx} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{m.role}</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                  {typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}
                </div>
              </div>
            ))}

            {streamingText ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>assistant (streaming)</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{streamingText}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {attachments.length > 0 ? (
        <div style={{ border: "1px dashed #e5e7eb", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Attachments</div>
          <div style={{ display: "grid", gap: 10 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: "grid", gap: 6 }}>
                <ArtifactCanvas
                  attachment={{
                    kind: a.kind,
                    name: a.name,
                    mime: a.mime,
                    url: a.url,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    disabled={busy}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#fafafa",
                    }}
                  >
                    remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="Type your message…"
          disabled={busy}
          style={{ width: "100%", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb" }}
        />
        <button onClick={onSend} disabled={!canSend} style={{ height: 48 }}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Multi‑modal flow: Insert media → <code>presign PUT</code> → upload → <code>presign GET</code> → send as <code>image_url/file_url</code>.
      </div>
    </div>
  );
}
