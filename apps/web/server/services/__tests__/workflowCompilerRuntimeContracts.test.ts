import { describe, expect, it } from "vitest";

import {
  compileWorkflowDefinition,
  buildFeature195NodeAttemptJob,
  commitNodeAttempt,
  createNodeRun,
  createWorkflowRun,
  WorkflowCompilerRuntimeError,
  type WorkflowDefinitionV2,
} from "../workflowCompilerRuntimeContracts";
import {
  CORE_NODE_TYPE_IDS,
  computeNodeManifestDigest,
  getNodeTypeManifest,
  NodeTypeRegistry,
  stableDerivedPortId,
} from "../workflowNodeContracts";
import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";

const definition: WorkflowDefinitionV2 = {
  schemaVersion: "2",
  workflowId: "workflow-1",
  version: "1.0.0",
  interface: {
    inputs: {
      request: { schema: { type: "string" }, required: true },
    },
    outputs: {
      result: {
        schema: { type: "string" },
        source: { kind: "node-output", nodeId: "model", portId: "output" },
      },
    },
  },
  nodes: [
    {
      id: "model",
      typeId: "ai.model",
      typeVersion: "1.0.0",
      binding: { kind: "model", ref: "provider/model-v1" },
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
      channel: "data",
    },
  ],
  bindings: [
    {
      id: "binding-1",
      targetNodeId: "model",
      targetPortId: "input",
      source: { kind: "workflow-input", inputId: "request" },
    },
  ],
  scopes: [],
  policies: [],
  instrumentation: [],
};

