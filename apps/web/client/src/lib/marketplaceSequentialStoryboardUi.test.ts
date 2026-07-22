/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.1. Node-env tests for the pure client projection module.
 * Fixtures mirror the REAL persisted shapes verified directly in
 * `productReviewSequentialStoryboardSkillRunner.ts` (`SequentialStoryboardShot`,
 * `SequentialStoryboardLoopReport`) and `marketplaceAutoReviewService.ts`
 * (`sequentialStoryboard.*` metadata keys, `storyboardFrameUrls`,
 * `MarketplaceAutoReviewChildSubjectPolicy`) — snake_case shot fields, a
 * top-level `storyboardFrameUrls` array (not nested under
 * `sequentialStoryboard`), and `loopReport.selected_version` as a
 * `"round_N"` string label, never a bare number.
 */
import { describe, expect, it } from "vitest";

import { computeSequentialReferenceCapacity } from "@shared/marketplaceCapture/sequentialEvidencePreview";
import {
  buildSequentialAngleSelectionEntries,
  isSequentialFrameStrategy,
  projectSequentialGuardianState,
  projectSequentialLoopReport,
  projectSequentialShotCards,
  resolveSequentialCapacityMeter,
  type SequentialAngleSelectionEntry,
} from "./marketplaceSequentialStoryboardUi";

function shotFixture(overrides: Record<string, unknown> = {}) {
  return {
    shot_id: 1,
    purpose: "hook_open",
    duration_seconds: 5,
    demonstration_type: "finished_product_showcase",
    depicts_minor: false,
    guardian_required: false,
    transition_from_previous: "",
    visual_summary: "Product on table",
    dialogue: "สวัสดีค่ะ วันนี้มารีวิวสินค้าตัวนี้กัน",
    estimated_speech_seconds: 2.3,
    start_frame_image_prompt: "A clean product hero shot on a wooden table.",
    image_prompt_character_count: 45,
    video_prompt:
      "Use @Image1 as the absolute product identity reference. Camera pushes in slowly.",
    video_prompt_character_count: 80,
    claim_trace: [{ text: "waterproof", support: "text_verified" }],
    qc: { evidence_accuracy: 92, continuity: 88, status: "passed" },
    ...overrides,
  };
}

function nineShotFixture() {
  return Array.from({ length: 9 }, (_, index) =>
    shotFixture({ shot_id: index + 1, purpose: `shot_${index + 1}` })
  );
}

