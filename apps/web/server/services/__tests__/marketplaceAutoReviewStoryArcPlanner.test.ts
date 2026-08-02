import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assessStagedPlanAdherence,
  buildStagedImagePrompt,
  buildStagedStoryArcPlan,
  buildStagedVideoPrompt,
  type StagedCastMember,
} from "../marketplaceAutoReviewStoryArcPlanner";

const BASE_PRODUCT = {
  productId: "product-1",
  productName: "แก้วน้ำตัวอย่าง",
  description: "สินค้าสำหรับทดสอบ",
  imageUrls: ["https://example.test/product.png"],
};

/**
 * Regression coverage for the marketplace two-character-conversation
 * feature (`planning/marketplace-two-character-conversation/plan.md`
 * §3.1/§7.2's own explicit hard requirement): 0 or 1 cast members must
 * reproduce the prior (pre-feature) solo output byte-for-byte, and only
 * >=2 cast members may switch on the two_person_conversation behavior.
 */
describe("buildStagedStoryArcPlan — solo/no-cast byte-identical regression (plan §3.1/§7.2)", () => {
  it("produces every shot with durationSeconds===10 and NO dialogueTurns/castInShot fields when cast and shotDurationSeconds are both omitted", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-solo-omitted",
      product: BASE_PRODUCT,
    });

    expect(plan.shots).toHaveLength(9);
    expect(plan.cast).toBeUndefined();
    expect(plan.conversationMode).toBeUndefined();
    for (const shot of plan.shots) {
      expect(shot.durationSeconds).toBe(10);
      // Additive fields must be truly ABSENT, not just empty/undefined —
      // `"dialogueTurns" in shot` proves the key itself was never set.
      expect("dialogueTurns" in shot).toBe(false);
      expect("castInShot" in shot).toBe(false);
      expect(shot.dialogueTurns).toBeUndefined();
      expect(shot.castInShot).toBeUndefined();
    }
  });

  it("produces IDENTICAL buildStagedImagePrompt/buildStagedVideoPrompt output whether cast is omitted, passed as [], or passed with exactly 1 member", () => {
    const planOmitted = buildStagedStoryArcPlan({
      runId: "run-solo-variant",
      product: BASE_PRODUCT,
    });
    const planEmptyArray = buildStagedStoryArcPlan({
      runId: "run-solo-variant",
      product: BASE_PRODUCT,
      cast: [],
    });
    const singleMember: StagedCastMember = {
      castId: "cast-1",
      name: "Ann",
      source: "uploaded",
      role: "host",
      imageIndex: 2,
    };
    const planOneMember = buildStagedStoryArcPlan({
      runId: "run-solo-variant",
      product: BASE_PRODUCT,
      cast: [singleMember],
    });

    // The plan-level cast/conversationMode fields do legitimately differ
    // (absent vs. present-but-"solo") — that is expected and harmless. What
    // must be byte-identical is the actual compiled prompt text, since only
    // >=2 cast members are allowed to change output.
    expect(planOmitted.cast).toBeUndefined();
    expect(planEmptyArray.cast).toBeUndefined();
    expect(planOneMember.cast).toHaveLength(1);
    expect(planOneMember.conversationMode).toBe("solo");

    for (let i = 0; i < planOmitted.shots.length; i += 1) {
      const imageOmitted = buildStagedImagePrompt({ plan: planOmitted, shot: planOmitted.shots[i] });
      const imageEmpty = buildStagedImagePrompt({ plan: planEmptyArray, shot: planEmptyArray.shots[i] });
      const imageOneMember = buildStagedImagePrompt({ plan: planOneMember, shot: planOneMember.shots[i] });
      expect(imageEmpty).toBe(imageOmitted);
      expect(imageOneMember).toBe(imageOmitted);

      const videoOmitted = buildStagedVideoPrompt({ plan: planOmitted, shot: planOmitted.shots[i] });
      const videoEmpty = buildStagedVideoPrompt({ plan: planEmptyArray, shot: planEmptyArray.shots[i] });
      const videoOneMember = buildStagedVideoPrompt({ plan: planOneMember, shot: planOneMember.shots[i] });
      expect(videoEmpty).toBe(videoOmitted);
      expect(videoOneMember).toBe(videoOmitted);
    }
  });
});

