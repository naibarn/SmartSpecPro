import { randomUUID } from "crypto";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db";
import { automationJobs } from "../../drizzle/schema";
import type { AutomationJob, InsertAutomationJob } from "../../drizzle/schema";
import { deductCredits, addCredits } from "./creditService";
import { getRedisClient } from "./redis";
import { emitPublicApiEvent } from "./webhookDeliveryService";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_JOB_TYPES = [
  "skill_execution",
  "media_generation",
  "agency_run",
  "batch_skill",
  "presentation_create",
  "video_project_create",
  "pipeline",
] as const;

export type JobType = (typeof VALID_JOB_TYPES)[number];

export const MAX_SINGLE_JOB_CREDITS = 10_000;
export const AUTOMATION_JOBS_QUEUE = "automation-jobs";
export const MAX_PIPELINE_DURATION_MS = 30 * 60 * 1000;
export const MAX_STEP_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_PIPELINE_STEPS = 20;

// ---------------------------------------------------------------------------
// Credit estimates by job type
// ---------------------------------------------------------------------------

const CREDIT_ESTIMATES: Record<JobType, number> = {
  skill_execution: 10,
  media_generation: 5,
  agency_run: 20,
  batch_skill: 50,
  presentation_create: 50,
  video_project_create: 30,
  pipeline: 100,
};

function estimateCredits(type: JobType, params: Record<string, unknown>): number {
  if (type === "video_project_create") {
    const quality = (params.quality as string) ?? "standard";
    const durationMinutes = (params.duration_minutes as number) ?? 1;
    const rateMap: Record<string, number> = { draft: 3, standard: 5, high: 10 };
    return Math.ceil(durationMinutes * (rateMap[quality] ?? 5));
  }
  if (type === "pipeline") {
    const steps = params.steps as unknown[] | undefined;
    return (steps?.length ?? 1) * 20;
  }
  const maxCredits = params.max_credits as number | undefined;
  return maxCredits ?? CREDIT_ESTIMATES[type];
}

// ---------------------------------------------------------------------------
// Pipeline template resolution
// ---------------------------------------------------------------------------

const TEMPLATE_REGEX = /\{\{steps\.(\w+)\.result\.([a-zA-Z0-9_.]+)\}\}/g;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function resolveTemplates(
  value: string,
  stepResults: Record<string, Record<string, unknown>>,
): string {
  return value.replace(TEMPLATE_REGEX, (_match, stepId, path) => {
    const stepResult = stepResults[stepId];
    if (!stepResult) return "";
    const resolved = getNestedValue(stepResult, path);
    if (resolved === undefined || resolved === null) return "";
    return String(resolved);
  });
}

