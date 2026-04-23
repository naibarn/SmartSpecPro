import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";

import type { AgencyNodeData } from "../nodes/types";
import {
  applySpecialEdgeConnection,
  buildSpecialFlowEdges,
  removeNodeConfigReferences,
  removeSpecialEdgeTargets,
} from "../nodeGraphSync";

function makeNode(overrides: Partial<Node<AgencyNodeData>> & { id: string; data: AgencyNodeData }): Node<AgencyNodeData> {
  return {
    id: overrides.id,
    type: "agency",
    position: { x: 0, y: 0 },
    data: overrides.data,
    ...overrides,
  };
}

describe("nodeGraphSync", () => {
  it("builds router edges from route config and fallback target", () => {
    const nodes = [
      makeNode({
        id: "router-1",
        data: {
          nodeType: "router",
          name: "Router",
          description: "",
          instructions: "",
          isEntryPoint: false,
          isOptional: false,
          tools: [],
          nodeConfig: {
            routes: [
              { id: "route-1", label: "Billing", targetNodeId: "agent-1" },
            ],
            defaultTargetNodeId: "agent-2",
          },
        },
      }),
    ];

    const edges = buildSpecialFlowEdges(nodes, []);

    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      source: "router-1",
      target: "agent-1",
      sourceHandle: "route-1",
    });
    expect(edges[1]).toMatchObject({
      source: "router-1",
      target: "agent-2",
      sourceHandle: "default",
    });
  });

  it("updates conditional branch config when a handle is connected", () => {
    const nodes = [
      makeNode({
        id: "branch-1",
        data: {
          nodeType: "conditional_branch",
          name: "Branch",
          description: "",
          instructions: "",
          isEntryPoint: false,
          isOptional: false,
          tools: [],
          nodeConfig: {
            evaluationMode: "rule_based",
            rules: [{ id: "rule-0", targetNodeId: "" }],
          },
        },
      }),
    ];

    const updated = applySpecialEdgeConnection(nodes, {
      source: "branch-1",
      target: "agent-9",
      sourceHandle: "rule-0",
    });

    expect(updated[0].data.nodeConfig?.rules).toEqual([
      { id: "rule-0", targetNodeId: "agent-9" },
    ]);
  });

  it("clears fan-out branch targets when an edge is removed", () => {
    const nodes = [
      makeNode({
        id: "fan-1",
        data: {
          nodeType: "parallel_fan_out",
          name: "Fan Out",
          description: "",
          instructions: "",
          isEntryPoint: false,
          isOptional: false,
          tools: [],
          nodeConfig: {
            branches: [
              { id: "branch-a", targetNodeId: "agent-a" },
              { id: "branch-b", targetNodeId: "agent-b" },
            ],
          },
        },
      }),
    ];

    const updated = removeSpecialEdgeTargets(nodes, [
      {
        id: "edge-1",
        source: "fan-1",
        target: "agent-a",
        sourceHandle: "branch-a",
      } as any,
    ]);

    expect(updated[0].data.nodeConfig?.branches).toEqual([
      { id: "branch-a", targetNodeId: "" },
      { id: "branch-b", targetNodeId: "agent-b" },
    ]);
  });

  it("removes fallback references from error handlers when a node is deleted", () => {
    const nodes = [
      makeNode({
        id: "handler-1",
        data: {
          nodeType: "error_handler",
          name: "Handler",
          description: "",
          instructions: "",
          isEntryPoint: false,
          isOptional: false,
          tools: [],
          nodeConfig: {
            watchedNodeIds: ["agent-a", "agent-b"],
            fallbackNodeId: "agent-b",
          },
        },
      }),
    ];

    const updated = removeNodeConfigReferences(nodes, "agent-b");

    expect(updated[0].data.nodeConfig?.watchedNodeIds).toEqual(["agent-a"]);
    expect(updated[0].data.nodeConfig?.fallbackNodeId).toBe("");
  });
});
