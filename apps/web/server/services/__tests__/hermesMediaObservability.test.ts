import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogger } from "../auditLogger";
import {
  __resetHermesUsageProviderIdCacheForTests,
  auditHermesAdmissionRejected,
  auditHermesConnectStarted,
  auditHermesConnectionAuthorized,
  auditHermesConnectionDisconnected,
  auditHermesConnectionEntitlementRestricted,
  auditHermesConnectionRevoked,
  auditHermesSubmit,
  auditHermesUsageRecorded,
  recordHermesUsage,
  resolveHermesUsageProviderId,
  type HermesUsageCounterStore,
  type HermesUsageRepo,
} from "../hermesMediaObservability";
import { buildHermesQuotaKey, checkHermesMediaAdmission, type HermesAdmissionCounters } from "../hermesMediaAdmission";
import type { HermesMediaErrorCode } from "../../../shared/hermesMedia";
import type { HermesProviderConnection } from "../../../drizzle/schema";

const TENANT_ID = "tenant-1";
const USER_ID = 42;

function spyAuditLog() {
  return vi.spyOn(auditLogger, "log").mockImplementation(() => {});
}

describe("hermesMediaObservability — connection lifecycle audit helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("auditHermesConnectStarted emits hermes_connection_connect_started with ids only", () => {
    const spy = spyAuditLog();
    auditHermesConnectStarted({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1", scope: "server_personal", traceId: "trace-1" });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "hermes_connection_connect_started",
        userId: USER_ID,
        traceId: "trace-1",
        metadata: expect.objectContaining({ tenantId: TENANT_ID, connectionId: "conn-1", scope: "server_personal" }),
      }),
    );
  });

  it("auditHermesConnectionAuthorized emits hermes_connection_authorized", () => {
    const spy = spyAuditLog();
    auditHermesConnectionAuthorized({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_authorized" }));
  });

  it("auditHermesConnectionDisconnected emits hermes_connection_disconnected", () => {
    const spy = spyAuditLog();
    auditHermesConnectionDisconnected({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_disconnected" }));
  });

  it("auditHermesConnectionRevoked emits hermes_connection_revoked", () => {
    const spy = spyAuditLog();
    auditHermesConnectionRevoked({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_revoked" }));
  });

  it("auditHermesConnectionEntitlementRestricted emits hermes_connection_entitlement_restricted", () => {
    const spy = spyAuditLog();
    auditHermesConnectionEntitlementRestricted({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_connection_entitlement_restricted" }));
  });

  it("no connection-lifecycle event ever contains a device userCode/verificationUrl", () => {
    const spy = spyAuditLog();
    auditHermesConnectStarted({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    auditHermesConnectionAuthorized({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    auditHermesConnectionDisconnected({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    auditHermesConnectionRevoked({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });
    auditHermesConnectionEntitlementRestricted({ userId: USER_ID, tenantId: TENANT_ID, connectionId: "conn-1" });

    for (const call of spy.mock.calls) {
      const metadata = (call[0] as { metadata?: Record<string, unknown> }).metadata ?? {};
      expect(metadata).not.toHaveProperty("userCode");
      expect(metadata).not.toHaveProperty("verificationUrl");
      expect(JSON.stringify(metadata)).not.toMatch(/userCode|verificationUrl/i);
    }
  });
});

describe("hermesMediaObservability — auditHermesSubmit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits hermes_media_job_submitted with ids/enums only — never prompt or url keys", () => {
    const spy = spyAuditLog();
    auditHermesSubmit({
      traceId: "trace-1",
      userId: USER_ID,
      tenantId: TENANT_ID,
      jobId: "job-1",
      jobType: "hermes_media_image_generate",
      connectionId: "conn-1",
      scope: "server_shared",
      operation: "image.generate",
      batchSize: 2,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = spy.mock.calls[0][0] as { eventType: string; metadata: Record<string, unknown> };
    expect(entry.eventType).toBe("hermes_media_job_submitted");
    expect(entry.metadata).toMatchObject({
      tenantId: TENANT_ID,
      jobId: "job-1",
      jobType: "hermes_media_image_generate",
      connectionId: "conn-1",
      scope: "server_shared",
      operation: "image.generate",
      batchSize: 2,
    });
    expect(entry.metadata).not.toHaveProperty("prompt");
    expect(entry.metadata).not.toHaveProperty("url");
    expect(entry.metadata).not.toHaveProperty("referenceUrls");
  });
});

describe("hermesMediaObservability — auditHermesAdmissionRejected", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const codes: Array<{ code: HermesMediaErrorCode; retryAfterSeconds?: number }> = [
    { code: "HERMES_QUEUE_FULL" },
    { code: "HERMES_RATE_LIMITED", retryAfterSeconds: 42 },
    { code: "HERMES_QUOTA_EXHAUSTED" },
  ];

  it.each(codes)("emits hermes_media_admission_rejected with the exact code ($code)", ({ code, retryAfterSeconds }) => {
    const spy = spyAuditLog();
    auditHermesAdmissionRejected({
      traceId: "trace-1",
      userId: USER_ID,
      tenantId: TENANT_ID,
      connectionId: "conn-1",
      code,
      retryAfterSeconds,
    });

    const entry = spy.mock.calls[0][0] as { eventType: string; metadata: Record<string, unknown> };
    expect(entry.eventType).toBe("hermes_media_admission_rejected");
    expect(entry.metadata.code).toBe(code);
    if (retryAfterSeconds !== undefined) {
      expect(entry.metadata.retryAfterSeconds).toBe(retryAfterSeconds);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// recordHermesUsage
// ────────────────────────────────────────────────────────────────────────

function buildCompletedJob(overrides: Partial<Parameters<typeof recordHermesUsage>[0]["job"]> = {}) {
  return {
    id: "job-1",
    tenantId: TENANT_ID,
    requestedByUserId: USER_ID,
    status: "completed",
    capabilityRequirementsJson: { connectionId: "conn-1" },
    instructionsJson: { traceId: "trace-enqueue-1" },
    ...overrides,
  };
}

function buildFakeUsageRepo(overrides: Partial<HermesUsageRepo> = {}): HermesUsageRepo {
  const markedJobIds = new Set<string>();
  return {
    findProviderIdByName: vi.fn().mockResolvedValue(null),
    insertProviderRow: vi.fn().mockResolvedValue({ id: 777 }),
    insertUsageLogRow: vi.fn().mockResolvedValue(undefined),
    // Real (in-memory) implementation by default — mirrors the durable
    // `worker_job_events` marker's actual "persists across calls" behavior,
    // so tests can share ONE repo across two `recordHermesUsage` calls
    // (simulating the completion-callback + sweep call sites) while
    // swapping out `counters` (simulating a Redis reset/outage between
    // them) to prove the DB-level backstop (code review FIX 2b).
    hasUsageRecordedMarker: vi.fn().mockImplementation(async (jobId: string) => markedJobIds.has(jobId)),
    insertUsageRecordedMarker: vi.fn().mockImplementation(async (jobId: string) => {
      markedJobIds.add(jobId);
    }),
    ...overrides,
  };
}

function buildFakeCounterStore(overrides: Partial<HermesUsageCounterStore> = {}): HermesUsageCounterStore {
  const recorded = new Set<string>();
  return {
    markUsageRecordedIfNew: vi.fn().mockImplementation(async (jobId: string) => {
      if (recorded.has(jobId)) return false;
      recorded.add(jobId);
      return true;
    }),
    incrementDailyQuota: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("recordHermesUsage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetHermesUsageProviderIdCacheForTests();
  });

  it("writes exactly one provider_usage_log row for a completed job, resolving the xai-hermes provider (find-or-create)", async () => {
    const spy = spyAuditLog();
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();

    await recordHermesUsage(
      { job: buildCompletedJob(), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 3 },
      { repo, counters },
    );

    expect(repo.findProviderIdByName).toHaveBeenCalledWith("xai-hermes");
    expect(repo.insertProviderRow).toHaveBeenCalledWith(
      expect.objectContaining({ providerName: "xai-hermes" }),
    );
    expect(repo.insertUsageLogRow).toHaveBeenCalledTimes(1);
    expect(repo.insertUsageLogRow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        providerId: 777,
        modelUsed: "grok-image-1",
        costUsd: "0",
        creditsCharged: 3,
        requestType: "hermes_media",
        traceId: "trace-enqueue-1",
        statusCode: 200,
      }),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: "hermes_media_usage_recorded" }));
  });

  it("never creates the provider row as routable/enabled", async () => {
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();
    await recordHermesUsage(
      { job: buildCompletedJob(), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );
    expect(repo.insertProviderRow).toHaveBeenCalledWith(
      expect.not.objectContaining({ hasApiKey: true }),
    );
  });

  it("caches the resolved provider id across repeated calls (module-level cache)", async () => {
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();

    await recordHermesUsage(
      { job: buildCompletedJob({ id: "job-a" }), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );
    await recordHermesUsage(
      { job: buildCompletedJob({ id: "job-b" }), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );

    expect(repo.findProviderIdByName).toHaveBeenCalledTimes(1);
    expect(repo.insertProviderRow).toHaveBeenCalledTimes(1);
  });

  it("bumps the SAME daily quota counter key checkHermesMediaAdmission reads (writer and reader share one key)", async () => {
    const quotaState = new Map<string, number>();
    const dateKey = "2026-06-01";
    const now = () => new Date(`${dateKey}T00:00:00.000Z`);

    const counters = buildFakeCounterStore({
      incrementDailyQuota: vi.fn().mockImplementation(async (connectionId: string, key: string) => {
        const quotaKey = buildHermesQuotaKey(connectionId, key);
        quotaState.set(quotaKey, (quotaState.get(quotaKey) ?? 0) + 1);
      }),
    });
    const repo = buildFakeUsageRepo();

    await recordHermesUsage(
      { job: buildCompletedJob(), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters, now },
    );

    const expectedKey = buildHermesQuotaKey("conn-1", dateKey);
    expect(quotaState.get(expectedKey)).toBe(1);

    const admissionCounters: HermesAdmissionCounters = {
      countRunningForConnection: vi.fn().mockResolvedValue(0),
      countQueuedForUser: vi.fn().mockResolvedValue(0),
      countQueuedForTenantSharedPool: vi.fn().mockResolvedValue(0),
      checkAndIncrementSlidingWindow: vi.fn().mockResolvedValue({ allowed: true }),
      getDailyQuotaUsage: vi.fn().mockImplementation(async (connectionId: string, key: string) => (
        quotaState.get(buildHermesQuotaKey(connectionId, key)) ?? 0
      )),
    };

    const connection = { id: "conn-1", scope: "server_shared", dailyJobQuota: 1 } as unknown as HermesProviderConnection;
    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection, operation: "image.generate" },
      { counters: admissionCounters, now },
    );

    expect(result).toEqual({ ok: false, code: "HERMES_QUOTA_EXHAUSTED" });
  });

  it("is idempotent — double invocation (poll path + sweep path) writes one usage row and one increment", async () => {
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();
    const job = buildCompletedJob();

    await recordHermesUsage({ job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 }, { repo, counters });
    await recordHermesUsage({ job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 }, { repo, counters });

    expect(repo.insertUsageLogRow).toHaveBeenCalledTimes(1);
    expect(counters.incrementDailyQuota).toHaveBeenCalledTimes(1);
  });

  it("code review FIX 2b: sweep-after-poll does not double-record even when Redis has no memory of the first call", async () => {
    const repo = buildFakeUsageRepo(); // shared DB-backed marker across both calls
    const job = buildCompletedJob();

    // First call — simulates the completion-callback (poll) path.
    const firstCallCounters = buildFakeCounterStore();
    await recordHermesUsage(
      { job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters: firstCallCounters },
    );

    // Second call — simulates the 60s sweep, with a FRESH counters instance
    // (as if Redis had no memory of the first call at all — e.g. a
    // different process, or the key already expired). The durable DB
    // marker (shared `repo`) must still short-circuit BEFORE Redis is ever
    // consulted.
    const secondCallCounters = buildFakeCounterStore();
    await recordHermesUsage(
      { job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters: secondCallCounters },
    );

    expect(repo.insertUsageLogRow).toHaveBeenCalledTimes(1);
    expect(repo.insertUsageRecordedMarker).toHaveBeenCalledTimes(1);
    expect(secondCallCounters.markUsageRecordedIfNew).not.toHaveBeenCalled();
  });

  it("code review FIX 2b: a Redis error (fail-open) on the second invocation does not duplicate the usage row — the DB marker gates first", async () => {
    const repo = buildFakeUsageRepo();
    const job = buildCompletedJob();
    const counters = buildFakeCounterStore();

    await recordHermesUsage(
      { job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );

    // Second call — Redis erroring and failing OPEN (the real
    // `redisMarkUsageRecordedIfNew` returns `true` = "proceed" on any
    // error, per its own doc comment) would, on its own, re-admit this job.
    // The DB marker check runs BEFORE this counters call, so it never even
    // reaches the (fail-open) Redis check.
    const erroringCounters = buildFakeCounterStore({
      markUsageRecordedIfNew: vi.fn().mockResolvedValue(true),
    });
    await recordHermesUsage(
      { job, contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters: erroringCounters },
    );

    expect(repo.insertUsageLogRow).toHaveBeenCalledTimes(1);
    expect(erroringCounters.markUsageRecordedIfNew).not.toHaveBeenCalled();
  });

  it("failed jobs never write a usage row or bump quota", async () => {
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();
    await recordHermesUsage(
      { job: buildCompletedJob({ status: "failed" }), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );
    expect(repo.insertUsageLogRow).not.toHaveBeenCalled();
    expect(counters.incrementDailyQuota).not.toHaveBeenCalled();
  });

  it("canceled jobs never write a usage row or bump quota", async () => {
    const repo = buildFakeUsageRepo();
    const counters = buildFakeCounterStore();
    await recordHermesUsage(
      { job: buildCompletedJob({ status: "canceled" }), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
      { repo, counters },
    );
    expect(repo.insertUsageLogRow).not.toHaveBeenCalled();
    expect(counters.incrementDailyQuota).not.toHaveBeenCalled();
  });

  it("never throws — a usage-recording failure is logged/audited, not propagated", async () => {
    const repo = buildFakeUsageRepo({ insertUsageLogRow: vi.fn().mockRejectedValue(new Error("db down")) });
    const counters = buildFakeCounterStore();
    await expect(
      recordHermesUsage(
        { job: buildCompletedJob(), contract: { settings: { model: "grok-image-1" } }, feeCreditsKept: 0 },
        { repo, counters },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("resolveHermesUsageProviderId", () => {
  beforeEach(() => {
    __resetHermesUsageProviderIdCacheForTests();
  });

  it("reuses an existing xai-hermes provider row instead of inserting a duplicate", async () => {
    const repo = buildFakeUsageRepo({ findProviderIdByName: vi.fn().mockResolvedValue(123) });
    const id = await resolveHermesUsageProviderId(repo);
    expect(id).toBe(123);
    expect(repo.insertProviderRow).not.toHaveBeenCalled();
  });
});
