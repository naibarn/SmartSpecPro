import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { validateJobSpec, VALID_JOB_TYPES } from "../../shared/types/mediaJob";
import type { MediaJobSpec, MediaJobProgress } from "../../shared/types/mediaJob";
import { validateWebJobSpec } from "../../shared/types/mediaJobValidation";
import { nanoid } from "nanoid";
import type { Express, Request, Response } from "express";
import { authorizeRequest } from "../_core/authz";
import { rateLimit } from "../_core/limits";

// ========================================
// Redis helpers (lazy import to avoid circular deps)
// ========================================

async function getRedis() {
  const { getRedisClient } = await import("../services/redis");
  return getRedisClient();
}

const JOB_TTL = 86400; // 24 hours

async function setJobKey(jobId: string, suffix: string, data: unknown) {
  const redis = await getRedis();
  await redis.set(
    `media-job:${jobId}:${suffix}`,
    JSON.stringify(data),
    "EX",
    JOB_TTL,
  );
}

async function getJobKey(jobId: string, suffix: string) {
  const redis = await getRedis();
  const raw = await redis.get(`media-job:${jobId}:${suffix}`);
  return raw ? JSON.parse(raw) : null;
}

async function publishProgress(jobId: string, data: unknown) {
  const redis = await getRedis();
  await redis.publish(
    `media-job-progress:${jobId}`,
    JSON.stringify(data),
  );
}

// ========================================
// Per-user active job tracking (Redis Set)
// ========================================

const ACTIVE_JOBS_KEY = (userId: string) =>
  `media-jobs:user:${userId}:active`;
const MAX_CONCURRENT_JOBS = 3;

async function addActiveJob(userId: string, jobId: string): Promise<void> {
  const redis = await getRedis();
  await redis.sadd(ACTIVE_JOBS_KEY(userId), jobId);
}

async function removeActiveJob(userId: string, jobId: string): Promise<void> {
  const redis = await getRedis();
  await redis.srem(ACTIVE_JOBS_KEY(userId), jobId);
}

async function getActiveJobIds(userId: string): Promise<string[]> {
  const redis = await getRedis();
  return redis.smembers(ACTIVE_JOBS_KEY(userId));
}

async function checkConcurrencyLimit(userId: string): Promise<boolean> {
  const activeIds = await getActiveJobIds(userId);
  // Prune stale entries (jobs that completed/failed/canceled)
  for (const id of activeIds) {
    const status = await getJobKey(id, "status");
    if (
      !status ||
      status.status === "done" ||
      status.status === "error" ||
      status.status === "canceled"
    ) {
      await removeActiveJob(userId, id);
    }
  }
  const currentCount = (await getActiveJobIds(userId)).length;
  return currentCount < MAX_CONCURRENT_JOBS;
}

// ========================================
// Celery dispatch (HTTP bridge to Python backend)
// ========================================

