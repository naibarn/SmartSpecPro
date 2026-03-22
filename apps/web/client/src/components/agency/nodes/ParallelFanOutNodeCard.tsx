import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { Split, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgencyNodeData } from "./types";

export const ParallelFanOutNodeCard = memo(function ParallelFanOutNodeCard({
  data,
  selected,
}: NodeProps<AgencyNodeData>) {
  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
  const branches = (data.nodeConfig?.branches as Array<{ id: string; label?: string }>) ?? [];
  const mergeStrategy = (data.nodeConfig?.mergeStrategy as string) ?? "wait_all";

  const mergeLabel: Record<string, string> = {
    wait_all: "Wait All",
    first_complete: "First",
    majority: "Majority",
    custom_prompt: "Custom",
  };

  return (
    <div
      className={cn(
        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all relative",
        "border-cyan-300",
        selected && "ring-2 ring-cyan-500 shadow-md border-cyan-500",
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ top: -8 }}
        className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-white"
      />

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Split className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
          </div>
          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">
            {mergeLabel[mergeStrategy] ?? mergeStrategy}
          </span>
          <span className="text-[11px] text-slate-400">
            {branches.length} branch{branches.length !== 1 ? "es" : ""}
          </span>
        </div>
      </div>

      {/* Source handles — one per branch, spread evenly at bottom */}
      {branches.map((branch, i) => {
        const offset = branches.length > 1
          ? 20 + (i / (branches.length - 1)) * 60
          : 50;
        return (
          <Handle
            key={branch.id ?? `branch-${i}`}
            type="source"
            position={Position.Bottom}
            id={branch.id ?? `branch-${i}`}
            style={{ left: `${offset}%` }}
            className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-cyan-100"
          />
        );
      })}

      {/* Default output handle when no branches */}
      {branches.length === 0 && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="default"
          className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-cyan-100"
        />
      )}
    </div>
  );
});
