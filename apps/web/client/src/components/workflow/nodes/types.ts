import type { Node, NodeProps } from "@xyflow/react";

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;
export type WorkflowFlowNodeProps = NodeProps<WorkflowFlowNode>;

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  collapsed: boolean;
  onToggleCollapse: (groupId: string) => void;
}

export type WorkflowGroupNode = Node<GroupNodeData, "group">;
export type WorkflowGroupNodeProps = NodeProps<WorkflowGroupNode>;

export type WorkflowCanvasNode = WorkflowFlowNode | WorkflowGroupNode;

export function isWorkflowFlowNode(
  node: WorkflowCanvasNode,
): node is WorkflowFlowNode {
  return node.type !== "group";
}
