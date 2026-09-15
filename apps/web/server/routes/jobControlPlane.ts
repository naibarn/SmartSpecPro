import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { compareCachedInternalToken } from "../services/appRuntimeConfig";
import { createJobControlPlane, recordAuthenticatedJobCallback } from "../services/jobControlPlane";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { db, getDb } from "../db";
import { workerJobAttempts, workerJobDispatches, workerJobs } from "../../drizzle/schema";

const leaseSchema = z.object({
  jobId: z.string().min(1).max(36),
  attemptId: z.string().min(1),
  leaseToken: z.string().min(1),
  fencingVersion: z.number().int().nonnegative(),
  expiresAt: z.string().default(""),
});
const progressSchema = z.object({
  progress: z.number().finite().min(0).max(100),
  stage: z.string().trim().min(1).max(100),
  message: z.string().max(500).optional(),
  measured: z.record(z.union([z.number(), z.string().max(200), z.boolean()])).optional(),
});
const legacyStatusSchema = z.record(z.unknown()).refine(value => Object.keys(value).length <= 100, { message: "Legacy status contains too many fields" });
type DispatchObservation = {
  adapter: string;
  referenceNamespace: string;
  dedupeKey: string;
  publicationStatus: string;
  queueJobId: string | null;
  celeryTaskId: string | null;
  providerJobId: string | null;
  workflowInstanceId: string | null;
  containerInstanceId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  consumedAt: Date | null;
};
const resultSchema = z.object({ resultRef: z.string().max(2000).optional(), output: z.record(z.unknown()).optional() });
const errorSchema = z.object({ code: z.string().trim().min(1).max(100), message: z.string().max(2000), class: z.enum(["retryable", "permanent", "unknown"]), operatorReviewRequired: z.boolean().optional() });
const externalWaitSchema = z.object({ operationKey: z.string().trim().min(1).max(200), providerReference: z.string().max(255).optional(), resumeAfter: z.string().datetime({ offset: true }) });
const externalSettlementSchema = z.object({
  jobId: z.string().trim().min(1).max(36),
  resultRef: z.string().trim().min(1).max(255).optional(),
  operationKey: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500).optional(),
  operatorReviewRequired: z.boolean().optional(),
  pollerLeaseTokenHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
const externalRegistrationSchema = z.object({
  jobId: z.string().trim().min(1).max(36),
  operationKey: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(64),
  providerJobId: z.string().trim().min(1).max(255),
  nextPollAt: z.string().datetime({ offset: true }),
  providerDeadlineAt: z.string().datetime({ offset: true }),
});
const callbackSchema = z.object({
  adapterNamespace: z.string().trim().min(1).max(120),
  providerEventId: z.string().trim().min(1).max(255).optional(),
  replayKey: z.string().trim().min(1).max(255).optional(),
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: z.string().trim().min(1).max(36).optional(),
  jobId: z.string().trim().min(1).max(36).optional(),
  payload: z.record(z.unknown()),
}).refine(value => Boolean(value.providerEventId) !== Boolean(value.replayKey), { message: "Callback requires exactly one replay identity" });

const createSchema = z.object({
  context: z.object({
    tenantId: z.string().trim().min(1).max(36),
    actorType: z.enum(["user", "admin", "system"]),
    actorId: z.number().int().positive().optional(),
    authorizationScope: z.string().trim().min(1).max(160),
    correlationId: z.string().trim().min(1).max(160),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  }),
  definition: z.object({
    contractVersion: z.string().trim().min(1).max(40),
    jobType: z.string().trim().min(1).max(100),
    executionClass: z.enum(["short", "long", "external", "cpu", "gpu", "scheduled"]),
    priority: z.number().int().min(-1000).max(1000).optional(),
    input: z.record(z.unknown()),
    retryPolicy: z.object({
      maxAttempts: z.number().int().min(1).max(20),
      baseDelayMs: z.number().int().min(0).max(900000),
      maxDelayMs: z.number().int().min(0).max(3600000),
      jitter: z.enum(["none", "bounded", "recorded"]),
      deadlineMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000),
      allowedErrorClasses: z.array(z.string().min(1).max(64)).max(20),
    }),
    timeoutPolicy: z.object({
      softTimeoutMs: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000),
      hardTimeoutMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000),
    }),
    requiredCapabilities: z.record(z.unknown()).optional(),
    schedule: z.object({
      scheduleId: z.string().trim().min(1).max(160),
      occurrenceKey: z.string().trim().min(1).max(200),
      scheduleVersion: z.string().trim().min(1).max(80),
      timezone: z.string().trim().min(1).max(80),
      missedOccurrencePolicy: z.enum(["skip", "coalesce", "catch_up"]),
    }).optional(),
  }),
  runtimeType: z.literal("python_job_worker").optional(),
});

