import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const LoopRetryNodeCard = memo(function LoopRetryNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const exitMode = (data.nodeConfig?.exitCondition as any)?.mode ?? "max_iterations";
  const maxIterations = (data.nodeConfig?.exitCondition as any)?.maxIterations ?? 5;

  const modeLabel: Record<string, string> = {
    max_iterations: "Max Iter",
    rule_based: "Rule-based",
    llm_evaluate: "LLM Eval",
    context_check: "Context",
  };

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-amber-300",
        selected && "ring-2 ring-amber-500 shadow-md border-amber-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
            {modeLabel[exitMode] ?? exitMode}
          </span>
          <span className="text-[11px] text-slate-400">max {maxIterations}x</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-amber-100"
      />
    </div>
  );
});
