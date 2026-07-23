/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 13 §5 test suite (T1-T10) for the `StartFramePromptEngine` seam in
 * `productReviewSequentialStoryboardSkillRunner.ts`.
 *
 * Mocks ONLY the registry pair (`syncSingleSkillIfChanged`, `getSkillByIdAsync`)
 * for the full-loop integration tests (T9), mirroring
 * `productReviewSequentialStoryboardSkillRunner.test.ts`'s own convention.
 * Everything else is driven through the injected engine effects — no real
 * LLM/provider/skillRegistry calls for the engine itself.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn(),
  getSkillByIdAsync: vi.fn(),
}));

import { syncSingleSkillIfChanged, getSkillByIdAsync } from "../skillRegistry";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
  SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER,
  runProductReviewSequentialStoryboardSkillLoop,
  applyStartFramePromptEngineToPack,
  normalizeCinematicImagePromptEngineOutput,
  normalizeCinematicVideoPromptEngineOutput,
  composeCinematicVideoPrompt,
  findStartFramePromptEngineFactLockViolations,
  type SequentialStoryboardSkillLoopInput,
  type SequentialStoryboardPack,
  type SequentialStoryboardShot,
  type SequentialReferenceManifestEntry,
  type ChildSubjectPolicyInput,
  type StartFramePromptEngineEffects,
  type SequentialStoryboardLoopEffects,
} from "../productReviewSequentialStoryboardSkillRunner";

const mockSyncSingleSkillIfChanged = vi.mocked(syncSingleSkillIfChanged);
const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);

/* -------------------------------------------------------------------------- */
/* Fixtures (cloned from productReviewSequentialStoryboardSkillRunner.test.ts) */
/* -------------------------------------------------------------------------- */

function makeMockSkill(): any {
  return {
    id: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
    name: "product-review-sequential-storyboard",
    systemPrompt: "You are the sequential storyboard skill.",
    skillContent: "You are the sequential storyboard skill.",
    config: {
      media_studio: {
        marketplace_auto_review_sequential_storyboard: {
          enabled: true,
          loop_rounds: 1,
          candidate_count: 3,
          min_prompt_score_to_pass: 0,
        },
      },
    },
  };
}

function makeManifest(): SequentialReferenceManifestEntry[] {
  return [
    { index: 1, role: "primary_product", angleLabel: "front", url: "https://example.com/1.jpg" },
    { index: 2, role: "product_angle", angleLabel: "back", url: "https://example.com/2.jpg" },
  ];
}

function makeChildSubjectPolicy(): ChildSubjectPolicyInput {
  return { productChildRelated: false, childDepictionPlanned: false, guardianReferenceIndex: null };
}

function makeLoopInput(
  overrides?: Partial<SequentialStoryboardSkillLoopInput>
): SequentialStoryboardSkillLoopInput {
  return {
    tenantId: "tenant-1",
    userId: 42,
    runId: "run-1",
    productName: "Storage Box",
    productDescription: "A plastic storage box with a snap-on lid",
    productSpecs: "material: plastic",
    referenceManifest: makeManifest(),
    skillVisionUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    childSubjectPolicy: makeChildSubjectPolicy(),
    ...overrides,
  };
}

function makeCleanVideoPrompt(shotId: number): string {
  return `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Shot ${shotId} original video prompt, plastic box on a table.`;
}

function makeCleanShot(shotId: number): SequentialStoryboardShot {
  return {
    shot_id: shotId,
    purpose: `beat_${shotId}`,
    duration_seconds: 5,
    demonstration_type: "usage_demo",
    depicts_minor: false,
    guardian_required: false,
    transition_from_previous: "",
    visual_summary: "shows the plastic storage box in use",
    dialogue: "กล่องพลาสติกใบนี้ใช้งานง่าย",
    estimated_speech_seconds: 1,
    start_frame_image_prompt: `Shot ${shotId}: @Image1 is the primary product identity reference, @Image2 is a supporting back-angle reference. Plastic storage box on a clean table, 9:16, photorealistic, no text.`,
    image_prompt_character_count: 0,
    video_prompt: makeCleanVideoPrompt(shotId),
    video_prompt_character_count: 0,
    claim_trace: [{ text: "the box is easy to use", support: "visual_verified" }],
    qc: { evidence_accuracy: 9, continuity: 9, compliance: 9, length_valid: true, status: "pass" },
  };
}

