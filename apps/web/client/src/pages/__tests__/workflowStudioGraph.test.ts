import { describe, expect, it } from "vitest";

import {
  addWorkflowPreset,
  buildInitialWorkflowGraph,
  deleteWorkflowNode,
  duplicateWorkflowNode,
  fromSemanticWorkflowDefinition,
  fromCanonicalWorkflowDefinition,
  toSemanticWorkflowDefinition,
  validateWorkflowConnection,
  WORKFLOW_NODE_PRESETS,
  projectCanonicalNodePresets,
  type WorkflowGraphState,
} from "../workflowStudioGraph";

const graph: WorkflowGraphState = {
  nodes: [
    {
      id: "input",
      type: "input",
      position: { x: 80, y: 80 },
      data: { label: "Input", kind: "input", config: {} },
    },
    {
      id: "agent",
      type: "agent",
      position: { x: 360, y: 80 },
      data: { label: "Agent", kind: "agent", config: {} },
    },
    {
      id: "output",
      type: "output",
      position: { x: 640, y: 80 },
      data: { label: "Output", kind: "output", config: {} },
    },
  ],
  edges: [
    { id: "input-agent", source: "input", target: "agent" },
    { id: "agent-output", source: "agent", target: "output" },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("workflow studio graph model", () => {
  it("creates a mockup-aligned graph with durable positions and edges", () => {
    const result = buildInitialWorkflowGraph();

    expect(result.nodes.length).toBeGreaterThanOrEqual(5);
    expect(result.nodes.every(node => node.data.typeId && node.data.typeVersion)).toBe(true);
    expect(result.nodes.every(node => Number.isFinite(node.position.x))).toBe(
      true
    );
    expect(
      result.edges.every(edge => edge.id && edge.source && edge.target)
    ).toBe(true);
  });

  it("round-trips semantic definitions without losing positions or handles", () => {
    const definition = toSemanticWorkflowDefinition(graph);
    const restored = fromSemanticWorkflowDefinition(definition);

    expect(restored.nodes).toEqual(graph.nodes);
    expect(
      restored.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }))
    ).toEqual(
      graph.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }))
    );
    expect(restored.viewport).toEqual(graph.viewport);
  });

  it("rejects self, duplicate, incompatible and cyclic connections", () => {
    expect(
      validateWorkflowConnection({ source: "input", target: "input" }, graph)
    ).toMatchObject({
      code: "self_edge",
    });
    expect(
      validateWorkflowConnection({ source: "input", target: "agent" }, graph)
    ).toMatchObject({
      code: "duplicate_edge",
    });
    expect(
      validateWorkflowConnection({ source: "output", target: "input" }, graph)
    ).toMatchObject({
      code: "cycle_detected",
    });
    expect(
      validateWorkflowConnection(
        {
          source: "output",
          target: "agent",
          sourceHandle: "output:number",
          targetHandle: "input:string",
        },
        graph
      )
    ).toMatchObject({ code: "incompatible_ports" });
    expect(
      validateWorkflowConnection(
        {
          source: "input",
          target: "output",
          sourceHandle: "output:string",
          targetHandle: "input:any",
        },
        graph
      )
    ).toBeNull();
  });

  it("duplicates a node with a unique id and deletes incident edges", () => {
    const duplicated = duplicateWorkflowNode(graph, "agent");
    expect(duplicated.nodes).toHaveLength(4);
    expect(
      duplicated.nodes.some(
        node => node.id !== "agent" && node.data.label === "Agent"
      )
    ).toBe(true);

    const copyId = duplicated.nodes.find(
      node => node.id !== "input" && node.id !== "agent" && node.id !== "output"
    )?.id;
    expect(copyId).toBeTruthy();
    const deleted = deleteWorkflowNode(duplicated, copyId!);
    expect(deleted.nodes).toHaveLength(3);
    expect(deleted.edges).toEqual(graph.edges);
  });

  it("adds a preset with its semantic node type and preset identity", () => {
    const result = addWorkflowPreset(graph, "ai-model");

    expect(result.node.data.typeId).toBe("ai.model");
    expect(result.node.data.typeVersion).toBe("1.0.0");
    expect(result.node.data.presetId).toBe("ai-model");
  });

  it("exposes only canonical registry IDs as authoring presets", () => {
    const canonicalIds = new Set([
      "core.trigger",
      "data.transform",
      "ai.model",
      "ai.agent",
      "core.capability",
      "data.retrieval",
      "flow.subflow",
      "flow.router",
      "flow.join",
      "flow.loop",
      "human.approval",
      "human.input",
      "flow.wait",
      "automation.computer_use",
      "data.artifact",
      "quality.verifier",
    ]);
    expect(WORKFLOW_NODE_PRESETS.every(preset =>
      canonicalIds.has((preset as unknown as { typeId: string }).typeId)
    )).toBe(true);
    expect(WORKFLOW_NODE_PRESETS.map(preset => preset.nodeType)).not.toEqual(
      expect.arrayContaining(["llm", "form", "result", "condition", "skill", "http"])
    );
  });

  it("projects a canonical definition back into the existing Studio canvas", () => {
    const result = fromCanonicalWorkflowDefinition({
      schemaVersion: "2",
      nodes: [
        {
          id: "model",
          typeId: "ai.model",
          typeVersion: "1.0.0",
          label: "Model",
          binding: { kind: "model", ref: "model.default" },
          config: { prompt: "{{request}}" },
        },
      ],
      edges: [],
    });
    expect(result.nodes[0].data).toMatchObject({
      typeId: "ai.model",
      typeVersion: "1.0.0",
      binding: { kind: "model", ref: "model.default" },
    });
    expect(result.nodes[0].data.nodeType).toBeUndefined();
  });

  it("projects only server-returned canonical registry entries into the palette", () => {
    const result = projectCanonicalNodePresets([
      { identity: { typeId: "ai.model", version: "2.0.0" } },
      { identity: { typeId: "data.transform", version: "1.0.0" } },
    ]);

    expect(result.map(preset => preset.typeId)).toEqual([
      "data.transform",
      "ai.model",
    ]);
    expect(result.find(preset => preset.typeId === "ai.model")?.typeVersion).toBe("2.0.0");
  });
});
