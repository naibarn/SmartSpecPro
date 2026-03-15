/**
 * ConsolePanel - Real-time workflow execution console.
 *
 * Displays log entries emitted by:
 *   - "write_to_console" nodes  → explicit debug messages
 *   - "set_variable" nodes      → automatic variable change tracking
 *   - Browser Session outputs   → collaborative browser state summaries
 *   - comparison outputs        → shortlist / compare-ready summaries
 *
 * Reads from the executionStore.logs[] array (time-ordered) and
 * cross-references node IDs with the provided nodes[] to determine type.
 * No new SSE event types are required.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Node } from "reactflow";
import {
  Terminal,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  Variable,
  MonitorPlay,
  ListChecks,
} from "lucide-react";
import { useExecutionStore } from "@/stores/executionStore";
import {
  getWorkflowBrowserSessionArtifact,
  normalizeWorkflowComparisonPreview,
} from "@/lib/workflow/outputPresentation";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warning" | "error";

interface ConsoleEntry {
  id: string;
  timestamp: number;
  nodeId: string;
  nodeName: string;
  message: string;
  level: LogLevel;
  /** "console" = explicit write_to_console node, "variable" = auto-logged set_variable */
  source: "console" | "variable" | "browser" | "comparison";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function levelColor(level: LogLevel) {
  switch (level) {
    case "debug":
      return "text-gray-500 dark:text-gray-400";
    case "info":
      return "text-blue-600 dark:text-blue-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-600 dark:text-gray-300";
  }
}

