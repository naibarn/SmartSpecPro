import { describe, expect, it } from "vitest";
import {
  LONG_FORM_DEFAULT_PLAN_CHUNK_SIZE,
  LONG_FORM_MAX_PLAN_CHUNK_SIZE,
  buildLongFormId,
  characterRelationshipGraphSchema,
  createStrict90SecondDurationPlan,
  findRelationshipPaths,
  queryRelationshipGraph,
  resolveLongFormMode,
  validateCharacterAdmission,
  validateLookCue,
  validatePlanChunks,
  validateStrictRelationshipGraphDeltas,
  relationshipGraphDeltaSchema,
  validateRelationshipGraph,
  resolveCapability,
  relationshipGraphQuerySchema,
  type CharacterRelationshipGraph,
  type RelationshipGraphEdge,
} from "../longFormContracts";

describe("long-form contracts", () => {
  it("recommends quality mode at 120 and extended mode above it without a hard cap", () => {
    expect(resolveLongFormMode(120)).toMatchObject({
      mode: "quality_120",
      recommendedEpisodeCount: 120,
      episodeDurationSeconds: 90,
    });
    expect(resolveLongFormMode(500)).toMatchObject({
      mode: "extended_long_form",
      recommendedEpisodeCount: 120,
    });
    expect(resolveLongFormMode(1000).requestedEpisodeCount).toBe(1000);
  });

  it("creates an exact nine-shot 90-second plan", () => {
    const plan = createStrict90SecondDurationPlan();
    expect(plan.shotDurationsSeconds).toEqual(Array(9).fill(10));
    expect(plan.renderSegmentDurationsSeconds).toEqual(Array(9).fill(10));
  });

  it("rejects plan gaps, overlap, and oversized chunks", () => {
    const valid = [
      {
        startEpisode: 1,
        endEpisode: 10,
        idempotencyKey: "a",
        predecessorCoverageFingerprint: "root",
      },
      {
        startEpisode: 11,
        endEpisode: 20,
        idempotencyKey: "b",
        predecessorCoverageFingerprint: "a",
      },
    ];
    expect(validatePlanChunks(valid, 20)).toEqual([]);
    expect(validatePlanChunks([{ ...valid[0], endEpisode: 21 }], 20)).toContain(
      "chunk_size_exceeds_maximum"
    );
    expect(
      validatePlanChunks([{ ...valid[0], startEpisode: 2 }], 20)
    ).toContain("coverage_gap");
  });

  it("rejects unsafe direct chunk helper inputs and conflicting graph time filters", async () => {
    const { createPlanChunks } =
      await import("../../../server/services/verticalDramaLongFormPlanner");
    expect(() => createPlanChunks("series", 10, 0)).toThrow("chunkSize");
    expect(
      relationshipGraphQuerySchema.safeParse({
        graphRevisionId: "g1",
        episodeNumber: 2,
        episodeRange: { startEpisode: 1, endEpisode: 3 },
      }).success
    ).toBe(false);
  });

  it("creates deterministic scoped IDs", () => {
    expect(buildLongFormId("episode", "series-1", 12)).toBe(
      buildLongFormId("episode", "series-1", 12)
    );
  });

  it("requires typed evidence-backed graph deltas for strict episode output", () => {
    const delta = {
      operation: "add",
      edgeId: "edge-1",
      fromCharacterKey: "mina",
      toCharacterKey: "ethan",
      relationType: "fiance",
      validFromEpisode: 12,
      disclosure: "known_to_some",
      beliefState: "known",
      knownByCharacterKeys: ["mina"],
      evidenceRefs: ["ep12:shot3"],
      affectedCharacterKeys: ["mina", "ethan"],
    };
    expect(relationshipGraphDeltaSchema.safeParse(delta).success).toBe(true);
    expect(
      validateStrictRelationshipGraphDeltas({
        episodeNumber: 12,
        deltas: [delta],
      })
    ).toEqual([]);
    expect(
      validateStrictRelationshipGraphDeltas({
        episodeNumber: 12,
        deltas: undefined,
      })
    ).toContain("relationship_graph_delta_missing");
  });

  it("validates relationship invariants and derives bounded explainable paths", () => {
    const graph: CharacterRelationshipGraph = {
      graphRevisionId: "graph-1",
      fingerprint: "fp-1",
      nodes: ["mina", "ethan", "jane", "boss"].map(characterKey => ({
        characterKey,
      })),
      edges: [
        edge("parent-1", "jane", "mina", "parent", { familySide: "maternal" }),
        edge("spouse-1", "mina", "ethan", "spouse"),
        edge("sibling-1", "ethan", "boss", "sibling"),
      ],
      familyGroups: [],
    };
    expect(validateRelationshipGraph(graph)).toEqual([]);
    const paths = findRelationshipPaths(graph, "jane", "ethan", {
      maxHops: 4,
      maxPaths: 3,
    });
    expect(paths.paths[0]?.sourceEdgeIds).toContain("parent-1");
    expect(paths.truncated).toBe(false);
  });

  it("returns filtered, paged, redacted graph views without leaking hidden IDs", () => {
    const edges = [
      edge("e1", "a", "b", "friend", {
        disclosure: "public",
        validFromEpisode: 1,
      }),
      edge("e2", "a", "c", "rival", {
        disclosure: "secret",
        validFromEpisode: 2,
      }),
      edge("e4", "a", "c", "friend", {
        disclosure: "secret",
        validFromEpisode: 2,
      }),
    ];
    const graph: CharacterRelationshipGraph = {
      graphRevisionId: "active",
      fingerprint: "active-fp",
      nodes: [
        { characterKey: "a" },
        { characterKey: "b" },
        { characterKey: "c" },
      ],
      edges,
      familyGroups: [],
    };
    const candidate: CharacterRelationshipGraph = {
      ...graph,
      graphRevisionId: "candidate",
      fingerprint: "candidate-fp",
      edges: [edges[0], edge("e3", "b", "c", "friend")],
    };
    const view = queryRelationshipGraph(
      graph,
      {
        graphRevisionId: "active",
        episodeNumber: 2,
        relationTypes: ["friend"],
        pageSize: 1,
        candidateGraphRevisionId: "candidate",
        includeCandidateActiveDiff: true,
      },
      { candidateGraph: candidate, canViewSecretEdges: false }
    );
    expect(view.edges.map(item => item.edgeId)).toEqual(["e1"]);
    expect(view.redactedEdgeCount).toBe(1);
    expect(view.candidateActiveDiff).toMatchObject({
      addedCount: 1,
      removedCount: 2,
    });
    expect(JSON.stringify(view)).not.toContain("e2");
  });

  it("only exposes known-to-some edges for the declared viewpoint and validates stored graph JSON", () => {
    const graph: CharacterRelationshipGraph = {
      graphRevisionId: "g1",
      fingerprint: "fp",
      nodes: [{ characterKey: "a" }, { characterKey: "b" }],
      edges: [
        edge("known", "a", "b", "friend", {
          disclosure: "known_to_some",
          knownByCharacterKeys: ["a"],
        }),
      ],
      familyGroups: [],
    };
    expect(
      queryRelationshipGraph(graph, { graphRevisionId: "g1" }).edges
    ).toHaveLength(0);
    expect(
      queryRelationshipGraph(graph, {
        graphRevisionId: "g1",
        viewpointCharacterKey: "a",
      }).edges
    ).toHaveLength(1);
    expect(characterRelationshipGraphSchema.safeParse(graph).success).toBe(
      true
    );
  });

  it("enforces cast, world capability, and story-cued look admission", () => {
    expect(
      validateCharacterAdmission({
        characterKey: "guest",
        entryEpisode: 119,
        role: "guest",
        hasSeed: true,
        hasExitOrPayoff: true,
      })
    ).toEqual([]);
    expect(
      validateCharacterAdmission({
        characterKey: "ghost",
        entryEpisode: 120,
        role: "guest",
        hasSeed: false,
        hasExitOrPayoff: false,
      })
    ).toContain("guest_without_seed_or_payoff");
    expect(
      resolveCapability("time_dilation", {
        supported: false,
        fallback: "slow_motion",
      })
    ).toMatchObject({ status: "fallback", fallbackTag: "slow_motion" });
    expect(
      validateLookCue({
        lookId: "gala-1",
        characterKey: "mina",
        episodeNumber: 10,
        cueType: "event",
        cueText: "attends gala",
      })
    ).toEqual([]);
    expect(
      validateLookCue({
        lookId: "auto-1",
        characterKey: "mina",
        episodeNumber: 10,
      })
    ).toContain("missing_story_cue");
  });
});

function edge(
  edgeId: string,
  from: string,
  to: string,
  relationType: RelationshipGraphEdge["relationType"],
  overrides: Partial<RelationshipGraphEdge> = {}
): RelationshipGraphEdge {
  return {
    edgeId,
    fromCharacterKey: from,
    toCharacterKey: to,
    relationType,
    status: "active",
    familySide: "none",
    disclosure: "public",
    validFromEpisode: 1,
    validToEpisode: null,
    sourceEdgeIds: [],
    evidenceIds: [],
    provenance: "authored",
    ...overrides,
  };
}
