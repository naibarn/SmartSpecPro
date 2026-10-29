import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], db: { select: vi.fn() } }));

vi.mock("../../db", () => ({
  db: mocks.db,
  getDb: vi.fn(),
}));

import { aggregateTaskObservability, decodeProjectionSnapshotToken, encodeProjectionSnapshotToken, getTaskHarnessOutputEvents, getTaskObservabilityDetail, projectEconomicSettlementEvidence, projectJobSettlementMarker, projectRunnerTimelineEvent } from "../taskObservabilityReadModel";

function query(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason?: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "reservation-1",
    workerJobId: "job-1",
    attemptId: "attempt-1",
    reservationKind: "model_call",
    modelCallId: "call-1",
    requestedModel: "requested-model",
    modelSelectionJson: null,
    modelPhase: "IMPLEMENT",
    modelRole: "implementer",
    reasoningEffort: "medium",
    usageReceiptJson: { inputTokens: 8, outputTokens: 2, cachedInputTokens: 4, effectiveModel: "provider-model" },
    reservedTokens: 100,
    updatedAt: new Date("2026-10-17T00:01:00Z"),
    createdAt: new Date("2026-10-17T00:00:00Z"),
    ...overrides,
  };
}

describe("shared projection snapshot token", () => {
  const scope = { tenantId: "tenant-1", userId: 9 };
  const asOf = "2026-10-17T00:00:00.000Z";

  it("binds one expiring as-of token to the authenticated tenant and user", () => {
    const token = encodeProjectionSnapshotToken(scope, asOf, Date.now() + 60_000);
    expect(decodeProjectionSnapshotToken(token, scope)).toMatchObject({ tenantId: "tenant-1", userId: 9, asOf });
    expect(() => decodeProjectionSnapshotToken(token, { ...scope, tenantId: "tenant-2" }))
      .toThrowError(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
  });

  it("rejects tampered and expired snapshot tokens", () => {
    const token = encodeProjectionSnapshotToken(scope, asOf, Date.now() + 60_000);
    expect(() => decodeProjectionSnapshotToken(`${token}x`, scope)).toThrowError(expect.objectContaining({ code: "SNAPSHOT_INVALID" }));
    const expired = encodeProjectionSnapshotToken(scope, asOf, Date.now() - 1);
    expect(() => decodeProjectionSnapshotToken(expired, scope)).toThrowError(expect.objectContaining({ code: "SNAPSHOT_EXPIRED" }));
  });
});

describe("projectRunnerTimelineEvent", () => {
  it("projects bound recovery facts and excludes raw runner identity payloads", () => {
    const event = projectRunnerTimelineEvent({
      id: "runner-event-1",
      sessionId: "runner-session-1",
      eventType: "recovery_inventory_observed",
      sequence: 4,
      createdAt: new Date("2026-10-17T00:03:00Z"),
      payloadJson: {
        reportedState: "suspended",
        processIdentity: "secret-process-identity",
        hostIdentity: "private-host-name",
        bearerToken: "secret-value",
      },
    }, 2);

    expect(event).toMatchObject({
      id: "runner-session:runner-event-1",
      source: { kind: "runner_execution_session_event", reference: "runner-event-1", sessionId: "runner-session-1", sequence: 4 },
      type: "recovery_inventory_observed",
      at: "2026-10-17T00:03:00.000Z",
      attempt: 2,
      phase: "suspended",
      reasonCode: null,
      correction: null,
    });
    expect(JSON.stringify(event)).not.toContain("secret-process-identity");
    expect(JSON.stringify(event)).not.toContain("private-host-name");
    expect(JSON.stringify(event)).not.toContain("secret-value");
  });
});

describe("projectJobSettlementMarker", () => {
  it("shows a durable marker without treating result payload as monetary settlement", () => {
    const marker = projectJobSettlementMarker({
      id: "settlement-row-1",
      attemptId: "attempt-1",
      settlementType: "result",
      committedAt: new Date("2026-10-17T00:04:00Z"),
    });
    expect(marker).toEqual({
      source: { kind: "worker_job_settlement", reference: "settlement-row-1" },
      attemptId: "attempt-1",
      type: "result",
      committedAt: "2026-10-17T00:04:00.000Z",
      monetaryAmount: null,
      meaning: "durable_marker_only",
    });
  });
});

describe("projectEconomicSettlementEvidence", () => {
  const event = {
    id: "economic-event-1",
    workerJobId: "job-1",
    attemptId: "attempt-1",
    eventType: "runner_receipt_economically_settled",
    policyVersion: "economic-receipt-verification-v1",
    createdAt: new Date("2026-10-17T00:04:00Z"),
  };

  it("projects verified provider capture from the job-bound economic event", () => {
    expect(projectEconomicSettlementEvidence({ ...event, payloadJson: {
      classification: "provider_metered",
      capturedMinorUnits: 125,
      currency: "usd",
      providerUsageRef: "secret-provider-ref",
      runnerSessionId: "secret-session",
    } })).toEqual({
      source: { kind: "economic_event", reference: "economic-event-1" },
      workerJobId: "job-1",
      attemptId: "attempt-1",
      status: "settled",
      classification: "provider_metered",
      reasonCode: null,
      capturedMinorUnits: 125,
      currency: "USD",
      policyVersion: "economic-receipt-verification-v1",
      createdAt: "2026-10-17T00:04:00.000Z",
      meaning: "verified_provider_metered_capture",
    });
  });

  it("does not present approved subscription evidence as platform spend", () => {
    const projection = projectEconomicSettlementEvidence({ ...event, payloadJson: {
      classification: "approved_subscription",
      capturedMinorUnits: 0,
      currency: "USD",
      subscriptionRef: "private-subscription-ref",
    } });
    expect(projection).toMatchObject({ classification: "approved_subscription", capturedMinorUnits: null, currency: null, meaning: "approved_subscription_no_platform_capture" });
    expect(projection).not.toHaveProperty("subscriptionRef");
  });

  it("keeps reconciliation reasons to a bounded safe code", () => {
    const projection = projectEconomicSettlementEvidence({
      ...event,
      eventType: "runner_receipt_reconciliation_required",
      payloadJson: { reasonCode: "ACCOUNTING_VERIFIER_UNAVAILABLE", evidenceRef: "private-ref" },
    });
    expect(projection).toMatchObject({ status: "reconciliation_required", classification: "unknown", reasonCode: "ACCOUNTING_VERIFIER_UNAVAILABLE", capturedMinorUnits: null });
    expect(projection).not.toHaveProperty("evidenceRef");
  });
});

describe("aggregateTaskObservability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unbounded tenant-wide aggregation", async () => {
    await expect(aggregateTaskObservability({ scope: { tenantId: "tenant-1", userId: 9 } }))
      .rejects.toMatchObject({ code: "SCOPE_REQUIRED" });
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("unions replayed reservation identities and applies an append-only correction once", async () => {
    const job = {
      id: "job-1",
      requestedByUserId: 9,
      tenantId: "tenant-1",
      createdAt: new Date("2026-10-17T00:00:00Z"),
      inputJson: { projectId: "project-1", specId: "SPEC-277" },
      progressJson: {},
    };
    mocks.rows = [
      [job],
      [{ id: "settlement-1", workerJobId: "job-1", attemptId: "attempt-1", settlementType: "result", committedAt: new Date("2026-10-17T00:01:30Z") }],
      [{ id: "economic-1", workerJobId: "job-1", attemptId: "attempt-1", eventType: "runner_receipt_economically_settled", policyVersion: "v1", createdAt: new Date("2026-10-17T00:01:45Z"), payloadJson: { classification: "provider_metered", capturedMinorUnits: 125, currency: "USD" } }],
      [reservation(), reservation({ id: "reservation-replay", attemptId: "attempt-2" })],
      [{ workerJobId: "job-1", id: "correction-1", createdAt: new Date("2026-10-17T00:02:00Z"), payloadJson: {
        modelCallId: "call-1", correctedAt: "2026-10-17T00:02:00Z", correctedUsage: { inputTokens: 13, outputTokens: 3, cachedInputTokens: 4 },
      } }],
      [],
    ];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));

    const scope = { tenantId: "tenant-1", userId: 9 };
    const projectionToken = encodeProjectionSnapshotToken(scope, "2026-10-17T00:03:00.000Z", Date.now() + 60_000);
    const result = await aggregateTaskObservability({ scope, projectId: "project-1", specId: "SPEC-277", projectionToken });

    expect(result.asOf).toBe("2026-10-17T00:03:00.000Z");
    expect(result.projectionSnapshot).toMatchObject({ token: projectionToken, asOf: result.asOf });
    expect(result.observedJobCount).toBe(1);
    expect(result.usage.completeTotalTokens).toBe(16);
    expect(result.usage.counts).toMatchObject({ received: 2, unique: 1, corrections: 1, replayed: 1 });
    expect(result.resourceEstimates.reservedTokenEstimate).toBe(100);
    expect(result.resourceEstimates.observedReservationCount).toBe(1);
    expect(result.jobSettlementMarkers).toMatchObject({ observedCount: 1, byType: [{ type: "result", count: 1 }], capped: false });
    expect(result.economicSettlementEvidence).toMatchObject({ observedEventCount: 1, settledCount: 1, reconciliationRequiredCount: 0, byClassification: [{ classification: "provider_metered", count: 1 }], capturedProviderAmounts: [{ currency: "USD", capturedMinorUnits: 125 }], capped: false });
    expect(result.usage.receipts[0].sourceRefs).toContainEqual({ kind: "canonical_correction_event", reference: "correction-1", rationale: null });
    expect(result.usage.receipts[0].sourceRefs).toContainEqual({ kind: "worker_job_provider_reservation", reference: "reservation-replay", rationale: null });
  });

  it("withholds a complete project total when the bounded job window is capped", async () => {
    const jobs = Array.from({ length: 501 }, (_, index) => ({
      id: `job-${index}`,
      requestedByUserId: 9,
      tenantId: "tenant-1",
      createdAt: new Date("2026-10-17T00:00:00Z"),
      inputJson: { projectId: "project-1" },
      progressJson: {},
    }));
    mocks.rows = [jobs, [], [], [], [], []];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));

    const result = await aggregateTaskObservability({ scope: { tenantId: "tenant-1", userId: 9 }, projectId: "project-1" });

    expect(result.observedJobCount).toBe(500);
    expect(result.usage.completeTotalTokens).toBeNull();
    expect(result.usage.coverage.status).toBe("CAPPED");
  });
});


