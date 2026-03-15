export const WORKFLOW_BROWSER_SESSION_NODE_TYPES = [
  "browser_session_start",
  "browser_session_instruction",
  "browser_session_wait_for_user",
  "browser_session_review_gate",
] as const;

const WORKFLOW_BROWSER_SESSION_NODE_TYPE_SET = new Set<string>(
  WORKFLOW_BROWSER_SESSION_NODE_TYPES,
);

export function isWorkflowBrowserSessionNodeType(nodeType: unknown): nodeType is (typeof WORKFLOW_BROWSER_SESSION_NODE_TYPES)[number] {
  return typeof nodeType === "string" && WORKFLOW_BROWSER_SESSION_NODE_TYPE_SET.has(nodeType);
}

export function filterWorkflowNodeTypeSpecs<T extends { type: string }>(
  nodeTypes: readonly T[],
  workflowBrowserSessionNodesEnabled: boolean,
): T[] {
  if (workflowBrowserSessionNodesEnabled) {
    return [...nodeTypes];
  }

  return nodeTypes.filter((nodeType) => !isWorkflowBrowserSessionNodeType(nodeType.type));
}

export function workflowContainsBrowserSessionNodes(nodes: readonly unknown[]): boolean {
  return nodes.some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }

    const record = node as Record<string, unknown>;
    if (isWorkflowBrowserSessionNodeType(record.type)) {
      return true;
    }

    const data = record.data;
    if (!data || typeof data !== "object") {
      return false;
    }

    return isWorkflowBrowserSessionNodeType((data as Record<string, unknown>).nodeType);
  });
}
