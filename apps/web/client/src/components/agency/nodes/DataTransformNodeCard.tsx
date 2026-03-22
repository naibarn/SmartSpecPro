import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Braces, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const DataTransformNodeCard = memo(function DataTransformNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const transformMode = (data.nodeConfig?.transformMode as string) ?? "jsonpath";
  const jsonpathExpr = (data.nodeConfig?.jsonpathExpression as string) ?? "";
  const filterField = ((data.nodeConfig?.filterCondition as Record<string, string>) ?? {}).field ?? "";

  const modeLabel: Record<string, string> = {
    jsonpath: "JSONPath",
    template: "Template",
    filter: "Filter",
  };

  const infoText =
    transformMode === "jsonpath"
      ? jsonpathExpr
        ? jsonpathExpr.length > 20
          ? jsonpathExpr.slice(0, 20) + "..."
          : jsonpathExpr
        : "No expression"
      : transformMode === "template"
        ? "Template"
        : filterField
          ? `by ${filterField}`
          : "No field";

  return (
    <div
      className={cn(
        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-slate-300",
        selected && "ring-2 ring-slate-500 shadow-md border-slate-500",
      )}
    >
      {/* Diamond accent */}
      <div className="flex justify-center -mt-2 mb-0">
        <div className="h-3 w-3 rotate-45 bg-slate-400 rounded-sm" />
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Braces className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
            {modeLabel[transformMode] ?? transformMode}
          </span>
          <span className="text-[11px] text-slate-400">{infoText}</span>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-slate-400 !bg-slate-100"
      />
    </div>
  );
});
