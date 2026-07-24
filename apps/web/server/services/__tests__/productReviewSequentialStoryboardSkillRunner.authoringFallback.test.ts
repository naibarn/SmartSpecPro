/**
 * Feature 136 hardening (2026-07-24 field incident: run
 * mar_76cb03fe0f29a20ec6422480f5a6840b, redraft #8 — see
 * `productReviewSequentialStoryboardSkillRunner.ts`'s
 * `invokeSequentialStoryboardAuthoringCall` doc comment).
 *
 * Exercises the PRODUCTION authoring-call wiring directly (extracted out of
 * the `legacyExecute` closure specifically for this kind of test), proving:
 *   1. a hard per-model failure (definitive vision-capability error) falls
 *      over to the next fallback candidate and SUCCEEDS within the same
 *      round, via the shared `executeSkillLlmWithFallback` helper — no
 *      second fallback loop reimplemented here;
 *   2. `lastInvokedModelByRunKey` (read via `peekLastInvokedModelForRunForTest`)
 *      is stamped with the model that ACTUALLY produced the output, never
 *      the first one merely attempted;
 *   3. every failed attempt is scanned for the definitive capability error
 *      and forwarded to `recordModelVisionCapabilityFailure` (deliverable 2),
 *      independent of overall round success;
 *   4. the credit idempotency key shape and the duplicate-ledger swallow are
 *      byte-identical to the pre-existing single-model implementation.
 *
 * `executeSkillLlmWithFallback` itself is mocked (it has its own dedicated
 * suite, `skillModelFallback.test.ts`) — this file proves the WIRING, not
 * the fallback helper's internals. `modelVisionCapabilityBreaker`'s matcher
 * (`isDefinitiveVisionCapabilityError`) runs REAL; its DB-effect function is
 * spied-through (still runs real, against a null-db mock) so both
 * call-shape and safe-no-op behavior are proven together.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: vi.fn(),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLMDynamic: vi.fn(async () => 0),
  deductCredits: vi.fn(async () => ({})),
}));

vi.mock("../modelVisionCapabilityBreaker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modelVisionCapabilityBreaker")>();
  return {
    ...actual,
    recordModelVisionCapabilityFailure: vi.fn(actual.recordModelVisionCapabilityFailure),
  };
});

import { executeSkillLlmWithFallback } from "../skillModelFallback";
import { calculateCreditsForLLMDynamic, deductCredits } from "../creditService";
import { recordModelVisionCapabilityFailure } from "../modelVisionCapabilityBreaker";
import {
  invokeSequentialStoryboardAuthoringCallForTest,
  peekLastInvokedModelForRunForTest,
  type SequentialStoryboardSkillLoopInput,
  type ChildSubjectPolicyInput,
  type SequentialReferenceManifestEntry,
} from "../productReviewSequentialStoryboardSkillRunner";
import type { SkillExecutionPolicyResult } from "../skillExecutionPolicy";
import type { SkillLlmResult, FallbackAttempt } from "../skillModelFallback";

const mockExecuteSkillLlmWithFallback = vi.mocked(executeSkillLlmWithFallback);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLMDynamic);
const mockDeductCredits = vi.mocked(deductCredits);
const mockRecordVisionCapabilityFailure = vi.mocked(recordModelVisionCapabilityFailure);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function makeManifest(): SequentialReferenceManifestEntry[] {
  return [{ index: 1, role: "primary_product", url: "https://example.com/1.jpg" }];
}

function makeChildSubjectPolicy(): ChildSubjectPolicyInput {
  return { productChildRelated: false, childDepictionPlanned: false, guardianReferenceIndex: null };
}

function makeLoopInput(
  overrides?: Partial<SequentialStoryboardSkillLoopInput>
): SequentialStoryboardSkillLoopInput {
  return {
    tenantId: "tenant-1",
    userId: 7,
    runId: "run-xyz",
    productName: "Storage Box",
    productDescription: "A plastic storage box",
    productSpecs: "material: plastic",
    referenceManifest: makeManifest(),
    skillVisionUrls: ["https://example.com/1.jpg"],
    childSubjectPolicy: makeChildSubjectPolicy(),
    ...overrides,
  };
}

function makePolicy(overrides?: Partial<SkillExecutionPolicyResult>): SkillExecutionPolicyResult {
  return {
    modelId: "vision-model-a",
    allowFreeModels: false,
    modelSource: "requirements_match",
    matchedCapabilities: ["supportsVision"],
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<FallbackAttempt>): FallbackAttempt {
  return {
    attempt: 1,
    modelId: "vision-model-a",
    providerName: "multi-provider",
    statusCode: null,
    errorType: null,
    errorMessage: null,
    durationMs: 10,
    success: false,
    ...overrides,
  };
}

const VISION_CAPABILITY_ERROR = "No endpoints found that support image input";

function makeSuccessResult(overrides?: Partial<SkillLlmResult>): SkillLlmResult {
  return {
    success: true,
    content: '{"shots":[]}',
    modelId: "vision-model-b",
    provider: {
      providerId: 2,
      providerName: "openrouter-b",
      baseUrl: "https://openrouter.ai",
      apiKey: "unused",
      providerModelId: "vision-model-b",
      pricingInput: 0,
      pricingOutput: 0,
      isFree: false,
      priority: 10,
    },
    inputTokens: 100,
    outputTokens: 200,
    rawData: { raw: true },
    attempts: [
      makeAttempt({
        attempt: 1,
        modelId: "vision-model-a",
        errorMessage: VISION_CAPABILITY_ERROR,
        statusCode: 404,
        errorType: "http_404",
        success: false,
      }),
      makeAttempt({
        attempt: 2,
        modelId: "vision-model-b",
        providerName: "openrouter-b",
        statusCode: 200,
        errorType: null,
        errorMessage: null,
        durationMs: 34,
        success: true,
      }),
    ],
    totalDurationMs: 46,
    ...overrides,
  };
}

beforeEach(() => {
  mockExecuteSkillLlmWithFallback.mockReset();
  mockCalculateCredits.mockReset().mockResolvedValue(0);
  mockDeductCredits.mockReset().mockResolvedValue({} as never);
  mockRecordVisionCapabilityFailure.mockClear();
});

/* -------------------------------------------------------------------------- */
/* Deliverable 1 — in-round multi-model fallback                              */
/* -------------------------------------------------------------------------- */

