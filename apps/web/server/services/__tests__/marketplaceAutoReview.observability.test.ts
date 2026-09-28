/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 12 §4/T1-T11. Tests for `marketplaceAutoReviewObservability.ts`:
 * the frozen event catalog, the sanitizer, the JSONL/DB dual-write
 * emitters, dedupe bookkeeping, the per-event pure payload builders, the
 * loop-effect audit seam, and the per-mode comparison metrics recorder.
 *
 * `vi.mock("../auditLogger", ...)` is MANDATORY: in Vitest the real audit
 * logger is never initialized (`if (!this.initialized) return;`), so without
 * this mock every `auditLogger.log` call would silently no-op and none of
 * these assertions could observe anything.
 */
import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// For the dual-write (T10) tests only — every other test exercises pure
// functions or the JSONL-only emitter and never touches the DB.
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

import { auditLogger, type AuditEventType } from "../auditLogger";
import { getDb } from "../../db";
import {
  MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS,
  MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES,
  buildEvidenceGuardOccurrenceEventPayload,
  buildFinalPromptOverBudgetEventPayload,
  buildMarketplaceAutoReviewAuditTraceId,
  buildMarketplaceAutoReviewModeMetrics,
  buildMarketplaceAutoReviewStageAttemptEvidenceJson,
  buildSequentialLoopAuditEffect,
  buildSequentialReferenceAnglesTrimmedDedupeKey,
  buildSequentialReferenceAnglesTrimmedEventPayload,
  buildSequentialSkillPlanRoundEventPayload,
  claimMarketplaceAutoReviewAuditEventKey,
  emitMarketplaceAutoReviewAuditEvent,
  applyMarketplaceAutoReviewModeMetricsToMetadata,
  recordMarketplaceAutoReviewAuditEventRow,
  recordMarketplaceAutoReviewEvidenceGuardOccurrence,
  recordMarketplaceAutoReviewModeMetricsEvent,
  sanitizeMarketplaceAutoReviewAuditMetadata,
  type MarketplaceAutoReviewAuditContext,
  type MarketplaceAutoReviewObservabilityState,
} from "../marketplaceAutoReviewObservability";

const BASE_CONTEXT: MarketplaceAutoReviewAuditContext = {
  runId: "run-abc123",
  tenantId: "tenant-1",
  userId: 42,
  productId: "product-1",
  frameStrategy: "sequential_shot_storyboard",
  stageKey: "image_generation",
};

/** §4 shared fixture helper — imageAttemptReviews[] for a 3x3 run. */
function buildGridAttemptReviewFixtures(spec: {
  attempts: Array<{ status: string; reasonCodes?: string[]; qualityScore?: number }>;
}): Record<string, unknown>[] {
  return spec.attempts.map((attempt, index) => ({
    frameStrategy: "storyboard_3x3_split",
    attempt: index + 1,
    status: attempt.status,
    reasonCodes: attempt.reasonCodes ?? [],
    repairRefs: [] as string[],
    ...(attempt.qualityScore === undefined ? {} : { qualityScore: attempt.qualityScore }),
  }));
}

/** §4 shared fixture helper — imageAttemptReviews[] for a sequential run. */
function buildSequentialAttemptReviewFixtures(spec: {
  units: Array<{
    unitId: string;
    verdict: string;
    reasonCodes?: string[];
    repairAttempts?: number;
    qualityScore?: number;
  }>;
}): Record<string, unknown>[] {
  return [
    {
      frameStrategy: "sequential_shot_storyboard",
      unitOutcomes: spec.units.map(unit => ({
        unitId: unit.unitId,
        verdict: unit.verdict,
        reasonCodes: unit.reasonCodes ?? [],
        repairAttempts: unit.repairAttempts ?? 0,
        ...(unit.qualityScore === undefined ? {} : { qualityScore: unit.qualityScore }),
      })),
    },
  ];
}

function lastLogCall(): Record<string, any> {
  const calls = (auditLogger.log as unknown as { mock: { calls: any[][] } }).mock.calls;
  return calls[calls.length - 1]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T1 — event-name contract is frozen", () => {
  it("contains exactly the seven §5.1 names, satisfies AuditEventType, and each is <=64 chars", () => {
    const expectedNames = [
      "sequential_skill_plan_round",
      "sequential_prompt_degraded_fallback",
      "final_image_prompt_over_provider_budget",
      "final_video_prompt_over_provider_budget",
      "sequential_reference_angles_trimmed",
      "marketplace_review_evidence_guard_occurrence",
      "marketplace_review_mode_metrics",
    ];
    expect([...MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS]).toEqual(expectedNames);
    expect(MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS.length).toBe(7);
    for (const name of MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS) {
      expect(name.length).toBeLessThanOrEqual(64);
    }
    // Compile-time: every catalog member must be assignable to AuditEventType.
    const typeCheck: readonly AuditEventType[] = MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS;
    expect(typeCheck.length).toBe(MARKETPLACE_AUTO_REVIEW_AUDIT_EVENTS.length);
  });
});

