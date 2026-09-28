import { describe, expect, it } from "vitest";

import {
  listCanonicalNodeTypes,
  toCanonicalWorkflowDefinition,
  type LegacyStudioGraph,
} from "../workflowStudioCanonicalAdapter";

const graph: LegacyStudioGraph = {
  nodes: [
    {
      id: "input",
      type: "input",
      data: {
        nodeType: "form",
        label: "Request",
        config: { fields: [{ name: "request", type: "string", required: true }] },
      },
    },
    {
      id: "model",
      type: "agent",
      data: {
        nodeType: "llm",
        label: "Model",
        config: { model: "provider/model-v1", prompt: "{{request}}" },
      },
    },
    {
      id: "transform",
      type: "analysis",
      data: {
        nodeType: "transform",
        label: "Transform",
        config: { operation: "passthrough" },
      },
    },
    {
      id: "result",
      type: "output",
      data: {
        nodeType: "result",
        label: "Result",
        config: { outputKey: "result" },
      },
    },
  ],
  edges: [
    { id: "input-model", from: "input", to: "model" },
    { id: "model-transform", from: "model", to: "transform" },
    { id: "transform-result", from: "transform", to: "result" },
  ],
  viewport: { x: 4, y: 8, zoom: 0.9 },
};

describe("Spec 216 canonical Studio adapter", () => {
  it("projects only the server-owned canonical registry", () => {
    const manifests = listCanonicalNodeTypes();

    expect(manifests).toHaveLength(16);
    expect(manifests.map(manifest => manifest.identity.typeId)).not.toEqual(
      expect.arrayContaining(["llm", "form", "result", "condition", "skill", "http"])
    );
  });

  it("converts the Studio shell and legacy semantic nodes into canonical contracts", () => {
    const result = toCanonicalWorkflowDefinition({
      graph,
      workflowId: "workflow-1",
      version: "1.0.0",
    });

    expect(result.definition.nodes.map(node => node.typeId)).toEqual([
      "ai.model",
      "data.transform",
    ]);
    expect(result.definition.interface.inputs.request).toMatchObject({
      required: true,
    });
    expect(result.definition.interface.outputs.result.source).toEqual({
      kind: "node-output",
      nodeId: "transform",
      portId: "output",
    });
    expect(result.definition.bindings).toContainEqual({
      id: "binding-input-model",
      targetNodeId: "model",
      targetPortId: "input",
      source: { kind: "workflow-input", inputId: "request" },
    });
    expect(result.definition.nodes[0]).toMatchObject({
      binding: { kind: "model", ref: "provider/model-v1" },
    });
    expect(JSON.stringify(result.definition)).not.toMatch(/"nodeType"|"llm"|"form"/);
    expect(result.ui.viewport).toEqual({ x: 4, y: 8, zoom: 0.9 });
  });

  it("rejects unsupported legacy semantics instead of inventing a canonical type", () => {
    expect(() =>
      toCanonicalWorkflowDefinition({
        graph: {
          ...graph,
          nodes: [{ id: "unknown", type: "analysis", data: { nodeType: "made-up" } }],
          edges: [],
        },
        workflowId: "workflow-1",
        version: "1.0.0",
      })
    ).toThrowError(
      expect.objectContaining({ code: "WORKFLOW_STUDIO_NODE_UNSUPPORTED" })
    );
  });

  it("rejects a required capability binding that is not configured", () => {
    expect(() =>
      toCanonicalWorkflowDefinition({
        graph: {
          ...graph,
          nodes: [
            {
              id: "skill",
              type: "agent",
              data: { nodeType: "skill", config: { skillId: "" } },
            },
          ],
          edges: [],
        },
        workflowId: "workflow-1",
        version: "1.0.0",
      })
    ).toThrow("NODE_BINDING_REQUIRED");
  });

  it("rejects secret and runtime-state data before returning a canonical graph", () => {
    expect(() =>
      toCanonicalWorkflowDefinition({
        graph: {
          ...graph,
          nodes: [
            {
              id: "model",
              type: "agent",
              data: {
                nodeType: "llm",
                config: { model: "provider/model-v1", apiKey: "must-not-persist" },
              },
            },
          ],
          edges: [],
        },
        workflowId: "workflow-1",
        version: "1.0.0",
      })
    ).toThrow("NODE_SECRET_CONFIG_FORBIDDEN");

    expect(() =>
      toCanonicalWorkflowDefinition({
        graph: {
          ...graph,
          nodes: [
            {
              id: "model",
              type: "agent",
              data: {
                nodeType: "llm",
                config: { model: "provider/model-v1" },
                metadata: { nodeRunId: "run-1" },
              },
            },
          ],
          edges: [],
        },
        workflowId: "workflow-1",
        version: "1.0.0",
      })
    ).toThrow("NODE_RUNTIME_STATE_FORBIDDEN");
  });

  it("accepts canonical fields from the Studio graph without reclassifying them as legacy nodes", () => {
    const result = toCanonicalWorkflowDefinition({
      graph: {
        nodes: [
          { id: "trigger", type: "input", data: { typeId: "core.trigger", binding: { kind: "trigger-source", ref: "project-input" } } },
          { id: "artifact", type: "output", data: { typeId: "data.artifact" } },
          { id: "result", type: "output", data: { nodeType: "output", config: { outputKey: "result" } } },
        ],
        edges: [
          { id: "trigger-artifact", from: "trigger", to: "artifact" },
          { id: "artifact-result", from: "artifact", to: "result" },
        ],
      },
      workflowId: "workflow-1",
      version: "1.0.0",
    });

    expect(result.definition.nodes).toMatchObject([
      { id: "trigger", typeId: "core.trigger", binding: { ref: "project-input" } },
      { id: "artifact", typeId: "data.artifact" },
    ]);
  });

  it("derives the output from the output edge when semantic node array order changes", () => {
    const result = toCanonicalWorkflowDefinition({
      graph: { ...graph, nodes: [...graph.nodes].reverse() },
      workflowId: "workflow-1",
      version: "1.0.0",
    });
    expect(result.definition.interface.outputs.result.source).toEqual({
      kind: "node-output", nodeId: "transform", portId: "output",
    });
  });

  it("rejects dangling/unsupported shell edges and ambiguous outputs", () => {
    for (const badEdge of [
      { id: "dangling", from: "missing", to: "model" },
      { id: "unknown-shell", from: "unrecognized", to: "model" },
    ]) {
      expect(() => toCanonicalWorkflowDefinition({
        graph: { ...graph, edges: [...graph.edges, badEdge] },
        workflowId: "workflow-1", version: "1.0.0",
      })).toThrow();
    }
    expect(() => toCanonicalWorkflowDefinition({
      graph: { ...graph, edges: [...graph.edges, { id: "second-output-source", from: "model", to: "result" }] },
      workflowId: "workflow-1", version: "1.0.0",
    })).toThrow("WORKFLOW_STUDIO_OUTPUT_MAPPING_AMBIGUOUS");
  });

  it("preserves explicit input-field mappings across multiple canonical nodes", () => {
    const mappedGraph: LegacyStudioGraph = {
      nodes: [
        { id: "request-form", type: "form", data: { nodeType: "form", config: { fields: [
          { name: "summaryRequest", type: "string", required: true },
          { name: "metadataRequest", type: "string", required: true },
        ] } } },
        { id: "model", type: "llm", data: { nodeType: "llm", config: { model: "provider/model-v1" } } },
        { id: "transform", type: "transform", data: { nodeType: "transform", config: { operation: "passthrough" } } },
        { id: "result", type: "output", data: { nodeType: "output" } },
      ],
      edges: [
        { id: "input-model", from: "request-form", to: "model", sourceHandle: "summaryRequest" },
        { id: "input-transform", from: "request-form", to: "transform", sourceHandle: "metadataRequest" },
        { id: "transform-output", from: "transform", to: "result" },
      ],
    };
    const result = toCanonicalWorkflowDefinition({ graph: mappedGraph, workflowId: "workflow-1", version: "1.0.0" });
    expect(result.definition.bindings?.map(item => item.source)).toEqual([
      { kind: "workflow-input", inputId: "summaryRequest" },
      { kind: "workflow-input", inputId: "metadataRequest" },
    ]);
  });

  it("round-trips all 16 canonical IDs without creating virtual IO nodes", () => {
    const canonicalIds = [
      "core.trigger", "data.transform", "ai.model", "ai.agent", "core.capability", "data.retrieval",
      "flow.subflow", "flow.router", "flow.join", "flow.loop", "human.approval", "human.input",
      "flow.wait", "automation.computer_use", "data.artifact", "quality.verifier",
    ];
    const bindingKinds: Record<string, string> = {
      "core.trigger": "trigger-source", "ai.model": "model", "ai.agent": "agent", "core.capability": "capability",
      "data.retrieval": "retrieval-source", "flow.subflow": "workflow", "automation.computer_use": "computer-use-profile", "quality.verifier": "verifier",
    };
    const configs: Record<string, Record<string, unknown>> = {
      "core.trigger": { eventType: "manual" }, "data.transform": { operation: "passthrough" }, "ai.model": { prompt: "{{request}}" },
      "ai.agent": { goal: "Review request" }, "core.capability": { operation: "extract" }, "data.retrieval": { query: "{{request}}" },
      "flow.subflow": {}, "flow.router": { mode: "condition" }, "flow.join": { strategy: "all" }, "flow.loop": { mode: "foreach", maxIterations: 3 },
      "human.approval": { title: "Review" }, "human.input": { prompt: "Provide input" }, "flow.wait": { durationMs: 1000 },
      "automation.computer_use": { goal: "Open the requested page" }, "data.artifact": { artifactType: "document", outputKey: "result" }, "quality.verifier": { checks: ["schema"] },
    };
    const nodes = [
      { id: "form", type: "form", data: { nodeType: "form", config: { fields: [{ name: "request", type: "string", required: true }] } } },
      ...canonicalIds.map((typeId, index) => ({
        id: `canonical-${index}`,
        type: "legacy-shell-shape-is-ignored",
        data: {
          typeId,
          config: configs[typeId],
          ...(bindingKinds[typeId] ? { binding: { kind: bindingKinds[typeId], ref: `resolved/${index}` } } : {}),
        },
      })),
      { id: "result", type: "output", data: { nodeType: "output", config: { outputKey: "result" } } },
    ];
    const edges = [
      ...canonicalIds.map((_, index) => ({ id: `input-${index}`, from: "form", to: `canonical-${index}`, sourceHandle: "request" })),
      { id: "output", from: `canonical-${canonicalIds.length - 1}`, to: "result" },
    ];
    const result = toCanonicalWorkflowDefinition({ graph: { nodes, edges }, workflowId: "workflow-1", version: "1.0.0" });
    expect(result.definition.nodes.map(node => node.typeId)).toEqual(canonicalIds);
    expect(result.definition.nodes.some(node => ["form", "output", "input", "result"].includes(node.typeId))).toBe(false);
  });
});
