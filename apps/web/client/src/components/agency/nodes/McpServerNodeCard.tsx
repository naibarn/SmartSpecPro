import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Plug, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const McpServerNodeCard = memo(function McpServerNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const serverSlug = (data.nodeConfig?.serverSlug as string) ?? "";
  const transport = (data.nodeConfig?.transportType as string) ?? "http";

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-orange-300",
        selected && "ring-2 ring-orange-500 shadow-md border-orange-500",
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
            <Plug className="h-3.5 w-3.5 shrink-0 text-orange-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        {serverSlug ? (
          <div className="flex items-center gap-1">
            <p className="truncate text-[11px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded" title={serverSlug}>
              {serverSlug}
            </p>
            <span className="text-[10px] text-muted-foreground">{transport}</span>
          </div>
        ) : (
          <p className="text-[11px] text-amber-500">No MCP server selected</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-orange-400 !bg-white"
      />
    </div>
  );
});