describe("buildStagedStoryArcPlan — two-person conversation end to end (marketplace-two-character-conversation)", () => {
  const host: StagedCastMember = {
    castId: "cast-1",
    name: "Ann",
    source: "uploaded",
    role: "host",
    imageIndex: 2,
  };
  const guest: StagedCastMember = {
    castId: "cast-2",
    name: "Somchai",
    source: "uploaded",
    role: "guest",
    imageIndex: 3,
  };

  it("derives conversationMode='two_person_conversation', dialogueTurns with both speakers' real names, castInShot with both cast ids, and dialogue containing both names for every shot", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-two-person",
      product: { productId: "p1", productName: "Demo chair", description: "Evidence-grounded description", imageUrls: [] },
      cast: [host, guest],
    });

    expect(plan.conversationMode).toBe("two_person_conversation");
    expect(plan.cast).toHaveLength(2);
    expect(plan.shots).toHaveLength(9);

    for (const shot of plan.shots) {
      expect(shot.castInShot).toEqual(["cast-1", "cast-2"]);
      expect(shot.dialogueTurns).toBeDefined();
      expect(shot.dialogueTurns!.length).toBeGreaterThanOrEqual(2);
      const speakerNames = shot.dialogueTurns!.map(turn => turn.speakerName);
      // Real story names, never a generic "Person 1"/"Person 2" placeholder.
      expect(speakerNames).toContain("Ann");
      expect(speakerNames).toContain("Somchai");
      expect(speakerNames).not.toContain("Person 1");
      expect(speakerNames).not.toContain("Person 2");
      expect(shot.dialogue).toContain("Ann");
      expect(shot.dialogue).toContain("Somchai");
    }
  });

  /**
   * `buildStagedImagePrompt`/`buildStagedVideoPrompt` are now a bounded,
   * facts-only fallback (`planning/marketplace-staged-skill-first-restore/plan.md`
   * P3) — the two-shot staging/identity-lock/lip-sync/two-voice CREATIVE
   * direction that used to be hardcoded here was removed and now lives
   * exclusively in the `product-review-sequential-storyboard` skill (and
   * `marketplace-auto-review-shot-video-director` for the legacy per-shot
   * video-director seam). These assertions were rewritten to check the
   * FACTS the fallback must still carry — the @ImageN roster mapping, both
   * cast names, and the approved dialogue — instead of the removed creative
   * prose.
   */
  it("buildStagedImagePrompt includes both cast names and an @ImageN roster mapping line for each cast member when fed a matching 2-character customManifest", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-two-person-image",
      product: {
        productId: "p1",
        productName: "Demo chair",
        description: "Evidence-grounded description",
        imageUrls: ["https://example.test/product.png"],
      },
      cast: [host, guest],
    });
    const customManifest = [
      { url: "https://example.test/product.png", role: "product", active: true },
      { url: "https://example.test/host.png", role: "character", label: "Ann", active: true },
      { url: "https://example.test/guest.png", role: "character", label: "Somchai", active: true },
    ];

    const prompt = buildStagedImagePrompt({
      plan,
      shot: plan.shots[0],
      customManifest,
    });

    expect(prompt).toContain("Ann");
    expect(prompt).toContain("Somchai");
    // Roster mapping (fact): each cast member is bound to its @ImageN tag.
    expect(prompt).toContain("@Image2 = Ann (host)");
    expect(prompt).toContain("@Image3 = Somchai (guest)");
  });

  it("buildStagedVideoPrompt includes both cast names and the approved dialogue turns in speaking order", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-two-person-video",
      product: {
        productId: "p1",
        productName: "Demo chair",
        description: "Evidence-grounded description",
        imageUrls: [],
      },
      cast: [host, guest],
    });

    const prompt = buildStagedVideoPrompt({ plan, shot: plan.shots[0] });
    const turns = plan.shots[0].dialogueTurns!;

    expect(prompt).toContain("Ann");
    expect(prompt).toContain("Somchai");
    // Approved dialogue (fact): rendered in speaking order, verbatim.
    expect(prompt).toContain(
      "Dialogue in speaking order (must be spoken exactly in this order, do not rewrite):"
    );
    expect(prompt).toContain(`1. ${turns[0].speakerName}: ${turns[0].line}`);
    expect(prompt).toContain(`2. ${turns[1].speakerName}: ${turns[1].line}`);
  });

  /**
   * Grep-guard (mirrors the convention in
   * `productReviewSequentialStoryboardSkillRunner.test.ts`'s `.slice(` guard):
   * the creative staging/lip-sync/lock prose stripped out by P3 must never be
   * re-added to this TS fallback — that judgment belongs exclusively to the
   * skill files now.
   */
  it("grep-guard: the planner source no longer hardcodes the removed creative staging/lip-sync/lock prose", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../marketplaceAutoReviewStoryArcPlanner.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf-8");
    const bannedMarkers = [
      "กฎการจัดวางสองคน",
      "Two-person staging rule",
      "ล็อกเอกลักษณ์ ห้ามสลับกัน",
      "Identity lock — never swap",
      "Never swap faces or identifying features",
      "Lip-sync:",
      "TWO-VOICE LOCK:",
      "multi-shot camera-beat sequence",
      "multi-shot camera beats",
      "slightly emphasized",
      "reflect whatever sentiment",
      "สะท้อนอารมณ์และสถานการณ์ที่เรื่องย่อ",
    ];
    for (const marker of bannedMarkers) {
      expect(source).not.toContain(marker);
    }
  });
});

