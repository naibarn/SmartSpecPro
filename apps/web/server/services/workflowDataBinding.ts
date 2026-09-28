export class WorkflowBindingError extends Error {
  readonly code: "NESTED_CYCLE";
  constructor(code: "NESTED_CYCLE", message = code) {
    super(message);
    this.name = "WorkflowBindingError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type BindingEndpoint = {
  tenantId?: string;
  nodeId: string;
  field: string;
  type: "string" | "number" | "boolean" | "object" | "array";
};
export function validateWorkflowBinding(input: {
  tenantId: string;
  source: BindingEndpoint;
  target: Omit<BindingEndpoint, "tenantId">;
}):
  | { valid: true; label: string }
  | { valid: false; reasonCode: "SOURCE_INACCESSIBLE" | "TYPE_INCOMPATIBLE" } {
  if (input.source.tenantId !== input.tenantId)
    return { valid: false, reasonCode: "SOURCE_INACCESSIBLE" };
  if (input.source.type !== input.target.type)
    return { valid: false, reasonCode: "TYPE_INCOMPATIBLE" };
  return {
    valid: true,
    label: `${input.source.nodeId}.${input.source.field} → ${input.target.nodeId}.${input.target.field}`,
  };
}

export function validateNestedWorkflowGraph(
  edges: Array<{ from: string; to: string }>
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return false;
    if (visited.has(node)) return true;
    visiting.add(node);
    for (const edge of edges.filter(item => item.from === node))
      if (!walk(edge.to)) return false;
    visiting.delete(node);
    visited.add(node);
    return true;
  };
  if (edges.some(edge => !walk(edge.from)))
    throw new WorkflowBindingError("NESTED_CYCLE");
}

export function acceptWorkflowRunEvent(input: {
  currentVersion: number;
  currentRunId: string | null;
  event: { version: number; runId: string; status: string };
}): {
  accepted: boolean;
  reasonCode: "ACCEPTED" | "STALE_VERSION" | "STALE_RUN";
  status?: string;
} {
  if (input.event.version !== input.currentVersion)
    return { accepted: false, reasonCode: "STALE_VERSION" };
  if (input.currentRunId !== input.event.runId)
    return { accepted: false, reasonCode: "STALE_RUN" };
  return { accepted: true, reasonCode: "ACCEPTED", status: input.event.status };
}
