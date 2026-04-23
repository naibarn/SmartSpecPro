import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { ShieldAlert, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyFlowNodeProps } from "./types";

export const ErrorHandlerNodeCard = memo(function ErrorHandlerNodeCard({
  data,
  selected,
}: AgencyFlowNodeProps) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const onError = (data.nodeConfig?.onError as string) ?? "retry";
  const watchedNodeIds = (data.nodeConfig?.watchedNodeIds as string[]) ?? [];

  const strategyLabel: Record<string, string> = {
    retry: "Retry",
    fallback: "Fallback",
    skip: "Skip",
    terminate: "Terminate",
  };

  return (
    <div
      className={cn(
        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-red-300",
        selected && "ring-2 ring-red-500 shadow-md border-red-500",
      )}
    >
      {/* Diamond accent */}
      <div className="flex justify-center -mt-2 mb-0">
        <div className="h-3 w-3 rotate-45 bg-red-400 rounded-sm" />
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-red-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
            {strategyLabel[onError] ?? onError}
          </span>
          <span className="text-[11px] text-slate-400">
            Watching {watchedNodeIds.length} node{watchedNodeIds.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-red-400 !bg-red-100"
      />
    </div>
  );
});
