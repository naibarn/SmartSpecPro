diff --git a/apps/web/server/_core/env.ts b/apps/web/server/_core/env.ts
index 9d7b776..b699e3d 100644
--- a/apps/web/server/_core/env.ts
+++ b/apps/web/server/_core/env.ts
@@ -38,4 +38,11 @@ export const ENV = {
     process.env.PYTHON_BACKEND_URL ??
     process.env.VITE_PYTHON_BACKEND_URL ??
     "",
+
+  // OpenSandbox integration
+  opensandboxEnabled: process.env.OPENSANDBOX_ENABLED === "true",
+  opensandboxDispatchMode: process.env.OPENSANDBOX_DISPATCH_MODE ?? "optional",
+  sandboxDefaultProfile: process.env.SANDBOX_DEFAULT_PROFILE ?? "code-default",
+  sandboxRequireForSkills: process.env.SANDBOX_REQUIRE_FOR_SKILLS === "true",
+  sandboxRequireForMedia: process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true",
 };
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 18a2df6..7043cb1 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -65,6 +65,7 @@ import { funnelAnalyticsRouter } from "./routers/funnelAnalytics";
 import { infrastructureRouter } from "./routers/infrastructure";
 import { presentationRouter } from "./routers/presentation";
 import { presentationImportRouter } from "./routers/presentationImport";
