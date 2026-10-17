import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], db: { select: vi.fn() } }));

vi.mock("../../db", () => ({
  db: mocks.db,
  getDb: vi.fn(),
}));

import { aggregateTaskObservability, projectRunnerTimelineEvent } from "../taskObservabilityReadModel";

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
      [reservation(), reservation({ id: "reservation-replay", attemptId: "attempt-2" })],
      [{ workerJobId: "job-1", id: "correction-1", createdAt: new Date("2026-10-17T00:02:00Z"), payloadJson: {
        modelCallId: "call-1", correctedAt: "2026-10-17T00:02:00Z", correctedUsage: { inputTokens: 13, outputTokens: 3, cachedInputTokens: 4 },
      } }],
      [],
    ];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));

    const result = await aggregateTaskObservability({ scope: { tenantId: "tenant-1", userId: 9 }, projectId: "project-1", specId: "SPEC-277" });

    expect(result.observedJobCount).toBe(1);
    expect(result.usage.completeTotalTokens).toBe(16);
    expect(result.usage.counts).toMatchObject({ received: 2, unique: 1, corrections: 1, replayed: 1 });
    expect(result.resourceEstimates.reservedTokenEstimate).toBe(100);
    expect(result.resourceEstimates.observedReservationCount).toBe(1);
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
    mocks.rows = [jobs, [], [], []];
    mocks.db.select.mockImplementation(() => query(mocks.rows.shift() ?? []));

    const result = await aggregateTaskObservability({ scope: { tenantId: "tenant-1", userId: 9 }, projectId: "project-1" });

    expect(result.observedJobCount).toBe(500);
    expect(result.usage.completeTotalTokens).toBeNull();
    expect(result.usage.coverage.status).toBe("CAPPED");
  });
});
