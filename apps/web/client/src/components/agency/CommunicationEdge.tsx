import { memo } from "react";
import { getBezierPath, EdgeLabelRenderer, MarkerType } from "reactflow";
import type { EdgeProps } from "reactflow";
import { cn } from "@/lib/utils";

export interface CommunicationEdgeData {
  flowType: "delegation" | "handoff";
}

const EDGE_COLORS: Record<string, string> = {
  delegation: "#3b82f6",
  handoff: "#8b5cf6",
};

const LABEL_STYLES: Record<string, string> = {
  delegation: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  handoff: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
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
        className="react-flow__edge-path"
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
          className={cn(
            "nodrag nopan pointer-events-auto absolute cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium",
            LABEL_STYLES[flowType],
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          data-testid={`edge-label-${id}`}
        >
          {flowType}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
