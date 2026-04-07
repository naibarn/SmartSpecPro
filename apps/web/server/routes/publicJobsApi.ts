import { Router } from "express";
import { z } from "zod";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { sanitizeUri, assertPublicIp, ApiValidationError } from "../services/ssrfValidation";
import {
  createJob,
  cancelJob,
  listJobs,
  getJob,
  VALID_JOB_TYPES,
  MAX_SINGLE_JOB_CREDITS,
} from "../services/jobAutomationService";
import {
  buildDelegatedWorkerOriginMetadata,
  DelegatedWorkerPlatformError,
  runWithDelegatedWorkerExecution,
} from "../services/delegatedWorkerPlatformService";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateJobSchema = z.object({
  type: z.enum(VALID_JOB_TYPES),
  params: z.record(z.unknown()),
  idempotency_key: z.string().max(64).optional(),
  callback_url: z.string().url().max(2048).optional(),
  max_credits: z.number().int().positive().max(MAX_SINGLE_JOB_CREDITS).optional(),
});

// ---------------------------------------------------------------------------
// Error mapper
// ---------------------------------------------------------------------------

function mapJobError(err: any, res: any): boolean {
  const code = err?.code as string | undefined;
  switch (code) {
    case "invalid_job_type":
    case "invalid_request":
    case "invalid_pipeline":
      sendApiError(res, 400, code, err.message);
      return true;
    case "credit_overflow":
      sendApiError(res, 400, "credit_overflow", err.message);
      return true;
    case "circular_pipeline_reference":
    case "max_template_depth_exceeded":
      sendApiError(res, 400, code, err.message);
      return true;
    case "not_found":
      sendApiError(res, 404, "not_found", err.message ?? "Job not found");
      return true;
    case "job_not_cancellable":
      sendApiError(res, 409, "job_not_cancellable", err.message);
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicJobsRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /v1/jobs
  // -------------------------------------------------------------------------
  router.post("/", requireScopes("jobs:create"), async (req, res) => {
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(
        res,
        400,
        "invalid_request",
        parsed.error.issues.map((i) => i.message).join("; "),
      );
      return;
    }

    const auth = req.auth!;
    const userId = (auth as any).userId as number;
    const tenantId = (auth as any).tenantId as string;
    const apiKeyId = (auth as any).apiKeyId as string;
    const idempotencyKey = parsed.data.idempotency_key ?? req.get("Idempotency-Key") ?? undefined;

    // SSRF protection: validate callbackUrl before storing
    let safeCallbackUrl: string | undefined;
    if (parsed.data.callback_url) {
      try {
        const sanitized = sanitizeUri(parsed.data.callback_url);
        await assertPublicIp(new URL(sanitized).hostname);
        safeCallbackUrl = sanitized;
      } catch (err) {
        if (err instanceof ApiValidationError) {
          sendApiError(res, 400, "invalid_request", err.message);
          return;
        }
        throw err;
      }
    }

    try {
      const job = await runWithDelegatedWorkerExecution({
        auth,
        actionClass: "compute",
        estimatedCredits: parsed.data.max_credits ?? 1,
        idempotencyKey,
      }, async () =>
        createJob(
          {
            type: parsed.data.type,
            params: parsed.data.params,
            idempotencyKey,
            callbackUrl: safeCallbackUrl,
            maxCredits: parsed.data.max_credits,
            metadata: buildDelegatedWorkerOriginMetadata(auth, "jobs.create", {
              endpoint: "/v1/jobs",
              jobType: parsed.data.type,
              callbackUrl: safeCallbackUrl ?? null,
              maxCredits: parsed.data.max_credits ?? null,
            }),
          },
          { userId, tenantId, apiKeyId },
        ));

      res.status(201).json({
        id: job.id,
        type: job.type,
        status: job.status,
        credits_reserved: job.creditsReserved,
        created_at: job.createdAt,
      });
    } catch (err: any) {
      if (err instanceof DelegatedWorkerPlatformError) {
        sendApiError(res, err.statusCode, err.code, err.message, err.type);
        return;
      }
      if (mapJobError(err, res)) return;
      console.error("[PublicJobsApi] create error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/jobs
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("jobs:read"), async (req, res) => {
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;
    const statusRaw = req.query.status as string | undefined;
    const statusParsed = z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional().safeParse(statusRaw);
    if (!statusParsed.success) {
      sendApiError(res, 400, "invalid_request", "Invalid status filter. Allowed: pending, running, completed, failed, cancelled");
      return;
    }
    const status = statusParsed.data;
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;

    try {
      const { jobs, total } = await listJobs(tenantId, { status, page, limit });

      res.json({
        jobs: jobs.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          credits_reserved: j.creditsReserved,
          credits_used: j.creditsUsed,
          created_at: j.createdAt,
          completed_at: j.completedAt ?? null,
        })),
        pagination: { page, limit, total, has_more: (page - 1) * limit + jobs.length < total },
      });
    } catch (err: any) {
      console.error("[PublicJobsApi] list error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/jobs/:jobId
  // -------------------------------------------------------------------------
  router.get("/:jobId", requireScopes("jobs:read"), async (req, res) => {
    const { jobId } = req.params;
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    try {
      const job = await getJob(jobId, tenantId);

      if (!job) {
        sendApiError(res, 404, "not_found", "Job not found");
        return;
      }

      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        params: job.params,
        result: job.result ?? null,
        error: job.error ?? null,
        progress: job.progress,
        credits_reserved: job.creditsReserved,
        credits_used: job.creditsUsed,
        created_at: job.createdAt,
        started_at: job.startedAt ?? null,
        completed_at: job.completedAt ?? null,
      });
    } catch (err: any) {
      console.error("[PublicJobsApi] get error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /v1/jobs/:jobId
  // -------------------------------------------------------------------------
  router.delete("/:jobId", requireScopes("jobs:create"), async (req, res) => {
    const { jobId } = req.params;
    const auth = req.auth!;
    const userId = (auth as any).userId as number;
    const tenantId = (auth as any).tenantId as string;

    try {
      const job = await cancelJob(jobId, tenantId, userId);

      res.json({
        id: job.id,
        status: "cancelled",
      });
    } catch (err: any) {
      if (mapJobError(err, res)) return;
      console.error("[PublicJobsApi] cancel error", err);
      if (!res.headersSent) {
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    }
  });

  return router;
}
