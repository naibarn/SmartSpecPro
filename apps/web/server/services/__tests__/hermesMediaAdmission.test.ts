import { describe, expect, it, vi } from "vitest";

import {
  buildHermesQuotaKey,
  checkHermesMediaAdmission,
  HERMES_MAX_ADMISSION_BATCH_SIZE,
  validateHermesLimitCoherence,
  type HermesAdmissionCounters,
  type HermesAdmissionDeps,
  type HermesAdmissionLimits,
  type HermesSlidingWindowCheckResult,
} from "../hermesMediaAdmission";
import type { HermesProviderConnection } from "../../../drizzle/schema";
import type { HermesWorkerSettings } from "../hermesWorkerSettings";

const TENANT_ID = "tenant-1";
const USER_ID = 1;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function buildConnection(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
  return {
    id: "conn-1",
    tenantId: TENANT_ID,
    ownerUserId: USER_ID,
    scope: "server_personal",
    providerType: "xai_grok",
    adapterType: "hermes_cli",
    authenticationType: "oauth_device_code",
    status: "authorized",
    assignedWorkerId: "worker-1",
    profileReference: "conn_conn-1",
    accountLabel: null,
    accountHint: "grok-user",
    entitlementStatus: null,
    capabilitiesJson: null,
    defaultForImage: false,
    defaultForVideo: false,
    dailyJobQuota: null,
    metadataJson: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastProbeAt: null,
    disconnectedAt: null,
    ...overrides,
  } as HermesProviderConnection;
}

const DEFAULT_SETTINGS: HermesWorkerSettings = {
  enabled: true,
  sharedPoolEnabled: true,
  serverPersonalEnabled: true,
  privateEnabled: true,
  videoEnabled: true,
  sharedPoolFeeCredits: 0,
  maxRunningPerConnection: 1,
  maxConcurrentPerSharedWorker: 2,
  maxQueuedPerUser: 8,
  maxQueuedPerTenantSharedPool: 20,
  submitWindowPerUser: 10,
  submitWindowPerTenant: 60,
  minHermesVersion: "",
  sharedWorkerId: "shared-worker-1",
  webProcessWorkerEnabled: false,
};

