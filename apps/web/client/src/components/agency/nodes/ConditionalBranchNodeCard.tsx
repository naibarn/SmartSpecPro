import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { GitFork, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const ConditionalBranchNodeCard = memo(function ConditionalBranchNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const evaluationMode = (data.nodeConfig?.evaluationMode as string) ?? "rule_based";
  const rules = (data.nodeConfig?.rules as Array<{ id: string; label?: string }>) ?? [];
  const categories = (data.nodeConfig?.categories as Array<{ label: string }>) ?? [];
  const contextConditions = (data.nodeConfig?.contextConditions as Array<{ operator: string; value: string; targetNodeId: string }>) ?? [];

  const modeLabel: Record<string, string> = {
    rule_based: "Rule-based",
    llm_classify: "LLM Classify",
    context_check: "Context Check",
  };

  const summaryText =
    evaluationMode === "rule_based"
      ? `${rules.length} rule${rules.length !== 1 ? "s" : ""}`
      : evaluationMode === "llm_classify"
        ? `${categories.length} categor${categories.length !== 1 ? "ies" : "y"}`
        : "context";

  return (
    <div
      className={cn(
        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-amber-300",
        selected && "ring-2 ring-amber-500 shadow-md border-amber-500",
      )}
    >
      {/* Diamond accent */}
      <div className="flex justify-center -mt-2 mb-0">
        <div className="h-3 w-3 rotate-45 bg-amber-400 rounded-sm" />
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <GitFork className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
            {modeLabel[evaluationMode] ?? evaluationMode}
          </span>
          <span className="text-[11px] text-slate-400">{summaryText}</span>
        </div>
      </div>

      {/* Source handles for each rule/category */}
      {evaluationMode === "rule_based" &&
        rules.map((rule, i) => (
          <Handle
            key={rule.id ?? `rule-${i}`}
            type="source"
            position={Position.Right}
            id={rule.id ?? `rule-${i}`}
            style={{ top: `${30 + i * 18}%`, right: -6 }}
            className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-amber-100"
          />
        ))}

      {evaluationMode === "llm_classify" &&
        categories.map((cat, i) => (
          <Handle
            key={`cat-${i}`}
            type="source"
            position={Position.Right}
            id={`cat-${i}`}
            style={{ top: `${30 + i * 18}%`, right: -6 }}
            className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-amber-100"
          />
        ))}

      {evaluationMode === "context_check" &&
        contextConditions.map((_, i) => (
          <Handle
            key={`ctx-${i}`}
            type="source"
            position={Position.Right}
            id={`ctx-${i}`}
            style={{ top: `${30 + i * 18}%`, right: -6 }}
            className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-amber-100"
          />
        ))}

      {/* Default handle at bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!h-2.5 !w-2.5 !border-2 !border-amber-400 !bg-amber-100"
      />
      <div
        className="absolute text-[9px] font-medium text-amber-500 pointer-events-none select-none"
        style={{ bottom: -16, left: "50%", transform: "translateX(-50%)" }}
      >
        Default
      </div>
    </div>
  );
});