describe("T2 — emitter behavior", () => {
  it("calls auditLogger.log exactly once with {eventType, traceId, userId, tenantId, metadata}", () => {
    emitMarketplaceAutoReviewAuditEvent({
      event: "sequential_reference_angles_trimmed",
      context: BASE_CONTEXT,
      metadata: { modelCap: 3 },
    });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    const call = lastLogCall();
    expect(call.eventType).toBe("sequential_reference_angles_trimmed");
    expect(typeof call.traceId).toBe("string");
    expect(call.traceId).toHaveLength(32);
    expect(call.userId).toBe(42);
    expect(call.tenantId).toBe("tenant-1");
    expect(call.metadata).toBeDefined();
  });

  it("traceId is deterministic for the same (runId, event, key) and exactly 32 chars", () => {
    const id1 = buildMarketplaceAutoReviewAuditTraceId(
      BASE_CONTEXT,
      "sequential_reference_angles_trimmed",
      "k1"
    );
    const id2 = buildMarketplaceAutoReviewAuditTraceId(
      BASE_CONTEXT,
      "sequential_reference_angles_trimmed",
      "k1"
    );
    const id3 = buildMarketplaceAutoReviewAuditTraceId(
      BASE_CONTEXT,
      "sequential_reference_angles_trimmed",
      "k2"
    );
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toHaveLength(32);
    expect(id3).toHaveLength(32);
  });

  it("when the mocked logger throws, the emitter returns normally and logs console.warn", () => {
    (auditLogger.log as any).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() =>
      emitMarketplaceAutoReviewAuditEvent({
        event: "marketplace_review_mode_metrics",
        context: BASE_CONTEXT,
        metadata: {},
      })
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("absent userId/tenantId become null, never undefined keys", () => {
    emitMarketplaceAutoReviewAuditEvent({
      event: "sequential_reference_angles_trimmed",
      context: { runId: "r1", frameStrategy: "sequential_shot_storyboard" },
      metadata: {},
    });
    const call = lastLogCall();
    expect(call.userId).toBeNull();
    expect(call.tenantId).toBeNull();
    expect("userId" in call).toBe(true);
    expect("tenantId" in call).toBe(true);
  });
});

describe("T3 — payload sanitizer (secret/PII rules)", () => {
  it("drops/redacts URL-bearing and content-bearing keys, keeping identifiers", () => {
    const input = {
      url: "https://example.com/secret?token=abc",
      resultUrl: "https://cdn.example.com/img.png",
      referenceImageUrls: ["https://a.com/1.png", "https://a.com/2.png"],
      imageUrl: "https://a.com/x.png",
      thumbnailUrl: "https://a.com/thumb.png",
      prompt: "a very secret creative prompt sentence",
      promptText: "another secret prompt",
      dialogue: "สวัสดีครับ นี่คือบทพูดลับ",
      referenceAudioBase64: "QUJDREVGRw==",
      runId: "run-1",
      shotId: "shot-1",
      unitId: "unit-1",
      angleLabel: "front",
      role: "product",
      code: "guardian_presence_missing",
      count: 3,
      score: 92.5,
    };
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata(input);
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("secret prompt");
    expect(serialized).not.toContain("บทพูดลับ");
    expect(sanitized.url).toBeUndefined();
    expect(sanitized.urlHash).toBeDefined();
    expect(sanitized.promptHash).toBeDefined();
    expect(sanitized.promptLengthChars).toBe(input.prompt.length);
    expect(sanitized.dialogueHash).toBeDefined();
    expect(sanitized.dialogueLengthChars).toBe(input.dialogue.length);
    expect(sanitized.referenceImageUrlsHash).toBeDefined();
    expect(sanitized.referenceImageUrlsCount).toBe(2);
    // kept identifiers
    expect(sanitized.runId).toBe("run-1");
    expect(sanitized.shotId).toBe("shot-1");
    expect(sanitized.unitId).toBe("unit-1");
    expect(sanitized.angleLabel).toBe("front");
    expect(sanitized.role).toBe("product");
    expect(sanitized.code).toBe("guardian_presence_missing");
    expect(sanitized.count).toBe(3);
    expect(sanitized.score).toBe(92.5);
  });

  it("truncates long surviving strings and caps arrays (a 500-element array is capped)", () => {
    const longString = "x".repeat(5000);
    const bigArray = Array.from({ length: 500 }, (_, i) => `code_${i}`);
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata({
      detail: longString,
      codes: bigArray,
    });
    expect((sanitized.detail as string).length).toBeLessThan(500);
    expect(Array.isArray(sanitized.codes)).toBe(true);
    expect((sanitized.codes as unknown[]).length).toBeLessThan(500);
  });

  it("never emits email/PII, only userId", () => {
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata({
      email: "user@example.com",
      userEmail: "user2@example.com",
      userId: 42,
    });
    expect(JSON.stringify(sanitized)).not.toContain("@example.com");
    expect(sanitized.email).toBeUndefined();
    expect(sanitized.userEmail).toBeUndefined();
    expect(sanitized.userId).toBe(42);
  });

  it("strips a raw http(s) URL substring even under a key it does not recognize as content-bearing", () => {
    const sanitized = sanitizeMarketplaceAutoReviewAuditMetadata({
      detail: "see https://leaky.example.com/x?token=abc for the source image",
    });
    expect(JSON.stringify(sanitized)).not.toContain("http");
  });
});

describe("T4 — loop-round event payload", () => {
  it("produces the shaped payload with 8-dimension scores, omitting missing/NaN dimensions, capping candidateCount", () => {
    const raw: Record<string, unknown> = {
      round: 2,
      totalScore: 87.5,
      retained: true,
      disqualifiers: ["length_over_budget"],
      candidates: [{}, {}, {}, {}],
      evidence_accuracy: 90,
      product_consistency: 85,
      narrative_quality: NaN,
      visual_feasibility: 80,
      compliance_safety: 95,
      prompt_completeness: 88,
      length_compliance: 70,
      model: "some-model",
      durationMs: 1234,
    };
    const payload = buildSequentialSkillPlanRoundEventPayload({
      context: BASE_CONTEXT,
      round: 2,
      raw,
    });
    expect(payload.runId).toBe(BASE_CONTEXT.runId);
    expect(payload.frameStrategy).toBe(BASE_CONTEXT.frameStrategy);
    expect(payload.round).toBe(2);
    expect(payload.model).toBe("some-model");
    expect(payload.totalScore).toBe(87.5);
    expect(payload.scores).toEqual({
      evidence_accuracy: 90,
      product_consistency: 85,
      visual_feasibility: 80,
      compliance_safety: 95,
      prompt_completeness: 88,
      length_compliance: 70,
    });
    expect((payload.scores as Record<string, number>).narrative_quality).toBeUndefined();
    expect((payload.scores as Record<string, number>).dialogue_continuity).toBeUndefined();
    expect(payload.candidateCount).toBe(3); // 4 candidates capped at the ceiling of 3
    expect(payload.retained).toBe(true);
    expect(payload.disqualifiers).toEqual(["length_over_budget"]);
    expect(payload.durationMs).toBe(1234);
    expect(payload.degraded).toBe(false);
  });

  it("missing model/durationMs become null, never a fabricated value", () => {
    const payload = buildSequentialSkillPlanRoundEventPayload({
      context: BASE_CONTEXT,
      round: 1,
      raw: { round: 1, totalScore: 50, retained: false, disqualifiers: [], candidates: [] },
    });
    expect(payload.model).toBeNull();
    expect(payload.durationMs).toBeNull();
    expect(payload.scores).toEqual({});
    expect(payload.candidateCount).toBe(0);
  });
});

describe("T5 — degraded fallback event", () => {
  it("emits exactly once via buildSequentialLoopAuditEffect; retryHistorySummary carries error classes only", () => {
    const effect = buildSequentialLoopAuditEffect(BASE_CONTEXT);
    effect("sequential_prompt_degraded_fallback", {
      runId: BASE_CONTEXT.runId,
      retryHistory: [
        { round: 1, status: "invocation_failed", error: "RAW MODEL OUTPUT LEAK: secret" },
        { round: 2, status: "contract_violation", reasons: ["missing shots array"] },
        { round: 3, status: "invocation_failed", error: "another raw dump" },
      ],
    });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    const call = lastLogCall();
    expect(call.eventType).toBe("sequential_prompt_degraded_fallback");
    expect(call.metadata.roundsAttempted).toBe(3);
    expect(call.metadata.retryHistorySummary).toEqual([
      { round: 1, errorClass: "invocation_failed" },
      { round: 2, errorClass: "contract_violation" },
      { round: 3, errorClass: "invocation_failed" },
    ]);
    expect(call.metadata.promptCount).toBe(9);
    const serialized = JSON.stringify(call.metadata);
    expect(serialized).not.toContain("RAW MODEL OUTPUT LEAK");
    expect(serialized).not.toContain("raw dump");
    expect(serialized).not.toContain("missing shots array");
  });

  it("the grid path's existing storyboard_prompt_degraded_fallback warning string is unchanged (grep-guard)", () => {
    const filePath = path.resolve(
      import.meta.dirname,
      "../marketplaceAutoReviewService.ts"
    );
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain(
      'warnings: [...rawResult.warnings, "storyboard_prompt_degraded_fallback"]'
    );
  });
});

describe("T6 — prompt-over-budget rewrite events", () => {
  it("image over budget -> final_image_prompt_over_provider_budget, promptKind sequential_image, no prompt text leaks", () => {
    const effect = buildSequentialLoopAuditEffect(BASE_CONTEXT);
    const plantedSentence =
      "THIS EXACT PLANTED SENTENCE MUST NEVER REACH THE SERIALIZED AUDIT PAYLOAD";
    effect("final_image_prompt_over_provider_budget", {
      shotId: "sequential-shot-03",
      reason: "final_image_prompt_over_provider_budget",
      promptKind: "sequential_image",
      sourceLengthChars: 4500,
      optimizedLengthChars: 3900,
      maxOutputChars: 4000,
      attempt: 2,
      promptHash: "abc123def456",
      prompt: plantedSentence,
    });
    const call = lastLogCall();
    expect(call.eventType).toBe("final_image_prompt_over_provider_budget");
    expect(call.metadata.promptKind).toBe("sequential_image");
    expect(call.metadata.sourceLengthChars).toBe(4500);
    expect(call.metadata.optimizedLengthChars).toBe(3900);
    expect(call.metadata.maxOutputChars).toBe(4000);
    expect(call.metadata.rewriteAttempt).toBe(2);
    expect(call.metadata.stillOverBudget).toBe(false);
    expect(call.metadata.promptHash).toBe("abc123def456");
    expect(JSON.stringify(call.metadata)).not.toContain(plantedSentence);
  });

  it("video over budget -> final_video_prompt_over_provider_budget, promptKind sequential_video, stillOverBudget true when still over", () => {
    const effect = buildSequentialLoopAuditEffect(BASE_CONTEXT);
    effect("final_video_prompt_over_provider_budget", {
      shotId: "sequential-shot-07",
      reason: "final_video_prompt_over_provider_budget",
      promptKind: "sequential_video",
      sourceLengthChars: 2600,
      optimizedLengthChars: 2200,
      maxOutputChars: 2000,
      attempt: 3,
      promptHash: "feedcafe1234",
    });
    const call = lastLogCall();
    expect(call.eventType).toBe("final_video_prompt_over_provider_budget");
    expect(call.metadata.promptKind).toBe("sequential_video");
    expect(call.metadata.stillOverBudget).toBe(true);
    expect(call.metadata.rewriteAttempt).toBe(3);
  });

  it("the payload builder is call-site agnostic — the existing 3x3 optimizer path can report promptKind grid_image", () => {
    const shaped = buildFinalPromptOverBudgetEventPayload({
      context: { ...BASE_CONTEXT, frameStrategy: "storyboard_3x3_split" },
      raw: {
        promptKind: "grid_image",
        sourceLengthChars: 100,
        optimizedLengthChars: 90,
        maxOutputChars: 95,
        attempt: 1,
      },
    });
    expect(shaped.promptKind).toBe("grid_image");
    expect(shaped.stillOverBudget).toBe(false);
  });
});

describe("T7 — angle-trim event + once-per-run dedupe", () => {
  it("payload shape: ref is an opaque asset ref, never a URL", () => {
    const payload = buildSequentialReferenceAnglesTrimmedEventPayload({
      context: BASE_CONTEXT,
      modelCap: 3,
      attachedAngleCount: 3,
      trimmedAngles: [
        { ref: "asset-ref:angle-4", angleLabel: "detail" },
        { ref: "asset-ref:angle-5", angleLabel: "back" },
      ],
      reservedRoles: ["guardian"],
    });
    expect(payload.modelCap).toBe(3);
    expect(payload.attachedAngleCount).toBe(3);
    expect(payload.trimmedAngles).toEqual([
      { ref: "asset-ref:angle-4", angleLabel: "detail" },
      { ref: "asset-ref:angle-5", angleLabel: "back" },
    ]);
    expect(payload.reservedRoles).toEqual(["guardian"]);
  });

  it("claimMarketplaceAutoReviewAuditEventKey: first claim non-null, repeat of same key returns null (9 units + repairs -> ONE emit)", () => {
    const key = buildSequentialReferenceAnglesTrimmedDedupeKey({
      modelCap: 3,
      trimmedAngles: [{ ref: "a" }, { ref: "b" }],
    });
    let state: MarketplaceAutoReviewObservabilityState | undefined;
    let emits = 0;
    for (let i = 0; i < 9; i += 1) {
      const claimed = claimMarketplaceAutoReviewAuditEventKey(state, key);
      if (claimed) {
        emits += 1;
        state = claimed;
      }
    }
    expect(emits).toBe(1);
    expect(state?.emittedEventKeys).toContain(key);
  });

  it("a different trim signature (different model cap) produces a different key and does emit", () => {
    const keyA = buildSequentialReferenceAnglesTrimmedDedupeKey({
      modelCap: 3,
      trimmedAngles: [{ ref: "a" }],
    });
    const keyB = buildSequentialReferenceAnglesTrimmedDedupeKey({
      modelCap: 4,
      trimmedAngles: [{ ref: "a" }],
    });
    expect(keyA).not.toBe(keyB);
    const state1 = claimMarketplaceAutoReviewAuditEventKey(undefined, keyA);
    expect(state1).not.toBeNull();
    const state2 = claimMarketplaceAutoReviewAuditEventKey(state1 ?? undefined, keyB);
    expect(state2).not.toBeNull();
  });

  it("the stored key list is bounded (oldest dropped past the cap) — length <= 200 after 300 claims", () => {
    let state: MarketplaceAutoReviewObservabilityState | undefined;
    for (let i = 0; i < 300; i += 1) {
      const claimed = claimMarketplaceAutoReviewAuditEventKey(state, `key-${i}`);
      if (claimed) state = claimed;
    }
    expect(state?.emittedEventKeys.length).toBeLessThanOrEqual(200);
    // FIFO drop: the earliest keys are the ones gone, the most recent survive.
    expect(state?.emittedEventKeys).toContain("key-299");
    expect(state?.emittedEventKeys).not.toContain("key-0");
  });
});

describe("T8 — evidence-guard occurrence events", () => {
  it("one payload per (code, shotId); only the four enumerated codes are accepted", () => {
    expect(MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES).toEqual([
      "guardian_presence_missing",
      "guardian_directive_missing",
      "assembly_content_unverified",
      "assembly_demo_unverified",
    ]);
    for (const code of MARKETPLACE_AUTO_REVIEW_EVIDENCE_GUARD_OCCURRENCE_CODES) {
      const payload = buildEvidenceGuardOccurrenceEventPayload({
        context: BASE_CONTEXT,
        code,
        shotId: "shot-3",
        stage: "qa",
        repairAttempt: 1,
        guardEnabled: true,
      });
      expect(payload).not.toBeNull();
      expect(payload?.code).toBe(code);
      expect(payload?.shotId).toBe("shot-3");
      expect(payload?.stage).toBe("qa");
      expect(payload?.repairAttempt).toBe(1);
      expect(payload?.guardEnabled).toBe(true);
    }
  });

  it("an unknown code is ignored — no throw, no emit", () => {
    const payload = buildEvidenceGuardOccurrenceEventPayload({
      context: BASE_CONTEXT,
      code: "not_a_real_guard_code",
      shotId: "shot-1",
      stage: "qa",
      guardEnabled: true,
    });
    expect(payload).toBeNull();
  });

  it("nothing is emitted when evidenceGuard.enabled !== true", async () => {
    const payload = buildEvidenceGuardOccurrenceEventPayload({
      context: BASE_CONTEXT,
      code: "guardian_presence_missing",
      shotId: "shot-1",
      stage: "qa",
      guardEnabled: false,
    });
    expect(payload).toBeNull();
    await recordMarketplaceAutoReviewEvidenceGuardOccurrence({
      context: BASE_CONTEXT,
      code: "guardian_presence_missing",
      shotId: "shot-1",
      stage: "qa",
      guardEnabled: false,
    });
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("payload contains no image URL/base64 even from a hostile shotId (sanitizer runs inside the emitter)", async () => {
    await recordMarketplaceAutoReviewEvidenceGuardOccurrence({
      context: BASE_CONTEXT,
      code: "assembly_content_unverified",
      shotId: "shot-9 https://evil.example.com/leak?token=SECRETTOKEN",
      stage: "preflight",
      repairAttempt: 0,
      guardEnabled: true,
    });
    const call = lastLogCall();
    expect(call.eventType).toBe("marketplace_review_evidence_guard_occurrence");
    const serialized = JSON.stringify(call.metadata);
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("SECRETTOKEN");
  });
});

describe("T9 — metrics aggregator, BOTH modes", () => {
  it("sequential fixture (9 units): mismatches, repairs, publish-safety block, mean of present scores", () => {
    const reviews = buildSequentialAttemptReviewFixtures({
      units: [
        {
          unitId: "sequential-shot-01",
          verdict: "repair",
          reasonCodes: ["product_reference_mismatch"],
          repairAttempts: 1,
          qualityScore: 90,
        },
        {
          unitId: "sequential-shot-02",
          verdict: "repair",
          reasonCodes: ["product_reference_mismatch"],
          repairAttempts: 1,
          qualityScore: 85,
        },
        {
          unitId: "sequential-shot-03",
          verdict: "repair",
          reasonCodes: ["storyboard_continuity_mismatch"],
          repairAttempts: 1,
          qualityScore: 80,
        },
        {
          unitId: "sequential-shot-04",
          verdict: "repair",
          reasonCodes: ["guardian_presence_missing"],
          repairAttempts: 0,
          qualityScore: 70,
        },
        { unitId: "sequential-shot-05", verdict: "pass", qualityScore: 95 },
        { unitId: "sequential-shot-06", verdict: "pass", qualityScore: 95 },
        { unitId: "sequential-shot-07", verdict: "pass", qualityScore: 95 },
        { unitId: "sequential-shot-08", verdict: "pass", qualityScore: 95 },
        { unitId: "sequential-shot-09", verdict: "pass" }, // no qualityScore
      ],
    });
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "run-1",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: true,
      qualityMode: "premium_strict_qa",
      imageAttemptReviews: reviews,
    });
    expect(metrics.evaluatedUnits).toBe(9);
    expect(metrics.frameEquivalents).toBe(9);
    expect(metrics.reasonCodeCounts).toEqual({
      product_reference_mismatch: 2,
      storyboard_continuity_mismatch: 1,
      guardian_presence_missing: 1,
    });
    expect(metrics.repairAttemptCount).toBe(3);
    expect(metrics.publishSafetyBlockCount).toBe(1);
    expect(metrics.guardianOccurrenceCount).toBe(1);
    expect(metrics.assemblyOccurrenceCount).toBe(0);
    expect(metrics.productReferenceMismatchCount).toBe(2);
    expect(metrics.storyboardContinuityMismatchCount).toBe(1);
    expect(metrics.productReferenceMismatchRate).toBeCloseTo(2 / 9, 6);
    expect(metrics.storyboardContinuityMismatchRate).toBeCloseTo(1 / 9, 6);
    const presentScores = [90, 85, 80, 70, 95, 95, 95, 95];
    const expectedMean =
      presentScores.reduce((sum, value) => sum + value, 0) / presentScores.length;
    expect(metrics.meanQualityScore).toBeCloseTo(expectedMean, 6);
  });

  it("3x3 fixture (3 attempt waves, one grid unit each) — evaluatedUnits 3, frameEquivalents 27", () => {
    const reviews = buildGridAttemptReviewFixtures({
      attempts: [
        { status: "repair_required", reasonCodes: ["storyboard_grid_layout_mismatch"], qualityScore: 60 },
        { status: "repair_required", reasonCodes: [], qualityScore: 75 },
        { status: "accepted_with_warnings", reasonCodes: [], qualityScore: 88 },
      ],
    });
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "run-2",
      frameStrategy: "storyboard_3x3_split",
      evidenceGuardEnabled: false,
      imageAttemptReviews: reviews,
    });
    expect(metrics.evaluatedUnits).toBe(3);
    expect(metrics.frameEquivalents).toBe(27);
    expect(metrics.attemptCount).toBe(3);
    // acceptedFrameCount is only ever populated from the explicit
    // acceptedFrameUrls snapshot — never guessed from attempt status.
    expect(metrics.acceptedFrameCount).toBe(0);
    expect(metrics.repairAttemptsPerAcceptedFrame).toBeNull();
  });

  it("acceptedFrameUrls (count only) drives acceptedFrameCount and repairAttemptsPerAcceptedFrame", () => {
    const reviews = buildSequentialAttemptReviewFixtures({
      units: [
        { unitId: "u1", verdict: "pass", repairAttempts: 2, qualityScore: 90 },
        { unitId: "u2", verdict: "pass", repairAttempts: 0, qualityScore: 90 },
      ],
    });
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "run-3",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: false,
      imageAttemptReviews: reviews,
      acceptedFrameUrls: ["frame-1", "frame-2"],
    });
    expect(metrics.acceptedFrameCount).toBe(2);
    expect(metrics.repairAttemptCount).toBe(2);
    expect(metrics.repairAttemptsPerAcceptedFrame).toBeCloseTo(1, 6);
  });

  it("denominators are explicit fields alongside every rate", () => {
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "storyboard_3x3_split",
      evidenceGuardEnabled: false,
      imageAttemptReviews: [],
    });
    expect(typeof metrics.evaluatedUnits).toBe("number");
    expect(typeof metrics.frameEquivalents).toBe("number");
    expect(typeof metrics.productReferenceMismatchCount).toBe("number");
    expect(typeof metrics.storyboardContinuityMismatchCount).toBe("number");
  });

  it("zero reviews: every rate is null (never NaN, never 0), counters are 0", () => {
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: true,
      imageAttemptReviews: [],
    });
    expect(metrics.evaluatedUnits).toBe(0);
    expect(metrics.frameEquivalents).toBe(0);
    expect(metrics.acceptedFrameCount).toBe(0);
    expect(metrics.attemptCount).toBe(0);
    expect(metrics.repairAttemptCount).toBe(0);
    expect(metrics.reasonCodeCounts).toEqual({});
    expect(metrics.productReferenceMismatchRate).toBeNull();
    expect(metrics.storyboardContinuityMismatchRate).toBeNull();
    expect(metrics.repairAttemptsPerAcceptedFrame).toBeNull();
    expect(metrics.meanQualityScore).toBeNull();
    expect(Number.isNaN(metrics.productReferenceMismatchRate as unknown as number)).toBe(false);
  });

  it("entries with missing qualityScore are excluded from the mean, not counted as 0", () => {
    const reviews = buildSequentialAttemptReviewFixtures({
      units: [
        { unitId: "u1", verdict: "pass", qualityScore: 100 },
        { unitId: "u2", verdict: "pass" },
      ],
    });
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: false,
      imageAttemptReviews: reviews,
    });
    expect(metrics.meanQualityScore).toBe(100);
  });

  it("frameStrategy falls back to the run's strategy when an older review entry lacks the tag", () => {
    const reviews = [
      { unitOutcomes: [{ unitId: "u1", verdict: "pass", qualityScore: 50 }] },
    ];
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: false,
      imageAttemptReviews: reviews,
    });
    expect(metrics.evaluatedUnits).toBe(1);
    expect(metrics.frameEquivalents).toBe(1);
    expect(metrics.meanQualityScore).toBe(50);
  });

  it("legacy/start_stop runs aggregate without throwing", () => {
    const reviews = [
      {
        frameStrategy: "video_shot_start_stop",
        unitIds: ["shot-1-start", "shot-1-stop"],
        reasonCodes: [],
        repairRefs: [],
      },
    ];
    expect(() =>
      buildMarketplaceAutoReviewModeMetrics({
        runId: "r",
        frameStrategy: "video_shot_start_stop",
        evidenceGuardEnabled: false,
        imageAttemptReviews: reviews,
      })
    ).not.toThrow();
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "video_shot_start_stop",
      evidenceGuardEnabled: false,
      imageAttemptReviews: reviews,
    });
    expect(metrics.evaluatedUnits).toBe(2);
    expect(metrics.frameEquivalents).toBe(2);
  });
});

