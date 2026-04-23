import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { ArrowLeftRight, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgencyFlowNodeProps } from "./types";

export const EngineBoundaryNodeCard = memo(function EngineBoundaryNodeCard({
  data,
  selected,
}: AgencyFlowNodeProps) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const config = (data.nodeConfig ?? {}) as Record<string, unknown>;

  return (
    <div
      className={cn(
        "w-60 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/90 shadow-sm transition-all",
        selected && "border-violet-500 ring-2 ring-violet-500/30 shadow-md",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-violet-500 !bg-white"
      />

      <div className="px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-violet-600" />
              <span className="truncate text-sm font-semibold text-violet-950">{data.name}</span>
            </div>
            <p className="mt-1 text-[11px] text-violet-700">Cross-engine boundary</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
            <Badge className="border-0 bg-white/90 px-1.5 py-0 text-[10px] text-violet-700">
              bridge
            </Badge>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-violet-800">
          {typeof config.bridgeMode === "string" && config.bridgeMode && (
            <Badge variant="outline" className="border-violet-200 bg-white/80 text-[10px] text-violet-700">
              {config.bridgeMode}
            </Badge>
          )}
          {typeof config.inputContract === "string" && config.inputContract && (
            <Badge variant="outline" className="border-violet-200 bg-white/80 text-[10px] text-violet-700">
              in:{config.inputContract}
            </Badge>
          )}
          {typeof config.outputContract === "string" && config.outputContract && (
            <Badge variant="outline" className="border-violet-200 bg-white/80 text-[10px] text-violet-700">
              out:{config.outputContract}
            </Badge>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-violet-500 !bg-white"
      />
    </div>
  );
});
