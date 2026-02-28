import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Activity, ArrowRight, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyActivityEvent } from "@/hooks/useAgencyStream";

interface AgencyActivityPanelProps {
  activityEvents: AgencyActivityEvent[];
  activeAgent: string | null;
  isStreaming: boolean;
  onClose: () => void;
}

const AGENT_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

export default function AgencyActivityPanel({
  activityEvents,
  activeAgent,
  isStreaming,
  onClose,
}: AgencyActivityPanelProps) {
  return (
    <div className="flex h-full flex-col border-l bg-muted/30">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span className="text-sm font-medium">Agent Activity</span>
          {isStreaming && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {activeAgent && (
        <div className="border-b px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Active:</span>
            <Badge variant="secondary" className={cn("text-xs", getAgentColor(activeAgent))}>
              {activeAgent}
            </Badge>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-3">
          {activityEvents.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Agent activity will appear here during a run.
            </p>
          )}

          {activityEvents.map((evt, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                {evt.type === "agent_switch" && (
                  <ArrowRight className="h-3 w-3 text-blue-500" />
                )}
                {evt.type === "tool_call" && (
                  <Wrench className="h-3 w-3 text-amber-500" />
                )}
                {evt.type === "tool_result" && (
                  <Activity className="h-3 w-3 text-green-500" />
                )}
                {evt.type === "handoff" && (
                  <ArrowRight className="h-3 w-3 text-purple-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px] px-1 py-0", getAgentColor(evt.agentName))}
                  >
                    {evt.agentName}
                  </Badge>
                  <span className="text-muted-foreground">
                    {evt.type === "agent_switch" && "switched to active"}
                    {evt.type === "tool_call" &&
                      `called ${(evt.data as any).toolName || (evt.data as any).tool_name || "tool"}`}
                    {evt.type === "tool_result" &&
                      `result from ${(evt.data as any).toolName || (evt.data as any).tool_name || "tool"}`}
                    {evt.type === "handoff" && "handed off"}
                  </span>
                </div>
                {evt.type === "tool_result" && (evt.data as any).duration_ms && (
                  <span className="text-muted-foreground">
                    {((evt.data as any).duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