describe("T10 — persistence surfaces", () => {
  it("applyMarketplaceAutoReviewModeMetricsToMetadata writes observability and preserves everything else", () => {
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: true,
      imageAttemptReviews: [],
    });
    const metadata = {
      foo: "bar",
      nested: { a: 1 },
      observability: { metricsVersion: 1 as const, emittedEventKeys: ["existing-key"] },
    };
    const result = applyMarketplaceAutoReviewModeMetricsToMetadata(metadata, metrics);
    expect(result.foo).toBe("bar");
    expect(result.nested).toEqual({ a: 1 });
    const observability = result.observability as MarketplaceAutoReviewObservabilityState;
    expect(observability.emittedEventKeys).toEqual(["existing-key"]);
    expect(observability.modeMetrics).toEqual(metrics);
    expect(observability.metricsVersion).toBe(1);
  });

  it("stage-attempt evidence builder returns evidenceJson byte-identical to today when there are no image attempt reviews", () => {
    const evidence = buildMarketplaceAutoReviewStageAttemptEvidenceJson({
      runId: "r",
      frameStrategy: "storyboard_3x3_split",
      evidenceGuardEnabled: false,
      providerReconciliationId: "prid",
      repairLedgerId: "rlid",
      qaArtifactManifestId: "qamid",
      imageAttemptReviews: [],
    });
    expect(evidence).toEqual({
      schemaVersion: 1,
      providerReconciliationId: "prid",
      repairLedgerId: "rlid",
      qaArtifactManifestId: "qamid",
    });
  });

  it("stage-attempt evidence builder adds a compact modeMetrics when reviews exist, ids/schemaVersion unchanged", () => {
    const reviews = buildGridAttemptReviewFixtures({
      attempts: [{ status: "passed", qualityScore: 90 }],
    });
    const evidence = buildMarketplaceAutoReviewStageAttemptEvidenceJson({
      runId: "r",
      frameStrategy: "storyboard_3x3_split",
      evidenceGuardEnabled: false,
      providerReconciliationId: "prid",
      repairLedgerId: "rlid",
      qaArtifactManifestId: "qamid",
      imageAttemptReviews: reviews,
    });
    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.providerReconciliationId).toBe("prid");
    expect(evidence.repairLedgerId).toBe("rlid");
    expect(evidence.qaArtifactManifestId).toBe("qamid");
    expect(evidence.modeMetrics).toBeDefined();
    expect((evidence.modeMetrics as any).evaluatedUnits).toBe(1);
  });

  it("DB dual-write: guard-occurrence and mode-metrics events insert exactly one api_audit_events row with statusCode 200", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn(() => ({ values: insertValues }));
    (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ insert: insertMock });

    await recordMarketplaceAutoReviewEvidenceGuardOccurrence({
      context: BASE_CONTEXT,
      code: "guardian_presence_missing",
      shotId: "shot-1",
      stage: "qa",
      repairAttempt: 1,
      guardEnabled: true,
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const guardRow = insertValues.mock.calls[0][0];
    expect(guardRow.statusCode).toBe(200);
    expect(guardRow.traceId).toHaveLength(32);
    expect(guardRow.eventType.length).toBeLessThanOrEqual(64);

    insertMock.mockClear();
    insertValues.mockClear();
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: true,
      imageAttemptReviews: [],
    });
    await recordMarketplaceAutoReviewModeMetricsEvent({ context: BASE_CONTEXT, metrics });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const metricsRow = insertValues.mock.calls[0][0];
    expect(metricsRow.statusCode).toBe(200);
    expect(metricsRow.traceId).toHaveLength(32);
  });

  it("an insert rejection is swallowed (no unhandled rejection); the JSONL line is still written", async () => {
    const insertValues = vi.fn().mockRejectedValue(new Error("db down"));
    const insertMock = vi.fn(() => ({ values: insertValues }));
    (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ insert: insertMock });

    await expect(
      recordMarketplaceAutoReviewEvidenceGuardOccurrence({
        context: BASE_CONTEXT,
        code: "assembly_demo_unverified",
        shotId: "shot-2",
        stage: "preflight",
        repairAttempt: 0,
        guardEnabled: true,
      })
    ).resolves.toBeUndefined();
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
  });

  it("recordMarketplaceAutoReviewAuditEventRow itself never throws when getDb() throws synchronously", async () => {
    (getDb as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("Database not configured");
    });
    await expect(
      recordMarketplaceAutoReviewAuditEventRow({
        event: "marketplace_review_mode_metrics",
        context: BASE_CONTEXT,
        metadata: {},
        traceId: buildMarketplaceAutoReviewAuditTraceId(BASE_CONTEXT, "marketplace_review_mode_metrics"),
      })
    ).resolves.toBeUndefined();
  });
});

