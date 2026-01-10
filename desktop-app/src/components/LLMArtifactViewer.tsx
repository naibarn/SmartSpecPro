import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export type LLMArtifact = {
  identifier: string;
  type: string;
  title: string;
  content: string;
};

type LLMArtifactViewerProps = {
  artifact: LLMArtifact;
  onClose: () => void;
};

export function LLMArtifactViewer({ artifact, onClose }: LLMArtifactViewerProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "source">("rendered");
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const onDownload = () => {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // Determine file extension based on type
    let ext = "txt";
    if (artifact.type === "text/html") ext = "html";
    else if (artifact.type === "application/react") ext = "jsx";
    else if (artifact.type === "text/markdown") ext = "md";
    else if (artifact.type === "application/javascript") ext = "js";
    else if (artifact.type === "text/css") ext = "css";
    else if (artifact.type === "application/json") ext = "json";

    a.download = `${artifact.identifier}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (viewMode === "source") {
      return (
        <div style={{
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: 16,
          borderRadius: 8,
          overflow: "auto",
          maxHeight: "70vh",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.5,
        }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
            {artifact.content}
          </pre>
        </div>
      );
    }

    // Rendered mode
    switch (artifact.type) {
      case "text/html":
        return (
          <iframe
            srcDoc={artifact.content}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: "100%",
              minHeight: "500px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#ffffff",
            }}
            title={artifact.title}
          />
        );

      case "text/markdown":
        return (
          <div style={{
            background: "#ffffff",
            padding: 20,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            maxHeight: "70vh",
            overflow: "auto",
          }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {artifact.content}
            </ReactMarkdown>
          </div>
        );

      case "application/react":
      case "application/javascript":
      case "text/css":
      case "application/json":
        // For these types, show formatted code with syntax highlighting
        return (
          <div style={{
            background: "#ffffff",
            padding: 20,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            maxHeight: "70vh",
            overflow: "auto",
          }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {`\`\`\`${artifact.type === "application/react" || artifact.type === "application/javascript" ? "jsx" : artifact.type.split("/")[1]}\n${artifact.content}\n\`\`\``}
            </ReactMarkdown>
          </div>
        );

      default:
        return (
          <div style={{
            background: "#f9fafb",
            padding: 20,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}>
            <p>Preview not available for type: {artifact.type}</p>
            <p>Switch to "Source" view to see the content.</p>
          </div>
        );
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 16,
          maxWidth: "90vw",
          maxHeight: "90vh",
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f9fafb",
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>
              {artifact.title}
            </h3>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {artifact.type} • {artifact.identifier}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#ef4444",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Controls */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "#ffffff",
        }}>
          <div style={{
            display: "inline-flex",
            background: "#f3f4f6",
            borderRadius: 8,
            padding: 4,
            gap: 4,
          }}>
            <button
              onClick={() => setViewMode("rendered")}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                background: viewMode === "rendered" ? "#3b82f6" : "transparent",
                color: viewMode === "rendered" ? "#ffffff" : "#4b5563",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Rendered
            </button>
            <button
              onClick={() => setViewMode("source")}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                background: viewMode === "source" ? "#3b82f6" : "transparent",
                color: viewMode === "source" ? "#ffffff" : "#4b5563",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Source
            </button>
          </div>

          <button
            onClick={onCopy}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>

          <button
            onClick={onDownload}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            ⬇️ Download
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: 20,
          background: viewMode === "source" ? "#1e1e1e" : "#ffffff",
        }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