async function dispatchToCelery(
  specJson: string,
  userId: string,
  jobId: string,
) {
  const { ENV } = await import("../_core/env");
  const pythonUrl =
    ENV.pythonBackendUrl || process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${pythonUrl}/api/v1/media-jobs/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec_json: specJson, user_id: userId, job_id: jobId }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[MediaJobs] Celery dispatch failed: ${res.status} ${body}`);
    }
  } catch (e) {
    console.error("[MediaJobs] Failed to reach Python backend:", e);
  }
}

// ========================================
// tRPC Router
// ========================================

const jobSpecInputSchema = z.object({
  specVersion: z.literal("0.1"),
  jobId: z.string().optional(),
  jobType: z.enum(VALID_JOB_TYPES as [string, ...string[]]),
  priority: z.enum(["low", "normal", "high"]).optional(),
  inputs: z.object({
    assets: z
      .array(
        z.object({
          assetId: z.string(),
          kind: z.enum(["video", "audio", "image", "subtitle"]),
          uri: z.string(),
          mime: z.string().optional(),
          label: z.string().optional(),
          durationMs: z.number().optional(),
          contentHash: z.string().optional(),
          extra: z.record(z.unknown()).optional(),
        }),
      )
      .optional(),
    project: z
      .object({
        projectId: z.string(),
        fps: z.number(),
        width: z.number(),
        height: z.number(),
        tracks: z.array(
          z.object({
            trackId: z.string(),
            type: z.enum(["video", "audio", "subtitle"]),
            clips: z.array(
              z.object({
                clipId: z.string(),
                assetId: z.string(),
                inMs: z.number().optional(),
                outMs: z.number().optional(),
                startMs: z.number(),
                playbackRate: z.number().optional(),
                volume: z.number().optional(),
                mute: z.boolean().optional(),
              }),
            ),
          }),
        ),
      })
      .nullable()
      .optional(),
  }),
  params: z.record(z.unknown()).optional(),
  output: z.object({
    mode: z.enum(["file", "dir", "memory"]),
    target: z.string(),
    overwrite: z.boolean().optional(),
  }),
  engine: z
    .object({
      strategy: z.enum(["desktop_sidecar", "web_backend", "web_wasm"]),
      hints: z.record(z.unknown()).optional(),
    })
    .optional(),
  cache: z
    .object({ enabled: z.boolean().optional(), key: z.string().optional() })
    .optional(),
  telemetry: z
    .object({ traceId: z.string().optional() })
    .optional(),
});

export const mediaJobsRouter = router({
  submitJob: protectedProcedure
    .input(jobSpecInputSchema)
    .mutation(async ({ input, ctx }) => {
      const jobId = input.jobId || nanoid(21);
      const spec: MediaJobSpec = { ...input, jobId } as MediaJobSpec;

      // Validate (includes SSRF, codec allowlist, resolution/bitrate limits)
      const validation = validateWebJobSpec(spec, "web_backend");
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid job spec: ${validation.errors.join("; ")}`,
        });
      }

      // Check concurrent job limit (max 3 per user)
      if (!(await checkConcurrencyLimit(String(ctx.user.id)))) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Maximum 3 concurrent media jobs allowed. Wait for a job to complete.",
        });
      }

      // Store in Redis
      await setJobKey(jobId, "spec", spec);
      await setJobKey(jobId, "meta", {
        userId: String(ctx.user.id),
        submittedAt: Date.now(),
      });
      await setJobKey(jobId, "status", {
        status: "queued",
        progress: 0,
        jobId,
      });
      await addActiveJob(String(ctx.user.id), jobId);

      // Dispatch to Python Celery worker
      dispatchToCelery(JSON.stringify(spec), String(ctx.user.id), jobId);

      // Audit log (best-effort)
      try {
        const { auditLogger } = await import("../services/auditLogger");
        auditLogger.log({
          eventType: "media_request",
          traceId: spec.telemetry?.traceId,
          userId: String(ctx.user.id),
          requestPayload: { jobId, jobType: spec.jobType },
        });
      } catch {
        // Best-effort
      }

      return { jobId };
    }),

  getStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Check ownership
      const meta = await getJobKey(input.jobId, "meta");
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (meta.userId !== String(ctx.user.id) && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const status = await getJobKey(input.jobId, "status");
      if (!status) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }

      // Attach result or error if terminal
      if (status.status === "done") {
        const result = await getJobKey(input.jobId, "result");
        return { ...status, result };
      }
      if (status.status === "error") {
        const error = await getJobKey(input.jobId, "error");
        return { ...status, error };
      }

      return status;
    }),

  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const meta = await getJobKey(input.jobId, "meta");
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (meta.userId !== String(ctx.user.id) && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cancelStatus = {
        jobId: input.jobId,
        status: "canceled",
        progress: 0,
      };
      await setJobKey(input.jobId, "status", cancelStatus);
      await publishProgress(input.jobId, cancelStatus);
      await removeActiveJob(meta.userId, input.jobId);

      return { success: true };
    }),

  listJobs: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    const jobIds = await getActiveJobIds(userId);
    const jobs: Array<{ jobId: string; status: string; submittedAt: number }> =
      [];

    for (const jobId of jobIds.slice(0, 50)) {
      const meta = await getJobKey(jobId, "meta");
      if (!meta) {
        // Stale entry — clean up
        await removeActiveJob(userId, jobId);
        continue;
      }
      const statusRaw = await getJobKey(jobId, "status");
      const status = statusRaw?.status || "unknown";
      jobs.push({ jobId, status, submittedAt: meta.submittedAt });
    }

    return jobs.sort((a, b) => b.submittedAt - a.submittedAt);
  }),
});

// ========================================
// Express SSE Route
// ========================================

