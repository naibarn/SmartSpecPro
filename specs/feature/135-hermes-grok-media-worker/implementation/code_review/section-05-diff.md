diff --git a/apps/web/server/routers/systemSettings.ts b/apps/web/server/routers/systemSettings.ts
index 62b16c61c..d63001ef9 100644
--- a/apps/web/server/routers/systemSettings.ts
+++ b/apps/web/server/routers/systemSettings.ts
@@ -21,6 +21,8 @@ import {
 import { clearDocumentOcrSettingsCache, getDocumentOcrSettings } from "../services/documentOcrSettings";
 import { clearFinanceSlipMappingPresetCache } from "../services/financeSlipPresetSettings";
 import { clearPinnedMerchantPresetCache } from "../services/financeMerchantPresetSettings";
+import { HERMES_WORKER_SETTINGS_KEYS, getHermesWorkerSettings } from "../services/hermesWorkerSettings";
+import { validateHermesLimitCoherence } from "../services/hermesMediaAdmission";
 import { DOCUMENT_OCR_PROVIDER_IDS } from "../../shared/documentOcrRouting";
 import {
   browserPolicyConfigSchema,
@@ -783,6 +785,36 @@ export const systemSettingsRouter = router({
         return { success: true };
       }
 
+      // Feature 135 section-05 — limit-coherence invariant (spec §9): reject
+      // a `hermes_max_queued_per_user` write that would drop the cap below
+      // the max single-call admission batch size (portrait candidates,
+      // `HERMES_MAX_ADMISSION_BATCH_SIZE`) — such a value would make that
+      // batch permanently un-admittable. Tightly scoped to this one key so
+      // every other setting write is unaffected.
+      if (
+        input.category === "infrastructure"
+        && input.key === HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser
+        && input.value !== undefined
+      ) {
+        const parsedMaxQueuedPerUser = Number.parseInt(input.value, 10);
+        const currentSettings = await getHermesWorkerSettings();
+        const coherence = validateHermesLimitCoherence({
+          maxRunningPerConnection: currentSettings.maxRunningPerConnection,
+          maxQueuedPerUser: Number.isFinite(parsedMaxQueuedPerUser)
+            ? parsedMaxQueuedPerUser
+            : currentSettings.maxQueuedPerUser,
+          maxQueuedPerTenantSharedPool: currentSettings.maxQueuedPerTenantSharedPool,
+          submitWindowPerUser: currentSettings.submitWindowPerUser,
+          submitWindowPerTenant: currentSettings.submitWindowPerTenant,
+        });
+        if (!coherence.ok) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: coherence.reason ?? "Invalid Hermes admission limit configuration",
+          });
+        }
+      }
+
       const storedValue = input.isSensitive && input.value !== undefined
         ? encrypt(input.value)
         : input.value;
