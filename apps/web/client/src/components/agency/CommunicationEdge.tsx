import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer, MarkerType } from "reactflow";
import type { EdgeProps } from "reactflow";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface CommunicationEdgeData {
  flowType: "delegation" | "handoff";
}

const EDGE_COLORS: Record<string, string> = {
  delegation: "#6366f1", // indigo-500
  handoff: "#8b5cf6", // violet-500
};

const LABEL_STYLES: Record<string, string> = {
  delegation: "bg-indigo-100 text-indigo-800 border-indigo-200 border",
  handoff: "bg-violet-100 text-violet-800 border-violet-200 border",
};

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
}: EdgeProps<CommunicationEdgeData>) {
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

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path group-hover:stroke-indigo-600 transition-colors"
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
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'auto',
          }}
        >
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold shadow-sm transition-transform hover:scale-105",
                    LABEL_STYLES[flowType],
                  )}
                  data-testid={`edge-label-${id}`}
                >
                  {flowType}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs leading-relaxed z-50">
                {flowType === "delegation"
                  ? "Delegation: The source agent assigns a task to the target agent and WAITS for the result to continue its own work."
                  : "Handoff: The source agent transfers the conversation entirely to the target agent and DOES NOT wait for a reply."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
