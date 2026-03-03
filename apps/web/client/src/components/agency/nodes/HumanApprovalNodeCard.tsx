import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { UserCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const HumanApprovalNodeCard = memo(function HumanApprovalNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const timeoutHours = (data.nodeConfig?.timeoutHours as number) ?? 24;
  const onTimeout = (data.nodeConfig?.onTimeout as string) ?? "auto_reject";

  return (
    <div
      className={cn(
        "w-56 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-orange-300 border-dashed",
        selected && "ring-2 ring-orange-500 shadow-md border-orange-500 border-solid",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-orange-400 !bg-white"
      />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCheck className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3 text-slate-400" />
          <span className="text-[11px] text-slate-500">{timeoutHours}h timeout</span>
          <span className="text-[10px] bg-orange-50 text-orange-600 px-1 py-0.5 rounded border border-orange-200">
            {onTimeout}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-orange-400 !bg-white"
      />
    </div>
  );
});
