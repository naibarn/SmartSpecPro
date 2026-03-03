import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Badge } from "@/components/ui/badge";
import { Bot, Wrench, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const AgentNodeCard = memo(function AgentNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;

  return (
    <div
      className={cn(
        "w-56 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-indigo-200",
        selected && "ring-2 ring-indigo-500 shadow-md border-indigo-400",
        data.isEntryPoint && "border-l-4 border-l-green-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-indigo-400 !bg-white"
      />

      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Bot className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasErrors && <AlertCircle className="h-3 w-3 text-red-500" />}
            {data.isEntryPoint && (
              <Badge className="bg-green-100 px-1 py-0 text-[10px] text-green-800 border-0">
                entry
              </Badge>
            )}
            {data.isOptional && (
              <Badge className="bg-yellow-100 px-1 py-0 text-[10px] text-yellow-700 border-0">
                opt
              </Badge>
            )}
          </div>
        </div>

        <p className="truncate text-[11px] text-slate-400">
          {data.model || "No model set"}
        </p>

        {(data.tools?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
            <Wrench className="h-3 w-3" />
            <span>{data.tools!.length} tool{data.tools!.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-indigo-400 !bg-white"
      />
    </div>
  );
});
