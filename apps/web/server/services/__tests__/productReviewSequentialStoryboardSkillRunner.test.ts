/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 04 §4 test suite (T1-T10) for
 * `productReviewSequentialStoryboardSkillRunner.ts`.
 *
 * Mocks ONLY the registry pair (`syncSingleSkillIfChanged`, `getSkillByIdAsync`)
 * via `vi.mock` on `../skillRegistry` — no real LLM calls. Every round
 * invocation, persistence, resume, and optimizer call is exercised through
 * the INJECTED `effects` seam (spec §5.5), so `skillExecutionPolicy`,
 * `llmRouter`, `agentRuntime/skillRuntimeOrchestrator`, and `creditService`
 * are never reached by any test here (those only run inside the untested
 * PRODUCTION default effects, which no test path here exercises because
 * every test that gets past the schema-audit gate supplies its own
 * `invokeSkillRound`/`optimizeFinalPrompt`).
 *
 * `schemas/input.schema.json` is read for REAL from disk (section 03's
 * committed bundle) — no schema mock, matching the repo's real-file skill
 * test convention.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn(),
  getSkillByIdAsync: vi.fn(),
}));

import { syncSingleSkillIfChanged, getSkillByIdAsync } from "../skillRegistry";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
  SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER,
  resolveSequentialImagePromptBudget,
  detectSequentialPromptPriceClaims,
  estimateSequentialStoryboardSpeechSeconds,
  buildSequentialStoryboardRuntimeContract,
  validateSequentialStoryboardPackPreflight,
  validateSequentialStoryboardPackStructure,
  findSequentialStoryboardRetentionDisqualifiers,
  runProductReviewSequentialStoryboardSkillLoop,
  finalizeSequentialStoryboardPackBudgetsForTest,
  composeSequentialStoryboardSystemPromptBaseForTest,
  SequentialStoryboardStructuralError,
  type SequentialStoryboardSkillLoopInput,
  type SequentialStoryboardPack,
  type SequentialStoryboardShot,
  type ChildSubjectPolicyInput,
  type SequentialReferenceManifestEntry,
  type SequentialStoryboardLoopEffects,
  type PersistedLoopState,
  type LoopRoundReport,
} from "../productReviewSequentialStoryboardSkillRunner";

const mockSyncSingleSkillIfChanged = vi.mocked(syncSingleSkillIfChanged);
const mockGetSkillByIdAsync = vi.mocked(getSkillByIdAsync);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function makeMockSkill(configOverrides?: Record<string, unknown>): any {
  return {
    id: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
    name: "product-review-sequential-storyboard",
    systemPrompt: "You are the sequential storyboard skill.",
    skillContent: "You are the sequential storyboard skill.",
    config: {
      media_studio: {
        marketplace_auto_review_sequential_storyboard: {
          enabled: true,
          loop_rounds: 3,
          candidate_count: 3,
          min_prompt_score_to_pass: 88,
          ...configOverrides,
        },
      },
    },
  };
}

function makeManifest(): SequentialReferenceManifestEntry[] {
  return [
    { index: 1, role: "primary_product", angleLabel: "front", url: "https://example.com/1.jpg" },
    { index: 2, role: "product_angle", angleLabel: "back", url: "https://example.com/2.jpg" },
    { index: 3, role: "character", url: "https://example.com/3.jpg" },
  ];
}

function makeChildSubjectPolicy(active: boolean): ChildSubjectPolicyInput {
  return {
    productChildRelated: active,
    childDepictionPlanned: active,
    guardianReferenceIndex: active ? 3 : null,
  };
}

function makeLoopInput(
  overrides?: Partial<SequentialStoryboardSkillLoopInput>
): SequentialStoryboardSkillLoopInput {
  return {
    tenantId: "tenant-1",
    userId: 42,
    runId: "run-1",
    productName: "Test Chair",
    productDescription: "A test product description",
    productSpecs: "specs text",
    referenceManifest: makeManifest(),
    skillVisionUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    childSubjectPolicy: makeChildSubjectPolicy(false),
    ...overrides,
  };
}

