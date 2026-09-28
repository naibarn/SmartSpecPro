import { describe, expect, it } from "vitest";
import {
  WorkflowBindingError,
  validateWorkflowBinding,
  validateNestedWorkflowGraph,
  acceptWorkflowRunEvent,
} from "../workflowDataBinding";

describe("workflowDataBinding", () => {
  it("accepts compatible tenant-scoped bindings and rejects inaccessible/type-mismatch sources", () => {
    expect(
      validateWorkflowBinding({
        tenantId: "tenant-1",
        source: {
          tenantId: "tenant-1",
          nodeId: "a",
          field: "text",
          type: "string",
        },
        target: { nodeId: "b", field: "prompt", type: "string" },
      })
    ).toMatchObject({ valid: true });
    expect(
      validateWorkflowBinding({
        tenantId: "tenant-1",
        source: {
          tenantId: "tenant-2",
          nodeId: "a",
          field: "text",
          type: "string",
        },
        target: { nodeId: "b", field: "prompt", type: "string" },
      })
    ).toMatchObject({ valid: false, reasonCode: "SOURCE_INACCESSIBLE" });
    expect(
      validateWorkflowBinding({
        tenantId: "tenant-1",
        source: {
          tenantId: "tenant-1",
          nodeId: "a",
          field: "count",
          type: "number",
        },
        target: { nodeId: "b", field: "prompt", type: "string" },
      })
    ).toMatchObject({ valid: false, reasonCode: "TYPE_INCOMPATIBLE" });
  });

  it("rejects nested cycles and stale run events", () => {
    expect(() =>
      validateNestedWorkflowGraph([
        { from: "root", to: "sub" },
        { from: "sub", to: "root" },
      ])
    ).toThrowError(new WorkflowBindingError("NESTED_CYCLE"));
    expect(
      acceptWorkflowRunEvent({
        currentVersion: 2,
        currentRunId: "run-1",
        event: { version: 1, runId: "run-1", status: "succeeded" },
      })
    ).toMatchObject({ accepted: false, reasonCode: "STALE_VERSION" });
    expect(
      acceptWorkflowRunEvent({
        currentVersion: 2,
        currentRunId: "run-2",
        event: { version: 2, runId: "run-1", status: "running" },
      })
    ).toMatchObject({ accepted: false, reasonCode: "STALE_RUN" });
  });
});
