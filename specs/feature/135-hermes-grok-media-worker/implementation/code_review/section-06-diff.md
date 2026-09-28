diff --git a/apps/web/server/routers/__tests__/media.hermesReconcile.test.ts b/apps/web/server/routers/__tests__/media.hermesReconcile.test.ts
new file mode 100644
index 000000000..d3056b334
--- /dev/null
+++ b/apps/web/server/routers/__tests__/media.hermesReconcile.test.ts
@@ -0,0 +1,318 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+const {
+  mockGetCacheClient,
+  mockRefundReservation,
+  mockCalculateCreditCost,
+  mockDeductCredits,
+  mockRefundCredits,
+  mockGetHermesMediaTask,
+} = vi.hoisted(() => ({
+  mockGetCacheClient: vi.fn(),
+  mockRefundReservation: vi.fn(async () => ({ refundedAmount: 0 })),
+  mockCalculateCreditCost: vi.fn(),
+  mockDeductCredits: vi.fn(),
+  mockRefundCredits: vi.fn(),
+  mockGetHermesMediaTask: vi.fn(),
+}));
+
+// Minimal import-safety mocks (mirrors media.db-first.contract.test.ts) —
+// media.ts pulls in a very large dependency graph; these are the two that
+// throw at *import* time without a real env (JWT_SECRET / a real tRPC
+// builder). Everything else in the file loads fine as real modules.
+vi.mock("../../_core/tokens", () => ({
+  signBearerToken: vi.fn().mockReturnValue("fallback-token"),
+}));
+vi.mock("../../_core/trpc", () => {
+  const createProcedure = () => {
+    const proc: any = {
+      query: (fn: Function) => fn,
+      mutation: (fn: Function) => fn,
+      input: () => proc,
+    };
+    return proc;
+  };
+  return {
+    router: (routes: any) => routes,
+    protectedProcedure: createProcedure(),
+    adminProcedure: createProcedure(),
+  };
+});
+
+vi.mock("../../services/redisClients", () => ({
+  getCacheClient: mockGetCacheClient,
+}));
+
+vi.mock("../../services/creditService", () => ({
+  deductCredits: mockDeductCredits,
+  hasEnoughCredits: vi.fn().mockResolvedValue(true),
+  refundCredits: mockRefundCredits,
+  refundReservation: mockRefundReservation,
+}));
+
+vi.mock("../../services/pricingCalculator", () => ({
+  calculateCreditCost: mockCalculateCreditCost,
+}));
+
+// Partial mock: only `getHermesMediaTask` is stubbed (so the settle-
+// portrait-candidate-shaped test below can control the terminal shape
+// without a real DB); `isHermesMediaTaskId` / `reconcileHermesMediaJobFee`
+// run for real everywhere, including inside `reconcileTaskCredits` itself.
+vi.mock("../../services/hermesMediaAdapter", async (importOriginal) => {
+  const actual = await importOriginal<typeof import("../../services/hermesMediaAdapter")>();
+  return {
+    ...actual,
+    getHermesMediaTask: mockGetHermesMediaTask,
+  };
+});
+
+import { reconcileTaskCredits } from "../media";
+import { mediaGenerationService } from "../../services/mediaGenerationService";
+
+function buildRedis(initial?: Record<string, string>) {
+  const store = new Map<string, string>(Object.entries(initial ?? {}));
+  return {
+    get: vi.fn(async (key: string) => store.get(key) ?? null),
+    set: vi.fn(async (key: string, value: string) => {
+      store.set(key, value);
+      return "OK";
+    }),
+  };
+}
+
+describe("reconcileTaskCredits — hermes_ branch", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("refunds exactly the reserved fee once for a failed shared-pool job; a second call is a no-op", async () => {
+    const redis = buildRedis();
+    mockGetCacheClient.mockReturnValue(redis);
+    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
+
+    const task = {
+      id: "hermes_job-1",
+      status: "failed",
+      model: "grok-image-1",
+      parameters: { workerBilling: { reservationId: "res-1", reservedCredits: 8, sourceType: "worker_runtime" } },
+    };
+
+    const first = await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(first).toEqual({ adjusted: true, difference: -8, action: "refund" });
+    expect(mockRefundReservation).toHaveBeenCalledWith("res-1");
+
+    const second = await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(second).toEqual({ adjusted: false, difference: 0, action: "none" });
+    expect(mockRefundReservation).toHaveBeenCalledTimes(1);
+  });
+
+  it("refunds the full fee for a canceled-before-start job (adapter maps canceled → MediaTask status 'failed')", async () => {
+    const redis = buildRedis();
+    mockGetCacheClient.mockReturnValue(redis);
+    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
+
+    const task = {
+      id: "hermes_job-2",
+      status: "failed", // as projected by hermesMediaAdapter for a canceled worker_jobs row
+      model: "grok-image-1",
+      errorMessage: "งานถูกยกเลิก",
+      parameters: { workerBilling: { reservationId: "res-2", reservedCredits: 8, sourceType: "worker_runtime" } },
+    };
+
+    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(result).toEqual({ adjusted: true, difference: -8, action: "refund" });
+  });
+
+  it("keeps the fee (zero adjustment) for a completed shared-pool job", async () => {
+    const redis = buildRedis();
+    mockGetCacheClient.mockReturnValue(redis);
+
+    const task = {
+      id: "hermes_job-3",
+      status: "completed",
+      model: "grok-image-1",
+      parameters: { workerBilling: { reservationId: "res-3", reservedCredits: 8, sourceType: "worker_runtime" } },
+    };
+
+    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+    expect(mockRefundReservation).not.toHaveBeenCalled();
+  });
+
+  it("code review FIX 2: is a no-op (never refunds) for an in-flight hermes_ task, even with a billing envelope present", async () => {
+    const redis = buildRedis();
+    mockGetCacheClient.mockReturnValue(redis);
+
+    for (const status of ["pending", "processing"]) {
+      const task = {
+        id: `hermes_job-inflight-${status}`,
+        status,
+        model: "grok-image-1",
+        parameters: { workerBilling: { reservationId: `res-inflight-${status}`, reservedCredits: 8, sourceType: "worker_runtime" } },
+      };
+      const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
+      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+    }
+    expect(mockRefundReservation).not.toHaveBeenCalled();
+  });
+
+  it("is a zero-adjustment no-op for server_personal/private_worker jobs (no billing envelope) in every terminal state", async () => {
+    mockGetCacheClient.mockReturnValue(buildRedis());
+
+    for (const status of ["completed", "failed"] as const) {
+      const task = {
+        id: `hermes_job-personal-${status}`,
+        status,
+        model: "grok-image-1",
+        parameters: {},
+      };
+      const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
+      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+    }
+    expect(mockRefundReservation).not.toHaveBeenCalled();
+  });
+
+  it("never runs per-duration math for hermes_ ids (calculateCreditCost is never called)", async () => {
+    mockGetCacheClient.mockReturnValue(buildRedis());
+    const task = {
+      id: "hermes_job-4",
+      status: "completed",
+      model: "grok-image-1",
+      resultData: { actual_duration: 12, actual_resolution: "1080p" },
+      parameters: { workerBilling: { reservationId: "res-4", reservedCredits: 8, sourceType: "worker_runtime" } },
+    };
+    await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(mockCalculateCreditCost).not.toHaveBeenCalled();
+  });
+
+  it("regression: a non-hermes (mcp/gateway) task id still flows through the pre-existing duration/resolution body unchanged", async () => {
+    const redis = buildRedis();
+    mockGetCacheClient.mockReturnValue(redis);
+    mockCalculateCreditCost.mockReturnValue(30);
+
+    const task = {
+      id: "mcp_abc123",
+      status: "completed",
+      model: "some-model",
+      resultData: { actual_duration: 12, actual_resolution: "1080p" },
+      parameters: { extraParams: { __reserved_credits: 20 } },
+    };
+
+    // Falls through past the hermes branch into the legacy body; since the
+    // model lookup isn't mocked here it will hit the `catch` and no-op —
+    // the important assertion is that it never enters the hermes fee path.
+    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
+    expect(result.action === "none" || result.action === "refund" || result.action === "charge").toBe(true);
+    expect(mockRefundReservation).not.toHaveBeenCalled();
+  });
+});
+
+/**
+ * `settlePortraitCandidate` (server/routers/verticalDramaCharacters.ts) calls
+ * ONLY `mediaGenerationService.getTask(...)` then `reconcileTaskCredits(...)`
+ * generically — see lines ~1262-1306. This block replicates that exact call
+ * sequence (not the full tRPC procedure, which needs a much heavier
+ * verticalDramaCharacterStockService + DB harness) to prove those two
+ * generic functions carry a `hermes_` candidate through every terminal
+ * shape, including the stuck-candidate recovery case (`completed` status
+ * with no registered asset yet — a diagnosable, retryable state, never a
+ * fabricated URL), with NO changes needed to `settlePortraitCandidate`
+ * itself.
+ */
+describe("settlePortraitCandidate's generic getTask + reconcileTaskCredits chain (hermes_)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetCacheClient.mockReturnValue(buildRedis());
+  });
+
+  async function pollAndReconcile(taskId: string, userId: number) {
+    const task = await mediaGenerationService.getTask(taskId, "user-token", {
+      userId,
+      source: "trpc.verticalDramaCharacters.settlePortraitCandidate",
+      stage: "poll",
+    });
+    if (task.status === "completed" || task.status === "failed") {
+      await reconcileTaskCredits({ task: task as any, userId }).catch(() => {});
+    }
+    return task;
+  }
+
+  it("completed with a registered asset → resultUrl present, fee kept", async () => {
+    mockGetHermesMediaTask.mockResolvedValue({
+      id: "hermes_cand-1",
+      taskId: "job-1",
+      userId: "7",
+      mediaType: "image",
+      status: "completed",
+      model: "grok-image-1",
+      prompt: "portrait",
+      parameters: { workerBilling: { reservationId: "res-5", reservedCredits: 8, sourceType: "worker_runtime" } },
+      resultUrl: "https://signed.example/portrait.png",
+      createdAt: new Date().toISOString(),
+    });
+
+    const task = await pollAndReconcile("hermes_cand-1", 7);
+    expect(task.status).toBe("completed");
+    expect(task.resultUrl).toBe("https://signed.example/portrait.png");
+    expect(mockRefundReservation).not.toHaveBeenCalled();
+  });
+
+  it("stuck-candidate recovery: completed but no registered asset yet → resultUrl undefined, diagnosable (never throws, never fabricates a URL)", async () => {
+    mockGetHermesMediaTask.mockResolvedValue({
+      id: "hermes_cand-2",
+      taskId: "job-2",
+      userId: "7",
+      mediaType: "image",
+      status: "completed",
+      model: "grok-image-1",
+      prompt: "portrait",
+      parameters: { workerBilling: { reservationId: "res-6", reservedCredits: 8, sourceType: "worker_runtime" } },
+      createdAt: new Date().toISOString(),
+    });
+
+    const task = await pollAndReconcile("hermes_cand-2", 7);
+    expect(task.status).toBe("completed");
+    expect(task.resultUrl).toBeUndefined();
+  });
+
+  it("failed → errorMessage present, fee refunded exactly once", async () => {
+    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
+    mockGetHermesMediaTask.mockResolvedValue({
+      id: "hermes_cand-3",
+      taskId: "job-3",
+      userId: "7",
+      mediaType: "image",
+      status: "failed",
+      model: "grok-image-1",
+      prompt: "portrait",
+      errorMessage: "Hermes processing failed. Please try again.",
+      parameters: { workerBilling: { reservationId: "res-7", reservedCredits: 8, sourceType: "worker_runtime" } },
+      createdAt: new Date().toISOString(),
+    });
+
+    const task = await pollAndReconcile("hermes_cand-3", 7);
+    expect(task.status).toBe("failed");
+    expect(task.errorMessage).toBeTruthy();
+    expect(mockRefundReservation).toHaveBeenCalledWith("res-7");
+  });
+
+  it("canceled (projected as failed with HERMES_JOB_CANCELLED copy) → fee refunded", async () => {
+    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
+    mockGetHermesMediaTask.mockResolvedValue({
+      id: "hermes_cand-4",
+      taskId: "job-4",
+      userId: "7",
+      mediaType: "image",
+      status: "failed",
+      model: "grok-image-1",
+      prompt: "portrait",
+      errorMessage: "งานถูกยกเลิก",
+      parameters: { workerBilling: { reservationId: "res-8", reservedCredits: 8, sourceType: "worker_runtime" } },
+      createdAt: new Date().toISOString(),
+    });
+
+    const task = await pollAndReconcile("hermes_cand-4", 7);
+    expect(task.status).toBe("failed");
+    expect(mockRefundReservation).toHaveBeenCalledWith("res-8");
+  });
+});
diff --git a/apps/web/server/routers/media.ts b/apps/web/server/routers/media.ts
index d900eeb3d..c1c5fff40 100644
--- a/apps/web/server/routers/media.ts
+++ b/apps/web/server/routers/media.ts
@@ -19,6 +19,8 @@ import {
 } from "../services/mediaGenerationService";
 import { deductCredits, hasEnoughCredits, refundCredits } from "../services/creditService";
 import { calculateCreditCost, type UserSelections } from "../services/pricingCalculator";