function buildCounters(overrides: Partial<HermesAdmissionCounters> = {}): HermesAdmissionCounters {
  return {
    countRunningForConnection: vi.fn().mockResolvedValue(0),
    countQueuedForUser: vi.fn().mockResolvedValue(0),
    countQueuedForTenantSharedPool: vi.fn().mockResolvedValue(0),
    checkAndIncrementSlidingWindow: vi.fn().mockResolvedValue({ allowed: true } as HermesSlidingWindowCheckResult),
    getDailyQuotaUsage: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<{ settings: HermesWorkerSettings; counters: Partial<HermesAdmissionCounters> }> = {},
): HermesAdmissionDeps {
  const settings = overrides.settings ?? DEFAULT_SETTINGS;
  const counters = buildCounters(overrides.counters ?? {});
  return {
    getSettings: vi.fn().mockResolvedValue(settings),
    counters,
    now: () => NOW,
  };
}

describe("checkHermesMediaAdmission", () => {
  it("rejects with HERMES_CONNECTION_BUSY when a job is already running on the connection (running=1)", async () => {
    const deps = buildDeps({ counters: { countRunningForConnection: vi.fn().mockResolvedValue(1) } });

    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
      deps,
    );

    expect(result).toEqual({ ok: false, code: "HERMES_CONNECTION_BUSY" });
  });

  it("admits the 8th queued job for a user but rejects the 9th (default cap 8)", async () => {
    const admitDeps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(7) } });
    const admitResult = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
      admitDeps,
    );
    expect(admitResult).toEqual({ ok: true });

    const rejectDeps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(8) } });
    const rejectResult = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
      rejectDeps,
    );
    expect(rejectResult).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
  });

  it("applies the tenant shared-pool queued cap (20) only to server_shared connections", async () => {
    const sharedConnection = buildConnection({ scope: "server_shared", dailyJobQuota: null });
    const overCapDeps = buildDeps({
      counters: { countQueuedForTenantSharedPool: vi.fn().mockResolvedValue(20) },
    });
    const rejected = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: sharedConnection, operation: "image.generate" },
      overCapDeps,
    );
    expect(rejected).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });

    // A private_worker connection is exempt from the tenant cap even when
    // the injected counter reports the tenant pool is "full" — the counter
    // must never even be consulted for a non-shared scope in a way that
    // blocks it.
    const privateConnection = buildConnection({ scope: "private_worker" });
    const countQueuedForTenantSharedPool = vi.fn().mockResolvedValue(9999);
    const exemptDeps = buildDeps({ counters: { countQueuedForTenantSharedPool } });
    const admitted = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: privateConnection, operation: "image.generate" },
      exemptDeps,
    );
    expect(admitted).toEqual({ ok: true });
    expect(countQueuedForTenantSharedPool).not.toHaveBeenCalled();
  });

  it("rejects with HERMES_RATE_LIMITED and a positive retryAfterSeconds on the 11th sliding-window submission", async () => {
    const checkAndIncrementSlidingWindow = vi
      .fn()
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 } as HermesSlidingWindowCheckResult);
    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });

    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
      deps,
    );

    expect(result).toEqual({ ok: false, code: "HERMES_RATE_LIMITED", retryAfterSeconds: 42 });
    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
      `hermes:submit:user:${USER_ID}`,
      600,
      DEFAULT_SETTINGS.submitWindowPerUser,
      1,
    );
  });

  it("private_worker connections are still subject to the per-user sliding window and running=1", async () => {
    const checkAndIncrementSlidingWindow = vi
      .fn()
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 } as HermesSlidingWindowCheckResult);
    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });

    const result = await checkHermesMediaAdmission(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        connection: buildConnection({ scope: "private_worker" }),
        operation: "image.generate",
      },
      deps,
    );

    expect(result).toEqual({ ok: false, code: "HERMES_RATE_LIMITED", retryAfterSeconds: 10 });
  });

  it("exempts private_worker connections from the tenant-wide sliding window", async () => {
    const checkAndIncrementSlidingWindow = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true } as HermesSlidingWindowCheckResult); // user window
    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });

    const result = await checkHermesMediaAdmission(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        connection: buildConnection({ scope: "private_worker" }),
        operation: "image.generate",
      },
      deps,
    );

    expect(result).toEqual({ ok: true });
    // Only the per-user window was consulted — never the tenant window.
    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledTimes(1);
    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
      `hermes:submit:user:${USER_ID}`,
      600,
      DEFAULT_SETTINGS.submitWindowPerUser,
      1,
    );
  });

  it("rejects with HERMES_QUOTA_EXHAUSTED when a shared connection is at its dailyJobQuota", async () => {
    const connection = buildConnection({ scope: "server_shared", dailyJobQuota: 10 });
    const deps = buildDeps({ counters: { getDailyQuotaUsage: vi.fn().mockResolvedValue(10) } });

    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection, operation: "image.generate" },
      deps,
    );

    expect(result).toEqual({ ok: false, code: "HERMES_QUOTA_EXHAUSTED" });
  });

  it("does not enforce a dailyJobQuota when the connection has none configured", async () => {
    const connection = buildConnection({ scope: "server_shared", dailyJobQuota: null });
    const getDailyQuotaUsage = vi.fn().mockResolvedValue(9999);
    const deps = buildDeps({ counters: { getDailyQuotaUsage } });

    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection, operation: "image.generate" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(getDailyQuotaUsage).not.toHaveBeenCalled();
  });

  it("admits a batchSize: 4 portrait-candidate batch in one call under default caps, counting each candidate individually", async () => {
    const countQueuedForUser = vi.fn().mockResolvedValue(0);
    const checkAndIncrementSlidingWindow = vi.fn().mockResolvedValue({ allowed: true } as HermesSlidingWindowCheckResult);
    const deps = buildDeps({ counters: { countQueuedForUser, checkAndIncrementSlidingWindow } });

    const result = await checkHermesMediaAdmission(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        connection: buildConnection(),
        operation: "image.generate",
        batchSize: 4,
      },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
      `hermes:submit:user:${USER_ID}`,
      600,
      DEFAULT_SETTINGS.submitWindowPerUser,
      4,
    );
  });

  it("rejects a batch that would push the queued-per-user count over the cap (admit all or none)", async () => {
    // 6 already queued + batch of 4 = 10 > default cap 8.
    const deps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(6) } });

    const result = await checkHermesMediaAdmission(
      {
        tenantId: TENANT_ID,
        userId: USER_ID,
        connection: buildConnection(),
        operation: "image.generate",
        batchSize: 4,
      },
      deps,
    );

    expect(result).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
  });

  it("respects an admin override of the queued-per-user cap (e.g. 12)", async () => {
    const overriddenSettings: HermesWorkerSettings = { ...DEFAULT_SETTINGS, maxQueuedPerUser: 12 };
    // 9 already queued — would reject under the default cap (8) but admits
    // under the admin override (12).
    const deps = buildDeps({ settings: overriddenSettings, counters: { countQueuedForUser: vi.fn().mockResolvedValue(9) } });

    const result = await checkHermesMediaAdmission(
      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
      deps,
    );

    expect(result).toEqual({ ok: true });
  });
});