function levelBadge(level: LogLevel) {
  switch (level) {
    case "debug":
      return "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
    case "info":
      return "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300";
    case "warning":
      return "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300";
    case "error":
      return "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300";
    default:
      return "bg-gray-100 dark:bg-gray-700 text-gray-500";
  }
}

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    // Fallback for engines that don't support fractionalSecondDigits
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ConsolePanelProps {
  /** Current workflow nodes — used to cross-reference nodeId → node type */
  nodes: Node[];
  /** Whether the panel body is expanded */
  isOpen: boolean;
  /** Height of the panel body in px when open */
  height: number;
  /** Callback to toggle open/close */
  onToggle: () => void;
  /** Callback when user resizes the panel */
  onHeightChange: (h: number) => void;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConsolePanel({
  nodes,
  isOpen,
  height,
  onToggle,
  onHeightChange,
  className = "",
}: ConsolePanelProps) {
  const logs = useExecutionStore((s) => s.logs);
  const isExecuting = useExecutionStore((s) => s.isExecuting);
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const [localLogs, setLocalLogs] = useState<ConsoleEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // ── Derive console entries from execution logs ──────────────────────────
  const nodeMap = useMemo(() => {
    const m: Record<string, Node> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const derivedEntries = useMemo<ConsoleEntry[]>(() => {
    const entries: ConsoleEntry[] = [];

    for (const log of logs) {
      if (log.eventType !== "node_complete") continue;

      const node = nodeMap[log.nodeId];
      const nodeName = log.nodeName || node?.data?.label || "Workflow";

      const browserSessionArtifact = getWorkflowBrowserSessionArtifact(log.output);
      if (browserSessionArtifact) {
        entries.push({
          id: `${log.id}:browser`,
          timestamp: log.timestamp,
          nodeId: log.nodeId,
          nodeName,
          message: browserSessionArtifact.summary.statusLine,
          level: (
            browserSessionArtifact.summary.state === "review_required"
            || browserSessionArtifact.summary.state === "needs_user_input"
            || browserSessionArtifact.summary.state === "session_ended"
          )
            ? "warning"
            : "info",
          source: "browser",
        });
      }

      const comparisonPreview = normalizeWorkflowComparisonPreview(log.output);
      if (comparisonPreview) {
        entries.push({
          id: `${log.id}:comparison`,
          timestamp: log.timestamp,
          nodeId: log.nodeId,
          nodeName,
          message: `${comparisonPreview.data.title} — ${comparisonPreview.summaryText}`,
          level: "info",
          source: "comparison",
        });
      }

      if (!node) continue;

      if (node.data?.nodeType === "write_to_console") {
        const message = String(log.output?.message ?? "");
        const level = (log.output?.level as LogLevel | undefined) ?? "info";
        entries.push({
          id: log.id,
          timestamp: log.timestamp,
          nodeId: log.nodeId,
          nodeName,
          message,
          level,
          source: "console",
        });
      } else if (node.data?.nodeType === "set_variable") {
        const varName =
          (node.data?.config as Record<string, unknown> | undefined)
            ?.variableName ?? "variable";
        const value = log.output?.value;
        entries.push({
          id: log.id,
          timestamp: log.timestamp,
          nodeId: log.nodeId,
          nodeName,
          message: `${varName} = ${JSON.stringify(value)}`,
          level: "debug",
          source: "variable",
        });
      }
    }

    return entries;
  }, [logs, nodeMap]);

  // Clear logs when a new execution starts
  const prevIsExecuting = useRef(false);
  useEffect(() => {
    if (isExecuting && !prevIsExecuting.current) {
      setLocalLogs([]);
    }
    prevIsExecuting.current = isExecuting;
  }, [isExecuting]);

  // Keep a persistent list across runs (cleared only on explicit clear or new run)
  useEffect(() => {
    if (derivedEntries.length > 0) {
      setLocalLogs(derivedEntries);
    }
  }, [derivedEntries]);

  // Auto-open when execution starts
  useEffect(() => {
    if (isExecuting && !isOpen) {
      onToggle();
    }
  }, [isExecuting, isOpen, onToggle]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localLogs.length, isOpen]);

  const displayed = useMemo(
    () =>
      filter === "all" ? localLogs : localLogs.filter((e) => e.level === filter),
    [localLogs, filter]
  );

  // ── Resize drag ─────────────────────────────────────────────────────────
  // Stable refs so removeEventListener matches addEventListeners
  const onResizeMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const onResizeMouseUpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onResizeMouseMoveRef.current = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - e.clientY;
      const next = Math.max(120, Math.min(600, resizeRef.current.startH + delta));
      onHeightChange(next);
    };
    onResizeMouseUpRef.current = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onResizeMouseMoveRef.current!);
      window.removeEventListener("mouseup", onResizeMouseUpRef.current!);
    };
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (onResizeMouseMoveRef.current)
        window.removeEventListener("mousemove", onResizeMouseMoveRef.current);
      if (onResizeMouseUpRef.current)
        window.removeEventListener("mouseup", onResizeMouseUpRef.current);
    };
  }, []);

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: height };
    window.addEventListener("mousemove", onResizeMouseMoveRef.current!);
    window.addEventListener("mouseup", onResizeMouseUpRef.current!);
  }

  async function copyAll() {
    const text = displayed
      .map((e) => `[${formatTime(e.timestamp)}] [${e.level.toUpperCase()}] ${e.message}`)
      .join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col ${className}`}
    >
      {/* Resize handle (drag upward to expand) */}
      <div
        className="h-1.5 w-full cursor-ns-resize hover:bg-blue-400 active:bg-blue-500 transition-colors flex-shrink-0"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize console"
      />

      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 select-none">
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <Terminal className="h-3.5 w-3.5" />
          Console
          {localLogs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[10px] font-bold">
              {localLogs.length}
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="h-3 w-3 ml-0.5" />
          ) : (
            <ChevronUp className="h-3 w-3 ml-0.5" />
          )}
        </button>

        {isOpen && (
          <>
            {/* Level filter tabs */}
            <div className="flex gap-0.5 ml-3">
              {(["all", "debug", "info", "warning", "error"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
                    filter === f
                      ? "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Action buttons */}
            <button
              onClick={copyAll}
              title="Copy all logs"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLocalLogs([])}
              title="Clear console"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Body */}
      {isOpen && (
        <div
          className="overflow-y-auto font-mono text-[11px] leading-5 flex-1"
          style={{ height }}
        >
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-2">
              <Terminal className="h-6 w-6" />
              <span className="text-xs">
                {localLogs.length === 0
                  ? "No console output yet. Run the workflow to see logs."
                  : "No entries match the current filter."}
              </span>
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {displayed.map((entry) => (
                  <tr
                    key={entry.id}
                    className="group hover:bg-gray-50 dark:hover:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800/50"
                  >
                    {/* Timestamp */}
                    <td className="pl-3 pr-2 py-0.5 whitespace-nowrap text-gray-400 dark:text-gray-500 w-28">
                      {formatTime(entry.timestamp)}
                    </td>

                    {/* Level badge */}
                    <td className="pr-2 py-0.5 whitespace-nowrap w-16">
                      <span
                        className={`inline-block px-1.5 py-0 rounded text-[10px] font-semibold uppercase ${levelBadge(
                          entry.level
                        )}`}
                      >
                        {entry.level}
                      </span>
                    </td>

                    {/* Source icon + node name */}
                    <td className="pr-2 py-0.5 whitespace-nowrap w-40 truncate text-gray-500 dark:text-gray-400">
                      {entry.source === "variable" ? (
                        <Variable className="h-3 w-3 inline mr-1 text-purple-400" />
                      ) : entry.source === "browser" ? (
                        <MonitorPlay className="h-3 w-3 inline mr-1 text-cyan-500" />
                      ) : entry.source === "comparison" ? (
                        <ListChecks className="h-3 w-3 inline mr-1 text-sky-500" />
                      ) : (
                        <Terminal className="h-3 w-3 inline mr-1 text-slate-400" />
                      )}
                      {entry.nodeName}
                    </td>

                    {/* Message */}
                    <td
                      className={`py-0.5 pr-3 break-all ${levelColor(entry.level)}`}
                    >
                      {entry.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
