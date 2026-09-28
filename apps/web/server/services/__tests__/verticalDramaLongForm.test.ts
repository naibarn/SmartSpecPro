import { describe, expect, it } from "vitest";
import { buildLongFormPlan } from "../verticalDramaLongFormPlanner";
import {
  buildLongFormRetrievalPack,
  buildReverseDependencyIndex,
  validateCompactedMemorySnapshot,
} from "../verticalDramaLongFormMemory";
import {
  evaluateLongFormClosure,
  runLongFormBlockLoop,
} from "../verticalDramaLongFormRuntime";
import {
  createLookLedgerEntry,
  validateCastExpansion,
  validateWorldRule,
} from "../verticalDramaLongFormDomain";
import {
  assertLongFormRunFingerprintStable,
  createLongFormRunExtension,
} from "../verticalDramaLongFormAdmission";
import { longFormRunExtensionSchema } from "@shared/verticalDramaSeries/longFormContracts";

describe("Vertical Drama long-form services", () => {
  it("reverse-plans a contiguous 120-episode season with closure dependencies", () => {
    const plan = buildLongFormPlan({
      blueprintScope: "series-1",
      targetEpisodeCount: 120,
      mystery: {
        mysteryId: "m1",
        question: "Who erased the archive?",
        plantEpisode: 1,
        revealEpisode: 118,
        evidenceIds: ["clue-1"],
        consequence: "The family loses control.",
      },
      threads: [
        {
          threadId: "t1",
          ownerCharacterKeys: ["mina"],
          plantEpisode: 2,
          payoffStartEpisode: 110,
          payoffEndEpisode: 120,
          resolutionCost: "confession",
        },
      ],
      advantageBeats: [
        {
          episodeNumber: 10,
          advantagedSide: "protagonist",
          cost: "loses evidence",
          opponentResponse: "changes tactic",
        },
      ],
    });
    expect(plan.chunks.length).toBe(12);
    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.mysteries[0].revealEpisode).toBe(118);
  });

  it("builds viewpoint-bounded memory with dependency repair impact", () => {
    const graph = {
      graphRevisionId: "g1",
      fingerprint: "gf1",
      nodes: [{ characterKey: "a" }, { characterKey: "b" }],
      familyGroups: [],
      edges: [
        {
          edgeId: "e1",
          fromCharacterKey: "a",
          toCharacterKey: "b",
          relationType: "friend" as const,
          status: "active" as const,
          familySide: "none" as const,
          disclosure: "public" as const,
          validFromEpisode: 1,
          validToEpisode: null,
          sourceEdgeIds: [],
          evidenceIds: ["ev1"],
          provenance: "authored" as const,
        },
      ],
    };
    const index = buildReverseDependencyIndex("g1", graph.edges, {
      e1: { dialogueIds: ["d1"], recapEpisodeNumbers: [1, 2] },
    });
    expect(index.fingerprint).toHaveLength(64);
    const pack = buildLongFormRetrievalPack({
      graph,
      graphQuery: { graphRevisionId: "g1", episodeNumber: 1 },
      canonicalFacts: ["fact"],
      openThreadIds: ["t1"],
      knownByCharacterKeys: ["a"],
    });
    expect(pack.relationshipGraph.graphRevisionId).toBe("g1");
    expect(pack.fingerprint).toHaveLength(64);
    expect(
      validateCompactedMemorySnapshot({
        requiredTruthIds: ["e1", "ev1"],
        retainedTruthIds: ["e1"],
        preFingerprint: "a",
        postFingerprint: "a",
      }).status
    ).toBe("needs_repair");
  });

  it("runs bounded blocks and stops at targeted repair findings", async () => {
    const plan = buildLongFormPlan({
      blueprintScope: "s",
      targetEpisodeCount: 20,
      mystery: {
        mysteryId: "m",
        question: "q",
        plantEpisode: 1,
        revealEpisode: 20,
        evidenceIds: ["e"],
        consequence: "c",
      },
    });
    let attempts = 0;
    const result = await runLongFormBlockLoop({
      plan,
      generateBlock: async (blockId, startEpisode, endEpisode) => ({
        blockId,
        startEpisode,
        endEpisode,
        value: { attempts: ++attempts },
        fingerprint: blockId,
      }),
      validateBlock: async block =>
        block.value.attempts === 1 ? ["continuity"] : [],
      repairBlock: async block => ({ ...block, value: { attempts: 2 } }),
    });
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.checkpoint.status).toBe("succeeded");
  });

  it("finishes with warnings when only content quality remains after repair", async () => {
    const plan = buildLongFormPlan({
      blueprintScope: "warning-fallback",
      targetEpisodeCount: 20,
      mystery: {
        mysteryId: "m",
        question: "q",
        plantEpisode: 1,
        revealEpisode: 20,
        evidenceIds: ["e"],
        consequence: "c",
      },
    });
    const result = await runLongFormBlockLoop({
      plan,
      maxRepairRounds: 1,
      generateBlock: async (blockId, startEpisode, endEpisode) => ({
        blockId,
        startEpisode,
        endEpisode,
        value: { complete: true },
        fingerprint: blockId,
      }),
      validateBlock: async () => ["repeated_dialogue"],
      repairBlock: async block => block,
      acceptWithWarnings: findings => findings.every(finding => finding === "repeated_dialogue"),
    });
    expect(result.blocks.length).toBe(plan.blocks.length);
    expect(result.checkpoint.status).toBe("succeeded");
    expect(result.checkpoint.warnings).toContain(
      `${plan.blocks[0].blockId}:repeated_dialogue`
    );
  });

  it("fences stale checkpoints and preserves accepted values across resume", async () => {
    const plan = buildLongFormPlan({
      blueprintScope: "resume",
      targetEpisodeCount: 20,
      mystery: {
        mysteryId: "m",
        question: "q",
        plantEpisode: 1,
        revealEpisode: 20,
        evidenceIds: ["e"],
        consequence: "c",
      },
    });
    const accepted = {
      blockId: plan.blocks[0].blockId,
      startEpisode: plan.blocks[0].startEpisode,
      endEpisode: plan.blocks[0].endEpisode,
      value: { accepted: true },
      fingerprint: "accepted",
    };
    const resumed = await runLongFormBlockLoop({
      plan,
      checkpoint: {
        planFingerprint: plan.fingerprint,
        acceptedBlockIds: [accepted.blockId],
        acceptedBlocks: [accepted],
        lastAcceptedEpisode: accepted.endEpisode,
        status: "partial",
        repairRound: 0,
      },
      generateBlock: async (blockId, startEpisode, endEpisode) => ({
        blockId,
        startEpisode,
        endEpisode,
        value: { accepted: false },
        fingerprint: blockId,
      }),
      validateBlock: async () => [],
    });
    expect(resumed.blocks[0]).toEqual(accepted);
    await expect(
      runLongFormBlockLoop({
        plan,
        checkpoint: {
          planFingerprint: "stale",
          acceptedBlockIds: [],
          lastAcceptedEpisode: 0,
          status: "partial",
          repairRound: 0,
        },
        generateBlock: async (blockId, startEpisode, endEpisode) => ({
          blockId,
          startEpisode,
          endEpisode,
          value: {},
          fingerprint: blockId,
        }),
        validateBlock: async () => [],
      })
    ).rejects.toThrow("stale_long_form_plan_checkpoint");
  });

  it("blocks unbounded cast/world/look changes and gates closure", () => {
    expect(
      validateCastExpansion(
        {
          version: "v1",
          maxActiveCharacters: 1,
          maxIntroductionsPerBlock: 1,
          maxGuestsPerSeason: 1,
          minMeaningfulActionsBeforeExit: 1,
        },
        {
          activeCharacterKeys: ["mina"],
          introductionsInBlock: 1,
          guestCount: 1,
        },
        {
          characterKey: "guest",
          entryEpisode: 119,
          role: "guest",
          hasSeed: true,
          hasExitOrPayoff: true,
        }
      )
    ).toContain("cast_density_limit");
    expect(
      validateWorldRule({
        ruleId: "magic",
        genre: "fantasy",
        origin: "relic",
        limit: "one use",
        cost: "memory",
        userScope: ["mina"],
        escalation: "higher cost",
        visualSignature: "blue light",
      })
    ).toEqual([]);
    expect(() =>
      createLookLedgerEntry({
        lookId: "gala",
        characterKey: "mina",
        episodeNumber: 10,
        cueType: "event",
        cueText: "gala",
        variantType: "outfit",
        state: "clean",
        firstUseEpisode: 10,
        lastUseEpisode: 10,
      })
    ).not.toThrow();
    expect(
      evaluateLongFormClosure({
        targetEpisodeCount: 1,
        generatedEpisodeNumbers: [1],
        unresolvedMysteryIds: [],
        unresolvedThreadIds: [],
        unearnedGuestIds: [],
        invalidWorldRuleIds: [],
        lookDriftIds: [],
        relationshipFindingIds: [],
        antiDriftFindingIds: [],
      }).eligible
    ).toBe(false);
    expect(
      evaluateLongFormClosure({
        targetEpisodeCount: 1,
        generatedEpisodeNumbers: [1],
        unresolvedMysteryIds: [],
        unresolvedThreadIds: [],
        unearnedGuestIds: [],
        invalidWorldRuleIds: [],
        lookDriftIds: [],
        relationshipFindingIds: [],
        antiDriftFindingIds: [],
        benchmarkFinalizationRef: "benchmark-1",
      })
    ).toMatchObject({ eligible: true, status: "succeeded", findings: [] });
  });

  it("materializes independent run fingerprints and rejects stale graph state", () => {
    expect(() =>
      createLongFormRunExtension({
        blueprintId: "b",
        blueprintFingerprint: "bf",
        targetEpisodeCount: 120,
      })
    ).toThrow("long_form_graph_not_ready");
    const extension = createLongFormRunExtension({
      blueprintId: "b",
      blueprintFingerprint: "bf",
      targetEpisodeCount: 120,
      relationshipGraphRevisionId: "g",
      relationshipGraphFingerprint: "gf",
      relationshipDependencyIndexFingerprint: "df",
      relationshipRedactionPolicyVersion: "rv1",
      relationshipRedactionPolicyFingerprint: "rf",
      policyValues: { speech: { max: 100 } },
    });
    expect(extension.mode).toBe("quality_120");
    expect(longFormRunExtensionSchema.safeParse(extension).success).toBe(true);
    expect(() =>
      assertLongFormRunFingerprintStable(extension, {
        ...extension,
        relationshipGraphFingerprint: "stale",
      })
    ).toThrow("stale_long_form_fingerprint");
  });
});
