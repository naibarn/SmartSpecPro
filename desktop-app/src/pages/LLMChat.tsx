import { useState, useRef, useMemo, useEffect } from "react";
import { chatCompletions, type Message, type ContentPart } from "../services/llmOpenAI";
import { uploadToArtifactStorage } from "../services/artifacts";
import { getProxyTokenHint, loadProxyToken, setProxyToken } from "../services/authStore";
import { LLMArtifactViewer, type LLMArtifact } from "../components/LLMArtifactViewer";
import { useMemoryStore, detectImportantContent } from "../stores/memoryStore";
import { MemoryPanel, MemoryContextMenu, MemorySaveDialog, MemoryButton, useMemoryTextSelection } from "../components/MemoryPanel";
import type { ConversationMessage } from "../services/kiloCli";

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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  // Use shared memory store
  const {
    project,
    initProject,
    getRelevantMemories,
    extractMemories,
    openMemoryDialog,
    setContextMenuPos,
  } = useMemoryStore();

  // Use shared text selection hook
  const { handleTextSelection, handleContextMenu } = useMemoryTextSelection();

  useEffect(() => {
    (async () => {
      await loadProxyToken();
      setTokenHint(getProxyTokenHint());
    })();
  }, []);

  // Initialize project when workspace changes (using shared store)
  useEffect(() => {
    if (workspace) {
      initProject(workspace);
    }
  }, [workspace, initProject]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenuPos(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [setContextMenuPos]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);


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

  const onViewArtifact = async (url: string, type: string, name: string) => {
    setViewerContent({ type, url, name });
    setFileContent(null);

    if (type === "file") {
      setLoadingFileContent(true);
      try {
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          setFileContent(text);
        }
      } catch (e) {
        console.error("Failed to load file content:", e);
      } finally {
        setLoadingFileContent(false);
      }
    }

    setArtifactViewerOpen(true);
  };

  const onSend = async () => {
    if (!input.trim() && attachments.length === 0) return;

    // Build user message content
    let userContent: string | ContentPart[];

    if (attachments.length === 0) {
      userContent = input.trim();
    } else {
      const parts: ContentPart[] = [];

      if (input.trim()) {
        parts.push({ type: "text", text: input.trim() });
      }

      for (const a of attachments) {
        if (a.kind === "image") {
          parts.push({
            type: "image_url",
            image_url: { url: a.url }
          });
        } else {
          parts.push({
            type: "file_url",
            file_url: {
              url: a.url,
              name: a.name,
              mime_type: a.mime
            }
          });
        }
      }

      userContent = parts;
    }

    const userMsg: Message = { role: "user", content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setAttachments([]);
    setBusy(true);
    setStreamingText("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Get relevant memories for context (if project is initialized)
      let memoryContext = "";
      if (project?.id) {
        try {
          const query = typeof userContent === "string" ? userContent : input.trim();
          const { context } = await getRelevantMemories(query, { limit: 5 });
          if (context) {
            memoryContext = context;
          }
        } catch (e) {
          console.log("Failed to get relevant memories:", e);
        }
      }

      // Prepare messages with memory context
      let messagesForLLM = newMessages;
      if (memoryContext) {
        // Insert memory context as a system message before the user message
        const systemMsg: Message = {
          role: "system",
          content: `[Project Memory Context]\n${memoryContext}\n\nUse this context to provide more relevant and consistent responses.`
        };
        messagesForLLM = [...newMessages.slice(0, -1), systemMsg, newMessages[newMessages.length - 1]];
      }

      let full = "";
      await chatCompletions(
        messagesForLLM,
        (chunk) => {
          full += chunk;
          setStreamingText(full);
        },
        ctrl.signal
      );

      // Parse artifacts from response
      const newArtifacts = parseArtifacts(full);
      if (newArtifacts.length > 0) {
        setArtifacts((prev) => [...prev, ...newArtifacts]);
      }

      const assistantMsg: Message = { role: "assistant", content: full };
      setMessages([...newMessages, assistantMsg]);
      setStreamingText("");

      // Try to extract memories from the conversation
      if (project?.id) {
        try {
          const conversationForExtraction: ConversationMessage[] = [
            { role: "user", content: typeof userContent === "string" ? userContent : input.trim() },
            { role: "assistant", content: full }
          ];
          await extractMemories(conversationForExtraction, "LLMChat");
        } catch (e) {
          console.log("Failed to extract memories:", e);
        }
      }

      // Check for important content in assistant response
      const detected = detectImportantContent(full);
      if (detected && detected.importance >= 8) {
        // Auto-suggest saving important content
        openMemoryDialog(full, true);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
      } else {
        alert(`Error: ${err}`);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const onCancelStream = () => {
    abortRef.current?.abort();
  };

  const onClearChat = () => {
    setMessages([messages[0]]);
    setStreamingText("");
    setArtifacts([]);
  };

  const canSend = !busy && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      height: "100vh",
      maxWidth: 1100, 
      margin: "0 auto",
      padding: "0 16px"
    }}>
      {/* Header - Fixed at top */}
      <div style={{ 
        padding: "16px 0", 
        borderBottom: "1px solid #e5e7eb",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>LLM Chat (Vision)</h2>
          <MemoryButton />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Proxy token</label>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={tokenHint ? `saved (${tokenHint})` : "paste SMARTSPEC_PROXY_TOKEN"}
            style={{ minWidth: 280, padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
            type="password"
          />
          <button 
            onClick={onSaveToken} 
            disabled={busy}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer"
            }}
          >
            Save Token
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="/path/to/workspace"
            style={{ flex: 1, minWidth: 300, padding: "6px 10px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 13 }}
          />
        </div>
      </div>

      {/* Messages Area - Scrollable */}
      <div style={{ 
        flex: 1, 
        overflow: "auto", 
        padding: "16px 0",
        display: "grid",
        gridTemplateColumns: artifacts.length > 0 ? "1fr 280px" : "1fr",
        gap: 12,
        alignContent: "start"
      }}>
        {/* Chat Messages */}
        <div 
          style={{ 
            border: "1px solid #e5e7eb", 
            borderRadius: 14, 
            padding: 12,
            minHeight: 200,
            overflow: "auto"
          }}
          onMouseUp={handleTextSelection}
          onContextMenu={handleContextMenu}
        >
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
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>🎨 {artifact.title}</div>
                              <div style={{ fontSize: 12, opacity: 0.9 }}>
                                {artifact.type} • Click to preview
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
                                cursor: "pointer",
                              }}
                              title="Click to view fullscreen"
                            />
                          </div>
                        );
                      } else if (part.type === "file_url") {
                        const isVideoFile = part.file_url.mime_type?.startsWith("video/");
                        if (isVideoFile) {
                          return (
                            <div key={i}>
                              <video
                                src={part.file_url.url}
                                controls
                                onClick={() => onViewArtifact(part.file_url.url, "video", part.file_url.name || "video")}
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: 300,
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                }}
                                title="Click to view fullscreen"
                              />
                            </div>
                          );
                        }
                        return (
                          <div
                            key={i}
                            onClick={() => onViewArtifact(part.file_url.url, "file", part.file_url.name || "file")}
                            style={{
                              padding: 8,
                              background: "#f3f4f6",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                            title="Click to view"
                          >
                            📄 {part.file_url.name || "Attached file"}
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
            
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
          )}
        </div>

        {/* Artifacts Panel */}
        {artifacts.length > 0 && (
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 12,
            background: "#f9fafb",
            maxHeight: 360,
            overflow: "auto",
            alignSelf: "start"
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
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#667eea";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(102, 126, 234, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{artifact.title}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {artifact.type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Area - Fixed at bottom */}
      <div style={{ 
        borderTop: "1px solid #e5e7eb",
        padding: "16px 0",
        background: "#ffffff",
        flexShrink: 0
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey && canSend) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={3}
          placeholder="Type your message... (Ctrl+Enter to send)"
          disabled={busy}
          style={{ 
            width: "100%", 
            borderRadius: 12, 
            padding: 12, 
            border: "1px solid #e5e7eb", 
            fontSize: 14,
            resize: "vertical",
            minHeight: 60,
            maxHeight: 200
          }}
        />

        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <div style={{ 
            border: "2px dashed #3b82f6", 
            borderRadius: 10, 
            padding: 10, 
            background: "#eff6ff",
            marginTop: 10
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#1e40af" }}>
              📎 Attached ({attachments.length})
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {attachments.map((a, i) => (
                <div key={i} style={{ 
                  background: "#ffffff", 
                  borderRadius: 6, 
                  padding: 8, 
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}>
                  <span style={{ fontSize: 16 }}>
                    {a.kind === "image" && "🖼️"}
                    {a.kind === "video" && "🎥"}
                    {a.kind === "file" && "📄"}
                  </span>
                  <span style={{ fontSize: 12, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name}
                  </span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    disabled={busy}
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: "1px solid #ef4444",
                      background: "#fee2e2",
                      color: "#dc2626",
                      cursor: busy ? "not-allowed" : "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onInsertImage}
              disabled={busy || !workspace}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#f0f9ff" : "#f9fafb",
                color: workspace && !busy ? "#0369a1" : "#9ca3af",
                fontSize: 12,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              🖼️ Insert Picture
            </button>
            <button
              onClick={onInsertVideo}
              disabled={busy || !workspace}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#fef3f2" : "#f9fafb",
                color: workspace && !busy ? "#b91c1c" : "#9ca3af",
                fontSize: 12,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              🎥 Insert Video
            </button>
            <button
              onClick={onInsertFile}
              disabled={busy || !workspace}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: workspace && !busy ? "#f0fdf4" : "#f9fafb",
                color: workspace && !busy ? "#15803d" : "#9ca3af",
                fontSize: 12,
                fontWeight: 500,
                cursor: workspace && !busy ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              📎 Attach File
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {busy && (
              <button
                onClick={onCancelStream}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #ef4444",
                  background: "#fee2e2",
                  color: "#dc2626",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                ❌ Cancel
              </button>
            )}
            <button
              onClick={onSend}
              disabled={!canSend}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "none",
                background: canSend ? "#10b981" : "#d1d5db",
                color: canSend ? "#ffffff" : "#6b7280",
                fontSize: 13,
                fontWeight: 600,
                cursor: canSend ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              {busy ? "⏳ Sending..." : "📤 Send"}
            </button>
            <button
              onClick={onClearChat}
              disabled={busy || messages.length <= 1}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #ef4444",
                background: "#ffffff",
                color: "#ef4444",
                fontSize: 13,
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

        <div style={{ fontSize: 10, opacity: 0.5, textAlign: "center", marginTop: 8 }}>
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
            Processing...
          </div>
          <style>
            {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
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
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
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
                  <div>
                    <p>Unable to preview this file type.</p>
                    <a href={viewerContent.url} target="_blank" rel="noopener noreferrer">
                      Download file →
                    </a>
                  </div>
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

      {/* Shared Memory Components */}
      <MemoryContextMenu />
      <MemorySaveDialog />
      <MemoryPanel />
    </div>
  );
}