function resolveParamsTemplates(
  params: Record<string, unknown>,
  stepResults: Record<string, Record<string, unknown>>,
  depth: number = 0,
): Record<string, unknown> {
  if (depth >= 5) return params;

  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string" && val.includes("{{steps.")) {
      const resolvedVal = resolveTemplates(val, stepResults);
      resolved[key] = resolvedVal;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      resolved[key] = resolveParamsTemplates(val as Record<string, unknown>, stepResults, depth + 1);
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

function detectCycles(steps: Array<{ id: string; params: Record<string, unknown> }>): boolean {
  const deps: Map<string, Set<string>> = new Map();
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    const stepDeps = new Set<string>();
    const paramsStr = JSON.stringify(step.params);
    const matches = [...paramsStr.matchAll(TEMPLATE_REGEX)];
    for (const match of matches) {
      const depId = match[1];
      if (stepIds.has(depId) && depId !== step.id) {
        stepDeps.add(depId);
      }
    }
    deps.set(step.id, stepDeps);
  }

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const dep of deps.get(nodeId) ?? []) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (inStack.has(dep)) {
        return true;
      }
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      if (dfs(step.id)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// BullMQ Queue (optional initialization)
// ---------------------------------------------------------------------------

let automationQueue: any = null;
let automationWorker: any = null;

export function initAutomationJobsQueue(): void {
  try {
    // Lazy import to avoid crashing if BullMQ is not available in test env
    const { Queue, Worker } = require("bullmq");
    const connection = getRedisClient();
    automationQueue = new Queue(AUTOMATION_JOBS_QUEUE, { connection });
    automationWorker = new Worker(
      AUTOMATION_JOBS_QUEUE,
      async (bullJob: any) => {
        await executeJob(bullJob.data.jobId);
      },
      { connection, concurrency: 3 },
    );
    automationWorker.on("failed", (job: any, err: Error) => {
      console.error(`[automation-jobs] Job ${job?.id} failed:`, err.message);
    });
  } catch (err) {
    console.warn("[automation-jobs] BullMQ initialization skipped:", (err as Error).message);
  }
}

export async function closeAutomationJobsQueue(): Promise<void> {
  try {
    await automationWorker?.close();
    await automationQueue?.close();
  } catch {
    // ignore
  }
}

async function enqueueJob(jobId: string, type: string, params: unknown, auth: any): Promise<void> {
  if (automationQueue) {
    await automationQueue.add("execute", { jobId, type, params, auth });
  }
  // If queue not initialized, job stays in "pending" state until manually triggered
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

export interface CreateJobParams {
  type: string;
  params: Record<string, unknown>;
  idempotencyKey?: string;
  callbackUrl?: string;
  maxCredits?: number;
}

export interface JobAuth {
  userId: number;
  tenantId: string;
  apiKeyId: string;
}

export async function createJob(
  input: CreateJobParams,
  auth: JobAuth,
): Promise<AutomationJob> {
  const { type, params, idempotencyKey, callbackUrl, maxCredits } = input;

  // Validate job type
  if (!VALID_JOB_TYPES.includes(type as JobType)) {
    const err: any = new Error(
      `Job type '${type}' is not supported. Valid types: ${VALID_JOB_TYPES.join(", ")}`,
    );
    err.code = "invalid_job_type";
    throw err;
  }

  // Pipeline validation
  if (type === "pipeline") {
    const steps = params.steps as Array<{ id: string; type: string; params: Record<string, unknown> }> | undefined;
    if (!steps || steps.length === 0) {
      const err: any = new Error("Pipeline must have at least one step");
      err.code = "invalid_request";
      throw err;
    }
    if (steps.length > MAX_PIPELINE_STEPS) {
      const err: any = new Error(`Pipeline may not exceed ${MAX_PIPELINE_STEPS} steps`);
      err.code = "invalid_request";
      throw err;
    }
    // Validate steps reference real step IDs
    const stepIds = new Set(steps.map((s) => s.id));
    const paramsStr = JSON.stringify(steps);
    const matches = [...paramsStr.matchAll(TEMPLATE_REGEX)];
    for (const match of matches) {
      if (!stepIds.has(match[1])) {
        const err: any = new Error(`Pipeline step references unknown step '${match[1]}'`);
        err.code = "invalid_pipeline";
        throw err;
      }
    }
    if (detectCycles(steps)) {
      const err: any = new Error("Circular step reference detected in pipeline");
      err.code = "circular_pipeline_reference";
      throw err;
    }
  }

  // Credit estimation
  const estimated = maxCredits ?? estimateCredits(type as JobType, params);
  if (estimated > MAX_SINGLE_JOB_CREDITS) {
    const err: any = new Error(
      `Estimated cost of ${estimated} credits exceeds maximum of ${MAX_SINGLE_JOB_CREDITS} per job`,
    );
    err.code = "credit_overflow";
    throw err;
  }

  const drizzle = db.instance;

  // Idempotency check — return existing job if same key exists for this tenant
  if (idempotencyKey) {
    const existing = await drizzle
      .select()
      .from(automationJobs)
      .where(
        and(
          eq(automationJobs.idempotencyKey, idempotencyKey),
          eq(automationJobs.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
  }

  // Reserve credits
  await deductCredits({
    userId: auth.userId,
    amount: estimated,
    sourceType: "api_job",
    description: `Job reservation: ${type}`,
  } as any);

  // Insert job record
  const jobId = randomUUID();
  const traceId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const insertData: InsertAutomationJob = {
    id: jobId,
    tenantId: auth.tenantId,
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    type,
    status: "pending",
    params,
    creditsReserved: estimated,
    creditsUsed: 0,
    callbackUrl: callbackUrl ?? null,
    idempotencyKey: idempotencyKey ?? null,
    traceId,
    expiresAt,
  };

  const inserted = await drizzle
    .insert(automationJobs)
    .values(insertData)
    .returning();

  const job = inserted[0];

  // Enqueue for async execution
  await enqueueJob(jobId, type, params, auth);

  return job;
}

export async function executeJob(jobId: string): Promise<void> {
  const drizzle = db.instance;
  const rows = await drizzle
    .select()
    .from(automationJobs)
    .where(eq(automationJobs.id, jobId))
    .limit(1);

  if (!rows.length) {
    console.error(`[JobAutomation] Job ${jobId} not found`);
    return;
  }

  const job = rows[0];

  // Mark running
  await drizzle
    .update(automationJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(automationJobs.id, jobId));

  try {
    // Emit progress: job started (0%)
    emitPublicApiEvent(job.tenantId, "job.progress", {
      job_id: jobId,
      type: job.type,
      progress_pct: 0,
      status: "running",
    }).catch(() => {});

    // Stub execution — in production, dispatch to actual services
    const result: Record<string, unknown> = {
      jobId,
      type: job.type,
      message: `Job ${job.type} executed via automation service`,
    };

    // Emit progress: job almost done (80%)
    emitPublicApiEvent(job.tenantId, "job.progress", {
      job_id: jobId,
      type: job.type,
      progress_pct: 80,
      status: "running",
    }).catch(() => {});

    // Finalize
    const creditsUsed = Math.min(job.creditsReserved, Math.ceil(job.creditsReserved * 0.8));
    const refundAmount = job.creditsReserved - creditsUsed;

    await drizzle
      .update(automationJobs)
      .set({ status: "completed", result, creditsUsed, completedAt: new Date() })
      .where(eq(automationJobs.id, jobId));

    if (refundAmount > 0) {
      await addCredits({
        userId: job.userId,
        amount: refundAmount,
        type: "refund",
        description: `Job refund: ${jobId}`,
        sourceType: "api_job",
      } as any);
    }

    // Emit completion event — fans out to webhook endpoints AND SSE subscribers
    emitPublicApiEvent(job.tenantId, "job.completed", {
      job_id: jobId,
      type: job.type,
      status: "completed",
      credits_used: creditsUsed,
      result,
    }).catch(() => {
      // non-fatal
    });
  } catch (execErr: any) {
    await drizzle
      .update(automationJobs)
      .set({
        status: "failed",
        error: { message: execErr.message ?? "Unknown error" },
        completedAt: new Date(),
      })
      .where(eq(automationJobs.id, jobId));

    // Refund all reserved credits on failure
    if (job.creditsReserved > 0) {
      await addCredits({
        userId: job.userId,
        amount: job.creditsReserved,
        type: "refund",
        description: `Job failure refund: ${jobId}`,
        sourceType: "api_job",
      } as any).catch((e: Error) =>
        console.error(`[JobAutomation] Refund failed for job ${jobId}:`, e.message),
      );
    }

    // Emit failure event — fans out to webhook endpoints AND SSE subscribers
    emitPublicApiEvent(job.tenantId, "job.failed", {
      job_id: jobId,
      type: job.type,
      status: "failed",
      error: execErr.message,
    }).catch(() => {
      // non-fatal
    });
  }
}

export async function cancelJob(jobId: string, tenantId: string, userId: number): Promise<AutomationJob> {
  const drizzle = db.instance;
  const rows = await drizzle
    .select()
    .from(automationJobs)
    .where(and(eq(automationJobs.id, jobId), eq(automationJobs.tenantId, tenantId)))
    .limit(1);

  if (!rows.length) {
    const err: any = new Error("Job not found");
    err.code = "not_found";
    throw err;
  }

  const job = rows[0];

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    const err: any = new Error(`Job cannot be cancelled (status: ${job.status})`);
    err.code = "job_not_cancellable";
    throw err;
  }

  await drizzle
    .update(automationJobs)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(automationJobs.id, jobId));

  // Refund reserved credits
  if (job.creditsReserved > 0) {
    await addCredits({
      userId: job.userId,
      amount: job.creditsReserved,
      type: "refund",
      description: `Job cancellation refund: ${jobId}`,
      sourceType: "api_job",
    } as any).catch((e: Error) =>
      console.error(`[JobAutomation] Cancel refund failed:`, e.message),
    );
  }

  return { ...job, status: "cancelled" };
}

export async function listJobs(
  tenantId: string,
  options: { status?: string; page?: number; limit?: number },
): Promise<{ jobs: AutomationJob[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const drizzle = db.instance;

  const conditions = [eq(automationJobs.tenantId, tenantId)];
  if (options.status) {
    conditions.push(eq(automationJobs.status, options.status));
  }

  const [{ value: total }] = await drizzle
    .select({ value: count() })
    .from(automationJobs)
    .where(and(...conditions));

  const rows = await drizzle
    .select()
    .from(automationJobs)
    .where(and(...conditions))
    .orderBy(desc(automationJobs.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return { jobs: rows, total };
}

export async function getJob(jobId: string, tenantId: string): Promise<AutomationJob | null> {
  const drizzle = db.instance;
  const rows = await drizzle
    .select()
    .from(automationJobs)
    .where(and(eq(automationJobs.id, jobId), eq(automationJobs.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}
