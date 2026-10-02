import { describe, expect, it } from "vitest";

import {
  buildWorkflowExecutionPlan,
  getReadyWorkflowNodeIds,
  pinWorkflowRunPlan,
  normalizeWorkflowRunRequest,
  workflowControlActionBlocker,
  workflowRunIntentMatches,
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
        source: {
          kind: "node-output" as const,
          nodeId: "transform",
          portId: "output",
        },
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
  edges: [
    {
      id: "edge-1",
      fromNodeId: "model",
      fromPortId: "output",
      toNodeId: "transform",
      toPortId: "input",
      channel: "data" as const,
    },
  ],
  bindings: [
    {
      id: "binding-1",
      targetNodeId: "model",
      targetPortId: "input",
      source: { kind: "workflow-input" as const, inputId: "request" },
    },
  ],
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

  it("fails closed on run controls that lack their owning logical-run bridge", () => {
    expect(workflowControlActionBlocker("approve")).toBe("WORKFLOW_HUMAN_ATTENTION_BRIDGE_UNAVAILABLE");
    expect(workflowControlActionBlocker("submit_input")).toBe("WORKFLOW_HUMAN_ATTENTION_BRIDGE_UNAVAILABLE");
    expect(workflowControlActionBlocker("retry")).toBe("WORKFLOW_NODE_SCOPED_RETRY_UNAVAILABLE");
    expect(workflowControlActionBlocker("resume")).toBe("WORKFLOW_NODE_SCOPED_RETRY_UNAVAILABLE");
    expect(workflowControlActionBlocker("cancel")).toBeUndefined();
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
      input: { request: "hello" },
      mode: "full",
      idempotencyKey: "intent-1",
    });

    expect(plan.contractVersion).toBe("spec-215-v3");
    expect(plan.jobType).toBe("workflow.node.execute");
    expect(plan.idempotencyKey).toBe("intent-1:workflow");
    expect(plan.jobs).toHaveLength(2);
    expect(plan.input.input).toEqual({ request: "hello" });
    expect(plan.jobs.every(job => job.input.workflowRunId === "run-1")).toBe(
      true
    );
    expect(plan.initialJobs).toHaveLength(1);
    expect(plan.initialJobs[0].input.nodeId).toBe(plan.jobs[0].input.nodeId);
    expect(
      getReadyWorkflowNodeIds({
        plan: plan.workflowPlan,
        selectedNodeIds: plan.input.selectedNodeIds,
        completedNodeIds: new Set([String(plan.jobs[0].input.nodeId)]),
      })
    ).toEqual([String(plan.jobs[1].input.nodeId)]);
    expect(plan.jobs[0]).toMatchObject({
      jobType: "workflow.node.execute",
      contractVersion: "feature-186-v1",
    });
    expect(plan.jobs.every(job => job.idempotencyKey.length <= 128)).toBe(true);
    const pinned = pinWorkflowRunPlan({
      plan,
      inputFingerprint: "f".repeat(64),
    });
    expect(pinned.selectedNodeIds).toEqual(plan.input.selectedNodeIds);
    expect(pinned.mode).toBe("full");
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
          edges: [
            ...definition.edges,
            {
              id: "edge-2",
              fromNodeId: "transform",
              fromPortId: "output",
              toNodeId: "model",
              toPortId: "input",
              channel: "data" as const,
            },
          ],
        },
        input: { request: "hello" },
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
        input: { request: "hello" },
        mode: "run_until",
        targetNodeId: "missing",
        idempotencyKey: "intent-1",
      })
    ).toThrow("TARGET_NODE_INVALID");
  });

  it("validates workflow inputs, applies defaults, and rejects unknown values", () => {
    const withOptionalDefault = {
      ...definition,
      interface: {
        ...definition.interface,
        inputs: {
          request: { schema: { type: "string" }, required: true },
          locale: { schema: { type: "string" }, default: "en" },
        },
      },
    };
    const plan = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-input-default",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition: withOptionalDefault,
      input: { request: "hello" },
      mode: "full",
      idempotencyKey: "input-default",
    });
    expect(plan.input.input).toEqual({ request: "hello", locale: "en" });
    expect(() => buildWorkflowExecutionPlan({
      tenantId: "tenant-1", actorId: 7, runId: "run-input-missing",
      definitionId: "definition-1", versionId: "1", contentHash: "a".repeat(64),
      definition, input: {}, mode: "full", idempotencyKey: "input-missing",
    })).toThrow("WORKFLOW_INPUT_REQUIRED:request");
    expect(() => buildWorkflowExecutionPlan({
      tenantId: "tenant-1", actorId: 7, runId: "run-input-unknown",
      definitionId: "definition-1", versionId: "1", contentHash: "a".repeat(64),
      definition, input: { request: "hello", injected: true }, mode: "full", idempotencyKey: "input-unknown",
    })).toThrow("WORKFLOW_INPUT_UNKNOWN");
    expect(() => buildWorkflowExecutionPlan({
      tenantId: "tenant-1", actorId: 7, runId: "run-input-schema",
      definitionId: "definition-1", versionId: "1", contentHash: "a".repeat(64),
      definition, input: { request: { text: "not a string" } }, mode: "full", idempotencyKey: "input-schema",
    })).toThrow("WORKFLOW_INPUT_SCHEMA_INVALID:request");
  });

  it("fingerprints semantically equal input objects independent of key order", () => {
    const twoInputs = {
      ...definition,
      interface: {
        ...definition.interface,
        inputs: {
          request: { schema: { type: "string" }, required: true },
          locale: { schema: { type: "string" }, required: true },
        },
      },
    };
    const first = buildWorkflowExecutionPlan({
      tenantId: "tenant-1", actorId: 7, runId: "run-order-1",
      definitionId: "definition-1", versionId: "1", contentHash: "a".repeat(64),
      definition: twoInputs, input: { request: "hello", locale: "en" }, mode: "full", idempotencyKey: "order-1",
    });
    const second = buildWorkflowExecutionPlan({
      tenantId: "tenant-1", actorId: 7, runId: "run-order-2",
      definitionId: "definition-1", versionId: "1", contentHash: "a".repeat(64),
      definition: twoInputs, input: { locale: "en", request: "hello" }, mode: "full", idempotencyKey: "order-2",
    });
    expect(first.jobs[0].input.inputSnapshotRef).toBe(second.jobs[0].input.inputSnapshotRef);
  });

  it("replays only the exact pinned run intent", () => {
    const existing = {
      contentHash: "a".repeat(64), versionId: "version-1", inputFingerprint: "b".repeat(64),
      mode: "full", targetNodeId: null, checkpointId: null,
      selectedNodeIdsJson: ["model", "transform"], planHash: "c".repeat(64),
    };
    const requested = {
      ...existing, targetNodeId: undefined, checkpointId: undefined,
      selectedNodeIds: ["model", "transform"],
    };
    expect(workflowRunIntentMatches(existing, requested)).toBe(true);
    expect(workflowRunIntentMatches(existing, { ...requested, mode: "run_node" })).toBe(false);
    expect(workflowRunIntentMatches(existing, { ...requested, checkpointId: "checkpoint-1" })).toBe(false);
    expect(workflowRunIntentMatches(existing, { ...requested, planHash: "d".repeat(64) })).toBe(false);
  });

  it("projects attached retry and timeout policies into canonical jobs", () => {
    const plan = buildWorkflowExecutionPlan({
      tenantId: "tenant-1",
      actorId: 7,
      runId: "run-policy",
      definitionId: "definition-1",
      versionId: "version-1",
      contentHash: "a".repeat(64),
      definition: {
        ...definition,
        policies: [
          {
            id: "retry-model",
            kind: "retry",
            targetNodeIds: ["model"],
            config: {
              maxAttempts: 4,
              baseDelayMs: 500,
              maxDelayMs: 5_000,
              jitter: "recorded",
            },
          },
          {
            id: "timeout-model",
            kind: "timeout",
            targetNodeIds: ["model"],
            config: { softTimeoutMs: 10_000, hardTimeoutMs: 30_000 },
          },
        ],
      },
      input: { request: "hello" },
      mode: "full",
      idempotencyKey: "policy-intent",
    });
    expect(plan.jobs[0]).toMatchObject({
      retryPolicy: {
        maxAttempts: 4,
        baseDelayMs: 500,
        maxDelayMs: 5_000,
        jitter: "recorded",
      },
      timeoutPolicy: { softTimeoutMs: 10_000, hardTimeoutMs: 30_000 },
    });
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
      input: { request: "hello" },
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
      input: { request: "hello" },
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
      input: { request: "hello" },
      mode: "run_from",
      targetNodeId: "transform",
      checkpointId: "checkpoint-1",
      completedNodeIds: ["model"],
      completedOutputRefs: { model: ["artifact:model-output"] },
      idempotencyKey: "intent-4",
    });
    expect(resumed.input.selectedNodeIds).toEqual(["transform"]);
    expect(resumed.initialJobs[0].input.inputArtifactRefs).toEqual(["artifact:model-output"]);
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
      bindings: [
        {
          id: "input-model",
          targetNodeId: "model",
          targetPortId: "input",
          source: { kind: "workflow-input" as const, inputId: "request" },
        },
      ],
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
    expect(JSON.stringify(plan)).not.toMatch(
      /workflow\.studio\.execute|feature-209-v1/
    );
  });
});