/**
 * `assessStagedPlanAdherence` was implemented (plan §3.3) but never called
 * anywhere in the staged pipeline until this fix — a "taught-not-wired" gap
 * found during a post-implementation gap audit. It's now wired into
 * `initializeStagedMarketplaceAutoReviewRun`, `redraftStagedMarketplaceAutoReviewRun`,
 * and `advanceStagedMarketplaceAutoReviewRun`'s story-plan re-block branch in
 * `marketplaceAutoReviewStagedPipelineService.ts`, each merging its
 * `warnings` into the `concept_story` stage's `statusDetail.reasonCodes`.
 * This suite covers the pure function directly; the wiring itself is proven
 * indirectly by every other test in this repo that exercises those three
 * pipeline functions continuing to pass with the call present (no thrown
 * errors — see the fail-open assertion below for the direct guarantee).
 */
describe("assessStagedPlanAdherence — staged QC warnings (plan §3.3, fail-open)", () => {
  const host: StagedCastMember = {
    castId: "cast-1",
    name: "Ann",
    source: "uploaded",
    role: "host",
    imageIndex: 2,
  };
  const guest: StagedCastMember = {
    castId: "cast-2",
    name: "Somchai",
    source: "uploaded",
    role: "guest",
    imageIndex: 3,
  };

  it("returns no warnings for a well-formed solo plan with a real structure/tone", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-happy",
      product: BASE_PRODUCT,
      storytellingStructure: "hook_problem_insight_proof_cta",
      reviewTone: "irritated_problem",
    });

    const result = assessStagedPlanAdherence(plan, {
      storytellingStructure: "hook_problem_insight_proof_cta",
      reviewTone: "irritated_problem",
    });

    expect(result.warnings).toEqual([]);
  });

  it("flags staged_structure_beat_missing when a shot has an empty title or storySummary", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-structure",
      product: BASE_PRODUCT,
      storytellingStructure: "hook_problem_insight_proof_cta",
    });
    const brokenPlan = {
      ...plan,
      shots: plan.shots.map((shot, i) =>
        i === 0 ? { ...shot, title: "", storySummary: "" } : shot
      ),
    };

    const result = assessStagedPlanAdherence(brokenPlan, {
      storytellingStructure: "hook_problem_insight_proof_cta",
    });

    expect(result.warnings).toContain("staged_structure_beat_missing");
  });

  it("flags staged_tone_not_adhered when every shot's dialogue is blank", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-tone",
      product: BASE_PRODUCT,
      reviewTone: "irritated_problem",
    });
    const blankDialoguePlan = {
      ...plan,
      shots: plan.shots.map(shot => ({ ...shot, dialogue: "" })),
    };

    const result = assessStagedPlanAdherence(blankDialoguePlan, {
      reviewTone: "irritated_problem",
    });

    expect(result.warnings).toContain("staged_tone_not_adhered");
  });

  it("flags staged_conversation_turns_missing when conversationMode is two_person but a shot has fewer than 2 dialogueTurns", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-turns",
      product: BASE_PRODUCT,
      cast: [host, guest],
    });
    const missingTurnsPlan = {
      ...plan,
      shots: plan.shots.map((shot, i) =>
        i === 0 ? { ...shot, dialogueTurns: [shot.dialogueTurns![0]] } : shot
      ),
    };

    const result = assessStagedPlanAdherence(missingTurnsPlan, {});

    expect(result.warnings).toContain("staged_conversation_turns_missing");
  });

  it("does NOT flag staged_conversation_turns_missing for a solo plan (no cast)", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-solo-turns",
      product: BASE_PRODUCT,
    });

    const result = assessStagedPlanAdherence(plan, {});

    expect(result.warnings).not.toContain("staged_conversation_turns_missing");
  });

  it("fail-open: never throws even given a malformed/partial plan shape", () => {
    expect(() =>
      assessStagedPlanAdherence({ shots: null } as any, {
        storytellingStructure: "hook_problem_insight_proof_cta",
        reviewTone: "irritated_problem",
        conversationMode: "two_person_conversation",
      })
    ).not.toThrow();

    const result = assessStagedPlanAdherence({ shots: null } as any, {});
    expect(result.warnings).toEqual([]);
  });
});

