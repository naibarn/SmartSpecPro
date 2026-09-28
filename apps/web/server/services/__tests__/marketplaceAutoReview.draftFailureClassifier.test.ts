/**
 * `classifySequentialStoryboardDraftFailureReason` (2026-07-24 field
 * follow-up, run mar_76cb03fe0f29a20ec6422480f5a6840b): every sequential-
 * storyboard authoring round failing structurally used to fabricate a
 * 9-shot deterministic pack (`buildDegradedSequentialStoryboardPack`, now
 * deleted) purely so the run could still hold at plan review — dialogue-less
 * fake shots with no clue why authoring actually failed. This classifier
 * reduces the bounded `degradedRetryHistory` array
 * `runSequentialPromptPlanStage`'s `SequentialStoryboardStructuralError`
 * catch already records into ONE safe, client-facing `reasonCode` — see
 * marketplaceAutoReview.sequentialEvidencePersistence.test.ts for the
 * end-to-end wiring proof (no fabricated shots, `draftFailure` persisted)
 * and marketplaceAutoReview.planReviewGate.test.ts for the approve-time
 * content-gate proof (a failed/degraded draft can never approve into image
 * credits).
 *
 * Pure function — no db, no LLM. `../../db` is still mocked before the
 * import, matching this service's own convention for every test file that
 * imports from `marketplaceAutoReviewService` (see
 * marketplaceAutoReview.minorSafetyGrounding.test.ts's own header comment).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import { classifySequentialStoryboardDraftFailureReason } from "../marketplaceAutoReviewService";

describe("classifySequentialStoryboardDraftFailureReason — empty/unremarkable history", () => {
  it('returns "unknown" for an empty history array', () => {
    expect(classifySequentialStoryboardDraftFailureReason([])).toBe("unknown");
  });

  it('returns "unknown" for null/undefined history (never throws on malformed input)', () => {
    expect(
      classifySequentialStoryboardDraftFailureReason(null as any)
    ).toBe("unknown");
    expect(
      classifySequentialStoryboardDraftFailureReason(undefined as any)
    ).toBe("unknown");
  });

  it('returns "unknown" when every entry is a generic invocation failure with no attributable phrase', () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 1, status: "invocation_failed", error: "socket hang up" },
        { round: 2, status: "invocation_failed", error: "network error, please retry" },
        { round: 3, status: "invocation_failed", error: "unexpected upstream 500" },
      ])
    ).toBe("unknown");
  });
});

describe("classifySequentialStoryboardDraftFailureReason — vision_capability branch", () => {
  it("matches the confirmed OpenRouter capability string on a single entry", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "invocation_failed",
          error: "No endpoints found that support image input",
        },
      ])
    ).toBe("vision_capability");
  });

  it("matches when the phrase is wrapped in a caller-added prefix (reuses isDefinitiveVisionCapabilityError unmodified)", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 2,
          status: "invocation_failed",
          error:
            "product-review-sequential-storyboard LLM call failed: No endpoints found that support image input",
        },
      ])
    ).toBe("vision_capability");
  });

  it("does NOT classify a transient/ambiguous error as vision_capability even if it happens to mention the phrase (reused exclusion logic, never re-derived)", () => {
    // isDefinitiveVisionCapabilityError's own AMBIGUOUS_OR_TRANSIENT exclusion
    // fires on "rate limit" here, so this must fall through to "unknown" —
    // proving the classifier reuses the real function rather than a re-typed
    // regex that would incorrectly call this definitive.
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "invocation_failed",
          error:
            "Rate limited (429) — No endpoints found that support image input, please try again",
        },
      ])
    ).toBe("unknown");
  });
});

describe("classifySequentialStoryboardDraftFailureReason — provider_credit branch", () => {
  it.each([
    "This account can only afford tier-1 models right now",
    "insufficient credit to complete this request",
    "insufficient balance on this OpenRouter account",
    "insufficient fund for this call",
    "insufficient quota remaining",
    "requires more credits than are available",
    "quota exceeded for this billing period",
    "balance too low to route this request",
  ])('classifies "%s" as provider_credit', errorText => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 1, status: "invocation_failed", error: errorText },
      ])
    ).toBe("provider_credit");
  });
});

describe("classifySequentialStoryboardDraftFailureReason — model_bad_output branch", () => {
  it('classifies a "contract_violation" status entry', () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "contract_violation",
          reasons: ["shots_missing", "final_qc_missing"],
        },
      ])
    ).toBe("model_bad_output");
  });

  it('classifies a literal "disqualified" status entry (pinned contract vocabulary)', () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 2, status: "disqualified", error: "retention disqualifiers tripped" },
      ])
    ).toBe("model_bad_output");
  });

  it('classifies the REAL runtime shape of a disqualified-but-completed round (status: "completed" + non-empty disqualifiers[])', () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 3,
          status: "completed",
          valid: false,
          total: 40,
          normalized: 55.5,
          disqualifiers: ["dialogue_missing", "prompt_over_budget"],
        },
      ])
    ).toBe("model_bad_output");
  });

  it("does NOT classify a completed-and-valid round (empty disqualifiers) as model_bad_output", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "completed",
          valid: true,
          total: 90,
          normalized: 92,
        },
      ])
    ).toBe("unknown");
  });

  it.each([
    "final_qc_missing",
    "loop_report_missing",
    "the model violated the contract",
    "schema validation failed",
    "invalid json returned",
    "invalid enum value for demonstration_type",
  ])('classifies error text "%s" via the model_bad_output regex', errorText => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 1, status: "invocation_failed", error: errorText },
      ])
    ).toBe("model_bad_output");
  });
});

describe("classifySequentialStoryboardDraftFailureReason — precedence (first match wins, scans every entry)", () => {
  it("vision beats credit when both phrases co-occur in the SAME entry", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "invocation_failed",
          error:
            "No endpoints found that support image input — and this account can only afford tier-1 models",
        },
      ])
    ).toBe("vision_capability");
  });

  it("vision beats credit when the two signals are in DIFFERENT entries (scans the whole history, not just the first match)", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        {
          round: 1,
          status: "invocation_failed",
          error: "insufficient credit to complete this request",
        },
        {
          round: 2,
          status: "invocation_failed",
          error: "No endpoints found that support image input",
        },
      ])
    ).toBe("vision_capability");
  });

  it("credit beats model_bad_output when both are present across different entries", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 1, status: "contract_violation", reasons: ["final_qc_missing"] },
        {
          round: 2,
          status: "invocation_failed",
          error: "requires more credits than are available",
        },
      ])
    ).toBe("provider_credit");
  });

  it("falls through to model_bad_output only when neither vision nor credit matched anywhere in the history", () => {
    expect(
      classifySequentialStoryboardDraftFailureReason([
        { round: 1, status: "invocation_failed", error: "socket hang up" },
        { round: 2, status: "contract_violation", reasons: ["loop_report_missing"] },
        {
          round: 3,
          status: "completed",
          valid: false,
          disqualifiers: ["shot_count_invalid"],
        },
      ])
    ).toBe("model_bad_output");
  });
});
