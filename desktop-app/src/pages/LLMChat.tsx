import { useEffect, useMemo, useRef, useState } from "react";
import { chatCompletions, chatCompletionsStream, type Message, type ContentPart } from "../services/llmOpenAI";
import { uploadToArtifactStorage } from "../services/artifacts";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";
import { LLMArtifactViewer, type LLMArtifact } from "../components/LLMArtifactViewer";

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

/**
 * Parse artifact XML tags from LLM response
 * Format: <artifact identifier="id" type="type" title="title">content</artifact>
 */
function parseArtifacts(text: string): LLMArtifact[] {
  const artifacts: LLMArtifact[] = [];
  const regex = /<artifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/artifact>/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    artifacts.push({
      identifier: match[1],
      type: match[2],
      title: match[3],
      content: match[4].trim(),
    });
  }

  return artifacts;
}

/**
 * Remove artifact XML tags from text, leaving just the descriptive text
 */
function stripArtifactTags(text: string): string {
  return text.replace(/<artifact\s+identifier="[^"]+"\s+type="[^"]+"\s+title="[^"]+">([\s\S]*?)<\/artifact>/g, "");
}

export default function LLMChatPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: `You are a helpful assistant with artifact creation capabilities.

When the user asks to "show in canvas", "create artifact", "display in preview", or similar, you can create interactive artifacts.

To create an artifact, use this XML format:

<artifact identifier="unique-id" type="artifact-type" title="Artifact Title">
content here
</artifact>

Supported artifact types:
- text/html: HTML pages with CSS/JS
- application/react: React components (JSX)
- text/markdown: Markdown documents
- application/javascript: JavaScript code
- text/css: CSS stylesheets
- application/json: JSON data with visualization

Example - HTML artifact:
<artifact identifier="thai-translation-1" type="text/html" title="Thai Translation">
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { font-family: sans-serif; padding: 20px; }</style>
</head>
<body>
  <h1>คำแปลภาษาไทย</h1>
  <p>เนื้อหาที่แปลแล้ว...</p>
</body>
</html>
</artifact>

Example - React component:
<artifact identifier="counter-app-1" type="application/react" title="Counter App">
export default function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <div style={{ padding: 20 }}>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
</artifact>

IMPORTANT: Always create artifacts when user requests interactive displays, visualizations, or formatted outputs.`,
    },
  ]);
  const [streamingText, setStreamingText] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokenHint, setTokenHint] = useState<string>("");

  // Artifact viewer state
  const [artifactViewerOpen, setArtifactViewerOpen] = useState(false);
  const [viewerContent, setViewerContent] = useState<{ type: string; url: string; name: string } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFileContent, setLoadingFileContent] = useState(false);

  // Artifacts from LLM responses
  const [artifacts, setArtifacts] = useState<LLMArtifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<LLMArtifact | null>(null);

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
    console.log("🖼️ Insert Image clicked");
    const file = await pickFile("image/*");
    console.log("📁 File selected:", file?.name, file?.type, file?.size);

    if (!file) {
      console.log("❌ No file selected");
      return;
    }
    if (!isImage(file.type)) {
      console.log("❌ Not an image:", file.type);
      return alert("Selected file is not an image.");
    }
    if (!workspace) {
      console.log("❌ No workspace");
      return alert("Workspace is required (for artifact session binding).");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      console.log("❌ File too large:", file.size);
      return alert("Image is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      console.log("⬆️ Uploading to artifact storage...");
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      console.log("✅ Upload success:", up);

      const attachment = {
        kind: "image" as const,
        name: up.name,
        mime: up.contentType,
        artifactKey: up.key,
        url: up.getUrl
      };
      console.log("📎 Adding attachment:", attachment);

      setAttachments((prev) => {
        const next = [...prev, attachment];
        console.log("📎 Attachments updated:", next);
        return next;
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      alert(`Failed to upload image: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onInsertVideo = async () => {
    console.log("🎥 Insert Video clicked");
    const file = await pickFile("video/*");
    console.log("📁 File selected:", file?.name, file?.type, file?.size);

    if (!file) {
      console.log("❌ No file selected");
      return;
    }
    if (!isVideo(file.type)) {
      console.log("❌ Not a video:", file.type);
      return alert("Selected file is not a video.");
    }
    if (!workspace) {
      console.log("❌ No workspace");
      return alert("Workspace is required (for artifact session binding).");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      console.log("❌ File too large:", file.size);
      return alert("Video is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      console.log("⬆️ Uploading to artifact storage...");
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      console.log("✅ Upload success:", up);

      const attachment = {
        kind: "video" as const,
        name: up.name,
        mime: up.contentType,
        artifactKey: up.key,
        url: up.getUrl
      };
      console.log("📎 Adding attachment:", attachment);

      setAttachments((prev) => {
        const next = [...prev, attachment];
        console.log("📎 Attachments updated:", next);
        return next;
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      alert(`Failed to upload video: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onInsertFile = async () => {
    console.log("📎 Insert File clicked");
    const file = await pickFile("*/*");
    console.log("📁 File selected:", file?.name, file?.type, file?.size);

    if (!file) {
      console.log("❌ No file selected");
      return;
    }
    if (!workspace) {
      console.log("❌ No workspace");
      return alert("Workspace is required (for artifact session binding).");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      console.log("❌ File too large:", file.size);
      return alert("File is too large. Please keep uploads under 10 MB for a smooth experience.");
    }

    setBusy(true);
    try {
      console.log("⬆️ Uploading to artifact storage...");
      const up = await uploadToArtifactStorage({ workspace, file, iteration: 0 });
      console.log("✅ Upload success:", up);

      const attachment = {
        kind: "file" as const,
        name: up.name,
        mime: up.contentType,
        artifactKey: up.key,
        url: up.getUrl
      };
      console.log("📎 Adding attachment:", attachment);

      setAttachments((prev) => {
        const next = [...prev, attachment];
        console.log("📎 Attachments updated:", next);
        return next;
      });
    } catch (error) {
      console.error("❌ Upload error:", error);
      alert(`Failed to upload file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const onCancelStream = () => abortRef.current?.abort();

  const onClearChat = () => {
    if (confirm("Clear all messages and artifacts?")) {
      setMessages([messages[0]]); // Keep system message
      setStreamingText("");
      setArtifacts([]);
      setSelectedArtifact(null);
    }
  };

  const onViewArtifact = async (url: string, type: string, name: string) => {
    setViewerContent({ url, type, name });
    setArtifactViewerOpen(true);
    setFileContent(null);

    // For text-based files, fetch and display content
    if (type === "file") {
      const ext = name.split(".").pop()?.toLowerCase();
      const textExtensions = ["md", "txt", "json", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "css", "html", "xml", "yaml", "yml", "sh", "bash", "log", "env", "gitignore", "dockerfile"];

      if (ext && textExtensions.includes(ext)) {
        setLoadingFileContent(true);
        try {
          const response = await fetch(url);
          const text = await response.text();
          setFileContent(text);
        } catch (error) {
          console.error("Failed to load file content:", error);
          setFileContent("Error: Failed to load file content");
        } finally {
          setLoadingFileContent(false);
        }
      }
    }
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const parts: ContentPart[] = [];

    // If no text but has attachments, add default analysis prompt
    const messageText = text || (attachments.length > 0 ? "Please analyze this." : "");
    if (messageText) parts.push({ type: "text", text: messageText });

    // Convert attachments to base64 data URLs (OpenRouter can't fetch from private URLs)
    for (const a of attachments) {
      if (a.kind === "image") {
        try {
          // Fetch image and convert to base64
          const response = await fetch(a.url);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          parts.push({ type: "image_url", image_url: { url: base64, detail: "auto" } });
        } catch (err) {
          console.error("Failed to convert image to base64:", err);
          // Fallback to URL if conversion fails
          parts.push({ type: "image_url", image_url: { url: a.url, detail: "auto" } });
        }
      } else if (a.kind === "video") {
        // Video - send as file_url
        parts.push({ type: "file_url", file_url: { url: a.url, mime_type: a.mime, name: a.name } });
      } else {
        // File - check if text-based, if so fetch content and send as text
        const ext = a.name.split(".").pop()?.toLowerCase();
        const textExtensions = ["md", "txt", "json", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "css", "html", "xml", "yaml", "yml", "sh", "bash", "log", "env"];

        if (ext && textExtensions.includes(ext)) {
          try {
            const response = await fetch(a.url);
            const fileContent = await response.text();
            // Add file content as text part
            parts.push({
              type: "text",
              text: `File: ${a.name}\n\`\`\`${ext}\n${fileContent}\n\`\`\``,
            });
          } catch (err) {
            console.error("Failed to fetch file content:", err);
            parts.push({ type: "file_url", file_url: { url: a.url, mime_type: a.mime, name: a.name } });
          }
        } else {
          // Binary file - send as file_url
          parts.push({ type: "file_url", file_url: { url: a.url, mime_type: a.mime, name: a.name } });
        }
      }
    }

    const userMsg: Message = {
      role: "user",
      content: parts.length === 1 && parts[0].type === "text" ? text : parts,
    };

    // Add user message to UI
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setStreamingText("");

    setBusy(true);
    abortRef.current = new AbortController();

    try {
      // Send only last 10 messages to avoid huge context with base64 images
      // Include system message + recent conversation
      const recentMessages = messages.slice(0, 1).concat(messages.slice(-9)).concat([userMsg]);

      // Use non-streaming mode (backend direct proxy mode doesn't support streaming)
      const response = await chatCompletions({
        model: "gpt-4o-mini",
        messages: recentMessages,
        temperature: 0.3,
        max_tokens: 2000,
      });

      const assistantMessage = response?.choices?.[0]?.message?.content || "No response";

      // Parse artifacts from response
      const parsedArtifacts = parseArtifacts(assistantMessage);
      if (parsedArtifacts.length > 0) {
        setArtifacts((prev) => [...prev, ...parsedArtifacts]);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e?.message || "Unknown error"}` }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>LLM Chat (Multi‑modal via Artifact Storage)</h2>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Desktop → python-backend <code>/v1/chat/completions</code> (Direct Proxy Mode)
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
          style={{ minWidth: 520, padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: artifacts.length > 0 ? "1fr 300px" : "1fr", gap: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, minHeight: 360 }}>
          {display.length === 0 && !streamingText ? (
            <div style={{ opacity: 0.7 }}>No messages yet.</div>
          ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {display.map((m, idx) => {
              // Helper to render content parts
              const renderContent = (content: string | ContentPart[]) => {
                if (typeof content === "string") {
                  // Check if this message contains artifacts
                  const messageArtifacts = parseArtifacts(content);
                  const textWithoutArtifacts = stripArtifactTags(content);

                  return (
                    <div>
                      {textWithoutArtifacts && (
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, marginBottom: messageArtifacts.length > 0 ? 12 : 0 }}>
                          {textWithoutArtifacts}
                        </div>
                      )}
                      {messageArtifacts.length > 0 && (
                        <div style={{ display: "grid", gap: 8 }}>
                          {messageArtifacts.map((artifact, i) => (
                            <div
                              key={i}
                              onClick={() => setSelectedArtifact(artifact)}
                              style={{
                                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                                color: "#ffffff",
                                padding: 16,
                                borderRadius: 12,
                                cursor: "pointer",
                                border: "2px solid transparent",
                                transition: "all 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.border = "2px solid #4c1d95";
                                e.currentTarget.style.transform = "translateY(-2px)";
                                e.currentTarget.style.boxShadow = "0 4px 12px rgba(102, 126, 234, 0.4)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.border = "2px solid transparent";
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "none";
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                <span style={{ fontSize: 24 }}>🎨</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 16, fontWeight: 600 }}>{artifact.title}</div>
                                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                                    {artifact.type} • Click to view
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // Content is array of parts
                return (
                  <div style={{ display: "grid", gap: 8 }}>
                    {content.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                            {part.text}
                          </div>
                        );
                      } else if (part.type === "image_url") {
                        return (
                          <div key={i}>
                            <img
                              src={part.image_url.url}
                              alt="User uploaded image"
                              onClick={() => onViewArtifact(part.image_url.url, "image", "Uploaded image")}
                              style={{
                                maxWidth: "100%",
                                maxHeight: 300,
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                                objectFit: "contain",
                                cursor: "pointer",
                              }}
                              title="Click to view fullscreen"
                            />
                          </div>
                        );
                      } else if (part.type === "file_url") {
                        const isVideo = part.file_url.mime_type?.startsWith("video/");
                        if (isVideo) {
                          return (
                            <div key={i}>
                              <video
                                src={part.file_url.url}
                                controls
                                onClick={() => onViewArtifact(part.file_url.url, "video", part.file_url.name)}
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: 300,
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  cursor: "pointer",
                                }}
                                title="Click to view fullscreen"
                              />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={i}
                            onClick={() => onViewArtifact(part.file_url.url, "file", part.file_url.name)}
                            style={{
                              padding: 8,
                              background: "#f3f4f6",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                            title="Click to view"
                          >
                            📄 {part.file_url.name} ({part.file_url.mime_type})
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                );
              };

              return (
                <div key={idx} style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{m.role}</div>
                  {renderContent(m.content)}
                </div>
              );
            })}

            {streamingText ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>assistant (streaming)</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{streamingText}</div>
              </div>
            ) : null}
          </div>
        )}
        </div>

        {/* Artifacts Sidebar */}
        {artifacts.length > 0 && (
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 12,
            background: "#f9fafb",
            maxHeight: 360,
            overflow: "auto",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#111827" }}>
              🎨 Artifacts ({artifacts.length})
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {artifacts.map((artifact, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedArtifact(artifact)}
                  style={{
                    background: "#ffffff",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f3f4f6";
                    e.currentTarget.style.borderColor = "#3b82f6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ffffff";
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
                    {artifact.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {artifact.type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={4}
          placeholder="Type your message… (Ctrl+Enter to send)"
          disabled={busy}
          style={{ width: "100%", borderRadius: 14, padding: 12, border: "1px solid #e5e7eb", fontSize: 14 }}
        />

        {/* Attachments Preview - below textarea */}
        {attachments.length > 0 && (
          <div style={{ border: "2px dashed #3b82f6", borderRadius: 12, padding: 12, background: "#eff6ff" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#1e40af" }}>
              📎 Attached Files ({attachments.length})
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {attachments.map((a, i) => (
                <div key={i} style={{ background: "#ffffff", borderRadius: 8, padding: 12, border: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>
                        {a.kind === "image" && "🖼️"}
                        {a.kind === "video" && "🎥"}
                        {a.kind === "file" && "📄"}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{a.mime}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      disabled={busy}
                      style={{
                        fontSize: 12,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #ef4444",
                        background: "#fee2e2",
                        color: "#dc2626",
                        cursor: busy ? "not-allowed" : "pointer",
                        fontWeight: 500,
                      }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                  {/* Preview */}
                  {a.kind === "image" && (
                    <img
                      src={a.url}
                      alt={a.name}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 200,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        objectFit: "contain",
                      }}
                    />
                  )}
                  {a.kind === "video" && (
                    <video
                      src={a.url}
                      controls
                      style={{
                        maxWidth: "100%",
                        maxHeight: 200,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                  )}
                  {a.kind === "file" && (
                    <div style={{ padding: 12, background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280" }}>
                      File attached (preview not available for this type)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onInsertImage}
              disabled={busy || !workspace}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#f0f9ff" : "#f9fafb",
                color: workspace && !busy ? "#0369a1" : "#9ca3af",
                fontSize: 13,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              🖼️ Insert Picture
            </button>
            <button
              onClick={onInsertVideo}
              disabled={busy || !workspace}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#fef3f2" : "#f9fafb",
                color: workspace && !busy ? "#b91c1c" : "#9ca3af",
                fontSize: 13,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              🎥 Insert Video
            </button>
            <button
              onClick={onInsertFile}
              disabled={busy || !workspace}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#f0fdf4" : "#f9fafb",
                color: workspace && !busy ? "#15803d" : "#9ca3af",
                fontSize: 13,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              📎 Attach File
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {busy ? (
              <button
                onClick={onCancelStream}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #ef4444",
                  background: "#fee2e2",
                  color: "#dc2626",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                ❌ Cancel
              </button>
            ) : null}
            <button
              onClick={onSend}
              disabled={!canSend}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: canSend ? "#10b981" : "#d1d5db",
                color: canSend ? "#ffffff" : "#6b7280",
                fontSize: 14,
                fontWeight: 600,
                cursor: canSend ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              {busy ? "⏳ Sending..." : "📤 Send"}
            </button>
            <button
              onClick={onClearChat}
              disabled={busy || messages.length <= 1}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #ef4444",
                background: "#ffffff",
                color: "#ef4444",
                fontSize: 14,
                fontWeight: 600,
                cursor: messages.length > 1 && !busy ? "pointer" : "not-allowed",
                opacity: messages.length > 1 && !busy ? 1 : 0.5,
              }}
              title="Clear all messages"
            >
              🗑️ Clear Chat
            </button>
          </div>
        </div>

        <div style={{ fontSize: 11, opacity: 0.6, textAlign: "center" }}>
          Multi‑modal flow: Insert media → upload → send as <code>image_url/file_url</code> • Ctrl+Enter to send • Click image/video to view fullscreen
        </div>
      </div>

      {/* Loading Overlay */}
      {busy && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              border: "4px solid rgba(255, 255, 255, 0.3)",
              borderTop: "4px solid #ffffff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <div style={{ color: "#ffffff", fontSize: 16, fontWeight: 500 }}>
            กำลังประมวลผล...
          </div>
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {/* Artifact Viewer Modal */}
      {artifactViewerOpen && viewerContent && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            padding: 20,
          }}
          onClick={() => setArtifactViewerOpen(false)}
        >
          <div style={{ position: "absolute", top: 20, right: 20, color: "#fff", fontSize: 14 }}>
            <button
              onClick={() => setArtifactViewerOpen(false)}
              style={{
                padding: "8px 16px",
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ✕ Close
            </button>
          </div>
          <div style={{ color: "#fff", marginBottom: 16, fontSize: 14 }}>{viewerContent.name}</div>
          <div
            style={{
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {viewerContent.type === "image" && (
              <img
                src={viewerContent.url}
                alt={viewerContent.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  objectFit: "contain",
                }}
              />
            )}
            {viewerContent.type === "video" && (
              <video
                src={viewerContent.url}
                controls
                autoPlay
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                }}
              />
            )}
            {viewerContent.type === "file" && (
              <div style={{ background: "#fff", padding: 20, borderRadius: 8, color: "#000", maxWidth: "90vw", maxHeight: "80vh", overflow: "auto" }}>
                {loadingFileContent ? (
                  <div>Loading file content...</div>
                ) : fileContent ? (
                  <>
                    <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0 }}>{viewerContent.name}</h3>
                      <a href={viewerContent.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
                        Open in new tab →
                      </a>
                    </div>
                    <pre style={{
                      background: "#f3f4f6",
                      padding: 16,
                      borderRadius: 6,
                      overflow: "auto",
                      fontSize: 13,
                      lineHeight: 1.5,
                      fontFamily: "monospace",
                      whiteSpace: "pre-wrap",
                      wordWrap: "break-word",
                    }}>
                      {fileContent}
                    </pre>
                  </>
                ) : (
                  <>
                    <h3>File Preview Not Available</h3>
                    <p>{viewerContent.name}</p>
                    <a href={viewerContent.url} target="_blank" rel="noopener noreferrer">
                      Open in new tab →
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LLM Artifact Viewer */}
      {selectedArtifact && (
        <LLMArtifactViewer
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
        />
      )}
    </div>
  );
}