diff --git a/apps/web/server/services/__tests__/hermesMediaAdmission.test.ts b/apps/web/server/services/__tests__/hermesMediaAdmission.test.ts
new file mode 100644
index 000000000..ad6efd245
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesMediaAdmission.test.ts
@@ -0,0 +1,364 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  buildHermesQuotaKey,
+  checkHermesMediaAdmission,
+  HERMES_MAX_ADMISSION_BATCH_SIZE,
+  validateHermesLimitCoherence,
+  type HermesAdmissionCounters,
+  type HermesAdmissionDeps,
+  type HermesAdmissionLimits,
+  type HermesSlidingWindowCheckResult,
+} from "../hermesMediaAdmission";
+import type { HermesProviderConnection } from "../../../drizzle/schema";
+import type { HermesWorkerSettings } from "../hermesWorkerSettings";
+
+const TENANT_ID = "tenant-1";
+const USER_ID = 1;
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+
+function buildConnection(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
+  return {
+    id: "conn-1",
+    tenantId: TENANT_ID,
+    ownerUserId: USER_ID,
+    scope: "server_personal",
+    providerType: "xai_grok",
+    adapterType: "hermes_cli",
+    authenticationType: "oauth_device_code",
+    status: "authorized",
+    assignedWorkerId: "worker-1",
+    profileReference: "conn_conn-1",
+    accountLabel: null,
+    accountHint: "grok-user",
+    entitlementStatus: null,
+    capabilitiesJson: null,
+    defaultForImage: false,
+    defaultForVideo: false,
+    dailyJobQuota: null,
+    metadataJson: {},
+    createdAt: new Date("2026-01-01T00:00:00.000Z"),
+    authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
+    lastProbeAt: null,
+    disconnectedAt: null,
+    ...overrides,
+  } as HermesProviderConnection;
+}
+
+const DEFAULT_SETTINGS: HermesWorkerSettings = {
+  enabled: true,
+  sharedPoolEnabled: true,
+  serverPersonalEnabled: true,
+  privateEnabled: true,
+  videoEnabled: true,
+  sharedPoolFeeCredits: 0,
+  maxRunningPerConnection: 1,
+  maxConcurrentPerSharedWorker: 2,
+  maxQueuedPerUser: 8,
+  maxQueuedPerTenantSharedPool: 20,
+  submitWindowPerUser: 10,
+  submitWindowPerTenant: 60,
+  minHermesVersion: "",
+  sharedWorkerId: "shared-worker-1",
+  webProcessWorkerEnabled: false,
+};
+
+function buildCounters(overrides: Partial<HermesAdmissionCounters> = {}): HermesAdmissionCounters {
+  return {
+    countRunningForConnection: vi.fn().mockResolvedValue(0),
+    countQueuedForUser: vi.fn().mockResolvedValue(0),
+    countQueuedForTenantSharedPool: vi.fn().mockResolvedValue(0),
+    checkAndIncrementSlidingWindow: vi.fn().mockResolvedValue({ allowed: true } as HermesSlidingWindowCheckResult),
+    getDailyQuotaUsage: vi.fn().mockResolvedValue(0),
+    ...overrides,
+  };
+}
+
+function buildDeps(
+  overrides: Partial<{ settings: HermesWorkerSettings; counters: Partial<HermesAdmissionCounters> }> = {},
+): HermesAdmissionDeps {
+  const settings = overrides.settings ?? DEFAULT_SETTINGS;
+  const counters = buildCounters(overrides.counters ?? {});
+  return {
+    getSettings: vi.fn().mockResolvedValue(settings),
+    counters,
+    now: () => NOW,
+  };
+}
+
+describe("checkHermesMediaAdmission", () => {
+  it("rejects with HERMES_CONNECTION_BUSY when a job is already running on the connection (running=1)", async () => {
+    const deps = buildDeps({ counters: { countRunningForConnection: vi.fn().mockResolvedValue(1) } });
+
+    const result = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: false, code: "HERMES_CONNECTION_BUSY" });
+  });
+
+  it("admits the 8th queued job for a user but rejects the 9th (default cap 8)", async () => {
+    const admitDeps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(7) } });
+    const admitResult = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
+      admitDeps,
+    );
+    expect(admitResult).toEqual({ ok: true });
+
+    const rejectDeps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(8) } });
+    const rejectResult = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
+      rejectDeps,
+    );
+    expect(rejectResult).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
+  });
+
+  it("applies the tenant shared-pool queued cap (20) only to server_shared connections", async () => {
+    const sharedConnection = buildConnection({ scope: "server_shared", dailyJobQuota: null });
+    const overCapDeps = buildDeps({
+      counters: { countQueuedForTenantSharedPool: vi.fn().mockResolvedValue(20) },
+    });
+    const rejected = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: sharedConnection, operation: "image.generate" },
+      overCapDeps,
+    );
+    expect(rejected).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
+
+    // A private_worker connection is exempt from the tenant cap even when
+    // the injected counter reports the tenant pool is "full" — the counter
+    // must never even be consulted for a non-shared scope in a way that
+    // blocks it.
+    const privateConnection = buildConnection({ scope: "private_worker" });
+    const countQueuedForTenantSharedPool = vi.fn().mockResolvedValue(9999);
+    const exemptDeps = buildDeps({ counters: { countQueuedForTenantSharedPool } });
+    const admitted = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: privateConnection, operation: "image.generate" },
+      exemptDeps,
+    );
+    expect(admitted).toEqual({ ok: true });
+    expect(countQueuedForTenantSharedPool).not.toHaveBeenCalled();
+  });
+
+  it("rejects with HERMES_RATE_LIMITED and a positive retryAfterSeconds on the 11th sliding-window submission", async () => {
+    const checkAndIncrementSlidingWindow = vi
+      .fn()
+      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 } as HermesSlidingWindowCheckResult);
+    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });
+
+    const result = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: false, code: "HERMES_RATE_LIMITED", retryAfterSeconds: 42 });
+    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
+      `hermes:submit:user:${USER_ID}`,
+      600,
+      DEFAULT_SETTINGS.submitWindowPerUser,
+      1,
+    );
+  });
+
+  it("private_worker connections are still subject to the per-user sliding window and running=1", async () => {
+    const checkAndIncrementSlidingWindow = vi
+      .fn()
+      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 } as HermesSlidingWindowCheckResult);
+    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });
+
+    const result = await checkHermesMediaAdmission(
+      {
+        tenantId: TENANT_ID,
+        userId: USER_ID,
+        connection: buildConnection({ scope: "private_worker" }),
+        operation: "image.generate",
+      },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: false, code: "HERMES_RATE_LIMITED", retryAfterSeconds: 10 });
+  });
+
+  it("exempts private_worker connections from the tenant-wide sliding window", async () => {
+    const checkAndIncrementSlidingWindow = vi
+      .fn()
+      .mockResolvedValueOnce({ allowed: true } as HermesSlidingWindowCheckResult); // user window
+    const deps = buildDeps({ counters: { checkAndIncrementSlidingWindow } });
+
+    const result = await checkHermesMediaAdmission(
+      {
+        tenantId: TENANT_ID,
+        userId: USER_ID,
+        connection: buildConnection({ scope: "private_worker" }),
+        operation: "image.generate",
+      },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: true });
+    // Only the per-user window was consulted — never the tenant window.
+    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledTimes(1);
+    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
+      `hermes:submit:user:${USER_ID}`,
+      600,
+      DEFAULT_SETTINGS.submitWindowPerUser,
+      1,
+    );
+  });
+
+  it("rejects with HERMES_QUOTA_EXHAUSTED when a shared connection is at its dailyJobQuota", async () => {
+    const connection = buildConnection({ scope: "server_shared", dailyJobQuota: 10 });
+    const deps = buildDeps({ counters: { getDailyQuotaUsage: vi.fn().mockResolvedValue(10) } });
+
+    const result = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection, operation: "image.generate" },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: false, code: "HERMES_QUOTA_EXHAUSTED" });
+  });
+
+  it("does not enforce a dailyJobQuota when the connection has none configured", async () => {
+    const connection = buildConnection({ scope: "server_shared", dailyJobQuota: null });
+    const getDailyQuotaUsage = vi.fn().mockResolvedValue(9999);
+    const deps = buildDeps({ counters: { getDailyQuotaUsage } });
+
+    const result = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection, operation: "image.generate" },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: true });
+    expect(getDailyQuotaUsage).not.toHaveBeenCalled();
+  });
+
+  it("admits a batchSize: 4 portrait-candidate batch in one call under default caps, counting each candidate individually", async () => {
+    const countQueuedForUser = vi.fn().mockResolvedValue(0);
+    const checkAndIncrementSlidingWindow = vi.fn().mockResolvedValue({ allowed: true } as HermesSlidingWindowCheckResult);
+    const deps = buildDeps({ counters: { countQueuedForUser, checkAndIncrementSlidingWindow } });
+
+    const result = await checkHermesMediaAdmission(
+      {
+        tenantId: TENANT_ID,
+        userId: USER_ID,
+        connection: buildConnection(),
+        operation: "image.generate",
+        batchSize: 4,
+      },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: true });
+    expect(checkAndIncrementSlidingWindow).toHaveBeenCalledWith(
+      `hermes:submit:user:${USER_ID}`,
+      600,
+      DEFAULT_SETTINGS.submitWindowPerUser,
+      4,
+    );
+  });
+
+  it("rejects a batch that would push the queued-per-user count over the cap (admit all or none)", async () => {
+    // 6 already queued + batch of 4 = 10 > default cap 8.
+    const deps = buildDeps({ counters: { countQueuedForUser: vi.fn().mockResolvedValue(6) } });
+
+    const result = await checkHermesMediaAdmission(
+      {
+        tenantId: TENANT_ID,
+        userId: USER_ID,
+        connection: buildConnection(),
+        operation: "image.generate",
+        batchSize: 4,
+      },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
+  });
+
+  it("respects an admin override of the queued-per-user cap (e.g. 12)", async () => {
+    const overriddenSettings: HermesWorkerSettings = { ...DEFAULT_SETTINGS, maxQueuedPerUser: 12 };
+    // 9 already queued — would reject under the default cap (8) but admits
+    // under the admin override (12).
+    const deps = buildDeps({ settings: overriddenSettings, counters: { countQueuedForUser: vi.fn().mockResolvedValue(9) } });
+
+    const result = await checkHermesMediaAdmission(
+      { tenantId: TENANT_ID, userId: USER_ID, connection: buildConnection(), operation: "image.generate" },
+      deps,
+    );
+
+    expect(result).toEqual({ ok: true });
+  });
+});
+
+describe("checkHermesMediaAdmission — weighted queued counts (code review FIX 2)", () => {
+  it("submitting outputCount:4 batches against cap 8 admits exactly 2 (existing rows weighted by outputCount, not counted 1-each)", async () => {
+    // Simulates the FIXED counter: a queued outputCount:4 row weighs 4
+    // against the cap (the production fix sums `inputJson.settings.
+    // outputCount` in SQL) — NOT 1, which would let 8 separate outputCount:4
+    // batches (32 total outputs) all admit against a cap of 8.
+    let weightedQueuedCount = 0;
+    const countQueuedForUser = vi.fn().mockImplementation(async () => weightedQueuedCount);
+    const deps = buildDeps({ counters: { countQueuedForUser } });
+
+    const submitBatchOfFour = () =>
+      checkHermesMediaAdmission(
+        {
+          tenantId: TENANT_ID,
+          userId: USER_ID,
+          connection: buildConnection(),
+          operation: "image.generate",
+          batchSize: 4,
+        },
+        deps,
+      );
+
+    const first = await submitBatchOfFour();
+    expect(first).toEqual({ ok: true });
+    weightedQueuedCount += 4; // the row(s) just "inserted" now weigh 4, not 1
+
+    const second = await submitBatchOfFour();
+    expect(second).toEqual({ ok: true });
+    weightedQueuedCount += 4;
+
+    // A 3rd outputCount:4 batch would push weighted usage to 12 > cap 8.
+    const third = await submitBatchOfFour();
+    expect(third).toEqual({ ok: false, code: "HERMES_QUEUE_FULL" });
+
+    expect(countQueuedForUser).toHaveBeenCalledTimes(3);
+  });
+});
+
+describe("validateHermesLimitCoherence", () => {
+  function limits(overrides: Partial<HermesAdmissionLimits> = {}): HermesAdmissionLimits {
+    return {
+      maxRunningPerConnection: 1,
+      maxQueuedPerUser: 8,
+      maxQueuedPerTenantSharedPool: 20,
+      submitWindowPerUser: 10,
+      submitWindowPerTenant: 60,
+      ...overrides,
+    };
+  }
+
+  it("rejects a queued-per-user cap below the max batch size (4)", () => {
+    const result = validateHermesLimitCoherence(limits({ maxQueuedPerUser: HERMES_MAX_ADMISSION_BATCH_SIZE - 1 }));
+    expect(result.ok).toBe(false);
+    expect(result.reason).toBeTruthy();
+  });
+
+  it("passes the default configuration", () => {
+    const result = validateHermesLimitCoherence(limits());
+    expect(result).toEqual({ ok: true });
+  });
+
+  it("passes when the queued-per-user cap equals exactly the max batch size", () => {
+    const result = validateHermesLimitCoherence(limits({ maxQueuedPerUser: HERMES_MAX_ADMISSION_BATCH_SIZE }));
+    expect(result).toEqual({ ok: true });
+  });
+});
+
+describe("buildHermesQuotaKey", () => {
+  it("builds the documented `hermes:quota:<connectionId>:<YYYY-MM-DD>` shape", () => {
+    expect(buildHermesQuotaKey("conn-1", "2026-06-01")).toBe("hermes:quota:conn-1:2026-06-01");
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesMediaScheduler.test.ts b/apps/web/server/services/__tests__/hermesMediaScheduler.test.ts
new file mode 100644
index 000000000..8f7d0400c
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesMediaScheduler.test.ts
@@ -0,0 +1,703 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  defaultHermesSchedulerRepo,
+  queueHermesMediaJob,
+  type HermesSchedulerRepository,
+  type QueueHermesMediaJobDeps,
+  type QueueHermesMediaJobInput,
+} from "../hermesMediaScheduler";
+import type { HermesAdmissionResult } from "../hermesMediaAdmission";
+import type { HermesWorkerSettings } from "../hermesWorkerSettings";
+import type { HermesProviderConnection, Worker } from "../../../drizzle/schema";
+import {
+  HERMES_MEDIA_CAPABILITY_FAMILIES,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+} from "../../../shared/workerRuntime";
+import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../../shared/featureFlags";
+
+const TENANT_ID = "tenant-1";
+const USER_ID = 1;
+const OTHER_USER_ID = 2;
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+
+const DEFAULT_SETTINGS: HermesWorkerSettings = {
+  enabled: true,
+  sharedPoolEnabled: true,
+  serverPersonalEnabled: true,
+  privateEnabled: true,
+  videoEnabled: true,
+  sharedPoolFeeCredits: 0,
+  maxRunningPerConnection: 1,
+  maxConcurrentPerSharedWorker: 2,
+  maxQueuedPerUser: 8,
+  maxQueuedPerTenantSharedPool: 20,
+  submitWindowPerUser: 10,
+  submitWindowPerTenant: 60,
+  minHermesVersion: "",
+  sharedWorkerId: "shared-worker-1",
+  webProcessWorkerEnabled: false,
+};
+
+function buildFlags(overrides: Partial<TenantFeatureFlags> = {}): TenantFeatureFlags {
+  return { ...FEATURE_FLAG_DEFAULTS, hermesMediaWorker: true, ...overrides };
+}
+
+function buildConnection(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
+  return {
+    id: "conn-1",
+    tenantId: TENANT_ID,
+    ownerUserId: USER_ID,
+    scope: "server_personal",
+    providerType: "xai_grok",
+    adapterType: "hermes_cli",
+    authenticationType: "oauth_device_code",
+    status: "authorized",
+    assignedWorkerId: "worker-1",
+    profileReference: "conn_conn-1",
+    accountLabel: null,
+    accountHint: "grok-user",
+    entitlementStatus: null,
+    capabilitiesJson: null,
+    defaultForImage: false,
+    defaultForVideo: false,
+    dailyJobQuota: null,
+    metadataJson: {},
+    createdAt: new Date("2026-01-01T00:00:00.000Z"),
+    authorizedAt: new Date("2026-01-01T00:00:00.000Z"),
+    lastProbeAt: null,
+    disconnectedAt: null,
+    ...overrides,
+  } as HermesProviderConnection;
+}
+
+function buildWorker(overrides: Partial<Worker> = {}): Worker {
+  return {
+    id: "worker-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    runtimeType: "hermes_agent_gateway",
+    workerMode: "external_runtime",
+    machineId: null,
+    machineName: null,
+    displayName: "Hermes shared worker",
+    status: "online",
+    runtimeVersion: "1.0.0",
+    runtimeMode: "external_managed",
+    runtimeProfileId: null,
+    policyProfileId: null,
+    externalReference: "hermes://shared-1",
+    dashboardUrl: null,
+    capabilitiesJson: {},
+    hardwareJson: {},
+    healthSummaryJson: {},
+    warningFlagsJson: [],
+    fileScopeMode: "workspace_scoped",
+    lastSeenAt: NOW,
+    registeredByUserId: USER_ID,
+    createdAt: NOW,
+    updatedAt: NOW,
+    ...overrides,
+  } as Worker;
+}
+
+function buildInput(overrides: Partial<QueueHermesMediaJobInput> = {}): QueueHermesMediaJobInput {
+  return {
+    contractVersion: 1,
+    operation: "image.generate",
+    connectionId: "conn-1",
+    prompt: "a cat wearing sunglasses",
+    settings: { model: "grok-image-1" },
+    references: [],
+    traceId: "trace-1",
+    tenantId: TENANT_ID,
+    requestedByUserId: USER_ID,
+    ...overrides,
+  };
+}
+
+function buildRepo(overrides: Partial<HermesSchedulerRepository> = {}): HermesSchedulerRepository {
+  return {
+    findConnectionById: vi.fn().mockResolvedValue(buildConnection()),
+    listEligibleSharedConnections: vi.fn().mockResolvedValue([]),
+    countQueuedForConnection: vi.fn().mockResolvedValue(0),
+    countRunningForConnection: vi.fn().mockResolvedValue(0),
+    isWorkerOnline: vi.fn().mockResolvedValue(true),
+    findJobByIdempotencyKey: vi.fn().mockResolvedValue(null),
+    findWorkerById: vi.fn().mockResolvedValue(buildWorker()),
+    insertJob: vi.fn().mockImplementation(async (values: Record<string, unknown>) => ({ id: "job-1", ...values })),
+    // Default fake seam: pass-through (no serialization needed for most
+    // tests) — the concurrency describe block below overrides this with a
+    // real serializing mutex to exercise code review FIX 1.
+    withAdmissionLock: vi.fn().mockImplementation((_keys: string[], fn: () => Promise<unknown>) => fn()),
+    ...overrides,
+  };
+}
+
+const IMAGE_MANIFEST = {
+  hermesVersion: "1.0.0",
+  probedAt: "2026-01-01T00:00:00.000Z",
+  operations: { "image.generate": { enabled: true } },
+  models: { image: ["grok-image-1"], video: [] },
+};
+
+const VIDEO_MANIFEST = {
+  hermesVersion: "1.0.0",
+  probedAt: "2026-01-01T00:00:00.000Z",
+  operations: { "video.generate": { enabled: true } },
+  models: { image: [], video: ["grok-video-1"] },
+};
+
+function buildDeps(
+  overrides: Partial<{
+    repo: Partial<HermesSchedulerRepository>;
+    settings: HermesWorkerSettings;
+    flags: TenantFeatureFlags;
+    admissionResult: HermesAdmissionResult;
+    reserveFee: QueueHermesMediaJobDeps["reserveFee"];
+  }> = {},
+): QueueHermesMediaJobDeps {
+  const repo = buildRepo(overrides.repo ?? {});
+  const settings = overrides.settings ?? DEFAULT_SETTINGS;
+  const flags = overrides.flags ?? buildFlags();
+  const admissionResult = overrides.admissionResult ?? ({ ok: true } as HermesAdmissionResult);
+
+  return {
+    repo,
+    getSettings: vi.fn().mockResolvedValue(settings),
+    getFlags: vi.fn().mockResolvedValue(flags),
+    admission: vi.fn().mockResolvedValue(admissionResult),
+    reserveFee: overrides.reserveFee
+      ?? vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" }),
+    now: () => NOW,
+  };
+}
+
+describe("queueHermesMediaJob — flags fail-closed", () => {
+  it("rejects with HERMES_DISABLED and never inserts when the global kill switch is off", async () => {
+    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, enabled: false } });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("rejects with HERMES_DISABLED when the tenant flag is off", async () => {
+    const deps = buildDeps({ flags: buildFlags({ hermesMediaWorker: false }) });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("rejects with HERMES_DISABLED when the per-scope flag is off", async () => {
+    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, serverPersonalEnabled: false } });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_DISABLED/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("rejects video operations with HERMES_DISABLED when the video flag is off", async () => {
+    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, videoEnabled: false } });
+    const input = buildInput({ operation: "video.generate", settings: { model: "grok-video-1" } });
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_DISABLED/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+});
+
+describe("queueHermesMediaJob — connection authorization", () => {
+  it.each([
+    ["pending", "HERMES_CONNECTION_REQUIRED"],
+    ["reauth_required", "HERMES_REAUTH_REQUIRED"],
+    ["entitlement_restricted", "HERMES_ENTITLEMENT_RESTRICTED"],
+    ["disconnected", "HERMES_CONNECTION_REQUIRED"],
+  ] as const)("rejects a %s connection with %s", async (status, code) => {
+    const deps = buildDeps({
+      repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ status })) },
+    });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(new RegExp(code));
+  });
+
+  it("never resolves another user's server_personal connection (tenant/owner mismatch)", async () => {
+    const deps = buildDeps({
+      repo: {
+        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ ownerUserId: OTHER_USER_ID })),
+      },
+    });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_CONNECTION_REQUIRED/);
+  });
+});
+
+describe("queueHermesMediaJob — single-pass connection resolution", () => {
+  it("propagates a typed admission error for an explicitly configured connection without falling back to the shared pool", async () => {
+    const listEligibleSharedConnections = vi.fn().mockResolvedValue([buildConnection({ id: "conn-shared", scope: "server_shared" })]);
+    const deps = buildDeps({
+      repo: { listEligibleSharedConnections },
+      admissionResult: { ok: false, code: "HERMES_CONNECTION_BUSY" },
+    });
+
+    await expect(queueHermesMediaJob(buildInput({ connectionId: "conn-1" }), deps)).rejects.toThrow(/HERMES_CONNECTION_BUSY/);
+    expect(listEligibleSharedConnections).not.toHaveBeenCalled();
+  });
+});
+
+describe("queueHermesMediaJob — shared-pool auto-pick", () => {
+  it("picks the eligible server_shared connection with the lowest queue depth", async () => {
+    const poolA = buildConnection({ id: "conn-pool-a", scope: "server_shared", dailyJobQuota: null, capabilitiesJson: IMAGE_MANIFEST });
+    const poolB = buildConnection({ id: "conn-pool-b", scope: "server_shared", dailyJobQuota: null, capabilitiesJson: IMAGE_MANIFEST });
+    const countQueuedForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
+      connectionId === "conn-pool-a" ? 3 : 1,
+    );
+    const deps = buildDeps({
+      repo: {
+        listEligibleSharedConnections: vi.fn().mockResolvedValue([poolA, poolB]),
+        countQueuedForConnection,
+        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
+      },
+    });
+
+    const input = buildInput({ connectionId: undefined });
+    const result = await queueHermesMediaJob(input, deps);
+    expect(result.created).toBe(true);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-pool-b" }),
+      }),
+    );
+  });
+
+  it("code review FIX 3: never auto-picks an image-only connection for a video request", async () => {
+    const imageOnly = buildConnection({
+      id: "conn-image-only",
+      scope: "server_shared",
+      dailyJobQuota: null,
+      capabilitiesJson: IMAGE_MANIFEST,
+    });
+    const videoCapable = buildConnection({
+      id: "conn-video-capable",
+      scope: "server_shared",
+      dailyJobQuota: null,
+      capabilitiesJson: VIDEO_MANIFEST,
+    });
+    const deps = buildDeps({
+      repo: {
+        listEligibleSharedConnections: vi.fn().mockResolvedValue([imageOnly, videoCapable]),
+        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
+      },
+      settings: { ...DEFAULT_SETTINGS, videoEnabled: true },
+    });
+
+    const input = buildInput({
+      connectionId: undefined,
+      operation: "video.generate",
+      settings: { model: "grok-video-1" },
+    });
+    const result = await queueHermesMediaJob(input, deps);
+    expect(result.created).toBe(true);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-video-capable" }),
+      }),
+    );
+  });
+
+  it("code review FIX 3: skips a busy (running>0) connection in favor of an idle one, even when the busy one has a shallower queue", async () => {
+    const busyConnection = buildConnection({
+      id: "conn-busy",
+      scope: "server_shared",
+      dailyJobQuota: null,
+      capabilitiesJson: IMAGE_MANIFEST,
+    });
+    const idleConnection = buildConnection({
+      id: "conn-idle",
+      scope: "server_shared",
+      dailyJobQuota: null,
+      capabilitiesJson: IMAGE_MANIFEST,
+    });
+
+    const countRunningForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
+      connectionId === "conn-busy" ? 1 : 0,
+    );
+    // The busy connection has the SHALLOWER queue — proves running>0 is
+    // checked BEFORE ranking by queue depth, not as a tiebreaker after.
+    const countQueuedForConnection = vi.fn().mockImplementation(async ({ connectionId }: { connectionId: string }) =>
+      connectionId === "conn-busy" ? 0 : 5,
+    );
+
+    const deps = buildDeps({
+      repo: {
+        listEligibleSharedConnections: vi.fn().mockResolvedValue([busyConnection, idleConnection]),
+        countRunningForConnection,
+        countQueuedForConnection,
+        findConnectionById: vi.fn().mockResolvedValue(null), // must not be used
+      },
+    });
+
+    const input = buildInput({ connectionId: undefined });
+    const result = await queueHermesMediaJob(input, deps);
+    expect(result.created).toBe(true);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        capabilityRequirementsJson: expect.objectContaining({ connectionId: "conn-idle" }),
+      }),
+    );
+  });
+});
+
+describe("queueHermesMediaJob — worker online gate", () => {
+  it("rejects with HERMES_WORKER_UNAVAILABLE when the assigned worker is offline", async () => {
+    const deps = buildDeps({ repo: { isWorkerOnline: vi.fn().mockResolvedValue(false) } });
+    await expect(queueHermesMediaJob(buildInput(), deps)).rejects.toThrow(/HERMES_WORKER_UNAVAILABLE/);
+  });
+});
+
+describe("queueHermesMediaJob — fee (interview decision 1)", () => {
+  it("reserves a fee only for server_shared scope with a configured fee, and writes workerBilling only then", async () => {
+    const scopes = ["server_shared", "server_personal", "private_worker"] as const;
+    for (const scope of scopes) {
+      const reserveFee = vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" });
+      const deps = buildDeps({
+        repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope })) },
+        settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 },
+        reserveFee,
+      });
+
+      await queueHermesMediaJob(buildInput(), deps);
+
+      if (scope === "server_shared") {
+        expect(reserveFee).toHaveBeenCalledTimes(1);
+        expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+          expect.objectContaining({
+            instructionsJson: expect.objectContaining({ workerBilling: expect.objectContaining({ reservationId: "res-1" }) }),
+          }),
+        );
+      } else {
+        expect(reserveFee).not.toHaveBeenCalled();
+        const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
+        const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
+        expect(callArgs.instructionsJson.workerBilling).toBeUndefined();
+      }
+    }
+  });
+
+  it("reserves nothing for a fee=0 shared-pool submit", async () => {
+    const reserveFee = vi.fn();
+    const deps = buildDeps({
+      repo: { findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "server_shared" })) },
+      settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 0 },
+      reserveFee,
+    });
+
+    await queueHermesMediaJob(buildInput(), deps);
+    expect(reserveFee).not.toHaveBeenCalled();
+  });
+});
+
+describe("queueHermesMediaJob — insertJob args", () => {
+  it("sets runtimeType from the assigned worker's registered type, never derived from the feature", async () => {
+    const privateDeps = buildDeps({
+      repo: {
+        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "private_worker" })),
+        findWorkerById: vi.fn().mockResolvedValue(buildWorker({ runtimeType: "desktop_zeroclaw_managed" })),
+      },
+    });
+    await queueHermesMediaJob(buildInput(), privateDeps);
+    expect((privateDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({ runtimeType: "desktop_zeroclaw_managed", workerId: "worker-1" }),
+    );
+
+    const sharedDeps = buildDeps({
+      repo: {
+        findConnectionById: vi.fn().mockResolvedValue(buildConnection({ scope: "server_shared" })),
+        findWorkerById: vi.fn().mockResolvedValue(buildWorker({ runtimeType: "hermes_agent_gateway" })),
+      },
+    });
+    await queueHermesMediaJob(buildInput(), sharedDeps);
+    expect((sharedDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({ runtimeType: "hermes_agent_gateway", workerId: null }),
+    );
+  });
+
+  it("sets capabilityRequirementsJson to the exact non-overridable shape", async () => {
+    const deps = buildDeps();
+    await queueHermesMediaJob(buildInput(), deps);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        capabilityRequirementsJson: {
+          capabilityFamilies: [...HERMES_MEDIA_CAPABILITY_FAMILIES],
+          requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+          connectionId: "conn-1",
+          preferredWorkerId: null,
+        },
+      }),
+    );
+  });
+
+  it("uses image resourceProfile/timeout/jobType for image operations and video for video operations", async () => {
+    const imageDeps = buildDeps();
+    await queueHermesMediaJob(buildInput({ operation: "image.generate" }), imageDeps);
+    expect((imageDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
+        resourceProfile: "network_heavy",
+        timeoutSeconds: 600,
+      }),
+    );
+
+    const videoDeps = buildDeps();
+    await queueHermesMediaJob(
+      buildInput({ operation: "video.generate", settings: { model: "grok-video-1" } }),
+      videoDeps,
+    );
+    expect((videoDeps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        jobType: HERMES_MEDIA_VIDEO_JOB_TYPE,
+        resourceProfile: "long_running",
+        timeoutSeconds: 1800,
+      }),
+    );
+  });
+
+  it("sets retryPolicyJson, statusReason, and status queued", async () => {
+    const deps = buildDeps();
+    await queueHermesMediaJob(buildInput(), deps);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).toHaveBeenCalledWith(
+      expect.objectContaining({
+        retryPolicyJson: { maxAttempts: 2, backoffSeconds: 30 },
+        statusReason: "hermes_media_scheduler",
+        status: "queued",
+        requestedBySystemComponent: "hermes_media_scheduler",
+      }),
+    );
+  });
+
+  it("stores inputJson as the parsed contract with references containing no URL-shaped fields", async () => {
+    const deps = buildDeps();
+    const input = buildInput({
+      operation: "image.edit",
+      references: [
+        { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
+      ],
+    });
+    await queueHermesMediaJob(input, deps);
+    const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
+    const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
+    const serialized = JSON.stringify(callArgs.inputJson);
+    expect(/url/i.test(serialized)).toBe(false);
+    expect(callArgs.inputJson.references).toEqual([
+      { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
+    ]);
+  });
+});
+
+describe("queueHermesMediaJob — contract validation", () => {
+  it("rejects a reference count that exceeds the operation's static bounds with HERMES_REFERENCE_LIMIT_EXCEEDED", async () => {
+    const deps = buildDeps();
+    const input = buildInput({
+      operation: "image.generate", // bounds 0..0
+      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
+    });
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_LIMIT_EXCEEDED/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("rejects non-continuous reference indices with HERMES_REFERENCE_MAPPING_CONFLICT", async () => {
+    const deps = buildDeps();
+    const input = buildInput({
+      operation: "image.edit",
+      references: [
+        { assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) },
+        { assetId: "asset-2", index: 3, role: "subject", label: "Image-2", sha256: "b".repeat(64) },
+      ],
+    });
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_MAPPING_CONFLICT/);
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("runs contract validation before admission and fee", async () => {
+    const admission = vi.fn();
+    const reserveFee = vi.fn();
+    const deps = buildDeps({ settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 }, reserveFee });
+    deps.admission = admission;
+    const input = buildInput({
+      operation: "image.generate",
+      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
+    });
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_REFERENCE_LIMIT_EXCEEDED/);
+    expect(admission).not.toHaveBeenCalled();
+    expect(reserveFee).not.toHaveBeenCalled();
+  });
+});
+
+describe("queueHermesMediaJob — operation-unsupported gate", () => {
+  it("rejects HERMES_OPERATION_UNSUPPORTED when the connection's manifest does not advertise the operation, before admission", async () => {
+    const admission = vi.fn();
+    const connection = buildConnection({
+      capabilitiesJson: {
+        hermesVersion: "1.0.0",
+        probedAt: "2026-01-01T00:00:00.000Z",
+        operations: { "video.reference_to_video": { enabled: false, reason: "not advertised by manifest" } },
+        models: { image: [], video: ["grok-video-1"] },
+      },
+    });
+    const deps = buildDeps({ repo: { findConnectionById: vi.fn().mockResolvedValue(connection) } });
+    deps.admission = admission;
+
+    const input = buildInput({
+      operation: "video.reference_to_video",
+      settings: { model: "grok-video-1" },
+      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
+    });
+
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_OPERATION_UNSUPPORTED/);
+    expect(admission).not.toHaveBeenCalled();
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("never silently degrades — the same gate applies to any operation the effective capability disables", async () => {
+    const connection = buildConnection({
+      capabilitiesJson: {
+        hermesVersion: "1.0.0",
+        probedAt: "2026-01-01T00:00:00.000Z",
+        operations: { "image.edit": { enabled: false } },
+        models: { image: ["grok-image-1"], video: [] },
+      },
+    });
+    const deps = buildDeps({ repo: { findConnectionById: vi.fn().mockResolvedValue(connection) } });
+
+    const input = buildInput({
+      operation: "image.edit",
+      references: [{ assetId: "asset-1", index: 1, role: "subject", label: "Image-1", sha256: "a".repeat(64) }],
+    });
+
+    await expect(queueHermesMediaJob(input, deps)).rejects.toThrow(/HERMES_OPERATION_UNSUPPORTED/);
+  });
+});
+
+describe("queueHermesMediaJob — idempotency (non-terminal only)", () => {
+  it("returns the existing job with created: false while the first job is queued, with no second fee reserve", async () => {
+    const existingJob = { id: "existing-job", status: "queued", tenantId: TENANT_ID };
+    const reserveFee = vi.fn().mockResolvedValue({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" });
+    const deps = buildDeps({
+      repo: { findJobByIdempotencyKey: vi.fn().mockResolvedValue(existingJob) },
+      settings: { ...DEFAULT_SETTINGS, sharedPoolFeeCredits: 5 },
+      reserveFee,
+    });
+
+    const result = await queueHermesMediaJob(buildInput({ connectionId: "conn-1" }), deps);
+    expect(result).toEqual({ created: false, taskId: "hermes_existing-job", job: existingJob });
+    expect(reserveFee).not.toHaveBeenCalled();
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+
+  it("creates a fresh job with an attempt-suffixed key when the prior match is terminal", async () => {
+    const terminalJob = { id: "terminal-job", status: "failed", tenantId: TENANT_ID };
+    const findJobByIdempotencyKey = vi.fn().mockImplementation(async (_tenantId: string, key: string) =>
+      key.endsWith(":a2") ? null : terminalJob,
+    );
+    const deps = buildDeps({ repo: { findJobByIdempotencyKey } });
+
+    const result = await queueHermesMediaJob(buildInput(), deps);
+    expect(result.created).toBe(true);
+    const insertJobMock = (deps.repo as HermesSchedulerRepository).insertJob as ReturnType<typeof vi.fn>;
+    const callArgs = insertJobMock.mock.calls[0][0] as Record<string, any>;
+    expect(callArgs.idempotencyKey.endsWith(":a2")).toBe(true);
+  });
+});
+
+describe("queueHermesMediaJob — ordering (code review FIX 4)", () => {
+  it("checks idempotency BEFORE admission — a duplicate non-terminal submit never consumes admission budget", async () => {
+    const existingJob = { id: "existing-job", status: "running", tenantId: TENANT_ID };
+    const admission = vi.fn();
+    const deps = buildDeps({ repo: { findJobByIdempotencyKey: vi.fn().mockResolvedValue(existingJob) } });
+    deps.admission = admission;
+
+    const result = await queueHermesMediaJob(buildInput(), deps);
+    expect(result).toEqual({ created: false, taskId: "hermes_existing-job", job: existingJob });
+    expect(admission).not.toHaveBeenCalled();
+    expect((deps.repo as HermesSchedulerRepository).insertJob).not.toHaveBeenCalled();
+  });
+});
+
+describe("queueHermesMediaJob — concurrency (code review FIX 1, BLOCKER)", () => {
+  it("serializes concurrent submissions through the withAdmissionLock seam and admits EXACTLY the cap (12 submits, cap 8 -> 8 created)", async () => {
+    const CAP = 8;
+    const TOTAL = 12;
+
+    // Fake mutex: each call is queued to run only after the previous one
+    // settles (success OR failure) — this mirrors what the real Postgres
+    // advisory-transaction-lock implementation guarantees in production
+    // (mutual exclusion across concurrent callers for the whole check+insert
+    // critical section), without needing a real DB in this unit test.
+    let chain: Promise<unknown> = Promise.resolve();
+    const withAdmissionLock = vi
+      .fn()
+      .mockImplementation(async (_keys: string[], fn: () => Promise<unknown>) => {
+        const run = chain.then(() => fn());
+        chain = run.catch(() => undefined);
+        return run;
+      });
+
+    // Racy counting "admission": reads the current count, awaits (simulating
+    // a real async DB round-trip gap between read and write), THEN writes.
+    // Without the serializing seam above, 12 concurrent calls would mostly
+    // all read count=0 before any of them writes, admitting far more than
+    // the cap. Wrapped inside the fake seam, each call's read+await+write
+    // fully completes before the next one starts.
+    let admittedCount = 0;
+    const admission = vi.fn().mockImplementation(async (): Promise<HermesAdmissionResult> => {
+      const currentCount = admittedCount;
+      await new Promise((resolve) => setTimeout(resolve, 1));
+      if (currentCount >= CAP) {
+        return { ok: false, code: "HERMES_QUEUE_FULL" };
+      }
+      admittedCount = currentCount + 1;
+      return { ok: true };
+    });
+
+    let insertedCount = 0;
+    const insertJob = vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
+      insertedCount += 1;
+      return { id: `job-${insertedCount}`, ...values };
+    });
+
+    const deps = buildDeps({ repo: { withAdmissionLock, insertJob } });
+    deps.admission = admission;
+
+    const results = await Promise.allSettled(
+      Array.from({ length: TOTAL }, () => queueHermesMediaJob(buildInput(), deps)),
+    );
+
+    const fulfilled = results.filter((result) => result.status === "fulfilled");
+    const rejected = results.filter((result) => result.status === "rejected");
+
+    expect(fulfilled).toHaveLength(CAP);
+    expect(rejected).toHaveLength(TOTAL - CAP);
+    for (const result of rejected) {
+      const reason = (result as PromiseRejectedResult).reason;
+      expect(String(reason?.message ?? reason)).toMatch(/HERMES_QUEUE_FULL/);
+    }
+    expect(insertJob).toHaveBeenCalledTimes(CAP);
+    expect(withAdmissionLock).toHaveBeenCalledTimes(TOTAL);
+  });
+});
+
+describe("queueHermesMediaJob — return shape", () => {
+  it("returns taskId === 'hermes_' + job.id", async () => {
+    const deps = buildDeps({ repo: { insertJob: vi.fn().mockResolvedValue({ id: "job-42" }) } });
+    const result = await queueHermesMediaJob(buildInput(), deps);
+    expect(result.taskId).toBe("hermes_job-42");
+    expect(result.created).toBe(true);
+  });
+});
+
+describe("defaultHermesSchedulerRepo", () => {
+  it("is exported and exposes the documented methods", () => {
+    expect(typeof defaultHermesSchedulerRepo.findConnectionById).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.listEligibleSharedConnections).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.countQueuedForConnection).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.countRunningForConnection).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.isWorkerOnline).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.findJobByIdempotencyKey).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.findWorkerById).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.insertJob).toBe("function");
+    expect(typeof defaultHermesSchedulerRepo.withAdmissionLock).toBe("function");
+  });
+});
diff --git a/apps/web/server/services/__tests__/workerRegistryService.test.ts b/apps/web/server/services/__tests__/workerRegistryService.test.ts
index 0e2f7b9df..c2a42024b 100644
--- a/apps/web/server/services/__tests__/workerRegistryService.test.ts
+++ b/apps/web/server/services/__tests__/workerRegistryService.test.ts
@@ -1415,6 +1415,192 @@ describe("workerRegistryService", () => {
     });
   });
 
