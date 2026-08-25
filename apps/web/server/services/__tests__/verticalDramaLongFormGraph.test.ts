import { describe, expect, it } from "vitest";
import {
  attachRelationshipGraphToBible,
  materializeCompatibilityRelationshipGraph,
  normalizeStrictRelationshipGraphDeltas,
} from "../verticalDramaLongFormGraph";

describe("vertical drama long-form relationship graph materialization", () => {
  it("normalizes an omitted delta array to an explicit empty array when no legacy relationship state exists", () => {
    const [normalized] = normalizeStrictRelationshipGraphDeltas([
      {
        episodeNumber: 1,
        episodeMemory: {
          recap: "The episode establishes the setting.",
          relationshipChanges: [],
        },
      },
    ]);

    expect(normalized).toMatchObject({
      episodeMemory: { relationshipGraphDeltas: [] },
    });
  });

  it("does not invent strict deltas when legacy relationship state is present", () => {
    const [normalized] = normalizeStrictRelationshipGraphDeltas([
      {
        episodeNumber: 1,
        episodeMemory: {
          relationshipChanges: [
            { pair: ["mina", "ethan"], status: "friend" },
          ],
        },
      },
    ]);

    expect(normalized).not.toHaveProperty(
      "episodeMemory.relationshipGraphDeltas"
    );
  });

  it("projects structured memory relationships into a legacy-derived, revisioned graph", () => {
    const materialized = materializeCompatibilityRelationshipGraph({
      seriesId: 7,
      characterKeys: ["Mina", "Ethan"],
      episodeMemories: [
        {
          episodeNumber: 1,
          relationshipChanges: [
            {
              pair: ["Mina", "Ethan"],
              status: "friend",
              disclosure: "public",
              knownBy: [],
            },
          ],
        },
      ],
    });
    expect(materialized.graph.graphRevisionId).toContain("relationship-graph-");
    expect(materialized.graph.edges[0]).toMatchObject({
      relationType: "friend",
      provenance: "legacy_derived",
      evidenceIds: ["episode-memory:1"],
    });
  });

  it("does not replace an authored graph during compatibility backfill", () => {
    const bible = {
      longForm: {
        relationshipGraphReadiness: "ready",
        relationshipGraph: { graphRevisionId: "authored" },
      },
    };
    const materialized = materializeCompatibilityRelationshipGraph({
      seriesId: 1,
      characterKeys: [],
      episodeMemories: [],
    });
    expect(attachRelationshipGraphToBible(bible, materialized)).toBe(bible);
  });

  it("projects strict graph deltas and preserves their evidence/provenance", () => {
    const materialized = materializeCompatibilityRelationshipGraph({
      seriesId: 8,
      characterKeys: [],
      episodeMemories: [
        {
          episodeNumber: 12,
          relationshipGraphDeltas: [
            {
              operation: "reveal",
              edgeId: "edge-12",
              fromCharacterKey: "mina",
              toCharacterKey: "ethan",
              relationType: "fiance",
              validFromEpisode: 12,
              disclosure: "public",
              beliefState: "known",
              knownByCharacterKeys: ["mina", "ethan"],
              evidenceRefs: ["ep12:shot3"],
              affectedCharacterKeys: ["mina", "ethan"],
            },
          ],
          relationshipChanges: [
            {
              pair: ["mina", "ethan"],
              status: "friend",
              disclosure: "public",
              knownBy: [],
            },
          ],
        },
      ],
    });
    expect(materialized.graph.edges[0]).toMatchObject({
      edgeId: "edge-12",
      relationType: "fiance",
      provenance: "episode_fact",
      evidenceIds: ["ep12:shot3"],
      beliefState: "known",
    });
  });

  it("segments repeated strict edge ids without losing canonical provenance", () => {
    const materialized = materializeCompatibilityRelationshipGraph({
      seriesId: 9,
      characterKeys: [],
      episodeMemories: [
        {
          episodeNumber: 1,
          relationshipGraphDeltas: [
            {
              operation: "add",
              edgeId: "canonical-edge",
              fromCharacterKey: "mina",
              toCharacterKey: "ethan",
              relationType: "rival",
              validFromEpisode: 1,
              disclosure: "public",
              beliefState: "known",
              knownByCharacterKeys: ["mina"],
              affectedCharacterKeys: ["mina", "ethan"],
              evidenceRefs: ["ep1:shot1"],
            },
          ],
        },
        {
          episodeNumber: 5,
          relationshipGraphDeltas: [
            {
              operation: "update_status",
              edgeId: "canonical-edge",
              fromCharacterKey: "mina",
              toCharacterKey: "ethan",
              relationType: "rival",
              validFromEpisode: 5,
              disclosure: "public",
              beliefState: "known",
              knownByCharacterKeys: ["mina", "ethan"],
              affectedCharacterKeys: ["mina", "ethan"],
              evidenceRefs: ["ep5:shot2"],
            },
          ],
        },
      ],
    });

    expect(materialized.graph.edges).toHaveLength(2);
    expect(
      new Set(materialized.graph.edges.map(edge => edge.edgeId)).size
    ).toBe(2);
    expect(materialized.graph.edges[0]).toMatchObject({
      edgeId: "canonical-edge",
      validToEpisode: 4,
    });
    expect(materialized.graph.edges[1]).toMatchObject({
      sourceEdgeIds: ["canonical-edge"],
      validFromEpisode: 5,
    });
  });
});
