import { describe, expect, it } from "vitest";
import {
  evaluateHydroImpactReachability,
  type HydroImpactGraph,
} from "./hydroImpactGraph";

const graph: HydroImpactGraph = {
  topologyRevision: "topology_2026_10_01_r1",
  nodes: [
    { id: "basin_upstream", basinRef: "basin_chao_phraya", provinceRef: "TH-14", sourceRef: "source_topology", sourceRevision: "r1" },
    { id: "canal_mid", basinRef: "basin_chao_phraya", provinceRef: "TH-13", sourceRef: "source_topology", sourceRevision: "r1" },
    { id: "basin_downstream", basinRef: "basin_chao_phraya", provinceRef: "TH-10", sourceRef: "source_topology", sourceRevision: "r1" },
    { id: "isolated", basinRef: "basin_mae_kong", provinceRef: "TH-50", sourceRef: "source_topology", sourceRevision: "r1" },
  ],
  edges: [
    { id: "river_up_to_canal", fromNodeId: "basin_upstream", toNodeId: "canal_mid", kind: "RIVER", direction: "FORWARD", operation: "OPEN", sourceRef: "source_topology", sourceRevision: "r1" },
    { id: "canal_to_downstream", fromNodeId: "canal_mid", toNodeId: "basin_downstream", kind: "REVERSIBLE_CANAL", direction: "FORWARD", operation: "OPEN", sourceRef: "source_topology", sourceRevision: "r1" },
  ],
};

describe("evaluateHydroImpactReachability", () => {
  it("follows only explicit effective downstream edges across province boundaries", () => {
    const result = evaluateHydroImpactReachability({ graph, sourceNodeId: "basin_upstream", direction: "DOWNSTREAM" });

    expect(result).toMatchObject({ status: "COMPLETE", topologyRevision: "topology_2026_10_01_r1" });
    expect(result.relations.map(relation => [relation.targetNodeId, relation.hopCount, relation.relation]))
      .toEqual([
        ["canal_mid", 1, "POTENTIAL_DOWNSTREAM_IMPACT"],
        ["basin_downstream", 2, "POTENTIAL_DOWNSTREAM_IMPACT"],
      ]);
    expect(result.relations.every(relation => relation.provinceCrossing)).toBe(true);
    expect(result.relations.every(relation => !("arrival" in relation) && !("depth" in relation))).toBe(true);
  });

  it("does not infer a connection when no explicit effective edge points to the target", () => {
    const result = evaluateHydroImpactReachability({
      graph,
      sourceNodeId: "basin_downstream",
      direction: "DOWNSTREAM",
      targetNodeIds: ["basin_upstream"],
    });

    expect(result).toMatchObject({ status: "COMPLETE", relations: [] });
    expect(result.reasons).toContain("NO_CONNECTED_PATH");
  });

  it("keeps static topology immutable when a reversible canal changes effective direction", () => {
    const reversed: HydroImpactGraph = {
      ...graph,
      edges: graph.edges.map(edge => edge.id === "canal_to_downstream" ? { ...edge, direction: "REVERSE" as const } : edge),
    };

    const downstream = evaluateHydroImpactReachability({ graph: reversed, sourceNodeId: "basin_upstream", direction: "DOWNSTREAM" });
    const reverseFlow = evaluateHydroImpactReachability({ graph: reversed, sourceNodeId: "basin_downstream", direction: "DOWNSTREAM" });

    expect(reversed.edges.find(edge => edge.id === "canal_to_downstream")).toMatchObject({ fromNodeId: "canal_mid", toNodeId: "basin_downstream", direction: "REVERSE" });
    expect(downstream.relations.map(relation => relation.targetNodeId)).toEqual(["canal_mid"]);
    expect(reverseFlow.relations.map(relation => relation.targetNodeId)).toEqual(["canal_mid"]);
  });

  it("fails closed on closed or unknown operational edges while preserving an explicit partial result", () => {
    const constrained: HydroImpactGraph = {
      ...graph,
      edges: graph.edges.map(edge => edge.id === "canal_to_downstream" ? { ...edge, operation: "CLOSED" as const } : edge)
        .concat({ id: "unknown_branch", fromNodeId: "basin_upstream", toNodeId: "isolated", kind: "DIVERSION", direction: "UNKNOWN", operation: "UNKNOWN", sourceRef: "source_topology", sourceRevision: "r1" }),
    };

    const result = evaluateHydroImpactReachability({ graph: constrained, sourceNodeId: "basin_upstream", direction: "DOWNSTREAM" });

    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.relations.map(relation => relation.targetNodeId)).toEqual(["canal_mid"]);
    expect(result.reasons).toEqual(expect.arrayContaining(["CLOSED_OPERATION", "UNKNOWN_FLOW_DIRECTION", "UNKNOWN_OPERATION_STATE"]));
  });

  it("terminates cycles and reports a deterministic bounded partial result", () => {
    const cyclic: HydroImpactGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "cycle_back", fromNodeId: "basin_downstream", toNodeId: "basin_upstream", kind: "RIVER", direction: "FORWARD", operation: "OPEN", sourceRef: "source_topology", sourceRevision: "r1" },
      ],
    };

    const result = evaluateHydroImpactReachability({ graph: cyclic, sourceNodeId: "basin_upstream", direction: "DOWNSTREAM", limits: { maxNodes: 2, maxEdges: 10, maxDepth: 8 } });

    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.reasons).toContain("NODE_BUDGET_EXCEEDED");
    expect(result.relations.map(relation => relation.targetNodeId)).toEqual(["canal_mid"]);
  });

  it("isolates an invalid edge rather than discarding an unrelated valid path", () => {
    const result = evaluateHydroImpactReachability({
      graph: {
        ...graph,
        edges: [...graph.edges, { id: "bad_edge", fromNodeId: "basin_upstream", toNodeId: "missing_node", kind: "RIVER", direction: "FORWARD", operation: "OPEN", sourceRef: "source_topology", sourceRevision: "r1" }],
      },
      sourceNodeId: "basin_upstream",
      direction: "DOWNSTREAM",
    });

    expect(result).toMatchObject({ status: "PARTIAL" });
    expect(result.reasons).toContain("INVALID_EDGE_IGNORED");
    expect(result.relations.map(relation => relation.targetNodeId)).toEqual(["canal_mid", "basin_downstream"]);
  });

  it("rejects an ambiguous source binding instead of selecting one duplicate provider node", () => {
    const result = evaluateHydroImpactReachability({
      graph: {
        ...graph,
        nodes: [...graph.nodes, { ...graph.nodes[0]!, sourceRef: "other_topology_source" }],
      },
      sourceNodeId: "basin_upstream",
      direction: "DOWNSTREAM",
    });

    expect(result).toMatchObject({ status: "UNKNOWN", relations: [] });
    expect(result.reasons).toContain("DUPLICATE_NODE_ID");
  });
});