+  describe("hermes media claim gating (Feature 135 section-05)", () => {
+    function hermesJob(overrides: Record<string, unknown> = {}) {
+      return {
+        id: "job-hermes-1",
+        tenantId: "tenant-1",
+        teamId: null,
+        workerId: null,
+        runtimeType: "hermes_agent_gateway",
+        jobType: "hermes_media_image_generate",
+        status: "queued",
+        priority: 25,
+        capabilityRequirementsJson: { connectionId: "conn-1" },
+        inputJson: {},
+        instructionsJson: {},
+        outputJson: null,
+        failureReason: null,
+        timeoutSeconds: 600,
+        retryPolicyJson: {},
+        idempotencyKey: null,
+        leaseOwnerToken: null,
+        leaseExpiresAt: null,
+        createdAt: new Date("2026-06-01T00:00:00.000Z"),
+        startedAt: null,
+        finishedAt: null,
+        ...overrides,
+      };
+    }
+
+    function hermesWorkerRepo(
+      job: ReturnType<typeof hermesJob>,
+      overrides: Record<string, unknown> = {},
+    ) {
+      return {
+        getWorkerById: vi.fn().mockResolvedValue({
+          id: "worker-1",
+          tenantId: "tenant-1",
+          teamId: null,
+          runtimeType: "hermes_agent_gateway",
+          status: "online",
+          capabilitiesJson: {},
+        }),
+        listClaimableJobs: vi.fn().mockResolvedValue([job]),
+        getHermesConnectionAssignedWorkerId: vi.fn().mockResolvedValue("worker-1"),
+        tryClaimJob: vi.fn().mockResolvedValue({
+          ...job,
+          workerId: "worker-1",
+          status: "claimed",
+          leaseOwnerToken: "lease-hermes-1",
+          leaseExpiresAt: new Date("2030-06-01T00:05:00.000Z"),
+        }),
+        updateJob: vi.fn().mockImplementation(async (_jobId, values) => ({ ...job, ...values })),
+        ...overrides,
+      };
+    }
+
+    it("skips (does not claim) a hermes_media_* job when capabilityHints lack hermes_media, without throwing", async () => {
+      const { claimWorkerJob } = await import("../workerRegistryService");
+      const job = hermesJob();
+      const repo = hermesWorkerRepo(job);
+
+      const result = await claimWorkerJob(
+        {
+          auth: { tenantId: "tenant-1", workerId: "worker-1", runtimeType: "hermes_agent_gateway" } as any,
+          workerId: "worker-1",
+          payload: { maxJobs: 1, capabilityHints: [] },
+        },
+        { repo } as any,
+      );
+
+      expect(result.job).toBeNull();
+      expect(repo.tryClaimJob).not.toHaveBeenCalled();
+    });
+
+    it("skips (does not claim) a hermes_connection_* control job when capabilityHints lack hermes_media", async () => {
+      const { claimWorkerJob } = await import("../workerRegistryService");
+      const job = hermesJob({ id: "job-hermes-connection-1", jobType: "hermes_connection_authorize" });
+      const repo = hermesWorkerRepo(job);
+
+      const result = await claimWorkerJob(
+        {
+          auth: { tenantId: "tenant-1", workerId: "worker-1", runtimeType: "hermes_agent_gateway" } as any,
+          workerId: "worker-1",
+          payload: { maxJobs: 1, capabilityHints: ["ffmpeg-probe"] },
+        },
+        { repo } as any,
+      );
+
+      expect(result.job).toBeNull();
+      expect(repo.tryClaimJob).not.toHaveBeenCalled();
+    });
+
+    it("skips a hermes job whose connection is assigned to a DIFFERENT worker (connection affinity), even with the capability hint present", async () => {
+      const { claimWorkerJob } = await import("../workerRegistryService");
+      const job = hermesJob();
+      const repo = hermesWorkerRepo(job, {
+        getHermesConnectionAssignedWorkerId: vi.fn().mockResolvedValue("worker-OTHER"),
+      });
+
+      const result = await claimWorkerJob(
+        {
+          auth: { tenantId: "tenant-1", workerId: "worker-1", runtimeType: "hermes_agent_gateway" } as any,
+          workerId: "worker-1",
+          payload: { maxJobs: 1, capabilityHints: ["hermes_media"] },
+        },
+        { repo } as any,
+      );
+
+      expect(result.job).toBeNull();
+      expect(repo.tryClaimJob).not.toHaveBeenCalled();
+      expect(repo.getHermesConnectionAssignedWorkerId).toHaveBeenCalledWith({ tenantId: "tenant-1", connectionId: "conn-1" });
+    });
+
+    it("claims a hermes job when the capability hint is present AND the connection is assigned to this worker", async () => {
+      const { claimWorkerJob } = await import("../workerRegistryService");
+      const job = hermesJob();
+      const repo = hermesWorkerRepo(job);
+
+      const result = await claimWorkerJob(
+        {
+          auth: { tenantId: "tenant-1", workerId: "worker-1", runtimeType: "hermes_agent_gateway" } as any,
+          workerId: "worker-1",
+          payload: { maxJobs: 1, capabilityHints: ["hermes_media"] },
+        },
+        { repo } as any,
+      );
+
+      expect(result.job?.id).toBe("job-hermes-1");
+      expect(repo.tryClaimJob).toHaveBeenCalledTimes(1);
+    });
+
+    it("no-availability regression: a worker with empty capabilityHints still claims a DIFFERENT, unrelated job when a mismatched hermes job is also in its candidate pool", async () => {
+      const { claimWorkerJob } = await import("../workerRegistryService");
+      const hermesCandidate = hermesJob({ id: "job-hermes-mismatch" });
+      const unrelatedCandidate = hermesJob({
+        id: "job-hf-unrelated-2",
+        jobType: "hyperframes_final_composite",
+        capabilityRequirementsJson: {},
+      });
+
+      const repo = {
+        getWorkerById: vi.fn().mockResolvedValue({
+          id: "worker-1",
+          tenantId: "tenant-1",
+          teamId: null,
+          runtimeType: "hermes_agent_gateway",
+          status: "online",
+          capabilitiesJson: {},
+        }),
+        // Hermes candidate listed FIRST — proves the loop moves past the
+        // disqualified candidate to the next one, rather than aborting.
+        listClaimableJobs: vi.fn().mockResolvedValue([hermesCandidate, unrelatedCandidate]),
+        getHermesConnectionAssignedWorkerId: vi.fn().mockResolvedValue("worker-1"),
+        tryClaimJob: vi.fn().mockImplementation(async (jobId: string) =>
+          jobId === "job-hf-unrelated-2"
+            ? {
+                ...unrelatedCandidate,
+                workerId: "worker-1",
+                status: "claimed",
+                leaseOwnerToken: "lease-hf-2",
+                leaseExpiresAt: new Date("2030-06-01T00:05:00.000Z"),
+              }
+            : null,
+        ),
+        updateJob: vi.fn().mockImplementation(async (_jobId, values) => ({ ...unrelatedCandidate, ...values })),
+      };
+
+      const result = await claimWorkerJob(
+        {
+          auth: { tenantId: "tenant-1", workerId: "worker-1", runtimeType: "hermes_agent_gateway" } as any,
+          workerId: "worker-1",
+          payload: { maxJobs: 1, capabilityHints: [] },
+        },
+        { repo } as any,
+      );
+
+      expect(result.job?.id).toBe("job-hf-unrelated-2");
+      expect(repo.tryClaimJob).not.toHaveBeenCalledWith("job-hermes-mismatch", expect.anything(), expect.anything(), expect.anything());
+      expect(repo.tryClaimJob).toHaveBeenCalledWith(
+        "job-hf-unrelated-2",
+        "worker-1",
+        expect.any(String),
+        expect.any(Date),
+      );
+    });
+  });
+
   it("requires matching assignmentAttempt for HyperFrames progress events", async () => {
     const { recordWorkerJobEvent } = await import("../workerRegistryService");
 
diff --git a/apps/web/server/services/hermesMediaAdmission.ts b/apps/web/server/services/hermesMediaAdmission.ts
new file mode 100644
index 000000000..7dffacaee
--- /dev/null
+++ b/apps/web/server/services/hermesMediaAdmission.ts
@@ -0,0 +1,406 @@
+/**
+ * Feature 135 — Hermes Grok media worker: admission control (spec §9,
+ * §13.7). The single gate every `hermes_media_*` submission passes through
+ * BEFORE a `worker_jobs` row is ever inserted (`hermesMediaScheduler.ts`
+ * calls `checkHermesMediaAdmission` as step 4 of its 9-step flow).
+ *
+ * Check order (cheapest → most specific), each mapping to its own spec
+ * §13.7 code:
+ *   1. per-connection running=1                       → HERMES_CONNECTION_BUSY
+ *   2. queued-per-user / tenant shared-pool queued cap → HERMES_QUEUE_FULL
+ *   3. sliding submission windows (user / tenant)      → HERMES_RATE_LIMITED
+ *   4. per-connection dailyJobQuota                    → HERMES_QUOTA_EXHAUSTED
+ *
+ * Running/queued counts are read from real `worker_jobs` rows via the
+ * injectable `HermesAdmissionCounters` repo seam (no DB required in unit
+ * tests — inject a `vi.fn()` fake). The sliding-window and daily-quota
+ * counters are conceptually Redis-backed (the default implementation uses
+ * the shared cache Redis client, mirroring
+ * `server/middleware/distributedRateLimit.ts`'s sorted-set sliding-window
+ * approach) but are ALSO fully injectable so tests never touch real Redis.
+ *
+ * `batchSize` (portrait candidate batches, spec §9) is added to the
+ * queued/window counts as a single admit-all-or-none decision for THIS call
+ * — every check below evaluates `currentCount + batchSize` against the cap
+ * rather than incrementing one candidate at a time.
+ *
+ * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { and, eq, inArray, sql } from "drizzle-orm";
+
+import { getDb } from "../db";
+import { hermesProviderConnections, workerJobs, type HermesProviderConnection } from "../../drizzle/schema";
+import { HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE } from "../../shared/workerRuntime";
+import type { HermesMediaErrorCode, HermesMediaOperation } from "../../shared/hermesMedia";
+import { getHermesWorkerSettings, type HermesWorkerSettings } from "./hermesWorkerSettings";
+
+// ────────────────────────────────────────────────────────────────────────
+// Public types
+// ────────────────────────────────────────────────────────────────────────
+
+export type HermesAdmissionResult =
+  | { ok: true }
+  | { ok: false; code: HermesMediaErrorCode; retryAfterSeconds?: number };
+
+/** The subset of `HermesWorkerSettings` the limit-coherence validator and
+ *  the admission check both care about — kept separate from the full
+ *  settings shape so `validateHermesLimitCoherence` can be called with just
+ *  the fields being written (the settings write path validates one key at
+ *  a time). */
+export interface HermesAdmissionLimits {
+  maxRunningPerConnection: number;
+  maxQueuedPerUser: number;
+  maxQueuedPerTenantSharedPool: number;
+  submitWindowPerUser: number;
+  submitWindowPerTenant: number;
+}
+
+/** The largest single-call admission batch the product ships (the portrait
+ *  candidate batch, spec §9) — `validateHermesLimitCoherence` rejects any
+ *  `maxQueuedPerUser` configuration below this floor, since a smaller cap
+ *  would make that batch permanently un-admittable. */
+export const HERMES_MAX_ADMISSION_BATCH_SIZE = 4;
+
+/**
+ * Called by the settings write path (`server/routers/systemSettings.ts`'s
+ * `updateSetting` mutation, section-01 cache-clear hook site) whenever
+ * `hermes_max_queued_per_user` is written. Rejects a configuration that
+ * would make the max admission batch size permanently un-admittable.
+ */
+export function validateHermesLimitCoherence(
+  limits: HermesAdmissionLimits,
+): { ok: boolean; reason?: string } {
+  if (!Number.isFinite(limits.maxQueuedPerUser) || limits.maxQueuedPerUser < HERMES_MAX_ADMISSION_BATCH_SIZE) {
+    return {
+      ok: false,
+      reason:
+        `hermes_max_queued_per_user must be at least ${HERMES_MAX_ADMISSION_BATCH_SIZE} `
+        + `(the maximum single-call admission batch size, e.g. a portrait candidate batch)`,
+    };
+  }
+  return { ok: true };
+}
+
+/** Redis key shape for the per-connection daily job quota counter — the
+ *  SAME counter section-12 increments on job completion; this module only
+ *  ever READS it (never increments). Exported for section-12 reuse. */
+export function buildHermesQuotaKey(connectionId: string, dateKey: string): string {
+  return `hermes:quota:${connectionId}:${dateKey}`;
+}
+
+function todayDateKey(now: Date): string {
+  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Injectable counter store
+// ────────────────────────────────────────────────────────────────────────
+
+export interface HermesSlidingWindowCheckResult {
+  allowed: boolean;
+  retryAfterSeconds?: number;
+}
+
+/**
+ * Small counter-store seam so unit tests never need a real DB or a real
+ * Redis — every method here is independently fakeable with `vi.fn()`.
+ */
+export interface HermesAdmissionCounters {
+  /** Jobs on this connection that are currently claimed/running/uploading
+   *  etc (i.e. actively occupying the connection) — the "running=1" gate. */
+  countRunningForConnection(connectionId: string): Promise<number>;
+  /** Currently queued `hermes_media_*` jobs for this user, across all
+   *  connections. */
+  countQueuedForUser(userId: number): Promise<number>;
+  /** Currently queued `hermes_media_*` jobs across every `server_shared`
+   *  connection in this tenant. */
+  countQueuedForTenantSharedPool(tenantId: string): Promise<number>;
+  /**
+   * Atomically checks whether admitting `amount` more submission events for
+   * `key` within the trailing `windowSeconds` would exceed `limit`: if not,
+   * records `amount` events and resolves `{ allowed: true }`; if it would,
+   * records nothing and resolves `{ allowed: false, retryAfterSeconds }`.
+   */
+  checkAndIncrementSlidingWindow(
+    key: string,
+    windowSeconds: number,
+    limit: number,
+    amount: number,
+  ): Promise<HermesSlidingWindowCheckResult>;
+  /** Reads (never increments — section-12 increments this on completion)
+   *  the connection's daily quota usage for the given `YYYY-MM-DD` key. */
+  getDailyQuotaUsage(connectionId: string, dateKey: string): Promise<number>;
+}
+
+const HERMES_MEDIA_JOB_TYPES = [HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE] as const;
+
+/** Non-`queued`, non-terminal statuses — a job in any of these is actively
+ *  occupying its connection (the "running=1" gate counts all of them, not
+ *  literally only `status === "running"`). */
+const ACTIVE_CONNECTION_STATUSES = [
+  "claimed",
+  "preparing",
+  "running",
+  "uploading",
+  "publishing",
+  "indexing",
+] as const;
+
+async function dbCountRunningForConnection(connectionId: string): Promise<number> {
+  const db = await getDb();
+  const [row] = await db
+    .select({ count: sql<number>`count(*)::int` })
+    .from(workerJobs)
+    .where(
+      and(
+        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
+        inArray(workerJobs.status, [...ACTIVE_CONNECTION_STATUSES]),
+        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
+      ),
+    );
+  return row?.count ?? 0;
+}
+
+/**
+ * FIX 2 (code review, MAJOR): a queued row's "weight" against the cap is its
+ * `inputJson.settings.outputCount` (portrait/batch outputs), defaulting to 1
+ * when absent — NOT a flat 1-per-row. Without this, an existing outputCount:4
+ * row counted as 1 while an incoming outputCount:4 request's `batchSize`
+ * counted as 4 against the SAME cap, letting the queue overshoot the
+ * configured cap by up to ~2.5x. Summing this JSONB path in SQL keeps
+ * existing rows and the incoming request on the same unit scale.
+ */
+const QUEUED_WEIGHT_SQL = sql<number>`COALESCE(SUM(COALESCE((${workerJobs.inputJson}->'settings'->>'outputCount')::int, 1)), 0)::int`;
+
+async function dbCountQueuedForUser(userId: number): Promise<number> {
+  const db = await getDb();
+  const [row] = await db
+    .select({ weight: QUEUED_WEIGHT_SQL })
+    .from(workerJobs)
+    .where(
+      and(
+        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
+        eq(workerJobs.status, "queued"),
+        eq(workerJobs.requestedByUserId, userId),
+      ),
+    );
+  return row?.weight ?? 0;
+}
+
+async function dbCountQueuedForTenantSharedPool(tenantId: string): Promise<number> {
+  const db = await getDb();
+  const [row] = await db
+    .select({ weight: QUEUED_WEIGHT_SQL })
+    .from(workerJobs)
+    .innerJoin(
+      hermesProviderConnections,
+      sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${hermesProviderConnections.id}`,
+    )
+    .where(
+      and(
+        eq(workerJobs.tenantId, tenantId),
+        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
+        eq(workerJobs.status, "queued"),
+        eq(hermesProviderConnections.scope, "server_shared"),
+      ),
+    );
+  return row?.weight ?? 0;
+}
+
+/**
+ * FIX 1a (code review, BLOCKER): the sliding window used to be a
+ * check-then-act pair of round-trips (ZCARD, then ZADD) — two concurrent
+ * callers could both read a count under the limit before either wrote,
+ * admitting more than `limit` submissions in the same window. A single Lua
+ * script makes prune → count → (conditionally) write ONE atomic round-trip
+ * (Redis executes scripts single-threaded — no other command can interleave
+ * mid-script), closing that race. Uses server-side `TIME` (not a
+ * client-supplied timestamp) so concurrent invocations naturally get
+ * distinct, monotonic-enough scores/members without a shared clock.
+ */
+const SLIDING_WINDOW_ADMIT_SCRIPT = `
+local key = KEYS[1]
+local windowSeconds = tonumber(ARGV[1])
+local limit = tonumber(ARGV[2])
+local amount = tonumber(ARGV[3])
+
+local time = redis.call('TIME')
+local nowSeconds = tonumber(time[1]) + (tonumber(time[2]) / 1000000)
+local windowStart = nowSeconds - windowSeconds
+
+redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
+local count = redis.call('ZCARD', key)
+
+if count + amount > limit then
+  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
+  local retryAfter = windowSeconds
+  if oldest[2] then
+    retryAfter = math.ceil(tonumber(oldest[2]) + windowSeconds - nowSeconds)
+    if retryAfter < 1 then retryAfter = 1 end
+  end
+  return {0, retryAfter}
+end
+
+for i = 1, amount do
+  redis.call('ZADD', key, nowSeconds, tostring(nowSeconds) .. ':' .. tostring(i) .. ':' .. tostring(math.random(1, 2147483647)))
+end
+redis.call('EXPIRE', key, windowSeconds + 60)
+return {1, 0}
+`;
+
+async function redisCheckAndIncrementSlidingWindow(
+  key: string,
+  windowSeconds: number,
+  limit: number,
+  amount: number,
+): Promise<HermesSlidingWindowCheckResult> {
+  try {
+    const { getCacheClient } = await import("./redisClients");
+    const redis = getCacheClient();
+
+    const result = (await redis.eval(
+      SLIDING_WINDOW_ADMIT_SCRIPT,
+      1,
+      key,
+      windowSeconds,
+      limit,
+      amount,
+    )) as [number, number];
+
+    const [admitted, retryAfter] = result;
+    if (admitted === 1) {
+      return { allowed: true };
+    }
+    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
+  } catch {
+    // Fail closed (mirrors `distributedRateLimit.ts`'s `checkRateLimit`) — a
+    // Redis outage must never silently bypass the submission rate limiter.
+    return { allowed: false, retryAfterSeconds: 30 };
+  }
+}
+
+async function redisGetDailyQuotaUsage(connectionId: string, dateKey: string): Promise<number> {
+  try {
+    const { getCacheClient } = await import("./redisClients");
+    const redis = getCacheClient();
+    const raw = await redis.get(buildHermesQuotaKey(connectionId, dateKey));
+    const parsed = raw ? Number.parseInt(raw, 10) : 0;
+    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
+  } catch {
+    // Deliberately fail OPEN here (usage "unknown" = 0): failing closed would
+    // block every submission on a Redis blip even for connections with no
+    // quota configured. running=1 + the submission windows above still gate
+    // abuse; this counter is a secondary, admin-configured guard.
+    return 0;
+  }
+}
+
+export const defaultHermesAdmissionCounters: HermesAdmissionCounters = {
+  countRunningForConnection: dbCountRunningForConnection,
+  countQueuedForUser: dbCountQueuedForUser,
+  countQueuedForTenantSharedPool: dbCountQueuedForTenantSharedPool,
+  checkAndIncrementSlidingWindow: redisCheckAndIncrementSlidingWindow,
+  getDailyQuotaUsage: redisGetDailyQuotaUsage,
+};
+
+// ────────────────────────────────────────────────────────────────────────
+// checkHermesMediaAdmission
+// ────────────────────────────────────────────────────────────────────────
+
+export interface HermesAdmissionParams {
+  tenantId: string;
+  userId: number;
+  connection: HermesProviderConnection;
+  operation: HermesMediaOperation;
+  /** Portrait candidate batches submit >1 job in a single admission call —
+   *  every count below is checked as `current + batchSize` (admit all or
+   *  none). Defaults to 1. */
+  batchSize?: number;
+}
+
+export interface HermesAdmissionDeps {
+  getSettings?: () => Promise<HermesWorkerSettings>;
+  counters?: HermesAdmissionCounters;
+  now?: () => Date;
+}
+
+export async function checkHermesMediaAdmission(
+  params: HermesAdmissionParams,
+  deps: HermesAdmissionDeps = {},
+): Promise<HermesAdmissionResult> {
+  const getSettings = deps.getSettings ?? getHermesWorkerSettings;
+  const counters = deps.counters ?? defaultHermesAdmissionCounters;
+  const now = deps.now ?? (() => new Date());
+
+  const settings = await getSettings();
+  const batchSize = Math.max(1, Math.trunc(params.batchSize ?? 1));
+  const isPrivateWorker = params.connection.scope === "private_worker";
+  const isSharedPool = params.connection.scope === "server_shared";
+
+  // 1. Per-connection running=1 (control-plane protection — applies to
+  // every scope, including private workers).
+  const runningCount = await counters.countRunningForConnection(params.connection.id);
+  if (runningCount >= settings.maxRunningPerConnection) {
+    return { ok: false, code: "HERMES_CONNECTION_BUSY" };
+  }
+
+  // 2a. Queued-per-user cap (applies regardless of scope).
+  const queuedForUser = await counters.countQueuedForUser(params.userId);
+  if (queuedForUser + batchSize > settings.maxQueuedPerUser) {
+    return { ok: false, code: "HERMES_QUEUE_FULL" };
+  }
+
+  // 2b. Tenant shared-pool queued cap — server_shared only; private/personal
+  // connections never contend for the shared pool's capacity.
+  if (isSharedPool) {
+    const queuedForTenantSharedPool = await counters.countQueuedForTenantSharedPool(params.tenantId);
+    if (queuedForTenantSharedPool + batchSize > settings.maxQueuedPerTenantSharedPool) {
+      return { ok: false, code: "HERMES_QUEUE_FULL" };
+    }
+  }
+
+  // 3a. Per-user sliding submission window (applies regardless of scope —
+  // private workers keep this limiter per spec §9).
+  const userWindow = await counters.checkAndIncrementSlidingWindow(
+    `hermes:submit:user:${params.userId}`,
+    600,
+    settings.submitWindowPerUser,
+    batchSize,
+  );
+  if (!userWindow.allowed) {
+    return {
+      ok: false,
+      code: "HERMES_RATE_LIMITED",
+      retryAfterSeconds: Math.max(1, userWindow.retryAfterSeconds ?? 60),
+    };
+  }
+
+  // 3b. Tenant-wide sliding submission window — exempt for private workers
+  // (spec §9: "private workers exempt from the tenant shared-pool caps").
+  if (!isPrivateWorker) {
+    const tenantWindow = await counters.checkAndIncrementSlidingWindow(
+      `hermes:submit:tenant:${params.tenantId}`,
+      600,
+      settings.submitWindowPerTenant,
+      batchSize,
+    );
+    if (!tenantWindow.allowed) {
+      return {
+        ok: false,
+        code: "HERMES_RATE_LIMITED",
+        retryAfterSeconds: Math.max(1, tenantWindow.retryAfterSeconds ?? 60),
+      };
+    }
+  }
+
+  // 4. Per-connection dailyJobQuota — null/undefined means unlimited.
+  if (typeof params.connection.dailyJobQuota === "number") {
+    const usage = await counters.getDailyQuotaUsage(params.connection.id, todayDateKey(now()));
+    if (usage + batchSize > params.connection.dailyJobQuota) {
+      return { ok: false, code: "HERMES_QUOTA_EXHAUSTED" };
+    }
+  }
+
+  return { ok: true };
+}
diff --git a/apps/web/server/services/hermesMediaScheduler.ts b/apps/web/server/services/hermesMediaScheduler.ts
new file mode 100644
index 000000000..f421fd090
--- /dev/null
+++ b/apps/web/server/services/hermesMediaScheduler.ts
@@ -0,0 +1,715 @@
+/**
+ * Feature 135 — Hermes Grok media worker: `queueHermesMediaJob`, the single
+ * server-side entry point every generation surface submits a Hermes media
+ * job through (spec §9, §10.2, §13.7, §14).
+ *
+ * Flow (fail-closed at every step; every typed rejection throws
+ * `new TRPCError({ code, message: formatHermesErrorMessage(code, detail?) })`
+ * per the section-01 wire convention):
+ *
+ *   1. Flags: global `hermes_worker_enabled` + tenant `hermesMediaWorker`
+ *      flag → `HERMES_DISABLED`.
+ *   2. Resolve connection (single pass, no tier fallback): explicit
+ *      `connectionId` → `repo.findConnectionById`; else auto-pick the
+ *      eligible `server_shared` connection whose capability manifest
+ *      advertises the operation's asset type, skipping any connection that
+ *      is currently busy (running > 0), then picking the lowest queue depth
+ *      with daily-quota headroom (code review FIX 3). Enforces tenant +
+ *      (personal/private) owner match and `status === "authorized"`.
+ *   2b. Per-scope flag (+ video flag for video operations) → `HERMES_DISABLED`.
+ *   3. Assigned worker online (heartbeat-staleness) → `HERMES_WORKER_UNAVAILABLE`.
+ *   4. Contract validation: `hermesMediaJobContractSchema.parse` +
+ *      `effectiveHermesCapability` operation/reference-limit gate — BEFORE
+ *      admission/fee (TDD §3.2), never silently degraded.
+ *   5. Idempotency (non-terminal jobs only — a terminal prior job never
+ *      blocks a fresh submit; gets an attempt-suffixed key instead). Checked
+ *      BEFORE admission (code review FIX 4) so a duplicate submit against an
+ *      already non-terminal job never consumes a submission-window slot or a
+ *      queued-cap unit, and never reserves (then has to refund) a second fee.
+ *   6. `checkHermesMediaAdmission` (batchSize from `settings.outputCount`) —
+ *      runs INSIDE `repo.withAdmissionLock` (code review FIX 1), together
+ *      with the fee reserve and the insert, so the whole
+ *      check-then-act sequence is race-safe under concurrent submissions.
+ *   7. Fee: iff `scope === "server_shared"` && `hermes_shared_pool_fee_credits > 0`.
+ *   8. `repo.insertJob`.
+ *   9. Return `{ created, taskId: "hermes_" + job.id, job }`.
+ *
+ * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { createHash } from "node:crypto";
+import { and, eq, inArray, sql } from "drizzle-orm";
+import { TRPCError } from "@trpc/server";
+import { ZodError } from "zod";
+
+import { getDb } from "../db";
+import {
+  hermesProviderConnections,
+  workerJobs,
+  workers,
+  type HermesProviderConnection,
+  type Worker,
+} from "../../drizzle/schema";
+import {
+  HERMES_MEDIA_CAPABILITY_FAMILIES,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+} from "../../shared/workerRuntime";
+import {
+  effectiveHermesCapability,
+  formatHermesErrorMessage,
+  hermesMediaJobContractSchema,
+  type HermesConnectionCapabilityManifest,
+  type HermesMediaErrorCode,
+  type HermesMediaJobContract,
+  type HermesMediaOperation,
+} from "../../shared/hermesMedia";
+import { refundReservation } from "./creditService";
+import {
+  reserveWorkerJobCredits,
+  type WorkerJobBillingEnvelope,
+} from "./workerBillingService";
+import { checkHermesMediaAdmission, type HermesAdmissionResult } from "./hermesMediaAdmission";
+import { getHermesWorkerSettings, type HermesWorkerSettings } from "./hermesWorkerSettings";
+import { HERMES_WORKER_ONLINE_STALE_MS } from "./hermesConnectionService";
+import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
+import type { TenantFeatureFlags } from "../../shared/featureFlags";
+import { debugError } from "../_core/logger";
+
+type WorkerJobRecord = Record<string, any>;
+type HermesConnectionAssetType = "image" | "video";
+
+// ────────────────────────────────────────────────────────────────────────
+// Public types
+// ────────────────────────────────────────────────────────────────────────
+
+/**
+ * Queue-only additive fields layered on top of the frozen `hermesMedia`
+ * contract (`shared/hermesMedia.ts`), mirroring the
+ * `QueueVerticalDramaFfmpegAssemblyJobInput extends ...JobContract` pattern
+ * in `workerSchedulerService.ts`.
+ *
+ * `connectionId` is deliberately OPTIONAL here (unlike the frozen contract,
+ * where it's a required non-empty string) — an omitted/blank value means
+ * "auto-pick from the shared pool" (step 2); the final, fully-resolved
+ * `connectionId` is substituted back in before schema validation (step 4).
+ */
+export interface QueueHermesMediaJobInput extends Omit<HermesMediaJobContract, "connectionId"> {
+  connectionId?: string;
+  tenantId: string;
+  requestedByUserId: number;
+  priority?: number;
+  idempotencyKey?: string;
+}
+
+/**
+ * Narrow repo seam this scheduler needs beyond
+ * `WorkerSchedulerRepository`'s `findJobByIdempotencyKey` /
+ * `findWorkerById` / `insertJob` (all reused verbatim from that
+ * interface's shape, not its private `defaultRepo`, which isn't exported).
+ */
+export interface HermesSchedulerRepoExtras {
+  findConnectionById(params: { tenantId: string; connectionId: string }): Promise<HermesProviderConnection | null>;
+  listEligibleSharedConnections(params: {
+    tenantId: string;
+    assetType: HermesConnectionAssetType;
+  }): Promise<HermesProviderConnection[]>;
+  countQueuedForConnection(params: { connectionId: string }): Promise<number>;
+  /** Code review FIX 3: jobs on this connection that are actively occupying
+   *  it (claimed/preparing/running/etc) — the auto-pick loop skips any
+   *  candidate with a non-zero count here BEFORE ranking by queue depth, so
+   *  a busy shared connection is never handed a new job just because its
+   *  queue happens to be shallow. */
+  countRunningForConnection(params: { connectionId: string }): Promise<number>;
+  isWorkerOnline(params: { tenantId: string; workerId: string }): Promise<boolean>;
+  /** Optional hook for a future global `media_models`-style row lookup
+   *  (section-09/12) — absent today, so the operation-unsupported gate
+   *  relies solely on the connection's own capability manifest. */
+  findHermesModelRow?(params: {
+    model: string;
+    assetType: HermesConnectionAssetType;
+  }): Promise<{ enabled?: boolean; maxReferences?: number; maxOutputs?: number } | null>;
+  /**
+   * Code review FIX 1 (BLOCKER): admission is check-then-act — without a
+   * mutual-exclusion seam, two concurrent submissions can both read counts
+   * under the cap before either writes, admitting more than the configured
+   * cap. `withAdmissionLock` runs `fn` with exclusive access for every key
+   * in `keys` (the default impl acquires one Postgres advisory
+   * transaction lock per key, sorted for a stable acquisition order to
+   * avoid cross-key deadlocks, inside ONE transaction) — the admission
+   * check, the fee reserve, and the `insertJob` call all run inside this
+   * one `fn` so the whole "check counts then insert" sequence is race-safe.
+   * Tests inject a fake (e.g. a simple promise-chain mutex) so unit tests
+   * never need a real Postgres connection.
+   */
+  withAdmissionLock<T>(keys: string[], fn: () => Promise<T>): Promise<T>;
+}
+
+export interface HermesSchedulerRepository extends HermesSchedulerRepoExtras {
+  findJobByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<WorkerJobRecord | null>;
+  findWorkerById(tenantId: string, workerId: string): Promise<Worker | null>;
+  insertJob(values: Record<string, unknown>): Promise<WorkerJobRecord>;
+}
+
+export interface QueueHermesMediaJobDeps {
+  repo?: HermesSchedulerRepository;
+  admission?: typeof checkHermesMediaAdmission;
+  reserveFee?: typeof reserveWorkerJobCredits;
+  getFlags?: (tenantId: string) => Promise<TenantFeatureFlags>;
+  getSettings?: typeof getHermesWorkerSettings;
+  now?: () => Date;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Constants
+// ────────────────────────────────────────────────────────────────────────
+
+/** Below `HERMES_CONTROL_JOB_PRIORITY` (50, `hermesConnectionJobs.ts`) —
+ *  control jobs must always jump the media queue on the same worker. */
+const HERMES_MEDIA_JOB_DEFAULT_PRIORITY = 25;
+
+const HERMES_MEDIA_JOB_TYPES = [HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE] as const;
+
+const HERMES_MEDIA_JOB_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
+  "completed",
+  "failed",
+  "canceled",
+  "expired",
+]);
+
+/** Non-`queued`, non-terminal statuses — a job in any of these is actively
+ *  occupying its connection (mirrors `hermesMediaAdmission.ts`'s own
+ *  `ACTIVE_CONNECTION_STATUSES` — duplicated here rather than imported so
+ *  this module never reaches into that module's private internals). */
+const ACTIVE_CONNECTION_STATUSES = [
+  "claimed",
+  "preparing",
+  "running",
+  "uploading",
+  "publishing",
+  "indexing",
+] as const;
+
+const HERMES_MEDIA_REQUIRED_PROGRESS_STAGES = [
+  "downloading_references",
+  "starting_hermes",
+  "generating",
+  "collecting_output",
+  "validating_output",
+  "uploading",
+] as const;
+
+const IMAGE_HERMES_TIMEOUT_SECONDS = 600;
+const VIDEO_HERMES_TIMEOUT_SECONDS = 1800;
+
+const IMAGE_OPERATIONS: HermesMediaOperation[] = ["image.generate", "image.edit"];
+const VIDEO_OPERATIONS: HermesMediaOperation[] = [
+  "video.generate",
+  "video.image_to_video",
+  "video.reference_to_video",
+];
+
+// ────────────────────────────────────────────────────────────────────────
+// Small helpers
+// ────────────────────────────────────────────────────────────────────────
+
+function hermesTypedError(
+  code: HermesMediaErrorCode,
+  httpCode: "FORBIDDEN" | "NOT_FOUND" | "PRECONDITION_FAILED" | "BAD_REQUEST" | "TOO_MANY_REQUESTS",
+  detail?: string,
+): TRPCError {
+  return new TRPCError({ code: httpCode, message: formatHermesErrorMessage(code, detail) });
+}
+
+function assetTypeForOperation(operation: HermesMediaOperation): HermesConnectionAssetType {
+  return operation.startsWith("image.") ? "image" : "video";
+}
+
+function scopeFlagFrom(settings: HermesWorkerSettings, scope: HermesProviderConnection["scope"]): boolean {
+  if (scope === "server_shared") return settings.sharedPoolEnabled;
+  if (scope === "server_personal") return settings.serverPersonalEnabled;
+  return settings.privateEnabled;
+}
+
+/**
+ * Code review FIX 3: `listEligibleSharedConnections` must actually use its
+ * `assetType` — a connection's capability manifest is the source of truth
+ * for whether it can serve image vs video operations. A connection with no
+ * manifest yet (never successfully probed) is treated as NOT eligible
+ * (strict — mirrors the operation-unsupported gate's "never silently
+ * degraded" rule) rather than permissively assumed to support everything.
+ */
+function isAssetTypeEnabledInManifest(
+  manifest: HermesConnectionCapabilityManifest | null | undefined,
+  assetType: HermesConnectionAssetType,
+): boolean {
+  if (!manifest) return false;
+  const ops = assetType === "image" ? IMAGE_OPERATIONS : VIDEO_OPERATIONS;
+  return ops.some((op) => manifest.operations?.[op]?.enabled === true);
+}
+
+/** Maps a non-`authorized` connection status to its typed rejection code
+ *  (spec §13.7). `pending` / `disconnected` / `error` all mean "this
+ *  connection isn't usable right now, (re)connect it" — `reauth_required`
+ *  and `entitlement_restricted` get their own dedicated codes. */
+function mapConnectionStatusToErrorCode(
+  status: HermesProviderConnection["status"],
+): HermesMediaErrorCode {
+  if (status === "reauth_required") return "HERMES_REAUTH_REQUIRED";
+  if (status === "entitlement_restricted") return "HERMES_ENTITLEMENT_RESTRICTED";
+  return "HERMES_CONNECTION_REQUIRED";
+}
+
+function isWorkerOnlineNow(worker: Pick<Worker, "status" | "lastSeenAt"> | null | undefined, now: Date): boolean {
+  if (!worker) return false;
+  if (worker.status !== "online") return false;
+  if (!worker.lastSeenAt) return false;
+  const lastSeenMs = new Date(worker.lastSeenAt).getTime();
+  if (!Number.isFinite(lastSeenMs)) return false;
+  return now.getTime() - lastSeenMs <= HERMES_WORKER_ONLINE_STALE_MS;
+}
+
+/** Classifies a contract-schema `ZodError` against the two reference-shape
+ *  rejection codes spec §13.7 defines — bounds violations (wrong count for
+ *  the operation, or exceeding the connection's effective max) map to
+ *  `HERMES_REFERENCE_LIMIT_EXCEEDED`; index/label conflicts (non-continuous,
+ *  duplicate index, duplicate label) map to `HERMES_REFERENCE_MAPPING_CONFLICT`. */
+function classifyContractZodError(error: ZodError): HermesMediaErrorCode {
+  const messages = error.issues.map((issue) => issue.message);
+  if (messages.some((message) => message.includes("requires between"))) {
+    return "HERMES_REFERENCE_LIMIT_EXCEEDED";
+  }
+  if (
+    messages.some(
+      (message) =>
+        message.includes("continuous")
+        || message.includes("must be unique"),
+    )
+  ) {
+    return "HERMES_REFERENCE_MAPPING_CONFLICT";
+  }
+  return "HERMES_REFERENCE_LIMIT_EXCEEDED";
+}
+
+function buildWorkerBillingMetadata(billing: WorkerJobBillingEnvelope | null): Record<string, unknown> | undefined {
+  if (!billing) return undefined;
+  return {
+    reservationId: billing.reservationId,
+    reservedCredits: billing.reservedCredits,
+    sourceType: billing.sourceType,
+  };
+}
+
+async function buildFreshAttemptIdempotencyKey(
+  repo: HermesSchedulerRepository,
+  tenantId: string,
+  baseKey: string,
+): Promise<string> {
+  let attempt = 2;
+  let candidateKey = `${baseKey}:a${attempt}`;
+  // eslint-disable-next-line no-await-in-loop
+  while (await repo.findJobByIdempotencyKey(tenantId, candidateKey)) {
+    attempt += 1;
+    candidateKey = `${baseKey}:a${attempt}`;
+  }
+  return candidateKey;
+}
+
+/** Code review FIX 1: two lock keys per submission — one scoped to the
+ *  connection (guards running=1 + tenant shared-pool queued cap) and one
+ *  scoped to the user (guards the per-user queued cap). Sorted so any two
+ *  concurrent submissions acquire locks in the SAME order regardless of
+ *  which key each needs first, preventing a cross-key deadlock. */
+function buildHermesAdmissionLockKeys(connectionId: string, userId: number): string[] {
+  return [`hermes:conn:${connectionId}`, `hermes:user:${userId}`].sort();
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Default (DB-backed) repo
+// ────────────────────────────────────────────────────────────────────────
+
+export const defaultHermesSchedulerRepo: HermesSchedulerRepository = {
+  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
+    const db = await getDb();
+    const [job] = await db
+      .select()
+      .from(workerJobs)
+      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.idempotencyKey, idempotencyKey)))
+      .limit(1);
+    return job ?? null;
+  },
+
+  async findWorkerById(tenantId, workerId) {
+    const db = await getDb();
+    const [worker] = await db
+      .select()
+      .from(workers)
+      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
+      .limit(1);
+    return worker ?? null;
+  },
+
+  async insertJob(values) {
+    const db = await getDb();
+    const [job] = await db.insert(workerJobs).values(values as any).returning();
+    return job;
+  },
+
+  async findConnectionById({ tenantId, connectionId }) {
+    const db = await getDb();
+    const [row] = await db
+      .select()
+      .from(hermesProviderConnections)
+      .where(and(eq(hermesProviderConnections.id, connectionId), eq(hermesProviderConnections.tenantId, tenantId)))
+      .limit(1);
+    return row ?? null;
+  },
+
+  async listEligibleSharedConnections({ tenantId, assetType }) {
+    const db = await getDb();
+    const rows = await db
+      .select()
+      .from(hermesProviderConnections)
+      .where(
+        and(
+          eq(hermesProviderConnections.tenantId, tenantId),
+          eq(hermesProviderConnections.scope, "server_shared"),
+          eq(hermesProviderConnections.status, "authorized"),
+        ),
+      );
+    return rows.filter((row) => isAssetTypeEnabledInManifest(row.capabilitiesJson, assetType));
+  },
+
+  async countQueuedForConnection({ connectionId }) {
+    const db = await getDb();
+    const [row] = await db
+      .select({ count: sql<number>`count(*)::int` })
+      .from(workerJobs)
+      .where(
+        and(
+          inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
+          eq(workerJobs.status, "queued"),
+          sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
+        ),
+      );
+    return row?.count ?? 0;
+  },
+
+  async countRunningForConnection({ connectionId }) {
+    const db = await getDb();
+    const [row] = await db
+      .select({ count: sql<number>`count(*)::int` })
+      .from(workerJobs)
+      .where(
+        and(
+          inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
+          inArray(workerJobs.status, [...ACTIVE_CONNECTION_STATUSES]),
+          sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
+        ),
+      );
+    return row?.count ?? 0;
+  },
+
+  async isWorkerOnline({ tenantId, workerId }) {
+    const db = await getDb();
+    const [worker] = await db
+      .select()
+      .from(workers)
+      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
+      .limit(1);
+    return isWorkerOnlineNow(worker, new Date());
+  },
+
+  async withAdmissionLock(keys, fn) {
+    const db = await getDb();
+    const sortedKeys = Array.from(new Set(keys)).sort();
+    return db.transaction(async (tx) => {
+      for (const key of sortedKeys) {
+        // eslint-disable-next-line no-await-in-loop
+        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
+      }
+      return fn();
+    });
+  },
+};
+
+// ────────────────────────────────────────────────────────────────────────
+// Connection resolution (step 2 — single pass, no tier fallback)
+// ────────────────────────────────────────────────────────────────────────
+
+async function resolveConnection(params: {
+  tenantId: string;
+  requestedByUserId: number;
+  connectionId: string | undefined;
+  operation: HermesMediaOperation;
+  repo: HermesSchedulerRepository;
+}): Promise<HermesProviderConnection> {
+  const { tenantId, requestedByUserId, connectionId, operation, repo } = params;
+
+  if (connectionId) {
+    const connection = await repo.findConnectionById({ tenantId, connectionId });
+    if (!connection || connection.tenantId !== tenantId) {
+      throw hermesTypedError("HERMES_CONNECTION_REQUIRED", "NOT_FOUND", "connection not found");
+    }
+    if (connection.scope !== "server_shared" && connection.ownerUserId !== requestedByUserId) {
+      // Never let a caller submit against another user's connection — a
+      // NOT_FOUND-style rejection avoids leaking whether it exists.
+      throw hermesTypedError("HERMES_CONNECTION_REQUIRED", "NOT_FOUND", "connection not found");
+    }
+    if (connection.status !== "authorized") {
+      throw hermesTypedError(mapConnectionStatusToErrorCode(connection.status), "PRECONDITION_FAILED");
+    }
+    return connection;
+  }
+
+  // No explicit connectionId — shared-pool auto-pick ONLY. Single pass: a
+  // failure past this point (admission, worker-offline, etc) never falls
+  // back to trying a different connection.
+  const assetType = assetTypeForOperation(operation);
+  const eligible = (await repo.listEligibleSharedConnections({ tenantId, assetType }))
+    .filter((candidate) => candidate.scope === "server_shared" && candidate.status === "authorized")
+    // Defense-in-depth: re-assert the asset-type filter here even though
+    // `listEligibleSharedConnections` is documented to apply it too (FIX 3)
+    // — a fake/test repo that returns an unfiltered list must never leak an
+    // image-only connection into a video auto-pick.
+    .filter((candidate) => isAssetTypeEnabledInManifest(candidate.capabilitiesJson, assetType));
+
+  const withHeadroom: Array<{ connection: HermesProviderConnection; queueDepth: number }> = [];
+  for (const candidate of eligible) {
+    // eslint-disable-next-line no-await-in-loop
+    const runningCount = await repo.countRunningForConnection({ connectionId: candidate.id });
+    if (runningCount > 0) {
+      // FIX 3: a busy connection is skipped outright, before it's ever
+      // ranked by queue depth — picking "lowest queue depth" among busy
+      // candidates would just route into HERMES_CONNECTION_BUSY at the
+      // admission stage instead of trying an idle one.
+      continue;
+    }
+    // eslint-disable-next-line no-await-in-loop
+    const queueDepth = await repo.countQueuedForConnection({ connectionId: candidate.id });
+    if (typeof candidate.dailyJobQuota === "number" && queueDepth >= candidate.dailyJobQuota) {
+      continue;
+    }
+    withHeadroom.push({ connection: candidate, queueDepth });
+  }
+
+  if (withHeadroom.length === 0) {
+    throw hermesTypedError(
+      "HERMES_CONNECTION_REQUIRED",
+      "PRECONDITION_FAILED",
+      "no eligible shared pool connection with capacity",
+    );
+  }
+
+  withHeadroom.sort((a, b) => a.queueDepth - b.queueDepth);
+  return withHeadroom[0].connection;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// queueHermesMediaJob
+// ────────────────────────────────────────────────────────────────────────
+
+function admissionHttpCodeFor(code: HermesMediaErrorCode): "TOO_MANY_REQUESTS" | "FORBIDDEN" {
+  return code === "HERMES_QUOTA_EXHAUSTED" ? "FORBIDDEN" : "TOO_MANY_REQUESTS";
+}
+
+export async function queueHermesMediaJob(
+  rawInput: QueueHermesMediaJobInput,
+  deps: QueueHermesMediaJobDeps = {},
+): Promise<{ created: boolean; taskId: string; job: WorkerJobRecord }> {
+  const repo = deps.repo ?? defaultHermesSchedulerRepo;
+  const admissionFn = deps.admission ?? checkHermesMediaAdmission;
+  const reserveFee = deps.reserveFee ?? reserveWorkerJobCredits;
+  const getFlags = deps.getFlags ?? getTenantFeatureFlags;
+  const getSettings = deps.getSettings ?? getHermesWorkerSettings;
+  const now = deps.now ?? (() => new Date());
+
+  const { tenantId, requestedByUserId, priority, idempotencyKey: callerIdempotencyKey, connectionId: explicitConnectionId, ...contractCore } = rawInput;
+
+  // 1. Flags — global kill switch + tenant rollout flag (cheap, no
+  // connection lookup needed yet).
+  const settings = await getSettings();
+  if (!settings.enabled) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+  const tenantFlags = await getFlags(tenantId);
+  if (!tenantFlags.hermesMediaWorker) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+
+  // 2. Resolve connection (single pass — no tier fallback).
+  const connection = await resolveConnection({
+    tenantId,
+    requestedByUserId,
+    connectionId: explicitConnectionId?.trim() || undefined,
+    operation: rawInput.operation,
+    repo,
+  });
+
+  const assetType = assetTypeForOperation(rawInput.operation);
+
+  // 2b. Per-scope flag (+ video flag for video operations) — now that the
+  // connection's scope is known.
+  if (!scopeFlagFrom(settings, connection.scope)) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+  if (assetType === "video" && !settings.videoEnabled) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+
+  // 3. Assigned worker online (heartbeat-staleness), per spec §9.
+  if (!connection.assignedWorkerId) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
+  }
+  const worker = await repo.findWorkerById(tenantId, connection.assignedWorkerId);
+  if (!worker) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker not found");
+  }
+  const online = await repo.isWorkerOnline({ tenantId, workerId: connection.assignedWorkerId });
+  if (!online) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker offline");
+  }
+
+  // 4. Contract validation — BEFORE admission/fee (TDD §3.2). Substitutes
+  // the resolved connectionId back into the payload before parsing.
+  let parsedContract: HermesMediaJobContract;
+  try {
+    parsedContract = hermesMediaJobContractSchema.parse({ ...contractCore, connectionId: connection.id });
+  } catch (error) {
+    if (error instanceof ZodError) {
+      throw hermesTypedError(classifyContractZodError(error), "BAD_REQUEST", error.issues[0]?.message);
+    }
+    throw error;
+  }
+
+  // Operation-unsupported gate (owns spec §20's "unsupported reference-to-
+  // video is visibly blocked" criterion) — the connection's own capability
+  // manifest is the source of truth here; a future global model-row lookup
+  // (`repo.findHermesModelRow`) can only ever NARROW this further, never
+  // widen it (see `effectiveHermesCapability`'s doc comment).
+  const modelRow = (await repo.findHermesModelRow?.({ model: parsedContract.settings.model, assetType })) ?? {
+    enabled: true,
+  };
+  const effective = effectiveHermesCapability(modelRow, connection.capabilitiesJson, rawInput.operation);
+  if (!effective.enabled) {
+    throw hermesTypedError("HERMES_OPERATION_UNSUPPORTED", "PRECONDITION_FAILED", effective.reason);
+  }
+  if (typeof effective.maxReferences === "number" && parsedContract.references.length > effective.maxReferences) {
+    throw hermesTypedError("HERMES_REFERENCE_LIMIT_EXCEEDED", "BAD_REQUEST", "exceeds connection's effective maximum references");
+  }
+
+  const jobType = assetType === "image" ? HERMES_MEDIA_IMAGE_JOB_TYPE : HERMES_MEDIA_VIDEO_JOB_TYPE;
+
+  // 5. Idempotency — non-terminal jobs only; a terminal prior match never
+  // blocks a fresh submit. Code review FIX 4: checked BEFORE admission (not
+  // just before the fee reserve) so a duplicate submit against an already
+  // non-terminal job never consumes a submission-window slot or a
+  // queued-cap unit, on top of never reserving a second fee.
+  const canonicalHash = createHash("sha256").update(JSON.stringify(parsedContract)).digest("hex").slice(0, 32);
+  const baseIdempotencyKey = callerIdempotencyKey ?? `${jobType}:${connection.id}:${canonicalHash}`;
+  const existing = await repo.findJobByIdempotencyKey(tenantId, baseIdempotencyKey);
+  if (existing && !HERMES_MEDIA_JOB_TERMINAL_STATUSES.has(existing.status)) {
+    return { created: false, taskId: `hermes_${existing.id}`, job: existing };
+  }
+  const idempotencyKeyToUse = existing
+    ? await buildFreshAttemptIdempotencyKey(repo, tenantId, baseIdempotencyKey)
+    : baseIdempotencyKey;
+
+  const batchSize = typeof parsedContract.settings.outputCount === "number" ? parsedContract.settings.outputCount : 1;
+  const workerIdPin = connection.scope === "private_worker" ? connection.assignedWorkerId : null;
+  const resourceProfile = assetType === "image" ? "network_heavy" : "long_running";
+  const timeoutSeconds = assetType === "image" ? IMAGE_HERMES_TIMEOUT_SECONDS : VIDEO_HERMES_TIMEOUT_SECONDS;
+
+  // 6-8. Admission + fee + insert — ALL inside the atomic seam (code review
+  // FIX 1). Without this, two concurrent submissions could both read counts
+  // under the cap before either wrote, admitting more than the configured
+  // cap; `withAdmissionLock`'s default implementation serializes concurrent
+  // callers via a Postgres advisory transaction lock so the count-check and
+  // the insert happen as one indivisible unit.
+  const lockKeys = buildHermesAdmissionLockKeys(connection.id, requestedByUserId);
+  return repo.withAdmissionLock(lockKeys, async () => {
+    const admissionResult: HermesAdmissionResult = await admissionFn(
+      {
+        tenantId,
+        userId: requestedByUserId,
+        connection,
+        operation: rawInput.operation,
+        batchSize,
+      },
+      { now },
+    );
+    if (!admissionResult.ok) {
+      const detail = admissionResult.retryAfterSeconds
+        ? `retry after ${admissionResult.retryAfterSeconds}s`
+        : undefined;
+      throw hermesTypedError(admissionResult.code, admissionHttpCodeFor(admissionResult.code), detail);
+    }
+
+    // 7. Fee — server_shared scope only, and only when a fee is configured.
+    let billing: WorkerJobBillingEnvelope | null = null;
+    if (connection.scope === "server_shared" && settings.sharedPoolFeeCredits > 0) {
+      billing = await reserveFee({
+        userId: requestedByUserId,
+        tenantId,
+        requestedCredits: settings.sharedPoolFeeCredits,
+        metadata: {
+          jobType,
+          connectionId: connection.id,
+          operation: rawInput.operation,
+        },
+      });
+    }
+
+    // 8. Insert.
+    try {
+      const job = await repo.insertJob({
+        tenantId,
+        teamId: null,
+        workerId: workerIdPin,
+        runtimeType: worker.runtimeType,
+        requestedByUserId,
+        requestedBySystemComponent: "hermes_media_scheduler",
+        jobType,
+        status: "queued",
+        statusReason: "hermes_media_scheduler",
+        priority: priority ?? HERMES_MEDIA_JOB_DEFAULT_PRIORITY,
+        resourceProfile,
+        capabilityRequirementsJson: {
+          capabilityFamilies: [...HERMES_MEDIA_CAPABILITY_FAMILIES],
+          requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+          connectionId: connection.id,
+          preferredWorkerId: workerIdPin,
+        },
+        inputJson: parsedContract,
+        instructionsJson: {
+          intent: jobType,
+          requiredProgressStages: [...HERMES_MEDIA_REQUIRED_PROGRESS_STAGES],
+          ...(billing ? { workerBilling: buildWorkerBillingMetadata(billing) } : {}),
+        },
+        timeoutSeconds,
+        retryPolicyJson: { maxAttempts: 2, backoffSeconds: 30 },
+        idempotencyKey: idempotencyKeyToUse,
+      });
+
+      return { created: true, taskId: `hermes_${job.id}`, job };
+    } catch (error) {
+      if (billing?.reservationId) {
+        // Code review FIX 5: a refund failure here means credits stay
+        // reserved-but-orphaned (the job insert already failed, so nothing
+        // will ever reconcile this reservation otherwise) — this must be
+        // loud, not a silent `.catch(() => {})`.
+        try {
+          await refundReservation(billing.reservationId);
+        } catch (refundError) {
+          debugError(
+            "hermesMediaScheduler",
+            `Failed to refund fee reservation ${billing.reservationId} for user ${requestedByUserId} after insert failure`,
+            refundError,
+          );
+        }
+      }
+      throw error;
+    }
+  });
+}
diff --git a/apps/web/server/services/workerRegistryService.ts b/apps/web/server/services/workerRegistryService.ts
index e517aecb4..75069137e 100644
--- a/apps/web/server/services/workerRegistryService.ts
+++ b/apps/web/server/services/workerRegistryService.ts
@@ -31,6 +31,12 @@ import {
   COMFY_IMAGE_GENERATION_PROGRESS_STAGES,
   COMFY_WORKFLOW_RUN_FAILURE_CODES,
   COMFY_WORKFLOW_RUN_PROGRESS_STAGES,
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
   HYPERFRAMES_FINAL_COMPOSITE_FAILURE_CODES,
   HYPERFRAMES_FINAL_COMPOSITE_PROGRESS_STAGES,
   LOCAL_FOLDER_INGEST_FAILURE_CODES,
@@ -62,6 +68,7 @@ import { issueWorkerAccessTokens } from "./workerAuthService";
 import { getDb } from "../db";
 import {
   groupMembers,
+  hermesProviderConnections,
   runtimeProfiles,
   userGroups,
   workerArtifacts,
@@ -102,6 +109,23 @@ const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
  */
 const REMOTION_RENDER_VIDEO_REQUIRED_CLAIM_CAPABILITY: (typeof REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES)[number] =
   "remotion-render";
+
+/**
+ * Feature 135 section-05 — same defense-in-depth precedent as the remotion
+ * constant above, applied to every `hermes_media_*` / `hermes_connection_*`
+ * job type (constants, never a regex over arbitrary job type strings).
+ */
+const HERMES_FABRIC_JOB_TYPES: ReadonlySet<string> = new Set([
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+]);
+
+function isHermesFabricJobType(jobType: string): boolean {
+  return HERMES_FABRIC_JOB_TYPES.has(jobType);
+}
 const RECLAIMABLE_JOB_STATUSES: WorkerJobStatus[] = [
   "claimed",
   "preparing",
@@ -197,6 +221,22 @@ export interface WorkerRuntimeRepository {
   insertJobEvent: (workerJobId: string, eventType: string, payloadJson: Record<string, unknown>) => Promise<WorkerJobEventRecord>;
   listClaimableJobs: (tenantId: string, runtimeType: WorkerRuntimeType, teamId: string | null, capabilityHints: string[]) => Promise<WorkerJobRecord[]>;
   listJobEvents: (workerJobId: string) => Promise<WorkerJobEventRecord[]>;
+  /**
+   * Feature 135 section-05 — narrow lookup backing the hermes claim-time
+   * connection-affinity assertion (mirrors the remotion defense-in-depth
+   * precedent above): resolves a hermes job's pinned `connectionId` to its
+   * currently assigned worker id, so a worker can never cross-claim another
+   * worker's connection's jobs. Optional: only hermes-fabric job types with
+   * a `connectionId` in `capabilityRequirementsJson` ever call this.
+   *
+   * Code review FIX 6: `tenantId` is threaded through for defense-in-depth
+   * consistency with every other tenant-scoped lookup in this repository —
+   * the claim call site already has `worker.tenantId` in scope.
+   */
+  getHermesConnectionAssignedWorkerId?: (params: {
+    tenantId: string;
+    connectionId: string;
+  }) => Promise<string | null>;
   renewActiveJobLeasesForWorker?: (input: { tenantId: string; workerId: string; leaseExpiresAt: Date; heartbeatAt: Date }) => Promise<number>;
   tryClaimJob: (jobId: string, workerId: string, leaseOwnerToken: string, leaseExpiresAt: Date) => Promise<WorkerJobRecord | null>;
   updateJob: (jobId: string, values: Record<string, any>) => Promise<WorkerJobRecord>;
@@ -899,6 +939,15 @@ const defaultRepo: WorkerRuntimeRepository = {
       .where(eq(workerJobEvents.workerJobId, workerJobId))
       .orderBy(asc(workerJobEvents.createdAt));
   },
+  async getHermesConnectionAssignedWorkerId({ tenantId, connectionId }) {
+    const db = await getDb();
+    const [row] = await db
+      .select({ assignedWorkerId: hermesProviderConnections.assignedWorkerId })
+      .from(hermesProviderConnections)
+      .where(and(eq(hermesProviderConnections.id, connectionId), eq(hermesProviderConnections.tenantId, tenantId)))
+      .limit(1);
+    return row?.assignedWorkerId ?? null;
+  },
   async renewActiveJobLeasesForWorker(input) {
     const db = await getDb();
     const leaseIso = input.leaseExpiresAt.toISOString();
@@ -1248,6 +1297,11 @@ export async function claimWorkerJob(
     workerJobMatchesSelection(candidate, worker.id, input.payload.capabilityHints),
   );
 
+  // Feature 135 section-05 — memoizes `connectionId -> assignedWorkerId`
+  // lookups across this single claim call so a candidate pool with several
+  // hermes jobs pinned to the same connection only resolves it once.
+  const hermesConnectionAssignedWorkerIdCache = new Map<string, string | null>();
+
   for (const candidate of selectableCandidates) {
     // Defense-in-depth claim-time assertion (implementation-progress.md
     // gap #2, spec §6.3 step 7) — see the constant's doc comment above.
@@ -1267,6 +1321,44 @@ export async function claimWorkerJob(
       continue;
     }
 
+    // Feature 135 section-05 — same `continue`-not-`throw` discipline as the
+    // remotion fix above (an unrelated candidate later in the same pool
+    // must still be claimable in this pass).
+    if (isHermesFabricJobType(candidate.jobType)) {
+      // Assertion 1 (capability): a worker that doesn't advertise
+      // `hermes_media` may never claim a hermes job, regardless of what
+      // `capabilityRequirementsJson.capabilityFamilies` says (mirrors the
+      // remotion primary-check gap: that check is a no-op on an empty
+      // `capabilityFamilies` array).
+      if (!input.payload.capabilityHints.includes(HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY)) {
+        continue;
+      }
+
+      // Assertion 2 (connection affinity): a hermes job pinned to a
+      // connection may only be claimed by that connection's currently
+      // assigned worker — this is layered ON TOP OF (never a replacement
+      // for) the pinned `workerId` / `filterClaimableJobsForWorker` owner
+      // check, closing the gap where `capabilityRequirementsJson.
+      // preferredWorkerId` is intentionally null for server-scoped
+      // connections (see `hermesMediaScheduler.ts`).
+      const requirements = (candidate.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
+      const connectionId = typeof requirements.connectionId === "string" ? requirements.connectionId : null;
+      if (connectionId) {
+        let assignedWorkerId: string | null;
+        if (hermesConnectionAssignedWorkerIdCache.has(connectionId)) {
+          assignedWorkerId = hermesConnectionAssignedWorkerIdCache.get(connectionId) ?? null;
+        } else {
+          assignedWorkerId = repo.getHermesConnectionAssignedWorkerId
+            ? await repo.getHermesConnectionAssignedWorkerId({ tenantId: worker.tenantId, connectionId })
+            : null;
+          hermesConnectionAssignedWorkerIdCache.set(connectionId, assignedWorkerId);
+        }
+        if (assignedWorkerId !== worker.id) {
+          continue;
+        }
+      }
+    }
+
     const leaseOwnerToken = crypto.randomBytes(12).toString("hex");
     const leaseExpiresAt = new Date(Date.now() + DEFAULT_LEASE_TTL_MS);
     const claimed = await repo.tryClaimJob(candidate.id, worker.id, leaseOwnerToken, leaseExpiresAt);