describe("invokeSequentialStoryboardAuthoringCall — in-round model fallback (deliverable 1)", () => {
  it("falls over to the next candidate and succeeds within the same round", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(5);

    const result = await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput() },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: ["https://example.com/1.jpg"],
      round: 1,
    });

    expect(result.rawContent).toBe('{"shots":[]}');
    // The SERVED model (candidate 2), never the first one merely attempted.
    expect(result.modelId).toBe("vision-model-b");
    expect(result.providerName).toBe("openrouter-b");
    expect(result.creditsUsed).toBe(5);
  });

  it("stamps lastInvokedModelByRunKey with the model that ACTUALLY produced the output", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput({ runId: "run-bridge-check" }) },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    // Must be the SUCCESSFUL candidate (vision-model-b), NOT policy.modelId
    // ("vision-model-a", the one that hard-failed first).
    expect(peekLastInvokedModelForRunForTest("run-bridge-check")).toBe("vision-model-b");
  });

  it("charges credits against the SERVED model, not the originally-resolved policy.modelId", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(5);

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput() },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    expect(mockCalculateCredits).toHaveBeenCalledWith(100, 200, "vision-model-b");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    const deductArgs = mockDeductCredits.mock.calls[0]![0] as { metadata?: Record<string, unknown> };
    expect(deductArgs.metadata?.model).toBe("vision-model-b");
    expect(deductArgs.metadata?.provider).toBe("openrouter-b");
  });

  it("throws with the preserved error-message prefix when every candidate fails", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: false,
      error: "All 2 models failed: attempt 1 vision-model-a: No endpoints found that support image input",
      attempts: [
        makeAttempt({ modelId: "vision-model-a", errorMessage: VISION_CAPABILITY_ERROR }),
        makeAttempt({ modelId: "vision-model-c", errorMessage: "Rate limited (429)" }),
      ],
      totalDurationMs: 20,
    });

    await expect(
      invokeSequentialStoryboardAuthoringCallForTest({
        ctx: { input: makeLoopInput() },
        policy: makePolicy(),
        systemPrompt: "sys",
        userPrompt: "usr",
        referenceImages: [],
        round: 2,
      })
    ).rejects.toThrow(/^product-review-sequential-storyboard LLM call failed: /);

    // A fully failed round must never charge credits.
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Deliverable 2 — self-healing capability flag, wired from the runner        */
/* -------------------------------------------------------------------------- */

