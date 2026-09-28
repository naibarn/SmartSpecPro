diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 629147d37..bb96e283b 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -118,6 +118,7 @@ import { scopedMemoryRouter } from "./routers/scopedMemory";
 import { monitoringRouter } from "./routers/monitoring";
 import { mcpServersRouter } from "./routers/mcpServers";
 import { mcpConnectionsRouter } from "./routers/mcpConnections";
+import { hermesConnectionsRouter } from "./routers/hermesConnections";
 import { hybridOrchestrationRouter } from "./routers/hybridOrchestration";
 import { inviteCodeRouter } from "./routers/inviteCode";
 import { userApiKeysRouter } from "./routers/userApiKeys";
@@ -2023,6 +2024,7 @@ type AppRouterShape = {
   monitoring: typeof monitoringRouter;
   mcpServers: typeof mcpServersRouter;
   mcpConnections: typeof mcpConnectionsRouter;
+  hermesConnections: typeof hermesConnectionsRouter;
   hybridOrchestration: typeof hybridOrchestrationRouter;
   help: typeof helpRouter;
 };
@@ -2214,6 +2216,7 @@ const appRouterInternal = router<AppRouterShape>({
   monitoring: monitoringRouter,
   mcpServers: mcpServersRouter,
   mcpConnections: mcpConnectionsRouter,
+  hermesConnections: hermesConnectionsRouter,
   hybridOrchestration: hybridOrchestrationRouter,
   help: helpRouter,
 
diff --git a/apps/web/server/routers/__tests__/hermesConnections.test.ts b/apps/web/server/routers/__tests__/hermesConnections.test.ts
new file mode 100644
index 000000000..883e7b863
--- /dev/null
+++ b/apps/web/server/routers/__tests__/hermesConnections.test.ts
@@ -0,0 +1,188 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+const mocks = vi.hoisted(() => ({
+  listHermesConnectionsMock: vi.fn(),
+  getHermesConnectionMock: vi.fn(),
+  getHermesAvailabilityMock: vi.fn(),
+  startHermesConnectMock: vi.fn(),
+  getHermesConnectStatusMock: vi.fn(),
+  setHermesDefaultConnectionMock: vi.fn(),
+  disconnectHermesConnectionMock: vi.fn(),
+  probeHermesConnectionMock: vi.fn(),
+  adminListHermesConnectionsMock: vi.fn(),
+  adminSetHermesQuotaMock: vi.fn(),
+  adminDisableHermesConnectionMock: vi.fn(),
+}));
+
+vi.mock("../../services/hermesConnectionService", () => ({
+  listHermesConnections: mocks.listHermesConnectionsMock,
+  getHermesConnection: mocks.getHermesConnectionMock,
+  getHermesAvailability: mocks.getHermesAvailabilityMock,
+  startHermesConnect: mocks.startHermesConnectMock,
+  getHermesConnectStatus: mocks.getHermesConnectStatusMock,
+  setHermesDefaultConnection: mocks.setHermesDefaultConnectionMock,
+  disconnectHermesConnection: mocks.disconnectHermesConnectionMock,
+  probeHermesConnection: mocks.probeHermesConnectionMock,
+  adminListHermesConnections: mocks.adminListHermesConnectionsMock,
+  adminSetHermesQuota: mocks.adminSetHermesQuotaMock,
+  adminDisableHermesConnection: mocks.adminDisableHermesConnectionMock,
+}));
+
+import { hermesConnectionsRouter } from "../hermesConnections";
+
+function createCtx(overrides: Record<string, unknown> = {}) {
+  return {
+    user: {
+      id: 1,
+      role: "user",
+      currentTenantId: "tenant-1",
+    },
+    tenantId: "tenant-1",
+    ...overrides,
+  } as any;
+}
+
+function createAdminCtx(overrides: Record<string, unknown> = {}) {
+  return createCtx({ user: { id: 1, role: "admin", currentTenantId: "tenant-1" }, ...overrides });
+}
+
+function createUnauthCtx() {
+  return { user: null, tenantId: "tenant-1" } as any;
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mocks.listHermesConnectionsMock.mockResolvedValue([]);
+  mocks.getHermesConnectionMock.mockResolvedValue({});
+  mocks.getHermesAvailabilityMock.mockResolvedValue({
+    enabled: false,
+    videoEnabled: false,
+    scopes: { serverShared: false, serverPersonal: false, privateWorker: false },
+  });
+  mocks.startHermesConnectMock.mockResolvedValue({ connectionId: "conn-1" });
+  mocks.getHermesConnectStatusMock.mockResolvedValue({ status: "pending" });
+  mocks.setHermesDefaultConnectionMock.mockResolvedValue(undefined);
+  mocks.disconnectHermesConnectionMock.mockResolvedValue(undefined);
+  mocks.probeHermesConnectionMock.mockResolvedValue(undefined);
+  mocks.adminListHermesConnectionsMock.mockResolvedValue([]);
+  mocks.adminSetHermesQuotaMock.mockResolvedValue(undefined);
+  mocks.adminDisableHermesConnectionMock.mockResolvedValue(undefined);
+});
+
+describe("hermesConnectionsRouter — auth", () => {
+  it("rejects every procedure for an unauthenticated ctx", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createUnauthCtx());
+
+    await expect(caller.listConnections()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.getConnection({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.getAvailability()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.startConnect({ scope: "server_personal", consentAcknowledged: true }))
+      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.getConnectStatus({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.setDefault({ connectionId: "c1", assetType: "image" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.disconnect({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    await expect(caller.probe({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
+    // adminProcedure's guard checks `!ctx.user || role mismatch` as a single
+    // condition, so an unauthenticated ctx surfaces as FORBIDDEN here (not
+    // UNAUTHORIZED) — see `_core/trpc.ts`'s `adminProcedure` middleware.
+    await expect(caller.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
+    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
+    await expect(caller.adminDisable({ connectionId: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
+  });
+
+  it("rejects adminList/adminSetQuota/adminDisable for a non-admin ctx", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+
+    await expect(caller.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
+    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
+    await expect(caller.adminDisable({ connectionId: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
+  });
+
+  it("allows adminList/adminSetQuota/adminDisable for an admin ctx", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());
+
+    await expect(caller.adminList()).resolves.toEqual([]);
+    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).resolves.toBeUndefined();
+    await expect(caller.adminDisable({ connectionId: "c1" })).resolves.toBeUndefined();
+  });
+});
+
+describe("hermesConnectionsRouter — getAvailability", () => {
+  it("reflects flag states from the service", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+
+    mocks.getHermesAvailabilityMock.mockResolvedValueOnce({
+      enabled: false,
+      videoEnabled: false,
+      scopes: { serverShared: false, serverPersonal: false, privateWorker: false },
+    });
+    await expect(caller.getAvailability()).resolves.toMatchObject({ enabled: false });
+
+    mocks.getHermesAvailabilityMock.mockResolvedValueOnce({
+      enabled: true,
+      videoEnabled: false,
+      scopes: { serverShared: true, serverPersonal: true, privateWorker: true },
+    });
+    await expect(caller.getAvailability()).resolves.toMatchObject({ enabled: true, videoEnabled: false });
+  });
+});
+
+describe("hermesConnectionsRouter — input validation", () => {
+  it("rejects startConnect with an invalid scope value", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+    await expect(caller.startConnect({ scope: "not_a_scope" as any, consentAcknowledged: true })).rejects.toThrow();
+    expect(mocks.startHermesConnectMock).not.toHaveBeenCalled();
+  });
+
+  it("rejects setDefault with an invalid assetType", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+    await expect(caller.setDefault({ connectionId: "c1", assetType: "audio" as any })).rejects.toThrow();
+    expect(mocks.setHermesDefaultConnectionMock).not.toHaveBeenCalled();
+  });
+});
+
+describe("hermesConnectionsRouter — no token-like fields in responses", () => {
+  it("listConnections never surfaces token-like keys on a happy path", async () => {
+    mocks.listHermesConnectionsMock.mockResolvedValueOnce([{
+      id: "conn-1",
+      scope: "server_personal",
+      status: "authorized",
+      accountLabel: "My Grok",
+      accountHint: "grok-fan",
+      defaultForImage: true,
+      defaultForVideo: false,
+      entitlementStatus: null,
+      assignedWorkerId: "worker-1",
+      assignedWorkerOnline: true,
+      capabilitySummary: { probedAt: null, imageEnabled: false, videoEnabled: false, maxEditReferences: null },
+      dailyJobQuota: null,
+      createdAt: "2026-01-01T00:00:00.000Z",
+      authorizedAt: "2026-01-01T00:00:00.000Z",
+    }]);
+
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+    const result = await caller.listConnections();
+    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
+  });
+});
+
+describe("hermesConnectionsRouter — delegation", () => {
+  it("passes tenant/user context through to the service for startConnect", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createCtx());
+    await caller.startConnect({ scope: "server_personal", consentAcknowledged: true, label: "My connection" });
+    expect(mocks.startHermesConnectMock).toHaveBeenCalledWith(expect.objectContaining({
+      tenantId: "tenant-1",
+      userId: 1,
+      isAdmin: false,
+      scope: "server_personal",
+      consentAcknowledged: true,
+      label: "My connection",
+    }));
+  });
+
+  it("marks isAdmin true for an admin ctx on startConnect", async () => {
+    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());
+    await caller.startConnect({ scope: "server_shared", consentAcknowledged: true });
+    expect(mocks.startHermesConnectMock).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
+  });
+});
diff --git a/apps/web/server/routers/hermesConnections.ts b/apps/web/server/routers/hermesConnections.ts
new file mode 100644
index 000000000..d16c4731c
--- /dev/null
+++ b/apps/web/server/routers/hermesConnections.ts
@@ -0,0 +1,144 @@
+/**
+ * Feature 135 — Hermes Grok media worker connections tRPC router.
+ *
+ * Thin wrapper only: zod parse, ctx extraction, delegate to
+ * `hermesConnectionService.ts`. All behavioral rules (tenant scoping,
+ * ownership, admin gating for `server_shared`, consent gate, typed
+ * `[HERMES_X] ...` errors) live in the service — this router never
+ * translates or reformats an error message.
+ *
+ * Registered as `hermesConnections` in `routers.ts`, next to `mcpConnections`.
+ */
+import { z } from "zod";
+import { TRPCError } from "@trpc/server";
+import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
+import {
+  adminDisableHermesConnection,
+  adminListHermesConnections,
+  adminSetHermesQuota,
+  disconnectHermesConnection,
+  getHermesAvailability,
+  getHermesConnectStatus,
+  getHermesConnection,
+  listHermesConnections,
+  probeHermesConnection,
+  setHermesDefaultConnection,
+  startHermesConnect,
+} from "../services/hermesConnectionService";
+
+const assetTypeSchema = z.enum(["image", "video"]);
+const scopeSchema = z.enum(["server_shared", "server_personal", "private_worker"]);
+
+function tenantIdFromCtx(ctx: { tenantId?: unknown; user: { currentTenantId?: unknown } }) {
+  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
+  return tenantId == null ? null : String(tenantId);
+}
+
+function tenantRequiredFromCtx(ctx: { tenantId?: unknown; user: { currentTenantId?: unknown } }): string {
+  const tenantId = tenantIdFromCtx(ctx);
+  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+  return tenantId;
+}
+
+function isAdminCtx(ctx: { user: { role?: unknown } }): boolean {
+  return ctx.user.role === "admin" || ctx.user.role === "system_agent";
+}
+
+export const hermesConnectionsRouter = router({
+  listConnections: protectedProcedure
+    .input(z.object({ assetType: assetTypeSchema.optional() }).optional())
+    .query(({ ctx, input }) => listHermesConnections({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      assetType: input?.assetType,
+    })),
+
+  getConnection: protectedProcedure
+    .input(z.object({ connectionId: z.string() }))
+    .query(({ ctx, input }) => getHermesConnection({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      connectionId: input.connectionId,
+    })),
+
+  getAvailability: protectedProcedure
+    .query(({ ctx }) => getHermesAvailability({
+      tenantId: tenantRequiredFromCtx(ctx),
+    })),
+
+  startConnect: protectedProcedure
+    .input(z.object({
+      scope: scopeSchema,
+      workerId: z.string().optional(),
+      label: z.string().max(120).optional(),
+      consentAcknowledged: z.boolean(),
+    }))
+    .mutation(({ ctx, input }) => startHermesConnect({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      isAdmin: isAdminCtx(ctx),
+      scope: input.scope,
+      workerId: input.workerId,
+      label: input.label,
+      consentAcknowledged: input.consentAcknowledged,
+    })),
+
+  getConnectStatus: protectedProcedure
+    .input(z.object({ connectionId: z.string() }))
+    .query(({ ctx, input }) => getHermesConnectStatus({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      isAdmin: isAdminCtx(ctx),
+      connectionId: input.connectionId,
+    })),
+
+  setDefault: protectedProcedure
+    .input(z.object({ connectionId: z.string(), assetType: assetTypeSchema }))
+    .mutation(({ ctx, input }) => setHermesDefaultConnection({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      connectionId: input.connectionId,
+      assetType: input.assetType,
+    })),
+
+  disconnect: protectedProcedure
+    .input(z.object({ connectionId: z.string() }))
+    .mutation(({ ctx, input }) => disconnectHermesConnection({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      isAdmin: isAdminCtx(ctx),
+      connectionId: input.connectionId,
+    })),
+
+  probe: protectedProcedure
+    .input(z.object({ connectionId: z.string() }))
+    .mutation(({ ctx, input }) => probeHermesConnection({
+      tenantId: tenantRequiredFromCtx(ctx),
+      userId: ctx.user.id,
+      isAdmin: isAdminCtx(ctx),
+      connectionId: input.connectionId,
+    })),
+
+  adminList: adminProcedure
+    .query(({ ctx }) => adminListHermesConnections({
+      tenantId: tenantRequiredFromCtx(ctx),
+    })),
+
+  adminSetQuota: adminProcedure
+    .input(z.object({
+      connectionId: z.string(),
+      dailyJobQuota: z.number().int().min(0).nullable(),
+    }))
+    .mutation(({ ctx, input }) => adminSetHermesQuota({
+      tenantId: tenantRequiredFromCtx(ctx),
+      connectionId: input.connectionId,
+      dailyJobQuota: input.dailyJobQuota,
+    })),
+
+  adminDisable: adminProcedure
+    .input(z.object({ connectionId: z.string() }))
+    .mutation(({ ctx, input }) => adminDisableHermesConnection({
+      tenantId: tenantRequiredFromCtx(ctx),
+      connectionId: input.connectionId,
+    })),
+});
diff --git a/apps/web/server/services/__tests__/hermesConnectionService.test.ts b/apps/web/server/services/__tests__/hermesConnectionService.test.ts
new file mode 100644
index 000000000..3185d8d47
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesConnectionService.test.ts
@@ -0,0 +1,850 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  adminDisableHermesConnection,
+  adminSetHermesQuota,
+  buildAuthorizeJobInsert,
+  disconnectHermesConnection,
+  getHermesAvailability,
+  getHermesConnectStatus,
+  getHermesConnection,
+  HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
+  listHermesConnections,
+  probeHermesConnection,
+  setHermesDefaultConnection,
+  settleHermesConnectionFromControlJob,
+  startHermesConnect,
+  type HermesConnectionDeps,
+  type HermesConnectionRepo,
+} from "../hermesConnectionService";
+import type { HermesProviderConnection, Worker, WorkerJob, WorkerJobEvent } from "../../../drizzle/schema";
+import { HERMES_CONNECTION_AUTH_JOB_TYPE, HERMES_CONNECTION_PROBE_JOB_TYPE } from "../../../shared/workerRuntime";
+
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+const TENANT_ID = "tenant-1";
+const USER_ID = 1;
+const OTHER_USER_ID = 2;
+
+function buildConnectionRow(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
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
+function buildWorkerRow(overrides: Partial<Worker> = {}): Worker {
+  return {
+    id: "worker-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    runtimeType: "desktop_zeroclaw_managed",
+    workerMode: "external_runtime",
+    machineId: null,
+    machineName: null,
+    displayName: "Hermes worker",
+    status: "online",
+    runtimeVersion: "1.0.0",
+    runtimeMode: "external_managed",
+    runtimeProfileId: null,
+    policyProfileId: null,
+    externalReference: "worker-app://hermes-1",
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
+function buildWorkerJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
+  return {
+    id: "job-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    workerId: "worker-1",
+    runtimeType: "desktop_zeroclaw_managed",
+    workflowRunId: null,
+    requestedByUserId: USER_ID,
+    requestedByPersonaId: null,
+    requestedBySystemComponent: null,
+    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+    status: "running",
+    statusReason: null,
+    priority: 0,
+    resourceProfile: "cpu_light",
+    capabilityRequirementsJson: {},
+    inputJson: {},
+    instructionsJson: {},
+    outputJson: null,
+    failureReason: null,
+    timeoutSeconds: HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
+    retryPolicyJson: {},
+    idempotencyKey: null,
+    leaseOwnerToken: null,
+    leaseExpiresAt: null,
+    createdAt: NOW,
+    startedAt: NOW,
+    finishedAt: null,
+    ...overrides,
+  } as WorkerJob;
+}
+
+function buildJobEvent(overrides: Partial<WorkerJobEvent> = {}): WorkerJobEvent {
+  return {
+    id: "event-1",
+    workerJobId: "job-1",
+    eventType: "hermes_device_code",
+    payloadJson: {},
+    createdAt: NOW,
+    ...overrides,
+  } as WorkerJobEvent;
+}
+
+function buildDeps(overrides: Partial<HermesConnectionRepo> = {}, depsOverrides: Partial<HermesConnectionDeps> = {}): HermesConnectionDeps {
+  const repo: HermesConnectionRepo = {
+    findConnections: vi.fn().mockResolvedValue([]),
+    findConnectionById: vi.fn().mockResolvedValue(null),
+    insertConnection: vi.fn(),
+    insertConnectionWithJob: vi.fn().mockImplementation(async ({ connection, job }) => ({
+      connection: { ...connection, createdAt: NOW, authorizedAt: null },
+      job: { ...job, id: "job-1", createdAt: NOW },
+    })),
+    updateConnection: vi.fn(),
+    clearDefaultFor: vi.fn().mockResolvedValue(undefined),
+    setDefaultAtomic: vi.fn().mockImplementation(async ({ connectionId, assetType }) => ({
+      id: connectionId,
+      ...(assetType === "image" ? { defaultForImage: true } : { defaultForVideo: true }),
+    })),
+    findWorkerById: vi.fn().mockResolvedValue(null),
+    findOwnedOnlineWorkers: vi.fn().mockResolvedValue([]),
+    insertWorkerJob: vi.fn().mockResolvedValue(buildWorkerJob()),
+    findLatestControlJob: vi.fn().mockResolvedValue(null),
+    findJobEvents: vi.fn().mockResolvedValue([]),
+    ...overrides,
+  };
+  return {
+    repo,
+    settings: {
+      getHermesWorkerSettings: vi.fn().mockResolvedValue({
+        enabled: true,
+        sharedPoolEnabled: true,
+        serverPersonalEnabled: true,
+        privateEnabled: true,
+        videoEnabled: true,
+        sharedPoolFeeCredits: 0,
+        maxRunningPerConnection: 1,
+        maxConcurrentPerSharedWorker: 2,
+        maxQueuedPerUser: 8,
+        maxQueuedPerTenantSharedPool: 20,
+        submitWindowPerUser: 10,
+        submitWindowPerTenant: 60,
+        minHermesVersion: "",
+        sharedWorkerId: "worker-1",
+        webProcessWorkerEnabled: false,
+      }),
+    },
+    flags: {
+      getTenantFeatureFlags: vi.fn().mockResolvedValue({ hermesMediaWorker: true }),
+    },
+    now: () => NOW,
+    ...depsOverrides,
+  };
+}
+
+describe("listHermesConnections", () => {
+  it("returns owned server_personal/private_worker rows plus tenant-wide server_shared rows, excluding others' personal rows", async () => {
+    const mine = buildConnectionRow({ id: "mine", ownerUserId: USER_ID, scope: "server_personal" });
+    const myPrivate = buildConnectionRow({ id: "mine-private", ownerUserId: USER_ID, scope: "private_worker" });
+    const shared = buildConnectionRow({ id: "shared-1", ownerUserId: OTHER_USER_ID, scope: "server_shared" });
+    const othersPersonal = buildConnectionRow({ id: "not-mine", ownerUserId: OTHER_USER_ID, scope: "server_personal" });
+
+    const deps = buildDeps({
+      findConnections: vi.fn().mockResolvedValue([mine, myPrivate, shared, othersPersonal]),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+
+    const result = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, deps);
+
+    expect(result.map((r) => r.id).sort()).toEqual(["mine", "mine-private", "shared-1"].sort());
+  });
+
+  it("never surfaces token-like fields", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnections: vi.fn().mockResolvedValue([row]),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+    const result = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, deps);
+    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
+  });
+
+  it("filters out connections whose manifest has no enabled operation for the requested assetType, but keeps unprobed rows", async () => {
+    const imageOnly = buildConnectionRow({
+      id: "image-only",
+      capabilitiesJson: {
+        hermesVersion: "1.0",
+        probedAt: NOW.toISOString(),
+        operations: { "image.generate": { enabled: true } },
+        models: { image: ["grok-image"], video: [] },
+      },
+    });
+    const videoOnly = buildConnectionRow({
+      id: "video-only",
+      capabilitiesJson: {
+        hermesVersion: "1.0",
+        probedAt: NOW.toISOString(),
+        operations: { "video.generate": { enabled: true } },
+        models: { image: [], video: ["grok-video"] },
+      },
+    });
+    const unprobed = buildConnectionRow({ id: "unprobed", capabilitiesJson: null });
+
+    const deps = buildDeps({
+      findConnections: vi.fn().mockResolvedValue([imageOnly, videoOnly, unprobed]),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+
+    const imageResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID, assetType: "image" }, deps);
+    expect(imageResult.map((r) => r.id).sort()).toEqual(["image-only", "unprobed"].sort());
+
+    const unprobedRow = imageResult.find((r) => r.id === "unprobed")!;
+    expect(unprobedRow.capabilitySummary.probedAt).toBeNull();
+    expect(unprobedRow.capabilitySummary.imageEnabled).toBe(false);
+
+    const videoResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID, assetType: "video" }, deps);
+    expect(videoResult.map((r) => r.id).sort()).toEqual(["unprobed", "video-only"].sort());
+  });
+
+  it("derives assignedWorkerOnline from the injected worker lookup", async () => {
+    const row = buildConnectionRow({ assignedWorkerId: "worker-1" });
+    const onlineDeps = buildDeps({
+      findConnections: vi.fn().mockResolvedValue([row]),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "online", lastSeenAt: NOW })),
+    });
+    const onlineResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, onlineDeps);
+    expect(onlineResult[0].assignedWorkerOnline).toBe(true);
+
+    const offlineDeps = buildDeps({
+      findConnections: vi.fn().mockResolvedValue([row]),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
+    });
+    const offlineResult = await listHermesConnections({ tenantId: TENANT_ID, userId: USER_ID }, offlineDeps);
+    expect(offlineResult[0].assignedWorkerOnline).toBe(false);
+  });
+});
+
+describe("startHermesConnect", () => {
+  const baseParams = {
+    tenantId: TENANT_ID,
+    userId: USER_ID,
+    isAdmin: false,
+    scope: "server_personal" as const,
+    consentAcknowledged: true,
+  };
+
+  it("rejects with typed HERMES_DISABLED when the master flag is off", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: false, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
+    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
+  });
+
+  it("rejects with typed HERMES_DISABLED when the server_shared scope flag is off", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: false, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
+    await expect(startHermesConnect({ ...baseParams, scope: "server_shared", isAdmin: true }, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
+  });
+
+  it("rejects with typed HERMES_DISABLED when the server_personal scope flag is off", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: false, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
+    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
+  });
+
+  it("rejects with typed HERMES_DISABLED when the private_worker scope flag is off", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: false, videoEnabled: true, sharedWorkerId: "worker-1" });
+    await expect(startHermesConnect({ ...baseParams, scope: "private_worker" }, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
+  });
+
+  it("rejects with typed HERMES_DISABLED when the tenant flag hermesMediaWorker is false", async () => {
+    const deps = buildDeps();
+    (deps.flags!.getTenantFeatureFlags as any).mockResolvedValue({ hermesMediaWorker: false });
+    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_DISABLED]") });
+  });
+
+  it("rejects when consentAcknowledged is false — no row created, no job enqueued", async () => {
+    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()) });
+    await expect(startHermesConnect({ ...baseParams, consentAcknowledged: false }, deps)).rejects.toThrow();
+    expect(deps.repo!.insertConnectionWithJob).not.toHaveBeenCalled();
+  });
+
+  it("rejects scope: server_shared for a non-admin caller", async () => {
+    const deps = buildDeps();
+    await expect(startHermesConnect({ ...baseParams, scope: "server_shared", isAdmin: false }, deps))
+      .rejects.toMatchObject({ code: "FORBIDDEN" });
+  });
+
+  it("private_worker: rejects when workerId is not owned by the caller", async () => {
+    const deps = buildDeps({
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ registeredByUserId: OTHER_USER_ID })),
+    });
+    await expect(startHermesConnect({ ...baseParams, scope: "private_worker", workerId: "worker-1" }, deps))
+      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+  });
+
+  it("private_worker: rejects when the worker is offline", async () => {
+    const deps = buildDeps({
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
+    });
+    await expect(startHermesConnect({ ...baseParams, scope: "private_worker", workerId: "worker-1" }, deps))
+      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+  });
+
+  it("private_worker: auto-selects the worker when the caller owns exactly one online eligible worker", async () => {
+    const worker = buildWorkerRow({ id: "worker-auto" });
+    const deps = buildDeps({
+      findOwnedOnlineWorkers: vi.fn().mockResolvedValue([worker]),
+    });
+    const result = await startHermesConnect({ ...baseParams, scope: "private_worker" }, deps);
+    expect(result.connectionId).toBeTruthy();
+    expect(deps.repo!.insertConnectionWithJob).toHaveBeenCalledWith(expect.objectContaining({
+      job: expect.objectContaining({ workerId: "worker-auto" }),
+    }));
+  });
+
+  it("private_worker: fails typed when the caller owns zero or multiple eligible workers", async () => {
+    const deps = buildDeps({ findOwnedOnlineWorkers: vi.fn().mockResolvedValue([]) });
+    await expect(startHermesConnect({ ...baseParams, scope: "private_worker" }, deps))
+      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+  });
+
+  it("server scopes: resolves the shared unit from hermes_shared_worker_id and fails typed when absent, never guessing from runtimeType", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({
+      enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: true, sharedWorkerId: null,
+    });
+    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+    expect(deps.settings!.getHermesWorkerSettings).toHaveBeenCalled();
+    // findWorkerById must never be called with a runtimeType filter key
+    for (const call of (deps.repo!.findWorkerById as any).mock.calls) {
+      expect(call[0]).not.toHaveProperty("runtimeType");
+    }
+  });
+
+  it("server scopes: fails typed when the resolved shared worker is offline", async () => {
+    const deps = buildDeps({ findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })) });
+    await expect(startHermesConnect(baseParams, deps)).rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+  });
+
+  it("happy path: atomically inserts exactly one pending row (conn_<id> profileReference, consent metadata) with exactly one authorize job in the SAME insertConnectionWithJob call", async () => {
+    const worker = buildWorkerRow();
+    let capturedArgs: any = null;
+    const deps = buildDeps({
+      findWorkerById: vi.fn().mockResolvedValue(worker),
+      insertConnectionWithJob: vi.fn().mockImplementation(async (args) => {
+        capturedArgs = args;
+        return {
+          connection: { ...args.connection, createdAt: NOW, authorizedAt: null },
+          job: { ...args.job, id: "job-1", createdAt: NOW },
+        };
+      }),
+    });
+
+    const result = await startHermesConnect(baseParams, deps);
+
+    expect(deps.repo!.insertConnectionWithJob).toHaveBeenCalledTimes(1);
+    expect(capturedArgs.connection.status).toBe("pending");
+    expect(capturedArgs.connection.profileReference).toBe(`conn_${result.connectionId}`);
+    expect(capturedArgs.connection.metadataJson).toMatchObject({
+      consentAcknowledgedAt: NOW.toISOString(),
+      consentUserId: USER_ID,
+    });
+
+    expect(capturedArgs.job).toMatchObject({
+      jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+      workerId: worker.id,
+      resourceProfile: "cpu_light",
+      inputJson: {
+        connectionId: result.connectionId,
+        profileReference: `conn_${result.connectionId}`,
+        timeoutSeconds: HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
+      },
+      requestedByUserId: USER_ID,
+    });
+  });
+});
+
+describe("buildAuthorizeJobInsert", () => {
+  it("carries requiredClaimCapability + capabilityFamilies + connectionId + preferredWorkerId in capabilityRequirementsJson", () => {
+    const insert = buildAuthorizeJobInsert({
+      tenantId: TENANT_ID,
+      connectionId: "conn-1",
+      workerId: "worker-1",
+      runtimeType: "desktop_zeroclaw_managed",
+      requestedByUserId: USER_ID,
+      profileReference: "conn_conn-1",
+    });
+    expect(insert.capabilityRequirementsJson).toMatchObject({
+      requiredClaimCapability: "hermes_media",
+      capabilityFamilies: ["hermes-media-generation"],
+      connectionId: "conn-1",
+      preferredWorkerId: "worker-1",
+    });
+    expect(insert.timeoutSeconds).toBe(HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS);
+  });
+});
+
+describe("getHermesConnectStatus", () => {
+  it("surfaces verificationUrl/userCode/expiresAt from the hermes_device_code event", async () => {
+    const row = buildConnectionRow({ status: "pending" });
+    const job = buildWorkerJob({ status: "running" });
+    const event = buildJobEvent({
+      payloadJson: { verificationUrl: "https://x.ai/device", userCode: "ABCD-1234", expiresAt: "2026-06-01T13:00:00.000Z" },
+    });
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findLatestControlJob: vi.fn().mockResolvedValue(job),
+      findJobEvents: vi.fn().mockResolvedValue([event]),
+    });
+
+    const result = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(result).toMatchObject({
+      verificationUrl: "https://x.ai/device",
+      userCode: "ABCD-1234",
+      expiresAt: "2026-06-01T13:00:00.000Z",
+    });
+  });
+
+  it("maps auth-job failure reasons to typed error codes", async () => {
+    const row = buildConnectionRow({ status: "pending" });
+    const job = buildWorkerJob({ status: "failed", failureReason: "oauth session expired" });
+    let state = { ...row };
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      findLatestControlJob: vi.fn().mockResolvedValue(job),
+      findJobEvents: vi.fn().mockResolvedValue([]),
+      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+
+    const result = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(result.status).toBe("error");
+    expect(result.errorCode).toBe("HERMES_OAUTH_SESSION_EXPIRED");
+  });
+
+  it("maps denied and timeout failure reasons to typed error codes", async () => {
+    const deniedRow = buildConnectionRow({ id: "conn-denied", status: "pending" });
+    let deniedState = { ...deniedRow };
+    const deniedDeps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => deniedState),
+      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "failed", failureReason: "user denied consent" })),
+      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
+        deniedState = { ...deniedState, ...values };
+        return deniedState;
+      }),
+    });
+    const deniedResult = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: deniedRow.id }, deniedDeps);
+    expect(deniedResult.errorCode).toBe("HERMES_OAUTH_DENIED");
+
+    const timeoutRow = buildConnectionRow({ id: "conn-timeout", status: "pending" });
+    let timeoutState = { ...timeoutRow };
+    const timeoutDeps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => timeoutState),
+      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "expired" })),
+      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
+        timeoutState = { ...timeoutState, ...values };
+        return timeoutState;
+      }),
+    });
+    const timeoutResult = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: timeoutRow.id }, timeoutDeps);
+    expect(timeoutResult.errorCode).toBe("HERMES_TIMEOUT");
+  });
+
+  it("lazily settles a terminal-success job (authorized, accountHint, capabilitiesJson, authorizedAt) idempotently", async () => {
+    const row = buildConnectionRow({ status: "pending" });
+    let state = { ...row };
+    const job = buildWorkerJob({
+      status: "completed",
+      outputJson: { accountHint: "grok-fan", capabilities: { hermesVersion: "1.0", probedAt: NOW.toISOString(), operations: {}, models: { image: [], video: [] } } },
+    });
+    const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
+      state = { ...state, ...values };
+      return state;
+    });
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      findLatestControlJob: vi.fn().mockResolvedValue(job),
+      updateConnection,
+    });
+
+    const first = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(first.status).toBe("authorized");
+    expect(state.accountHint).toBe("grok-fan");
+    expect(state.authorizedAt).toEqual(NOW);
+    expect(updateConnection).toHaveBeenCalledTimes(1);
+
+    const second = await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(second.status).toBe("authorized");
+    expect(updateConnection).toHaveBeenCalledTimes(1); // idempotent — no re-update
+  });
+
+  it("lazily settles a terminal-failure job to status: error with the typed reason in metadataJson", async () => {
+    const row = buildConnectionRow({ status: "pending" });
+    let state = { ...row };
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      findLatestControlJob: vi.fn().mockResolvedValue(buildWorkerJob({ status: "failed", failureReason: "oauth session expired" })),
+      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+
+    await getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(state.status).toBe("error");
+    expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
+  });
+
+  it("enforces ownership: a caller who is neither owner nor (for server_shared) admin gets NOT_FOUND-style rejection", async () => {
+    const sharedRow = buildConnectionRow({ scope: "server_shared", ownerUserId: OTHER_USER_ID });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
+    await expect(getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: sharedRow.id }, deps))
+      .rejects.toMatchObject({ code: "NOT_FOUND" });
+
+    const personalRow = buildConnectionRow({ scope: "server_personal", ownerUserId: OTHER_USER_ID });
+    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(personalRow) });
+    await expect(getHermesConnectStatus({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: personalRow.id }, deps2))
+      .rejects.toMatchObject({ code: "NOT_FOUND" });
+  });
+});
+
+describe("setHermesDefaultConnection", () => {
+  it("delegates to the atomic clear-then-set composite repo method (video untouched)", async () => {
+    const row = buildConnectionRow({ id: "conn-b", status: "authorized", ownerUserId: USER_ID });
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+    });
+
+    await setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id, assetType: "image" }, deps);
+
+    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledTimes(1);
+    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledWith({
+      tenantId: TENANT_ID,
+      userId: USER_ID,
+      connectionId: row.id,
+      assetType: "image",
+    });
+    // video's assetType key must never appear in this call
+    const call = (deps.repo!.setDefaultAtomic as any).mock.calls[0][0];
+    expect(call.assetType).toBe("image");
+  });
+
+  it("rejects for connections not visible to the caller", async () => {
+    const row = buildConnectionRow({ scope: "server_personal", ownerUserId: OTHER_USER_ID });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(row) });
+    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id, assetType: "image" }, deps))
+      .rejects.toMatchObject({ code: "NOT_FOUND" });
+    expect(deps.repo!.setDefaultAtomic).not.toHaveBeenCalled();
+  });
+
+  it("rejects a non-owner setting the default on a server_shared row, even though server_shared is tenant-wide READABLE (defaults are strictly per-owner)", async () => {
+    const sharedRow = buildConnectionRow({
+      scope: "server_shared",
+      status: "authorized",
+      ownerUserId: OTHER_USER_ID, // e.g. the admin who created the shared connection
+    });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
+    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: sharedRow.id, assetType: "image" }, deps))
+      .rejects.toMatchObject({ code: "NOT_FOUND" });
+    expect(deps.repo!.setDefaultAtomic).not.toHaveBeenCalled();
+  });
+
+  it("allows the owning admin to set a default on their own server_shared row", async () => {
+    const sharedRow = buildConnectionRow({
+      scope: "server_shared",
+      status: "authorized",
+      ownerUserId: USER_ID,
+    });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
+    await setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: sharedRow.id, assetType: "video" }, deps);
+    expect(deps.repo!.setDefaultAtomic).toHaveBeenCalledWith(expect.objectContaining({ assetType: "video" }));
+  });
+
+  it("rejects non-default-eligible statuses (pending, disconnected)", async () => {
+    const pendingRow = buildConnectionRow({ status: "pending" });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(pendingRow) });
+    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: pendingRow.id, assetType: "image" }, deps))
+      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
+
+    const disconnectedRow = buildConnectionRow({ status: "disconnected" });
+    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(disconnectedRow) });
+    await expect(setHermesDefaultConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: disconnectedRow.id, assetType: "image" }, deps2))
+      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
+  });
+});
+
+describe("disconnectHermesConnection", () => {
+  it("enqueues exactly one disconnect job pinned to assignedWorkerId, records disconnectRequestedAt, and does not set status: disconnected immediately", async () => {
+    const row = buildConnectionRow();
+    let state = { ...row };
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+      updateConnection: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+
+    await disconnectHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+
+    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledTimes(1);
+    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({
+      jobType: "hermes_connection_disconnect",
+      workerId: row.assignedWorkerId,
+    }));
+    expect(state.status).not.toBe("disconnected");
+    expect((state.metadataJson as any).disconnectRequestedAt).toBe(NOW.toISOString());
+  });
+
+  it("requires admin for server_shared disconnect", async () => {
+    const row = buildConnectionRow({ scope: "server_shared", ownerUserId: USER_ID });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(row) });
+    await expect(disconnectHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
+      .rejects.toMatchObject({ code: "FORBIDDEN" });
+  });
+});
+
+describe("probeHermesConnection", () => {
+  it("enqueues one probe job pinned to the assigned worker", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+    await probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps);
+    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({
+      jobType: "hermes_connection_probe",
+      workerId: row.assignedWorkerId,
+    }));
+  });
+
+  it("rejects when the worker is offline", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
+    });
+    await expect(probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
+      .rejects.toMatchObject({ message: expect.stringContaining("[HERMES_WORKER_UNAVAILABLE]") });
+  });
+
+  it("requires admin for server_shared probe (consistent with disconnect's admin-only convention)", async () => {
+    const row = buildConnectionRow({ scope: "server_shared", ownerUserId: USER_ID });
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+    await expect(probeHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, isAdmin: false, connectionId: row.id }, deps))
+      .rejects.toMatchObject({ code: "FORBIDDEN" });
+    expect(deps.repo!.insertWorkerJob).not.toHaveBeenCalled();
+  });
+});
+
+describe("admin ops", () => {
+  it("adminSetHermesQuota updates dailyJobQuota on server_shared rows only", async () => {
+    const sharedRow = buildConnectionRow({ scope: "server_shared" });
+    const deps = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(sharedRow) });
+    await adminSetHermesQuota({ tenantId: TENANT_ID, connectionId: sharedRow.id, dailyJobQuota: 25 }, deps);
+    expect(deps.repo!.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ values: { dailyJobQuota: 25 } }));
+
+    const personalRow = buildConnectionRow({ scope: "server_personal" });
+    const deps2 = buildDeps({ findConnectionById: vi.fn().mockResolvedValue(personalRow) });
+    await expect(adminSetHermesQuota({ tenantId: TENANT_ID, connectionId: personalRow.id, dailyJobQuota: 25 }, deps2))
+      .rejects.toMatchObject({ code: "BAD_REQUEST" });
+  });
+
+  it("adminDisableHermesConnection marks the row disconnected and enqueues profile cleanup when the worker is online", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "online" })),
+    });
+    await adminDisableHermesConnection({ tenantId: TENANT_ID, connectionId: row.id }, deps);
+    expect(deps.repo!.updateConnection).toHaveBeenCalledWith(expect.objectContaining({ values: expect.objectContaining({ status: "disconnected" }) }));
+    expect(deps.repo!.insertWorkerJob).toHaveBeenCalledWith(expect.objectContaining({ jobType: "hermes_connection_disconnect" }));
+  });
+
+  it("adminDisableHermesConnection skips profile cleanup enqueue when the worker is offline", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow({ status: "offline" })),
+    });
+    await adminDisableHermesConnection({ tenantId: TENANT_ID, connectionId: row.id }, deps);
+    expect(deps.repo!.insertWorkerJob).not.toHaveBeenCalled();
+  });
+});
+
+describe("settleHermesConnectionFromControlJob", () => {
+  it("is a no-op for a connection that no longer exists", async () => {
+    const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(null) } };
+    await expect(settleHermesConnectionFromControlJob({ connectionId: "missing", job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" } }, deps)).resolves.toBeUndefined();
+  });
+
+  describe("probe failure classification", () => {
+    it("auth-invalidation-classified failure -> status: reauth_required + HERMES_REAUTH_REQUIRED in metadataJson.lastError", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      });
+      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "oauth session revoked — reauth required" },
+      }, deps);
+
+      expect(state.status).toBe("reauth_required");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_REAUTH_REQUIRED");
+    });
+
+    it("entitlement-403-classified failure -> status: entitlement_restricted (mirrors the success-output path)", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      });
+      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "xAI API returned 403 entitlement forbidden" },
+      }, deps);
+
+      expect(state.status).toBe("entitlement_restricted");
+      expect(state.entitlementStatus).toBe("restricted");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_ENTITLEMENT_RESTRICTED");
+    });
+
+    it("other probe failures -> records lastError but leaves status untouched", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      });
+      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "unexpected process crash" },
+      }, deps);
+
+      expect(state.status).toBe("authorized"); // unchanged
+      expect((state.metadataJson as any).lastError).toBe("HERMES_PROCESS_FAILED");
+    });
+
+    it("probe job timeout (status: expired) -> other outcome with HERMES_TIMEOUT, status untouched", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const updateConnection = vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      });
+      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockImplementation(async () => state), updateConnection } };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "expired" },
+      }, deps);
+
+      expect(state.status).toBe("authorized");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_TIMEOUT");
+    });
+
+    it("is idempotent: a disconnected row is left untouched by a stale probe-failure settlement", async () => {
+      const row = buildConnectionRow({ status: "disconnected" });
+      const updateConnection = vi.fn();
+      const deps = { repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(row), updateConnection } };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "reauth required" },
+      }, deps);
+
+      expect(updateConnection).not.toHaveBeenCalled();
+    });
+  });
+});
+
+describe("getHermesConnection", () => {
+  it("returns the connection with capabilities and never leaks token-like fields", async () => {
+    const row = buildConnectionRow();
+    const deps = buildDeps({
+      findConnectionById: vi.fn().mockResolvedValue(row),
+      findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    });
+    const result = await getHermesConnection({ tenantId: TENANT_ID, userId: USER_ID, connectionId: row.id }, deps);
+    expect(result.id).toBe(row.id);
+    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
+  });
+});
+
+describe("getHermesAvailability", () => {
+  it("returns enabled: false with flags at defaults", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: false, sharedPoolEnabled: false, serverPersonalEnabled: false, privateEnabled: false, videoEnabled: false, sharedWorkerId: null });
+    (deps.flags!.getTenantFeatureFlags as any).mockResolvedValue({ hermesMediaWorker: false });
+    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
+    expect(result.enabled).toBe(false);
+    expect(result.scopes).toEqual({ serverShared: false, serverPersonal: false, privateWorker: false });
+  });
+
+  it("returns videoEnabled: false when master is on but video is off", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: true, privateEnabled: true, videoEnabled: false, sharedWorkerId: "worker-1" });
+    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
+    expect(result.enabled).toBe(true);
+    expect(result.videoEnabled).toBe(false);
+  });
+
+  it("mirrors the three scope flags AND the tenant/master flags", async () => {
+    const deps = buildDeps();
+    (deps.settings!.getHermesWorkerSettings as any).mockResolvedValue({ enabled: true, sharedPoolEnabled: true, serverPersonalEnabled: false, privateEnabled: true, videoEnabled: true, sharedWorkerId: "worker-1" });
+    const result = await getHermesAvailability({ tenantId: TENANT_ID }, deps);
+    expect(result.scopes).toEqual({ serverShared: true, serverPersonal: false, privateWorker: true });
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts b/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts
index 6f0840c5b..fc71ffb5a 100644
--- a/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts
+++ b/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts
@@ -57,6 +57,9 @@ describe("Feature 135 Hermes media namespace guard", () => {
       "hermesMediaNamespaceGuard.test.ts",
     );
     const serverServicesDir = path.resolve(import.meta.dirname, "..");
+    // Section-03 adds `server/routers/hermesConnections.ts` (spec §3.3
+    // explicitly requires extending this guard's globs to cover it).
+    const serverRoutersDir = path.resolve(import.meta.dirname, "../../routers");
     const sharedDir = path.resolve(import.meta.dirname, "../../../shared");
     // Section-07's shared worker process directory — does not exist yet as of
     // this section; skipped when absent (walkDirRecursive/collectMatchingFiles
@@ -65,6 +68,7 @@ describe("Feature 135 Hermes media namespace guard", () => {
 
     const candidateFiles = [
       ...collectMatchingFiles(serverServicesDir, ["hermes"]),
+      ...collectMatchingFiles(serverRoutersDir, ["hermes"]),
       ...collectMatchingFiles(sharedDir, ["hermesMedia"]),
       ...walkDirRecursive(hermesWorkerDir),
     ]
diff --git a/apps/web/server/services/hermesConnectionService.ts b/apps/web/server/services/hermesConnectionService.ts
new file mode 100644
index 000000000..d048f0157
--- /dev/null
+++ b/apps/web/server/services/hermesConnectionService.ts
@@ -0,0 +1,1209 @@
+/**
+ * Feature 135 — Hermes Grok media worker connection service.
+ *
+ * User-facing connection layer over `hermes_provider_connections` (section
+ * 02): list / connect / status / default / disconnect / probe / admin
+ * operations, plus the `getHermesAvailability` readiness aggregate that the
+ * client model picker (section 10) reads directly — there is no separate
+ * readiness service.
+ *
+ * This module ALSO owns the three control-job insert builders
+ * (`buildAuthorizeJobInsert` / `buildProbeJobInsert` /
+ * `buildDisconnectJobInsert`) and the lazy settlement seam
+ * (`settleHermesConnectionFromControlJob`) that section-04's completion
+ * hook and 60s terminal-state sweep will call directly — no worker-side
+ * handlers, stdout parsing, or proactive completion hook live here.
+ *
+ * Injected-repo pattern (mirrors `workerStallWatchdogService.ts`): every
+ * exported function takes a plain params object plus an optional `deps`
+ * object (`{ repo?, settings?, flags?, now? }`) so unit tests can inject
+ * `vi.fn()` fakes with no DB and no `vi.mock` of drizzle required.
+ *
+ * Namespace note: this is the `hermesMedia` / `hermes_media` namespace — it
+ * has nothing to do with the pre-existing, unrelated agent-gateway Hermes
+ * lane (its own worker-queueing helper and its own tenant runtime flag, both
+ * in `server/services/workerSchedulerService.ts` / `shared/featureFlags.ts`,
+ * job type `external_agent_task`). The shared unit's worker id is
+ * discovered ONLY via the `hermes_shared_worker_id` system setting — never
+ * inferred from a worker's `runtimeType`. See
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { randomUUID } from "node:crypto";
+import { and, desc, eq, ne, sql } from "drizzle-orm";
+import { TRPCError } from "@trpc/server";
+
+import { getDb } from "../db";
+import {
+  hermesProviderConnections,
+  workerJobEvents,
+  workerJobs,
+  workers,
+  type HermesProviderConnection,
+  type InsertHermesProviderConnection,
+  type InsertWorkerJob,
+  type Worker,
+  type WorkerJob,
+  type WorkerJobEvent,
+} from "../../drizzle/schema";
+import {
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_MEDIA_CAPABILITY_FAMILIES,
+  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+  type WorkerRuntimeType,
+} from "../../shared/workerRuntime";
+import {
+  formatHermesErrorMessage,
+  HERMES_MEDIA_ERROR_CODES,
+  type HermesConnectionCapabilityManifest,
+  type HermesMediaErrorCode,
+  type HermesMediaOperation,
+} from "../../shared/hermesMedia";
+import {
+  getHermesWorkerSettings,
+  type HermesWorkerSettings,
+} from "./hermesWorkerSettings";
+import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
+import type { TenantFeatureFlags } from "../../shared/featureFlags";
+
+// ────────────────────────────────────────────────────────────────────────
+// Public types
+// ────────────────────────────────────────────────────────────────────────
+
+export type HermesConnectionScope = HermesProviderConnection["scope"];
+export type HermesConnectionStatus = HermesProviderConnection["status"];
+
+/** Never contains a token/secret/profile-path field. */
+export interface SafeHermesConnection {
+  id: string;
+  scope: HermesConnectionScope;
+  status: HermesConnectionStatus;
+  accountLabel: string | null;
+  accountHint: string | null;
+  defaultForImage: boolean;
+  defaultForVideo: boolean;
+  entitlementStatus: string | null;
+  assignedWorkerId: string | null;
+  assignedWorkerOnline: boolean;
+  capabilitySummary: {
+    probedAt: string | null;
+    imageEnabled: boolean;
+    videoEnabled: boolean;
+    maxEditReferences: number | null;
+  };
+  dailyJobQuota: number | null;
+  createdAt: string;
+  authorizedAt: string | null;
+}
+
+export interface HermesConnectionRepo {
+  findConnections(params: { tenantId: string; userId: number }): Promise<HermesProviderConnection[]>;
+  findConnectionById(params: { tenantId?: string; connectionId: string }): Promise<HermesProviderConnection | null>;
+  insertConnection(values: InsertHermesProviderConnection): Promise<HermesProviderConnection>;
+  /** Atomic composite: inserts the connection row and its authorize job in
+   *  ONE DB transaction (default impl) — used by `startHermesConnect` so a
+   *  crash between the two writes can never leave a `pending` connection
+   *  with no in-flight authorize job. */
+  insertConnectionWithJob(params: {
+    connection: InsertHermesProviderConnection;
+    job: InsertWorkerJob;
+  }): Promise<{ connection: HermesProviderConnection; job: WorkerJob }>;
+  updateConnection(params: {
+    tenantId?: string;
+    connectionId: string;
+    values: Partial<InsertHermesProviderConnection>;
+  }): Promise<HermesProviderConnection>;
+  clearDefaultFor(params: {
+    tenantId: string;
+    userId: number;
+    assetType: "image" | "video";
+    excludeConnectionId: string;
+  }): Promise<void>;
+  /** Atomic composite: clears the caller's previous default for `assetType`
+   *  then sets the new one, in ONE DB transaction (default impl) — so the
+   *  partial-unique index on (tenantId, ownerUserId) can never observe an
+   *  intermediate two-defaults state. */
+  setDefaultAtomic(params: {
+    tenantId: string;
+    userId: number;
+    connectionId: string;
+    assetType: "image" | "video";
+  }): Promise<HermesProviderConnection>;
+  findWorkerById(params: { tenantId: string; workerId: string }): Promise<Worker | null>;
+  findOwnedOnlineWorkers(params: { tenantId: string; userId: number }): Promise<Worker[]>;
+  insertWorkerJob(values: InsertWorkerJob): Promise<WorkerJob>;
+  findLatestControlJob(params: { tenantId: string; connectionId: string; jobType: string }): Promise<WorkerJob | null>;
+  findJobEvents(params: { jobId: string; eventType?: string }): Promise<WorkerJobEvent[]>;
+}
+
+export interface HermesConnectionSettingsDeps {
+  getHermesWorkerSettings(): Promise<HermesWorkerSettings>;
+}
+
+export interface HermesConnectionFlagsDeps {
+  getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags>;
+}
+
+export interface HermesConnectionDeps {
+  repo?: HermesConnectionRepo;
+  settings?: HermesConnectionSettingsDeps;
+  flags?: HermesConnectionFlagsDeps;
+  now?: () => Date;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Constants
+// ────────────────────────────────────────────────────────────────────────
+
+/** "Online" mirrors the 2-minute heartbeat-staleness convention already
+ *  used by `usersRouter`'s connected-workers view. */
+export const HERMES_WORKER_ONLINE_STALE_MS = 2 * 60 * 1000;
+
+export const HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS = 900;
+export const HERMES_CONNECTION_PROBE_TIMEOUT_SECONDS = 300;
+export const HERMES_CONNECTION_DISCONNECT_TIMEOUT_SECONDS = 120;
+
+const DEFAULT_ELIGIBLE_STATUSES: ReadonlySet<HermesConnectionStatus> = new Set([
+  "authorized",
+  "reauth_required",
+  "entitlement_restricted",
+]);
+
+const IMAGE_OPERATIONS: HermesMediaOperation[] = ["image.generate", "image.edit"];
+const VIDEO_OPERATIONS: HermesMediaOperation[] = [
+  "video.generate",
+  "video.image_to_video",
+  "video.reference_to_video",
+];
+
+const TERMINAL_FAILURE_STATUSES = new Set(["failed", "canceled", "expired"]);
+
+// ────────────────────────────────────────────────────────────────────────
+// Small helpers
+// ────────────────────────────────────────────────────────────────────────
+
+function tenantRequired(tenantId: string | undefined | null): string {
+  if (!tenantId) {
+    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
+  }
+  return tenantId;
+}
+
+function hermesTypedError(
+  code: HermesMediaErrorCode,
+  httpCode: "FORBIDDEN" | "PRECONDITION_FAILED" | "BAD_REQUEST" | "NOT_FOUND",
+  detail?: string,
+): TRPCError {
+  return new TRPCError({ code: httpCode, message: formatHermesErrorMessage(code, detail) });
+}
+
+function isWorkerOnline(worker: Pick<Worker, "status" | "lastSeenAt"> | null | undefined, now: Date): boolean {
+  if (!worker) return false;
+  if (worker.status !== "online") return false;
+  if (!worker.lastSeenAt) return false;
+  const lastSeenMs = new Date(worker.lastSeenAt).getTime();
+  if (!Number.isFinite(lastSeenMs)) return false;
+  return now.getTime() - lastSeenMs <= HERMES_WORKER_ONLINE_STALE_MS;
+}
+
+function isAssetTypeEnabledInManifest(
+  manifest: HermesConnectionCapabilityManifest,
+  assetType: "image" | "video",
+): boolean {
+  const ops = assetType === "image" ? IMAGE_OPERATIONS : VIDEO_OPERATIONS;
+  return ops.some((op) => manifest.operations?.[op]?.enabled === true);
+}
+
+function buildCapabilitySummary(
+  manifest: HermesConnectionCapabilityManifest | null | undefined,
+): SafeHermesConnection["capabilitySummary"] {
+  if (!manifest) {
+    return { probedAt: null, imageEnabled: false, videoEnabled: false, maxEditReferences: null };
+  }
+  return {
+    probedAt: manifest.probedAt ?? null,
+    imageEnabled: isAssetTypeEnabledInManifest(manifest, "image"),
+    videoEnabled: isAssetTypeEnabledInManifest(manifest, "video"),
+    maxEditReferences: manifest.operations?.["image.edit"]?.maxReferences ?? null,
+  };
+}
+
+function toSafeHermesConnection(row: HermesProviderConnection, assignedWorkerOnline: boolean): SafeHermesConnection {
+  return {
+    id: row.id,
+    scope: row.scope,
+    status: row.status,
+    accountLabel: row.accountLabel,
+    accountHint: row.accountHint,
+    defaultForImage: row.defaultForImage,
+    defaultForVideo: row.defaultForVideo,
+    entitlementStatus: row.entitlementStatus,
+    assignedWorkerId: row.assignedWorkerId,
+    assignedWorkerOnline,
+    capabilitySummary: buildCapabilitySummary(row.capabilitiesJson),
+    dailyJobQuota: row.dailyJobQuota,
+    createdAt: row.createdAt.toISOString(),
+    authorizedAt: row.authorizedAt ? row.authorizedAt.toISOString() : null,
+  };
+}
+
+/** Tenant-wide readable: `server_shared` rows readable by anyone in the
+ *  tenant; `server_personal` / `private_worker` rows readable only by the
+ *  owner. Used by `listHermesConnections` / `getHermesConnection` (spec:
+ *  "visible to the caller"). NOT used for `setHermesDefaultConnection` —
+ *  defaults are a strictly per-owner concept even for `server_shared` rows,
+ *  see `assertOwnerRegardlessOfScope` below. */
+function assertReadable(row: HermesProviderConnection | null, userId: number): asserts row is HermesProviderConnection {
+  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  if (row.scope === "server_shared") return;
+  if (row.ownerUserId !== userId) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  }
+}
+
+/** Strict ownership check used by `setHermesDefaultConnection`, regardless
+ *  of scope. A `server_shared` connection's `defaultForImage`/
+ *  `defaultForVideo` flags belong to its creating `ownerUserId` (the
+ *  partial-unique index is keyed on `(tenantId, ownerUserId)`) — allowing
+ *  any tenant member to flip those flags on an admin-owned shared
+ *  connection would both corrupt another user's default state and risk a
+ *  partial-unique index collision against the real owner's own connection.
+ *  Everyone but the exact owner gets a NOT_FOUND-style rejection (existence
+ *  of another user's connection is not leaked). */
+function assertOwnerRegardlessOfScope(
+  row: HermesProviderConnection | null,
+  userId: number,
+): asserts row is HermesProviderConnection {
+  if (!row || row.ownerUserId !== userId) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  }
+}
+
+/** Stricter visibility used for connect-status / disconnect / probe: the
+ *  owner, or (for `server_shared`) an admin — everyone else gets a
+ *  NOT_FOUND-style rejection so existence of another user's connection is
+ *  not leaked. */
+function assertOwnerOrAdminForShared(
+  row: HermesProviderConnection | null,
+  userId: number,
+  isAdmin: boolean,
+): asserts row is HermesProviderConnection {
+  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  if (row.scope === "server_shared") {
+    if (!isAdmin && row.ownerUserId !== userId) {
+      throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+    }
+    return;
+  }
+  if (row.ownerUserId !== userId) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  }
+}
+
+function isTerminalWorkerJobStatus(status: string): boolean {
+  return status === "completed" || TERMINAL_FAILURE_STATUSES.has(status);
+}
+
+function mapAuthFailureReasonToErrorCode(job: {
+  status: string;
+  failureReason?: string | null;
+}): HermesMediaErrorCode {
+  if (job.status === "expired") return "HERMES_TIMEOUT";
+  const reason = (job.failureReason ?? "").toLowerCase();
+  if (reason.includes("timeout") || reason.includes("timed out")) return "HERMES_TIMEOUT";
+  if (reason.includes("denied") || reason.includes("declined")) return "HERMES_OAUTH_DENIED";
+  if (reason.includes("expired")) return "HERMES_OAUTH_SESSION_EXPIRED";
+  return "HERMES_PROCESS_FAILED";
+}
+
+type ProbeFailureOutcome = "reauth_required" | "entitlement_restricted" | "other";
+
+/** Classifies a terminal-failure probe job's reason so
+ *  `settleHermesConnectionFromControlJob` can drive the connection to the
+ *  right terminal-ish state instead of silently no-op'ing (a probe failure
+ *  is meaningful signal, not just "try again later"):
+ *  - auth-invalidation-classified (expired session / revoked grant /
+ *    unauthorized) → `reauth_required` + `HERMES_REAUTH_REQUIRED`.
+ *  - xAI-403/entitlement-classified → `entitlement_restricted` (mirrors the
+ *    success-output path's entitlement classification).
+ *  - anything else → `other`; the row's `status` is left untouched, only
+ *    `metadataJson.lastError` records the mapped code. */
+function classifyProbeFailureReason(job: {
+  status: string;
+  failureReason?: string | null;
+}): { outcome: ProbeFailureOutcome; errorCode: HermesMediaErrorCode } {
+  const reason = (job.failureReason ?? "").toLowerCase();
+  if (reason.includes("403") || reason.includes("entitlement") || reason.includes("forbidden")) {
+    return { outcome: "entitlement_restricted", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" };
+  }
+  if (
+    reason.includes("reauth")
+    || reason.includes("unauthorized")
+    || reason.includes("invalid_grant")
+    || reason.includes("revoked")
+    || reason.includes("session")
+  ) {
+    return { outcome: "reauth_required", errorCode: "HERMES_REAUTH_REQUIRED" };
+  }
+  if (job.status === "expired" || reason.includes("timeout") || reason.includes("timed out")) {
+    return { outcome: "other", errorCode: "HERMES_TIMEOUT" };
+  }
+  return { outcome: "other", errorCode: "HERMES_PROCESS_FAILED" };
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Control-job insert builders — exported so section-04's
+// `hermesConnectionJobs.ts` can reuse them without duplication.
+// ────────────────────────────────────────────────────────────────────────
+
+interface BuildJobInsertParams {
+  tenantId: string;
+  connectionId: string;
+  workerId: string;
+  runtimeType: WorkerRuntimeType;
+  requestedByUserId: number | null;
+  profileReference: string;
+}
+
+function buildControlJobInsert(
+  jobType: string,
+  timeoutSeconds: number,
+  params: BuildJobInsertParams,
+): InsertWorkerJob {
+  return {
+    tenantId: params.tenantId,
+    workerId: params.workerId,
+    runtimeType: params.runtimeType,
+    requestedByUserId: params.requestedByUserId ?? undefined,
+    jobType,
+    status: "queued",
+    resourceProfile: "cpu_light",
+    capabilityRequirementsJson: {
+      requiredClaimCapability: HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+      // `workerJobMatchesSelection` (workerSchedulerService.ts) reads this
+      // array — required so only a worker declaring the `hermes-media-
+      // generation` family can claim these control jobs.
+      capabilityFamilies: HERMES_MEDIA_CAPABILITY_FAMILIES,
+      connectionId: params.connectionId,
+      preferredWorkerId: params.workerId,
+    },
+    inputJson: {
+      connectionId: params.connectionId,
+      profileReference: params.profileReference,
+      timeoutSeconds,
+    },
+    timeoutSeconds,
+  };
+}
+
+export function buildAuthorizeJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
+  return buildControlJobInsert(
+    HERMES_CONNECTION_AUTH_JOB_TYPE,
+    HERMES_CONNECTION_AUTHORIZE_TIMEOUT_SECONDS,
+    params,
+  );
+}
+
+export function buildProbeJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
+  return buildControlJobInsert(
+    HERMES_CONNECTION_PROBE_JOB_TYPE,
+    HERMES_CONNECTION_PROBE_TIMEOUT_SECONDS,
+    params,
+  );
+}
+
+export function buildDisconnectJobInsert(params: BuildJobInsertParams): InsertWorkerJob {
+  return buildControlJobInsert(
+    HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+    HERMES_CONNECTION_DISCONNECT_TIMEOUT_SECONDS,
+    params,
+  );
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Default (DB-backed) repo
+// ────────────────────────────────────────────────────────────────────────
+
+export const defaultHermesConnectionRepo: HermesConnectionRepo = {
+  async findConnections({ tenantId }) {
+    const db = getDb();
+    return db
+      .select()
+      .from(hermesProviderConnections)
+      .where(eq(hermesProviderConnections.tenantId, tenantId));
+  },
+
+  async findConnectionById({ tenantId, connectionId }) {
+    const db = getDb();
+    const conditions = [eq(hermesProviderConnections.id, connectionId)];
+    if (tenantId) conditions.push(eq(hermesProviderConnections.tenantId, tenantId));
+    const [row] = await db
+      .select()
+      .from(hermesProviderConnections)
+      .where(and(...conditions))
+      .limit(1);
+    return row ?? null;
+  },
+
+  async insertConnection(values) {
+    const db = getDb();
+    const [row] = await db.insert(hermesProviderConnections).values(values).returning();
+    return row;
+  },
+
+  async insertConnectionWithJob({ connection, job }) {
+    const db = getDb();
+    return db.transaction(async (tx) => {
+      const [connectionRow] = await tx.insert(hermesProviderConnections).values(connection).returning();
+      const [jobRow] = await tx.insert(workerJobs).values(job).returning();
+      return { connection: connectionRow, job: jobRow };
+    });
+  },
+
+  async updateConnection({ tenantId, connectionId, values }) {
+    const db = getDb();
+    const conditions = [eq(hermesProviderConnections.id, connectionId)];
+    if (tenantId) conditions.push(eq(hermesProviderConnections.tenantId, tenantId));
+    const [row] = await db
+      .update(hermesProviderConnections)
+      .set(values)
+      .where(and(...conditions))
+      .returning();
+    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+    return row;
+  },
+
+  async clearDefaultFor({ tenantId, userId, assetType, excludeConnectionId }) {
+    const db = getDb();
+    const column = assetType === "image"
+      ? hermesProviderConnections.defaultForImage
+      : hermesProviderConnections.defaultForVideo;
+    await db
+      .update(hermesProviderConnections)
+      .set(assetType === "image" ? { defaultForImage: false } : { defaultForVideo: false })
+      .where(and(
+        eq(hermesProviderConnections.tenantId, tenantId),
+        eq(hermesProviderConnections.ownerUserId, userId),
+        eq(column, true),
+        ne(hermesProviderConnections.id, excludeConnectionId),
+      ));
+  },
+
+  async setDefaultAtomic({ tenantId, userId, connectionId, assetType }) {
+    const db = getDb();
+    const column = assetType === "image"
+      ? hermesProviderConnections.defaultForImage
+      : hermesProviderConnections.defaultForVideo;
+    return db.transaction(async (tx) => {
+      await tx
+        .update(hermesProviderConnections)
+        .set(assetType === "image" ? { defaultForImage: false } : { defaultForVideo: false })
+        .where(and(
+          eq(hermesProviderConnections.tenantId, tenantId),
+          eq(hermesProviderConnections.ownerUserId, userId),
+          eq(column, true),
+          ne(hermesProviderConnections.id, connectionId),
+        ));
+      const [row] = await tx
+        .update(hermesProviderConnections)
+        .set(assetType === "image" ? { defaultForImage: true } : { defaultForVideo: true })
+        .where(and(
+          eq(hermesProviderConnections.id, connectionId),
+          eq(hermesProviderConnections.tenantId, tenantId),
+        ))
+        .returning();
+      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+      return row;
+    });
+  },
+
+  async findWorkerById({ tenantId, workerId }) {
+    const db = getDb();
+    const [row] = await db
+      .select()
+      .from(workers)
+      .where(and(eq(workers.tenantId, tenantId), eq(workers.id, workerId)))
+      .limit(1);
+    return row ?? null;
+  },
+
+  async findOwnedOnlineWorkers({ tenantId, userId }) {
+    const db = getDb();
+    const rows = await db
+      .select()
+      .from(workers)
+      .where(and(
+        eq(workers.tenantId, tenantId),
+        eq(workers.registeredByUserId, userId),
+        eq(workers.status, "online"),
+      ));
+    const now = new Date();
+    return rows.filter((row) => isWorkerOnline(row, now));
+  },
+
+  async insertWorkerJob(values) {
+    const db = getDb();
+    const [row] = await db.insert(workerJobs).values(values).returning();
+    return row;
+  },
+
+  async findLatestControlJob({ tenantId, connectionId, jobType }) {
+    const db = getDb();
+    const [row] = await db
+      .select()
+      .from(workerJobs)
+      .where(and(
+        eq(workerJobs.tenantId, tenantId),
+        eq(workerJobs.jobType, jobType),
+        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
+      ))
+      .orderBy(desc(workerJobs.createdAt))
+      .limit(1);
+    return row ?? null;
+  },
+
+  async findJobEvents({ jobId, eventType }) {
+    const db = getDb();
+    const conditions = [eq(workerJobEvents.workerJobId, jobId)];
+    if (eventType) conditions.push(eq(workerJobEvents.eventType, eventType));
+    return db
+      .select()
+      .from(workerJobEvents)
+      .where(and(...conditions))
+      .orderBy(desc(workerJobEvents.createdAt));
+  },
+};
+
+function resolveDeps(deps: HermesConnectionDeps) {
+  return {
+    repo: deps.repo ?? defaultHermesConnectionRepo,
+    settings: deps.settings ?? { getHermesWorkerSettings },
+    flags: deps.flags ?? { getTenantFeatureFlags },
+    now: deps.now ?? (() => new Date()),
+  };
+}
+
+async function readSettingsFailClosed(settingsDeps: HermesConnectionSettingsDeps): Promise<HermesWorkerSettings | null> {
+  try {
+    return await settingsDeps.getHermesWorkerSettings();
+  } catch {
+    return null;
+  }
+}
+
+async function readTenantFlagsFailClosed(
+  flagsDeps: HermesConnectionFlagsDeps,
+  tenantId: string,
+): Promise<TenantFeatureFlags | null> {
+  try {
+    return await flagsDeps.getTenantFeatureFlags(tenantId);
+  } catch {
+    return null;
+  }
+}
+
+function scopeFlagFrom(settings: HermesWorkerSettings, scope: HermesConnectionScope): boolean {
+  if (scope === "server_shared") return settings.sharedPoolEnabled;
+  if (scope === "server_personal") return settings.serverPersonalEnabled;
+  return settings.privateEnabled;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// listConnections / getConnection
+// ────────────────────────────────────────────────────────────────────────
+
+export async function listHermesConnections(
+  params: { tenantId: string; userId: number; assetType?: "image" | "video" },
+  deps: HermesConnectionDeps = {},
+): Promise<SafeHermesConnection[]> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const rows = await resolved.repo.findConnections({ tenantId, userId: params.userId });
+  const visible = rows.filter((row) => row.scope === "server_shared" || row.ownerUserId === params.userId);
+  const nowDate = resolved.now();
+
+  const results: SafeHermesConnection[] = [];
+  for (const row of visible) {
+    if (params.assetType && row.capabilitiesJson && !isAssetTypeEnabledInManifest(row.capabilitiesJson, params.assetType)) {
+      continue;
+    }
+    const worker = row.assignedWorkerId
+      ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
+      : null;
+    results.push(toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)));
+  }
+  return results;
+}
+
+export async function getHermesConnection(
+  params: { tenantId: string; userId: number; connectionId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<SafeHermesConnection & { capabilities: HermesConnectionCapabilityManifest | null }> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  assertReadable(row, params.userId);
+  const nowDate = resolved.now();
+  const worker = row.assignedWorkerId
+    ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
+    : null;
+  return {
+    ...toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)),
+    capabilities: row.capabilitiesJson ?? null,
+  };
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// getHermesAvailability
+// ────────────────────────────────────────────────────────────────────────
+
+export async function getHermesAvailability(
+  params: { tenantId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<{
+  enabled: boolean;
+  videoEnabled: boolean;
+  scopes: { serverShared: boolean; serverPersonal: boolean; privateWorker: boolean };
+}> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const settings = await readSettingsFailClosed(resolved.settings);
+  const tenantFlags = await readTenantFlagsFailClosed(resolved.flags, tenantId);
+
+  const enabled = Boolean(settings?.enabled) && Boolean(tenantFlags?.hermesMediaWorker);
+  const videoEnabled = enabled && Boolean(settings?.videoEnabled);
+
+  return {
+    enabled,
+    videoEnabled,
+    scopes: {
+      serverShared: enabled && Boolean(settings?.sharedPoolEnabled),
+      serverPersonal: enabled && Boolean(settings?.serverPersonalEnabled),
+      privateWorker: enabled && Boolean(settings?.privateEnabled),
+    },
+  };
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// startHermesConnect
+// ────────────────────────────────────────────────────────────────────────
+
+async function resolveTargetWorker(input: {
+  scope: HermesConnectionScope;
+  workerId: string | undefined;
+  userId: number;
+  tenantId: string;
+  repo: HermesConnectionRepo;
+  settings: HermesWorkerSettings;
+  now: Date;
+}): Promise<Worker> {
+  if (input.scope === "private_worker") {
+    if (input.workerId) {
+      const worker = await input.repo.findWorkerById({ tenantId: input.tenantId, workerId: input.workerId });
+      if (!worker || worker.registeredByUserId !== input.userId) {
+        throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "worker not owned by caller");
+      }
+      if (!isWorkerOnline(worker, input.now)) {
+        throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "worker offline");
+      }
+      return worker;
+    }
+    const owned = await input.repo.findOwnedOnlineWorkers({ tenantId: input.tenantId, userId: input.userId });
+    if (owned.length !== 1) {
+      throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no unambiguous eligible worker");
+    }
+    return owned[0];
+  }
+
+  // server_shared / server_personal — discovery ONLY via the
+  // `hermes_shared_worker_id` setting. Never inferred from runtimeType.
+  const sharedWorkerId = input.settings.sharedWorkerId;
+  if (!sharedWorkerId) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no shared worker configured");
+  }
+  const worker = await input.repo.findWorkerById({ tenantId: input.tenantId, workerId: sharedWorkerId });
+  if (!worker || !isWorkerOnline(worker, input.now)) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "shared worker offline");
+  }
+  return worker;
+}
+
+export async function startHermesConnect(
+  params: {
+    tenantId: string;
+    userId: number;
+    isAdmin: boolean;
+    scope: HermesConnectionScope;
+    workerId?: string;
+    label?: string;
+    consentAcknowledged: boolean;
+  },
+  deps: HermesConnectionDeps = {},
+): Promise<{ connectionId: string }> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const nowDate = resolved.now();
+
+  const settings = await readSettingsFailClosed(resolved.settings);
+  if (!settings || !settings.enabled || !scopeFlagFrom(settings, params.scope)) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+  const tenantFlags = await readTenantFlagsFailClosed(resolved.flags, tenantId);
+  if (!tenantFlags || !tenantFlags.hermesMediaWorker) {
+    throw hermesTypedError("HERMES_DISABLED", "FORBIDDEN");
+  }
+
+  if (params.scope === "server_shared" && !params.isAdmin) {
+    throw new TRPCError({
+      code: "FORBIDDEN",
+      message: "Only admins may create a server_shared Hermes connection",
+    });
+  }
+
+  if (!params.consentAcknowledged) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "Data-transfer consent must be acknowledged before connecting",
+    });
+  }
+
+  const worker = await resolveTargetWorker({
+    scope: params.scope,
+    workerId: params.workerId,
+    userId: params.userId,
+    tenantId,
+    repo: resolved.repo,
+    settings,
+    now: nowDate,
+  });
+
+  const connectionId = randomUUID();
+  const profileReference = `conn_${connectionId}`;
+
+  // Atomic: insert the connection row and its authorize job in ONE DB
+  // transaction (default impl) so a crash mid-sequence can never leave a
+  // `pending` connection with no in-flight authorize job.
+  const { connection } = await resolved.repo.insertConnectionWithJob({
+    connection: {
+      id: connectionId,
+      tenantId,
+      ownerUserId: params.userId,
+      scope: params.scope,
+      status: "pending",
+      assignedWorkerId: worker.id,
+      profileReference,
+      accountLabel: params.label ?? null,
+      metadataJson: {
+        consentAcknowledgedAt: nowDate.toISOString(),
+        consentUserId: params.userId,
+      },
+    },
+    job: buildAuthorizeJobInsert({
+      tenantId,
+      connectionId,
+      workerId: worker.id,
+      runtimeType: worker.runtimeType,
+      requestedByUserId: params.userId,
+      profileReference,
+    }),
+  });
+
+  return { connectionId: connection.id };
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// getHermesConnectStatus + settlement seam
+// ────────────────────────────────────────────────────────────────────────
+
+export async function getHermesConnectStatus(
+  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<{
+  status: HermesConnectionStatus;
+  verificationUrl?: string;
+  userCode?: string;
+  expiresAt?: string;
+  errorCode?: HermesMediaErrorCode;
+}> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  let row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);
+
+  const job = await resolved.repo.findLatestControlJob({
+    tenantId,
+    connectionId: row.id,
+    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+  });
+
+  let verificationUrl: string | undefined;
+  let userCode: string | undefined;
+  let expiresAt: string | undefined;
+
+  if (job) {
+    // Never log the device code / user code — only connectionId/jobId may
+    // appear in structured logs elsewhere in this feature.
+    const events = await resolved.repo.findJobEvents({ jobId: job.id, eventType: "hermes_device_code" });
+    const deviceEvent = events[0];
+    if (deviceEvent) {
+      const payload = (deviceEvent.payloadJson ?? {}) as Record<string, unknown>;
+      verificationUrl = typeof payload.verificationUrl === "string" ? payload.verificationUrl : undefined;
+      userCode = typeof payload.userCode === "string" ? payload.userCode : undefined;
+      expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;
+    }
+
+    if (isTerminalWorkerJobStatus(job.status)) {
+      await settleHermesConnectionFromControlJob(
+        {
+          connectionId: row.id,
+          job: {
+            jobType: job.jobType,
+            status: job.status,
+            failureReason: job.failureReason ?? undefined,
+            outputJson: job.outputJson ?? undefined,
+          },
+        },
+        { repo: resolved.repo, now: resolved.now },
+      );
+      row = (await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId })) ?? row;
+    }
+  }
+
+  const lastError = (row.metadataJson as Record<string, unknown> | null | undefined)?.lastError;
+  const errorCode = typeof lastError === "string" && (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(lastError)
+    ? (lastError as HermesMediaErrorCode)
+    : undefined;
+
+  return { status: row.status, verificationUrl, userCode, expiresAt, errorCode };
+}
+
+/**
+ * Lazy settlement seam. Called from `getConnectStatus` above; section-04's
+ * proactive completion hook and 60s terminal-state sweep will call this
+ * SAME function directly once a control job reaches a terminal state — do
+ * NOT duplicate this mapping logic elsewhere.
+ *
+ * Idempotent: a connection row that has already left the expected
+ * pre-settlement state (e.g. `pending` for an authorize job, or already
+ * `disconnected` for a disconnect job) is left untouched.
+ */
+export async function settleHermesConnectionFromControlJob(
+  params: {
+    connectionId: string;
+    job: {
+      jobType: string;
+      status: string;
+      failureReason?: string;
+      outputJson?: Record<string, unknown> | null;
+    };
+  },
+  deps: { repo?: HermesConnectionRepo; now?: () => Date } = {},
+): Promise<void> {
+  const repo = deps.repo ?? defaultHermesConnectionRepo;
+  const now = deps.now ?? (() => new Date());
+  const nowDate = now();
+
+  const row = await repo.findConnectionById({ connectionId: params.connectionId });
+  if (!row) return;
+
+  const isSuccess = params.job.status === "completed";
+  const isFailure = TERMINAL_FAILURE_STATUSES.has(params.job.status);
+  if (!isSuccess && !isFailure) return;
+
+  const output = params.job.outputJson ?? {};
+
+  if (params.job.jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) {
+    if (row.status !== "pending") return; // already settled — idempotent no-op
+    if (isSuccess) {
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: {
+          status: "authorized",
+          authorizedAt: nowDate,
+          accountHint: typeof output.accountHint === "string" ? output.accountHint : row.accountHint,
+          capabilitiesJson: (output.capabilities as HermesConnectionCapabilityManifest | undefined) ?? row.capabilitiesJson,
+        },
+      });
+    } else {
+      const reason = mapAuthFailureReasonToErrorCode({ status: params.job.status, failureReason: params.job.failureReason });
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: {
+          status: "error",
+          metadataJson: { ...(row.metadataJson ?? {}), lastError: reason },
+        },
+      });
+    }
+    return;
+  }
+
+  if (params.job.jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) {
+    if (row.status === "disconnected") return; // already settled — idempotent no-op
+    if (isSuccess) {
+      if (output.entitlementRestricted === true) {
+        await repo.updateConnection({
+          connectionId: row.id,
+          values: {
+            status: "entitlement_restricted",
+            entitlementStatus: typeof output.entitlementStatus === "string" ? output.entitlementStatus : "restricted",
+            lastProbeAt: nowDate,
+          },
+        });
+        return;
+      }
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: {
+          capabilitiesJson: (output.capabilities as HermesConnectionCapabilityManifest | undefined) ?? row.capabilitiesJson,
+          lastProbeAt: nowDate,
+        },
+      });
+      return;
+    }
+
+    // Terminal-failure probe: this is meaningful signal, NOT a silent
+    // no-op — otherwise `reauth_required` + `HERMES_REAUTH_REQUIRED` are
+    // dead states that no code path ever reaches.
+    const classification = classifyProbeFailureReason({
+      status: params.job.status,
+      failureReason: params.job.failureReason,
+    });
+    if (classification.outcome === "entitlement_restricted") {
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: {
+          status: "entitlement_restricted",
+          entitlementStatus: "restricted",
+          lastProbeAt: nowDate,
+          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
+        },
+      });
+      return;
+    }
+    if (classification.outcome === "reauth_required") {
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: {
+          status: "reauth_required",
+          metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
+        },
+      });
+      return;
+    }
+    // Other probe failures: record the typed reason but leave `status`
+    // untouched — a transient probe error should not demote an otherwise
+    // healthy connection.
+    await repo.updateConnection({
+      connectionId: row.id,
+      values: {
+        metadataJson: { ...(row.metadataJson ?? {}), lastError: classification.errorCode },
+      },
+    });
+    return;
+  }
+
+  if (params.job.jobType === HERMES_CONNECTION_DISCONNECT_JOB_TYPE) {
+    if (row.status === "disconnected") return; // already settled — idempotent no-op
+    if (isSuccess) {
+      await repo.updateConnection({
+        connectionId: row.id,
+        values: { status: "disconnected", disconnectedAt: nowDate },
+      });
+    }
+  }
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// setDefault / disconnect / probe
+// ────────────────────────────────────────────────────────────────────────
+
+export async function setHermesDefaultConnection(
+  params: { tenantId: string; userId: number; connectionId: string; assetType: "image" | "video" },
+  deps: HermesConnectionDeps = {},
+): Promise<void> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  // Strict ownership regardless of scope — a `server_shared` connection's
+  // default flags belong to its creating owner only (see
+  // `assertOwnerRegardlessOfScope`'s doc comment).
+  assertOwnerRegardlessOfScope(row, params.userId);
+
+  if (!DEFAULT_ELIGIBLE_STATUSES.has(row.status)) {
+    throw new TRPCError({
+      code: "PRECONDITION_FAILED",
+      message: "This Hermes connection is not eligible to be set as a default",
+    });
+  }
+
+  // Atomic clear-then-set (ONE DB transaction in the default impl) so the
+  // partial-unique index on (tenantId, ownerUserId) among eligible
+  // statuses can never observe an intermediate two-defaults state.
+  await resolved.repo.setDefaultAtomic({
+    tenantId,
+    userId: params.userId,
+    connectionId: row.id,
+    assetType: params.assetType,
+  });
+}
+
+export async function disconnectHermesConnection(
+  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<void> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);
+
+  if (row.scope === "server_shared" && !params.isAdmin) {
+    throw new TRPCError({
+      code: "FORBIDDEN",
+      message: "Only admins may disconnect a server_shared Hermes connection",
+    });
+  }
+
+  if (!row.assignedWorkerId) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
+  }
+  const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
+  if (!worker) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker not found");
+  }
+
+  const nowDate = resolved.now();
+  await resolved.repo.updateConnection({
+    tenantId,
+    connectionId: row.id,
+    values: {
+      metadataJson: { ...(row.metadataJson ?? {}), disconnectRequestedAt: nowDate.toISOString() },
+    },
+  });
+
+  await resolved.repo.insertWorkerJob(buildDisconnectJobInsert({
+    tenantId,
+    connectionId: row.id,
+    workerId: row.assignedWorkerId,
+    runtimeType: worker.runtimeType,
+    requestedByUserId: params.userId,
+    profileReference: row.profileReference,
+  }));
+}
+
+export async function probeHermesConnection(
+  params: { tenantId: string; userId: number; isAdmin: boolean; connectionId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<void> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  assertOwnerOrAdminForShared(row, params.userId, params.isAdmin);
+
+  // Consistent with `disconnectHermesConnection`: mutating a server_shared
+  // connection (even a lighter-weight probe) requires admin, not merely
+  // ownership visibility.
+  if (row.scope === "server_shared" && !params.isAdmin) {
+    throw new TRPCError({
+      code: "FORBIDDEN",
+      message: "Only admins may probe a server_shared Hermes connection",
+    });
+  }
+
+  if (!row.assignedWorkerId) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "no assigned worker");
+  }
+  const nowDate = resolved.now();
+  const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
+  if (!worker || !isWorkerOnline(worker, nowDate)) {
+    throw hermesTypedError("HERMES_WORKER_UNAVAILABLE", "PRECONDITION_FAILED", "assigned worker offline");
+  }
+
+  await resolved.repo.insertWorkerJob(buildProbeJobInsert({
+    tenantId,
+    connectionId: row.id,
+    workerId: row.assignedWorkerId,
+    runtimeType: worker.runtimeType,
+    requestedByUserId: params.userId,
+    profileReference: row.profileReference,
+  }));
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Admin ops
+// ────────────────────────────────────────────────────────────────────────
+
+export async function adminListHermesConnections(
+  params: { tenantId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<SafeHermesConnection[]> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const rows = await resolved.repo.findConnections({ tenantId, userId: -1 });
+  const nowDate = resolved.now();
+  const results: SafeHermesConnection[] = [];
+  for (const row of rows) {
+    const worker = row.assignedWorkerId
+      ? await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId })
+      : null;
+    results.push(toSafeHermesConnection(row, isWorkerOnline(worker, nowDate)));
+  }
+  return results;
+}
+
+export async function adminSetHermesQuota(
+  params: { tenantId: string; connectionId: string; dailyJobQuota: number | null },
+  deps: HermesConnectionDeps = {},
+): Promise<void> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+  if (row.scope !== "server_shared") {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "Daily job quota can only be set on server_shared Hermes connections",
+    });
+  }
+  await resolved.repo.updateConnection({
+    tenantId,
+    connectionId: row.id,
+    values: { dailyJobQuota: params.dailyJobQuota },
+  });
+}
+
+export async function adminDisableHermesConnection(
+  params: { tenantId: string; connectionId: string },
+  deps: HermesConnectionDeps = {},
+): Promise<void> {
+  const resolved = resolveDeps(deps);
+  const tenantId = tenantRequired(params.tenantId);
+  const row = await resolved.repo.findConnectionById({ tenantId, connectionId: params.connectionId });
+  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Hermes connection not found" });
+
+  const nowDate = resolved.now();
+  await resolved.repo.updateConnection({
+    tenantId,
+    connectionId: row.id,
+    values: {
+      status: "disconnected",
+      disconnectedAt: nowDate,
+      defaultForImage: false,
+      defaultForVideo: false,
+    },
+  });
+
+  if (row.assignedWorkerId) {
+    const worker = await resolved.repo.findWorkerById({ tenantId, workerId: row.assignedWorkerId });
+    if (worker && isWorkerOnline(worker, nowDate)) {
+      await resolved.repo.insertWorkerJob(buildDisconnectJobInsert({
+        tenantId,
+        connectionId: row.id,
+        workerId: row.assignedWorkerId,
+        runtimeType: worker.runtimeType,
+        requestedByUserId: null,
+        profileReference: row.profileReference,
+      }));
+    }
+  }
+}
