import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Brain, Wrench, AlertCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyFlowNodeProps } from "./types";

export const AutonomousAgentNode = memo(function AutonomousAgentNode({
  data,
  selected,
}: AgencyFlowNodeProps) {
  const nc = (data.nodeConfig ?? {}) as Record<string, unknown>;
  const delegationMode = (nc.delegationMode as string) ?? "auto";
  const enableMemory = nc.enableLongTermMemory === true;
  const toolCount = data.tools?.length ?? 0;
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;

  return (
    <div
      aria-label={data.name || "Autonomous Agent"}
      className={cn(
        "relative rounded-lg border-2 bg-white shadow-sm min-w-[180px] max-w-[220px] transition-all",
        data.isEntryPoint && "border-l-4 border-l-green-500",
        selected ? "border-purple-500 ring-2 ring-purple-300" : "border-purple-300",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />

      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-purple-600 shrink-0" />
          <span className="text-sm font-medium truncate">{data.name || "Autonomous Agent"}</span>
          {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
        </div>

        {data.model && (
          <p className="text-[10px] text-muted-foreground truncate">{data.model}</p>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700">
            {delegationMode}
          </Badge>
          {toolCount > 0 && (
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              <Wrench className="h-2.5 w-2.5 mr-0.5" />
              {toolCount}
            </Badge>
          )}
          {enableMemory && (
            <Database className="h-3 w-3 text-purple-400" aria-hidden="true" />
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
});