describe("task acceptance detail authorization", () => {
  it("does not project an unavailable or unauthorized job", async () => {
    mocks.db.select.mockImplementation(() => query([]));
    await expect(getTaskObservabilityDetail({ scope: { tenantId: "tenant-1", userId: 9 }, jobId: "missing" }))
      .rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("adds the shared projection without trusting job-supplied completion claims", async () => {
    const job = {
      id: "job-1", jobType: "spec224.development", status: "succeeded", attempt: 1, maxAttempts: 2,
      requestedByUserId: 9, tenantId: "tenant-1", createdAt: new Date("2026-10-17T00:00:00Z"),
      inputJson: { goalStatus: "COMPLETE", testsPassed: 999, goalBaseline: { goalId: "fake" } },
      progressJson: {}, workerId: null,
    };
    mocks.rows = [[job], [], [], [], [], []];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));
    const result = await getTaskObservabilityDetail({ scope: { tenantId: "tenant-1", userId: 9 }, jobId: "job-1" });
    expect(result.acceptance.scopeCompletionStatus).toBe("unknown");
    expect(result.acceptance.verification.testsPassed).toBeNull();
    expect(result.acceptance.goal.verifiedPercent).toBeNull();
    expect(result.acceptance.sdkUsage.historical.completeTotalTokens).toBeNull();
    expect(result.acceptance.graph.references).toEqual([{ kind: "job", id: "job-1" }]);
    expect(result.acceptance.verifiedLiveAcceptance).toBe(false);
  });
});

