/**
 * LLMArtifactViewer — Fullscreen viewer for LLM-generated artifacts
 * Renders HTML, Markdown, React, JS/CSS/JSON with source/rendered toggle
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Copy, Check, Download, Code, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeMarkdown } from "../SafeMarkdown";

export interface LLMArtifact {
  identifier: string;
  type: string;
  title: string;
  content: string;
}

interface LLMArtifactViewerProps {
  artifact: LLMArtifact;
  onClose: () => void;
}

const EXT_MAP: Record<string, string> = {
  "text/html": "html",
  "application/react": "jsx",
  "text/markdown": "md",
  "application/javascript": "js",
  "text/css": "css",
  "application/json": "json",
};

const LANG_MAP: Record<string, string> = {
  "application/react": "jsx",
  "application/javascript": "javascript",
  "text/css": "css",
  "application/json": "json",
};

export function LLMArtifactViewer({ artifact, onClose }: LLMArtifactViewerProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "source">("rendered");
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const onDownload = () => {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.identifier}.${EXT_MAP[artifact.type] || "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (viewMode === "source") {
      return (
        <pre className="m-0 whitespace-pre-wrap break-words bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-lg overflow-auto max-h-[70vh] font-mono text-sm leading-relaxed">
          {artifact.content}
        </pre>
      );
    }

    switch (artifact.type) {
      case "text/html":
        return (
          <iframe
            srcDoc={artifact.content}
            sandbox="allow-scripts"
            className="w-full min-h-[500px] border rounded-lg bg-white"
            title={artifact.title}
          />
        );

      case "text/markdown":
        return (
          <div className="bg-white p-5 rounded-lg border max-h-[70vh] overflow-auto prose prose-sm max-w-none">
            <SafeMarkdown>{artifact.content}</SafeMarkdown>
          </div>
        );

      case "application/react":
      case "application/javascript":
      case "text/css":
      case "application/json": {
        const lang = LANG_MAP[artifact.type] || "text";
        return (
          <div className="bg-white p-5 rounded-lg border max-h-[70vh] overflow-auto">
            <SafeMarkdown>{`\`\`\`${lang}\n${artifact.content}\n\`\`\``}</SafeMarkdown>
          </div>
        );
      }

      default:
        return (
          <div className="bg-muted p-5 rounded-lg border text-muted-foreground">
            <p>Preview not available for type: {artifact.type}</p>
            <p className="text-sm mt-1">Switch to "Source" view to see the content.</p>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-5"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl max-w-[90vw] max-h-[90vh] w-full overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
          <div>
            <h3 className="text-lg font-semibold">{artifact.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">{artifact.type}</Badge>
              <span className="text-xs text-muted-foreground">{artifact.identifier}</span>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={onClose} className="gap-1">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-5 py-3 border-b">
          <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
            <Button
              variant={viewMode === "rendered" ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setViewMode("rendered")}
            >
              <Eye className="h-3.5 w-3.5" />
              Rendered
            </Button>
            <Button
              variant={viewMode === "source" ? "default" : "ghost"}
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setViewMode("source")}
            >
              <Code className="h-3.5 w-3.5" />
              Source
            </Button>
          </div>

          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>

          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>

        {/* Content */}
        <div className={cn(
          "flex-1 overflow-auto p-5",
          viewMode === "source" ? "bg-[#1e1e1e]" : "bg-background"
        )}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

/**
 * Parse artifact XML tags from LLM response text.
 * Format: <artifact identifier="id" type="type" title="title">content</artifact>
 */
export function parseArtifacts(text: string): LLMArtifact[] {
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
 * Remove artifact XML tags from text, leaving descriptive text around them.
 */
export function stripArtifactTags(text: string): string {
  return text.replace(
    /<artifact\s+identifier="[^"]+"\s+type="[^"]+"\s+title="[^"]+">([\s\S]*?)<\/artifact>/g,
    ""
  ).trim();
}