function makeCleanVideoPrompt(): string {
  return (
    `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} and @Image3 as the character identity ` +
    "reference when supplied. Keep the exact same product identity and character " +
    "identity consistent in every shot. Use the additional product angle references " +
    "only to keep the product accurate from every camera direction; never let them " +
    "override @Image1. Style: photorealistic commercial short-form review video, " +
    "9:16 vertical, soft daylight, realistic motion, realistic hands, stable product " +
    "structure, clean background, no visible text overlays, no logo, no price " +
    "mention. Dialogue style: natural Thai product-review tone, concise, " +
    "trustworthy, family-friendly. Audio: clear Thai voiceover, natural room " +
    "ambience, only product-relevant foley."
  );
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
    visual_summary: "shows the product in use",
    dialogue: "ใช้งานง่าย",
    estimated_speech_seconds: 1,
    start_frame_image_prompt: `Shot ${shotId}: @Image1 is the primary product identity reference, @Image2 is a supporting back-angle reference. Show the product in a clean setting. 9:16, photorealistic, no text.`,
    image_prompt_character_count: 0,
    video_prompt: makeCleanVideoPrompt(),
    video_prompt_character_count: 0,
    claim_trace: [{ text: "the product is easy to use", support: "visual_verified" }],
    qc: { evidence_accuracy: 9, continuity: 9, compliance: 9, length_valid: true, status: "pass" },
  };
}

function makeCleanPack(
  overrides?: Partial<SequentialStoryboardPack>,
  shotOverrides?: Partial<SequentialStoryboardShot>
): SequentialStoryboardPack {
  const shots = Array.from({ length: 9 }, (_, i) => ({
    ...makeCleanShot(i + 1),
    ...shotOverrides,
    shot_id: i + 1,
  }));
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

function makeRoundScores(overrides?: Partial<Record<string, number>>): Record<string, number> {
  return {
    evidence_accuracy: 8,
    product_consistency: 8,
    narrative_quality: 8,
    dialogue_continuity: 8,
    visual_feasibility: 8,
    compliance_safety: 8,
    prompt_completeness: 8,
    length_compliance: 8,
    ...overrides,
  };
}

/** Pack + round-1 scores bundled, matching what a real skill invocation returns
 *  (the pack's own `loopReport.round_N` carries the scores). */
function makeRoundOutput(
  round: 1 | 2 | 3,
  scoreOverrides?: Partial<Record<string, number>>,
  packOverrides?: Partial<SequentialStoryboardPack>,
  candidates?: unknown[]
): SequentialStoryboardPack {
  const pack = makeCleanPack(packOverrides);
  const roundKey = `round_${round}` as const;
  (pack.loopReport as any)[roundKey] = {
    ...makeRoundScores(scoreOverrides),
    ...(candidates ? { candidates } : {}),
  };
  return pack;
}

function makeNoopEffects(
  overrides?: Partial<SequentialStoryboardLoopEffects>
): SequentialStoryboardLoopEffects {
  return {
    invokeSkillRound: vi.fn(async () => makeRoundOutput(1)),
    persistRoundReport: vi.fn(async () => {}),
    loadPersistedLoopState: vi.fn(async () => null),
    optimizeFinalPrompt: vi.fn(async ({ prompt }) => ({ prompt, audit: null })),
    emitAudit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSyncSingleSkillIfChanged.mockResolvedValue({ synced: true });
  mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill());
});

/* -------------------------------------------------------------------------- */
/* T1 — sync/load guards                                                      */
/* -------------------------------------------------------------------------- */

describe("T1 — sync/load guards", () => {
  it("throws containing the skill id when syncSingleSkillIfChanged errors", async () => {
    mockSyncSingleSkillIfChanged.mockResolvedValue({ synced: false, error: "boom" });
    await expect(
      runProductReviewSequentialStoryboardSkillLoop(makeLoopInput())
    ).rejects.toThrow(new RegExp(PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID));
  });

  it('throws "not found or not enabled" when getSkillByIdAsync returns null', async () => {
    mockGetSkillByIdAsync.mockResolvedValue(undefined as any);
    await expect(
      runProductReviewSequentialStoryboardSkillLoop(makeLoopInput())
    ).rejects.toThrow(/not found or not enabled/);
  });
});

/* -------------------------------------------------------------------------- */
/* T2 — input-schema audit hard-fails before spend                            */
/* -------------------------------------------------------------------------- */

