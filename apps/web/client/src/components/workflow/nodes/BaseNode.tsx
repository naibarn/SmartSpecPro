/**
 * BaseNode - Single ReactFlow component that renders all workflow node types.
 *
 * All nodes use type='workflow' in ReactFlow, with the logical type stored in node.data.nodeType.
 * This component looks up the node definition from the backend registry and renders it dynamically.
 */

import React from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import { useNodeRegistry } from "@/lib/workflow/useNodeRegistry";
import { dataTypeColorMap, nodeColorMap } from "@/lib/workflow/colorMap";
import * as LucideIcons from "lucide-react";

export interface WorkflowNodeData {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

/**
 * BaseNode component for all workflow nodes.
 */
export function BaseNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const { getNodeType } = useNodeRegistry();
  const nodeTypeDef = getNodeType(data.nodeType);

  if (!nodeTypeDef) {
    return (
      <div className="p-4 bg-red-100 border-2 border-red-500 rounded-lg min-w-[200px]">
        <div className="font-bold text-red-700">Unknown node type</div>
        <div className="text-sm text-red-600">{data.nodeType}</div>
      </div>
    );
  }

  // Get the icon component
  const IconComponent =
    (LucideIcons as any)[nodeTypeDef.icon] || LucideIcons.HelpCircle;

  // Get color classes for this node
  const colors = nodeColorMap[nodeTypeDef.color] || nodeColorMap.gray;

  // Count configured values for summary
  const configuredCount = Object.keys(data.config).filter(
    (key) => data.config[key] !== undefined && data.config[key] !== ""
  ).length;

  return (
    <div
      className={`
        relative min-w-[160px] rounded-lg border-2 p-3
        ${colors.bg} ${colors.border}
        ${selected ? "ring-2 ring-blue-500 ring-offset-2" : ""}
        shadow-md hover:shadow-lg transition-shadow
      `}
    >
      {/* Input Handles (left side) */}
      {nodeTypeDef.inputs
        .filter((input) => input.accepts_connection)
        .map((input, index, filteredInputs) => {
          const colors = dataTypeColorMap[input.data_type] || dataTypeColorMap.any;
          const yOffset = (index + 1) / (filteredInputs.length + 1);

          return (
            <Handle
              key={input.name}
              type="target"
              position={Position.Left}
              id={input.name}
              style={{
                top: `${yOffset * 100}%`,
                background: "#fff",
                border: `2px solid var(--tw-color)`,
                width: "10px",
                height: "10px",
              }}
              className={colors.border}
              title={`${input.display_name} (${input.data_type})`}
            />
          );
        })}

      {/* Output Handles (right side) */}
      {nodeTypeDef.outputs.map((output, index) => {
        const colors = dataTypeColorMap[output.data_type] || dataTypeColorMap.any;
        const yOffset = (index + 1) / (nodeTypeDef.outputs.length + 1);

        return (
          <Handle
            key={output.name}
            type="source"
            position={Position.Right}
            id={output.name}
            style={{
              top: `${yOffset * 100}%`,
              background: "#fff",
              border: `2px solid var(--tw-color)`,
              width: "10px",
              height: "10px",
            }}
            className={colors.border}
            title={`${output.display_name} (${output.data_type})`}
          />
        );
      })}

      {/* Node Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <IconComponent className={`w-4 h-4 ${colors.text}`} />
        <div className={`font-semibold text-sm ${colors.text}`}>{data.label}</div>
      </div>

      {/* Node Type Badge */}
      <div className="text-xs text-gray-500 mb-1.5">{nodeTypeDef.display_name}</div>

      {/* Config Summary */}
      {configuredCount > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-300">
          <div className="text-xs text-gray-600">
            {configuredCount} {configuredCount === 1 ? "field" : "fields"} configured
          </div>
        </div>
      )}

      {/* Required Inputs Indicator */}
      {nodeTypeDef.inputs.some((input) => input.required) && (
        <div className="absolute top-1 right-1">
          <div
            className="w-2 h-2 rounded-full bg-red-500"
            title="Has required inputs"
          />
        </div>
      )}
    </div>
  );
}
