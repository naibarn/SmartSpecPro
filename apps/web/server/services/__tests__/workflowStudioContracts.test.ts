import { describe, expect, it } from "vitest";
import {
  WorkflowStudioError,
  assertWorkflowDraftRevision,
  createWorkflowDraft,
  publishWorkflowVersion,
  validateWorkflowDefinition,
} from "../workflowStudioContracts";

describe("workflow draft revision contract", () => {
  it("accepts the current revision and rejects stale saves", () => {
    expect(assertWorkflowDraftRevision(4, 4)).toBe(true);
    expect(() => assertWorkflowDraftRevision(3, 4)).toThrow(
      "DRAFT_REVISION_CONFLICT"
    );
  });
});

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
    { id: "transform", typeId: "data.transform", typeVersion: "1.0.0", config: { operation: "passthrough" } },
  ],
  edges: [],
  bindings: [{ id: "input-transform", targetNodeId: "transform", targetPortId: "input", source: { kind: "workflow-input", inputId: "request" } }],
};

const legacyDefinition = {
  nodes: [
    { id: "input", type: "input", inputs: [], outputs: [{ name: "text", type: "string" }] },
    { id: "output", type: "output", inputs: [{ name: "text", type: "string" }], outputs: [] },
  ],
  edges: [{ from: "input", to: "output" }],
};

describe("workflowStudioContracts", () => {
  it("validates semantic definitions separately from view state and redacts secrets", () => {
    expect(validateWorkflowDefinition(definition)).toMatchObject({
      valid: true,
      nodeCount: 1,
    });
    expect(
      validateWorkflowDefinition({
        ...definition,
        nodes: [
          ...definition.nodes,
          { id: "transform", typeId: "data.transform", typeVersion: "1.0.0", config: {} },
        ],
      })
    ).toMatchObject({ valid: false, reasonCode: "WORKFLOW_NODE_ID_DUPLICATE" });
    expect(() => createWorkflowDraft({
      tenantId: "tenant-1",
      ownerUserId: 7,
      name: "Demo",
      definition: {
        ...definition,
        nodes: [{ ...definition.nodes[0], config: { apiKey: "secret" } }],
      },
    })).toThrow("NODE_SECRET_CONFIG_FORBIDDEN");
  });

  it("publishes a version immutably and prevents republishing a different hash", () => {
    const version = publishWorkflowVersion({
      definitionId: "wf-1",
      version: 1,
      contentHash: "hash-1",
      accessMode: "private",
    });
    expect(version).toMatchObject({ status: "published", version: 1 });
    expect(() =>
      publishWorkflowVersion({ ...version, contentHash: "hash-2" })
    ).toThrowError(new WorkflowStudioError("PUBLISHED_VERSION_IMMUTABLE"));
  });

  it("accepts canonical WorkflowDefinition v2 and rejects the legacy graph shape", () => {
    const canonical = {
      schemaVersion: "2",
      workflowId: "workflow-1",
      version: "1.0.0",
      interface: {
        inputs: { request: { schema: { type: "string" }, required: true } },
        outputs: {
          result: {
            schema: { type: "string" },
            source: { kind: "literal", value: "ok" },
          },
        },
      },
      nodes: [],
      edges: [],
    };
    expect(validateWorkflowDefinition(canonical)).toMatchObject({
      valid: true,
      nodeCount: 0,
    });
    expect(validateWorkflowDefinition(legacyDefinition)).toMatchObject({
      valid: false,
      reasonCode: "LEGACY_DEFINITION_UNSUPPORTED",
    });
  });
});