+import { sandboxRouter } from "./routers/sandbox";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1427,6 +1428,9 @@ export const appRouter = router({
   // Approval Gate operations (proxies to Python backend)
   approvals: approvalsRouter,
 
+  // OpenSandbox integration
+  sandbox: sandboxRouter,
+
   // AI helpers (streaming chat is served via /api/llm/stream; this router is for uploads)
   ai: router({
     upload: protectedProcedure
diff --git a/apps/web/server/routers/__tests__/sandbox.test.ts b/apps/web/server/routers/__tests__/sandbox.test.ts
new file mode 100644
index 0000000..cd32b1e
--- /dev/null
+++ b/apps/web/server/routers/__tests__/sandbox.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock tRPC to extract handler functions
+vi.mock("../../_core/trpc", () => {
+  const createProcedure = () => {
+    const proc: any = {
+      query: (fn: Function) => fn,
+      mutation: (fn: Function) => fn,
+      input: () => proc,
+    };
+    return proc;
+  };
+
+  return {
+    router: (routes: any) => routes,
+    protectedProcedure: createProcedure(),
+    adminProcedure: createProcedure(),
+  };
+});
+
+const { mockDispatchToSandbox, mockShouldUseSandbox } = vi.hoisted(() => ({
+  mockDispatchToSandbox: vi.fn(),
+  mockShouldUseSandbox: vi.fn(),
+}));
+
+vi.mock("../../services/sandbox/dispatchService", () => ({
+  dispatchToSandbox: mockDispatchToSandbox,
+  shouldUseSandbox: mockShouldUseSandbox,
+}));
+
+vi.mock("../../services/sandbox/policyResolver", () => ({
+  checkTenantPolicy: vi.fn().mockResolvedValue({ allowed: true }),
+  resolveProfile: vi.fn().mockResolvedValue(null),
+}));
+
+vi.mock("../../services/sandbox/statusProjection", () => ({
+  projectStatus: vi.fn().mockReturnValue({
+    label: "Queued",
+    phase: "pending",
+    isTerminal: false,
+  }),
+}));
+
+vi.mock("../../services/sandbox/costEstimator", () => ({
+  estimateCost: vi.fn().mockReturnValue(5),
+  reserveCredits: vi.fn().mockResolvedValue({ transactionId: 1 }),
+  refundReservedCredits: vi.fn().mockResolvedValue(undefined),
+}));
+
+vi.mock("../../services/sandbox/artifactAccess", () => ({
+  getArtifactUrl: vi.fn().mockResolvedValue(null),
+  getJobArtifactUrls: vi.fn().mockResolvedValue([]),
+}));
+
+vi.mock("../../db", () => ({
+  db: { select: vi.fn() },
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  sandboxJobs: {
+    id: "id",
+    tenantId: "tenantId",
+    userId: "userId",
+    status: "status",
+    featureType: "featureType",
+    createdAt: "createdAt",
+  },
+  sandboxProfiles: {
+    id: "id",
+    slug: "slug",
+    isActive: "isActive",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn(),
+  and: vi.fn(),
+  desc: vi.fn(),
+  inArray: vi.fn(),
+}));
+
+import { sandboxRouter } from "../sandbox";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("sandboxRouter", () => {
+  it("exports all required procedures", () => {
+    expect(sandboxRouter).toBeDefined();
+    expect(sandboxRouter.createJob).toBeDefined();
+    expect(sandboxRouter.getJobStatus).toBeDefined();
+    expect(sandboxRouter.cancelJob).toBeDefined();
+    expect(sandboxRouter.getJobTranscript).toBeDefined();
+    expect(sandboxRouter.listJobs).toBeDefined();
+    expect(sandboxRouter.getProfiles).toBeDefined();
+  });
+});
diff --git a/apps/web/server/routers/sandbox.ts b/apps/web/server/routers/sandbox.ts
new file mode 100644
index 0000000..17ee660
--- /dev/null
+++ b/apps/web/server/routers/sandbox.ts
@@ -0,0 +1,309 @@
+/**
+ * tRPC sandbox router -- exposes sandbox operations to the frontend.
+ */
+
+import { z } from "zod";
+import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
+import { TRPCError } from "@trpc/server";
+import { db } from "../db";
+import {
+  sandboxJobs,
+  sandboxProfiles,
+} from "../../drizzle/schema";
+import { eq, and, desc, inArray } from "drizzle-orm";
+import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
+import { checkTenantPolicy, resolveProfile } from "../services/sandbox/policyResolver";
+import { projectStatus, type SandboxInternalStatus } from "../services/sandbox/statusProjection";
+import { estimateCost, reserveCredits, refundReservedCredits } from "../services/sandbox/costEstimator";
+import { getArtifactUrl, getJobArtifactUrls } from "../services/sandbox/artifactAccess";
+
+export const sandboxRouter = router({
+  /**
+   * Create a new sandbox job.
+   */
+  createJob: protectedProcedure
+    .input(
+      z.object({
+        featureType: z.enum([
+          "chat", "skill", "workflow", "library", "media", "presentation", "connector",
+        ]),
+        executionMode: z.enum([
+          "sandbox-code", "sandbox-command", "sandbox-browser", "sandbox-file", "sandbox-media",
+        ]),
+        inputFiles: z
+          .array(
+            z.object({
+              key: z.string(),
+              mimeType: z.string(),
+              sizeBytes: z.number(),
+            }),
+          )
+          .default([]),
+        profileOverride: z.string().optional(),
+        idempotencyKey: z.string().optional(),
+      }),
+    )
+    .mutation(async ({ input, ctx }) => {
+      if (!ctx.tenantId) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
+      }
+
+      if (!shouldUseSandbox(input.executionMode)) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "Sandbox execution is not enabled",
+        });
+      }
+
+      // Check tenant policy
+      const policy = await checkTenantPolicy(ctx.tenantId);
+      if (!policy.allowed) {
+        throw new TRPCError({
+          code: "TOO_MANY_REQUESTS",
+          message: policy.reason ?? "Sandbox limit reached",
+        });
+      }
+
+      // Resolve profile and estimate cost
+      const profile = await resolveProfile(input.featureType, ctx.tenantId);
+      const estimated = profile
+        ? estimateCost({
+            cpuLimit: profile.cpuLimit,
+            memoryLimitMb: profile.memoryLimitMb,
+            timeoutSeconds: profile.timeoutSeconds,
+          })
+        : 5; // minimal default
+
+      // Reserve credits
+      await reserveCredits({
+        userId: ctx.user!.id,
+        estimatedCost: estimated,
+        jobId: input.idempotencyKey ?? `pre-${Date.now()}`,
+        tenantId: ctx.tenantId,
+      });
+
+      // Dispatch to Python backend
+      const result = await dispatchToSandbox({
+        featureType: input.featureType,
+        executionMode: input.executionMode,
+        tenantId: ctx.tenantId,
+        userId: ctx.user!.id,
+        inputFiles: input.inputFiles,
+        profileOverride: input.profileOverride,
+        idempotencyKey: input.idempotencyKey,
+      });
+
+      return { jobId: result.jobId };
+    }),
+
+  /**
+   * Get current status of a sandbox job.
+   */
+  getJobStatus: protectedProcedure
+    .input(z.object({ jobId: z.string() }))
+    .query(async ({ input, ctx }) => {
+      const rows = await db
+        .select()
+        .from(sandboxJobs)
+        .where(eq(sandboxJobs.id, input.jobId))
+        .limit(1);
+
+      if (rows.length === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      const job = rows[0];
+
+      // Verify ownership or admin
+      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      const projection = projectStatus(job.status as SandboxInternalStatus);
+
+      let artifacts;
+      if (projection.isTerminal && job.status === "completed" && ctx.tenantId) {
+        artifacts = await getJobArtifactUrls({
+          jobId: job.id,
+          tenantId: ctx.tenantId,
+        });
+      }
+
+      return {
+        jobId: job.id,
+        status: job.status,
+        label: projection.label,
+        phase: projection.phase,
+        isTerminal: projection.isTerminal,
+        featureType: job.featureType,
+        startedAt: job.startedAt,
+        finishedAt: job.finishedAt,
+        artifacts,
+      };
+    }),
+
+  /**
+   * Cancel a running or queued sandbox job.
+   */
+  cancelJob: protectedProcedure
+    .input(z.object({ jobId: z.string() }))
+    .mutation(async ({ input, ctx }) => {
+      const rows = await db
+        .select()
+        .from(sandboxJobs)
+        .where(eq(sandboxJobs.id, input.jobId))
+        .limit(1);
+
+      if (rows.length === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      const job = rows[0];
+
+      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      const projection = projectStatus(job.status as SandboxInternalStatus);
+      if (projection.isTerminal) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "Cannot cancel a job that is already in a terminal state",
+        });
+      }
+
+      // Send cancel to Python backend
+      const baseUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
+      await fetch(`${baseUrl}/api/internal/sandbox/cancel/${input.jobId}`, {
+        method: "POST",
+        headers: { "Content-Type": "application/json" },
+      });
+
+      // Refund reserved credits
+      if (job.costEstimate) {
+        await refundReservedCredits({
+          userId: job.userId,
+          jobId: job.id,
+          reservedAmount: parseFloat(job.costEstimate),
+        });
+      }
+
+      return { success: true };
+    }),
+
+  /**
+   * Fetch execution transcript (stdout/stderr excerpts).
+   */
+  getJobTranscript: protectedProcedure
+    .input(z.object({ jobId: z.string() }))
+    .query(async ({ input, ctx }) => {
+      const rows = await db
+        .select()
+        .from(sandboxJobs)
+        .where(eq(sandboxJobs.id, input.jobId))
+        .limit(1);
+
+      if (rows.length === 0) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      const job = rows[0];
+
+      if (job.tenantId !== ctx.tenantId && ctx.user?.role !== "admin") {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Sandbox job not found" });
+      }
+
+      return {
+        stdout: job.stdoutExcerpt ?? "",
+        stderr: job.stderrExcerpt ?? "",
+      };
+    }),
+
+  /**
+   * List sandbox jobs with filters.
+   */
+  listJobs: protectedProcedure
+    .input(
+      z.object({
+        status: z
+          .enum([
+            "accepted", "policy_resolved", "queued", "provisioning",
+            "staging_inputs", "executing", "collecting_outputs", "persisting",
+            "completed", "failed", "timed_out", "canceled",
+          ])
+          .optional(),
+        featureType: z
+          .enum([
+            "chat", "skill", "workflow", "library", "media", "presentation", "connector",
+          ])
+          .optional(),
+        limit: z.number().min(1).max(100).default(50),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ input, ctx }) => {
+      const conditions = [];
+
+      // Non-admin: filter by tenant
+      if (ctx.user?.role !== "admin") {
+        if (!ctx.tenantId) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
+        }
+        conditions.push(eq(sandboxJobs.tenantId, ctx.tenantId));
+      }
+
+      if (input.status) {
+        conditions.push(eq(sandboxJobs.status, input.status));
+      }
+      if (input.featureType) {
+        conditions.push(eq(sandboxJobs.featureType, input.featureType));
+      }
+
+      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
+
+      const rows = await db
+        .select()
+        .from(sandboxJobs)
+        .where(whereClause)
+        .orderBy(desc(sandboxJobs.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      return rows.map((job) => {
+        const projection = projectStatus(job.status as SandboxInternalStatus);
+        return {
+          jobId: job.id,
+          status: job.status,
+          label: projection.label,
+          phase: projection.phase,
+          isTerminal: projection.isTerminal,
+          featureType: job.featureType,
+          userId: job.userId,
+          tenantId: job.tenantId,
+          createdAt: job.createdAt,
+          startedAt: job.startedAt,
+          finishedAt: job.finishedAt,
+        };
+      });
+    }),
+
+  /**
+   * List available sandbox profiles.
+   */
+  getProfiles: protectedProcedure.query(async () => {
+    const rows = await db
+      .select({
+        slug: sandboxProfiles.slug,
+        name: sandboxProfiles.name,
+        description: sandboxProfiles.description,
+        executionMode: sandboxProfiles.executionMode,
+        cpuLimit: sandboxProfiles.cpuLimit,
+        memoryLimitMb: sandboxProfiles.memoryLimitMb,
+        timeoutSeconds: sandboxProfiles.timeoutSeconds,
+      })
+      .from(sandboxProfiles)
+      .where(eq(sandboxProfiles.isActive, true));
+
+    return rows;
+  }),
+});
diff --git a/apps/web/server/services/sandbox/__tests__/artifactAccess.test.ts b/apps/web/server/services/sandbox/__tests__/artifactAccess.test.ts
new file mode 100644
index 0000000..44e62e8
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/artifactAccess.test.ts
@@ -0,0 +1,109 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockStoragePresignGet } = vi.hoisted(() => ({
+  mockStoragePresignGet: vi.fn(),
+}));
+
+vi.mock("../../../storage", () => ({
+  storagePresignGet: mockStoragePresignGet,
+}));
+
+vi.mock("../../../db", () => ({
+  db: {
+    select: vi.fn(),
+  },
+}));
+
+vi.mock("../../../../drizzle/schema", () => ({
+  sandboxArtifacts: {
+    id: "id",
+    sandboxJobId: "sandboxJobId",
+    objectKey: "objectKey",
+    mimeType: "mimeType",
+    isPrimary: "isPrimary",
+  },
+  sandboxJobs: {
+    id: "id",
+    tenantId: "tenantId",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn(),
+  and: vi.fn(),
+}));
+
+import { db } from "../../../db";
+import { getArtifactUrl } from "../artifactAccess";
+
+const mockDb = db as any;
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+function createJoinChain(result: any[]) {
+  const limitMock = vi.fn().mockResolvedValue(result);
+  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
+  const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
+  const fromMock = vi.fn().mockReturnValue({ innerJoin: innerJoinMock });
+  return { from: fromMock };
+}
+
+describe("getArtifactUrl", () => {
+  it("generates signed URL for artifact", async () => {
+    mockDb.select.mockReturnValue(
+      createJoinChain([
+        {
+          objectKey: "sandbox-artifacts/job-123/output.mp4",
+          tenantId: "tenant-1",
+        },
+      ]),
+    );
+
+    mockStoragePresignGet.mockResolvedValue({
+      url: "https://r2.example.com/signed-url",
+      key: "sandbox-artifacts/job-123/output.mp4",
+    });
+
+    const result = await getArtifactUrl({
+      artifactId: 1,
+      tenantId: "tenant-1",
+      ttlSeconds: 900,
+    });
+
+    expect(result).toBeDefined();
+    expect(result?.url).toBe("https://r2.example.com/signed-url");
+  });
+
+  it("returns null when artifact belongs to different tenant", async () => {
+    mockDb.select.mockReturnValue(createJoinChain([]));
+
+    const result = await getArtifactUrl({
+      artifactId: 1,
+      tenantId: "tenant-wrong",
+      ttlSeconds: 900,
+    });
+
+    expect(result).toBeNull();
+  });
+
+  it("uses configurable TTL", async () => {
+    mockDb.select.mockReturnValue(
+      createJoinChain([{ objectKey: "key", tenantId: "tenant-1" }]),
+    );
+
+    mockStoragePresignGet.mockResolvedValue({
+      url: "https://example.com/url",
+      key: "key",
+    });
+
+    await getArtifactUrl({
+      artifactId: 1,
+      tenantId: "tenant-1",
+      ttlSeconds: 3600,
+    });
+
+    expect(mockStoragePresignGet).toHaveBeenCalledWith("key", 3600);
+  });
+});
diff --git a/apps/web/server/services/sandbox/__tests__/costEstimator.test.ts b/apps/web/server/services/sandbox/__tests__/costEstimator.test.ts
new file mode 100644
index 0000000..091f80b
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/costEstimator.test.ts
@@ -0,0 +1,141 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } =
+  vi.hoisted(() => ({
+    mockHasEnoughCredits: vi.fn(),
+    mockDeductCredits: vi.fn(),
+    mockRefundCredits: vi.fn(),
+  }));
+
+vi.mock("../../creditService", () => ({
+  hasEnoughCredits: mockHasEnoughCredits,
+  deductCredits: mockDeductCredits,
+  refundCredits: mockRefundCredits,
+}));
+
+import {
+  estimateCost,
+  reserveCredits,
+  reconcileCredits,
+  refundReservedCredits,
+} from "../costEstimator";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("estimateCost", () => {
+  it("estimates cost from profile defaults", () => {
+    const cost = estimateCost({
+      cpuLimit: "1000m",
+      memoryLimitMb: 2048,
+      timeoutSeconds: 300,
+    });
+    expect(typeof cost).toBe("number");
+    expect(cost).toBeGreaterThan(0);
+  });
+
+  it("returns higher cost for more resources", () => {
+    const low = estimateCost({
+      cpuLimit: "1000m",
+      memoryLimitMb: 2048,
+      timeoutSeconds: 300,
+    });
+    const high = estimateCost({
+      cpuLimit: "2000m",
+      memoryLimitMb: 4096,
+      timeoutSeconds: 1800,
+    });
+    expect(high).toBeGreaterThan(low);
+  });
+});
+
+describe("reserveCredits", () => {
+  it("pre-checks hasEnoughCredits before deduction", async () => {
+    mockHasEnoughCredits.mockResolvedValue(true);
+    mockDeductCredits.mockResolvedValue({ id: 1 });
+
+    await reserveCredits({
+      userId: 42,
+      estimatedCost: 10,
+      jobId: "job-123",
+      tenantId: "tenant-1",
+    });
+
+    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
+    expect(mockDeductCredits).toHaveBeenCalled();
+  });
+
+  it("throws when user has insufficient credits", async () => {
+    mockHasEnoughCredits.mockResolvedValue(false);
+
+    await expect(
+      reserveCredits({
+        userId: 42,
+        estimatedCost: 10,
+        jobId: "job-123",
+        tenantId: "tenant-1",
+      }),
+    ).rejects.toThrow("Insufficient credits");
+  });
+});
+
+describe("reconcileCredits", () => {
+  it("refunds overage when actual cost is lower", async () => {
+    mockRefundCredits.mockResolvedValue({ id: 2 });
+
+    await reconcileCredits({
+      userId: 42,
+      jobId: "job-123",
+      estimatedCost: 15,
+      actualCost: 10,
+    });
+
+    expect(mockRefundCredits).toHaveBeenCalledWith(
+      expect.objectContaining({ userId: 42, amount: 5 }),
+    );
+  });
+
+  it("deducts additional when actual cost is higher", async () => {
+    mockDeductCredits.mockResolvedValue({ id: 3 });
+
+    await reconcileCredits({
+      userId: 42,
+      jobId: "job-123",
+      estimatedCost: 10,
+      actualCost: 15,
+    });
+
+    expect(mockDeductCredits).toHaveBeenCalledWith(
+      expect.objectContaining({ userId: 42, amount: 5 }),
+    );
+  });
+
+  it("does nothing when estimated equals actual", async () => {
+    await reconcileCredits({
+      userId: 42,
+      jobId: "job-123",
+      estimatedCost: 10,
+      actualCost: 10,
+    });
+
+    expect(mockDeductCredits).not.toHaveBeenCalled();
+    expect(mockRefundCredits).not.toHaveBeenCalled();
+  });
+});
+
+describe("refundReservedCredits", () => {
+  it("refunds full amount on failure", async () => {
+    mockRefundCredits.mockResolvedValue({ id: 4 });
+
+    await refundReservedCredits({
+      userId: 42,
+      jobId: "job-123",
+      reservedAmount: 10,
+    });
+
+    expect(mockRefundCredits).toHaveBeenCalledWith(
+      expect.objectContaining({ userId: 42, amount: 10 }),
+    );
+  });
+});
diff --git a/apps/web/server/services/sandbox/__tests__/dispatchService.test.ts b/apps/web/server/services/sandbox/__tests__/dispatchService.test.ts
new file mode 100644
index 0000000..2b9bfaf
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/dispatchService.test.ts
@@ -0,0 +1,121 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockFetch } = vi.hoisted(() => ({
+  mockFetch: vi.fn(),
+}));
+
+vi.mock("../../../_core/env", () => ({
+  ENV: {
+    pythonBackendUrl: "http://localhost:8000",
+  },
+}));
+
+// Mock global fetch
+vi.stubGlobal("fetch", mockFetch);
+
+import {
+  dispatchToSandbox,
+  shouldUseSandbox,
+  type SandboxDispatchRequest,
+} from "../dispatchService";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  // Reset env overrides
+  delete process.env.OPENSANDBOX_ENABLED;
+});
+
+describe("shouldUseSandbox", () => {
+  it("returns false when OPENSANDBOX_ENABLED is false", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    expect(shouldUseSandbox("sandbox-code")).toBe(false);
+  });
+
+  it("returns false for core-text execution mode", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("core-text")).toBe(false);
+  });
+
+  it("returns false for llm-only execution mode", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("llm-only")).toBe(false);
+  });
+
+  it("returns true for sandbox-code when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("sandbox-code")).toBe(true);
+  });
+
+  it("returns true for sandbox-command when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("sandbox-command")).toBe(true);
+  });
+
+  it("returns true for sandbox-media when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("sandbox-media")).toBe(true);
+  });
+
+  it("returns true for media-generate when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("media-generate")).toBe(true);
+  });
+
+  it("returns true for sandbox-browser when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("sandbox-browser")).toBe(true);
+  });
+
+  it("returns true for sandbox-file when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandbox("sandbox-file")).toBe(true);
+  });
+});
+
+describe("dispatchToSandbox", () => {
+  it("sends correct request to Python backend", async () => {
+    mockFetch.mockResolvedValueOnce({
+      ok: true,
+      json: () => Promise.resolve({ job_id: "job-123" }),
+    });
+
+    const request: SandboxDispatchRequest = {
+      featureType: "media",
+      executionMode: "sandbox-media",
+      tenantId: "tenant-1",
+      userId: 42,
+      inputFiles: [],
+    };
+
+    const result = await dispatchToSandbox(request);
+    expect(result.jobId).toBe("job-123");
+
+    expect(mockFetch).toHaveBeenCalledWith(
+      "http://localhost:8000/api/internal/sandbox/dispatch",
+      expect.objectContaining({
+        method: "POST",
+        headers: expect.objectContaining({
+          "Content-Type": "application/json",
+        }),
+      }),
+    );
+  });
+
+  it("throws on Python backend error", async () => {
+    mockFetch.mockResolvedValueOnce({
+      ok: false,
+      status: 500,
+      text: () => Promise.resolve("Internal Server Error"),
+    });
+
+    const request: SandboxDispatchRequest = {
+      featureType: "media",
+      executionMode: "sandbox-media",
+      tenantId: "tenant-1",
+      userId: 42,
+      inputFiles: [],
+    };
+
+    await expect(dispatchToSandbox(request)).rejects.toThrow();
+  });
+});
diff --git a/apps/web/server/services/sandbox/__tests__/policyResolver.test.ts b/apps/web/server/services/sandbox/__tests__/policyResolver.test.ts
new file mode 100644
index 0000000..d0334e2
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/policyResolver.test.ts
@@ -0,0 +1,114 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock db before importing modules that use it
+vi.mock("../../../db", () => ({
+  db: {
+    select: vi.fn(),
+  },
+}));
+
+vi.mock("../../../../drizzle/schema", () => ({
+  sandboxProfiles: {
+    id: "id",
+    slug: "slug",
+    isActive: "isActive",
+  },
+  tenantSandboxPolicies: {
+    tenantId: "tenantId",
+    maxConcurrentSandboxes: "maxConcurrentSandboxes",
+    maxDailyRuntimeSeconds: "maxDailyRuntimeSeconds",
+  },
+  sandboxJobs: {
+    tenantId: "tenantId",
+    status: "status",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn(),
+  and: vi.fn(),
+  inArray: vi.fn(),
+}));
+
+import { db } from "../../../db";
+import { resolveProfile, checkTenantPolicy } from "../policyResolver";
+
+const mockDb = db as any;
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+function createSelectChain(result: any[]) {
+  const limitMock = vi.fn().mockResolvedValue(result);
+  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
+  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
+  return { from: fromMock };
+}
+
+describe("resolveProfile", () => {
+  it("resolves profile for given feature type", async () => {
+    mockDb.select.mockReturnValue(
+      createSelectChain([
+        { id: 1, slug: "media-processing", name: "Media Processing" },
+      ]),
+    );
+
+    const profile = await resolveProfile("media");
+    expect(profile).toBeDefined();
+    expect(profile?.slug).toBe("media-processing");
+  });
+
+  it("returns null when no active profile found", async () => {
+    mockDb.select.mockReturnValue(createSelectChain([]));
+
+    const profile = await resolveProfile("media");
+    expect(profile).toBeNull();
+  });
+});
+
+describe("checkTenantPolicy", () => {
+  it("returns allowed when tenant is under limits", async () => {
+    let callCount = 0;
+    mockDb.select.mockImplementation(() => {
+      callCount++;
+      if (callCount === 1) {
+        // Policy query
+        return createSelectChain([
+          { maxConcurrentSandboxes: 5, maxDailyRuntimeSeconds: 36000 },
+        ]);
+      }
+      // Active jobs query (returns array, we count length)
+      return {
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
+        }),
+      };
+    });
+
+    const result = await checkTenantPolicy("tenant-1");
+    expect(result.allowed).toBe(true);
+  });
+
+  it("returns denied when tenant exceeds concurrent limit", async () => {
+    let callCount = 0;
+    mockDb.select.mockImplementation(() => {
+      callCount++;
+      if (callCount === 1) {
+        return createSelectChain([
+          { maxConcurrentSandboxes: 3, maxDailyRuntimeSeconds: 36000 },
+        ]);
+      }
+      // 3 active jobs = at limit
+      return {
+        from: vi.fn().mockReturnValue({
+          where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
+        }),
+      };
+    });
+
+    const result = await checkTenantPolicy("tenant-1");
+    expect(result.allowed).toBe(false);
+    expect(result.reason).toContain("concurrent");
+  });
+});
diff --git a/apps/web/server/services/sandbox/__tests__/statusProjection.test.ts b/apps/web/server/services/sandbox/__tests__/statusProjection.test.ts
new file mode 100644
index 0000000..96d7d40
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/statusProjection.test.ts
@@ -0,0 +1,72 @@
+import { describe, it, expect } from "vitest";
+import { projectStatus, type SandboxInternalStatus } from "../statusProjection";
+
+describe("projectStatus", () => {
+  it("maps accepted to Queued", () => {
+    expect(projectStatus("accepted")).toEqual({
+      label: "Queued",
+      phase: "pending",
+      isTerminal: false,
+    });
+  });
+
+  it("maps policy_resolved to Queued", () => {
+    expect(projectStatus("policy_resolved").label).toBe("Queued");
+  });
+
+  it("maps queued to Queued", () => {
+    expect(projectStatus("queued").label).toBe("Queued");
+  });
+
+  it("maps provisioning to Preparing secure workspace", () => {
+    expect(projectStatus("provisioning").label).toBe("Preparing secure workspace");
+  });
+
+  it("maps staging_inputs to Preparing secure workspace", () => {
+    expect(projectStatus("staging_inputs").label).toBe("Preparing secure workspace");
+  });
+
+  it("maps executing to Running securely", () => {
+    const result = projectStatus("executing");
+    expect(result.label).toBe("Running securely");
+    expect(result.phase).toBe("active");
+  });
+
+  it("maps collecting_outputs to Collecting results", () => {
+    expect(projectStatus("collecting_outputs").label).toBe("Collecting results");
+  });
+
+  it("maps persisting to Collecting results", () => {
+    expect(projectStatus("persisting").label).toBe("Collecting results");
+  });
+
+  it("maps completed to Completed with isTerminal true", () => {
+    const result = projectStatus("completed");
+    expect(result.label).toBe("Completed");
+    expect(result.isTerminal).toBe(true);
+  });
+
+  it("maps failed to Failed with isTerminal true", () => {
+    const result = projectStatus("failed");
+    expect(result.label).toBe("Failed");
+    expect(result.isTerminal).toBe(true);
+  });
+
+  it("maps timed_out to Timed out with isTerminal true", () => {
+    const result = projectStatus("timed_out");
+    expect(result.label).toBe("Timed out");
+    expect(result.isTerminal).toBe(true);
+  });
+
+  it("maps canceled to Canceled with isTerminal true", () => {
+    const result = projectStatus("canceled");
+    expect(result.label).toBe("Canceled");
+    expect(result.isTerminal).toBe(true);
+  });
+
+  it("handles unknown state gracefully", () => {
+    const result = projectStatus("nonexistent_state" as SandboxInternalStatus);
+    expect(result.label).toBe("Unknown");
+    expect(result.isTerminal).toBe(false);
+  });
+});
diff --git a/apps/web/server/services/sandbox/artifactAccess.ts b/apps/web/server/services/sandbox/artifactAccess.ts
new file mode 100644
index 0000000..f542f8e
--- /dev/null
+++ b/apps/web/server/services/sandbox/artifactAccess.ts
@@ -0,0 +1,95 @@
+/**
+ * Generates signed URLs for sandbox artifacts with tenant isolation.
+ */
+
+import { db } from "../../db";
+import { sandboxArtifacts, sandboxJobs } from "../../../drizzle/schema";
+import { eq, and } from "drizzle-orm";
+import { storagePresignGet } from "../../storage";
+
+/**
+ * Generate a presigned GET URL for a sandbox artifact.
+ * Enforces tenant isolation by joining sandbox_artifacts with sandbox_jobs.
+ */
+export async function getArtifactUrl(params: {
+  artifactId: number;
+  tenantId: string;
+  ttlSeconds?: number;
+}): Promise<{ url: string; key: string } | null> {
+  const ttl = params.ttlSeconds ?? 900;
+
+  // Join artifacts to jobs and verify tenant ownership
+  const rows = await db
+    .select({
+      objectKey: sandboxArtifacts.objectKey,
+      tenantId: sandboxJobs.tenantId,
+    })
+    .from(sandboxArtifacts)
+    .innerJoin(sandboxJobs, eq(sandboxArtifacts.sandboxJobId, sandboxJobs.id))
+    .where(
+      and(
+        eq(sandboxArtifacts.id, params.artifactId),
+        eq(sandboxJobs.tenantId, params.tenantId),
+      ),
+    )
+    .limit(1);
+
+  if (rows.length === 0) return null;
+
+  const result = await storagePresignGet(rows[0].objectKey, ttl);
+  return result;
+}
+
+/**
+ * Generate signed URLs for all artifacts of a sandbox job.
+ * Enforces tenant isolation.
+ */
+export async function getJobArtifactUrls(params: {
+  jobId: string;
+  tenantId: string;
+  ttlSeconds?: number;
+}): Promise<
+  Array<{
+    artifactId: number;
+    url: string;
+    key: string;
+    mimeType: string;
+    isPrimary: boolean;
+  }>
+> {
+  const ttl = params.ttlSeconds ?? 900;
+
+  // Verify job belongs to tenant and get artifacts
+  const rows = await db
+    .select({
+      artifactId: sandboxArtifacts.id,
+      objectKey: sandboxArtifacts.objectKey,
+      mimeType: sandboxArtifacts.mimeType,
+      isPrimary: sandboxArtifacts.isPrimary,
+      tenantId: sandboxJobs.tenantId,
+    })
+    .from(sandboxArtifacts)
+    .innerJoin(sandboxJobs, eq(sandboxArtifacts.sandboxJobId, sandboxJobs.id))
+    .where(
+      and(
+        eq(sandboxArtifacts.sandboxJobId, params.jobId),
+        eq(sandboxJobs.tenantId, params.tenantId),
+      ),
+    );
+
+  const results = [];
+  for (const row of rows) {
+    const signed = await storagePresignGet(row.objectKey, ttl);
+    if (signed) {
+      results.push({
+        artifactId: row.artifactId,
+        url: signed.url,
+        key: signed.key,
+        mimeType: row.mimeType ?? "application/octet-stream",
+        isPrimary: row.isPrimary,
+      });
+    }
+  }
+
+  return results;
+}
diff --git a/apps/web/server/services/sandbox/costEstimator.ts b/apps/web/server/services/sandbox/costEstimator.ts
new file mode 100644
index 0000000..b3aedc3
--- /dev/null
+++ b/apps/web/server/services/sandbox/costEstimator.ts
@@ -0,0 +1,128 @@
+/**
+ * Cost estimation and credit integration for sandbox jobs.
+ */
+
+import {
+  hasEnoughCredits,
+  deductCredits,
+  refundCredits,
+} from "../creditService";
+
+interface ProfileResourceEstimate {
+  cpuLimit: string;
+  memoryLimitMb: number;
+  timeoutSeconds: number;
+}
+
+// Internal rates: credits per resource-minute
+const CPU_RATE = 1; // 1 credit per CPU-core per minute
+const MEM_RATE = 0.5; // 0.5 credits per GB per minute
+
+function parseCpuMillicores(cpuLimit: string): number {
+  const match = cpuLimit.match(/^(\d+)m$/);
+  if (match) return parseInt(match[1], 10) / 1000;
+  return parseFloat(cpuLimit) || 1;
+}
+
+/**
+ * Estimate the credit cost of a sandbox job before execution.
+ */
+export function estimateCost(profile: ProfileResourceEstimate): number {
+  const cpuCores = parseCpuMillicores(profile.cpuLimit);
+  const memoryGb = profile.memoryLimitMb / 1024;
+  const timeoutMinutes = profile.timeoutSeconds / 60;
+
+  const cost =
+    cpuCores * timeoutMinutes * CPU_RATE +
+    memoryGb * timeoutMinutes * MEM_RATE;
+
+  return Math.ceil(cost);
+}
+
+/**
+ * Reserve credits before sandbox dispatch.
+ */
+export async function reserveCredits(params: {
+  userId: number;
+  estimatedCost: number;
+  jobId: string;
+  tenantId: string;
+}): Promise<{ transactionId: number }> {
+  const canAfford = await hasEnoughCredits(params.userId, params.estimatedCost);
+  if (!canAfford) {
+    throw new Error("Insufficient credits for sandbox execution");
+  }
+
+  const tx = await deductCredits({
+    userId: params.userId,
+    amount: params.estimatedCost,
+    description: `Sandbox job reservation: ${params.jobId}`,
+    tenantId: params.tenantId,
+    sourceType: "other",
+    metadata: {
+      sandboxJobId: params.jobId,
+      type: "sandbox_reservation",
+    },
+  });
+
+  return { transactionId: tx.id };
+}
+
+/**
+ * Reconcile credits after job completion.
+ */
+export async function reconcileCredits(params: {
+  userId: number;
+  jobId: string;
+  estimatedCost: number;
+  actualCost: number;
+}): Promise<void> {
+  const diff = params.estimatedCost - params.actualCost;
+
+  if (diff > 0) {
+    // Overpaid: refund the difference
+    await refundCredits({
+      userId: params.userId,
+      amount: diff,
+      description: `Sandbox cost reconciliation refund: ${params.jobId}`,
+      sourceType: "other",
+      metadata: {
+        sandboxJobId: params.jobId,
+        type: "sandbox_reconciliation",
+      },
+    });
+  } else if (diff < 0) {
+    // Underpaid: deduct the additional amount
+    await deductCredits({
+      userId: params.userId,
+      amount: Math.abs(diff),
+      description: `Sandbox cost reconciliation charge: ${params.jobId}`,
+      sourceType: "other",
+      metadata: {
+        sandboxJobId: params.jobId,
+        type: "sandbox_reconciliation",
+      },
+    });
+  }
+  // If diff === 0, no action needed
+}
+
+/**
+ * Refund all reserved credits on job failure.
+ */
+export async function refundReservedCredits(params: {
+  userId: number;
+  jobId: string;
+  reservedAmount: number;
+}): Promise<void> {
+  await refundCredits({
+    userId: params.userId,
+    amount: params.reservedAmount,
+    description: `Sandbox job failed, refunding reservation: ${params.jobId}`,
+    sourceType: "other",
+    metadata: {
+      sandboxJobId: params.jobId,
+      reason: "sandbox_job_failed",
+    },
+  });
+}
diff --git a/apps/web/server/services/sandbox/dispatchService.ts b/apps/web/server/services/sandbox/dispatchService.ts
new file mode 100644
index 0000000..1e6de18
--- /dev/null
+++ b/apps/web/server/services/sandbox/dispatchService.ts
@@ -0,0 +1,78 @@
+/**
+ * Central decision point for sandbox vs legacy workload routing.
+ * Sends dispatch requests to the Python backend.
+ */
+
+import { ENV } from "../../_core/env";
+
+export type ExecutionMode =
+  | "core-text"
+  | "llm-only"
+  | "sandbox-code"
+  | "sandbox-command"
+  | "sandbox-browser"
+  | "sandbox-file"
+  | "sandbox-media"
+  | "media-generate";
+
+export interface SandboxDispatchRequest {
+  featureType: "chat" | "skill" | "workflow" | "library" | "media" | "presentation" | "connector";
+  executionMode: ExecutionMode;
+  tenantId: string;
+  userId: number;
+  inputFiles: Array<{ key: string; mimeType: string; sizeBytes: number }>;
+  profileOverride?: string;
+  idempotencyKey?: string;
+  metadata?: Record<string, unknown>;
+}
+
+export interface SandboxDispatchResult {
+  jobId: string;
+}
+
+const LEGACY_MODES = new Set<string>(["core-text", "llm-only"]);
+
+/**
+ * Determine whether a workload should use the sandbox execution path.
+ * Returns false for core-text/llm-only modes or when sandbox is disabled.
+ */
+export function shouldUseSandbox(executionMode: string): boolean {
+  if (process.env.OPENSANDBOX_ENABLED !== "true") return false;
+  if (LEGACY_MODES.has(executionMode)) return false;
+  return true;
+}
+
+/**
+ * Dispatch a workload to the sandbox system via the Python backend.
+ */
+export async function dispatchToSandbox(
+  request: SandboxDispatchRequest,
+): Promise<SandboxDispatchResult> {
+  const baseUrl = ENV.pythonBackendUrl || "http://localhost:8000";
+  const url = `${baseUrl}/api/internal/sandbox/dispatch`;
+
+  const response = await fetch(url, {
+    method: "POST",
+    headers: { "Content-Type": "application/json" },
+    body: JSON.stringify({
+      feature_type: request.featureType,
+      execution_mode: request.executionMode,
+      tenant_id: request.tenantId,
+      user_id: request.userId,
+      input_files: request.inputFiles,
+      profile_override: request.profileOverride,
+      idempotency_key: request.idempotencyKey,
+      metadata: request.metadata,
+    }),
+  });
+
+  if (!response.ok) {
+    const text = await response.text();
+    throw new Error(
+      `Sandbox dispatch failed (${response.status}): ${text}`,
+    );
+  }
+
+  const data = await response.json();
+  return { jobId: data.job_id };
+}
diff --git a/apps/web/server/services/sandbox/index.ts b/apps/web/server/services/sandbox/index.ts
new file mode 100644
index 0000000..9b56a3b
--- /dev/null
+++ b/apps/web/server/services/sandbox/index.ts
@@ -0,0 +1,19 @@
+export { shouldUseSandbox, dispatchToSandbox } from "./dispatchService";
+export type {
+  SandboxDispatchRequest,
+  SandboxDispatchResult,
+  ExecutionMode,
+} from "./dispatchService";
+export { resolveProfile, checkTenantPolicy } from "./policyResolver";
+export { projectStatus } from "./statusProjection";
+export type {
+  SandboxInternalStatus,
+  StatusProjection,
+} from "./statusProjection";
+export {
+  estimateCost,
+  reserveCredits,
+  reconcileCredits,
+  refundReservedCredits,
+} from "./costEstimator";
+export { getArtifactUrl, getJobArtifactUrls } from "./artifactAccess";
diff --git a/apps/web/server/services/sandbox/policyResolver.ts b/apps/web/server/services/sandbox/policyResolver.ts
new file mode 100644
index 0000000..3c88789
--- /dev/null
+++ b/apps/web/server/services/sandbox/policyResolver.ts
@@ -0,0 +1,101 @@
+/**
+ * Resolves sandbox profiles and checks tenant policy limits.
+ */
+
+import { db } from "../../db";
+import {
+  sandboxProfiles,
+  tenantSandboxPolicies,
+  sandboxJobs,
+  type SandboxProfile,
+} from "../../../drizzle/schema";
+import { eq, and, inArray } from "drizzle-orm";
+
+export interface PolicyCheckResult {
+  allowed: boolean;
+  reason?: string;
+  profileSlug?: string;
+  profileConfig?: {
+    cpuLimit: string;
+    memoryLimitMb: number;
+    timeoutSeconds: number;
+    networkDefaultAction: string;
+  };
+}
+
+const FEATURE_PROFILE_MAP: Record<string, string> = {
+  media: "media-processing",
+  presentation: "media-processing",
+  skill: "code-default",
+  chat: "code-default",
+  workflow: "code-default",
+  library: "file-parser",
+  connector: "code-default",
+};
+
+const NON_TERMINAL_STATUSES = [
+  "accepted",
+  "policy_resolved",
+  "queued",
+  "provisioning",
+  "staging_inputs",
+  "executing",
+  "collecting_outputs",
+  "persisting",
+] as const;
+
+/**
+ * Resolve the sandbox profile for a given feature type.
+ */
+export async function resolveProfile(
+  featureType: string,
+  _tenantId?: string,
+): Promise<SandboxProfile | null> {
+  const slug = FEATURE_PROFILE_MAP[featureType] ?? "code-default";
+
+  const rows = await db
+    .select()
+    .from(sandboxProfiles)
+    .where(and(eq(sandboxProfiles.slug, slug), eq(sandboxProfiles.isActive, true)))
+    .limit(1);
+
+  return rows[0] ?? null;
+}
+
+/**
+ * Check whether a tenant is allowed to create a new sandbox job.
+ */
+export async function checkTenantPolicy(
+  tenantId: string,
+): Promise<PolicyCheckResult> {
+  // Get tenant policy (or use defaults)
+  const policyRows = await db
+    .select()
+    .from(tenantSandboxPolicies)
+    .where(eq(tenantSandboxPolicies.tenantId, tenantId))
+    .limit(1);
+
+  const maxConcurrent = policyRows[0]?.maxConcurrentSandboxes ?? 5;
+
+  // Count active (non-terminal) jobs for this tenant
+  const activeRows = await db
+    .select()
+    .from(sandboxJobs)
+    .where(
+      and(
+        eq(sandboxJobs.tenantId, tenantId),
+        inArray(sandboxJobs.status, [...NON_TERMINAL_STATUSES]),
+      ),
+    );
+
+  const activeCount = activeRows.length;
+
+  if (activeCount >= maxConcurrent) {
+    return {
+      allowed: false,
+      reason: `Max concurrent sandbox limit reached (${activeCount}/${maxConcurrent})`,
+    };
+  }
+
+  return { allowed: true };
+}
diff --git a/apps/web/server/services/sandbox/statusProjection.ts b/apps/web/server/services/sandbox/statusProjection.ts
new file mode 100644
index 0000000..4b27059
--- /dev/null
+++ b/apps/web/server/services/sandbox/statusProjection.ts
@@ -0,0 +1,48 @@
+/**
+ * Maps internal sandbox job status values to user-friendly display labels.
+ * Stateless, pure function -- no I/O, no side effects.
+ */
+
+export type SandboxInternalStatus =
+  | "accepted"
+  | "policy_resolved"
+  | "queued"
+  | "provisioning"
+  | "staging_inputs"
+  | "executing"
+  | "collecting_outputs"
+  | "persisting"
+  | "completed"
+  | "failed"
+  | "timed_out"
+  | "canceled";
+
+export interface StatusProjection {
+  /** User-facing label */
+  label: string;
+  /** Phase grouping */
+  phase: "pending" | "active" | "finishing" | "terminal";
+  /** Whether this is a final state (no further transitions) */
+  isTerminal: boolean;
+}
+
+const STATUS_MAP: Record<string, StatusProjection> = {
+  accepted: { label: "Queued", phase: "pending", isTerminal: false },
+  policy_resolved: { label: "Queued", phase: "pending", isTerminal: false },
+  queued: { label: "Queued", phase: "pending", isTerminal: false },
+  provisioning: { label: "Preparing secure workspace", phase: "active", isTerminal: false },
+  staging_inputs: { label: "Preparing secure workspace", phase: "active", isTerminal: false },
+  executing: { label: "Running securely", phase: "active", isTerminal: false },
+  collecting_outputs: { label: "Collecting results", phase: "finishing", isTerminal: false },
+  persisting: { label: "Collecting results", phase: "finishing", isTerminal: false },
+  completed: { label: "Completed", phase: "terminal", isTerminal: true },
+  failed: { label: "Failed", phase: "terminal", isTerminal: true },
+  timed_out: { label: "Timed out", phase: "terminal", isTerminal: true },
+  canceled: { label: "Canceled", phase: "terminal", isTerminal: true },
+};
+
+const UNKNOWN: StatusProjection = { label: "Unknown", phase: "pending", isTerminal: false };
+
+export function projectStatus(status: SandboxInternalStatus): StatusProjection {
+  return STATUS_MAP[status] ?? UNKNOWN;
+}
