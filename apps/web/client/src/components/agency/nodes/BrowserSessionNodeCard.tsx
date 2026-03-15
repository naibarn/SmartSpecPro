import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { AlertCircle, MonitorPlay } from "lucide-react";

import { cn } from "@/lib/utils";
import { BROWSER_SESSION_COPY } from "@shared/browserSession";
import type { AgencyNodeData } from "./types";

const HANDOFF_LABELS: Record<string, string> = {
  continue_running: BROWSER_SESSION_COPY.continue,
  review_required: BROWSER_SESSION_COPY.reviewRequired,
  needs_user_input: BROWSER_SESSION_COPY.needsYourInput,
};

export const BrowserSessionNodeCard = memo(function BrowserSessionNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const goal = (data.nodeConfig?.goal as string) ?? "";
  const handoffMode = (data.nodeConfig?.handoffMode as string) ?? "continue_running";

  return (
    <div
      className={cn(
        "w-56 rounded-lg border-2 bg-white shadow-sm transition-all",
        "border-cyan-300",
        selected && "ring-2 ring-cyan-500 shadow-md border-cyan-500",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-white"
      />

      <div className="px-3 py-2.5">
        <div className="mb-1 flex items-start justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <MonitorPlay className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors ? <AlertCircle className="h-3 w-3 shrink-0 text-red-500" /> : null}
        </div>

        <p className="line-clamp-2 text-[11px] text-slate-500">
          {goal || "No Browser Session goal configured"}
        </p>

        <span className="mt-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
          {HANDOFF_LABELS[handoffMode] ?? BROWSER_SESSION_COPY.continue}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-white"
      />
    </div>
  );
});