describe("checkHermesMediaAdmission — weighted queued counts (code review FIX 2)", () => {
  it("submitting outputCount:4 batches against cap 8 admits exactly 2 (existing rows weighted by outputCount, not counted 1-each)", async () => {
    // Simulates the FIXED counter: a queued outputCount:4 row weighs 4
    // against the cap (the production fix sums `inputJson.settings.
    // outputCount` in SQL) — NOT 1, which would let 8 separate outputCount:4
    // batches (32 total outputs) all admit against a cap of 8.
    let weightedQueuedCount = 0;
    const countQueuedForUser = vi.fn().mockImplementation(async () => weightedQueuedCount);
    const deps = buildDeps({ counters: { countQueuedForUser } });

    const submitBatchOfFour = () =>
      checkHermesMediaAdmission(
        {
          tenantId: TENANT_ID,
          userId: USER_ID,
          connection: buildConnection(),
          operation: "image.generate",
          batchSize: 4,
        },
        deps,
      );

    const first = await submitBatchOfFour();
    expect(first).toEqual({ ok: true });
    weightedQueuedCount += 4; // the row(s) just "inserted" now weigh 4, not 1

    const second = await submitBatchOfFour();
    expect(second).toEqual({ ok: true });
    weightedQueuedCount += 4;

    // A 3rd outputCount:4 batch would push weighted usage to 12 > cap 8.
    const third = await submitBatchOfFour();
    expect(third).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });

    expect(countQueuedForUser).toHaveBeenCalledTimes(3);
  });
});

describe("validateHermesLimitCoherence", () => {
  function limits(overrides: Partial<HermesAdmissionLimits> = {}): HermesAdmissionLimits {
    return {
      maxRunningPerConnection: 1,
      maxQueuedPerUser: 8,
      maxQueuedPerTenantSharedPool: 20,
      submitWindowPerUser: 10,
      submitWindowPerTenant: 60,
      ...overrides,
    };
  }

  it("rejects a queued-per-user cap below the max batch size (4)", () => {
    const result = validateHermesLimitCoherence(limits({ maxQueuedPerUser: HERMES_MAX_ADMISSION_BATCH_SIZE - 1 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("passes the default configuration", () => {
    const result = validateHermesLimitCoherence(limits());
    expect(result).toEqual({ ok: true });
  });

  it("passes when the queued-per-user cap equals exactly the max batch size", () => {
    const result = validateHermesLimitCoherence(limits({ maxQueuedPerUser: HERMES_MAX_ADMISSION_BATCH_SIZE }));
    expect(result).toEqual({ ok: true });
  });
});

describe("buildHermesQuotaKey", () => {
  it("builds the documented `hermes:quota:<connectionId>:<YYYY-MM-DD>` shape", () => {
    expect(buildHermesQuotaKey("conn-1", "2026-06-01")).toBe("hermes:quota:conn-1:2026-06-01");
  });
});
