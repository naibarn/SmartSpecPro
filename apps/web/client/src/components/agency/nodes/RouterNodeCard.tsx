import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { GitBranch, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const RouterNodeCard = memo(function RouterNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const routingMode = (data.nodeConfig?.routingMode as string) ?? "keyword";
  const routes = (data.nodeConfig?.routes as Array<{ condition: string; targetNodeId: string; label?: string; handleId?: string }>) ?? [];

  return (
    <div
      className={cn(
        "w-64 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-blue-300",
        selected && "ring-2 ring-blue-500 shadow-md border-blue-500",
      )}
    >
      {/* Diamond accent at top */}
      <div className="flex justify-center -mt-2 mb-0">
        <div className="h-3 w-3 rotate-45 bg-blue-400 rounded-sm" />
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-blue-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
            {routingMode}
          </span>
          <span className="text-[11px] text-slate-400">{routes.length} route{routes.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* === Output handles: True (right), False (left), Default (bottom) === */}

      {/* True handle — right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: "50%", right: -6 }}
        className="!h-3 !w-3 !border-2 !border-green-500 !bg-green-100"
      />
      <div
        className="absolute text-[9px] font-bold text-green-600 pointer-events-none select-none"
        style={{ right: -28, top: "50%", transform: "translateY(-50%)" }}
      >
        True
      </div>

      {/* False handle — left side */}
      <Handle
        type="source"
        position={Position.Left}
        id="false"
        style={{ top: "50%", left: -6 }}
        className="!h-3 !w-3 !border-2 !border-red-400 !bg-red-100"
      />
      <div
        className="absolute text-[9px] font-bold text-red-500 pointer-events-none select-none"
        style={{ left: -30, top: "50%", transform: "translateY(-50%)" }}
      >
        False
      </div>

      {/* Default/additional handle — bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!h-2.5 !w-2.5 !border-2 !border-blue-400 !bg-blue-100"
      />
      <div
        className="absolute text-[9px] font-medium text-blue-500 pointer-events-none select-none"
        style={{ bottom: -16, left: "50%", transform: "translateX(-50%)" }}
      >
        Else
      </div>
    </div>
  );
});