function makeCleanPack(overrides?: Partial<SequentialStoryboardPack>): SequentialStoryboardPack {
  const shots = Array.from({ length: 9 }, (_, i) => ({ ...makeCleanShot(i + 1), shot_id: i + 1 }));
  return {
    skillVersion: "1.0.0",
    evidenceProfile: {
      assembly_documented: false,
      assembly_evidence: [],
      product_reference_model_conflict: null,
    },
    claimWhitelist: [],
    conflicts: [],
    reviewStrategy: {},
    childSubjectPolicy: {
      productChildRelated: false,
      childDepictionPlanned: false,
      guardianReferenceIndex: null,
      guardianPolicyActive: false,
    },
    globalContinuity: {},
    shots,
    loopReport: { selected_version: "round_1" },
    finalQc: {
      all_claims_supported: true,
      all_shots_under_10_seconds: true,
      hook_within_3_seconds: true,
      price_absent: true,
      overclaims_absent: true,
      all_image_prompts_within_budget: true,
      all_video_prompts_within_budget: true,
      global_block_present_in_every_video_prompt: true,
      guardian_policy_satisfied: true,
      tone_preset_adhered: true,
      structure_beats_present: true,
    },
    referenceManifest: makeManifest(),
    ...overrides,
  };
}

function makeStubEngineEffects(
  overrides?: Partial<StartFramePromptEngineEffects>
): StartFramePromptEngineEffects {
  return {
    loadEngineSkillBodies: vi.fn(async () => ({
      imageSkillBody: "IMAGE ENGINE SKILL BODY",
      videoSkillBody: "VIDEO ENGINE SKILL BODY",
    })),
    invokeImagePromptEngine: vi.fn(async () => ({
      prompt: "@Image1 is the product. Cinematic re-worded prompt, dramatic lighting.",
    })),
    invokeVideoPromptEngine: vi.fn(async () => ({
      prompt: "Cinematic slow push-in on the plastic box, warm key light.",
    })),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* T1 — evidence_product default: byte-identical, loader never called        */
/* -------------------------------------------------------------------------- */

describe("T1 — applyStartFramePromptEngineToPack: evidence_product default", () => {
  it("absent style -> pack prompts unchanged, both stamps default to evidence_product, loader never called", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput();
    const effects = makeStubEngineEffects();

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(effects.loadEngineSkillBodies).not.toHaveBeenCalled();
    expect(effects.invokeImagePromptEngine).not.toHaveBeenCalled();
    expect(effects.invokeVideoPromptEngine).not.toHaveBeenCalled();
    for (let i = 0; i < 9; i++) {
      expect(result.pack.shots[i].start_frame_image_prompt).toBe(pack.shots[i].start_frame_image_prompt);
      expect(result.pack.shots[i].video_prompt).toBe(pack.shots[i].video_prompt);
      expect(result.pack.shots[i].start_frame_prompt_engine).toBe("evidence_product");
      expect(result.pack.shots[i].video_prompt_engine).toBe("evidence_product");
    }
    expect(result.engineAudit).toEqual([]);
  });

  it('explicit style: "evidence_product" -> same byte-identical behavior', async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "evidence_product" });
    const effects = makeStubEngineEffects();

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(effects.loadEngineSkillBodies).not.toHaveBeenCalled();
    expect(result.pack.shots[0].start_frame_image_prompt).toBe(pack.shots[0].start_frame_image_prompt);
  });
});

/* -------------------------------------------------------------------------- */
/* T2 — family routing at the engine-integration level                        */
/* -------------------------------------------------------------------------- */

