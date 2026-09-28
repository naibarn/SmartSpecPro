/**
 * G10 fix — planning/fix-marketplace-preflight-lock-optimizer/plan.md
 *
 * Regression suite for the terminal failure observed on run
 * `mar_829542bbba1282b35fcda87d09d5db47`: the LLM final-prompt optimizer
 * compressed the literal `MINOR SAFETY CLOTHING LOCK` block away
 * (8352 -> 2894 chars), and the fail-closed image preflight — which matches
 * that header literally — killed the stage before any image was generated.
 *
 * The fix has three parts, all exercised here through exported `...ForTest`
 * helpers (no DB, pure fixtures — same convention as the sibling suites):
 *  1. reserve budget for the locks BEFORE calling the optimizer;
 *  2. a deterministic repair round that re-appends the locks AFTER it;
 *  3. soft-proceed for non-safety blockers so the run still reaches
 *     Storyboard Review, while safety blockers stay fail-closed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  ensureMinorSafetyClothingLockForPromptSignalForTest,
  ensureMinorSafetyClothingLockInImagePromptForTest,
  ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePromptForTest,
  finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest,
  marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest,
  optimizeMarketplaceAutoReviewSequentialFinalPromptForProviderForTest,
  sequentialEvidenceLockReserveCharsForTest,
  validateMarketplaceAutoReviewImagePromptPreflightForTest,
} from "../marketplaceAutoReviewService";

const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "เก้าอี้ฝึกทานอาหารสำหรับเด็ก",
    brand: null,
    platform: "shopee",
    externalProductId: "2162",
    externalShopId: "seller-1",
    productCategory: "mother_baby",
    categoryText: "แม่และเด็ก",
    categoryPath: ["แม่และเด็ก", "เก้าอี้เด็ก"],
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "เก้าอี้นั่งทานข้าวเด็ก พกพาง่าย",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail: "PRODUCT FACTS LOCK: เก้าอี้ทานข้าวเด็ก",
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
      visual: "โต๊ะอาหารในบ้าน",
      movement: "slow push-in",
      productRole: "context first",
    },
  ],
} as any;

/** Furniture plan — the minor-safety trigger family must NOT fire. */
const furniturePlan = {
  ...basePlan,
  productTruth: {
    ...basePlan.productTruth,
    productName: "โต๊ะวางของข้างเตียง",
    productCategory: "furniture",
    categoryText: "เฟอร์นิเจอร์",
    categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
    description: "โต๊ะข้างเตียงไม้",
  },
  productDetail: "PRODUCT FACTS LOCK: โต๊ะข้างเตียง",
} as any;

function sequentialUnit(overrides: Record<string, unknown> = {}): any {
  return {
    unitId: "sequential-shot-01",
    role: "sequential_shot_frame",
    shotId: "shot-1",
    shotOrder: 1,
    ...overrides,
  };
}

function enabledGuard(overrides: Record<string, unknown> = {}): any {
  return {
    enabled: true,
    productChildRelated: false,
    childDepictionPlanned: null,
    assemblyDocumented: false,
    blockedClaims: [] as string[],
    conflictExclusions: [] as string[],
    guardianReferenceIndex: null,
    ...overrides,
  };
}

/** Reproduces what the optimizer actually returned for the failed run:
 *  the safety idea survives as prose, but the literal header is gone. */
const OPTIMIZER_OUTPUT_WITHOUT_LOCK =
  "OUTPUT FORMAT LOCK, CINEMATIC REALISM LOCK, PRODUCT REFERENCE LOCK, TEXT RENDERING POLICY: No text, captions, labels, watermarks, UI elements. Use only the supplied product reference image as the primary visual source. If a child appears, they must wear age-appropriate clothing covering torso and underwear areas; no bare skin or suggestive poses.\n\nFrame 1: A dining area with a parent seating a toddler in the baby high chair, faces hidden.";

/* -------------------------------------------------------------------------- */
/* 1. The bug itself — proven, then proven fixed                              */
/* -------------------------------------------------------------------------- */