/**
 * Coverage for `planning/marketplace-flexible-shots-and-creation-casting/plan.md`
 * W1 — variable shot count (1..30, "auto" handled one layer up in the LLM
 * planner) via the `shotCount` param, plus the extended 4..30s duration
 * range. The beats-table resize (`resizeShotBeats`) is a bounded, purely
 * mechanical fallback: first + last (CTA) beat are always kept, the middle
 * beats cycle to fill any requested length.
 */
describe("buildStagedStoryArcPlan — variable shot count (W1, flexible-shots plan)", () => {
  it("shotCount omitted reproduces the default 9-shot output byte-identically", () => {
    const withDefault = buildStagedStoryArcPlan({
      runId: "run-count-default",
      product: BASE_PRODUCT,
    });
    const withExplicitNine = buildStagedStoryArcPlan({
      runId: "run-count-default",
      product: BASE_PRODUCT,
      shotCount: 9,
    });
    expect(withDefault.shots).toHaveLength(9);
    expect(withDefault).toEqual(withExplicitNine);
  });

  it("shotCount=7 produces exactly 7 shots with ids 1..7, first/last beats preserved, valid contract", () => {
    const nineShot = buildStagedStoryArcPlan({
      runId: "run-count-7",
      product: BASE_PRODUCT,
    });
    const sevenShot = buildStagedStoryArcPlan({
      runId: "run-count-7",
      product: BASE_PRODUCT,
      shotCount: 7,
    });
    expect(sevenShot.shots).toHaveLength(7);
    expect(sevenShot.shots.map(s => s.shotId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // First (hook/opening) beat is preserved verbatim.
    expect(sevenShot.shots[0].title).toBe(nineShot.shots[0].title);
    // Last beat is always the CTA/closing beat, preserved verbatim.
    expect(sevenShot.shots[6].title).toBe(
      nineShot.shots[nineShot.shots.length - 1].title
    );
  });

  it("shotCount=30 produces exactly 30 shots with ids 1..30, first/last beats preserved, valid contract", () => {
    const nineShot = buildStagedStoryArcPlan({
      runId: "run-count-30",
      product: BASE_PRODUCT,
    });
    const thirtyShot = buildStagedStoryArcPlan({
      runId: "run-count-30",
      product: BASE_PRODUCT,
      shotCount: 30,
    });
    expect(thirtyShot.shots).toHaveLength(30);
    expect(thirtyShot.shots.map(s => s.shotId)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
    expect(thirtyShot.shots[0].title).toBe(nineShot.shots[0].title);
    expect(thirtyShot.shots[29].title).toBe(
      nineShot.shots[nineShot.shots.length - 1].title
    );
    // Middle beats must be non-empty (mechanically cycled, never blank).
    for (const shot of thirtyShot.shots) {
      expect(shot.title.length).toBeGreaterThan(0);
      expect(shot.visualSummary.length).toBeGreaterThan(0);
    }
  });

  it("accepts the extended duration range up to 30 seconds", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-duration-30",
      product: BASE_PRODUCT,
      shotDurationSeconds: 30,
    });
    for (const shot of plan.shots) {
      expect(shot.durationSeconds).toBe(30);
    }
  });

  it("assessStagedPlanAdherence works for a non-9 shot count plan", () => {
    const plan = buildStagedStoryArcPlan({
      runId: "run-adherence-flex",
      product: BASE_PRODUCT,
      storytellingStructure: "hook_problem_insight_proof_cta",
      shotCount: 12,
    });
    const result = assessStagedPlanAdherence(plan, {
      storytellingStructure: "hook_problem_insight_proof_cta",
    });
    expect(result.warnings).toEqual([]);
  });
});
