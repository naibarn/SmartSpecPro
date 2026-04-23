/**
 * GroupNode - Collapsible container node for grouping workflow nodes.
 *
 * When expanded: shows child nodes inside a labeled bordered box.
 * When collapsed: shows only the group header; child nodes are hidden.
 */

import { memo } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import type { WorkflowGroupNodeProps } from "./types";

function GroupNode({ id, data, selected }: WorkflowGroupNodeProps) {
  const { label, collapsed, onToggleCollapse } = data;

  return (
    <div
      className={[
        "relative rounded-xl border-2 transition-colors",
        selected
          ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/20"
          : "border-dashed border-gray-400 bg-gray-50/40 dark:bg-gray-800/30",
        collapsed ? "min-w-[160px]" : "min-w-[200px] min-h-[80px]",
      ].join(" ")}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Header bar */}
      <div
        className={[
          "flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl cursor-pointer select-none",
          "bg-gray-100/80 dark:bg-gray-700/60 border-b border-gray-300 dark:border-gray-600",
        ].join(" ")}
        onClick={() => onToggleCollapse(id)}
      >
        <Layers className="h-3.5 w-3.5 text-gray-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate flex-1">
          {label}
        </span>
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
        )}
      </div>

      {/* Collapsed indicator */}
      {collapsed && (
        <div className="px-3 py-2 text-xs text-gray-400 italic">
          (collapsed — click to expand)
        </div>
      )}
    </div>
  );
}

export default memo(GroupNode);
