import type { Request, Response } from "express";
import { z } from "zod";
import type { createControlPlaneJob } from "../services/jobControlPlaneGateway";

type Admission = Parameters<typeof createControlPlaneJob>[0];
type Dependencies = {
  authenticate: (token: string | undefined) => boolean;
  systemTenant: () => string | undefined;
  createJob: (input: Admission) => Promise<{ jobId: string; created: boolean }>;
  now?: () => Date;
};
function reply(res: Response, status: number, payload: unknown) {
  return res.status(status).set("Cache-Control", "private, no-store").json(payload);
}

/** Fixed system admission only. The original job/outbox and occurrence ledger
 * own deduplication and execution; neither caller nor Worker selects a tenant. */
export function createSpec260EvidenceRetentionScheduleHandler(dependencies: Dependencies) {
  return async (req: Request, res: Response) => {
    if (req.method !== "POST" || req.header("x-spec260-schedule") !== "evidence-retention-v1" ||
      !dependencies.authenticate(req.header("x-internal-token"))) {
      return reply(res, 401, { error: "SPEC260_SCHEDULE_AUTH_REQUIRED" });
    }
    const body = z
      .object({
        scheduledTime: z.number().int().positive().max(8_000_000_000_000),
        occurrenceKey: z.string().trim().min(1).max(96),
      })
      .strict()
      .safeParse(req.body);
    if (!body.success)
      return reply(res, 400, { error: "SPEC260_SCHEDULE_REQUEST_INVALID" });
    const scheduledAt = new Date(body.data.scheduledTime);
    const requestedOccurrence = `${new Date(Math.floor(scheduledAt.getTime() / 300_000) * 300_000).toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
    const admissionTime = dependencies.now?.() ?? new Date();
    if (
      admissionTime.getTime() - scheduledAt.getTime() >
        7 * 24 * 60 * 60_000 ||
      scheduledAt.getTime() - admissionTime.getTime() > 5 * 60_000 ||
      body.data.occurrenceKey !== requestedOccurrence
    ) {
      return reply(res, 400, {
        error: "SPEC260_SCHEDULE_OCCURRENCE_INVALID",
      });
    }
    const tenantId = dependencies.systemTenant()?.trim();
    if (!tenantId)
      return reply(res, 503, {
        error: "SPEC260_SYSTEM_TENANT_NOT_CONFIGURED",
      });
    const boundedTenant = req.header("x-spec260-schedule-tenant");
    const boundedExpiry = req.header("x-spec260-schedule-expires-at");
    if ((boundedTenant !== undefined || boundedExpiry !== undefined) &&
        (boundedTenant !== tenantId || !(Date.parse(boundedExpiry ?? "") > admissionTime.getTime()))) {
      return reply(res, 401, { error: "SPEC260_SCHEDULE_SCOPE_DENIED" });
    }
    const scheduleId = "spec260-emergency-evidence-retention";
    // Missed ticks coalesce into the current bucket. All ticks for that bucket
    // must produce identical canonical input, otherwise the occurrence ledger
    // correctly rejects the changed definition as an idempotency conflict.
    const occurrenceKey = `${new Date(Math.floor(admissionTime.getTime() / 300_000) * 300_000).toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
    const idempotencyKey = `feature-186:${scheduleId}:${occurrenceKey}`;
    try {
      const job = await dependencies.createJob({
        context: {
          tenantId,
          actorType: "system",
          authorizationScope: `system:schedule:${scheduleId}`,
          correlationId: idempotencyKey,
          idempotencyKey,
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "emergency.evidence.retention",
          executionClass: "short",
          priority: 80,
          input: {
            maxRows: 100,
            requestedOccurrenceKey: occurrenceKey,
          },
          idempotencyKey,
          retryPolicy: {
            maxAttempts: 3,
            baseDelayMs: 5_000,
            maxDelayMs: 15 * 60_000,
            jitter: "bounded",
            deadlineMs: 6 * 60 * 60 * 1000,
            allowedErrorClasses: ["retryable", "timeout", "unavailable"],
          },
          timeoutPolicy: {
            softTimeoutMs: 10 * 60_000,
            hardTimeoutMs: 30 * 60 * 1000,
          },
          schedule: {
            scheduleId,
            occurrenceKey,
            scheduleVersion: "1",
            timezone: "UTC",
            missedOccurrencePolicy: "coalesce",
          },
        },
        createOptions: { runtimeType: "node_job_worker" },
      });
      return reply(res, 202, { accepted: true, jobId: job.jobId, created: job.created });
    } catch {
      console.error("[Spec260] evidence retention schedule admission failed");
      return reply(res, 503, { error: "SPEC260_SCHEDULE_ADMISSION_FAILED" });
    }
  };
}