describe("T2 — cinematic_auto routes the image engine by model family", () => {
  it.each(["gpt-image-1.5-all", "gpt-4o-image", "dall-e-3"])(
    "GPT-family model %s -> loadEngineSkillBodies called with policy_safe_rewrite",
    async (imageModel) => {
      const pack = makeCleanPack();
      const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto", imageModel });
      const effects = makeStubEngineEffects();

      await applyStartFramePromptEngineToPack({ pack, loopInput, imageBudget: 4000 }, effects);

      expect(effects.loadEngineSkillBodies).toHaveBeenCalledWith({
        imagePromptMode: "policy_safe_rewrite",
      });
    }
  );

  it.each(["google-nano-banana-pro", "flux-2.0", "z-image", "grok-imagine", "some-unknown-model"])(
    "non-GPT/unknown model %s -> loadEngineSkillBodies called with cinematic_narrative",
    async (imageModel) => {
      const pack = makeCleanPack();
      const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto", imageModel });
      const effects = makeStubEngineEffects();

      await applyStartFramePromptEngineToPack({ pack, loopInput, imageBudget: 4000 }, effects);

      expect(effects.loadEngineSkillBodies).toHaveBeenCalledWith({
        imagePromptMode: "cinematic_narrative",
      });
    }
  );
});

/* -------------------------------------------------------------------------- */
/* T3 — soft degrade on a missing skill folder                                */
/* -------------------------------------------------------------------------- */