describe("marketplaceSequentialStoryboardUi", () => {
  describe("isSequentialFrameStrategy", () => {
    it("accepts only the exact literal", () => {
      expect(isSequentialFrameStrategy("sequential_shot_storyboard")).toBe(true);
      expect(isSequentialFrameStrategy("storyboard_3x3_split")).toBe(false);
      expect(isSequentialFrameStrategy("video_shot_start_stop")).toBe(false);
      expect(isSequentialFrameStrategy(undefined)).toBe(false);
      expect(isSequentialFrameStrategy(null)).toBe(false);
      expect(isSequentialFrameStrategy(42)).toBe(false);
    });
  });

  describe("projectSequentialShotCards", () => {
    it("returns 9 models in shot_id order carrying every field", () => {
      const metadataJson = {
        sequentialStoryboard: { shots: nineShotFixture() },
        storyboardFrameUrls: Array.from(
          { length: 9 },
          (_, index) => `https://cdn.example.com/frame-${index + 1}.png`
        ),
      };

      const cards = projectSequentialShotCards(metadataJson);

      expect(cards).toHaveLength(9);
      expect(cards.map(card => card.shotId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const first = cards[0];
      expect(first.dialogue).toBe("สวัสดีค่ะ วันนี้มารีวิวสินค้าตัวนี้กัน");
      expect(first.imagePrompt).toBe(
        "A clean product hero shot on a wooden table."
      );
      expect(first.imagePromptChars).toBe(first.imagePrompt.length);
      expect(first.videoPrompt).toContain("Use @Image1");
      expect(first.videoPromptChars).toBe(first.videoPrompt.length);
      expect(first.claimSources).toEqual([
        { text: "waterproof", support: "text_verified" },
      ]);
      expect(first.qcStatus).toBe("passed");
      expect(first.demonstrationType).toBe("finished_product_showcase");
      expect(first.depictsMinor).toBe(false);
      expect(first.guardianRequired).toBe(false);
      expect(first.frameUrl).toBe("https://cdn.example.com/frame-1.png");
      expect(first.edited).toBe(false);
      expect(first.editedAt).toBeNull();
    });

    it("shows override text with edited/editedAt on the overridden shot only", () => {
      const metadataJson = {
        sequentialStoryboard: {
          shots: nineShotFixture(),
          shotOverrides: {
            "3": {
              dialogue: "แก้ไขบทพูดช็อต 3",
              start_frame_image_prompt: "Edited image prompt for shot 3.",
              video_prompt: "Use @Image1 as the absolute product identity reference. Edited.",
              editedAt: "2026-07-20T10:00:00.000Z",
              editedBy: "user_1",
            },
          },
        },
      };

      const cards = projectSequentialShotCards(metadataJson);
      const shot3 = cards.find(card => card.shotId === 3)!;
      expect(shot3.dialogue).toBe("แก้ไขบทพูดช็อต 3");
      expect(shot3.imagePrompt).toBe("Edited image prompt for shot 3.");
      expect(shot3.edited).toBe(true);
      expect(shot3.editedAt).toBe("2026-07-20T10:00:00.000Z");

      const untouched = cards.filter(card => card.shotId !== 3);
      expect(untouched).toHaveLength(8);
      for (const card of untouched) {
        expect(card.edited).toBe(false);
        expect(card.editedAt).toBeNull();
      }
    });

    it("tolerates undefined, {}, legacy 3x3 metadata, and malformed shots without throwing", () => {
      expect(projectSequentialShotCards(undefined)).toEqual([]);
      expect(projectSequentialShotCards({})).toEqual([]);
      expect(
        projectSequentialShotCards({
          storyboardGridUrl: "https://cdn.example.com/grid.png",
          storyboardFrameUrls: ["a", "b", "c"],
        })
      ).toEqual([]);
      expect(() =>
        projectSequentialShotCards({ sequentialStoryboard: { shots: "not-an-array" } })
      ).not.toThrow();
      expect(
        projectSequentialShotCards({ sequentialStoryboard: { shots: "not-an-array" } })
      ).toEqual([]);
      expect(() =>
        projectSequentialShotCards({
          sequentialStoryboard: { shots: [{ purpose: "missing shot_id" }, null, 42] },
        })
      ).not.toThrow();
      expect(
        projectSequentialShotCards({
          sequentialStoryboard: { shots: [{ purpose: "missing shot_id" }, null, 42] },
        })
      ).toEqual([]);
    });
  });

  describe("projectSequentialLoopReport", () => {
    it("returns rounds[] and selectedVersion from a full 3-round report", () => {
      const metadataJson = {
        sequentialStoryboard: {
          loopReport: {
            round_1: {
              totalScore: 640,
              normalizedScore: 80,
              candidates: [{ candidate_id: "a" }, { candidate_id: "b" }],
              disqualifiers: ["missing_global_block"],
              valid: false,
              retained: false,
              round: 1,
            },
            round_2: {
              totalScore: 720,
              normalizedScore: 90,
              candidates: [{ candidate_id: "c" }],
              disqualifiers: [],
              valid: true,
              retained: true,
              round: 2,
            },
            selected_version: "round_2",
          },
        },
      };

      const report = projectSequentialLoopReport(metadataJson);
      expect(report).not.toBeNull();
      expect(report!.rounds).toEqual([
        {
          round: 1,
          totalScore: 640,
          candidateCount: 2,
          disqualified: true,
          summary: undefined,
        },
        {
          round: 2,
          totalScore: 720,
          candidateCount: 1,
          disqualified: false,
          summary: undefined,
        },
      ]);
      expect(report!.selectedVersion).toBe(2);
      expect(report!.degradedFallback).toBe(false);
    });

    it("returns exactly one round when only round_1 is present", () => {
      const report = projectSequentialLoopReport({
        sequentialStoryboard: {
          loopReport: {
            round_1: { totalScore: 500, candidates: [], disqualifiers: [] },
          },
        },
      });
      expect(report!.rounds).toHaveLength(1);
      expect(report!.rounds[0].round).toBe(1);
    });

    it("surfaces the degraded-fallback flag even with zero rounds", () => {
      const report = projectSequentialLoopReport({
        sequentialStoryboard: {
          degraded: true,
          loopReport: { selected_version: "degraded" },
        },
      });
      expect(report).not.toBeNull();
      expect(report!.rounds).toEqual([]);
      expect(report!.degradedFallback).toBe(true);
      expect(report!.selectedVersion).toBeNull();
    });

    it("returns null when loopReport is absent", () => {
      expect(projectSequentialLoopReport(undefined)).toBeNull();
      expect(projectSequentialLoopReport({})).toBeNull();
      expect(
        projectSequentialLoopReport({ sequentialStoryboard: { shots: [] } })
      ).toBeNull();
    });
  });

  describe("buildSequentialAngleSelectionEntries", () => {
    const images = [
      { id: "img_primary", url: "https://cdn.example.com/primary.png", hash: "h0" },
      { id: "img_1", url: "https://cdn.example.com/1.png", hash: "h1" },
      { id: "img_2", url: "https://cdn.example.com/2.png", hash: "h2" },
      // Duplicate of img_1 by hash, different id/url — must be deduped.
      { id: "img_1_dup", url: "https://cdn.example.com/1-dup.png", hash: "h1" },
      { id: "img_3", url: "https://cdn.example.com/3.png", hash: null },
    ];

    it("excludes the primary anchor, defaults unlabeled images to other, dedupes by hash, preserves order", () => {
      const entries = buildSequentialAngleSelectionEntries({
        images,
        primaryImageId: "img_primary",
        angleLabels: { img_2: "back" },
      });

      expect(entries.map(entry => entry.imageId)).toEqual(["img_1", "img_2", "img_3"]);
      expect(entries.map(entry => entry.angleLabel)).toEqual(["other", "back", "other"]);
    });

    it("marks package/parts_diagram as evidenceOnly", () => {
      const entries = buildSequentialAngleSelectionEntries({
        images,
        primaryImageId: "img_primary",
        angleLabels: { img_1: "package", img_2: "parts_diagram", img_3: "front" },
      });
      const byId = Object.fromEntries(entries.map(entry => [entry.imageId, entry]));
      expect(byId.img_1.evidenceOnly).toBe(true);
      expect(byId.img_2.evidenceOnly).toBe(true);
      expect(byId.img_3.evidenceOnly).toBe(false);
    });

    it("caps at 8 entries", () => {
      const manyImages = Array.from({ length: 12 }, (_, index) => ({
        id: `img_${index}`,
        url: `https://cdn.example.com/${index}.png`,
        hash: `hash_${index}`,
      }));
      const entries = buildSequentialAngleSelectionEntries({
        images: manyImages,
        primaryImageId: null,
        angleLabels: {},
      });
      expect(entries).toHaveLength(8);
    });
  });

  describe("resolveSequentialCapacityMeter", () => {
    it("delegates to computeSequentialReferenceCapacity without duplicating arithmetic", () => {
      const entries: SequentialAngleSelectionEntry[] = [
        { imageId: "a", url: "u_a", source: "upload", angleLabel: "front", evidenceOnly: false },
        { imageId: "b", url: "u_b", source: "upload", angleLabel: "back", evidenceOnly: false },
        { imageId: "c", url: "u_c", source: "upload", angleLabel: "side", evidenceOnly: false },
        { imageId: "d", url: "u_d", source: "upload", angleLabel: "top", evidenceOnly: false },
      ];

      const meter = resolveSequentialCapacityMeter({
        modelCap: 5,
        entries,
        guardianReserved: true,
        environmentAttached: true,
      });

      const direct = computeSequentialReferenceCapacity({
        modelCap: 5,
        angleCandidates: entries.map(entry => ({ ref: entry.imageId, angleLabel: entry.angleLabel })),
        guardianRequired: true,
        guardianPresent: true,
        environmentPresent: true,
      });

      expect(meter.attachedAngles).toBe(2);
      expect(meter.attachedAngles).toBe(direct.attachedAngleCount);
      expect(meter.trimmedAngles).toEqual(["side", "top"]);
      expect(meter.trimmedAngles).toEqual(direct.trimmedAngles.map(candidate => candidate.angleLabel));
      expect(meter.capacityImpossible).toBe(direct.requiredSlotsExceedCap);
    });

    it("never throws and reports capacityImpossible for modelCap 0", () => {
      expect(() =>
        resolveSequentialCapacityMeter({
          modelCap: 0,
          entries: [],
          guardianReserved: false,
          environmentAttached: false,
        })
      ).not.toThrow();
      const meter = resolveSequentialCapacityMeter({
        modelCap: 0,
        entries: [],
        guardianReserved: false,
        environmentAttached: false,
      });
      expect(meter.capacityImpossible).toBe(true);
      expect(meter.attachedAngles).toBe(0);
    });

    it("excludes evidence-only entries from angle candidates entirely", () => {
      const entries: SequentialAngleSelectionEntry[] = [
        { imageId: "a", url: "u_a", source: "upload", angleLabel: "package", evidenceOnly: true },
        { imageId: "b", url: "u_b", source: "upload", angleLabel: "front", evidenceOnly: false },
      ];
      const meter = resolveSequentialCapacityMeter({
        modelCap: 5,
        entries,
        guardianReserved: false,
        environmentAttached: false,
      });
      expect(meter.attachedAngles).toBe(1);
      expect(meter.trimmedAngles).toEqual([]);
    });
  });

  describe("projectSequentialGuardianState", () => {
    it("is active from the plan preview when productChildRelated is true (childDepictionPlanned is always false pre-run)", () => {
      const state = projectSequentialGuardianState({
        planChildSubjectPolicy: {
          productChildRelated: true,
          childDepictionPlanned: false,
        },
      });
      expect(state.active).toBe(true);
      expect(state.guardianReferenceAttached).toBe(false);
    });

    it("is inactive from the plan preview when the product is not child-related", () => {
      const state = projectSequentialGuardianState({
        planChildSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
      });
      expect(state.active).toBe(false);
    });

    it("requires both productChildRelated and childDepictionPlanned once run metadata is confirmed", () => {
      const activeState = projectSequentialGuardianState({
        metadataJson: {
          sequentialStoryboard: {
            childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
          },
        },
      });
      expect(activeState.active).toBe(true);

      const inactiveState = projectSequentialGuardianState({
        metadataJson: {
          sequentialStoryboard: {
            childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: false },
          },
        },
      });
      expect(inactiveState.active).toBe(false);
    });

    it("reports guardianReferenceAttached from characterReferenceAttached, the run policy ref, or the manifest", () => {
      expect(
        projectSequentialGuardianState({
          planChildSubjectPolicy: { productChildRelated: true, childDepictionPlanned: false },
          characterReferenceAttached: true,
        }).guardianReferenceAttached
      ).toBe(true);

      expect(
        projectSequentialGuardianState({
          metadataJson: {
            sequentialStoryboard: {
              childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
              referenceManifest: [{ index: 2, role: "character", url: "https://cdn.example.com/g.png" }],
            },
          },
        }).guardianReferenceAttached
      ).toBe(true);
    });

    it("never throws on undefined/malformed input and defaults to inactive", () => {
      expect(() => projectSequentialGuardianState({})).not.toThrow();
      expect(projectSequentialGuardianState({}).active).toBe(false);
      expect(
        projectSequentialGuardianState({ metadataJson: { sequentialStoryboard: "nonsense" } }).active
      ).toBe(false);
    });
  });
});
