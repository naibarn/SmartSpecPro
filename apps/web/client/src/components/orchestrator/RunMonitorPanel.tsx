/**
 * RunMonitorPanel — live run monitoring dashboard panel.
 *
 * Shows agent roster with status, timeline of events,
 * cost/token counters, and run controls.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

interface AgentStatus {
  id: string;
  name: string;
  status: "active" | "idle" | "error" | "muted";
  turnCount: number;
  tokenCount: number;
  lastActivity: string | null;
}

interface RunMonitorPanelProps {
  runId: string;
  teamName?: string;
  runStatus?: "queued" | "running" | "paused" | "completed" | "failed" | "stopped";
  runStatusReason?: string | null;
  agents?: Array<{ id: string; displayName: string | null; isLead: boolean }>;
  onStartNewRun?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onAdvanceRun?: (maxTurns: number) => void;
  onStop?: () => void;
  controlsBusy?: boolean;
  className?: string;
}

export function RunMonitorPanel({
  runId,
  teamName,
  runStatus = "running",
  runStatusReason,
  agents = [],
  onStartNewRun,
  onPause,
  onResume,
  onAdvanceRun,
  onStop,
  controlsBusy = false,
  className,
}: RunMonitorPanelProps) {
  const { t } = useScopedTranslation('agency');
  const [timeline, setTimeline] = useState<RunStreamEvent[]>([]);
  const [agentStats, setAgentStats] = useState<Map<string, { turns: number; tokens: number }>>(new Map());

  const { connected } = useRunStream({
    runId,
    enabled: runStatus === "running",
    onEvent: useCallback((event: RunStreamEvent) => {
      setTimeline((prev) => [...prev.slice(-199), event]);

      // Track per-agent stats
      if (event.actorType === "assistant") {
        setAgentStats((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.actorId) ?? { turns: 0, tokens: 0 };
          const usage = (event.data as any)?.tokenUsage;
          next.set(event.actorId, {
            turns: existing.turns + 1,
            tokens: existing.tokens + (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
          });
          return next;
        });
      }
    }, []),
  });

  const totalTokens = useMemo(
    () => Array.from(agentStats.values()).reduce((sum, s) => sum + s.tokens, 0),
    [agentStats],
  );

  const statusColor: Record<string, string> = {
    running: "text-green-600",
    paused: "text-amber-600",
    completed: "text-blue-600",
    failed: "text-red-600",
    stopped: "text-gray-600",
    queued: "text-gray-500",
  };

  const eventIcon: Record<string, string> = {
    assistant_message_final: "💬",
    run_started: "🚀",
    run_completed: "✅",
    run_paused: "⏸️",
    tool_call_started: "🔧",
    handoff_requested: "🤝",
    error: "❌",
    status_change: "🔄",
  };

  const getStatusLabel = (status: RunMonitorPanelProps["runStatus"]) =>
    status ? t(`orchestrator.runMonitor.status.${status}`) : "";

  return (
    <div className={cn("flex h-full min-h-0 flex-col border-l bg-background", className)}>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{t("orchestrator.runMonitor.title")}</h3>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <span className={`text-xs font-medium capitalize ${statusColor[runStatus] ?? "text-gray-500"}`}>
              {getStatusLabel(runStatus)}
            </span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-blue-50 px-2 py-1.5 dark:bg-blue-900/20">
            <div className="text-lg font-bold text-blue-600">{timeline.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("orchestrator.runMonitor.events")}</div>
          </div>
          <div className="rounded-lg bg-violet-50 px-2 py-1.5 dark:bg-violet-900/20">
            <div className="text-lg font-bold text-violet-600">
              {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("orchestrator.runMonitor.tokens")}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-2 py-1.5 dark:bg-emerald-900/20">
            <div className="text-lg font-bold text-emerald-600">{agents.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("orchestrator.runMonitor.agents")}</div>
          </div>
        </div>
        {runStatusReason && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {runStatusReason}
          </div>
        )}
      </div>

      {/* Agent roster */}
      {agents.length > 0 && (
        <div className="border-b px-4 py-3">
          <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("orchestrator.runMonitor.agentRoster")}
          </h4>
          <div className="space-y-1.5">
            {agents.map((agent) => {
              const stats = agentStats.get(agent.id);
              return (
                <div key={agent.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 flex items-center justify-center text-white text-[10px] font-bold">
                    {(agent.displayName ?? "A")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {agent.displayName ?? agent.id.slice(0, 8)}
                      {agent.isLead && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">
                          {t("orchestrator.common.lead")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {stats ? t("orchestrator.runMonitor.turnsShort", { count: stats.turns }) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="border-b px-4 py-2">
        <div className="flex flex-col gap-1.5">
          {runStatus === "running" && (
            <>
              <div className="flex gap-1.5">
                <button
                  onClick={onPause}
                  disabled={controlsBusy}
                  className="flex-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                {t("orchestrator.runMonitor.pauseButton")}
                </button>
                <button
                  onClick={onStop}
                  disabled={controlsBusy}
                  className="flex-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors border border-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                {t("orchestrator.runMonitor.stopButton")}
                </button>
              </div>
              {onAdvanceRun && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onAdvanceRun(1)}
                    disabled={controlsBusy}
                    className="rounded-lg bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("orchestrator.runMonitor.nextTurnButton")}
                  </button>
                  <button
                    onClick={() => onAdvanceRun(3)}
                    disabled={controlsBusy}
                    className="rounded-lg bg-violet-50 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors border border-violet-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t("orchestrator.runMonitor.runThreeTurnsButton")}
                  </button>
                </div>
              )}
            </>
          )}
          {runStatus === "paused" && (
            <>
              <button
                onClick={onResume}
                disabled={controlsBusy}
                className="flex-1 rounded-lg bg-green-50 px-2 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors border border-green-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("orchestrator.runMonitor.resumeButton")}
              </button>
              <button
                onClick={onStop}
                disabled={controlsBusy}
                className="flex-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors border border-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("orchestrator.runMonitor.stopButton")}
              </button>
            </>
          )}
          {(runStatus === "completed" || runStatus === "stopped" || runStatus === "failed") && (
            <>
              <div className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-center ${statusColor[runStatus]}`}>
                {t("orchestrator.runMonitor.runStatusLabel", { status: getStatusLabel(runStatus) })}
              </div>
              {onStartNewRun && (
                <button
                  onClick={onStartNewRun}
                  disabled={controlsBusy}
                  className="flex-1 rounded-lg bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("orchestrator.runMonitor.startNewRunButton")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Event timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-background py-1">
          {t("orchestrator.runMonitor.timeline")}
        </h4>
        <div className="relative pl-4 space-y-0.5">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />

          {timeline.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("orchestrator.runMonitor.waitingForEvents")}
            </p>
          ) : (
            [...timeline].reverse().map((event) => (
              <div key={event.eventId} className="relative flex items-start gap-2 py-1.5 group">
                {/* Timeline dot */}
                <div className="absolute left-[-13px] top-2.5 h-2 w-2 rounded-full bg-blue-400 ring-2 ring-background group-hover:bg-blue-600 transition-colors" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs">{eventIcon[event.eventType] ?? "📌"}</span>
                    <span className="text-xs font-medium truncate">{event.eventType.replace(/_/g, " ")}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {event.actorId.slice(0, 12)} · {new Date(event.ts).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