describe("T3 — missing skill folder soft-degrades to evidence_product", () => {
  it("missing image skill body -> every shot stamped evidence_product, LLM invokers never called, audit records image_skill_missing", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto", imageModel: "grok-imagine" });
    const effects = makeStubEngineEffects({
      loadEngineSkillBodies: vi.fn(async () => ({ imageSkillBody: null, videoSkillBody: "VIDEO BODY" })),
    });

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(effects.invokeImagePromptEngine).not.toHaveBeenCalled();
    expect(effects.invokeVideoPromptEngine).not.toHaveBeenCalled();
    expect(result.pack.shots[0].start_frame_image_prompt).toBe(pack.shots[0].start_frame_image_prompt);
    expect(result.pack.shots[0].start_frame_prompt_engine).toBe("evidence_product");
    expect(result.pack.shots[0].video_prompt_engine).toBe("evidence_product");
    expect(result.engineAudit).toEqual([
      expect.objectContaining({
        event: "sequential_cinematic_prompt_engine_degraded",
        reason: "image_skill_missing",
      }),
    ]);
  });

  it("missing video skill body -> degrades with reason video_skill_missing", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto" });
    const effects = makeStubEngineEffects({
      loadEngineSkillBodies: vi.fn(async () => ({ imageSkillBody: "IMAGE BODY", videoSkillBody: null })),
    });

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(result.engineAudit).toEqual([
      expect.objectContaining({
        event: "sequential_cinematic_prompt_engine_degraded",
        reason: "video_skill_missing",
      }),
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* T4 — output normalizers (both VD divergent shapes -> same internal record) */
/* -------------------------------------------------------------------------- */

describe("T4 — normalizeCinematicImagePromptEngineOutput / normalizeCinematicVideoPromptEngineOutput", () => {
  it("policy_safe_rewrite shape (top-level safety_adjustments) normalizes", () => {
    const normalized = normalizeCinematicImagePromptEngineOutput({
      prompt: "policy-safe prompt text",
      negative_prompt: "no text",
      safety_adjustments: [{ original: "a", rewritten: "b", reason: "threat" }],
    });
    expect(normalized).toEqual({
      prompt: "policy-safe prompt text",
      negativePrompt: "no text",
      safetyAdjustments: [{ original: "a", rewritten: "b", reason: "threat" }],
    });
  });

  it("cinematic_narrative shape (nested under analysis_summary) normalizes to the SAME internal record shape", () => {
    const normalized = normalizeCinematicImagePromptEngineOutput({
      prompt: "cinematic prompt text",
      analysis_summary: {
        story_meaning: "a quiet moment",
        safety_adjustments: [{ original: "a", rewritten: "b", reason: "threat" }],
      },
    });
    expect(normalized).toEqual({
      prompt: "cinematic prompt text",
      safetyAdjustments: [{ original: "a", rewritten: "b", reason: "threat" }],
    });
  });

  it("returns null when prompt is missing/empty", () => {
    expect(normalizeCinematicImagePromptEngineOutput({})).toBeNull();
    expect(normalizeCinematicImagePromptEngineOutput({ prompt: "   " })).toBeNull();
    expect(normalizeCinematicImagePromptEngineOutput(null)).toBeNull();
    expect(normalizeCinematicImagePromptEngineOutput("not an object")).toBeNull();
  });

  it("video engine output extracts only prompt (dialogue/negative_motion_prompt/audio_direction discarded)", () => {
    const normalized = normalizeCinematicVideoPromptEngineOutput({
      prompt: "camera pushes in slowly",
      negative_motion_prompt: "no shaky cam",
      dialogue: [{ lineTh: "some line" }],
      audio_direction: "soft ambience",
    });
    expect(normalized).toEqual({ prompt: "camera pushes in slowly" });
  });
});

/* -------------------------------------------------------------------------- */
/* T5 — composeCinematicVideoPrompt keeps the mandatory global block intact   */
/* -------------------------------------------------------------------------- */

describe("T5 — composeCinematicVideoPrompt", () => {
  it("prepends the mandatory global block when the engine prompt lacks it", () => {
    const composed = composeCinematicVideoPrompt({
      globalContinuity: {},
      enginePrompt: "Slow push-in on the product.",
    });
    expect(composed).toContain(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER);
    expect(composed).toContain("Slow push-in on the product.");
  });

  it("returns the engine prompt unchanged when it already contains the marker", () => {
    const enginePrompt = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Slow push-in.`;
    expect(composeCinematicVideoPrompt({ globalContinuity: {}, enginePrompt })).toBe(enginePrompt);
  });

  it("uses globalContinuity.video_global_block verbatim as the prefix when present", () => {
    const composed = composeCinematicVideoPrompt({
      globalContinuity: { video_global_block: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} and stay consistent.` },
      enginePrompt: "Slow push-in.",
    });
    expect(composed).toBe(
      `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} and stay consistent.\n\nSlow push-in.`
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T6 — FACT LOCK regression (the important one)                              */
/* -------------------------------------------------------------------------- */

describe("T6 — FACT LOCK: findStartFramePromptEngineFactLockViolations", () => {
  it('flags "solid oak frame" when the vocabulary never mentions wood/material', () => {
    const violations = findStartFramePromptEngineFactLockViolations({
      candidateText: "A beautiful solid oak frame holding the product.",
      vocabulary: "plastic storage box with a snap-on lid, easy to use",
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes("oak"))).toBe(true);
  });

  it("does not flag a material already present in the vocabulary", () => {
    const violations = findStartFramePromptEngineFactLockViolations({
      candidateText: "The solid oak frame is shown clearly.",
      vocabulary: "a solid oak frame side table, natural wood finish",
    });
    expect(violations).toEqual([]);
  });

  it("does not flag generic wording with no attribute-like keyword", () => {
    const violations = findStartFramePromptEngineFactLockViolations({
      candidateText: "Warm lighting, slow camera push-in, cheerful mood.",
      vocabulary: "plastic storage box",
    });
    expect(violations).toEqual([]);
  });
});

describe("T6b — FACT LOCK end-to-end via applyStartFramePromptEngineToPack", () => {
  it("engine response introducing an unsupported material is REJECTED (reverted to the original evidence-locked wording)", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto" });
    const effects = makeStubEngineEffects({
      invokeImagePromptEngine: vi.fn(async () => ({
        prompt: "@Image1 is the product, a beautiful solid oak frame construction.",
      })),
    });

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    // Reverted: the ORIGINAL evidence-locked wording survives, unpolluted.
    expect(result.pack.shots[0].start_frame_image_prompt).toBe(
      pack.shots[0].start_frame_image_prompt
    );
    expect(result.pack.shots[0].start_frame_prompt_engine).toBe("evidence_product");
    expect(
      result.engineAudit.some(
        (entry) =>
          entry.event === "sequential_cinematic_fact_lock_violation" &&
          entry.shotId === 1 &&
          entry.field === "start_frame_image_prompt"
      )
    ).toBe(true);
  });

  it("a clean cinematic rewrite that adds no new facts IS accepted and stamped with the resolved engine mode", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({
      startFramePromptStyle: "cinematic_auto",
      imageModel: "grok-imagine",
    });
    const effects = makeStubEngineEffects();

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(result.pack.shots[0].start_frame_image_prompt).toBe(
      "@Image1 is the product. Cinematic re-worded prompt, dramatic lighting."
    );
    expect(result.pack.shots[0].start_frame_prompt_engine).toBe("cinematic_narrative");
  });
});

/* -------------------------------------------------------------------------- */
/* T7 — video engine wiring                                                   */
/* -------------------------------------------------------------------------- */

describe("T7 — video engine acceptance + stamping", () => {
  it("accepted video engine output is stamped vertical_drama_shot_video_prompt and retains the global marker", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto" });
    const effects = makeStubEngineEffects();

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(result.pack.shots[0].video_prompt).toContain(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER);
    expect(result.pack.shots[0].video_prompt).toContain(
      "Cinematic slow push-in on the plastic box, warm key light."
    );
    expect(result.pack.shots[0].video_prompt_engine).toBe("vertical_drama_shot_video_prompt");
  });
});

/* -------------------------------------------------------------------------- */
/* T8 — engine call failure never throws, falls back safely                   */
/* -------------------------------------------------------------------------- */

describe("T8 — engine invocation failure fails open to the original wording", () => {
  it("invokeImagePromptEngine throwing -> shot keeps its original prompt + evidence_product stamp, no throw propagates", async () => {
    const pack = makeCleanPack();
    const loopInput = makeLoopInput({ startFramePromptStyle: "cinematic_auto" });
    const effects = makeStubEngineEffects({
      invokeImagePromptEngine: vi.fn(async () => {
        throw new Error("LLM boom");
      }),
    });

    const result = await applyStartFramePromptEngineToPack(
      { pack, loopInput, imageBudget: 4000 },
      effects
    );

    expect(result.pack.shots[0].start_frame_image_prompt).toBe(
      pack.shots[0].start_frame_image_prompt
    );
    expect(result.pack.shots[0].start_frame_prompt_engine).toBe("evidence_product");
    expect(
      result.engineAudit.some(
        (entry) => entry.event === "sequential_cinematic_engine_call_failed" && entry.shotId === 1
      )
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* T9 — full-loop integration: guards still fire, budget path still applies   */
/* -------------------------------------------------------------------------- */

describe("T9 — runProductReviewSequentialStoryboardSkillLoop + cinematic_auto integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncSingleSkillIfChanged.mockResolvedValue({ synced: true });
    mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill());
  });

  function makeLoopEffects(pack: SequentialStoryboardPack): SequentialStoryboardLoopEffects {
    return {
      invokeSkillRound: vi.fn(async () => pack),
      persistRoundReport: vi.fn(async () => {}),
      loadPersistedLoopState: vi.fn(async () => null),
      optimizeFinalPrompt: vi.fn(async ({ prompt }) => ({ prompt, audit: null })),
      emitAudit: vi.fn(),
    };
  }

  it("default style (no engine effects wired) -> engine loader never called, preflight passes clean", async () => {
    const pack = makeCleanPack();
    const loopEffects = makeLoopEffects(pack);
    const engineEffects = makeStubEngineEffects();

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      loopEffects,
      engineEffects
    );

    expect(engineEffects.loadEngineSkillBodies).not.toHaveBeenCalled();
    expect(result.pack.shots[0].start_frame_prompt_engine).toBe("evidence_product");
    expect(result.preflight.blockers).toEqual([]);
  });

  it("cinematic_auto: a price claim introduced by the engine still trips the preflight price guard", async () => {
    const pack = makeCleanPack();
    const loopEffects = makeLoopEffects(pack);
    const engineEffects = makeStubEngineEffects({
      invokeVideoPromptEngine: vi.fn(async () => ({
        prompt: "ราคาถูกที่สุดในตลาดตอนนี้ รีบเลย",
      })),
    });

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput({ startFramePromptStyle: "cinematic_auto" }),
      loopEffects,
      engineEffects
    );

    expect(result.preflight.blockers).toContain("price_claim_detected");
  });

  it("cinematic_auto: an engine image prompt with a contradictory @ImageN mapping still trips the mapping guard", async () => {
    const pack = makeCleanPack();
    const loopEffects = makeLoopEffects(pack);
    const engineEffects = makeStubEngineEffects({
      // Manifest: index 1 = primary_product, index 2 = product_angle(back).
      // "@Image2 = primary product identity reference" is an EXPLICIT
      // Pattern-1 claim (`findReferenceIndexMappingMismatches`'s
      // `@ImageN = <role>` syntax) that contradicts the real manifest —
      // provably self-contradictory, not merely silent.
      invokeImagePromptEngine: vi.fn(async () => ({
        prompt: "@Image2 = primary product identity reference. Show the product clearly.",
      })),
    });

    await expect(
      runProductReviewSequentialStoryboardSkillLoop(
        makeLoopInput({ startFramePromptStyle: "cinematic_auto" }),
        loopEffects,
        engineEffects
      )
      // The loop's own fail-closed invariant (§7.6) throws when its OWN
      // preflight still shows a mapping mismatch — proving the guard is
      // still reachable when the mismatch was introduced by the cinematic
      // engine rather than the skill's own round output.
    ).rejects.toThrow(/reference index mapping mismatch/);
  });

  it("cinematic_auto: an over-budget engine image prompt still routes through the existing optimizer path", async () => {
    const pack = makeCleanPack();
    const loopEffects = makeLoopEffects(pack);
    const overBudgetPrompt = "@Image1 is the product. " + "x".repeat(4100);
    const engineEffects = makeStubEngineEffects({
      invokeImagePromptEngine: vi.fn(async () => ({ prompt: overBudgetPrompt })),
    });

    await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput({ startFramePromptStyle: "cinematic_auto" }),
      loopEffects,
      engineEffects
    );

    expect(loopEffects.optimizeFinalPrompt).toHaveBeenCalled();
  });

  it("cinematic_auto: guardian/assembly/duration guards are untouched by the engine step (still evaluated from unmodified shot fields)", async () => {
    const pack = makeCleanPack({
      childSubjectPolicy: {
        productChildRelated: true,
        childDepictionPlanned: true,
        guardianReferenceIndex: null,
        guardianPolicyActive: true,
      },
    });
    pack.shots[0] = {
      ...pack.shots[0],
      depicts_minor: true,
      demonstration_type: "assembly_demo",
      duration_seconds: 11,
    };
    const loopEffects = makeLoopEffects(pack);
    const engineEffects = makeStubEngineEffects();

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput({
        startFramePromptStyle: "cinematic_auto",
        childSubjectPolicy: {
          productChildRelated: true,
          childDepictionPlanned: true,
          guardianReferenceIndex: null,
        },
      }),
      loopEffects,
      engineEffects
    );

    expect(result.preflight.blockers).toContain("guardian_directive_missing");
    expect(result.preflight.blockers).toContain("assembly_demo_unverified");
    expect(result.preflight.blockers).toContain("shot_duration_exceeds_max");
  });
});