describe("invokeSequentialStoryboardAuthoringCall — capability-flag wiring (deliverable 2)", () => {
  it("forwards a definitive vision-capability failure to recordModelVisionCapabilityFailure", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput({ runId: "run-capability-check" }) },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    expect(mockRecordVisionCapabilityFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "vision-model-a",
        errorMessage: VISION_CAPABILITY_ERROR,
        runId: "run-capability-check",
      })
    );
    // Only the FAILED attempt is forwarded, never the successful one.
    expect(mockRecordVisionCapabilityFailure).toHaveBeenCalledTimes(1);
  });

  it("never forwards a non-definitive (transient) failed attempt", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(
      makeSuccessResult({
        attempts: [
          makeAttempt({
            modelId: "vision-model-a",
            errorMessage: "Rate limited (429), please retry",
            statusCode: 429,
          }),
          makeAttempt({
            modelId: "vision-model-b",
            statusCode: 200,
            errorType: null,
            errorMessage: null,
            success: true,
          }),
        ],
      })
    );

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput() },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    expect(mockRecordVisionCapabilityFailure).not.toHaveBeenCalled();
  });

  it("still fires the capability-flag hook even when the round ultimately fails", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce({
      success: false,
      error: "All 1 models failed: attempt 1 vision-model-a: No endpoints found that support image input",
      attempts: [makeAttempt({ modelId: "vision-model-a", errorMessage: VISION_CAPABILITY_ERROR })],
      totalDurationMs: 5,
    });

    await expect(
      invokeSequentialStoryboardAuthoringCallForTest({
        ctx: { input: makeLoopInput() },
        policy: makePolicy(),
        systemPrompt: "sys",
        userPrompt: "usr",
        referenceImages: [],
        round: 1,
      })
    ).rejects.toThrow();

    expect(mockRecordVisionCapabilityFailure).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "vision-model-a", errorMessage: VISION_CAPABILITY_ERROR })
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Preserved contract — credit idempotency key shape + duplicate swallow      */
/* -------------------------------------------------------------------------- */

describe("invokeSequentialStoryboardAuthoringCall — preserved credit idempotency contract", () => {
  it("keeps the legacy key shape (no g-segment) when chargeGeneration is 0/absent", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(3);

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput({ runId: "run-xyz", chargeGeneration: 0 }) },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    const args = mockDeductCredits.mock.calls[0]![0] as { idempotencyKey?: string };
    expect(args.idempotencyKey).toBe("marketplace-auto-review:sequential-storyboard:run-xyz:1");
  });

  it("inserts the g<N> segment before the round when chargeGeneration > 0 (redraft-safe)", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(3);

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput({ runId: "run-xyz", chargeGeneration: 2 }) },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 3,
    });

    const args = mockDeductCredits.mock.calls[0]![0] as { idempotencyKey?: string };
    expect(args.idempotencyKey).toBe("marketplace-auto-review:sequential-storyboard:run-xyz:g2:3");
  });

  it("swallows a duplicate-ledger-key charge error instead of failing the round", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(3);
    mockDeductCredits.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "credit_transactions_idempotency_key_unique"')
    );

    const result = await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput() },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    expect(result.modelId).toBe("vision-model-b");
  });

  it("still fails the round on a non-duplicate ledger error", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(3);
    mockDeductCredits.mockRejectedValueOnce(new Error("connection reset while charging"));

    await expect(
      invokeSequentialStoryboardAuthoringCallForTest({
        ctx: { input: makeLoopInput() },
        policy: makePolicy(),
        systemPrompt: "sys",
        userPrompt: "usr",
        referenceImages: [],
        round: 1,
      })
    ).rejects.toThrow("connection reset while charging");
  });

  it("never charges credits when the calculated amount is 0", async () => {
    mockExecuteSkillLlmWithFallback.mockResolvedValueOnce(makeSuccessResult());
    mockCalculateCredits.mockResolvedValueOnce(0);

    await invokeSequentialStoryboardAuthoringCallForTest({
      ctx: { input: makeLoopInput() },
      policy: makePolicy(),
      systemPrompt: "sys",
      userPrompt: "usr",
      referenceImages: [],
      round: 1,
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
