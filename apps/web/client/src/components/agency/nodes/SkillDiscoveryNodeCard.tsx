import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyFlowNodeProps } from "./types";

export const SkillDiscoveryNodeCard = memo(function SkillDiscoveryNodeCard({
  data,
  selected,
}: AgencyFlowNodeProps) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const taskSource = (data.nodeConfig?.taskSource as string) ?? "";
  const threshold = (data.nodeConfig?.confidenceThreshold as number) ?? 0.7;

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-teal-300",
        selected && "ring-2 ring-teal-500 shadow-md border-teal-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
      />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Search className="h-3.5 w-3.5 shrink-0 text-teal-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        {taskSource ? (
          <div className="space-y-0.5">
            <p className="truncate text-[11px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
              Source: {taskSource.replace(/_/g, " ")}
            </p>
            <p className="text-[10px] text-slate-400">
              Threshold: {threshold}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-amber-500">Not configured</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-teal-400 !bg-white"
      />
    </div>
  );
});