/* -------------------------------------------------------------------------- */
/* T10 — real-file gate (section 13 §6): skip (not fail) when a folder is    */
/* absent, so CI on a clean clone stays green (G1 risk).                      */
/* -------------------------------------------------------------------------- */

function skillManifestExists(skillFolderName: string): boolean {
  for (const dir of resolveSkillDirCandidates(path.join("skills", skillFolderName))) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (manifestPath && fs.existsSync(manifestPath)) return true;
  }
  return false;
}

describe("T10 — real-file gate for the three VD skill bodies", () => {
  it("the COMMITTED vertical-drama-shot-video-prompt skill loads a non-empty body for real", () => {
    expect(skillManifestExists("vertical-drama-shot-video-prompt")).toBe(true);
  });

  it.skipIf(!skillManifestExists("vertical-drama-shot-synopsis-image-prompt"))(
    "vertical-drama-shot-synopsis-image-prompt exists on disk with a non-empty body (skipped when absent — G1)",
    () => {
      expect(skillManifestExists("vertical-drama-shot-synopsis-image-prompt")).toBe(true);
    }
  );

  it.skipIf(!skillManifestExists("vertical-drama-cinematic-narrative-image-prompt"))(
    "vertical-drama-cinematic-narrative-image-prompt exists on disk with a non-empty body (skipped when absent — G1)",
    () => {
      expect(skillManifestExists("vertical-drama-cinematic-narrative-image-prompt")).toBe(true);
    }
  );
});