describe("T11 — no-threshold guard (review tripwire)", () => {
  const moduleSource = fs.readFileSync(
    path.resolve(import.meta.dirname, "../marketplaceAutoReviewObservability.ts"),
    "utf-8"
  );

  it("the MarketplaceAutoReviewModeMetrics type has no passed/gatePassed/meetsGaGate field", () => {
    const match = /export type MarketplaceAutoReviewModeMetrics = \{[\s\S]*?\n\};/.exec(
      moduleSource
    );
    expect(match).not.toBeNull();
    const typeBlock = match![0];
    expect(typeBlock).not.toMatch(/\bpassed\s*[?:]/);
    expect(typeBlock).not.toMatch(/\bgatePassed\b/);
    expect(typeBlock).not.toMatch(/\bmeetsGaGate\b/);
  });

  it("the module exports no identifier matching /THRESHOLD|MIN_UPLIFT|GA_TARGET/", () => {
    const exportDeclarations =
      moduleSource.match(/^export (const|function|async function|type) [A-Za-z0-9_]+/gm) ?? [];
    expect(exportDeclarations.length).toBeGreaterThan(0);
    for (const declaration of exportDeclarations) {
      expect(declaration).not.toMatch(/THRESHOLD|MIN_UPLIFT|GA_TARGET/);
    }
  });

  it("no numeric comparison against a rate literal appears anywhere in the module source", () => {
    expect(moduleSource).not.toMatch(/(mismatchRate|qualityScore)\s*[<>]=?\s*\d/);
  });

  it("a live metrics object carries no passed/gatePassed/meetsGaGate key at runtime", () => {
    const metrics = buildMarketplaceAutoReviewModeMetrics({
      runId: "r",
      frameStrategy: "sequential_shot_storyboard",
      evidenceGuardEnabled: false,
      imageAttemptReviews: [],
    });
    expect("passed" in metrics).toBe(false);
    expect("gatePassed" in metrics).toBe(false);
    expect("meetsGaGate" in metrics).toBe(false);
  });
});