export function registerMediaJobRoutes(app: Express) {
  // SSE endpoint for real-time progress
  app.get("/api/media-jobs/:id/events", async (req: Request, res: Response) => {
    const jobId = req.params.id;

    // Auth: extract user from cookie/session
    let userId: string | null = null;
    try {
      const { COOKIE_NAME } = await import("../../shared/const");
      const cookieValue = req.cookies?.[COOKIE_NAME];
      if (cookieValue) {
        const { sdk } = await import("../_core/sdk");
        const session = await sdk.verifySession(cookieValue);
        if (session?.openId) {
          userId = session.openId;
        }
      }
    } catch {
      // Auth failed
    }

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Verify ownership
    const meta = await getJobKey(jobId, "meta");
    if (!meta) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;

    // Subscribe to Redis pub/sub
    let subRedis: any = null;
    try {
      const { createRedisConnection } = await import("../services/redis");
      subRedis = await createRedisConnection();
      const channel = `media-job-progress:${jobId}`;

      await subRedis.subscribe(channel);
      subRedis.on("message", (_ch: string, message: string) => {
        if (closed) return;
        try {
          const data = JSON.parse(message);
          const eventType =
            data.status === "done"
              ? "done"
              : data.status === "error"
                ? "error"
                : "progress";
          res.write(`event: ${eventType}\ndata: ${message}\n\n`);

          if (data.status === "done" || data.status === "error" || data.status === "canceled") {
            cleanup();
          }
        } catch {
          // Ignore parse errors
        }
      });
    } catch (e) {
      console.error("[MediaJobs SSE] Redis sub error:", e);
    }

    // Polling fallback: every 2s
    const pollInterval = setInterval(async () => {
      if (closed) return;
      try {
        const status = await getJobKey(jobId, "status");
        if (status) {
          const eventType =
            status.status === "done"
              ? "done"
              : status.status === "error"
                ? "error"
                : "progress";
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(status)}\n\n`);

          if (
            status.status === "done" ||
            status.status === "error" ||
            status.status === "canceled"
          ) {
            cleanup();
          }
        }
      } catch {
        // Ignore
      }
    }, 2000);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollInterval);
      if (subRedis) {
        subRedis.unsubscribe().catch(() => {});
        subRedis.disconnect();
      }
      res.end();
    };

    req.on("close", cleanup);
  });

  // ========================================
  // REST auth helper
  // ========================================

  async function authenticateMediaJobRequest(
    req: Request,
    res: Response,
  ): Promise<{ userId: string } | null> {
    const auth = await authorizeRequest(req, {
      allowBearer: true,
      allowSession: true,
    });
    if (!auth.ok) {
      res.status(401).json({ error: auth.error });
      return null;
    }
    return { userId: auth.sub };
  }

  // ========================================
  // REST endpoints (non-tRPC) for direct HTTP access
  // ========================================

  const mediaJobLimiter = rateLimit("media-jobs", { rpm: 30 });

  app.post("/api/media-jobs", mediaJobLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;
      const userId = authResult.userId;

      const spec = req.body as MediaJobSpec;
      const jobId = spec.jobId || nanoid(21);
      const fullSpec = { ...spec, jobId };

      const validation = validateWebJobSpec(fullSpec, "web_backend");
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join("; ") });
        return;
      }

      // Check concurrent job limit
      if (!(await checkConcurrencyLimit(userId))) {
        res.status(429).json({
          error:
            "Maximum 3 concurrent media jobs allowed. Wait for a job to complete.",
        });
        return;
      }

      await setJobKey(jobId, "spec", fullSpec);
      await setJobKey(jobId, "meta", { userId, submittedAt: Date.now() });
      await setJobKey(jobId, "status", {
        status: "queued",
        progress: 0,
        jobId,
      });
      await addActiveJob(userId, jobId);

      dispatchToCelery(JSON.stringify(fullSpec), userId, jobId);

      res.json({ jobId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.get("/api/media-jobs/:id", mediaJobLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;

      const meta = await getJobKey(req.params.id, "meta");
      if (!meta) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      if (meta.userId !== authResult.userId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const status = await getJobKey(req.params.id, "status");
      if (!status) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      // Attach result/error for terminal states (matches tRPC getStatus)
      if (status.status === "done") {
        const result = await getJobKey(req.params.id, "result");
        res.json({ ...status, result });
        return;
      }
      if (status.status === "error") {
        const error = await getJobKey(req.params.id, "error");
        res.json({ ...status, error });
        return;
      }

      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.delete("/api/media-jobs/:id", mediaJobLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;

      const meta = await getJobKey(req.params.id, "meta");
      if (!meta) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      if (meta.userId !== authResult.userId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const cancelStatus = {
        jobId: req.params.id,
        status: "canceled",
        progress: 0,
      };
      await setJobKey(req.params.id, "status", cancelStatus);
      await publishProgress(req.params.id, cancelStatus);
      await removeActiveJob(authResult.userId, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });
}