describe("Spec 215 canonical workflow compiler/runtime contracts", () => {
  it("compiles every registered Spec 214 core type without hidden type switches", () => {
    for (const typeId of CORE_NODE_TYPE_IDS) {
      const manifest = getNodeTypeManifest(typeId, "1.0.0");
      const nodeId = `node-${typeId.replace(/[^a-z0-9-]/g, "-")}`;
      const candidate: WorkflowDefinitionV2 = {
        schemaVersion: "2",
        workflowId: `compile-${nodeId}`,
        version: "1.0.0",
        interface: {
          inputs: { request: { schema: { type: "object" }, required: true } },
          outputs: { result: { schema: { type: "object" }, source: { kind: "node-output", nodeId, portId: "output" } } },
        },
        nodes: [{
          id: nodeId,
          typeId,
          typeVersion: "1.0.0",
          ...(manifest.resolution.required ? { binding: { kind: manifest.resolution.allowedBindings[0], ref: `registered:${typeId}` } } : {}),
          config: {},
        }],
        edges: [],
        bindings: [{ id: `input-${nodeId}`, targetNodeId: nodeId, targetPortId: "input", source: { kind: "workflow-input", inputId: "request" } }],
        scopes: [], policies: [], instrumentation: [],
      };
      expect(compileWorkflowDefinition(candidate).nodes[0].typeId).toBe(typeId);
    }
  });

  it("compiles canonical nodes into a deterministic immutable plan lock", () => {
    const first = compileWorkflowDefinition(definition);
    const second = compileWorkflowDefinition(structuredClone(definition));

    expect(first.contractVersion).toBe("spec-215-v3");
    expect(first.planId).toBe(second.planId);
    expect(first.nodes.map(node => node.typeId)).toEqual([
      "ai.model",
      "data.transform",
    ]);
    expect(first.lock.nodeManifestDigests).toHaveLength(2);
    expect(first.nodes[0]).toMatchObject({
      portContract: { inputs: expect.any(Array), outputs: expect.any(Array) },
      dataGovernance: { outputClassificationRule: "derive" },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lock)).toBe(true);
  });

  it("rejects legacy IDs and executable input/output nodes", () => {
    expect(() =>
      compileWorkflowDefinition({
        ...definition,
        nodes: [
          {
            id: "legacy",
            typeId: "llm",
            typeVersion: "1.0.0",
            config: {},
          },
        ],
      })
    ).toThrow("NODE_TYPE_UNKNOWN");
    expect(() =>
      compileWorkflowDefinition({
        ...definition,
        nodes: [
          {
            id: "input",
            typeId: "core.input",
            typeVersion: "1.0.0",
            config: {},
          },
        ],
      })
    ).toThrow("NODE_TYPE_UNKNOWN");
  });

  it("validates binding targets and non-edge source ownership", () => {
    expect(() =>
      compileWorkflowDefinition({
        ...definition,
        bindings: [
          {
            id: "bad",
            targetNodeId: "missing",
            targetPortId: "input",
            source: { kind: "workflow-input", inputId: "request" },
          },
        ],
      })
    ).toThrow("WORKFLOW_BINDING_TARGET_INVALID");
    expect(() =>
      compileWorkflowDefinition({
        ...definition,
        interface: {
          ...definition.interface,
          outputs: {
            result: {
              schema: { type: "string" },
              source: { kind: "node-output", nodeId: "missing", portId: "output" },
            },
          },
        },
      })
    ).toThrow("WORKFLOW_OUTPUT_SOURCE_INVALID");
  });

  it("fails closed on missing required inputs, mixed cardinality, and unknown binding sources", () => {
    expect(() => compileWorkflowDefinition({ ...definition, edges: [], bindings: [] })).toThrow("WORKFLOW_REQUIRED_INPUT_MISSING");
    expect(() => compileWorkflowDefinition({
      ...definition,
      bindings: [...(definition.bindings ?? []), { id: "duplicate-source", targetNodeId: "transform", targetPortId: "input", source: { kind: "literal", value: 1 } }],
    })).toThrow("WORKFLOW_INPUT_CARDINALITY_INVALID");
    expect(() => compileWorkflowDefinition({
      ...definition,
      bindings: [{ id: "unknown-kind", targetNodeId: "model", targetPortId: "input", source: { kind: "unknown" } as never }],
    })).toThrow("WORKFLOW_BINDING_SOURCE_INVALID");
  });

  it("validates scope, policy, and instrumentation declarations before locking a plan", () => {
    expect(() => compileWorkflowDefinition({
      ...definition,
      policies: [{ id: "retry-1", kind: "retry", targetNodeIds: ["missing"], config: {} }],
    })).toThrow("WORKFLOW_POLICY_INVALID");
    expect(() => compileWorkflowDefinition({
      ...definition,
      scopes: [{ id: "scope-1", kind: "unknown", nodeIds: ["model"], config: {} } as never],
    })).toThrow("WORKFLOW_SCOPE_INVALID");
    expect(() => compileWorkflowDefinition({
      ...definition,
      policies: [{ id: "bad-config", kind: "retry", targetNodeIds: ["model"], config: { retryForever: true } }],
    })).toThrow("WORKFLOW_POLICY_INVALID");
  });

  it("compiles trusted derived port projections into the immutable contract", () => {
    const base = getNodeTypeManifest("data.transform", "1.0.0");
    const manifest = {
      ...base,
      ports: { ...base.ports, derivation: { mode: "config-derived" as const, resolverRef: "test.transform-ports", resolverVersion: "1", stablePortIdStrategy: "sha256-v1" } },
      identity: { ...base.identity, manifestDigest: "" },
    };
    manifest.identity.manifestDigest = computeNodeManifestDigest(manifest);
    const registry = new NodeTypeRegistry([manifest]);
    const inputId = stableDerivedPortId({ typeId: "data.transform", resolverVersion: "1", bindingRef: "config-derived", direction: "input", semanticName: "query" });
    const outputId = stableDerivedPortId({ typeId: "data.transform", resolverVersion: "1", bindingRef: "config-derived", direction: "output", semanticName: "result" });
    const derivedDefinition: WorkflowDefinitionV2 = {
      ...definition,
      nodes: [{ id: "transform", typeId: "data.transform", typeVersion: "1.0.0", config: { operation: "passthrough" } }],
      edges: [],
      bindings: [{ id: "input-binding", targetNodeId: "transform", targetPortId: inputId, source: { kind: "workflow-input", inputId: "request" } }],
      interface: { ...definition.interface, outputs: { result: { schema: { type: "string" }, source: { kind: "node-output", nodeId: "transform", portId: outputId } } } },
    };
    const projection = {
      inputs: [{ direction: "input" as const, channel: "data" as const, semanticName: "query", schema: { type: "string" } }],
      outputs: [{ direction: "output" as const, channel: "data" as const, semanticName: "result", schema: { type: "string" } }],
    };
    const plan = compileWorkflowDefinition(derivedDefinition, { transform: projection }, registry);
    expect(plan.nodes[0].portContract.inputs[0].id).toBe(inputId);
    expect(plan.nodes[0].portContract.outputs[0].id).toBe(outputId);
  });

  it("keeps logical NodeRun and NodeAttempt separate and commits once", () => {
    const plan = compileWorkflowDefinition(definition);
    const run = createWorkflowRun(plan, "manual:1", "input-snapshot-1");
    const nodeRun = createNodeRun(run, "model");
    const attempt = {
      attemptId: "attempt-1",
      nodeRunId: nodeRun.nodeRunId,
      attemptNumber: 1,
      inputSnapshotRef: "input-snapshot-1",
    };
    const committed = commitNodeAttempt(nodeRun, attempt, "output-1");
    expect(run.status).toBe("running");
    expect(committed.status).toBe("completed");
    expect(committed.committedAttemptId).toBe("attempt-1");
    expect(() => commitNodeAttempt(committed, attempt, "output-2")).toThrow(
      new WorkflowCompilerRuntimeError("NODE_RUN_ALREADY_COMMITTED")
    );
  });

  it("hands physical async work to Feature 195 without creating another queue", () => {
    const plan = compileWorkflowDefinition(definition);
    const run = createWorkflowRun(plan, "manual:2", "input-snapshot-2");
    const nodeRun = createNodeRun(run, "model");
    const job = buildFeature195NodeAttemptJob({
      tenantId: "tenant-1",
      actorId: 7,
      plan,
      run,
      nodeRun,
      attempt: {
        attemptId: "attempt-2",
        nodeRunId: nodeRun.nodeRunId,
        attemptNumber: 1,
        inputSnapshotRef: "input-snapshot-2",
      },
    });
    expect(job).toMatchObject({
      contractVersion: "feature-186-v1",
      jobType: "workflow.node.execute",
      tenantId: "tenant-1",
      requestedByUserId: 7,
    });
    expect(job.input).toMatchObject({
      planId: plan.planId,
      nodeRunId: nodeRun.nodeRunId,
      attemptId: "attempt-2",
    });
  });

  it("registers the physical handoff and fails closed without a runtime adapter", async () => {
    const registration = defaultJobExecutorRegistry.resolve(
      "workflow.node.execute",
      "feature-186-v1"
    );
    expect(registration).toMatchObject({
      jobType: "workflow.node.execute",
      executionClass: "long",
    });
    await expect(
      registration!.executor({
        context: {
          input: {
            planId: "plan-1",
            workflowRunId: "run-1",
            nodeRunId: "node-run-1",
            attemptId: "attempt-1",
            nodeId: "model",
            typeId: "ai.model",
            typeVersion: "1.0.0",
            manifestDigest: "a".repeat(64),
            inputSnapshotRef: "snapshot-1",
          },
          tenantId: "tenant-1",
          requestedByUserId: 7,
        } as any,
        lease: {} as any,
        reporter: {} as any,
        controlPlane: {} as any,
      })
    ).rejects.toMatchObject({ code: "JOB_EXECUTOR_UNREGISTERED" });
  });
});
