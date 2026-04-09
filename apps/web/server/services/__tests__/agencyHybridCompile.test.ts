import { describe, expect, it } from "vitest";

import {
  buildCanonicalAgencyIR,
  compileAgencyBuilderRows,
  compileAgencyDocument,
} from "../agencyHybridCompile";

describe("agencyHybridCompile", () => {
  it("auto-wraps legacy agencies into a single agency_swarm subgraph compile plan", () => {
    const preview = compileAgencyBuilderRows(
      {
        name: "Legacy Agency",
        agents: [
          {
            id: "n1",
            name: "Researcher",
            nodeType: "agent",
            isEntryPoint: true,
          },
          {
            id: "n2",
            name: "Writer",
            nodeType: "agent",
          },
        ],
        communicationFlows: [
          {
            fromAgentName: "Researcher",
            toAgentName: "Writer",
            flowType: "delegation",
          },
        ],
      },
      {
        hybridEnabled: false,
      },
    );

    expect(preview.status).toBe("success");
    expect(preview.planSummary.usesHybrid).toBe(false);
    expect(preview.planSummary.subgraphCount).toBe(1);
    expect(preview.compiledSubgraphs[0]).toEqual(
      expect.objectContaining({
        engine: "agency_swarm",
        loweringStrategy: "agency_swarm_adapter",
      }),
    );
  });

  it("fails strict mode cross-engine edges without explicit boundary policy", () => {
    const preview = compileAgencyBuilderRows(
      {
        name: "Hybrid Agency",
        documentVersion: 2,
        compileMode: "strict",
        compatibilityMode: "hybrid",
        defaultEngine: "agency_swarm",
        agents: [
          {
            id: "n1",
            name: "Research",
            nodeType: "agent",
            isEntryPoint: true,
            subgraphId: "sg_a",
          },
          {
            id: "n2",
            name: "Creative Router",
            nodeType: "router",
            subgraphId: "sg_b",
          },
        ],
        communicationFlows: [
          {
            fromAgentName: "Research",
            toAgentName: "Creative Router",
            flowType: "delegation",
          },
        ],
        subgraphs: [
          {
            id: "sg_a",
            name: "Agency Research",
            engine: "agency_swarm",
            entryNodeIds: ["n1"],
            exitNodeIds: ["n1"],
            nodeIds: ["n1"],
            boundaryPolicy: null,
          },
          {
            id: "sg_b",
            name: "ADK Creative",
            engine: "adk2",
            entryNodeIds: ["n2"],
            exitNodeIds: ["n2"],
            nodeIds: ["n2"],
            boundaryPolicy: null,
          },
        ],
      },
      {
        hybridEnabled: true,
      },
    );

    expect(preview.status).toBe("failed");
    expect(preview.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "cross_engine_boundary_required",
          severity: "error",
        }),
      ]),
    );
  });

  it("emits explicit bridge contracts when subgraphs declare boundary policies", () => {
    const preview = compileAgencyBuilderRows(
      {
        name: "Hybrid Agency",
        documentVersion: 2,
        compileMode: "assist",
        compatibilityMode: "hybrid",
        defaultEngine: "agency_swarm",
        agents: [
          {
            id: "n1",
            name: "Research",
            nodeType: "agent",
            isEntryPoint: true,
            subgraphId: "sg_a",
          },
          {
            id: "n2",
            name: "Creative Router",
            nodeType: "router",
            subgraphId: "sg_b",
          },
        ],
        communicationFlows: [
          {
            fromAgentName: "Research",
            toAgentName: "Creative Router",
            flowType: "delegation",
          },
        ],
        subgraphs: [
          {
            id: "sg_a",
            name: "Agency Research",
            engine: "agency_swarm",
            entryNodeIds: ["n1"],
            exitNodeIds: ["n1"],
            nodeIds: ["n1"],
            boundaryPolicy: {
              bridgeMode: "sync",
              inputContract: "research_input_v1",
              outputContract: "research_output_v1",
            },
          },
          {
            id: "sg_b",
            name: "ADK Creative",
            engine: "adk2",
            entryNodeIds: ["n2"],
            exitNodeIds: ["n2"],
            nodeIds: ["n2"],
            boundaryPolicy: {
              approvalOwner: "workflow",
            },
          },
        ],
      },
      {
        hybridEnabled: true,
      },
    );

    expect(preview.status).toBe("success");
    expect(preview.bridges).toHaveLength(1);
    expect(preview.bridges[0]).toEqual(
      expect.objectContaining({
        fromSubgraphId: "sg_a",
        toSubgraphId: "sg_b",
        bridgeMode: "sync",
        inputContract: "research_input_v1",
        outputContract: "research_output_v1",
      }),
    );
  });

  it("blocks browser_session nodes inside adk2 subgraphs", () => {
    const preview = compileAgencyBuilderRows(
      {
        name: "Browser Hybrid",
        documentVersion: 2,
        defaultEngine: "adk2",
        compileMode: "strict",
        compatibilityMode: "hybrid",
        agents: [
          {
            id: "browser-1",
            name: "Checkout Review",
            nodeType: "browser_session",
            isEntryPoint: true,
            subgraphId: "sg_browser",
          },
        ],
        communicationFlows: [],
        subgraphs: [
          {
            id: "sg_browser",
            name: "Browser",
            engine: "adk2",
            entryNodeIds: ["browser-1"],
            exitNodeIds: ["browser-1"],
            nodeIds: ["browser-1"],
            boundaryPolicy: null,
          },
        ],
      },
      {
        hybridEnabled: true,
      },
    );

    expect(preview.status).toBe("failed");
    expect(preview.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_node_engine_pair",
          nodeId: "browser-1",
        }),
      ]),
    );
  });

  it("requires hybrid feature flag before compiling ADK subgraphs", () => {
    const preview = compileAgencyBuilderRows(
      {
        name: "ADK Agency",
        documentVersion: 2,
        defaultEngine: "adk2",
        compileMode: "strict",
        compatibilityMode: "hybrid",
        agents: [
          {
            id: "n1",
            name: "Creative Router",
            nodeType: "router",
            isEntryPoint: true,
            subgraphId: "sg_adk",
          },
        ],
        communicationFlows: [],
        subgraphs: [
          {
            id: "sg_adk",
            name: "Creative",
            engine: "adk2",
            entryNodeIds: ["n1"],
            exitNodeIds: ["n1"],
            nodeIds: ["n1"],
            boundaryPolicy: null,
          },
        ],
      },
      {
        hybridEnabled: false,
      },
    );

    expect(preview.status).toBe("failed");
    expect(preview.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hybrid_feature_flag_required",
        }),
      ]),
    );
  });

  it("builds a canonical IR with stable node and edge ids", () => {
    const document = {
      documentVersion: 2,
      name: "IR Agency",
      defaultEngine: "agency_swarm" as const,
      nodes: [
        {
          id: "n1",
          name: "Research",
          nodeType: "agent",
          isEntryPoint: true,
          subgraphId: "sg_root",
        },
      ],
      edges: [],
      subgraphs: [
        {
          id: "sg_root",
          name: "Root",
          engine: "agency_swarm" as const,
          entryNodeIds: ["n1"],
          exitNodeIds: ["n1"],
          nodeIds: ["n1"],
          boundaryPolicy: null,
        },
      ],
      settings: {
        compileMode: "strict" as const,
        compatibilityMode: "hybrid" as const,
        traceLevel: "standard",
      },
    };

    const ir = buildCanonicalAgencyIR(document);
    const preview = compileAgencyDocument(document, { hybridEnabled: true });

    expect(ir.graph.nodes[0]).toEqual(
      expect.objectContaining({
        id: "n1",
        subgraphId: "sg_root",
      }),
    );
    expect(preview.executionPlan[0]).toEqual({
      kind: "run_subgraph",
      subgraphId: "sg_root",
    });
  });
});
