/**
 * Connection validation for ReactFlow.
 *
 * Provides the isValidConnection callback that enforces port type compatibility.
 */

import type { Connection, Node } from "@xyflow/react";
import { useNodeRegistry } from "./useNodeRegistry";
import { isCompatibleConnection, getDataTypeLabel } from "./dataTypes";
import type { NodeTypeSpec } from "./useNodeRegistry";
import type {
  WorkflowCanvasNode,
  WorkflowNodeData,
} from "@/components/workflow/nodes/types";
import { isWorkflowFlowNode } from "@/components/workflow/nodes/types";

/**
 * Returns a human-readable error message if the connection is invalid, or null if valid.
 *
 * Returns null (no message) for internal errors (missing nodes, unregistered types, port not found)
 * since those indicate a system issue rather than a user mistake.
 * Returns a descriptive string for actionable user errors (wrong type, non-connectable input).
 */
export function getConnectionError(
  connection: Connection,
  nodes: WorkflowCanvasNode[],
  nodeTypes: NodeTypeSpec[]
): string | null {
  if (!connection.source || !connection.target) return null;
  if (!connection.sourceHandle || !connection.targetHandle) return null;

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (
    !sourceNode ||
    !targetNode ||
    !isWorkflowFlowNode(sourceNode) ||
    !isWorkflowFlowNode(targetNode)
  ) return null;

  const sourceNodeType = nodeTypes.find((nt) => nt.type === sourceNode.data.nodeType);
  const targetNodeType = nodeTypes.find((nt) => nt.type === targetNode.data.nodeType);

  if (!sourceNodeType || !targetNodeType) {
    console.warn("Node type not found in registry", {
      source: sourceNode.data.nodeType,
      target: targetNode.data.nodeType,
    });
    return null;
  }

  const sourceOutputSpec = sourceNodeType.outputs.find(
    (output) => output.name === connection.sourceHandle
  );

  const targetInputSpec = targetNodeType.inputs.find(
    (input) => input.name === connection.targetHandle
  );

  if (!sourceOutputSpec || !targetInputSpec) {
    console.warn("Port not found in node type definition", {
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    });
    return null;
  }

  // Check if the target input accepts connections at all
  if (!targetInputSpec.accepts_connection) {
    return (
      `"${targetInputSpec.display_name}" on "${targetNodeType.display_name}" ` +
      `only accepts manual input — it cannot be wired from another node`
    );
  }

  // Check data type compatibility
  const compatible = isCompatibleConnection(
    sourceOutputSpec.data_type,
    targetInputSpec.data_type
  );

  if (!compatible) {
    const srcLabel = getDataTypeLabel(sourceOutputSpec.data_type);
    const tgtLabel = getDataTypeLabel(targetInputSpec.data_type);
    return (
      `Type mismatch: "${sourceOutputSpec.display_name}" on "${sourceNodeType.display_name}" ` +
      `outputs ${srcLabel}, but "${targetInputSpec.display_name}" on "${targetNodeType.display_name}" ` +
      `expects ${tgtLabel}`
    );
  }

  return null;
}

/**
 * Standalone validation function (non-hook).
 *
 * @param connection - The proposed connection
 * @param nodes - All nodes in the flow
 * @param nodeTypes - Node type registry
 * @returns true if connection is valid, false otherwise
 */
export function isValidConnection(
  connection: Connection,
  nodes: WorkflowCanvasNode[],
  nodeTypes: NodeTypeSpec[]
): boolean {
  return getConnectionError(connection, nodes, nodeTypes) === null;
}

/**
 * Hook to create an isValidConnection callback for ReactFlow.
 *
 * @returns isValidConnection function that validates port type compatibility
 */
export function useIsValidConnection(nodes: WorkflowCanvasNode[]) {
  const { getNodeType } = useNodeRegistry();

  /**
   * Validate if a connection is allowed based on port types.
   *
   * @param connection - The proposed connection
   * @returns true if connection is valid, false otherwise
   */
  const isValidConnection = (connection: Connection): boolean => {
    if (!connection.source || !connection.target) return false;
    if (!connection.sourceHandle || !connection.targetHandle) return false;

    // Find the source and target nodes
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);

    if (
      !sourceNode ||
      !targetNode ||
      !isWorkflowFlowNode(sourceNode) ||
      !isWorkflowFlowNode(targetNode)
    ) return false;

    // Get node type definitions from registry
    const sourceNodeType = getNodeType(sourceNode.data.nodeType);
    const targetNodeType = getNodeType(targetNode.data.nodeType);

    if (!sourceNodeType || !targetNodeType) {
      console.warn("Node type not found in registry", {
        source: sourceNode.data.nodeType,
        target: targetNode.data.nodeType,
      });
      return false;
    }

    // Find the output and input specs
    const sourceOutputSpec = sourceNodeType.outputs.find(
      (output) => output.name === connection.sourceHandle
    );

    const targetInputSpec = targetNodeType.inputs.find(
      (input) => input.name === connection.targetHandle
    );

    if (!sourceOutputSpec || !targetInputSpec) {
      console.warn("Port not found in node type definition", {
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      });
      return false;
    }

    // Check if the input accepts connections
    if (!targetInputSpec.accepts_connection) {
      return false;
    }

    // Check type compatibility
    return isCompatibleConnection(sourceOutputSpec.data_type, targetInputSpec.data_type);
  };

  return { isValidConnection };
}
