import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Merge, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const AggregatorNodeCard = memo(function AggregatorNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const mode = (data.nodeConfig?.aggregationMode as string) ?? "concatenate";

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-green-300",
        selected && "ring-2 ring-green-500 shadow-md border-green-500",
      )}
    >
      {/* Multiple top handles suggestion — show 2 target dots */}
      <Handle
        type="target"
        position={Position.Top}
        id="in-1"
        style={{ left: "33%" }}
        className="!h-2.5 !w-2.5 !border-2 !border-green-400 !bg-white"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-2"
        style={{ left: "67%" }}
        className="!h-2.5 !w-2.5 !border-2 !border-green-400 !bg-white"
      />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Merge className="h-3.5 w-3.5 shrink-0 text-green-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-200">
          {mode}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-green-400 !bg-white"
      />
    </div>
  );
});
