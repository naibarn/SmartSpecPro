/**
 * ExecutionLogPanel - Chronological execution log viewer with rich output rendering.
 *
 * Displays execution events with timestamps, status icons, and expandable
 * output details. Output is rendered based on detected content type:
 * images, video, markdown, tables, files, or raw JSON fallback.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import {
  Check,
  X,
  Loader2,
  AlertCircle,
  Copy,
  Image,
  FileText,
  Download,
  Table,
  Play,
  Clock,
} from "lucide-react";
import { useLocation } from "wouter";
import { useExecutionStore, type LogEntry } from "@/stores/executionStore";
import { BrowserSessionSummaryCard } from "@/components/browser-session/BrowserSessionSummaryCard";
import { ComparisonPreviewCard } from "@/components/comparison/ComparisonPreviewCard";
import { buildBrowserSessionPath } from "@/lib/browserSessionRouting";
import {
  getWorkflowBrowserSessionArtifact,
  normalizeWorkflowComparisonPreview,
  stripWorkflowPresentationFields,
} from "@/lib/workflow/outputPresentation";
import { ApprovalPanel } from "./ApprovalPanel";

export interface ExecutionLogPanelProps {
  className?: string;
}

export function ExecutionLogPanel({ className = "" }: ExecutionLogPanelProps) {
  const logs = useExecutionStore((state) => state.getLogs());
  const executionId = useExecutionStore((state) => state.executionId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (logs.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>No execution logs yet</p>
        <p className="text-sm mt-1">Run a workflow to see execution details</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 p-4 ${className}`}>
      {logs.map((entry) => (
        <LogEntryRow
          key={entry.id}
          entry={entry}
          executionId={executionId}
          isExpanded={expandedIds.has(entry.id)}
          onToggle={() => toggleExpand(entry.id)}
          onCopy={copyToClipboard}
        />
      ))}
      <div ref={logEndRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single log entry row
// ─────────────────────────────────────────────────────────────────────

interface LogEntryRowProps {
  entry: LogEntry;
  executionId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
}

function LogEntryRow({ entry, executionId, isExpanded, onToggle, onCopy }: LogEntryRowProps) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  const isApproval = entry.eventType === "approval_required" && !!entry.approvalData;

  const statusIcon = isApproval
    ? <Clock className="w-4 h-4 text-amber-500" />
    : {
        pending: <Loader2 className="w-4 h-4 text-gray-400" />,
        running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
        success: <Check className="w-4 h-4 text-green-500" />,
        failed: <X className="w-4 h-4 text-red-500" />,
        skipped: <AlertCircle className="w-4 h-4 text-gray-400" />,
      }[entry.status];

  return (
    <div className={`border rounded-lg overflow-hidden ${isApproval ? "border-amber-300" : "border-gray-200"}`}>
      {/* Header Row */}
      <div
        className={`p-3 flex items-center gap-3 cursor-pointer ${isApproval ? "hover:bg-amber-50" : "hover:bg-gray-50"}`}
        onClick={onToggle}
      >
        <div className="text-xs text-gray-500 font-mono min-w-[80px]">{timestamp}</div>
        <div className="flex-shrink-0">{statusIcon}</div>
        <div className="flex-1 font-medium text-sm">{entry.nodeName}</div>
        {isApproval && (
          <div className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded">
            AWAITING APPROVAL
          </div>
        )}
        {entry.duration && (
          <div className="text-xs text-gray-500">{entry.duration}ms</div>
        )}
        {entry.error && (
          <div className="text-xs text-red-600 font-semibold">ERROR</div>
        )}
      </div>

      {/* Approval Panel — always visible for approval entries */}
      {isApproval && executionId && entry.approvalData && (
        <div className="px-3 pb-3">
          <ApprovalPanel
            executionId={executionId}
            nodeId={entry.nodeId}
            approvalData={entry.approvalData}
          />
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50">
          <div className="text-xs text-gray-600">
            Event: <code className="bg-gray-200 px-1 rounded">{entry.eventType}</code>
          </div>

          {/* Output — Rich Renderer */}
          {entry.output && (
            <RichOutputSection output={entry.output} onCopy={onCopy} />
          )}

          {/* Error */}
          {entry.error && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-red-700">Error:</span>
              <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">
                {entry.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rich Output Section (with view mode toggle)
// ─────────────────────────────────────────────────────────────────────

function RichOutputSection({
  output,
  onCopy,
}: {
  output: Record<string, unknown>;
  onCopy: (text: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"rich" | "json">("rich");
  const browserSessionArtifact = getWorkflowBrowserSessionArtifact(output);
  const comparisonPreview = normalizeWorkflowComparisonPreview(output);
  const displayOutput = stripWorkflowPresentationFields(output);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-700">Output:</span>
          <div className="ml-2 flex bg-gray-200 rounded overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewMode("rich");
              }}
              className={`text-[10px] px-2 py-0.5 ${
                viewMode === "rich"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 hover:bg-gray-300"
              }`}
            >
              Rich
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setViewMode("json");
              }}
              className={`text-[10px] px-2 py-0.5 ${
                viewMode === "json"
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 hover:bg-gray-300"
              }`}
            >
              JSON
            </button>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy(JSON.stringify(output, null, 2));
          }}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>

      {viewMode === "json" ? (
        <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(output, null, 2)}
        </pre>
      ) : (
        <div className="space-y-3">
          {browserSessionArtifact ? (
            <BrowserSessionSummaryCard
              artifact={browserSessionArtifact}
              onOpen={(artifact) => {
                setLocation(buildBrowserSessionPath(artifact.sessionId, artifact.launchContext));
              }}
            />
          ) : null}

          {comparisonPreview ? (
            <ComparisonPreviewCard preview={comparisonPreview} />
          ) : null}

          {displayOutput ? (
            <RichOutputRenderer output={displayOutput} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rich Output Renderer — detects type and renders accordingly
// ─────────────────────────────────────────────────────────────────────

type OutputType = "image" | "video" | "markdown" | "table" | "file" | "json";

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?.*)?$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i;

function detectOutputType(output: Record<string, unknown>): OutputType {
  // Check for image
  for (const key of ["imageUrl", "image_url", "image"]) {
    const val = output[key];
    if (typeof val === "string" && val.startsWith("http")) return "image";
  }
  if (typeof output.url === "string" && IMAGE_EXTENSIONS.test(output.url as string))
    return "image";

  // Check for video
  for (const key of ["videoUrl", "video_url", "video"]) {
    const val = output[key];
    if (typeof val === "string" && val.startsWith("http")) return "video";
  }
  if (typeof output.url === "string" && VIDEO_EXTENSIONS.test(output.url as string))
    return "video";

  // Check for table (rows array of objects)
  if (Array.isArray(output.rows) && output.rows.length > 0 && typeof output.rows[0] === "object") {
    return "table";
  }

  // Check for file
  for (const key of ["path", "filePath", "file_path", "fileUrl", "file_url"]) {
    if (typeof output[key] === "string") return "file";
  }

  // Check for markdown/text (long string content)
  for (const key of ["response", "text", "content", "result", "output", "message"]) {
    const val = output[key];
    if (typeof val === "string" && val.length > 50) return "markdown";
  }

  return "json";
}

function RichOutputRenderer({ output }: { output: Record<string, unknown> }) {
  const type = detectOutputType(output);

  switch (type) {
    case "image":
      return <ImageRenderer output={output} />;
    case "video":
      return <VideoRenderer output={output} />;
    case "markdown":
      return <MarkdownRenderer output={output} />;
    case "table":
      return <TableRenderer output={output} />;
    case "file":
      return <FileRenderer output={output} />;
    default:
      return (
        <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Image Renderer with Lightbox
// ─────────────────────────────────────────────────────────────────────

function ImageRenderer({ output }: { output: Record<string, unknown> }) {
  const [lightbox, setLightbox] = useState(false);
  const [error, setError] = useState(false);
  const url =
    (output.imageUrl as string) ||
    (output.image_url as string) ||
    (output.image as string) ||
    (output.url as string) ||
    "";

  const prompt = (output.prompt as string) || "";

  // Close lightbox on Escape key
  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightbox(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  if (!url) {
    return (
      <div className="bg-white border border-gray-200 rounded p-3 text-xs text-gray-500 flex items-center gap-2">
        <Image className="w-3.5 h-3.5 text-gray-400" />
        <span>No URL available</span>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded p-2">
        <div className="flex items-center gap-2 mb-2">
          <Image className="w-3.5 h-3.5 text-purple-500" />
          <span className="text-xs font-medium text-gray-700">Image Output</span>
        </div>
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-600">
            <p className="font-medium">Failed to load image</p>
            <p className="mt-1 text-red-500 truncate">{url}</p>
          </div>
        ) : (
          <img
            src={url}
            alt={prompt || "Generated image"}
            className="max-w-full max-h-64 rounded cursor-pointer border border-gray-100 hover:border-blue-300 transition-colors"
            loading="lazy"
            onError={() => setError(true)}
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
          />
        )}
        {prompt && (
          <p className="text-[10px] text-gray-500 mt-1 truncate">
            Prompt: {prompt}
          </p>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && !error && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl"
            onClick={() => setLightbox(false)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={url}
            alt={prompt || "Generated image"}
            className="max-w-full max-h-full object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Video Renderer
// ─────────────────────────────────────────────────────────────────────

function VideoRenderer({ output }: { output: Record<string, unknown> }) {
  const [error, setError] = useState(false);
  const url =
    (output.videoUrl as string) ||
    (output.video_url as string) ||
    (output.video as string) ||
    (output.url as string) ||
    "";

  if (!url) {
    return (
      <div className="bg-white border border-gray-200 rounded p-3 text-xs text-gray-500 flex items-center gap-2">
        <Play className="w-3.5 h-3.5 text-gray-400" />
        <span>No URL available</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded p-2">
      <div className="flex items-center gap-2 mb-2">
        <Play className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-medium text-gray-700">Video Output</span>
      </div>
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-600">
          <p className="font-medium">Failed to load video</p>
          <p className="mt-1 text-red-500 truncate">{url}</p>
        </div>
      ) : (
        <video
          src={url}
          controls
          className="max-w-full max-h-64 rounded"
          preload="metadata"
          onError={() => setError(true)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Markdown Renderer (regex-based, no deps)
// ─────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML entities to prevent XSS
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (triple backtick)
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-gray-100 border border-gray-200 rounded p-2 my-1 overflow-x-auto text-xs"><code>$2</code></pre>'
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-gray-100 px-1 rounded text-xs">$1</code>'
  );

  // Headers
  html = html.replace(
    /^### (.+)$/gm,
    '<h4 class="font-semibold text-sm mt-2 mb-1">$1</h4>'
  );
  html = html.replace(
    /^## (.+)$/gm,
    '<h3 class="font-semibold text-sm mt-2 mb-1">$1</h3>'
  );
  html = html.replace(
    /^# (.+)$/gm,
    '<h3 class="font-bold text-base mt-2 mb-1">$1</h3>'
  );

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links (sanitized: only allow safe protocols)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match: string, text: string, href: string) => {
      const trimmedHref = href.trim();
      const escapedHref = trimmedHref.replace(/"/g, "&quot;");
      if (
        /^https?:\/\//i.test(trimmedHref) ||
        /^mailto:/i.test(trimmedHref) ||
        trimmedHref.startsWith("#")
      ) {
        return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${text}</a>`;
      }
      // Reject javascript:, data:, vbscript:, and other unsafe protocols
      return text;
    }
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(
    /(<li[^>]*>.*<\/li>\n?)+/g,
    '<ul class="my-1">$&</ul>'
  );

  // Line breaks
  html = html.replace(/\n\n/g, '<br class="my-1" />');
  html = html.replace(/\n/g, "<br />");

  return html;
}

function MarkdownRenderer({ output }: { output: Record<string, unknown> }) {
  const text =
    (output.response as string) ||
    (output.text as string) ||
    (output.content as string) ||
    (output.result as string) ||
    (output.output as string) ||
    (output.message as string) ||
    "";

  const model = output.model as string | undefined;
  const html = renderMarkdown(text);

  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-3.5 h-3.5 text-green-500" />
        <span className="text-xs font-medium text-gray-700">Text Output</span>
        {model && (
          <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
            {model}
          </span>
        )}
      </div>
      <div
        className="text-sm text-gray-800 max-h-60 overflow-y-auto prose-sm"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { ALLOWED_TAGS: ['h3','h4','p','ul','ol','li','strong','em','b','i','code','pre','br','hr','span'], ALLOWED_ATTR: ['class'] }) }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Table Renderer (with pagination)
// ─────────────────────────────────────────────────────────────────────

function TableRenderer({ output }: { output: Record<string, unknown> }) {
  const [showAll, setShowAll] = useState(false);
  const ROWS_PER_PAGE = 20;

  const rows = Array.isArray(output.rows)
    ? (output.rows as Record<string, unknown>[])
    : [];

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded p-3 text-xs text-gray-500 flex items-center gap-2">
        <Table className="w-3.5 h-3.5 text-gray-400" />
        <span>No data available</span>
      </div>
    );
  }

  const rowCount = (output.row_count as number) || rows.length;
  const columns =
    (output.columns as string[]) ||
    (rows.length > 0 ? Object.keys(rows[0]) : []);

  const displayRows = showAll ? rows : rows.slice(0, ROWS_PER_PAGE);

  return (
    <div className="bg-white border border-gray-200 rounded p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Table className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-xs font-medium text-gray-700">
            Table ({rowCount} rows, {columns.length} columns)
          </span>
        </div>
      </div>
      <div className="overflow-x-auto max-h-60 overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0">
            <tr className="bg-gray-100">
              <th className="px-2 py-1 text-left text-gray-600 font-medium border-b border-gray-200">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 text-left text-gray-600 font-medium border-b border-gray-200"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr
                key={idx}
                className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
              >
                <td className="px-2 py-1 text-gray-400 border-b border-gray-100">
                  {idx + 1}
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-2 py-1 border-b border-gray-100 max-w-[200px] truncate"
                  >
                    {row[col] === null || row[col] === undefined
                      ? ""
                      : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ROWS_PER_PAGE && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(!showAll);
          }}
          className="mt-1 text-[10px] text-blue-600 hover:underline"
        >
          {showAll
            ? "Show less"
            : `Show all ${rows.length} rows`}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// File Renderer
// ─────────────────────────────────────────────────────────────────────

function FileRenderer({ output }: { output: Record<string, unknown> }) {
  const path =
    (output.path as string) ||
    (output.filePath as string) ||
    (output.file_path as string) ||
    "";
  const fileUrl =
    (output.fileUrl as string) || (output.file_url as string) || "";
  const safeFileUrl = /^https?:\/\//i.test(fileUrl) ? fileUrl : "";
  const size = output.size as number | undefined;
  const fileName = path.split("/").pop() || fileUrl.split("/").pop() || "file";

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded p-3 flex items-center gap-3">
      <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center flex-shrink-0">
        <FileText className="w-4 h-4 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {fileName}
        </p>
        <p className="text-[10px] text-gray-500">
          {path && <span>{path}</span>}
          {size !== undefined && <span> ({formatSize(size)})</span>}
        </p>
      </div>
      {safeFileUrl && (
        <a
          href={safeFileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-3 h-3" />
          Download
        </a>
      )}
    </div>
  );
}