+import { isHermesMediaTaskId, reconcileHermesMediaJobFee } from "../services/hermesMediaAdapter";
+import { billingEnvelopeFromMetadata } from "../services/workerBillingService";
 import {
   GEMINI_OMNI_AUDIO_CAPABILITY,
   GEMINI_OMNI_CHARACTER_CAPABILITY,
@@ -682,6 +684,24 @@ export async function reconcileTaskCredits(params: {
   const noOp = { adjusted: false, difference: 0, action: "none" as const };
   const { task, userId } = params;
 
+  // Fee-only hermes branch (Feature 135 §06) — early return BEFORE the
+  // duration/resolution reconciliation below, which never applies to
+  // hermes_media_* tasks (fee-only, not per-second/resolution pricing).
+  // Shares one implementation with the section-04 terminal sweep's
+  // `onTerminalHermesMediaJob` hook via `reconcileHermesMediaJobFee`.
+  if (isHermesMediaTaskId(task.id)) {
+    const billing = billingEnvelopeFromMetadata(
+      (task.parameters as Record<string, unknown> | undefined)?.workerBilling,
+    );
+    // Pass the RAW task status through unmapped — `reconcileHermesMediaJobFee`
+    // does its own terminal-status classification (code review fix: the
+    // previous `status === "completed" ? "completed" : "failed"` ternary
+    // would have wrongly classified an in-flight "pending"/"processing"
+    // task as "failed" and refunded a reservation for a job that hadn't
+    // actually finished, had this ever been called before a terminal state).
+    return reconcileHermesMediaJobFee({ taskId: task.id, status: task.status, billing });
+  }
+
   try {
     const { getCacheClient } = await import("../services/redisClients");
     const redis = getCacheClient();
diff --git a/apps/web/server/routes/workerRuntime.ts b/apps/web/server/routes/workerRuntime.ts
index 69415085e..eb7d1933b 100644
--- a/apps/web/server/routes/workerRuntime.ts
+++ b/apps/web/server/routes/workerRuntime.ts
@@ -8,6 +8,8 @@ import { z } from "zod";
 
 import type { TenantRequest } from "../_core/tenant";
 import {
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
   workerArtifactCompletePayloadSchema,
   workerArtifactInitPayloadSchema,
   workerClaimRequestSchema,
@@ -16,12 +18,20 @@ import {
   workerJobEventPayloadSchema,
   workerRegistrationPayloadSchema,
 } from "../../shared/workerRuntime";
+import {
+  defaultHermesMediaAdapterRepo,
+  extractHermesJobReferenceAssetIds,
+  HermesReferenceAssetOwnershipError,
+  mintHermesMediaReferenceUrls,
+} from "../services/hermesMediaAdapter";
+import { finalizeHermesMediaArtifact } from "../services/hermesMediaFinalizeService";
 import {
   delegatedSessionRequestSchema,
   delegatedWorkerCallbackPayloadSchema,
 } from "../../shared/workerDelegation";
 import { sendApiError } from "../middleware/publicApiHeaders";
 import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
+import { debugError } from "../_core/logger";
 import {
   createWorkerRegistrationToken,
   WorkerAuthError,
@@ -56,7 +66,7 @@ import { getWorkerPolicySnapshot } from "../services/workerPolicyService";
 import { getRedisClient } from "../services/redis";
 import { getWorkerAccessPermissionScopesForPreset } from "../../shared/workerAccessKeys";
 import { getDb, getUserById } from "../db";
-import { tenants } from "../../drizzle/schema";
+import { tenants, type WorkerArtifact, type WorkerJob } from "../../drizzle/schema";
 import { eq } from "drizzle-orm";
 
 interface WorkerRuntimeRouteDeps {
@@ -571,6 +581,88 @@ async function verifyWorkerRouteAccessToken(
   });
 }
 
+// ────────────────────────────────────────────────────────────────────────
+// Feature 135 — Hermes Grok media worker (section 06): claim-time reference
+// URL enrichment + the `/references/urls` re-mint route. `workerRegistryService.ts`
+// is off-limits to this section (concurrent-edit guard), so the lease /
+// job-scope checks below are deliberately duplicated (not imported) from
+// `ensureLease` / `ensureJobScopedAccess` in that file — same semantics,
+// applied only to this narrow reference-URL surface.
+// ────────────────────────────────────────────────────────────────────────
+
+const HERMES_MEDIA_JOB_TYPES: ReadonlySet<string> = new Set([
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+]);
+
+const HERMES_MEDIA_REFERENCE_URL_ACTIVE_STATUSES: ReadonlySet<string> = new Set([
+  "claimed",
+  "preparing",
+  "running",
+  "uploading",
+]);
+
+// Code review fix (nit): `workerRegistryService.ts`'s `ensureAssignmentAttempt`
+// (the /events route's equivalent check) only ever enforces stale-attempt
+// rejection for `jobType === "hyperframes_final_composite"` — it's a no-op
+// for every other job type, including hermes_media_*. Since this route has
+// no matching enforcement to mirror, `assignmentAttempt` is dropped from
+// the request schema entirely rather than accepted-but-ignored.
+const hermesReferenceUrlRequestSchema = z.object({
+  leaseOwnerToken: z.string().min(1),
+});
+
+function ensureHermesJobScopedAccess(
+  auth: { tenantId: string; runtimeType: string; workerId: string },
+  job: { tenantId: string; runtimeType: string; workerId: string | null },
+): void {
+  if (job.tenantId !== auth.tenantId || job.runtimeType !== auth.runtimeType) {
+    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not match the requested job scope", "auth_error");
+  }
+  if (job.workerId && job.workerId !== auth.workerId) {
+    throw new WorkerRuntimeServiceError("worker_scope_mismatch", 403, "Worker token does not own the requested job", "auth_error");
+  }
+}
+
+function ensureHermesJobLease(
+  job: { leaseOwnerToken: string | null; leaseExpiresAt: Date | string | null },
+  leaseOwnerToken: string,
+): void {
+  if (!leaseOwnerToken || !job.leaseOwnerToken || job.leaseOwnerToken !== leaseOwnerToken) {
+    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease token is stale or invalid");
+  }
+  if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now()) {
+    throw new WorkerRuntimeServiceError("stale_worker_lease", 409, "Worker lease has expired");
+  }
+}
+
+async function mintHermesReferenceUrlsOrThrow(params: {
+  tenantId: string;
+  requestedByUserId: number | null;
+  references: Array<{ assetId: string }>;
+}) {
+  if (params.references.length === 0 || params.requestedByUserId == null) {
+    return [];
+  }
+  try {
+    return await mintHermesMediaReferenceUrls({
+      tenantId: params.tenantId,
+      requestedByUserId: params.requestedByUserId,
+      references: params.references,
+    });
+  } catch (error) {
+    if (error instanceof HermesReferenceAssetOwnershipError) {
+      throw new WorkerRuntimeServiceError(
+        "hermes_reference_asset_not_found",
+        404,
+        error.message,
+        "not_found_error",
+      );
+    }
+    throw error;
+  }
+}
+
 export function registerWorkerRuntimeRoutes(
   app: Express,
   deps: WorkerRuntimeRouteDeps = {},
@@ -974,6 +1066,29 @@ export function registerWorkerRuntimeRoutes(
           payload: parsed,
           workerId: req.params.workerId,
         });
+
+        // Feature 135 section 06 — claim-time reference URL enrichment for
+        // hermes_media_* jobs ONLY. Response-only: the `worker_jobs` row
+        // itself is never mutated to contain a URL (contract stays
+        // `assetId + sha256` at rest — spec §13.1).
+        if (result.job && HERMES_MEDIA_JOB_TYPES.has(result.job.jobType)) {
+          // `result.job` is `claimWorkerJob`'s intentionally loose
+          // `Record<string, any>` row shape — cast to the strict Drizzle
+          // row type at this one crossing point (see the doc comment on
+          // `extractHermesJobReferenceAssetIds`).
+          const references = extractHermesJobReferenceAssetIds(result.job as unknown as WorkerJob);
+          const referenceUrls = await mintHermesReferenceUrlsOrThrow({
+            tenantId: auth.tenantId,
+            requestedByUserId: result.job.requestedByUserId ?? null,
+            references,
+          });
+          res.json({
+            ...result,
+            job: { ...result.job, referenceUrls },
+          });
+          return;
+        }
+
         res.json(result);
       } catch (error) {
         handleWorkerRouteError(error, res);
@@ -1130,6 +1245,57 @@ export function registerWorkerRuntimeRoutes(
     },
   );
 
+  // Feature 135 section 06 — same middleware stack as the events route
+  // above (rate limiter, body cap, `requireBearerToken` +
+  // `verifyWorkerRouteAccessToken` with `worker_execution` use +
+  // `workers:report` scope), then lease + active-state enforcement
+  // mirroring `recordWorkerJobEvent`. Re-mints the exact same URL set the
+  // claim response minted, via the same shared helper.
+  app.post(
+    "/api/worker-jobs/:jobId/references/urls",
+    eventLimiter,
+    enforceJsonBodyMaxBytes(16 * 1024),
+    async (req, res) => {
+      try {
+        const token = requireBearerToken(req);
+        const parsed = hermesReferenceUrlRequestSchema.parse(req.body ?? {});
+        const auth = await verifyWorkerRouteAccessToken(req, token, {
+          allowedTokenUses: ["worker_execution"],
+          requiredScopes: ["workers:report"],
+        });
+        const job = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
+        if (!job) {
+          throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${req.params.jobId} was not found`, "not_found_error");
+        }
+        // Code review fix — this route is hermes_media_* only (matches the
+        // claim-enrichment and finalize-dispatch gates); a non-hermes job id
+        // must be rejected the same way a nonexistent job would be, never
+        // leaking that it exists as some other job type.
+        if (!HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
+          throw new WorkerRuntimeServiceError("not_found", 404, `Worker job ${req.params.jobId} was not found`, "not_found_error");
+        }
+        ensureHermesJobScopedAccess(auth, job);
+        ensureHermesJobLease(job, parsed.leaseOwnerToken);
+        if (!HERMES_MEDIA_REFERENCE_URL_ACTIVE_STATUSES.has(job.status)) {
+          throw new WorkerRuntimeServiceError(
+            "worker_state_invalid",
+            409,
+            "Worker job is not in an active state for reference URL minting",
+          );
+        }
+        const references = extractHermesJobReferenceAssetIds(job);
+        const referenceUrls = await mintHermesReferenceUrlsOrThrow({
+          tenantId: job.tenantId,
+          requestedByUserId: job.requestedByUserId,
+          references,
+        });
+        res.json({ referenceUrls });
+      } catch (error) {
+        handleWorkerRouteError(error, res);
+      }
+    },
+  );
+
   app.post(
     "/api/worker-jobs/:jobId/artifacts/init-upload",
     artifactLimiter,
@@ -1171,6 +1337,26 @@ export function registerWorkerRuntimeRoutes(
           jobId: req.params.jobId,
           payload: parsed,
         });
+
+        // Feature 135 section 06 — finalize dispatch. Only hermes_media_*
+        // job artifacts are handled here; every other job type (including
+        // hyperframes) is untouched by this branch (regression-safe).
+        const job = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
+        if (job && HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
+          try {
+            // `result.artifact` is `completeWorkerArtifact`'s intentionally
+            // loose `Record<string, any>` row shape — cast to the strict
+            // Drizzle row type at this one crossing point.
+            await finalizeHermesMediaArtifact({ job, artifact: result.artifact as unknown as WorkerArtifact });
+          } catch (finalizeError) {
+            // finalizeHermesMediaArtifact already fails the job internally
+            // (typed failureReason) on a validation/safety-gate rejection —
+            // the artifact upload itself still succeeded, so the HTTP
+            // response to the worker must not change; just log.
+            debugError("workerRuntime", `Hermes media finalize failed for job ${req.params.jobId}`, finalizeError);
+          }
+        }
+
         res.json(result);
       } catch (error) {
         handleWorkerRouteError(error, res);
diff --git a/apps/web/server/services/__tests__/hermesMediaAdapter.test.ts b/apps/web/server/services/__tests__/hermesMediaAdapter.test.ts
new file mode 100644
index 000000000..2bfc4906a
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesMediaAdapter.test.ts
@@ -0,0 +1,364 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  cancelHermesMediaTask,
+  extractHermesJobReferenceAssetIds,
+  getHermesMediaTask,
+  HermesReferenceAssetOwnershipError,
+  hermesTaskIdToJobId,
+  isHermesMediaTaskId,
+  mintHermesMediaReferenceUrls,
+  reconcileHermesMediaJobFee,
+  type HermesMediaAdapterRepo,
+} from "../hermesMediaAdapter";
+import type { HermesMediaJobContract } from "../../../shared/hermesMedia";
+import type { WorkerJob } from "../../../drizzle/schema";
+
+const TENANT_ID = "tenant-1";
+const USER_ID = 42;
+const OTHER_USER_ID = 99;
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+
+function buildContract(overrides: Partial<HermesMediaJobContract> = {}): HermesMediaJobContract {
+  return {
+    contractVersion: 1,
+    operation: "image.generate",
+    connectionId: "conn-1",
+    prompt: "a cinematic portrait",
+    settings: { model: "grok-image-1" },
+    references: [],
+    traceId: "trace-1",
+    ...overrides,
+  } as HermesMediaJobContract;
+}
+
+function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
+  return {
+    id: "job-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    workerId: "worker-1",
+    runtimeType: "hermes_agent_gateway",
+    workflowRunId: null,
+    requestedByUserId: USER_ID,
+    requestedByPersonaId: null,
+    requestedBySystemComponent: "hermes_media_scheduler",
+    jobType: "hermes_media_image_generate",
+    status: "queued",
+    statusReason: null,
+    priority: 25,
+    resourceProfile: "network_heavy",
+    capabilityRequirementsJson: { connectionId: "conn-1" },
+    inputJson: buildContract(),
+    instructionsJson: {},
+    outputJson: null,
+    failureReason: null,
+    timeoutSeconds: 600,
+    retryPolicyJson: {},
+    idempotencyKey: null,
+    leaseOwnerToken: null,
+    leaseExpiresAt: null,
+    createdAt: NOW,
+    startedAt: null,
+    finishedAt: null,
+    ...overrides,
+  } as WorkerJob;
+}
+
+function buildRepo(overrides: Partial<HermesMediaAdapterRepo> = {}): HermesMediaAdapterRepo {
+  return {
+    getJobById: vi.fn(async () => null),
+    getMediaAssetForOwner: vi.fn(async () => null),
+    appendJobEvent: vi.fn(async () => {}),
+    ...overrides,
+  };
+}
+
+describe("isHermesMediaTaskId", () => {
+  it("is true for hermes_<jobId>", () => {
+    expect(isHermesMediaTaskId("hermes_abc123")).toBe(true);
+  });
+  it("is false for mcp_ ids", () => {
+    expect(isHermesMediaTaskId("mcp_abc123")).toBe(false);
+  });
+  it("is false for gateway ids", () => {
+    expect(isHermesMediaTaskId("gw_abc123")).toBe(false);
+    expect(isHermesMediaTaskId("abc123")).toBe(false);
+  });
+  it("is false for the bare 'hermes_' edge case", () => {
+    expect(isHermesMediaTaskId("hermes_")).toBe(false);
+  });
+});
+
+describe("hermesTaskIdToJobId", () => {
+  it("strips the prefix", () => {
+    expect(hermesTaskIdToJobId("hermes_job-1")).toBe("job-1");
+  });
+});
+
+describe("getHermesMediaTask — status mapping", () => {
+  const cases: Array<[WorkerJob["status"], "pending" | "processing" | "completed" | "failed"]> = [
+    ["queued", "pending"],
+    ["claimed", "pending"],
+    ["preparing", "pending"],
+    ["running", "processing"],
+    ["uploading", "processing"],
+    ["publishing", "processing"],
+    ["completed", "completed"],
+    ["failed", "failed"],
+    ["expired", "failed"],
+    ["canceled", "failed"],
+  ];
+
+  it.each(cases)("maps worker_jobs status %s to MediaTask status %s", async (jobStatus, expected) => {
+    const job = buildJob({ status: jobStatus, failureReason: jobStatus === "failed" ? "[HERMES_TIMEOUT] timed out" : null });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task?.status).toBe(expected);
+  });
+
+  it("derives errorMessage from the typed failureReason via hermesErrorCopy for failed", async () => {
+    const job = buildJob({ status: "failed", failureReason: "[HERMES_TIMEOUT] Processing timed out. Please try again." });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task?.status).toBe("failed");
+    expect(task?.errorMessage).toBeTruthy();
+    expect(task?.errorMessage).not.toContain("[HERMES_TIMEOUT]");
+  });
+
+  it("canceled maps to failed with HERMES_JOB_CANCELLED copy", async () => {
+    const job = buildJob({ status: "canceled" });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task?.status).toBe("failed");
+    expect(task?.errorMessage).toBeTruthy();
+  });
+});
+
+describe("getHermesMediaTask — ownership", () => {
+  it("returns null when requestedByUserId !== userId", async () => {
+    const job = buildJob({ requestedByUserId: OTHER_USER_ID });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task).toBeNull();
+  });
+
+  it("returns null when the job does not exist", async () => {
+    const repo = buildRepo({ getJobById: vi.fn(async () => null) });
+    const task = await getHermesMediaTask("hermes_missing", USER_ID, { repo });
+    expect(task).toBeNull();
+  });
+});
+
+describe("getHermesMediaTask — resultUrl", () => {
+  it("exposes resultUrl ONLY when finalize registered the asset (job.outputJson.mediaAssetId + owned media_assets row)", async () => {
+    const job = buildJob({
+      status: "completed",
+      outputJson: { mediaAssetId: "77", libraryItemId: "5", hermesFinalized: true },
+    });
+    const repo = buildRepo({
+      getJobById: vi.fn(async () => job),
+      getMediaAssetForOwner: vi.fn(async () => ({ id: 77, storageKey: "hermes-media/tenant-1/42/output.png" })),
+    });
+    const presign = vi.fn(async () => ({ url: "https://signed.example/output.png", key: "hermes-media/tenant-1/42/output.png" }));
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo, presign });
+    expect(task?.status).toBe("completed");
+    expect(task?.resultUrl).toBe("https://signed.example/output.png");
+    expect(presign).toHaveBeenCalledWith("hermes-media/tenant-1/42/output.png", expect.any(Number));
+  });
+
+  it("a completed job WITHOUT a registered asset never fabricates a resultUrl", async () => {
+    const job = buildJob({ status: "completed", outputJson: null });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task?.status).toBe("completed");
+    expect(task?.resultUrl).toBeUndefined();
+  });
+
+  it("never returns a worker-local or provider-hosted path — only the signed media_assets URL", async () => {
+    const job = buildJob({
+      status: "completed",
+      outputJson: { mediaAssetId: "9" },
+    });
+    const repo = buildRepo({
+      getJobById: vi.fn(async () => job),
+      getMediaAssetForOwner: vi.fn(async () => ({ id: 9, storageKey: "hermes-media/tenant-1/42/out.png" })),
+    });
+    const presign = vi.fn(async () => null);
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo, presign });
+    expect(task?.resultUrl).not.toMatch(/^https:\/\/api\.x\.ai/);
+  });
+});
+
+describe("getHermesMediaTask — projection", () => {
+  it("carries instructionsJson.workerBilling through parameters.workerBilling (round-trip)", async () => {
+    const job = buildJob({
+      instructionsJson: {
+        workerBilling: { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" },
+      },
+    });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const task = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(task?.parameters?.workerBilling).toEqual({
+      reservationId: "res-1",
+      reservedCredits: 5,
+      sourceType: "worker_runtime",
+    });
+  });
+
+  it("derives mediaType from jobType", async () => {
+    const imageJob = buildJob({ jobType: "hermes_media_image_generate" });
+    const videoJob = buildJob({ jobType: "hermes_media_video_generate", id: "job-2" });
+    const repo = buildRepo({
+      getJobById: vi.fn(async (jobId: string) => (jobId === "job-1" ? imageJob : videoJob)),
+    });
+    const imageTask = await getHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    const videoTask = await getHermesMediaTask("hermes_job-2", USER_ID, { repo });
+    expect(imageTask?.mediaType).toBe("image");
+    expect(videoTask?.mediaType).toBe("video");
+  });
+});
+
+describe("cancelHermesMediaTask", () => {
+  it("delegates to cancelQueuedUserWorkerJob for queued jobs", async () => {
+    const job = buildJob({ status: "queued" });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    const cancelQueuedJob = vi.fn(async () => ({ canceled: true as const, jobId: job.id }));
+    await cancelHermesMediaTask("hermes_job-1", USER_ID, { repo, cancelQueuedJob });
+    expect(cancelQueuedJob).toHaveBeenCalledWith({ auth: { tenantId: TENANT_ID, userId: USER_ID }, jobId: "job-1" });
+  });
+
+  it("posts a cancel-requested event for claimed/running jobs", async () => {
+    const job = buildJob({ status: "running" });
+    const appendJobEvent = vi.fn(async () => {});
+    const repo = buildRepo({ getJobById: vi.fn(async () => job), appendJobEvent });
+    await cancelHermesMediaTask("hermes_job-1", USER_ID, { repo });
+    expect(appendJobEvent).toHaveBeenCalledWith(
+      expect.objectContaining({ jobId: "job-1", eventType: expect.stringContaining("cancel") }),
+    );
+  });
+
+  it("rejects a foreign user's cancel", async () => {
+    const job = buildJob({ requestedByUserId: OTHER_USER_ID });
+    const repo = buildRepo({ getJobById: vi.fn(async () => job) });
+    await expect(cancelHermesMediaTask("hermes_job-1", USER_ID, { repo })).rejects.toThrow();
+  });
+});
+
+describe("reconcileHermesMediaJobFee", () => {
+  function buildRedis(existing?: string) {
+    const store = new Map<string, string>();
+    if (existing) store.set("credit:reconciled:hermes_job-1", existing);
+    return {
+      get: vi.fn(async (key: string) => store.get(key) ?? null),
+      set: vi.fn(async (key: string, value: string) => {
+        store.set(key, value);
+        return "OK";
+      }),
+    };
+  }
+
+  it("no-ops when there is no billing envelope (personal/private jobs)", async () => {
+    const result = await reconcileHermesMediaJobFee({ taskId: "hermes_job-1", status: "failed", billing: null });
+    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+  });
+
+  it("refunds the full reserved fee once for a failed job, and is a no-op on the second call", async () => {
+    const redis = buildRedis();
+    const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
+    const billing = { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" as const };
+    const first = await reconcileHermesMediaJobFee(
+      { taskId: "hermes_job-1", status: "failed", billing },
+      { getRedis: () => redis, refundReservation },
+    );
+    expect(first).toEqual({ adjusted: true, difference: -5, action: "refund" });
+    expect(refundReservation).toHaveBeenCalledWith("res-1");
+
+    const second = await reconcileHermesMediaJobFee(
+      { taskId: "hermes_job-1", status: "failed", billing },
+      { getRedis: () => redis, refundReservation },
+    );
+    expect(second).toEqual({ adjusted: false, difference: 0, action: "none" });
+    expect(refundReservation).toHaveBeenCalledTimes(1);
+  });
+
+  it("keeps the fee (no refund) for a completed job", async () => {
+    const redis = buildRedis();
+    const refundReservation = vi.fn(async () => ({ refundedAmount: 0 }));
+    const billing = { reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" as const };
+    const result = await reconcileHermesMediaJobFee(
+      { taskId: "hermes_job-1", status: "completed", billing },
+      { getRedis: () => redis, refundReservation },
+    );
+    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+    expect(refundReservation).not.toHaveBeenCalled();
+  });
+
+  it("refunds for canceled/expired terminal statuses too (raw status, not just 'failed')", async () => {
+    for (const status of ["canceled", "expired"]) {
+      const redis = buildRedis();
+      const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
+      const billing = { reservationId: `res-${status}`, reservedCredits: 5, sourceType: "worker_runtime" as const };
+      const result = await reconcileHermesMediaJobFee(
+        { taskId: "hermes_job-1", status, billing },
+        { getRedis: () => redis, refundReservation },
+      );
+      expect(result).toEqual({ adjusted: true, difference: -5, action: "refund" });
+      expect(refundReservation).toHaveBeenCalledWith(`res-${status}`);
+    }
+  });
+
+  // ── Code review FIX 2: internal terminal-status guard ──
+  it("is a no-op (never refunds) for any non-terminal / in-flight status, even with a billing envelope present", async () => {
+    for (const status of ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"]) {
+      const redis = buildRedis();
+      const refundReservation = vi.fn(async () => ({ refundedAmount: 5 }));
+      const billing = { reservationId: "res-inflight", reservedCredits: 5, sourceType: "worker_runtime" as const };
+      const result = await reconcileHermesMediaJobFee(
+        { taskId: "hermes_job-1", status, billing },
+        { getRedis: () => redis, refundReservation },
+      );
+      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
+      expect(refundReservation).not.toHaveBeenCalled();
+    }
+  });
+});
+
+describe("mintHermesMediaReferenceUrls", () => {
+  it("mints one URL per reference, re-verifying tenant + owner", async () => {
+    const getMediaAssetForOwner = vi.fn(async ({ id }: { id: number }) => ({ id, storageKey: `key-${id}` }));
+    const presign = vi.fn(async (key: string) => ({ url: `https://signed.example/${key}`, key }));
+    const repo = buildRepo({ getMediaAssetForOwner });
+    const results = await mintHermesMediaReferenceUrls(
+      { tenantId: TENANT_ID, requestedByUserId: USER_ID, references: [{ assetId: "1" }, { assetId: "2" }] },
+      { repo, presign },
+    );
+    expect(results).toHaveLength(2);
+    expect(getMediaAssetForOwner).toHaveBeenCalledWith({ id: 1, tenantId: TENANT_ID, userId: USER_ID });
+    expect(results[0].url).toContain("key-1");
+  });
+
+  it("throws a typed ownership error for an asset the requester no longer owns (never a silent skip)", async () => {
+    const repo = buildRepo({ getMediaAssetForOwner: vi.fn(async () => null) });
+    await expect(
+      mintHermesMediaReferenceUrls(
+        { tenantId: TENANT_ID, requestedByUserId: USER_ID, references: [{ assetId: "1" }] },
+        { repo },
+      ),
+    ).rejects.toBeInstanceOf(HermesReferenceAssetOwnershipError);
+  });
+});
+
+describe("extractHermesJobReferenceAssetIds", () => {
+  it("extracts assetIds from inputJson.references", () => {
+    const job = buildJob({ inputJson: buildContract({ references: [
+      { assetId: "1", index: 1, role: "subject", label: "Image 1", sha256: "a".repeat(64) },
+    ] }) });
+    expect(extractHermesJobReferenceAssetIds(job)).toEqual([{ assetId: "1" }]);
+  });
+
+  it("returns [] for a malformed/absent references array", () => {
+    expect(extractHermesJobReferenceAssetIds({ inputJson: {} } as any)).toEqual([]);
+    expect(extractHermesJobReferenceAssetIds({ inputJson: null } as any)).toEqual([]);
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesMediaFinalizeService.test.ts b/apps/web/server/services/__tests__/hermesMediaFinalizeService.test.ts
new file mode 100644
index 000000000..4bd5b368d
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesMediaFinalizeService.test.ts
@@ -0,0 +1,327 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  finalizeHermesMediaArtifact,
+  HermesMediaFinalizeError,
+  type HermesMediaFinalizeDeps,
+  type HermesMediaFinalizeRepo,
+} from "../hermesMediaFinalizeService";
+import type { HermesMediaJobContract } from "../../../shared/hermesMedia";
+import type { WorkerArtifact, WorkerJob } from "../../../drizzle/schema";
+
+const TENANT_ID = "tenant-1";
+const USER_ID = 42;
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+
+function buildContract(overrides: Partial<HermesMediaJobContract> = {}): HermesMediaJobContract {
+  return {
+    contractVersion: 1,
+    operation: "image.generate",
+    connectionId: "conn-1",
+    prompt: "a cinematic portrait",
+    settings: { model: "grok-image-1" },
+    references: [],
+    traceId: "trace-1",
+    ...overrides,
+  } as HermesMediaJobContract;
+}
+
+function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
+  return {
+    id: "job-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    workerId: "worker-1",
+    runtimeType: "hermes_agent_gateway",
+    workflowRunId: null,
+    requestedByUserId: USER_ID,
+    requestedByPersonaId: null,
+    requestedBySystemComponent: "hermes_media_scheduler",
+    jobType: "hermes_media_image_generate",
+    status: "publishing",
+    statusReason: null,
+    priority: 25,
+    resourceProfile: "network_heavy",
+    capabilityRequirementsJson: { connectionId: "conn-1" },
+    inputJson: buildContract(),
+    instructionsJson: {},
+    outputJson: null,
+    failureReason: null,
+    timeoutSeconds: 600,
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
+function buildArtifact(overrides: Partial<WorkerArtifact> = {}): WorkerArtifact {
+  return {
+    id: "artifact-1",
+    workerJobId: "job-1",
+    artifactType: "output_image",
+    storageRef: "hermes-media/tenant-1/42/job-1/output.png",
+    metadataJson: {
+      checksumSha256: "a".repeat(64),
+      contentType: "image/png",
+      sizeBytes: 1024,
+      width: 1024,
+      height: 1024,
+    },
+    publishedItemId: null,
+    createdAt: NOW,
+    ...overrides,
+  } as WorkerArtifact;
+}
+
+function buildRepo(overrides: Partial<HermesMediaFinalizeRepo> = {}): HermesMediaFinalizeRepo {
+  return {
+    insertMediaAsset: vi.fn(async () => ({ id: 501, storageKey: "hermes-media/tenant-1/42/job-1/output.png" })),
+    updateArtifact: vi.fn(async () => {}),
+    updateJob: vi.fn(async () => {}),
+    ...overrides,
+  };
+}
+
+function buildDeps(overrides: Partial<HermesMediaFinalizeDeps> = {}): HermesMediaFinalizeDeps {
+  return {
+    now: () => NOW,
+    verifyStoredObject: vi.fn(async () => ({ valid: true })),
+    contentSafetyGate: vi.fn(async () => ({ safe: true })),
+    createLibraryItem: vi.fn(async () => ({
+      item: { id: 900 } as any,
+      idempotent: false,
+    })),
+    resolveStorageUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
+    resolveLibraryFolderOwner: vi.fn(async () => true),
+    ...overrides,
+  };
+}
+
+describe("finalizeHermesMediaArtifact", () => {
+  it("checksum/mime/size mismatch → typed OUTPUT_INVALID failure, job failed, no rows created", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps({ verifyStoredObject: vi.fn(async () => ({ valid: false, reason: "checksum_mismatch" })) });
+
+    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow(HermesMediaFinalizeError);
+
+    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
+    expect(deps.createLibraryItem).not.toHaveBeenCalled();
+    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
+      status: "failed",
+      failureReason: expect.stringContaining("HERMES_OUTPUT_INVALID"),
+    }));
+  });
+
+  it("happy path: creates media_assets + library_items, sets publishedItemId, writes lineage, completes the job", async () => {
+    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "12" } }) });
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps();
+
+    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(result).toEqual({ mediaAssetId: "501", libraryItemId: "900" });
+    expect(repo.insertMediaAsset).toHaveBeenCalledWith(expect.objectContaining({
+      tenantId: TENANT_ID,
+      userId: USER_ID,
+      storageKey: artifact.storageRef,
+      mimeType: "image/png",
+      checksumSha256: "a".repeat(64),
+      width: 1024,
+      height: 1024,
+    }));
+    expect(deps.createLibraryItem).toHaveBeenCalledWith(
+      expect.objectContaining({
+        itemType: "image",
+        source: "hermes_media",
+        parentId: 12,
+        metadata: expect.objectContaining({
+          operation: "image.generate",
+          prompt: "a cinematic portrait",
+          model: "grok-image-1",
+          workerJobId: "job-1",
+        }),
+      }),
+      expect.objectContaining({ userId: USER_ID, tenantId: TENANT_ID }),
+    );
+    expect(repo.updateArtifact).toHaveBeenCalledWith("artifact-1", expect.objectContaining({
+      publishedItemId: 900,
+      metadataJson: expect.objectContaining({ mediaAssetId: "501" }),
+    }));
+    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
+      status: "completed",
+      outputJson: expect.objectContaining({ mediaAssetId: "501", libraryItemId: "900", hermesFinalized: true }),
+    }));
+  });
+
+  it("defaults to the root folder when storage.libraryFolderId is absent", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps();
+
+    await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(deps.createLibraryItem).toHaveBeenCalledWith(
+      expect.objectContaining({ parentId: null }),
+      expect.anything(),
+    );
+  });
+
+  it("content-safety gate failure blocks publication — no rows created, job failed typed", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps({ contentSafetyGate: vi.fn(async () => ({ safe: false, reason: "malware_detected" })) });
+
+    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow(HermesMediaFinalizeError);
+
+    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
+    expect(deps.createLibraryItem).not.toHaveBeenCalled();
+    expect(repo.updateJob).toHaveBeenCalledWith("job-1", expect.objectContaining({
+      status: "failed",
+      failureReason: expect.stringContaining("HERMES_LIBRARY_REGISTRATION_FAILED"),
+    }));
+  });
+
+  it("a passing content-safety scan proceeds to publication", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps({ contentSafetyGate: vi.fn(async () => ({ safe: true })) });
+
+    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+    expect(result.mediaAssetId).toBe("501");
+  });
+
+  it("is idempotent on (workerJobId, artifact.id) — a duplicate completion returns the existing ids without duplicating rows", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact({
+      publishedItemId: 900,
+      metadataJson: { ...buildArtifact().metadataJson, mediaAssetId: "501" },
+    });
+    const repo = buildRepo();
+    const deps = buildDeps();
+
+    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(result).toEqual({ mediaAssetId: "501", libraryItemId: "900" });
+    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
+    expect(deps.createLibraryItem).not.toHaveBeenCalled();
+    expect(repo.updateJob).not.toHaveBeenCalled();
+  });
+
+  // ── Code review FIX 1: publish-phase try/catch + checkpoint recovery ──
+
+  it("a publish-phase throw (e.g. createLibraryItem failure) fails the job typed and never leaves it stuck in 'publishing'", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const deps = buildDeps({ createLibraryItem: vi.fn(async () => { throw new Error("library db exploded"); }) });
+
+    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow("library db exploded");
+
+    // The media_assets row WAS inserted (checkpointed) before the failure —
+    // that's expected and handled by the recovery path, not a leak.
+    expect(repo.insertMediaAsset).toHaveBeenCalledTimes(1);
+    expect(deps.createLibraryItem).toHaveBeenCalledTimes(1);
+    expect(repo.updateArtifact).not.toHaveBeenCalled();
+
+    // Every updateJob call must be either the checkpoint (outputJson only,
+    // no status change) or the final failure — NEVER "completed", and the
+    // LAST call must be the typed failure (job never stuck in "publishing").
+    const calls = (repo.updateJob as any).mock.calls;
+    expect(calls.some(([, values]: [string, any]) => values.status === "completed")).toBe(false);
+    const lastCall = calls[calls.length - 1];
+    expect(lastCall[1]).toEqual(expect.objectContaining({
+      status: "failed",
+      failureReason: expect.stringContaining("HERMES_LIBRARY_REGISTRATION_FAILED"),
+    }));
+  });
+
+  it("does not mask the original error if the failure-marking updateJob call itself throws", async () => {
+    const job = buildJob();
+    const artifact = buildArtifact();
+    let updateJobCall = 0;
+    const repo = buildRepo({
+      updateJob: vi.fn(async (_jobId, values) => {
+        updateJobCall += 1;
+        // First call is the insertMediaAsset checkpoint — let it succeed so
+        // the publish phase can proceed to the point of failure.
+        if (updateJobCall === 1) return;
+        throw new Error("db down while marking job failed");
+      }),
+    });
+    const deps = buildDeps({ createLibraryItem: vi.fn(async () => { throw new Error("original publish error"); }) });
+
+    await expect(finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo })).rejects.toThrow("original publish error");
+  });
+
+  it("an interrupted-after-insert retry (job.outputJson.mediaAssetId already checkpointed) reuses the existing asset row instead of double-inserting", async () => {
+    const job = buildJob({ outputJson: { mediaAssetId: "999" } });
+    const artifact = buildArtifact({ publishedItemId: null });
+    const repo = buildRepo();
+    const deps = buildDeps();
+
+    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(result).toEqual({ mediaAssetId: "999", libraryItemId: "900" });
+    expect(repo.insertMediaAsset).not.toHaveBeenCalled();
+    expect(deps.createLibraryItem).toHaveBeenCalledTimes(1);
+    expect(repo.updateArtifact).toHaveBeenCalledWith("artifact-1", expect.objectContaining({
+      publishedItemId: 900,
+      metadataJson: expect.objectContaining({ mediaAssetId: "999" }),
+    }));
+    expect(repo.updateJob).toHaveBeenLastCalledWith("job-1", expect.objectContaining({
+      status: "completed",
+      outputJson: expect.objectContaining({ mediaAssetId: "999" }),
+    }));
+  });
+
+  // ── Code review FIX 4: library folder ownership validation ──
+
+  it("uses the requested library folder as parentId only when ownership resolves true", async () => {
+    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "12" } }) });
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const resolveLibraryFolderOwner = vi.fn(async () => true);
+    const deps = buildDeps({ resolveLibraryFolderOwner });
+
+    await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(resolveLibraryFolderOwner).toHaveBeenCalledWith({ folderId: 12, tenantId: TENANT_ID, userId: USER_ID });
+    expect(deps.createLibraryItem).toHaveBeenCalledWith(
+      expect.objectContaining({ parentId: 12 }),
+      expect.anything(),
+    );
+  });
+
+  it("defaults to root and records a lineage note when the requested folder is not owned by the requester (or missing)", async () => {
+    const job = buildJob({ inputJson: buildContract({ storage: { libraryFolderId: "999999" } }) });
+    const artifact = buildArtifact();
+    const repo = buildRepo();
+    const resolveLibraryFolderOwner = vi.fn(async () => false);
+    const deps = buildDeps({ resolveLibraryFolderOwner });
+
+    const result = await finalizeHermesMediaArtifact({ job, artifact }, { ...deps, repo });
+
+    expect(result.mediaAssetId).toBe("501");
+    expect(deps.createLibraryItem).toHaveBeenCalledWith(
+      expect.objectContaining({
+        parentId: null,
+        metadata: expect.objectContaining({
+          requestedLibraryFolderId: "999999",
+          libraryFolderNote: "requested_library_folder_not_owned_by_requester",
+        }),
+      }),
+      expect.anything(),
+    );
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesReferenceUrls.test.ts b/apps/web/server/services/__tests__/hermesReferenceUrls.test.ts
new file mode 100644
index 000000000..26f65bb54
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesReferenceUrls.test.ts
@@ -0,0 +1,330 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+import express from "express";
+import request from "supertest";
+
+process.env.JWT_SECRET ??= "hermes-reference-urls-route-test-secret-0123456789";
+
+vi.mock("../tenantFeatureFlagService", () => ({
+  getTenantFeatureFlags: vi.fn().mockResolvedValue({
+    openClawExternalRuntime: true,
+    desktopZeroClawWorker: true,
+    nemoClawSecureWorkerPool: true,
+    hiClawClusterRuntime: true,
+    hermesMediaWorker: true,
+  }),
+}));
+
+const {
+  mockGetJobById,
+  mockMintHermesMediaReferenceUrls,
+  mockExtractHermesJobReferenceAssetIds,
+} = vi.hoisted(() => ({
+  mockGetJobById: vi.fn(),
+  mockMintHermesMediaReferenceUrls: vi.fn(),
+  mockExtractHermesJobReferenceAssetIds: vi.fn(),
+}));
+
+vi.mock("../hermesMediaAdapter", async (importOriginal) => {
+  const actual = await importOriginal<typeof import("../hermesMediaAdapter")>();
+  return {
+    ...actual,
+    defaultHermesMediaAdapterRepo: {
+      ...actual.defaultHermesMediaAdapterRepo,
+      getJobById: mockGetJobById,
+    },
+    mintHermesMediaReferenceUrls: mockMintHermesMediaReferenceUrls,
+    extractHermesJobReferenceAssetIds: mockExtractHermesJobReferenceAssetIds,
+  };
+});
+
+const { mockFinalizeHermesMediaArtifact } = vi.hoisted(() => ({
+  mockFinalizeHermesMediaArtifact: vi.fn(),
+}));
+vi.mock("../hermesMediaFinalizeService", () => ({
+  finalizeHermesMediaArtifact: mockFinalizeHermesMediaArtifact,
+}));
+
+const TENANT_ID = "tenant-1";
+const WORKER_ID = "worker-1";
+
+function buildHermesJob(overrides: Record<string, unknown> = {}) {
+  return {
+    id: "job-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    workerId: WORKER_ID,
+    runtimeType: "openclaw_gateway",
+    requestedByUserId: 7,
+    jobType: "hermes_media_image_generate",
+    status: "claimed",
+    inputJson: {
+      references: [{ assetId: "1", index: 1, role: "subject", label: "Image 1", sha256: "a".repeat(64) }],
+    },
+    instructionsJson: {},
+    outputJson: null,
+    leaseOwnerToken: "lease-token-1",
+    leaseExpiresAt: new Date(Date.now() + 60_000),
+    createdAt: new Date(),
+    startedAt: new Date(),
+    finishedAt: null,
+    ...overrides,
+  };
+}
+
+async function makeApp(overrides: {
+  claimWorkerJob?: (...args: any[]) => Promise<any>;
+  completeWorkerArtifact?: (...args: any[]) => Promise<any>;
+} = {}) {
+  const { registerWorkerRuntimeRoutes } = await import("../../routes/workerRuntime");
+  const app = express();
+  app.use(express.json());
+  registerWorkerRuntimeRoutes(app, {
+    workerRegistry: {
+      registerWorker: vi.fn(),
+      recordWorkerHeartbeat: vi.fn(),
+      claimWorkerJob: overrides.claimWorkerJob ?? vi.fn().mockResolvedValue({ job: null, queueDepth: 0 }),
+      recordWorkerJobEvent: vi.fn(),
+      initWorkerArtifactUpload: vi.fn(),
+      completeWorkerArtifact: overrides.completeWorkerArtifact ?? vi.fn().mockResolvedValue({
+        created: true,
+        artifact: { id: "artifact-1" },
+      }),
+      recordWorkerDiagnostics: vi.fn(),
+    } as any,
+  });
+  return app;
+}
+
+async function issueTokens(scopes?: string[]) {
+  const { issueWorkerAccessTokens } = await import("../workerAuthService");
+  return issueWorkerAccessTokens({
+    tenantId: TENANT_ID,
+    workerId: WORKER_ID,
+    runtimeType: "openclaw_gateway" as any,
+    scopes: scopes as any,
+  });
+}
+
+async function issueToken(scopes?: string[]) {
+  return (await issueTokens(scopes)).executionToken;
+}
+
+async function issueUploadToken() {
+  return (await issueTokens()).uploadToken;
+}
+
+describe("Hermes media claim-time reference URL enrichment", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("attaches referenceUrls to the claim response job payload for hermes_media_* jobs", async () => {
+    const job = buildHermesJob({ status: "claimed", leaseOwnerToken: "lease-x" });
+    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
+    mockMintHermesMediaReferenceUrls.mockResolvedValue([
+      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
+    ]);
+    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
+    const app = await makeApp({ claimWorkerJob });
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
+      .set("Authorization", `Bearer ${token}`)
+      .send({ maxJobs: 1, capabilityHints: ["hermes_media"] });
+
+    expect(res.status).toBe(200);
+    expect(res.body.job.referenceUrls).toEqual([
+      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
+    ]);
+    expect(mockMintHermesMediaReferenceUrls).toHaveBeenCalledWith(
+      expect.objectContaining({ tenantId: TENANT_ID, requestedByUserId: 7, references: [{ assetId: "1" }] }),
+    );
+  });
+
+  it("claim response for non-hermes jobs is byte-identical to before (no referenceUrls key, regression)", async () => {
+    const job = buildHermesJob({ jobType: "remotion_render_video" });
+    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
+    const app = await makeApp({ claimWorkerJob });
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
+      .set("Authorization", `Bearer ${token}`)
+      .send({ maxJobs: 1, capabilityHints: [] });
+
+    expect(res.status).toBe(200);
+    expect(res.body.job.referenceUrls).toBeUndefined();
+    expect(mockMintHermesMediaReferenceUrls).not.toHaveBeenCalled();
+  });
+
+  it("a reference asset the requester no longer owns fails the claim path with a typed error, not a silent skip", async () => {
+    const { HermesReferenceAssetOwnershipError } = await import("../hermesMediaAdapter");
+    const job = buildHermesJob();
+    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
+    mockMintHermesMediaReferenceUrls.mockRejectedValue(new HermesReferenceAssetOwnershipError("1"));
+    const claimWorkerJob = vi.fn().mockResolvedValue({ job, queueDepth: 0 });
+    const app = await makeApp({ claimWorkerJob });
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post(`/api/workers/${WORKER_ID}/jobs/claim`)
+      .set("Authorization", `Bearer ${token}`)
+      .send({ maxJobs: 1, capabilityHints: ["hermes_media"] });
+
+    expect(res.status).toBe(404);
+    expect(res.body.error.code).toBe("hermes_reference_asset_not_found");
+  });
+});
+
+describe("POST /api/worker-jobs/:jobId/references/urls", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("code review FIX 3: rejects a non-hermes_media_* job id (404, matching the claim-enrichment/finalize gates)", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ jobType: "remotion_render_video", leaseOwnerToken: "lease-1" }));
+    const app = await makeApp();
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/references/urls")
+      .set("Authorization", `Bearer ${token}`)
+      .send({ leaseOwnerToken: "lease-1" });
+
+    expect(res.status).toBe(404);
+    expect(mockMintHermesMediaReferenceUrls).not.toHaveBeenCalled();
+  });
+
+  it("rejects a missing/stale lease token", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ leaseOwnerToken: "real-lease" }));
+    const app = await makeApp();
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/references/urls")
+      .set("Authorization", `Bearer ${token}`)
+      .send({ leaseOwnerToken: "wrong-lease" });
+
+    expect(res.status).toBe(409);
+  });
+
+  it("rejects an expired lease", async () => {
+    mockGetJobById.mockResolvedValue(
+      buildHermesJob({ leaseOwnerToken: "lease-1", leaseExpiresAt: new Date(Date.now() - 1000) }),
+    );
+    const app = await makeApp();
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/references/urls")
+      .set("Authorization", `Bearer ${token}`)
+      .send({ leaseOwnerToken: "lease-1" });
+
+    expect(res.status).toBe(409);
+  });
+
+  it("rejects jobs not in an active state (claimed/preparing/running/uploading)", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "completed", leaseOwnerToken: "lease-1" }));
+    const app = await makeApp();
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/references/urls")
+      .set("Authorization", `Bearer ${token}`)
+      .send({ leaseOwnerToken: "lease-1" });
+
+    expect(res.status).toBe(409);
+  });
+
+  it("returns re-minted URLs for an active lease", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "running", leaseOwnerToken: "lease-1" }));
+    mockExtractHermesJobReferenceAssetIds.mockReturnValue([{ assetId: "1" }]);
+    mockMintHermesMediaReferenceUrls.mockResolvedValue([
+      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
+    ]);
+    const app = await makeApp();
+    const token = await issueToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/references/urls")
+      .set("Authorization", `Bearer ${token}`)
+      .send({ leaseOwnerToken: "lease-1" });
+
+    expect(res.status).toBe(200);
+    expect(res.body.referenceUrls).toEqual([
+      { assetId: "1", url: "https://signed.example/1.png", expiresAt: "2026-06-01T12:15:00.000Z" },
+    ]);
+  });
+});
+
+describe("Hermes media finalize dispatch (artifacts/complete)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("dispatches finalizeHermesMediaArtifact for hermes_media_* job artifacts", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ status: "publishing" }));
+    mockFinalizeHermesMediaArtifact.mockResolvedValue({ mediaAssetId: "501", libraryItemId: "900" });
+    const app = await makeApp();
+    const token = await issueUploadToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/artifacts/complete")
+      .set("Authorization", `Bearer ${token}`)
+      .send({
+        artifactType: "output_image",
+        storageRef: "hermes-media/tenant-1/7/job-1/output.png",
+        checksumSha256: "a".repeat(64),
+        sizeBytes: 1024,
+        contentType: "image/png",
+        leaseOwnerToken: "lease-token-1",
+      });
+
+    expect(res.status).toBe(200);
+    expect(mockFinalizeHermesMediaArtifact).toHaveBeenCalledWith(
+      expect.objectContaining({ artifact: { id: "artifact-1" } }),
+    );
+  });
+
+  it("ignores non-hermes_media_* job artifacts (hyperframes finalize regression untouched)", async () => {
+    mockGetJobById.mockResolvedValue(buildHermesJob({ jobType: "remotion_render_video", status: "publishing" }));
+    const app = await makeApp();
+    const token = await issueUploadToken();
+
+    const res = await request(app)
+      .post("/api/worker-jobs/job-1/artifacts/complete")
+      .set("Authorization", `Bearer ${token}`)
+      .send({
+        artifactType: "output_video",
+        storageRef: "renders/tenant-1/job-1/output.mp4",
+        checksumSha256: "b".repeat(64),
+        sizeBytes: 2048,
+        contentType: "video/mp4",
+        leaseOwnerToken: "lease-token-1",
+      });
+
+    expect(res.status).toBe(200);
+    expect(mockFinalizeHermesMediaArtifact).not.toHaveBeenCalled();
+  });
+});
+
+describe("At-rest contract: no /url/i keys in the stored hermes job contract", () => {
+  it("the scheduler's persisted inputJson (assetId + sha256 only) never carries a URL-shaped key", async () => {
+    const { hermesMediaReferenceSchema } = await import("../../../shared/hermesMedia");
+    const shape = hermesMediaReferenceSchema.shape;
+    for (const key of Object.keys(shape)) {
+      expect(key).not.toMatch(/url/i);
+    }
+    // .strict() schema — an extra url-ish key must be a hard parse failure.
+    const parsed = hermesMediaReferenceSchema.safeParse({
+      assetId: "1",
+      index: 1,
+      role: "subject",
+      label: "Image 1",
+      sha256: "a".repeat(64),
+      url: "https://example.com/leak.png",
+    });
+    expect(parsed.success).toBe(false);
+  });
+});
diff --git a/apps/web/server/services/hermesConnectionJobs.ts b/apps/web/server/services/hermesConnectionJobs.ts
index cee8dec42..bd406630f 100644
--- a/apps/web/server/services/hermesConnectionJobs.ts
+++ b/apps/web/server/services/hermesConnectionJobs.ts
@@ -56,6 +56,8 @@ import {
   settleHermesConnectionFromControlJob,
   type HermesConnectionRepo,
 } from "./hermesConnectionService";