function internalAuth(req: Request, res: Response): boolean {
  if (compareCachedInternalToken(req.header("x-internal-token"))) return true;
  res.status(401).json({ error: "Invalid internal token" });
  return false;
}

function fail(res: Response, error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "JOB_CONTROL_PLANE_ERROR";
  const status = code === "JOB_NOT_FOUND" ? 404 : code === "JOB_STATE_CONFLICT" || code === "JOB_LEASE_STALE" ? 409 : 400;
  res.status(status).json({ error: code });
}

export function registerJobControlPlaneRoutes(app: Express): void {
  app.post("/api/internal/job-control-plane/create", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid create request" });
    try {
      const result = await createControlPlaneJob({
        context: parsed.data.context,
        definition: parsed.data.definition,
        createOptions: { runtimeType: parsed.data.runtimeType },
      });
      return res.json(result);
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/ready", async (req, res) => {
    if (!internalAuth(req, res)) return;
    if (process.env.FEATURE_186_HARD_CUTOVER !== "true" || process.env.FEATURE_186_POSTGRES_PYTHON_WORKER !== "true") {
      return res.status(503).json({ error: "POSTGRES_PULL_DISABLED" });
    }
    const parsed = z.object({
      runtimeType: z.literal("python_job_worker"),
      limit: z.number().int().min(1).max(100).default(1),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid ready request" });
    try {
      getDb();
      const jobs = await db.select({
        jobId: workerJobs.id,
        attempt: workerJobs.attempt,
        attemptId: workerJobAttempts.id,
      })
        .from(workerJobs)
        // The first PostgreSQL-pull envelope intentionally has no attemptId;
        // claim() creates the attempt and lease atomically. Keep initial
        // queued jobs visible to the pull worker while still returning a
        // pinned attemptId for retries.
        .leftJoin(workerJobAttempts, and(
          eq(workerJobAttempts.workerJobId, workerJobs.id),
          eq(workerJobAttempts.attempt, workerJobs.attempt),
        ))
        .where(and(
          eq(workerJobs.runtimeType, parsed.data.runtimeType),
          eq(workerJobs.status, "queued"),
          eq(workerJobs.operatorReviewRequired, false),
          sql`exists (
            select 1
            from ${workerJobDispatches} dispatch
            where dispatch."workerJobId" = ${workerJobs.id}
              and dispatch."referenceNamespace" = 'postgres-pull'
              and dispatch."publicationStatus" = 'published'
              and dispatch."consumedAt" is null
              and dispatch."dedupeKey" like 'job:' || ${workerJobs.id} || ':attempt:' || ${workerJobs.attempt} || '%'
          )`,
        ))
        .orderBy(desc(workerJobs.priority), asc(workerJobs.createdAt), asc(workerJobs.id))
        .limit(parsed.data.limit);
      return res.json({ jobs });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/context", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      jobId: z.string().min(1),
      tenantId: z.string().trim().min(1).max(36).optional(),
      requestedByUserId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid context request" });
    try {
      const context = await createJobControlPlane().getContext(parsed.data.jobId, parsed.data.tenantId ? {
        tenantId: parsed.data.tenantId,
        requestedByUserId: parsed.data.requestedByUserId,
      } : undefined);
      if (!context) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      return res.json({ context });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/status", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      jobId: z.string().trim().min(1).max(36),
      includeDispatches: z.boolean().default(true),
      tenantId: z.string().trim().min(1).max(36).optional(),
      requestedByUserId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid status request" });
    try {
      getDb();
      const snapshot = await createJobControlPlane().getStatus(parsed.data.jobId, parsed.data.tenantId ? {
        tenantId: parsed.data.tenantId,
        requestedByUserId: parsed.data.requestedByUserId,
      } : undefined);
      if (!snapshot) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      const dispatches: DispatchObservation[] = parsed.data.includeDispatches
        ? await db.select({
          adapter: workerJobDispatches.adapter,
          referenceNamespace: workerJobDispatches.referenceNamespace,
          dedupeKey: workerJobDispatches.dedupeKey,
          publicationStatus: workerJobDispatches.publicationStatus,
          queueJobId: workerJobDispatches.queueJobId,
          celeryTaskId: workerJobDispatches.celeryTaskId,
          providerJobId: workerJobDispatches.providerJobId,
          workflowInstanceId: workerJobDispatches.workflowInstanceId,
          containerInstanceId: workerJobDispatches.containerInstanceId,
          createdAt: workerJobDispatches.createdAt,
          publishedAt: workerJobDispatches.publishedAt,
          consumedAt: workerJobDispatches.consumedAt,
        })
          .from(workerJobDispatches)
          .where(eq(workerJobDispatches.workerJobId, parsed.data.jobId))
          .orderBy(desc(workerJobDispatches.createdAt))
          .limit(20)
        : [];
      return res.json({
        status: snapshot,
        transportObservations: dispatches.map(dispatch => ({
          ...dispatch,
          createdAt: dispatch.createdAt.toISOString(),
          publishedAt: dispatch.publishedAt?.toISOString() ?? null,
          consumedAt: dispatch.consumedAt?.toISOString() ?? null,
        })),
      });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/latest", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      taskName: z.string().trim().min(1).max(200),
      tenantId: z.string().trim().min(1).max(36).optional(),
      requestedByUserId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid latest-job request" });
    if (process.env.FEATURE_186_HARD_CUTOVER === "true" && !parsed.data.tenantId) {
      return res.status(400).json({ error: "JOB_TENANT_REQUIRED" });
    }
    try {
      getDb();
      const [job] = await db.select({ jobId: workerJobs.id })
        .from(workerJobs)
        .where(and(
          eq(workerJobs.jobType, "python.legacy_task"),
          sql`${workerJobs.inputJson}->>'taskName' = ${parsed.data.taskName}`,
          ...(parsed.data.tenantId ? [eq(workerJobs.tenantId, parsed.data.tenantId)] : []),
          ...(parsed.data.requestedByUserId ? [eq(workerJobs.requestedByUserId, parsed.data.requestedByUserId)] : []),
        ))
        .orderBy(desc(workerJobs.createdAt), desc(workerJobs.id))
        .limit(1);
      return res.json({ jobId: job?.jobId ?? null });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/legacy-status", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      taskName: z.string().trim().min(1).max(200).optional(),
      taskId: z.string().trim().min(1).max(255),
      tenantId: z.string().trim().min(1).max(36).optional(),
      requestedByUserId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid legacy status request" });
    try {
      getDb();
      const taskIdJson = JSON.stringify([parsed.data.taskId]);
      const conditions = [
        eq(workerJobs.jobType, "python.legacy_task"),
        sql`(
          ${workerJobs.id} = ${parsed.data.taskId}
          OR
          ${workerJobs.inputJson}->'kwargs'->>'task_id' = ${parsed.data.taskId}
          OR ${workerJobs.inputJson}->'kwargs'->>'taskId' = ${parsed.data.taskId}
          OR ${workerJobs.inputJson}->'args' @> ${taskIdJson}::jsonb
        )`,
      ];
      if (parsed.data.taskName) {
        conditions.push(sql`${workerJobs.inputJson}->>'taskName' = ${parsed.data.taskName}`);
      }
      if (parsed.data.tenantId) conditions.push(eq(workerJobs.tenantId, parsed.data.tenantId));
      if (parsed.data.requestedByUserId) conditions.push(eq(workerJobs.requestedByUserId, parsed.data.requestedByUserId));
      const [job] = await db.select({ jobId: workerJobs.id })
        .from(workerJobs)
        .where(and(...conditions))
        .orderBy(desc(workerJobs.createdAt), desc(workerJobs.id))
        .limit(1);
      if (!job) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      const snapshot = await createJobControlPlane().getStatus(job.jobId);
      if (!snapshot) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      return res.json({ status: snapshot });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/cancel", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      jobId: z.string().trim().min(1).max(36),
      reason: z.string().trim().min(1).max(500).default("cancelled_by_request"),
      actionId: z.string().trim().min(1).max(128),
      actorId: z.number().int().positive().optional(),
      tenantId: z.string().trim().min(1).max(36).optional(),
      requestedByUserId: z.number().int().positive().optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid cancel request" });
    try {
      await createJobControlPlane().cancel(
        parsed.data.jobId,
        parsed.data.reason,
        parsed.data.actionId,
        parsed.data.actorId,
        parsed.data.tenantId ? {
          tenantId: parsed.data.tenantId,
          requestedByUserId: parsed.data.requestedByUserId,
        } : undefined,
      );
      return res.json({ ok: true, jobId: parsed.data.jobId });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/claim", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({ jobId: z.string().min(1).max(36), runnerId: z.string().min(1).max(160), adapter: z.string().min(1).max(80), attemptId: z.string().min(1).max(80).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid claim request" });
    try {
      const lease = await createJobControlPlane().claim(parsed.data);
      return res.json({ lease });
    } catch (error) { return fail(res, error); }
  });

  const leaseAction = (path: string, action: (lease: z.infer<typeof leaseSchema>, body: Record<string, unknown>) => Promise<void>) => {
    app.post(`/api/internal/job-control-plane/${path}`, async (req, res) => {
      if (!internalAuth(req, res)) return;
      const parsed = leaseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid lease request" });
      try { await action(parsed.data, req.body as Record<string, unknown>); return res.json({ ok: true }); }
      catch (error) { return fail(res, error); }
    });
  };

  leaseAction("start", (lease) => createJobControlPlane().start(lease));
  leaseAction("assert-active", (lease) => createJobControlPlane().assertActive(lease));
  leaseAction("heartbeat", (lease) => createJobControlPlane().heartbeat(lease));
  leaseAction("wait-for-external", (lease, body) => createJobControlPlane().waitForExternal(lease, externalWaitSchema.parse(body.externalWait)));
  leaseAction("progress", (lease, body) => {
    const progress = progressSchema.parse(body.progress);
    return createJobControlPlane().progress(lease, progress);
  });
  leaseAction("legacy-progress", (lease, body) => {
    const legacyStatus = legacyStatusSchema.parse(body.legacyStatus);
    return createJobControlPlane().reportLegacyStatus(lease, legacyStatus);
  });
  leaseAction("complete", (lease, body) => createJobControlPlane().complete(lease, resultSchema.parse(body.result)));
  leaseAction("fail", (lease, body) => createJobControlPlane().fail(lease, errorSchema.parse(body.error)));

  app.post("/api/internal/job-control-plane/resume-external", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({
      jobId: z.string().min(1),
      runnerId: z.string().min(1).max(160),
      adapter: z.string().min(1).max(80),
      resumeKey: z.string().trim().min(1).max(255).optional(),
      inputJson: z.record(z.unknown()).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid external resume request" });
    try {
      const resumed = await createJobControlPlane().resumeExternal(
        parsed.data.jobId,
        parsed.data.runnerId,
        parsed.data.adapter,
        parsed.data.inputJson,
        parsed.data.resumeKey,
      );
      return res.json({ resumed });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/complete-external", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = externalSettlementSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.resultRef) return res.status(400).json({ error: "Invalid external completion request" });
    try {
      const completed = await createJobControlPlane().completeExternal(
        parsed.data.jobId,
        parsed.data.resultRef,
        parsed.data.operationKey,
        new Date(),
        parsed.data.pollerLeaseTokenHash,
      );
      return res.json({ completed });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/fail-external-wait", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = externalSettlementSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.reason) return res.status(400).json({ error: "Invalid external failure request" });
    try {
      const failed = await createJobControlPlane().failExternalWait(
        parsed.data.jobId,
        parsed.data.reason,
        parsed.data.operatorReviewRequired ?? false,
        new Date(),
        parsed.data.operationKey,
        parsed.data.pollerLeaseTokenHash,
      );
      return res.json({ failed });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/register-external-provider", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = externalRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid external provider registration request" });
    try {
      const { registerPostgresProviderOperation } = await import("../services/postgresProviderSchedulerRepository");
      const registered = await registerPostgresProviderOperation({
        ...parsed.data,
        nextPollAt: new Date(parsed.data.nextPollAt),
        providerDeadlineAt: new Date(parsed.data.providerDeadlineAt),
      });
      return res.json({ registered });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/callback", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = callbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid callback request" });
    try {
      const result = await recordAuthenticatedJobCallback({ ...parsed.data, signatureVerified: true });
      return res.json(result);
    } catch (error) { return fail(res, error); }
  });
}