describe("T2 — input-schema audit hard-fails before spend", () => {
  it("throws on a failed audit and never calls the injected effects", async () => {
    const invokeSkillRound = vi.fn(async () => makeRoundOutput(1));
    const optimizeFinalPrompt = vi.fn(async ({ prompt }: any) => ({ prompt, audit: null }));
    const persistRoundReport = vi.fn(async () => {});

    // Missing `productDescription` fails the schema's required-field check.
    const badInput = makeLoopInput({ productDescription: "" });

    await expect(
      runProductReviewSequentialStoryboardSkillLoop(badInput, {
        invokeSkillRound,
        optimizeFinalPrompt,
        persistRoundReport,
      })
    ).rejects.toThrow(/input schema validation failed/);

    expect(invokeSkillRound).not.toHaveBeenCalled();
    expect(optimizeFinalPrompt).not.toHaveBeenCalled();
    expect(persistRoundReport).not.toHaveBeenCalled();
  });

  it("passes audit and reaches invokeSkillRound with a complete input", async () => {
    const invokeSkillRound = vi.fn(async () => makeRoundOutput(1));
    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({ invokeSkillRound })
    );
    expect(invokeSkillRound).toHaveBeenCalled();
    expect(result.pack).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* T3 — runtime contract completeness                                         */
/* -------------------------------------------------------------------------- */

describe("T3 — runtime contract completeness", () => {
  it("contains every mandated fact and the motion-direction dual-injection instruction", () => {
    const contract = buildSequentialStoryboardRuntimeContract({
      imageBudget: 3500,
      referenceManifest: [
        { index: 1, role: "primary_product", angleLabel: "front", url: "u1" },
        { index: 2, role: "product_angle", angleLabel: "package", url: "u2", evidenceOnly: true },
      ],
      productTruthText: "PRODUCT TRUTH: test chair, mesh back.",
      blockedClaims: ["ป้องกันสายตาเสีย"],
      forbiddenClaims: ["ราคาถูกที่สุด"],
      confirmedAttributes: { color: "grey" },
      childSubjectPolicy: makeChildSubjectPolicy(true),
      targetAudience: "office workers",
      userRequirements: "highlight the lever",
      audioStrategy: "native_video_audio",
      reviewTone: "friendly",
      videoStructureMode: "per_shot",
      motionDirection: "slow push-in",
      creativePresetSelections: [{ presetId: "warm_friendly", family: "tone_preset" }] as any,
      videoModel: "veo-3",
    });

    expect(contract).toContain("3500");
    expect(contract).toContain(String(PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS));
    expect(contract).toContain("shot_count: 9");
    expect(contract).toContain("max_shot_duration_seconds: 10");
    expect(contract).toContain("@Image1 = role: primary_product, angleLabel: front");
    expect(contract).toContain("@Image2 = role: product_angle, angleLabel: package");
    expect(contract).toContain("evidenceOnly");
    expect(contract).toContain("PRODUCT TRUTH: test chair, mesh back.");
    expect(contract).toContain("ป้องกันสายตาเสีย");
    expect(contract).toContain("ราคาถูกที่สุด");
    expect(contract).toContain("grey");
    expect(contract).toContain("productChildRelated");
    expect(contract).toContain("slow push-in");
    // Dual-injection: both phrases must be present.
    expect(contract).toContain("shape the nine-shot story plan");
    expect(contract).toContain("every submitted video prompt's action/camera language");
  });
});

/* -------------------------------------------------------------------------- */
/* T3b — category rule injection (Feature 136 section 05, G7 fix)             */
/* -------------------------------------------------------------------------- */

describe("T3b — composeSequentialStoryboardSystemPromptBase (G7 category rule injection)", () => {
  it("appends the shared furniture category rule file when productCategory is supplied", () => {
    const result = composeSequentialStoryboardSystemPromptBaseForTest({
      skill: makeMockSkill(),
      runtimeContract: "RUNTIME CONTRACT TEXT",
      productCategory: "furniture",
    });
    expect(result.categoryRuleAudit.status).toBe("appended");
    expect(result.categoryRuleAudit.category).toBe("furniture");
    expect(result.systemPromptBase).toContain("You are the sequential storyboard skill.");
    expect(result.systemPromptBase).toContain("RUNTIME CONTRACT TEXT");
    expect(result.systemPromptBase).toContain("Category id: `furniture`");
  });

  it("is a no-op (missing_category) when productCategory is absent or auto", () => {
    const absent = composeSequentialStoryboardSystemPromptBaseForTest({
      skill: makeMockSkill(),
      runtimeContract: "RUNTIME CONTRACT TEXT",
    });
    expect(absent.categoryRuleAudit.status).toBe("missing_category");
    expect(absent.systemPromptBase).toBe(
      "You are the sequential storyboard skill.\n\nRUNTIME CONTRACT TEXT"
    );

    const auto = composeSequentialStoryboardSystemPromptBaseForTest({
      skill: makeMockSkill(),
      runtimeContract: "RUNTIME CONTRACT TEXT",
      productCategory: "auto",
    });
    expect(auto.categoryRuleAudit.status).toBe("missing_category");
  });
});

/* -------------------------------------------------------------------------- */
/* T4 — loop bounds + per-round persistence + resume                          */
/* -------------------------------------------------------------------------- */

describe("T4 — loop bounds, per-round persistence ordering, and resume", () => {
  it("invokes at most 3 rounds and persists round N before invoking round N+1", async () => {
    const callLog: string[] = [];
    const invokeSkillRound = vi.fn(async (args: { round: 1 | 2 | 3 }) => {
      callLog.push(`invoke:${args.round}`);
      // Scores stay below min_prompt_score_to_pass (88) so all 3 rounds run.
      return makeRoundOutput(args.round, makeRoundScores({ evidence_accuracy: 6 }));
    });
    const persistRoundReport = vi.fn(async (round: number) => {
      callLog.push(`persist:${round}`);
    });

    await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({ invokeSkillRound, persistRoundReport })
    );

    expect(invokeSkillRound).toHaveBeenCalledTimes(3);
    expect(callLog).toEqual([
      "invoke:1",
      "persist:1",
      "invoke:2",
      "persist:2",
      "invoke:3",
      "persist:3",
    ]);
  });

  it("resumes at round 3 when rounds 1-2 are already persisted", async () => {
    const invokeSkillRound = vi.fn(async (args: { round: 1 | 2 | 3 }) =>
      makeRoundOutput(args.round, makeRoundScores({ evidence_accuracy: 6 }))
    );
    const persisted: PersistedLoopState = {
      roundsCompleted: 2,
      retained: makeCleanPack(),
      retainedScoreTotal: 60,
      selectedVersion: "round_1",
      loopReport: {
        round_1: { round: 1, ...makeRoundScores(), totalScore: 60, normalizedScore: 75, valid: true, disqualifiers: [], retained: true } as LoopRoundReport,
      },
      retryHistory: [],
    };

    await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({
        invokeSkillRound,
        loadPersistedLoopState: vi.fn(async () => persisted),
      })
    );

    expect(invokeSkillRound).toHaveBeenCalledTimes(1);
    expect(invokeSkillRound).toHaveBeenCalledWith(
      expect.objectContaining({ round: 3 })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T5 — best-version retention                                                */
/* -------------------------------------------------------------------------- */

describe("T5 — best-version retention", () => {
  it("retains round 1 when round 2 scores lower", async () => {
    // Cap loop_rounds at 2 explicitly, so this fixture only ever needs to
    // supply two round outputs — deterministic and independent of the
    // config-default (3) used elsewhere in this file.
    mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill({ loop_rounds: 2 }));
    const round1Pack = makeRoundOutput(1, makeRoundScores({ evidence_accuracy: 10 }), {
      reviewStrategy: { marker: "round-1" },
    });
    const round2Pack = makeRoundOutput(2, makeRoundScores({ evidence_accuracy: 2 }), {
      reviewStrategy: { marker: "round-2" },
    });
    const invokeSkillRound = vi
      .fn()
      .mockResolvedValueOnce(round1Pack)
      .mockResolvedValueOnce(round2Pack);

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({
        invokeSkillRound,
        loadPersistedLoopState: vi.fn(async () => null),
      })
    );
    expect(invokeSkillRound).toHaveBeenCalledTimes(2);
    expect((result.pack.reviewStrategy as any).marker).toBe("round-1");
    expect(result.selectedVersion).toBe("round_1");
  });

  it("disqualifies a higher-scoring round that trips a deterministic disqualifier", async () => {
    mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill({ loop_rounds: 2 }));
    const round1Pack = makeRoundOutput(1, makeRoundScores({ evidence_accuracy: 5 }), {
      reviewStrategy: { marker: "round-1" },
    });
    // Round 2 scores HIGHER but is missing the global block marker on every
    // video prompt — a deterministic disqualifier.
    const round2Pack = makeRoundOutput(
      2,
      makeRoundScores({ evidence_accuracy: 10 }),
      { reviewStrategy: { marker: "round-2" } },
      undefined
    );
    round2Pack.shots = round2Pack.shots.map(shot => ({
      ...shot,
      video_prompt: "A video prompt missing the mandatory marker.",
    }));
    const invokeSkillRound = vi
      .fn()
      .mockResolvedValueOnce(round1Pack)
      .mockResolvedValueOnce(round2Pack);

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({ invokeSkillRound })
    );

    expect((result.pack.reviewStrategy as any).marker).toBe("round-1");
    expect(result.selectedVersion).toBe("round_1");
  });
});

describe("T5b — findSequentialStoryboardRetentionDisqualifiers (pure fixture)", () => {
  it("returns no disqualifiers for a clean pack", () => {
    const pack = makeCleanPack();
    expect(
      findSequentialStoryboardRetentionDisqualifiers(pack, {
        imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      })
    ).toEqual([]);
  });

  it("flags shot_count_invalid for an 8-shot pack", () => {
    const pack = makeCleanPack();
    pack.shots = pack.shots.slice(0, 8);
    expect(
      findSequentialStoryboardRetentionDisqualifiers(pack, {
        imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      })
    ).toContain("shot_count_invalid");
  });
});

/* -------------------------------------------------------------------------- */
/* T6 — candidates capped at candidate_count                                  */
/* -------------------------------------------------------------------------- */

describe("T6 — candidates recorded and capped at candidate_count", () => {
  it("caps a 5-candidate round-1 output at the skill's candidate_count (3)", async () => {
    mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill({ candidate_count: 3, loop_rounds: 1 }));
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      candidate_id: `c${i + 1}`,
      scores: makeRoundScores(),
      selection_rationale: `candidate ${i + 1}`,
    }));
    const invokeSkillRound = vi.fn(async () =>
      makeRoundOutput(1, makeRoundScores({ evidence_accuracy: 10 }), undefined, candidates)
    );

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({ invokeSkillRound })
    );

    expect(result.loopReport.round_1?.candidates).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* T7 — bare-answer rejection                                                 */
/* -------------------------------------------------------------------------- */

describe("T7 — bare-answer / contract-violation rejection", () => {
  it("validateSequentialStoryboardPackStructure rejects a pack missing loopReport", () => {
    const pack = makeCleanPack();
    const raw: any = { ...pack };
    delete raw.loopReport;
    const result = validateSequentialStoryboardPackStructure(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("loop_report_missing");
  });

  it("validateSequentialStoryboardPackStructure rejects a non-passing finalQc", () => {
    const pack = makeCleanPack({ finalQc: { ...makeCleanPack().finalQc, price_absent: false } });
    const result = validateSequentialStoryboardPackStructure(pack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("final_qc_not_passing");
  });

  it("the loop treats a bare answer as a failed attempt, not a silent accept", async () => {
    const bareAnswer = { shots: [], loopReport: {} }; // no finalQc at all
    const validPack = makeRoundOutput(2, makeRoundScores());
    const invokeSkillRound = vi
      .fn()
      .mockResolvedValueOnce(bareAnswer)
      .mockResolvedValueOnce(validPack);

    const result = await runProductReviewSequentialStoryboardSkillLoop(
      makeLoopInput(),
      makeNoopEffects({ invokeSkillRound })
    );

    expect(result.selectedVersion).toBe("round_2");
  });
});

/* -------------------------------------------------------------------------- */
/* T8 — deterministic preflight blockers                                      */
/* -------------------------------------------------------------------------- */

describe("T8 — deterministic preflight blockers (one fixture per blocker)", () => {
  const baseArgs = () => ({
    imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
    manifest: makeManifest(),
    childSubjectPolicy: makeChildSubjectPolicy(false),
    assemblyDocumented: false,
  });

  it("clean fixture -> zero blockers", () => {
    const result = validateSequentialStoryboardPackPreflight({
      pack: makeCleanPack(),
      ...baseArgs(),
    });
    expect(result.blockers).toEqual([]);
  });

  it("sequential_prompt_set_incomplete: 8 shots", () => {
    const pack = makeCleanPack();
    pack.shots = pack.shots.slice(0, 8);
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("sequential_prompt_set_incomplete");
  });

  it("sequential_prompt_set_incomplete: missing one video prompt", () => {
    const pack = makeCleanPack();
    pack.shots[3] = { ...pack.shots[3], video_prompt: "" };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("sequential_prompt_set_incomplete");
    expect(result.perShot[4]).toContain("sequential_prompt_set_incomplete");
  });

  it("sequential_prompt_set_incomplete: absent product_reference_model_conflict key", () => {
    const pack = makeCleanPack();
    delete (pack.evidenceProfile as any).product_reference_model_conflict;
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("sequential_prompt_set_incomplete");
  });

  it("prompt_too_long_for_image_provider: over min(4000, providerCap) with a binding provider cap", () => {
    const pack = makeCleanPack();
    pack.shots[0] = {
      ...pack.shots[0],
      start_frame_image_prompt: "x".repeat(3500),
    };
    const result = validateSequentialStoryboardPackPreflight({
      pack,
      ...baseArgs(),
      imageBudget: 3000, // simulates min(4000, providerCap=3000)
    });
    expect(result.blockers).toContain("prompt_too_long_for_image_provider");
  });

  it("prompt_too_long_for_video_provider: 2001 chars", () => {
    const pack = makeCleanPack();
    pack.shots[0] = {
      ...pack.shots[0],
      video_prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} ${"x".repeat(2001)}`,
    };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("prompt_too_long_for_video_provider");
  });

  it("video_global_block_missing", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], video_prompt: "A video prompt with no marker at all." };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("video_global_block_missing");
  });

  it("guardian_directive_missing: childSubjectPolicy active + depicts_minor shot without guardian content", () => {
    const pack = makeCleanPack();
    pack.shots[0] = {
      ...pack.shots[0],
      depicts_minor: true,
      start_frame_image_prompt: "Shot 1: child using the product, no other people visible.",
      video_prompt: makeCleanVideoPrompt(),
    };
    const result = validateSequentialStoryboardPackPreflight({
      pack,
      ...baseArgs(),
      childSubjectPolicy: makeChildSubjectPolicy(true),
    });
    expect(result.blockers).toContain("guardian_directive_missing");
  });

  it("assembly_demo_unverified: assembly-staging prompt while assembly_documented is false", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], demonstration_type: "assembly_demo" };
    const result = validateSequentialStoryboardPackPreflight({
      pack,
      ...baseArgs(),
      assemblyDocumented: false,
    });
    expect(result.blockers).toContain("assembly_demo_unverified");
  });

  it("price_claim_detected: Thai pattern (ราคาถูกที่สุด)", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], dialogue: "สินค้านี้ราคาถูกที่สุดในตลาด" };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("price_claim_detected");
  });

  it('price_claim_detected: Thai pattern ("ลด 50%")', () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], dialogue: "วันนี้ลด 50% เท่านั้น" };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("price_claim_detected");
  });

  it("price_claim_detected: numeric ฿199 case", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], dialogue: "เพียง ฿199 เท่านั้น" };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("price_claim_detected");
  });

  it("shot_duration_exceeds_max: over 10 seconds", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], duration_seconds: 11 };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("shot_duration_exceeds_max");
  });

  it("shot_duration_exceeds_max: under 3 seconds", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], duration_seconds: 2 };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("shot_duration_exceeds_max");
  });

  it("dialogue_exceeds_shot_duration: speech estimate exceeds duration", () => {
    const pack = makeCleanPack();
    const longThaiDialogue = "สวัสดีครับวันนี้ผมจะมารีวิวสินค้าชิ้นนี้ให้ทุกคนได้ฟังกันอย่างละเอียดที่สุดเท่าที่จะทำได้".repeat(3);
    pack.shots[0] = { ...pack.shots[0], duration_seconds: 3, dialogue: longThaiDialogue };
    expect(estimateSequentialStoryboardSpeechSeconds(longThaiDialogue)).toBeGreaterThan(3);
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("dialogue_exceeds_shot_duration");
  });

  it("mapping mismatch: contradictory @ImageN role claim vs manifest", () => {
    // Explicit "@ImageN = <role text>" binding (the validator's Pattern 1 —
    // see `shared/marketplaceCapture/referenceIndexMap.ts`); manifest index 3
    // is "character", so claiming it as a product angle is a provable
    // self-contradiction (lenient-on-silence otherwise).
    const pack = makeCleanPack();
    pack.shots[0] = {
      ...pack.shots[0],
      start_frame_image_prompt: "@Image3 = product back angle.",
    };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("reference_index_mapping_mismatch");
  });

  it("product_reference_model_conflict: skill Phase A conflict signal", () => {
    const pack = makeCleanPack();
    pack.evidenceProfile.product_reference_model_conflict = {
      detected: true,
      conflicting_reference_indexes: [1, 2],
      detail: "different shape and colorway",
    };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("product_reference_model_conflict");
  });

  it("minor_safety_clothing_lock_missing: depicts_minor without the marker", () => {
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], depicts_minor: true };
    const result = validateSequentialStoryboardPackPreflight({ pack, ...baseArgs() });
    expect(result.blockers).toContain("minor_safety_clothing_lock_missing");
  });
});

/* -------------------------------------------------------------------------- */
/* T9 — over-budget -> optimizer, revalidate, never slice                     */
/* -------------------------------------------------------------------------- */

describe("T9 — over-budget prompts route through the optimizer skill", () => {
  it("invokes the optimizer with prompt_kind sequential_image for an over-budget image prompt", async () => {
    const overBudgetImage = "x".repeat(5000);
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], start_frame_image_prompt: overBudgetImage };

    const optimizeFinalPrompt = vi.fn(async ({ promptKind }: any) => ({
      prompt: "short optimized prompt",
      audit: { reason: "final_image_prompt_over_provider_budget", promptKind },
    }));

    const result = await finalizeSequentialStoryboardPackBudgetsForTest({
      pack,
      imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      effects: makeNoopEffects({ optimizeFinalPrompt }),
    });

    expect(optimizeFinalPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ promptKind: "sequential_image" })
    );
    expect(result.pack.shots[0].start_frame_image_prompt).toBe("short optimized prompt");
  });

  it("invokes the optimizer with prompt_kind sequential_video for an over-budget video prompt", async () => {
    const overBudgetVideo = `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} ${"x".repeat(2500)}`;
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], video_prompt: overBudgetVideo };

    const optimizeFinalPrompt = vi.fn(async ({ promptKind }: any) => ({
      prompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER} short optimized video prompt`,
      audit: { reason: "final_video_prompt_over_provider_budget", promptKind },
    }));

    const result = await finalizeSequentialStoryboardPackBudgetsForTest({
      pack,
      imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      effects: makeNoopEffects({ optimizeFinalPrompt }),
    });

    expect(optimizeFinalPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ promptKind: "sequential_video" })
    );
    expect(result.pack.shots[0].video_prompt).toContain("short optimized video prompt");
  });

  it("bounds optimizer attempts and never silently truncates when still over budget", async () => {
    const overBudgetImage = "x".repeat(5000);
    const pack = makeCleanPack();
    pack.shots[0] = { ...pack.shots[0], start_frame_image_prompt: overBudgetImage };

    // Optimizer keeps returning an over-budget rewrite every attempt.
    const optimizeFinalPrompt = vi.fn(async () => ({
      prompt: "still way too long ".repeat(400),
      audit: { reason: "final_image_prompt_over_provider_budget" },
    }));

    const result = await finalizeSequentialStoryboardPackBudgetsForTest({
      pack,
      imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      effects: makeNoopEffects({ optimizeFinalPrompt }),
    });

    // Bounded (never runs away): exactly 3 attempts.
    expect(optimizeFinalPrompt).toHaveBeenCalledTimes(3);
    // Never mechanically shortened by this module — the returned prompt is
    // exactly whatever the (still-over-budget) optimizer last returned, not a
    // `.slice()`d version of it.
    const finalPrompt = result.pack.shots[0].start_frame_image_prompt;
    expect(finalPrompt).toBe("still way too long ".repeat(400));
    // The still-over-budget state surfaces as a hard blocker via preflight,
    // never a silent truncation.
    const preflight = validateSequentialStoryboardPackPreflight({
      pack: result.pack,
      imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
      manifest: makeManifest(),
      childSubjectPolicy: makeChildSubjectPolicy(false),
      assemblyDocumented: false,
    });
    expect(preflight.blockers).toContain("prompt_too_long_for_image_provider");
  });

  it("grep-guard: no .slice( targets a final prompt variable in the runner source", () => {
    const sourcePath = path.resolve(
      __dirname,
      "../productReviewSequentialStoryboardSkillRunner.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf-8");
    // Strip comment-only lines first (this file's own doc comments legitimately
    // discuss the `.slice(`-ban rule in prose) — the guard is about CODE call
    // sites, not documentation mentioning the rule.
    const codeLines = source
      .split("\n")
      .filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/**");
      });
    const offendingLines = codeLines.filter(
      line => line.includes(".slice(") && /prompt/i.test(line)
    );
    expect(offendingLines).toEqual([]);
    // Also assert the SVC-private `compactImagePromptText` helper is never
    // imported/called from this module (it is reserved for small internal
    // sub-blocks only, never final prompts — repo rule).
    expect(source).not.toContain("compactImagePromptText(");
  });
});

/* -------------------------------------------------------------------------- */
/* T10 — degraded fallback                                                    */
/* -------------------------------------------------------------------------- */

describe("T10 — degraded fallback (structural failure survives all bounded attempts)", () => {
  it("emits the degraded audit signal and throws a typed SequentialStoryboardStructuralError (never a bare/unhandled throw)", async () => {
    mockGetSkillByIdAsync.mockResolvedValue(makeMockSkill({ loop_rounds: 3 }));
    const invokeSkillRound = vi.fn(async () => {
      throw new Error("skill invocation failed");
    });
    const emitAudit = vi.fn();

    await expect(
      runProductReviewSequentialStoryboardSkillLoop(
        makeLoopInput(),
        makeNoopEffects({ invokeSkillRound, emitAudit })
      )
    ).rejects.toBeInstanceOf(SequentialStoryboardStructuralError);

    expect(invokeSkillRound).toHaveBeenCalledTimes(3);
    expect(emitAudit).toHaveBeenCalledWith(
      "sequential_prompt_degraded_fallback",
      expect.objectContaining({ retryHistory: expect.any(Array) })
    );
  });

  it("the thrown error carries the full retryHistory for the SVC integration layer", async () => {
    const invokeSkillRound = vi.fn(async () => ({ shots: [] })); // contract violation every round
    try {
      await runProductReviewSequentialStoryboardSkillLoop(
        makeLoopInput(),
        makeNoopEffects({ invokeSkillRound })
      );
      throw new Error("expected runProductReviewSequentialStoryboardSkillLoop to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(SequentialStoryboardStructuralError);
      expect((error as InstanceType<typeof SequentialStoryboardStructuralError>).retryHistory.length).toBe(3);
    }
  });
});

describe("T10b — SVC-side degraded-pack assembly helper (cross-import, never throws)", () => {
  it("buildDegradedSequentialStoryboardPackForTest never throws and produces 9 safety-locked prompts", async () => {
    vi.resetModules();
    vi.doMock("../../db", () => ({ getDb: vi.fn(async () => null) }));
    const { buildDegradedSequentialStoryboardPackForTest } = await import(
      "../marketplaceAutoReviewService"
    );

    const plan = {
      conceptId: "concept-1",
      title: "รีวิวสินค้า",
      productTruth: {
        productId: "mp_1",
        productName: "เก้าอี้เด็ก",
        brand: "TestBrand",
        platform: "shopee",
        externalProductId: "123",
        externalShopId: "seller-1",
        productCategory: "mother_baby",
        categoryText: "สินค้าเด็ก",
        categoryPath: ["เด็ก"],
        sourceUrl: "https://example.com/product",
        affiliateUrl: null,
        shopName: null,
        price: null,
        rating: null,
        sold: null,
        reviews: null,
        description: "",
        specs: {},
        imageUrls: ["https://example.com/product.png"],
      },
      storyboardGuide: "Shot-by-shot storyboard guide",
      voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
      productDetail: "PRODUCT FACTS LOCK: เก้าอี้เด็ก. Do not alter shape or material.",
      shots: [
        {
          id: "shot-1",
          order: 1,
          title: "เปิดปัญหา",
          startSeconds: 0,
          endSeconds: 8,
          durationSeconds: 8,
          storyboardGuide: "1. 0-8s เปิดปัญหา",
          voiceover: "สั้นมาก",
          camera: "slow push-in",
          visual: "เห็นเก้าอี้เด็ก",
          movement: "slow push-in",
          productRole: "context first",
        },
      ],
    } as any;

    let result: any;
    expect(() => {
      result = buildDegradedSequentialStoryboardPackForTest({
        plan,
        guardianRequired: true,
        assemblyDocumented: false,
      });
    }).not.toThrow();

    expect(result.degraded).toBe(true);
    expect(result.shots).toHaveLength(9);
    for (const shot of result.shots) {
      expect(shot.start_frame_image_prompt.length).toBeGreaterThan(0);
      expect(shot.video_prompt).toContain(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER);
    }
    expect(result.evidenceProfile.product_reference_model_conflict).toBeNull();
    vi.doUnmock("../../db");
  });
});
