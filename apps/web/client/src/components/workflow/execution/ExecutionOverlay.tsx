/**
 * ExecutionOverlay - Visual status overlay for workflow nodes during execution.
 *
 * Renders status-based styling (borders, animations, icons) on nodes based on execution state.
 */

import React from "react";
import { Check, X, Clock, Loader2 } from "lucide-react";
import type { ExecutionStatus } from "@/stores/executionStore";

export interface ExecutionOverlayProps {
  nodeId: string;
  status: ExecutionStatus;
  className?: string;
}

/**
 * Status styling configuration.
 * All classes are static for Tailwind JIT compatibility.
 */
const statusConfig: Record<
  ExecutionStatus,
  { border: string; icon?: React.ReactNode; animation?: string }
> = {
  pending: {
    border: "", // No overlay for pending
  },
  running: {
    border: "border-2 border-blue-500",
    icon: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
    animation: "animate-pulse",
  },
  success: {
    border: "border-2 border-green-500",
    icon: <Check className="w-5 h-5 text-green-500" />,
  },
  failed: {
    border: "border-2 border-red-500",
    icon: <X className="w-5 h-5 text-red-500" />,
  },
  skipped: {
    border: "border-2 border-gray-400 border-dashed",
    icon: <Clock className="w-4 h-4 text-gray-400" />,
  },
};

/**
 * ExecutionOverlay component.
 *
 * Wraps or overlays workflow nodes to show execution status visually.
 */
export function ExecutionOverlay({ nodeId, status, className = "" }: ExecutionOverlayProps) {
  const config = statusConfig[status];

  if (status === "pending") {
    return null; // No overlay for pending nodes
  }

  return (
    <div
      className={`
        absolute inset-0 rounded-lg pointer-events-none
        ${config.border}
        ${config.animation || ""}
        ${className}
      `}
      data-node-id={nodeId}
      data-status={status}
    >
      {/* Status Icon (top-right corner) */}
      {config.icon && (
        <div className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md pointer-events-auto">
          {config.icon}
        </div>
      )}
    </div>
  );
}
