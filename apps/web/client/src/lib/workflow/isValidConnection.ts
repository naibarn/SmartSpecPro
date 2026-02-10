/**
 * Connection validation for ReactFlow.
 *
 * Provides the isValidConnection callback that enforces port type compatibility.
 */

import type { Connection, Node } from "reactflow";
import { useNodeRegistry } from "./useNodeRegistry";
import { isCompatibleConnection } from "./dataTypes";
import type { NodeTypeSpec } from "./useNodeRegistry";

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
  nodes: Node[],
  nodeTypes: NodeTypeSpec[]
): boolean {
  if (!connection.source || !connection.target) return false;
  if (!connection.sourceHandle || !connection.targetHandle) return false;

  // Find the source and target nodes
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) return false;

  // Get node type definitions from registry
  const sourceNodeType = nodeTypes.find((nt) => nt.type === sourceNode.data.nodeType);
  const targetNodeType = nodeTypes.find((nt) => nt.type === targetNode.data.nodeType);

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
    console.log("Target input does not accept connections", {
      targetHandle: connection.targetHandle,
    });
    return false;
  }

  // Check type compatibility
  const compatible = isCompatibleConnection(
    sourceOutputSpec.data_type,
    targetInputSpec.data_type
  );

  if (!compatible) {
    console.log("Incompatible port types", {
      source: sourceOutputSpec.data_type,
      target: targetInputSpec.data_type,
    });
  }

  return compatible;
}

/**
 * Hook to create an isValidConnection callback for ReactFlow.
 *
 * @returns isValidConnection function that validates port type compatibility
 */
export function useIsValidConnection(nodes: Node[]) {
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

    if (!sourceNode || !targetNode) return false;

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
      console.log("Target input does not accept connections", {
        targetHandle: connection.targetHandle,
      });
      return false;
    }

    // Check type compatibility
    const compatible = isCompatibleConnection(
      sourceOutputSpec.data_type,
      targetInputSpec.data_type
    );

    if (!compatible) {
      console.log("Incompatible port types", {
        source: sourceOutputSpec.data_type,
        target: targetInputSpec.data_type,
      });
    }

    return compatible;
  };

  return { isValidConnection };
}