describe("developer harness output projection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only sanitized, owner-scoped harness events from the canonical job event stream", async () => {
    mocks.rows = [
      [{ id: "job-1" }],
      [{
        id: "event-1", eventSequence: 12, attempt: 1, createdAt: new Date("2026-10-29T08:00:00Z"),
        payloadJson: { harnessEvent: { kind: "tool_result", name: "command", text: "Tests passed token=secret-value", secret: "must not leak" } },
      }, {
        id: "event-2", eventSequence: 13, attempt: 1, createdAt: new Date("2026-10-29T08:00:01Z"),
        payloadJson: { harnessEvent: { kind: "private_reasoning", text: "not user-visible" } },
      }],
    ];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));

    const result = await getTaskHarnessOutputEvents({
      scope: { tenantId: "tenant-1", userId: 9 }, jobId: "job-1", afterSequence: 10,
    });

    expect(result).toMatchObject({ jobId: "job-1", hasMore: false, nextSequence: 13 });
    expect(result.events).toEqual([{
      id: "event-1", sequence: 12, at: "2026-10-29T08:00:00.000Z", attempt: 1,
      kind: "tool_result", text: "Tests passed [redacted]", name: "command", chunkIndex: 0, chunkCount: 1,
    }]);
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(JSON.stringify(result)).not.toContain("not user-visible");
  });

  it("does not query output events for a job outside the authenticated tenant/user scope", async () => {
    mocks.db.select.mockImplementation(() => query([]));
    await expect(getTaskHarnessOutputEvents({
      scope: { tenantId: "tenant-1", userId: 9 }, jobId: "other-job",
    })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });
});
