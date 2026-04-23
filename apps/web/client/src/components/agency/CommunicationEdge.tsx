import { memo, useState } from "react";
import { getBezierPath, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  AgencyCommunicationEdgeProps,
  AgencyCommunicationFlowType,
} from "./nodes/types";

const EDGE_COLORS: Record<AgencyCommunicationFlowType, string> = {
  delegation: "#6366f1",  // indigo-500
  handoff: "#8b5cf6",     // violet-500
  parallel: "#0891b2",    // cyan-600
};

const LABEL_STYLES: Record<AgencyCommunicationFlowType, string> = {
  delegation: "bg-indigo-100 text-indigo-800 border-indigo-300",
  handoff: "bg-violet-100 text-violet-800 border-violet-300",
  parallel: "bg-cyan-100 text-cyan-800 border-cyan-300",
};

const FLOW_OPTIONS: Array<{
  value: AgencyCommunicationFlowType;
  label: string;
  desc: string;
}> = [
  { value: "delegation", label: "Delegation", desc: "Assigns a subtask and waits for the result" },
  { value: "handoff", label: "Handoff", desc: "Transfers conversation entirely, does not wait" },
  { value: "parallel", label: "Parallel", desc: "Sends to both agents simultaneously" },
];

export const CommunicationEdge = memo(function CommunicationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
}: AgencyCommunicationEdgeProps) {
  const { setEdges } = useReactFlow();
  const [open, setOpen] = useState(false);
  const flowType = data?.flowType ?? "delegation";
  const color = EDGE_COLORS[flowType] ?? EDGE_COLORS.delegation;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleChangeFlowType = (newType: AgencyCommunicationFlowType) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, data: { ...(e.data ?? {}), flowType: newType } }
          : e,
      ),
    );
    setOpen(false);
  };

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path transition-colors"
        d={edgePath}
        style={{
          ...style,
          stroke: color,
          strokeWidth: 2,
        }}
        markerEnd={markerEnd as string}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "auto",
          }}
        >
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "border rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold shadow-sm transition-transform hover:scale-105 cursor-pointer",
                  LABEL_STYLES[flowType],
                )}
                data-testid={`edge-label-${id}`}
              >
                {flowType}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1.5" align="center" side="top">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-1.5 pb-1">
                Change flow type
              </p>
              {FLOW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChangeFlowType(opt.value)}
                  className={cn(
                    "flex flex-col w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-100",
                    flowType === opt.value && "bg-slate-100",
                  )}
                >
                  <span className="text-xs font-medium text-slate-800">{opt.label}</span>
                  <span className="text-[10px] text-slate-500">{opt.desc}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
