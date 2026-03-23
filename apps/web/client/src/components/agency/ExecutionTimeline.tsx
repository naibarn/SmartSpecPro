import React from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, Loader2, Brain, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface ExecutionTimelineProps {
  agencyId: string;
  runId: string;
  events?: TimelineEvent[];
}

export function ExecutionTimeline({ agencyId, runId, events = [] }: ExecutionTimelineProps) {
  const autonomousEvents = events.filter((e) => e.type.startsWith("autonomous_"));

  const planEvents = autonomousEvents.filter((e) => e.type === "autonomous_plan_created");
  const subtaskEvents = autonomousEvents.filter((e) => e.type === "autonomous_subtask_complete");
  const reflectionEvents = autonomousEvents.filter((e) => e.type === "autonomous_reflection");

  if (autonomousEvents.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-4">
        <Brain className="h-6 w-6 mx-auto mb-2 opacity-50" aria-hidden="true" />
        No autonomous events yet
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-3 p-2" role="log" aria-live="polite" aria-label="Execution timeline">
        {/* Plan Overview */}
        {planEvents.map((evt, i) => (
          <div key={`plan-${i}`} className="border rounded-md p-2 bg-purple-50">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
              <Brain className="h-3.5 w-3.5" />
              Plan v{String(evt.data.planVersion).slice(0, 20)} — {String(evt.data.subtaskCount).slice(0, 10)} sub-tasks
            </div>
          </div>
        ))}

        {/* Sub-task Progress */}
        {subtaskEvents.map((evt, i) => {
          const status = String(evt.data.status);
          return (
            <div key={`subtask-${i}`} className="flex items-center gap-2 text-xs">
              {status === "complete" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : status === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
              )}
              <span className="truncate">{String(evt.data.subtaskId).slice(0, 128)}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0",
                  status === "complete" && "text-green-700",
                  status === "failed" && "text-red-700",
                )}
              >
                {status}
              </Badge>
              {evt.data.tokensUsed ? (
                <span className="text-muted-foreground ml-auto">{String(evt.data.tokensUsed)} tok</span>
              ) : null}
            </div>
          );
        })}

        {/* Reflection Summary */}
        {reflectionEvents.map((evt, i) => {
          const score = Number(evt.data.qualityScore) || 0;
          const color = score >= 0.8 ? "bg-green-500" : score >= 0.5 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={`reflect-${i}`} className="border rounded-md p-2 bg-slate-50 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <BarChart3 className="h-3.5 w-3.5" />
                Quality: {(score * 100).toFixed(0)}%
                {evt.data.isComplete && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-100 text-green-700">
                    Complete
                  </Badge>
                )}
                {evt.data.replanRequired && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700">
                    Re-planning...
                  </Badge>
                )}
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${score * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
