/**
 * Feature 135 (Hermes Grok media worker) section 12 — admission load
 * assertion (spec §3.6). A fast, deterministic Vitest file (fake atomic
 * counter store + fake clock — NOT a wall-clock benchmark) proving the
 * admission limits hold under parallel submission through the REAL
 * `queueHermesMediaJob` + `checkHermesMediaAdmission` implementations (not
 * stand-ins), mirroring section-05's own semantics
 * (`hermesMediaAdmission.test.ts`) rather than inventing new ones.
 *
 * The serializing `withAdmissionLock` fake below mirrors the one already
 * proven in `hermesMediaScheduler.test.ts`'s own concurrency describe block
 * (code review FIX 1) — every scenario here uses a single connection/user,
 * so lock keys are identical across all concurrent calls and a single
 * promise chain is a faithful, sufficient serialization fake for the real
 * per-sorted-key Postgres advisory lock.
 */
import { describe, expect, it } from "vitest";

import {
  defaultHermesSchedulerRepo,
  queueHermesMediaJob,
  type HermesSchedulerRepository,
  type QueueHermesMediaJobDeps,
  type QueueHermesMediaJobInput,
} from "../hermesMediaScheduler";
import {
  buildHermesQuotaKey,
  checkHermesMediaAdmission,
  type HermesAdmissionCounters,
} from "../hermesMediaAdmission";
import {
  __resetHermesUsageProviderIdCacheForTests,
  recordHermesUsage,
  type HermesUsageCounterStore,
  type HermesUsageRepo,
} from "../hermesMediaObservability";
import type { HermesWorkerSettings } from "../hermesWorkerSettings";
import type { HermesProviderConnection, Worker } from "../../../drizzle/schema";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../../shared/featureFlags";

const TENANT_ID = "tenant-1";
const USER_ID = 1;
const NOW = new Date("2026-06-01T12:00:00.000Z");
const DATE_KEY = "2026-06-01";

function buildSettings(overrides: Partial<HermesWorkerSettings> = {}): HermesWorkerSettings {
  return {
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
    submitWindowPerUser: 1000,
    submitWindowPerTenant: 1000,
    minHermesVersion: "",
    sharedWorkerId: "shared-worker-1",
    webProcessWorkerEnabled: false,
    ...overrides,
  };
}

function buildFlags(): TenantFeatureFlags {
  return { ...FEATURE_FLAG_DEFAULTS, hermesMediaWorker: true };
}

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

function buildWorker(): Worker {
  return {
    id: "worker-1",
    tenantId: TENANT_ID,
    teamId: null,
    runtimeType: "hermes_agent_gateway",
    workerMode: "external_runtime",
    machineId: null,
    machineName: null,
    displayName: "Hermes worker",
    status: "online",
    runtimeVersion: "1.0.0",
    runtimeMode: "external_managed",
    runtimeProfileId: null,
    policyProfileId: null,
    externalReference: "hermes://worker-1",
    dashboardUrl: null,
    capabilitiesJson: {},
    hardwareJson: {},
    healthSummaryJson: {},
    warningFlagsJson: [],
    fileScopeMode: "workspace_scoped",
    lastSeenAt: NOW,
    registeredByUserId: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
  } as Worker;
}

function buildInput(overrides: Partial<QueueHermesMediaJobInput> = {}): QueueHermesMediaJobInput {
  return {
    contractVersion: 1,
    operation: "image.generate",
    connectionId: "conn-1",
    prompt: "a cat wearing sunglasses",
    settings: { model: "grok-image-1" },
    references: [],
    traceId: "trace-1",
    tenantId: TENANT_ID,
    requestedByUserId: USER_ID,
    ...overrides,
  };
}

/** Single-chain serializing fake for `withAdmissionLock` — sufficient (and
 *  faithful) here because every scenario below uses one connection/user, so
 *  the lock-key set is identical across all concurrent calls (see file
 *  header doc comment). */
function buildSerializingLock() {
  let chain: Promise<unknown> = Promise.resolve();
  return async <T,>(_keys: string[], fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(() => fn());
    chain = run.catch(() => undefined);
    return run;
  };
}

function buildLoadTestRepo(params: {
  connection: HermesProviderConnection;
  onInsert?: () => void;
}): HermesSchedulerRepository {
  const worker = buildWorker();
  const withAdmissionLock = buildSerializingLock();
  let insertedCount = 0;

  return {
    findConnectionById: async () => params.connection,
    listEligibleSharedConnections: async () => [],
    countQueuedForConnection: async () => 0,
    countRunningForConnection: async () => 0,
    isWorkerOnline: async () => true,
    findJobByIdempotencyKey: async () => null,
    findWorkerById: async () => worker,
    insertJob: async (values: Record<string, unknown>) => {
      insertedCount += 1;
      params.onInsert?.();
      return { id: `job-${insertedCount}`, ...values };
    },
    withAdmissionLock,
  };
}