describe("G10 — optimizer output that lost the literal lock", () => {
  it("fails preflight before the fix is applied (the observed production failure)", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: OPTIMIZER_OUTPUT_WITHOUT_LOCK,
      unit: sequentialUnit(),
      plan: basePlan,
    });
    expect(result.status).toBe("failed");
    expect(result.blockers).toContain("minor_safety_clothing_lock_missing");
  });

  it("passes preflight after the deterministic relock round", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: OPTIMIZER_OUTPUT_WITHOUT_LOCK,
        plan: basePlan,
        unit: sequentialUnit(),
      });
    expect(finalized.prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(finalized.preflight.status).toBe("passed");
    expect(finalized.preflight.blockers).toEqual([]);
    expect(finalized.skillRuntime?.promptSafetyPatchApplied).toBe(true);
    expect(finalized.skillRuntime?.backendEnforcedSafetyLocks).toEqual([
      "minor_safety_clothing_lock",
    ]);
  });

  it("keeps the relocked prompt within the sequential provider budget", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: OPTIMIZER_OUTPUT_WITHOUT_LOCK,
        plan: basePlan,
        unit: sequentialUnit(),
        sequentialMaxChars: 4000,
      });
    expect(finalized.prompt.length).toBeLessThanOrEqual(4000);
    expect(finalized.preflight.status).toBe("passed");
  });

  it("is idempotent — a prompt that already carries the lock is left alone", () => {
    const alreadyLocked = `${OPTIMIZER_OUTPUT_WITHOUT_LOCK}\n\nMINOR SAFETY CLOTHING LOCK: If any baby, toddler, child, kid, or minor appears, they must be safely dressed.`;
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: alreadyLocked,
        plan: basePlan,
        unit: sequentialUnit(),
      });
    expect(
      finalized.prompt.match(/MINOR SAFETY CLOTHING LOCK/gi)?.length
    ).toBe(1);
    expect(finalized.skillRuntime?.promptSafetyPatchApplied).toBeUndefined();
  });

  it("does not inject the lock for a plan with no minor-safety signal", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt:
          "A bedside table beside a bed in warm light. No text, captions, labels, watermarks.",
        plan: furniturePlan,
        unit: sequentialUnit(),
      });
    expect(finalized.prompt).not.toContain("MINOR SAFETY CLOTHING LOCK");
    expect(finalized.preflight.status).toBe("passed");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Quality gate stays REAL for safety; soft-proceeds for the rest          */
/* -------------------------------------------------------------------------- */

describe("G10 — hard safety floor stays fail-closed", () => {
  it("throws when the lock cannot be repaired because the prompt is empty", () => {
    expect(() =>
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: "   ",
        plan: basePlan,
        unit: sequentialUnit(),
      })
    ).toThrowError(/preflight failed/i);
  });

  it("repairs a guardian gap when the budget allows (real gate, satisfied deterministically)", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: OPTIMIZER_OUTPUT_WITHOUT_LOCK,
        plan: basePlan,
        unit: sequentialUnit(),
        guard: enabledGuard({
          productChildRelated: true,
          childDepictionPlanned: true,
        }),
        sequentialMaxChars: 4000,
      });
    expect(finalized.prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(finalized.prompt).toContain("GUARDIAN PRESENCE LOCK:");
    expect(finalized.preflight.status).toBe("passed");
  });

  it("throws when the guardian directive cannot fit the remaining budget", () => {
    // Reachable state: a prompt already at the provider budget leaves no room
    // for the guardian directive, so the repair round cannot satisfy the rule.
    // The lock is already present, isolating guardian_directive_missing.
    const nearlyFullPrompt = `MINOR SAFETY CLOTHING LOCK: If any baby, toddler, child, kid, or minor appears, they must be safely dressed in age-appropriate clothing covering chest, torso, and underwear areas.\n\nA toddler seated in the baby high chair at a family dining table. ${"ภาพมื้ออาหารในบ้านอบอุ่น. ".repeat(
      40
    )}`;
    expect(() =>
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: nearlyFullPrompt,
        plan: basePlan,
        unit: sequentialUnit(),
        guard: enabledGuard({
          productChildRelated: true,
          childDepictionPlanned: true,
        }),
        sequentialMaxChars: nearlyFullPrompt.length + 10,
      })
    ).toThrowError(/guardian_directive_missing/);
  });

  it("throws on undocumented assembly staging content (evidence-guard floor)", () => {
    expect(() =>
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt:
          "A bedside table shown as an exploded view with screws and fasteners laid out. No text, captions, labels.",
        plan: furniturePlan,
        unit: sequentialUnit(),
        guard: enabledGuard({ assemblyDocumented: false }),
      })
    ).toThrowError(/assembly_demo_unverified/);
  });
});