+import { reconcileHermesMediaJobFee } from "./hermesMediaAdapter";
+import { billingEnvelopeFromMetadata } from "./workerBillingService";
 
 // ────────────────────────────────────────────────────────────────────────
 // Constants
@@ -378,6 +380,32 @@ export async function onTerminalHermesMediaJob(
   deps: { repo?: HermesConnectionJobsRepo } = {},
 ): Promise<void> {
   const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
+
+  // Feature 135 section 06 — fee reconciliation runs for ANY terminal
+  // hermes_media_* status (completed or failure alike), unlike the
+  // connection-status side effect below which only cares about
+  // auth/entitlement failures. Shares ONE implementation with
+  // `reconcileTaskCredits`'s hermes branch (`server/routers/media.ts`) via
+  // `reconcileHermesMediaJobFee` — this is the callee for a job that
+  // reaches a terminal state via lease expiry and is never observed by a
+  // polling client (the sweep's `listTerminalUnsettledHermesJobs` driver).
+  // Redis idempotency (`credit:reconciled:<taskId>`) makes this safe even
+  // if the generic per-event worker billing reconciliation already ran for
+  // the same job's reservation.
+  if ((TERMINAL_STATUSES as ReadonlySet<string>).has(job.status)) {
+    const billing = billingEnvelopeFromMetadata(
+      (job.instructionsJson as Record<string, unknown> | null | undefined)?.workerBilling,
+    );
+    // Raw status, unmapped — `reconcileHermesMediaJobFee` classifies
+    // completed vs. failed/canceled/expired itself (and no-ops on anything
+    // non-terminal as a defense-in-depth guard).
+    try {
+      await reconcileHermesMediaJobFee({ taskId: `hermes_${job.id}`, status: job.status, billing });
+    } catch (error) {
+      debugError("hermesConnectionJobs", `Failed to reconcile hermes media fee for job ${job.id}`, error);
+    }
+  }
+
   if (!TERMINAL_FAILURE_STATUSES.has(job.status)) return;
 
   const connectionId = extractConnectionId(job);
diff --git a/apps/web/server/services/hermesMediaAdapter.ts b/apps/web/server/services/hermesMediaAdapter.ts
new file mode 100644
index 000000000..5f25e036e
--- /dev/null
+++ b/apps/web/server/services/hermesMediaAdapter.ts
@@ -0,0 +1,490 @@
+/**
+ * Feature 135 — Hermes Grok media worker: `hermesMedia` task projection,
+ * fee reconciliation, cancel, and claim-time reference-URL minting.
+ *
+ * Mirrors `mcpMediaAdapter.ts`'s public surface, but stores nothing new —
+ * every projection is built from the existing worker fabric tables
+ * (`worker_jobs`, `worker_artifacts`) via an injectable repo. Section 05
+ * (`hermesMediaScheduler.ts`) already owns job submission; this module is a
+ * pure read + narrow side-effect (cancel, fee refund, URL mint) layer on
+ * top of it.
+ *
+ * Namespace note: this is the `hermesMedia` / `hermes_media` namespace —
+ * see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`. This
+ * file must never reference the unrelated pre-existing agent-gateway
+ * Hermes lane's queueing helper or tenant runtime flag
+ * (`server/services/workerSchedulerService.ts`).
+ */
+import { and, eq } from "drizzle-orm";
+
+import { getDb } from "../db";
+import {
+  mediaAssets,
+  workerJobEvents,
+  workerJobs,
+  type WorkerJob,
+} from "../../drizzle/schema";
+import {
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+} from "../../shared/workerRuntime";
+import {
+  hermesErrorCopy,
+  parseHermesErrorMessage,
+  type HermesMediaErrorCode,
+  type HermesMediaJobContract,
+} from "../../shared/hermesMedia";
+import type { MediaTask, TaskStatus } from "./mediaGenerationService";
+import { storagePresignGet, storageResolveUrl } from "../storage";
+import { cancelQueuedUserWorkerJob } from "./workerJobMonitorService";
+import {
+  billingEnvelopeFromMetadata,
+  type WorkerJobBillingEnvelope,
+} from "./workerBillingService";
+import { refundReservation } from "./creditService";
+import { getCacheClient } from "./redisClients";
+import { debugError } from "../_core/logger";
+
+// ────────────────────────────────────────────────────────────────────────
+// Task id helpers
+// ────────────────────────────────────────────────────────────────────────
+
+const HERMES_TASK_ID_PREFIX = "hermes_";
+
+/** True for `hermes_<jobId>` with a non-empty remainder — false for the
+ *  bare `"hermes_"` string, `mcp_` ids, and any other transport's ids. */
+export function isHermesMediaTaskId(taskId: string): boolean {
+  return (
+    typeof taskId === "string" &&
+    taskId.startsWith(HERMES_TASK_ID_PREFIX) &&
+    taskId.length > HERMES_TASK_ID_PREFIX.length
+  );
+}
+
+export function hermesTaskIdToJobId(taskId: string): string {
+  return taskId.slice(HERMES_TASK_ID_PREFIX.length);
+}
+
+function isHermesMediaJobType(jobType: string): boolean {
+  return jobType === HERMES_MEDIA_IMAGE_JOB_TYPE || jobType === HERMES_MEDIA_VIDEO_JOB_TYPE;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Repo seam
+// ────────────────────────────────────────────────────────────────────────
+
+export interface HermesMediaAssetRow {
+  id: number;
+  storageKey: string;
+}
+
+export interface HermesMediaAdapterRepo {
+  getJobById(jobId: string): Promise<WorkerJob | null>;
+  /** Re-verifies tenant + owner at read/mint time — never trusts a cached id. */
+  getMediaAssetForOwner(params: {
+    id: number;
+    tenantId: string;
+    userId: number;
+  }): Promise<HermesMediaAssetRow | null>;
+  appendJobEvent(params: {
+    jobId: string;
+    eventType: string;
+    payloadJson: Record<string, unknown>;
+  }): Promise<void>;
+}
+
+export const defaultHermesMediaAdapterRepo: HermesMediaAdapterRepo = {
+  async getJobById(jobId) {
+    const db = getDb();
+    const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
+    return row ?? null;
+  },
+
+  async getMediaAssetForOwner({ id, tenantId, userId }) {
+    if (!Number.isFinite(id)) return null;
+    const db = getDb();
+    const [row] = await db
+      .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
+      .from(mediaAssets)
+      .where(
+        and(
+          eq(mediaAssets.id, id),
+          eq(mediaAssets.tenantId, tenantId),
+          eq(mediaAssets.userId, userId),
+        ),
+      )
+      .limit(1);
+    return row ?? null;
+  },
+
+  async appendJobEvent({ jobId, eventType, payloadJson }) {
+    const db = getDb();
+    await db.insert(workerJobEvents).values({ workerJobId: jobId, eventType, payloadJson });
+  },
+};
+
+// ────────────────────────────────────────────────────────────────────────
+// Status mapping
+// ────────────────────────────────────────────────────────────────────────
+
+const HERMES_CANCEL_REQUESTED_EVENT_TYPE = "hermes_media_cancel_requested";
+const HERMES_ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set([
+  "claimed",
+  "preparing",
+  "running",
+  "uploading",
+  "publishing",
+  "indexing",
+]);
+
+function deriveHermesTaskStatus(jobStatus: string): { status: TaskStatus; errorCode?: HermesMediaErrorCode } {
+  if (jobStatus === "queued" || jobStatus === "claimed" || jobStatus === "preparing") {
+    return { status: "pending" };
+  }
+  if (
+    jobStatus === "running" ||
+    jobStatus === "uploading" ||
+    jobStatus === "publishing" ||
+    jobStatus === "indexing"
+  ) {
+    return { status: "processing" };
+  }
+  if (jobStatus === "completed") return { status: "completed" };
+  if (jobStatus === "canceled") return { status: "failed", errorCode: "HERMES_JOB_CANCELLED" };
+  // failed | expired
+  return { status: "failed" };
+}
+
+function deriveHermesErrorMessage(
+  failureReason: string | null | undefined,
+  errorCodeOverride?: HermesMediaErrorCode,
+): string | undefined {
+  if (errorCodeOverride) return hermesErrorCopy(errorCodeOverride).th;
+  if (!failureReason) return undefined;
+  const parsedCode = parseHermesErrorMessage(failureReason);
+  if (parsedCode) return hermesErrorCopy(parsedCode).th;
+  // Never fabricate a message, but never surface raw stderr either — if the
+  // worker didn't follow the `[HERMES_X] ...` convention, fall back to the
+  // stored failureReason as-is (it is at minimum a human-authored string,
+  // never a stack trace, since only `recordWorkerJobEvent`'s sanitized
+  // payload ever reaches this column).
+  return failureReason;
+}
+
+async function resolveSignedUrl(
+  storageKey: string,
+  presign: typeof storagePresignGet,
+  expiresInSeconds = 3600,
+): Promise<string> {
+  const presigned = await presign(storageKey, expiresInSeconds);
+  if (presigned) return presigned.url;
+  const resolved = await storageResolveUrl(storageKey);
+  return resolved ?? `/api/storage/files/${storageKey}`;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// getHermesMediaTask
+// ────────────────────────────────────────────────────────────────────────
+
+export interface GetHermesMediaTaskDeps {
+  repo?: HermesMediaAdapterRepo;
+  presign?: typeof storagePresignGet;
+}
+
+export async function getHermesMediaTask(
+  taskId: string,
+  userId: number,
+  deps: GetHermesMediaTaskDeps = {},
+): Promise<MediaTask | null> {
+  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
+  const presign = deps.presign ?? storagePresignGet;
+
+  const jobId = hermesTaskIdToJobId(taskId);
+  const job = await repo.getJobById(jobId);
+  if (!job) return null;
+  // Ownership: never leak details about a job belonging to another user (or
+  // tenant — `requestedByUserId` is only ever set for the tenant that
+  // created it, so a mismatch here also catches a cross-tenant lookup).
+  if (job.requestedByUserId == null || job.requestedByUserId !== userId) return null;
+
+  const contract = (job.inputJson ?? {}) as Partial<HermesMediaJobContract>;
+  const mediaType: MediaTask["mediaType"] = job.jobType === HERMES_MEDIA_VIDEO_JOB_TYPE ? "video" : "image";
+  const { status, errorCode } = deriveHermesTaskStatus(job.status);
+  const workerBilling = billingEnvelopeFromMetadata(
+    (job.instructionsJson as Record<string, unknown> | null | undefined)?.workerBilling,
+  );
+
+  let resultUrl: string | undefined;
+  if (status === "completed") {
+    const outputJson = (job.outputJson ?? {}) as Record<string, unknown>;
+    const mediaAssetIdRaw = outputJson.mediaAssetId;
+    const mediaAssetId = typeof mediaAssetIdRaw === "string" || typeof mediaAssetIdRaw === "number"
+      ? Number(mediaAssetIdRaw)
+      : NaN;
+    if (Number.isFinite(mediaAssetId) && job.requestedByUserId != null) {
+      const asset = await repo.getMediaAssetForOwner({
+        id: mediaAssetId,
+        tenantId: job.tenantId,
+        userId: job.requestedByUserId,
+      });
+      if (asset?.storageKey) {
+        resultUrl = await resolveSignedUrl(asset.storageKey, presign);
+      }
+    }
+    // A "completed" job with no registered asset is a diagnosable state —
+    // `resultUrl` is intentionally left undefined rather than fabricated
+    // from an un-finalized artifact.
+  }
+
+  const errorMessage = status === "failed"
+    ? deriveHermesErrorMessage(job.failureReason, errorCode)
+    : undefined;
+
+  const capabilityRequirements = (job.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
+
+  const task: MediaTask = {
+    id: taskId,
+    taskId: job.id,
+    userId: String(userId),
+    mediaType,
+    status,
+    model: contract.settings?.model ?? "",
+    prompt: contract.prompt ?? "",
+    parameters: {
+      ...contract,
+      ...(workerBilling ? { workerBilling } : {}),
+    },
+    ...(resultUrl ? { resultUrl } : {}),
+    resultData: {
+      jobId: job.id,
+      jobType: job.jobType,
+      connectionId: typeof capabilityRequirements.connectionId === "string" ? capabilityRequirements.connectionId : undefined,
+    },
+    ...(errorMessage ? { errorMessage } : {}),
+    creditsUsed: workerBilling?.reservedCredits ?? 0,
+    createdAt: (job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt)).toISOString(),
+    ...(job.startedAt ? { startedAt: new Date(job.startedAt).toISOString() } : {}),
+    ...(job.finishedAt ? { completedAt: new Date(job.finishedAt).toISOString() } : {}),
+  };
+
+  return task;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// cancelHermesMediaTask
+// ────────────────────────────────────────────────────────────────────────
+
+export interface CancelHermesMediaTaskDeps {
+  repo?: HermesMediaAdapterRepo;
+  cancelQueuedJob?: typeof cancelQueuedUserWorkerJob;
+}
+
+export async function cancelHermesMediaTask(
+  taskId: string,
+  userId: number,
+  deps: CancelHermesMediaTaskDeps = {},
+): Promise<void> {
+  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
+  const cancelQueuedJob = deps.cancelQueuedJob ?? cancelQueuedUserWorkerJob;
+
+  const jobId = hermesTaskIdToJobId(taskId);
+  const job = await repo.getJobById(jobId);
+  if (!job || job.requestedByUserId == null || job.requestedByUserId !== userId) {
+    throw new Error(`Task ${taskId} not found`);
+  }
+
+  if (job.status === "queued") {
+    await cancelQueuedJob({ auth: { tenantId: job.tenantId, userId }, jobId });
+    return;
+  }
+
+  if (HERMES_ACTIVE_JOB_STATUSES.has(job.status)) {
+    // The worker-side graceful termination handler is section 07 — this
+    // just records the request so the worker (or a future sweep) can act on
+    // it. Never mutates job status directly here.
+    await repo.appendJobEvent({
+      jobId,
+      eventType: HERMES_CANCEL_REQUESTED_EVENT_TYPE,
+      payloadJson: {},
+    });
+    return;
+  }
+
+  // Already terminal — idempotent no-op.
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Fee reconciliation (shared by `reconcileTaskCredits` and the section-04
+// terminal sweep's `onTerminalHermesMediaJob` hook — ONE implementation).
+// ────────────────────────────────────────────────────────────────────────
+
+/** The only statuses this function ever acts on. Everything else (queued,
+ *  claimed, preparing, running, uploading, publishing, indexing — i.e. any
+ *  in-flight job) is a defense-in-depth no-op: this function must NEVER
+ *  refund (or otherwise touch) a reservation for a job that hasn't actually
+ *  reached a terminal state, no matter what a caller passes in. */
+const HERMES_FEE_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
+  "completed",
+  "failed",
+  "canceled",
+  "expired",
+]);
+
+export interface ReconcileHermesMediaJobFeeParams {
+  taskId: string;
+  /** Raw terminal `worker_jobs`/`MediaTask` status — pass it through
+   *  unmapped; this function does its own terminal-status classification
+   *  (see `HERMES_FEE_TERMINAL_STATUSES`) rather than trusting a caller's
+   *  pre-collapsed "completed" | "failed" mapping. */
+  status: string;
+  billing: WorkerJobBillingEnvelope | null;
+}
+
+export interface ReconcileHermesMediaJobFeeDeps {
+  getRedis?: () => { get(key: string): Promise<string | null>; set(...args: any[]): Promise<unknown> };
+  refundReservation?: typeof refundReservation;
+}
+
+export async function reconcileHermesMediaJobFee(
+  params: ReconcileHermesMediaJobFeeParams,
+  deps: ReconcileHermesMediaJobFeeDeps = {},
+): Promise<{ adjusted: boolean; difference: number; action: "refund" | "charge" | "none" }> {
+  const noOp = { adjusted: false, difference: 0, action: "none" as const };
+
+  // Internal terminal-status guard — a non-terminal (in-flight) status is
+  // always a no-op, regardless of what the caller passes.
+  if (!HERMES_FEE_TERMINAL_STATUSES.has(params.status)) return noOp;
+  if (!params.billing) return noOp;
+
+  const getRedis = deps.getRedis ?? (() => getCacheClient());
+  const refund = deps.refundReservation ?? refundReservation;
+  const reconcileKey = `credit:reconciled:${params.taskId}`;
+
+  try {
+    const redis = getRedis();
+    const alreadyReconciled = await redis.get(reconcileKey);
+    if (alreadyReconciled) return noOp;
+
+    if (params.status === "completed") {
+      await redis.set(
+        reconcileKey,
+        JSON.stringify({ action: "none", difference: 0, timestamp: Date.now() }),
+        "EX",
+        86400,
+      );
+      return noOp;
+    }
+
+    // failed | canceled | expired — refund the whole reserved fee, exactly
+    // once.
+    await refund(params.billing.reservationId);
+    const difference = -params.billing.reservedCredits;
+    await redis.set(
+      reconcileKey,
+      JSON.stringify({ action: "refund", difference, timestamp: Date.now() }),
+      "EX",
+      86400,
+    );
+    return { adjusted: true, difference, action: "refund" };
+  } catch (error) {
+    debugError("hermesMediaAdapter", "Fee reconciliation failed", error);
+    return noOp;
+  }
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Reference URL minting — shared by claim-time enrichment and the
+// `/api/worker-jobs/:jobId/references/urls` re-mint route (workerRuntime.ts).
+// ────────────────────────────────────────────────────────────────────────
+
+export class HermesReferenceAssetOwnershipError extends Error {
+  readonly assetId: string;
+
+  constructor(assetId: string) {
+    super(`Hermes media reference asset ${assetId} is not owned by the requester`);
+    this.name = "HermesReferenceAssetOwnershipError";
+    this.assetId = assetId;
+  }
+}
+
+export interface HermesReferenceUrlMintResult {
+  assetId: string;
+  url: string;
+  expiresAt: string;
+}
+
+const HERMES_REFERENCE_URL_TTL_SECONDS = 900;
+
+export interface MintHermesMediaReferenceUrlsParams {
+  tenantId: string;
+  requestedByUserId: number;
+  references: Array<{ assetId: string }>;
+  expiresInSeconds?: number;
+}
+
+export interface MintHermesMediaReferenceUrlsDeps {
+  repo?: HermesMediaAdapterRepo;
+  presign?: typeof storagePresignGet;
+  now?: () => Date;
+}
+
+/**
+ * Mints one short-lived signed GET URL per reference `assetId`,
+ * re-verifying tenant + requester ownership of the underlying `media_assets`
+ * row at mint time (never trusting a cached/prior check). A reference the
+ * requester no longer owns is a typed failure
+ * (`HermesReferenceAssetOwnershipError`), never a silent skip — the caller
+ * decides how to surface that (claim response vs. HTTP error).
+ */
+export async function mintHermesMediaReferenceUrls(
+  params: MintHermesMediaReferenceUrlsParams,
+  deps: MintHermesMediaReferenceUrlsDeps = {},
+): Promise<HermesReferenceUrlMintResult[]> {
+  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
+  const presign = deps.presign ?? storagePresignGet;
+  const now = deps.now ?? (() => new Date());
+  const expiresInSeconds = params.expiresInSeconds ?? HERMES_REFERENCE_URL_TTL_SECONDS;
+
+  const results: HermesReferenceUrlMintResult[] = [];
+  for (const reference of params.references) {
+    const assetId = Number(reference.assetId);
+    const asset = Number.isFinite(assetId)
+      ? await repo.getMediaAssetForOwner({
+          id: assetId,
+          tenantId: params.tenantId,
+          userId: params.requestedByUserId,
+        })
+      : null;
+    if (!asset) {
+      throw new HermesReferenceAssetOwnershipError(reference.assetId);
+    }
+    const url = await resolveSignedUrl(asset.storageKey, presign, expiresInSeconds);
+    results.push({
+      assetId: reference.assetId,
+      url,
+      expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
+    });
+  }
+  return results;
+}
+
+/** Extracts the `references[].assetId` list from a hermes media job's
+ *  frozen `inputJson` contract — pure/defensive (never throws on a
+ *  malformed row). Callers holding a loosely-typed `Record<string, any>`
+ *  job row (e.g. `claimWorkerJob`'s return in `server/routes/workerRuntime.ts`)
+ *  must cast to `WorkerJob` first — a `Record<string, any>` intersection
+ *  does not statically satisfy `Pick<WorkerJob, "inputJson">` even though
+ *  the runtime value has the field. */
+export function extractHermesJobReferenceAssetIds(job: Pick<WorkerJob, "inputJson">): Array<{ assetId: string }> {
+  const references = (job.inputJson as Record<string, unknown> | null | undefined)?.references;
+  if (!Array.isArray(references)) return [];
+  return references
+    .map((entry) => {
+      if (!entry || typeof entry !== "object") return null;
+      const assetId = (entry as Record<string, unknown>).assetId;
+      return typeof assetId === "string" && assetId.length > 0 ? { assetId } : null;
+    })
+    .filter((entry): entry is { assetId: string } => Boolean(entry));
+}
+
+export { isHermesMediaJobType };
diff --git a/apps/web/server/services/hermesMediaFinalizeService.ts b/apps/web/server/services/hermesMediaFinalizeService.ts
new file mode 100644
index 000000000..ab0869882
--- /dev/null
+++ b/apps/web/server/services/hermesMediaFinalizeService.ts
@@ -0,0 +1,446 @@
+/**
+ * Feature 135 — Hermes Grok media worker: artifact finalize.
+ *
+ * Model: `hyperframesLibraryFinalizeService.ts`. Invoked from the
+ * `/api/worker-jobs/:jobId/artifacts/complete` handler
+ * (`server/routes/workerRuntime.ts`) after
+ * `workerRegistryService.completeWorkerArtifact` has already moved the job
+ * to `publishing` — this service re-validates the uploaded object, runs the
+ * platform's content-safety gate, registers `media_assets` +
+ * `library_items`, stamps `worker_artifacts.publishedItemId`, and completes
+ * the job.
+ *
+ * Namespace note: this is the `hermesMedia` / `hermes_media` namespace —
+ * see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import crypto from "crypto";
+import fs from "fs";
+import path from "path";
+
+import { and, eq } from "drizzle-orm";
+
+import { getDb } from "../db";
+import {
+  libraryItems,
+  mediaAssets,
+  workerArtifacts,
+  workerJobs,
+  type WorkerArtifact,
+  type WorkerJob,
+} from "../../drizzle/schema";
+import { HERMES_MEDIA_VIDEO_JOB_TYPE } from "../../shared/workerRuntime";
+import { formatHermesErrorMessage, type HermesMediaErrorCode, type HermesMediaJobContract } from "../../shared/hermesMedia";
+import { createLibraryItem, type LibraryActor } from "./libraryService";
+import { generateSignedUrl } from "./mediaAssetService";
+import { getUploadsDir, storageStreamFile } from "../storage";
+import { isActiveContentUpload, isSvgUpload, sanitizeUploadedSvg } from "./uploadContentSafety";
+import { debugError } from "../_core/logger";
+
+// Strict Drizzle-inferred row types. Callers holding a loosely-typed
+// `Record<string, any>` row from `workerRegistryService.ts`'s own private
+// `WorkerJobRecord`/`WorkerArtifactRecord` conventions (e.g.
+// `completeWorkerArtifact`'s return in `server/routes/workerRuntime.ts`)
+// must cast to these types at the call site — an intersection with
+// `Record<string, any>` does not statically satisfy a target type that
+// declares a specific named property, even though the runtime shape
+// matches.
+type WorkerJobRecord = WorkerJob;
+type WorkerArtifactRecord = WorkerArtifact;
+
+// ────────────────────────────────────────────────────────────────────────
+// Errors
+// ────────────────────────────────────────────────────────────────────────
+
+export class HermesMediaFinalizeError extends Error {
+  readonly code: HermesMediaErrorCode;
+  readonly reason?: string;
+
+  constructor(code: HermesMediaErrorCode, reason?: string) {
+    super(formatHermesErrorMessage(code, reason));
+    this.name = "HermesMediaFinalizeError";
+    this.code = code;
+    this.reason = reason;
+  }
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Injectable seams
+// ────────────────────────────────────────────────────────────────────────
+
+export interface HermesMediaFinalizeRepo {
+  insertMediaAsset(values: Record<string, unknown>): Promise<{ id: number; storageKey: string }>;
+  updateArtifact(artifactId: string, values: Record<string, unknown>): Promise<void>;
+  updateJob(jobId: string, values: Record<string, unknown>): Promise<void>;
+}
+
+export const defaultHermesMediaFinalizeRepo: HermesMediaFinalizeRepo = {
+  async insertMediaAsset(values) {
+    const db = getDb();
+    const [row] = await db
+      .insert(mediaAssets)
+      .values(values as any)
+      .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey });
+    return row;
+  },
+
+  async updateArtifact(artifactId, values) {
+    const db = getDb();
+    await db.update(workerArtifacts).set(values as any).where(eq(workerArtifacts.id, artifactId));
+  },
+
+  async updateJob(jobId, values) {
+    const db = getDb();
+    await db.update(workerJobs).set(values as any).where(eq(workerJobs.id, jobId));
+  },
+};
+
+export interface HermesStoredObjectVerification {
+  valid: boolean;
+  reason?: string;
+}
+
+export interface VerifyHermesStoredObjectParams {
+  storageRef: string;
+  expectedChecksumSha256: string;
+  expectedSizeBytes: number;
+  expectedContentType?: string | null;
+}
+
+async function readStoredObjectBytes(storageRef: string): Promise<Buffer | null> {
+  const streamed = await storageStreamFile(storageRef).catch(() => null);
+  if (streamed) {
+    const chunks: Buffer[] = [];
+    const stream = streamed.stream as NodeJS.ReadableStream;
+    await new Promise<void>((resolve, reject) => {
+      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
+      stream.on("end", () => resolve());
+      stream.on("error", reject);
+    });
+    return Buffer.concat(chunks);
+  }
+  const filePath = path.join(getUploadsDir(), storageRef);
+  if (!fs.existsSync(filePath)) return null;
+  return fs.promises.readFile(filePath);
+}
+
+export async function defaultVerifyHermesStoredObject(
+  params: VerifyHermesStoredObjectParams,
+): Promise<HermesStoredObjectVerification> {
+  const buffer = await readStoredObjectBytes(params.storageRef).catch(() => null);
+  if (!buffer) return { valid: false, reason: "stored_object_unreadable" };
+  const actualChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
+  if (params.expectedChecksumSha256 && actualChecksum !== params.expectedChecksumSha256) {
+    return { valid: false, reason: "checksum_mismatch" };
+  }
+  if (params.expectedSizeBytes && buffer.length !== params.expectedSizeBytes) {
+    return { valid: false, reason: "size_mismatch" };
+  }
+  return { valid: true };
+}
+
+export interface HermesContentSafetyGateParams {
+  storageRef: string;
+  contentType: string;
+}
+
+export interface HermesContentSafetyGateResult {
+  safe: boolean;
+  reason?: string;
+}
+
+/**
+ * Reuses the platform's existing content-safety primitives
+ * (`server/services/uploadContentSafety.ts` — spec §16) rather than
+ * re-implementing format validation: blocks active-content uploads (HTML
+ * disguised with a media content-type/extension) and rejects unsafe SVG.
+ * Injectable so tests can stub pass/fail without touching real storage.
+ */
+export async function defaultHermesContentSafetyGate(
+  params: HermesContentSafetyGateParams,
+): Promise<HermesContentSafetyGateResult> {
+  const extension = path.extname(params.storageRef);
+  if (isActiveContentUpload(params.contentType, extension)) {
+    return { safe: false, reason: "active_content_upload_blocked" };
+  }
+  if (isSvgUpload(params.contentType, extension)) {
+    const buffer = await readStoredObjectBytes(params.storageRef).catch(() => null);
+    if (!buffer) return { safe: false, reason: "stored_object_unreadable" };
+    const result = sanitizeUploadedSvg(buffer);
+    if (!result.safe) return { safe: false, reason: result.reason ?? "unsafe_svg" };
+  }
+  return { safe: true };
+}
+
+export interface ResolveHermesLibraryFolderOwnerParams {
+  folderId: number;
+  tenantId: string;
+  userId: number;
+}
+
+/**
+ * Code review fix — `contract.storage.libraryFolderId` is a user-supplied
+ * value carried in the (worker-writable, but originally client-submitted)
+ * job contract; a malicious/buggy value must never let a finalize publish
+ * into a `library_items` folder the requester doesn't own. Returns `true`
+ * only when the folder row exists AND belongs to this exact tenant + owner.
+ * A missing folder and a foreign folder are deliberately indistinguishable
+ * to the caller (both resolve to `false` → publish to root instead).
+ */
+export async function defaultResolveHermesLibraryFolderOwner(
+  params: ResolveHermesLibraryFolderOwnerParams,
+): Promise<boolean> {
+  const db = getDb();
+  const [row] = await db
+    .select({ id: libraryItems.id })
+    .from(libraryItems)
+    .where(
+      and(
+        eq(libraryItems.id, params.folderId),
+        eq(libraryItems.tenantId, params.tenantId),
+        eq(libraryItems.ownerUserId, params.userId),
+      ),
+    )
+    .limit(1);
+  return Boolean(row);
+}
+
+export interface HermesMediaFinalizeDeps {
+  repo?: HermesMediaFinalizeRepo;
+  now?: () => Date;
+  verifyStoredObject?: (params: VerifyHermesStoredObjectParams) => Promise<HermesStoredObjectVerification>;
+  contentSafetyGate?: (params: HermesContentSafetyGateParams) => Promise<HermesContentSafetyGateResult>;
+  createLibraryItem?: typeof createLibraryItem;
+  resolveStorageUrl?: (storageKey: string) => Promise<string | null>;
+  /** Injectable folder-ownership check (code review fix) — defaults to a
+   *  real `library_items` lookup. */
+  resolveLibraryFolderOwner?: (params: ResolveHermesLibraryFolderOwnerParams) => Promise<boolean>;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Helpers
+// ────────────────────────────────────────────────────────────────────────
+
+function readMetadataRecord(value: unknown): Record<string, unknown> {
+  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
+}
+
+function readMetadataString(value: unknown, key: string): string | null {
+  const record = readMetadataRecord(value);
+  const raw = record[key];
+  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
+}
+
+function readDimensions(metadata: Record<string, unknown>): { width?: number; height?: number } {
+  const width = Number(metadata.width);
+  const height = Number(metadata.height);
+  return {
+    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
+    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
+  };
+}
+
+function parseLibraryFolderId(value: string | undefined): number | null {
+  if (!value) return null;
+  const parsed = Number(value);
+  return Number.isFinite(parsed) ? parsed : null;
+}
+
+async function failFinalizeJob(
+  repo: HermesMediaFinalizeRepo,
+  job: WorkerJobRecord,
+  code: HermesMediaErrorCode,
+  reason?: string,
+): Promise<void> {
+  await repo.updateJob(job.id, {
+    status: "failed",
+    failureReason: formatHermesErrorMessage(code, reason),
+    finishedAt: new Date(),
+  });
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// finalizeHermesMediaArtifact
+// ────────────────────────────────────────────────────────────────────────
+
+export async function finalizeHermesMediaArtifact(
+  params: { job: WorkerJobRecord; artifact: WorkerArtifactRecord },
+  deps: HermesMediaFinalizeDeps = {},
+): Promise<{ mediaAssetId: string; libraryItemId: string }> {
+  const repo = deps.repo ?? defaultHermesMediaFinalizeRepo;
+  const now = deps.now ?? (() => new Date());
+  const verifyStoredObject = deps.verifyStoredObject ?? defaultVerifyHermesStoredObject;
+  const contentSafetyGate = deps.contentSafetyGate ?? defaultHermesContentSafetyGate;
+  const createLibraryItemFn = deps.createLibraryItem ?? createLibraryItem;
+  const resolveStorageUrl = deps.resolveStorageUrl ?? ((key: string) => generateSignedUrl(key));
+  const resolveLibraryFolderOwner = deps.resolveLibraryFolderOwner ?? defaultResolveHermesLibraryFolderOwner;
+
+  const { job, artifact } = params;
+  const metadata = readMetadataRecord(artifact.metadataJson);
+
+  // Idempotency — a prior finalize attempt already fully registered this
+  // artifact (artifact row itself was stamped).
+  const existingMediaAssetId = readMetadataString(artifact.metadataJson, "mediaAssetId");
+  if (artifact.publishedItemId != null && existingMediaAssetId) {
+    return { mediaAssetId: existingMediaAssetId, libraryItemId: String(artifact.publishedItemId) };
+  }
+
+  const checksumSha256 = readMetadataString(artifact.metadataJson, "checksumSha256") ?? "";
+  const contentType = readMetadataString(artifact.metadataJson, "contentType") ?? "application/octet-stream";
+  const sizeBytesRaw = Number(metadata.sizeBytes);
+  const sizeBytes = Number.isFinite(sizeBytesRaw) ? sizeBytesRaw : 0;
+
+  const verification = await verifyStoredObject({
+    storageRef: artifact.storageRef,
+    expectedChecksumSha256: checksumSha256,
+    expectedSizeBytes: sizeBytes,
+    expectedContentType: contentType,
+  });
+  if (!verification.valid) {
+    await failFinalizeJob(repo, job, "HERMES_OUTPUT_INVALID", verification.reason);
+    throw new HermesMediaFinalizeError("HERMES_OUTPUT_INVALID", verification.reason);
+  }
+
+  const safety = await contentSafetyGate({ storageRef: artifact.storageRef, contentType });
+  if (!safety.safe) {
+    await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", safety.reason);
+    throw new HermesMediaFinalizeError("HERMES_LIBRARY_REGISTRATION_FAILED", safety.reason);
+  }
+
+  if (!job.requestedByUserId) {
+    await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", "missing_requester");
+    throw new HermesMediaFinalizeError("HERMES_LIBRARY_REGISTRATION_FAILED", "missing_requester");
+  }
+
+  const contract = (job.inputJson ?? {}) as Partial<HermesMediaJobContract>;
+  const dimensions = readDimensions(metadata);
+  const jobOutputJson: Record<string, unknown> =
+    job.outputJson && typeof job.outputJson === "object" ? (job.outputJson as Record<string, unknown>) : {};
+
+  // Code review fix — the publish phase (insert media_assets → resolve URL
+  // → create library item → stamp artifact → complete job) previously had
+  // no error handling: any exception left the job stuck in `publishing`
+  // forever (non-terminal — the sweep never fee-reconciles it, and a
+  // polling client sees "processing" indefinitely), and a retry would
+  // insert a SECOND `media_assets` row since `publishedItemId` was never
+  // stamped. Now: (1) the whole phase is wrapped so ANY exception fails the
+  // job with a typed reason and rethrows for the route's log; (2) the new
+  // `media_assets` id is checkpointed into `job.outputJson.mediaAssetId`
+  // immediately after insertion (job stays `publishing`) so an interrupted
+  // retry reuses that row instead of inserting a duplicate.
+  try {
+    const checkpointedMediaAssetId = readMetadataString(jobOutputJson, "mediaAssetId");
+    let mediaAssetId: string;
+    let assetStorageKey: string;
+    if (checkpointedMediaAssetId) {
+      // Recovery path — a prior attempt already inserted the media_assets
+      // row (and checkpointed it) but was interrupted before completing the
+      // rest of the publish phase. Reuse it; never insert a duplicate.
+      mediaAssetId = checkpointedMediaAssetId;
+      assetStorageKey = artifact.storageRef;
+    } else {
+      const insertedAsset = await repo.insertMediaAsset({
+        tenantId: job.tenantId,
+        userId: job.requestedByUserId,
+        sourceType: "hermes_media",
+        status: "ready",
+        storageKey: artifact.storageRef,
+        mimeType: contentType,
+        ...(sizeBytes ? { fileSize: sizeBytes } : {}),
+        ...(checksumSha256 ? { checksumSha256 } : {}),
+        ...dimensions,
+      });
+      mediaAssetId = String(insertedAsset.id);
+      assetStorageKey = insertedAsset.storageKey;
+
+      // Checkpoint — job remains `publishing`; only `outputJson` changes.
+      await repo.updateJob(job.id, {
+        outputJson: { ...jobOutputJson, mediaAssetId },
+      });
+    }
+
+    const sourceUrl = await resolveStorageUrl(assetStorageKey);
+    const mediaKind = job.jobType === HERMES_MEDIA_VIDEO_JOB_TYPE ? "video" : "image";
+    const capabilityRequirements = (job.capabilityRequirementsJson ?? {}) as Record<string, unknown>;
+
+    // Code review fix — never trust the user-supplied
+    // `contract.storage.libraryFolderId` at face value: validate it belongs
+    // to this exact tenant + requester before using it as `parentId`. A
+    // missing or foreign folder silently defaults to root (never publishes
+    // into someone else's folder) and is recorded as a lineage note.
+    const requestedFolderId = parseLibraryFolderId(contract.storage?.libraryFolderId);
+    let parentId: number | null = null;
+    let libraryFolderNote: string | undefined;
+    if (requestedFolderId != null) {
+      const owned = await resolveLibraryFolderOwner({
+        folderId: requestedFolderId,
+        tenantId: job.tenantId,
+        userId: job.requestedByUserId,
+      });
+      if (owned) {
+        parentId = requestedFolderId;
+      } else {
+        libraryFolderNote = "requested_library_folder_not_owned_by_requester";
+      }
+    }
+
+    const libraryResult = await createLibraryItemFn(
+      {
+        itemType: mediaKind,
+        source: "hermes_media",
+        title: contract.prompt ? contract.prompt.slice(0, 120) : "Hermes generated media",
+        status: "ready",
+        visibility: "private",
+        sourceUrl,
+        parentId,
+        metadata: {
+          operation: contract.operation,
+          prompt: contract.prompt,
+          model: contract.settings?.model,
+          referenceAssetIds: (contract.references ?? []).map((reference) => reference.assetId),
+          workerJobId: job.id,
+          hermesVersion: typeof capabilityRequirements.hermesVersion === "string" ? capabilityRequirements.hermesVersion : undefined,
+          connectionId: typeof capabilityRequirements.connectionId === "string" ? capabilityRequirements.connectionId : undefined,
+          ...(requestedFolderId != null ? { requestedLibraryFolderId: String(requestedFolderId) } : {}),
+          ...(libraryFolderNote ? { libraryFolderNote } : {}),
+        },
+        sourceLink: {
+          linkType: "hermes_media_worker_artifact",
+          linkId: `${job.id}:${artifact.id}`,
+        },
+      },
+      { userId: job.requestedByUserId, tenantId: job.tenantId } as LibraryActor,
+    );
+
+    const libraryItemId = String((libraryResult.item as { id: string | number }).id);
+
+    await repo.updateArtifact(artifact.id, {
+      publishedItemId: Number(libraryItemId),
+      metadataJson: { ...metadata, mediaAssetId },
+    });
+
+    await repo.updateJob(job.id, {
+      status: "completed",
+      finishedAt: now(),
+      outputJson: {
+        ...jobOutputJson,
+        mediaAssetId,
+        libraryItemId,
+        hermesFinalized: true,
+      },
+    });
+
+    return { mediaAssetId, libraryItemId };
+  } catch (error) {
+    const reason = error instanceof Error ? error.message : "publish_phase_failed";
+    try {
+      await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", reason);
+    } catch (failError) {
+      debugError(
+        "hermesMediaFinalizeService",
+        `Failed to mark job ${job.id} failed after a publish-phase error`,
+        failError,
+      );
+    }
+    throw error;
+  }
+}
diff --git a/apps/web/server/services/mediaGenerationService.ts b/apps/web/server/services/mediaGenerationService.ts
index 97b252be1..474310090 100644
--- a/apps/web/server/services/mediaGenerationService.ts
+++ b/apps/web/server/services/mediaGenerationService.ts
@@ -41,6 +41,7 @@ import {
 } from "./enabledMediaModelSelection";
 import { resolveMediaTransport } from "./mediaTransportResolver";
 import { getMcpMediaTask, submitMcpMediaGeneration } from "./mcpMediaAdapter";
+import { getHermesMediaTask, isHermesMediaTaskId } from "./hermesMediaAdapter";
 import { normalizeMcpProviderModelIdForProvider } from "./mcpProviderModelAliases";
 import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
 import type {
@@ -1262,6 +1263,9 @@ const PERSISTED_INTERNAL_EXTRA_PARAM_KEYS = new Set([
   "__vd_series_id",
   "__vd_episode_id",
   "__vd_character_id",
+  "__vd_portrait_candidate_batch_id",
+  "__vd_portrait_candidate_id",
+  "__vd_portrait_candidate_asset_link_id",
   // Vertical Drama shot/image provenance tags (2026-07-06) — additive
   // bookkeeping only, not provider-facing. They are read by project-scoped
   // history/recovery paths and never sent as provider prompt semantics.
@@ -2783,6 +2787,31 @@ export class MediaGenerationService {
       },
     });
 
+    if (isHermesMediaTaskId(taskId)) {
+      const userId = typeof auditContext?.userId === "number" ? auditContext.userId : null;
+      if (!userId) {
+        throw new Error("Hermes media task polling requires authenticated user context");
+      }
+      const task = await getHermesMediaTask(taskId, userId);
+      if (!task) {
+        throw new Error(`Task ${taskId} not found`);
+      }
+      auditLogger.log({
+        traceId: typeof auditContext?.traceId === "string" ? auditContext.traceId : undefined,
+        eventType: "media_response",
+        userId,
+        requestType: "getTask",
+        mediaTaskId: taskId,
+        statusCode: 200,
+        responsePayload: {
+          transport: "hermes_worker",
+          status: task.status,
+          mediaType: task.mediaType,
+        },
+      });
+      return task;
+    }
+
     if (taskId.startsWith("mcp_")) {
       const userId = typeof auditContext?.userId === "number" ? auditContext.userId : null;
       if (!userId) {
