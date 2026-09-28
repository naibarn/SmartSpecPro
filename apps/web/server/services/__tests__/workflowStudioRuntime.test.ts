import { describe, expect, it } from "vitest";

import {
  buildWorkflowExecutionPlan,
  normalizeWorkflowRunRequest,
  WorkflowRuntimeError,
} from "../workflowStudioRuntime";

const definition = {
  schemaVersion: "2" as const,
  workflowId: "workflow-1",
  version: "1.0.0",
  interface: {
    inputs: { request: { schema: { type: "string" }, required: true } },
    outputs: {
      result: {
        schema: { type: "string" },
        source: { kind: "node-output" as const, nodeId: "transform", portId: "output" },
      },
    },
  },
  nodes: [
    {
      id: "model",
      typeId: "ai.model",
      typeVersion: "1.0.0",
      binding: { kind: "model" as const, ref: "provider/model-v1" },
      config: { prompt: "{{request}}" },
    },
    {
      id: "transform",
      typeId: "data.transform",
      typeVersion: "1.0.0",
      config: { operation: "passthrough" },
    },
  ],
  edges: [{ id: "edge-1", fromNodeId: "model", fromPortId: "output", toNodeId: "transform", toPortId: "input", channel: "data" as const }],
  bindings: [{ id: "binding-1", targetNodeId: "model", targetPortId: "input", source: { kind: "workflow-input" as const, inputId: "request" } }],
};

describe("workflow studio runtime admission", () => {
  it("normalizes full and bounded run modes without trusting client job fields", () => {
    expect(
      normalizeWorkflowRunRequest({ mode: "full", input: { text: "hello" } })
    ).toMatchObject({
      mode: "full",
      input: { text: "hello" },
    });
    expect(() =>
      normalizeWorkflowRunRequest({ mode: "run_until", input: {} })
    ).toThrow(new WorkflowRuntimeError("TARGET_NODE_REQUIRED"));
  });

  it("creates a deterministic canonical plan with one Feature 195 job per node run", () => {
    const plan = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-1",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition,
      input: { text: "hello" },
      mode: "full",
      idempotencyKey: "intent-1",
    });

    expect(plan.contractVersion).toBe("spec-215-v3");
    expect(plan.jobType).toBe("workflow.node.execute");
    expect(plan.idempotencyKey).toBe("intent-1:workflow");
    expect(plan.jobs).toHaveLength(2);
    expect(plan.jobs[0]).toMatchObject({
      jobType: "workflow.node.execute",
      contractVersion: "feature-186-v1",
    });
  });

  it("rejects cycles and unsupported bounded targets before admission", () => {
    expect(() =>
      buildWorkflowExecutionPlan({
        tenantId: "tenant-1",
        actorId: 7,
        runId: "run-1",
        definitionId: "definition-1",
        versionId: "version-1",
        contentHash: "a".repeat(64),
        definition: {
          ...definition,
          edges: [...definition.edges, { id: "edge-2", fromNodeId: "transform", fromPortId: "output", toNodeId: "model", toPortId: "input", channel: "data" as const }],
        },
        input: {},
        mode: "full",
        idempotencyKey: "intent-1",
      })
    ).toThrow("CYCLE_DETECTED");
    expect(() =>
      buildWorkflowExecutionPlan({
        tenantId: "tenant-1",
        actorId: 7,
        runId: "run-1",
        definitionId: "definition-1",
        versionId: "version-1",
        contentHash: "a".repeat(64),
        definition,
        input: {},
        mode: "run_until",
        targetNodeId: "missing",
        idempotencyKey: "intent-1",
      })
    ).toThrow("TARGET_NODE_INVALID");
  });

  it("compiles bounded modes instead of dispatching the entire graph", () => {
    const runUntil = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-2",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition,
      input: {},
      mode: "run_until",
      targetNodeId: "transform",
      idempotencyKey: "intent-2",
    });
    expect(runUntil.input.selectedNodeIds).toEqual(["model", "transform"]);

    const runNode = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-3",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition,
      input: {},
      mode: "run_node",
      targetNodeId: "transform",
      idempotencyKey: "intent-3",
    });
    expect(runNode.input.selectedNodeIds).toEqual(["transform"]);

    const resumed = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-4",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition,
      input: {},
      mode: "run_from",
      targetNodeId: "transform",
      checkpointId: "checkpoint-1",
      completedNodeIds: ["model"],
      idempotencyKey: "intent-4",
    });
    expect(resumed.input.selectedNodeIds).toEqual(["transform"]);
  });

  it("admits canonical plans through Feature 195 node-attempt jobs", () => {
    const canonicalDefinition = {
      schemaVersion: "2" as const,
      workflowId: "workflow-1",
      version: "1.0.0",
      interface: {
        inputs: { request: { schema: { type: "string" }, required: true } },
        outputs: {
          result: {
            schema: { type: "string" },
            source: { kind: "literal" as const, value: "ok" },
          },
        },
      },
      nodes: [
        {
          id: "model",
          typeId: "ai.model",
          typeVersion: "1.0.0",
          binding: { kind: "model" as const, ref: "provider/model-v1" },
          config: { prompt: "{{request}}" },
        },
      ],
      edges: [],
      bindings: [{ id: "input-model", targetNodeId: "model", targetPortId: "input", source: { kind: "workflow-input" as const, inputId: "request" } }],
    };
    const plan = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-canonical",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition: canonicalDefinition as any,
      input: { request: "hello" },
      mode: "full",
      idempotencyKey: "intent-canonical",
    }) as any;

    expect(plan.contractVersion).toBe("spec-215-v3");
    expect(plan.jobs[0]).toMatchObject({
      jobType: "workflow.node.execute",
      contractVersion: "feature-186-v1",
    });
    expect(JSON.stringify(plan)).not.toMatch(/workflow\.studio\.execute|feature-209-v1/);
  });
});