describe("G10 — non-safety blockers soft-proceed to Storyboard Review", () => {
  /** `no_text` mode + a renderable camera-abbreviation label leak = a
   *  quality-class blocker (`detectProductReferenceStoryboardNoTextPromptLeaks`).
   *  It must NOT kill the run: images still generate, vision QA still
   *  repairs, and the human reviews the result in Storyboard Review. */
  const leakyPrompt =
    "A toddler seated in the baby high chair at a family dining table.\nRender a CU label in the top-left corner of the frame.";

  it("returns passed with the blocker demoted to a soft_blocker_* warning", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: leakyPrompt,
        plan: basePlan,
        unit: sequentialUnit(),
      });
    // Sanity: the raw preflight on the relocked prompt really did fail.
    const raw = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: finalized.prompt,
      unit: sequentialUnit(),
      plan: basePlan,
    });
    expect(raw.status).toBe("failed");
    expect(raw.blockers.length).toBeGreaterThan(0);
    expect(
      raw.blockers.some(code =>
        [
          "minor_safety_clothing_lock_missing",
          "guardian_directive_missing",
          "assembly_demo_unverified",
        ].includes(code)
      )
    ).toBe(false);

    expect(finalized.preflight.status).toBe("passed");
    expect(finalized.preflight.blockers).toEqual([]);
    expect(finalized.preflight.warnings).toContain(
      "prompt_preflight_soft_passed_after_repair"
    );
    for (const code of raw.blockers) {
      expect(finalized.preflight.warnings).toContain(`soft_blocker_${code}`);
    }
  });

  it("records the original blockers in the audit trail (evidence is never lost)", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: leakyPrompt,
        plan: basePlan,
        unit: sequentialUnit(),
      });
    const softPass = finalized.skillRuntime?.promptPreflightSoftPass as
      | { originalBlockers: string[]; relockApplied: boolean }
      | undefined;
    expect(softPass).toBeDefined();
    expect(softPass?.originalBlockers.length).toBeGreaterThan(0);
    expect(softPass?.relockApplied).toBe(true);
  });

  it("still carries the safety lock on the soft-passed prompt", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: leakyPrompt,
        plan: basePlan,
        unit: sequentialUnit(),
      });
    expect(finalized.prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
  });
});

/* -------------------------------------------------------------------------- */
/* 2b. Signal-driven lock — plan is neutral but the prompt shows a child      */
/* -------------------------------------------------------------------------- */

