export const WORKFLOW_WORKER_RUNTIME_NODE_TYPES = [
  "dispatch_worker_job",
  "wait_for_worker_completion",
  "publish_worker_artifacts",
  "trigger_worker_rag_index",
] as const;

const WORKFLOW_WORKER_RUNTIME_NODE_TYPE_SET = new Set<string>(
  WORKFLOW_WORKER_RUNTIME_NODE_TYPES,
);

export function isWorkflowWorkerRuntimeNodeType(
  nodeType: unknown,
): nodeType is (typeof WORKFLOW_WORKER_RUNTIME_NODE_TYPES)[number] {
  return typeof nodeType === "string" && WORKFLOW_WORKER_RUNTIME_NODE_TYPE_SET.has(nodeType);
}

export function filterWorkflowWorkerRuntimeNodeTypeSpecs<T extends { type: string }>(
  nodeTypes: readonly T[],
  workerRuntimeNodesEnabled: boolean,
): T[] {
  if (workerRuntimeNodesEnabled) {
    return [...nodeTypes];
  }

  return nodeTypes.filter((nodeType) => !isWorkflowWorkerRuntimeNodeType(nodeType.type));
}

export function workflowContainsWorkerRuntimeNodes(nodes: readonly unknown[]): boolean {
  return nodes.some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }

    const record = node as Record<string, unknown>;
    if (isWorkflowWorkerRuntimeNodeType(record.type)) {
      return true;
    }

    const data = record.data;
    if (!data || typeof data !== "object") {
      return false;
    }

    return isWorkflowWorkerRuntimeNodeType((data as Record<string, unknown>).nodeType);
  });
}