function buildFakeUsageRepo(): HermesUsageRepo {
  return {
    findProviderIdByName: async () => 999,
    insertProviderRow: async () => ({ id: 999 }),
    insertUsageLogRow: async () => undefined,
    hasUsageRecordedMarker: async () => false,
    insertUsageRecordedMarker: async () => undefined,
  };
}

describe("Feature 135 section 12 — admission load assertion (queued cap)", () => {
  it("fires 50 concurrent submits against a queued-cap of 8 (single user, single shared connection): exactly 8 succeed, 42 reject HERMES_QUEUE_FULL, high-water mark never exceeds 8", async () => {
    const CAP = 8;
    const TOTAL = 50;
    const settings = buildSettings({ maxQueuedPerUser: CAP });
    const connection = buildConnection();

    let queuedWeight = 0;
    let highWaterMark = 0;

    const counters: HermesAdmissionCounters = {
      countRunningForConnection: async () => 0,
      countQueuedForUser: async () => queuedWeight,
      countQueuedForTenantSharedPool: async () => 0,
      checkAndIncrementSlidingWindow: async () => ({ allowed: true }),
      getDailyQuotaUsage: async () => 0,
    };

    const repo = buildLoadTestRepo({
      connection,
      onInsert: () => {
        queuedWeight += 1;
        highWaterMark = Math.max(highWaterMark, queuedWeight);
      },
    });

    const deps: QueueHermesMediaJobDeps = {
      repo,
      admission: (admissionParams) =>
        checkHermesMediaAdmission(admissionParams, { counters, getSettings: async () => settings, now: () => NOW }),
      getSettings: async () => settings,
      getFlags: async () => buildFlags(),
      now: () => NOW,
    };

    const results = await Promise.allSettled(
      Array.from({ length: TOTAL }, (_, i) => queueHermesMediaJob(buildInput({ idempotencyKey: `queued-cap-${i}` }), deps)),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(CAP);
    expect(rejected).toHaveLength(TOTAL - CAP);
    for (const result of rejected) {
      const reason = (result as PromiseRejectedResult).reason;
      expect(String(reason?.message ?? reason)).toMatch(/HERMES_QUEUE_FULL/);
    }
    expect(highWaterMark).toBeLessThanOrEqual(CAP);
    expect(queuedWeight).toBe(CAP);
  });

  it("concurrent batch submits (batchSize 4, cap 8): admitted batches are all-or-nothing; total admitted weight never exceeds the cap; no partial batch", async () => {
    const CAP = 8;
    const BATCH_SIZE = 4;
    const TOTAL_CALLS = 10; // 10 batches of 4 = 40 potential jobs, cap allows exactly 2 batches
    const settings = buildSettings({ maxQueuedPerUser: CAP });
    const connection = buildConnection();

    let queuedWeight = 0;
    const insertedWeights: number[] = [];

    const counters: HermesAdmissionCounters = {
      countRunningForConnection: async () => 0,
      countQueuedForUser: async () => queuedWeight,
      countQueuedForTenantSharedPool: async () => 0,
      checkAndIncrementSlidingWindow: async () => ({ allowed: true }),
      getDailyQuotaUsage: async () => 0,
    };

    const repo = buildLoadTestRepo({
      connection,
      onInsert: () => {
        queuedWeight += BATCH_SIZE;
        insertedWeights.push(BATCH_SIZE);
      },
    });

    const deps: QueueHermesMediaJobDeps = {
      repo,
      admission: (admissionParams) =>
        checkHermesMediaAdmission(admissionParams, { counters, getSettings: async () => settings, now: () => NOW }),
      getSettings: async () => settings,
      getFlags: async () => buildFlags(),
      now: () => NOW,
    };

    const results = await Promise.allSettled(
      Array.from({ length: TOTAL_CALLS }, (_, i) =>
        queueHermesMediaJob(
          buildInput({
            idempotencyKey: `batch-${i}`,
            settings: { model: "grok-image-1", outputCount: BATCH_SIZE },
          }),
          deps,
        ),
      ),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    // Exactly 2 batches (8 total weight) admitted — never a partial batch
    // (every accepted call inserted its FULL batch weight of 4, never less).
    expect(fulfilled).toHaveLength(CAP / BATCH_SIZE);
    expect(rejected).toHaveLength(TOTAL_CALLS - CAP / BATCH_SIZE);
    expect(insertedWeights.every((weight) => weight === BATCH_SIZE)).toBe(true);
    expect(queuedWeight).toBeLessThanOrEqual(CAP);
    for (const result of rejected) {
      const reason = (result as PromiseRejectedResult).reason;
      expect(String(reason?.message ?? reason)).toMatch(/HERMES_QUEUE_FULL/);
    }
  });
});

describe("Feature 135 section 12 — admission load assertion (sliding window)", () => {
  it("50 concurrent submits, per-user sliding window 10: exactly 10 admitted, rejections carry retryAfterSeconds > 0", async () => {
    const WINDOW_LIMIT = 10;
    const TOTAL = 50;
    const settings = buildSettings({ maxQueuedPerUser: 1000, submitWindowPerUser: WINDOW_LIMIT });
    const connection = buildConnection();

    // Fake atomic sliding-window store — a plain in-memory counter honors
    // the same check-and-increment CONTRACT the Redis Lua script provides
    // (single-statement read+write, no await between them) as long as every
    // call to it is itself serialized by the outer admission lock, which it
    // is here (checkAndIncrementSlidingWindow always runs inside
    // `withAdmissionLock`'s critical section).
    const windowState = new Map<string, number>();
    const counters: HermesAdmissionCounters = {
      countRunningForConnection: async () => 0,
      countQueuedForUser: async () => 0,
      countQueuedForTenantSharedPool: async () => 0,
      checkAndIncrementSlidingWindow: async (key, _windowSeconds, limit, amount) => {
        const current = windowState.get(key) ?? 0;
        if (current + amount > limit) {
          return { allowed: false, retryAfterSeconds: 60 };
        }
        windowState.set(key, current + amount);
        return { allowed: true };
      },
      getDailyQuotaUsage: async () => 0,
    };

    const repo = buildLoadTestRepo({ connection });
    const deps: QueueHermesMediaJobDeps = {
      repo,
      admission: (admissionParams) =>
        checkHermesMediaAdmission(admissionParams, { counters, getSettings: async () => settings, now: () => NOW }),
      getSettings: async () => settings,
      getFlags: async () => buildFlags(),
      now: () => NOW,
    };

    const results = await Promise.allSettled(
      Array.from({ length: TOTAL }, (_, i) => queueHermesMediaJob(buildInput({ idempotencyKey: `window-${i}` }), deps)),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(WINDOW_LIMIT);
    expect(rejected).toHaveLength(TOTAL - WINDOW_LIMIT);
    for (const result of rejected) {
      const reason = (result as PromiseRejectedResult).reason;
      expect(String(reason?.message ?? reason)).toMatch(/HERMES_RATE_LIMITED/);
      expect(String(reason?.message ?? reason)).toMatch(/retry after \d+s/);
    }
  });
});

/**
 * Builds the shared `quotaState` map + a `HermesUsageCounterStore` whose
 * `incrementDailyQuota` honors the SAME atomic check-and-increment contract
 * the real Redis `INCR` provides: read and write happen in one synchronous
 * expression, with no `await` gap an interleaving microtask could land in.
 *
 * `atomic: false` deliberately breaks this (code review FIX 1 mutation
 * check — see the `it.skip` "mutation check" test below, which is the
 * PROOF this fake is capable of failing when the increment is NOT atomic).
 */
function buildQuotaState(options: { atomic: boolean }) {
  const quotaState = new Map<string, number>();
  const usageCounters: HermesUsageCounterStore = {
    markUsageRecordedIfNew: async () => true,
    incrementDailyQuota: options.atomic
      ? async (connectionId, dateKey) => {
          const key = buildHermesQuotaKey(connectionId, dateKey);
          quotaState.set(key, (quotaState.get(key) ?? 0) + 1);
        }
      : async (connectionId, dateKey) => {
          // Deliberately NON-atomic — a real network round-trip gap
          // between read and write (e.g. a naive GET-then-SET against
          // Redis instead of INCR). Used ONLY by the mutation-check test
          // to prove the atomicity assertion below is not vacuous.
          const key = buildHermesQuotaKey(connectionId, dateKey);
          const current = quotaState.get(key) ?? 0;
          await new Promise((resolve) => setTimeout(resolve, 0));
          quotaState.set(key, current + 1);
        },
  };
  return { quotaState, usageCounters };
}

function buildCompletionPromises(params: {
  count: number;
  connectionId: string;
  usageCounters: HermesUsageCounterStore;
  nowFn: () => Date;
}): Promise<void>[] {
  return Array.from({ length: params.count }, (_, i) =>
    recordHermesUsage(
      {
        job: {
          id: `quota-completed-job-${i}`,
          tenantId: TENANT_ID,
          requestedByUserId: USER_ID,
          status: "completed",
          capabilityRequirementsJson: { connectionId: params.connectionId },
          instructionsJson: {},
        },
        contract: { settings: { model: "grok-image-1" } },
        feeCreditsKept: 0,
      },
      { repo: buildFakeUsageRepo(), counters: params.usageCounters, now: params.nowFn },
    ),
  );
}

describe("Feature 135 section 12 — admission load assertion (daily quota under parallelism)", () => {
  it("20 concurrent completions (quota counter alone): the counter never loses an update under full concurrency", async () => {
    const { quotaState, usageCounters } = buildQuotaState({ atomic: true });
    const connectionId = "conn-quota-atomicity";

    await Promise.all(
      buildCompletionPromises({ count: 20, connectionId, usageCounters, nowFn: () => new Date(`${DATE_KEY}T00:00:00.000Z`) }),
    );

    expect(quotaState.get(buildHermesQuotaKey(connectionId, DATE_KEY))).toBe(20);
  });

  it("mutation check (code review FIX 1): a NON-atomic increment fake fails this same assertion — proving the atomicity assertion above is not vacuous", async () => {
    const { quotaState, usageCounters } = buildQuotaState({ atomic: false });
    const connectionId = "conn-quota-mutation-check";

    await Promise.all(
      buildCompletionPromises({ count: 20, connectionId, usageCounters, nowFn: () => new Date(`${DATE_KEY}T00:00:00.000Z`) }),
    );

    // The non-atomic fake (read, THEN await a macrotask tick, THEN write)
    // lets every one of the 20 concurrent completions read the SAME stale
    // value before any of them writes — a classic lost-update race. This
    // MUST land below 20 (in practice: 1, since all 20 reads happen before
    // any write in this deliberately-broken fake). This test's job is to
    // fail loudly if it ever stops failing (i.e. if it ever passes, the
    // "atomic" test above would no longer be trustworthy either).
    expect(quotaState.get(buildHermesQuotaKey(connectionId, DATE_KEY))).toBeLessThan(20);
  });

  it("quota 5, sequential: 20 completions fully settle FIRST, then 20 concurrent submits — every one is rejected HERMES_QUOTA_EXHAUSTED (usage already at 20 > quota)", async () => {
    __resetHermesUsageProviderIdCacheForTests();

    const QUOTA = 5;
    const connection = buildConnection({ dailyJobQuota: QUOTA });
    const settings = buildSettings({ maxQueuedPerUser: 1000, submitWindowPerUser: 1000, submitWindowPerTenant: 1000 });
    const nowFn = () => new Date(`${DATE_KEY}T00:00:00.000Z`);
    const { quotaState, usageCounters } = buildQuotaState({ atomic: true });

    // All 20 completions settle BEFORE any submit starts — deterministic:
    // usage MUST be 20 by the time a single submit runs.
    await Promise.all(buildCompletionPromises({ count: 20, connectionId: connection.id, usageCounters, nowFn }));
    expect(quotaState.get(buildHermesQuotaKey(connection.id, DATE_KEY))).toBe(20);

    const counters: HermesAdmissionCounters = {
      countRunningForConnection: async () => 0,
      countQueuedForUser: async () => 0,
      countQueuedForTenantSharedPool: async () => 0,
      checkAndIncrementSlidingWindow: async () => ({ allowed: true }),
      getDailyQuotaUsage: async (connectionId, dateKey) => quotaState.get(buildHermesQuotaKey(connectionId, dateKey)) ?? 0,
    };
    const repo = buildLoadTestRepo({ connection });
    const deps: QueueHermesMediaJobDeps = {
      repo,
      admission: (admissionParams) =>
        checkHermesMediaAdmission(admissionParams, { counters, getSettings: async () => settings, now: nowFn }),
      getSettings: async () => settings,
      getFlags: async () => buildFlags(),
      now: nowFn,
    };

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => queueHermesMediaJob(buildInput({ idempotencyKey: `quota-seq-submit-${i}` }), deps)),
    );

    // The REAL, precise bound: with usage already at 20 (> quota 5) before
    // any submit runs, ALL 20 must be rejected — admittedCount is 0, not
    // merely "somewhere between 0 and the submit count".
    const admittedCount = results.filter((result) => result.status === "fulfilled").length;
    expect(admittedCount).toBe(0);
    for (const result of results) {
      const reason = (result as PromiseRejectedResult).reason;
      expect(String(reason?.message ?? reason)).toMatch(/HERMES_QUOTA_EXHAUSTED/);
    }
  });

  it("quota 5, genuinely concurrent: 20 completions racing 20 submits — every ADMITTED submit's own decision was consistent with the usage value IT observed (usage + batchSize <= quota)", async () => {
    __resetHermesUsageProviderIdCacheForTests();

    const QUOTA = 5;
    const connection = buildConnection({ dailyJobQuota: QUOTA });
    const settings = buildSettings({ maxQueuedPerUser: 1000, submitWindowPerUser: 1000, submitWindowPerTenant: 1000 });
    const nowFn = () => new Date(`${DATE_KEY}T00:00:00.000Z`);
    const { quotaState, usageCounters } = buildQuotaState({ atomic: true });

    const repo = buildLoadTestRepo({ connection });
    const baseDeps: QueueHermesMediaJobDeps = {
      repo,
      getSettings: async () => settings,
      getFlags: async () => buildFlags(),
      now: nowFn,
    };

    // Each submit gets ITS OWN counters wrapper so we can correlate exactly
    // what usage value THAT submit observed with whether IT was ultimately
    // admitted — a shared array (the old approach) loses this pairing and
    // degenerates into a vacuous "is a non-negative integer" check.
    async function submitAndCapture(i: number): Promise<{ admitted: boolean; observedUsage: number | null }> {
      let observedUsage: number | null = null;
      const perCallCounters: HermesAdmissionCounters = {
        countRunningForConnection: async () => 0,
        countQueuedForUser: async () => 0,
        countQueuedForTenantSharedPool: async () => 0,
        checkAndIncrementSlidingWindow: async () => ({ allowed: true }),
        getDailyQuotaUsage: async (connectionId, dateKey) => {
          const usage = quotaState.get(buildHermesQuotaKey(connectionId, dateKey)) ?? 0;
          observedUsage = usage;
          return usage;
        },
      };
      const perCallDeps: QueueHermesMediaJobDeps = {
        ...baseDeps,
        admission: (admissionParams) =>
          checkHermesMediaAdmission(admissionParams, { counters: perCallCounters, getSettings: async () => settings, now: nowFn }),
      };
      try {
        await queueHermesMediaJob(buildInput({ idempotencyKey: `quota-concurrent-submit-${i}` }), perCallDeps);
        return { admitted: true, observedUsage };
      } catch {
        return { admitted: false, observedUsage };
      }
    }

    const [submitOutcomes] = await Promise.all([
      Promise.all(Array.from({ length: 20 }, (_, i) => submitAndCapture(i))),
      Promise.all(buildCompletionPromises({ count: 20, connectionId: connection.id, usageCounters, nowFn })),
    ]);

    // Atomicity holds under this same full-concurrency run too.
    expect(quotaState.get(buildHermesQuotaKey(connection.id, DATE_KEY))).toBe(20);

    // The REAL per-decision invariant: every ADMITTED submit's own
    // observed usage, plus its own batch size (1, default), must not have
    // exceeded quota AT THE TIME IT READ THE COUNTER. This is genuinely
    // falsifiable — a stale/racy read that incorrectly admits despite
    // usage already at/over quota would fail this assertion.
    const admittedOutcomes = submitOutcomes.filter((outcome) => outcome.admitted);
    for (const outcome of admittedOutcomes) {
      expect(outcome.observedUsage).not.toBeNull();
      expect((outcome.observedUsage as number) + 1).toBeLessThanOrEqual(QUOTA);
    }

    // No precise bound on `admittedOutcomes.length` is asserted here: with
    // submits and completions on independent timelines (the daily quota
    // gate only ever reads PAST completions — it is not itself incremented
    // by a submit, and submits/completions do not share a lock), the
    // number of submits a scheduler happens to admit before any completion
    // lands is a genuine scheduling artifact, not a correctness property —
    // section-05 defines no "in-flight allowance" bound for this case (see
    // this file's header comment). The per-decision invariant above is the
    // real, falsifiable guarantee; the fully-sequential test above this one
    // is what pins down the deterministic, quota-exceeded case precisely.
  });
});

describe("Feature 135 section 12 — sanity", () => {
  it("defaultHermesSchedulerRepo is still the documented default (no accidental change from this load-test file)", () => {
    expect(typeof defaultHermesSchedulerRepo.withAdmissionLock).toBe("function");
  });
});