describe("G10 — minor-safety signal coming from the prompt, not the plan", () => {
  /** The preflight requires the lock when the plan is child-related OR the
   *  prompt itself carries a minor-safety signal. A plan-gated injector can
   *  only satisfy the first, so this case used to be an unrepairable
   *  blocker — the same dead-end class as the production failure. */
  const neutralPlanChildPrompt =
    "A toddler plays on the rug beside the bedside table while warm evening light fills the room.";

  it("the raw prompt fails preflight even though the plan is not child-related", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: neutralPlanChildPrompt,
      unit: sequentialUnit(),
      plan: furniturePlan,
    });
    expect(result.status).toBe("failed");
    expect(result.blockers).toContain("minor_safety_clothing_lock_missing");
  });

  it("the relock round injects the lock from the prompt signal and passes", () => {
    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: neutralPlanChildPrompt,
        plan: furniturePlan,
        unit: sequentialUnit(),
        sequentialMaxChars: 4000,
      });
    expect(finalized.prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(finalized.preflight.status).toBe("passed");
  });

  it("keeps the lock even when the budget cannot fit it (safety outranks budget)", () => {
    const locked = ensureMinorSafetyClothingLockForPromptSignalForTest({
      prompt: neutralPlanChildPrompt,
      plan: furniturePlan,
      maxChars: 120,
    });
    expect(locked).toContain("MINOR SAFETY CLOTHING LOCK:");
  });

  it("leaves a prompt with no minor signal untouched", () => {
    const untouched = ensureMinorSafetyClothingLockForPromptSignalForTest({
      prompt: "A bedside table beside a bed in warm evening light.",
      plan: furniturePlan,
    });
    expect(untouched).not.toContain("MINOR SAFETY CLOTHING LOCK");
  });

  it("does not fire on negated mentions (no child appears in this scene)", () => {
    const untouched = ensureMinorSafetyClothingLockForPromptSignalForTest({
      prompt:
        "A bedside table in an empty bedroom. No child appears in this scene.",
      plan: furniturePlan,
    });
    expect(untouched).not.toContain("MINOR SAFETY CLOTHING LOCK");
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Budget reservation — the relock must always fit                         */
/* -------------------------------------------------------------------------- */

describe("G10 — optimizer budget reservation", () => {
  it("reserves chars for a child-related plan and nothing for a neutral one", () => {
    const childReserve = sequentialEvidenceLockReserveCharsForTest({
      plan: basePlan,
    });
    const neutralReserve = sequentialEvidenceLockReserveCharsForTest({
      plan: furniturePlan,
    });
    expect(childReserve).toBeGreaterThan(300);
    expect(neutralReserve).toBe(0);
  });

  it("adds the guardian + demonstration directives to the reserve when the guard is active", () => {
    const withoutGuard = sequentialEvidenceLockReserveCharsForTest({
      plan: basePlan,
    });
    const withGuard = sequentialEvidenceLockReserveCharsForTest({
      plan: basePlan,
      guard: enabledGuard({
        productChildRelated: true,
        childDepictionPlanned: true,
      }),
    });
    expect(withGuard).toBeGreaterThan(withoutGuard);
  });

  it("subtracts the reserve from the optimizer budget, and is a no-op at zero reserve", () => {
    expect(marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest(4000, 0)).toBe(
      4000
    );
    expect(
      marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest(4000, 640)
    ).toBe(3360);
  });

  it("never collapses the optimizer target below the floor", () => {
    expect(
      marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest(4000, 3900)
    ).toBe(1500);
    // A budget already under the floor is passed through, never raised.
    expect(
      marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest(1200, 800)
    ).toBe(1200);
  });

  it("a prompt optimized to the reserved-down budget still fits after relocking", async () => {
    const reserve = sequentialEvidenceLockReserveCharsForTest({ plan: basePlan });
    const target = marketplaceAutoReviewOptimizerBudgetWithLockReserveForTest(
      4000,
      reserve
    );
    const optimizedBody = `${"ภาพเด็กนั่งเก้าอี้ทานข้าวอย่างปลอดภัย. ".repeat(200)}`.slice(
      0,
      target
    );
    const optimized =
      await optimizeMarketplaceAutoReviewSequentialFinalPromptForProviderForTest({
        tenantId: "t1",
        userId: 1,
        promptKind: "sequential_image",
        maxOutputChars: target,
        sourcePrompt: `${optimizedBody}${"เพิ่มความยาวเกินงบ ".repeat(200)}`,
        optimizer: (async () => ({
          value: { rawContent: optimizedBody, modelId: "m", providerName: "p" },
          preferredTargetChars: target,
          llmMaxTokens: 900,
          promptLengthPlan: null,
          execution: {
            runtime: {
              status: "legacy",
              selection: { engine: "legacy", mode: "legacy" },
              requestId: null,
              traceId: null,
            },
          },
        })) as any,
      });
    expect(optimized.prompt.length).toBeLessThanOrEqual(target);
    expect(optimized.audit?.maxOutputChars).toBe(target);

    const finalized =
      finalizeMarketplaceAutoReviewNonGridImagePromptAfterOptimizerForTest({
        optimizedPrompt: optimized.prompt,
        optimizerAudit: optimized.audit,
        plan: basePlan,
        unit: sequentialUnit(),
        sequentialMaxChars: 4000,
      });
    expect(finalized.prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(finalized.prompt.length).toBeLessThanOrEqual(4000);
    expect(finalized.preflight.status).toBe("passed");
    expect(finalized.skillRuntime?.finalPromptOptimizer).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Budget-aware lock appender (sequential cap, not the 3x3 cap)            */
/* -------------------------------------------------------------------------- */

describe("G10 — lock appender honors the caller's budget", () => {
  it("appends against the wider sequential budget where the 3x3 cap would refuse", () => {
    // 3,700 chars: adding the ~640-char lock exceeds the 3x3 cap (3800) but
    // fits the sequential cap (4000).
    const longPrompt = "ภาพเด็กนั่งเก้าอี้ทานข้าว. ".repeat(300).slice(0, 3700);
    const sequential =
      ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePromptForTest({
        prompt: longPrompt,
        plan: basePlan,
        maxChars: 4000,
      });
    expect(sequential).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(sequential.length).toBeLessThanOrEqual(4000);
  });

  it("defaults to the 3x3 cap for existing callers (byte-identical behavior)", () => {
    const shortPrompt = "ภาพเด็กนั่งเก้าอี้ทานข้าวในครัว";
    const withDefault = ensureMinorSafetyClothingLockInImagePromptForTest({
      prompt: shortPrompt,
      plan: basePlan,
    });
    expect(withDefault).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(withDefault.length).toBeLessThanOrEqual(3800);
  });
});
