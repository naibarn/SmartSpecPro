import { createHash } from "node:crypto";

import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { getMiniAppFactoryProfileStages, selectReadyMiniAppFactoryStages } from "./miniAppFactoryPipeline";
import { executeMiniAppFactoryStages, type MiniAppFactoryStageOutput } from "./miniAppFactoryRunExecutor";
import { failMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import type { JobExecutor } from "./jobExecutor";
import type { JobDefinition } from "./jobControlPlaneTypes";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
import type { DevelopmentRunScope, createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";
import { registerJobSettlementHook } from "./jobSettlementHooks";
import { getDb } from "../db";
import { appIdentities, workerJobs } from "../../drizzle/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export const MINI_APP_FACTORY_STAGE_JOB_TYPE = "mini_app_factory.stage";
export const MINI_APP_FACTORY_STAGE_CONTRACT = "mini-app-factory-stage-v1";
const stageIdPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

export type MiniAppFactoryStageJobInput = {
  contractVersion: typeof MINI_APP_FACTORY_STAGE_CONTRACT;
  runId: string;
  stageId: string;
};

type DevelopmentRunService = ReturnType<typeof createDevelopmentRunService>;
export type MiniAppFactoryStageWorkerRuntime = {
  pipeline: MiniAppFactoryPipeline;
  service: DevelopmentRunService;
  createRunnerStage?: (input: {
    pipeline: MiniAppFactoryPipeline;
    stage: NonNullable<MiniAppFactoryPipeline["stages"][number]>;
    run: MiniAppFactoryStageScope;
  }) => Promise<{ runId: string; jobId: string; created: boolean; state: "PENDING_AUTHORIZATION" }>;
  /** Test-only opt-in; production composition must use createRunnerStage. */
  allowSyntheticExecution?: boolean;
  /** Hosted executor is permitted only for the PERSONAL_MINIAPP profile. */
  allowHostedPersonalExecution?: boolean;
  executeStage: (stageId: string, context: {
    runId: string;
    tenantId: string;
    actorId: number;
    completedScope: string[];
    artifacts: string[];
    canonicalRevision: string;
    attempt: number;
  }) => Promise<MiniAppFactoryStageOutput>;
};

export type MiniAppFactoryStageScope = DevelopmentRunScope & { runId: string };
let configuredWorkerRuntime: MiniAppFactoryStageWorkerRuntime | null = null;

/** Installed only by trusted server/worker startup composition. */
export function configureMiniAppFactoryStageWorkerRuntime(runtime: MiniAppFactoryStageWorkerRuntime | null): void {
  configuredWorkerRuntime = runtime;
}

export function getConfiguredMiniAppFactoryStageWorkerRuntime(): MiniAppFactoryStageWorkerRuntime | null {
  return configuredWorkerRuntime;
}

export function parseMiniAppFactoryStageJobInput(value: unknown): MiniAppFactoryStageJobInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FACTORY_STAGE_JOB_INPUT_INVALID");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 3 ||
    !Object.keys(input).every(key => ["contractVersion", "runId", "stageId"].includes(key)) ||
    input.contractVersion !== MINI_APP_FACTORY_STAGE_CONTRACT ||
    typeof input.runId !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.runId) ||
    typeof input.stageId !== "string" || !stageIdPattern.test(input.stageId)) {
    throw new Error("FACTORY_STAGE_JOB_INPUT_INVALID");
  }
  return input as unknown as MiniAppFactoryStageJobInput;
}

export function buildMiniAppFactoryStageJobDefinition(input: {
  tenantId: string;
  actorId: number;
  runId: string;
  stageId: string;
  retrySequence?: number;
}): Omit<JobDefinition, "requestedByUserId"> {
  const retrySequence = input.retrySequence ?? 0;
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.runId) || !stageIdPattern.test(input.stageId) || !Number.isSafeInteger(retrySequence) || retrySequence < 0 || retrySequence > 20) {
    throw new Error("FACTORY_STAGE_JOB_INPUT_INVALID");
  }
  const identity = `${input.tenantId}:${input.actorId}:${input.runId}:${input.stageId}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  const attemptDigest = createHash("sha256").update(`${identity}:retry:${retrySequence}`).digest("hex");
  return {
    contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT,
    jobType: MINI_APP_FACTORY_STAGE_JOB_TYPE,
    executionClass: "long",
    input: { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: input.runId, stageId: input.stageId },
    idempotencyKey: `mini-app-factory-stage:${attemptDigest}`,
    activeDedupeKey: `mini-app-factory-stage:${digest}`,
    retryPolicy: {
      // The durable DevelopmentRun retryState owns the cross-job budget.
      // Keep each business attempt single-shot so retries cannot multiply billing.
      maxAttempts: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      jitter: "bounded",
      deadlineMs: 24 * 60 * 60 * 1000,
      deadlineMode: "fixed",
      allowedErrorClasses: ["retryable"],
    },
    timeoutPolicy: { softTimeoutMs: 15 * 60 * 1000, hardTimeoutMs: 20 * 60 * 1000 },
    requiredCapabilities: { miniAppFactory: true },
  };
}

const AUTO_RECOVERABLE_FACTORY_ERRORS = /^(?:LLMStructuredOutputError|PersonalMiniAppGenerationError|MINI_APP_FIELD_REPAIR_FAILED|MINI_APP_GENERATED_CONTENT_INVALID|JOB_DEADLINE_EXPIRED|JOB_HARD_TIMEOUT|WORKER_TIMEOUT|LEASE_EXPIRED|LEASE_EXPIRED_RETRYING|TimeoutError|AbortError|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ECONNREFUSED|HTTP_?(?:408|429|5\d\d)|PROVIDER_(?:UNAVAILABLE|TIMEOUT|RATE_LIMITED)|GATEWAY_(?:UNAVAILABLE|TIMEOUT)|(?:08|40)[0-9A-Z]{3})$/i;

export function isAutoRecoverableMiniAppFactoryError(code: unknown): boolean {
  return typeof code === "string" && AUTO_RECOVERABLE_FACTORY_ERRORS.test(code.trim());
}

/** Enqueue a bounded, same-run attempt. Its active-dedupe key prevents parallel billing. */
export async function scheduleMiniAppFactoryStageRetry(input: {
  pipeline: MiniAppFactoryPipeline;
  service: DevelopmentRunService;
  run: MiniAppFactoryStageScope;
  appId: string;
  stageId: string;
  retrySequence?: number;
  /** Permit one non-billable source-only resume after the Gateway budget is exhausted. */
  candidateRepair?: boolean;
  createJob?: typeof createControlPlaneJob;
}): Promise<{ jobId: string; stageId: string; attempt: number; created: boolean }> {
  if (!/^app_[A-Za-z0-9_-]{1,120}$/.test(input.appId) || !stageIdPattern.test(input.stageId)) {
    throw new Error("FACTORY_RETRY_BINDING_INVALID");
  }
  const current = await input.service.get(input.run);
  if (!current.run.workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
  const state = parseMiniAppFactoryDurableState(current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  if (state.profile !== "PERSONAL_MINIAPP" || state.miniAppId !== input.appId) {
    throw new Error("MINI_APP_RUN_BINDING_MISMATCH");
  }
  const eligible = selectReadyMiniAppFactoryStages(input.pipeline, current.run.workUnit, state.profile);
  if (eligible[0] !== input.stageId || !current.run.workUnit.progress.remainingScope.includes(input.stageId)) {
    throw new Error("MINI_APP_STAGE_NO_LONGER_ELIGIBLE");
  }
  const candidateRepairRef = state.artifacts.find(value => value.startsWith("app-candidate:r2://"))?.slice("app-candidate:".length);
  if (input.candidateRepair && (
    state.retryState.status !== "EXHAUSTED" || state.retryState.attempt !== 3 ||
    state.candidateRepairAttempts >= 2 || !candidateRepairRef ||
    !new RegExp(`^r2://mini-app-candidates/${input.run.tenantId}/${input.appId}/run-[a-f0-9]{16}/sha256/[a-f0-9]{64}$`).test(candidateRepairRef)
  )) throw new Error("MINI_APP_CANDIDATE_REPAIR_NOT_ELIGIBLE");
  let attempt = input.candidateRepair ? 3 : input.retrySequence ?? state.retryState.attempt + 1;
  if (input.retrySequence === undefined && state.retryState.status === "RETRY_SCHEDULED") {
    const priorDefinition = buildMiniAppFactoryStageJobDefinition({ ...input.run, stageId: input.stageId, retrySequence: state.retryState.attempt });
    const [priorJob] = await getDb().select({ id: workerJobs.id, status: workerJobs.status })
      .from(workerJobs).where(eq(workerJobs.idempotencyKey, priorDefinition.idempotencyKey)).limit(1);
    if (!priorJob || ["pending", "queued", "leased", "running", "waiting_external", "retry_scheduled"].includes(priorJob.status)) {
      attempt = state.retryState.attempt;
    }
  }
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 3) throw new Error("MINI_APP_STAGE_RETRY_EXHAUSTED");
  const scheduledState = {
    ...state,
    retryState: { status: "RETRY_SCHEDULED" as const, attempt },
    ...(input.candidateRepair ? { candidateRepairAttempts: state.candidateRepairAttempts + 1 } : {}),
    currentStage: input.stageId,
    deliveryMilestone: state.appSourceDigest ? state.deliveryMilestone : "BUILDING" as const,
    blockerState: { status: "NONE" as const, code: null },
  };
  const retryEventKey = input.candidateRepair
    ? `miniapp-factory-candidate-repair:${input.run.runId}:${input.stageId}:${state.candidateRepairAttempts + 1}`
    : `miniapp-factory-retry:${input.run.runId}:${input.stageId}:${attempt}`;
  const existingRetryEvent = current.events.find(event => event.idempotencyKey === retryEventKey);
  if (existingRetryEvent) {
    const payload = existingRetryEvent.payload;
    if (existingRetryEvent.type !== "VERIFICATION_OUTCOME" ||
      payload.profile !== "PERSONAL_MINIAPP" || payload.stageId !== input.stageId ||
      payload.outcome !== (input.candidateRepair ? "CANDIDATE_REPAIR_SCHEDULED" : "RETRY_SCHEDULED") || payload.attempt !== attempt) {
      throw new Error("MINI_APP_RETRY_IDEMPOTENCY_CONFLICT");
    }
  } else {
    await input.service.recordVerificationEvent({
      ...input.run,
      type: "VERIFICATION_OUTCOME",
      idempotencyKey: retryEventKey,
      payload: { profile: "PERSONAL_MINIAPP", stageId: input.stageId, outcome: input.candidateRepair ? "CANDIDATE_REPAIR_SCHEDULED" : "RETRY_SCHEDULED", attempt },
      runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: scheduledState },
    });
  }
  const queued = await enqueueNextMiniAppFactoryStage({
    pipeline: input.pipeline,
    service: input.service,
    run: input.run,
    retrySequence: input.candidateRepair ? 4 + state.candidateRepairAttempts : attempt,
    ...(input.createJob ? { createJob: input.createJob } : {}),
  });
  if (queued.stageId !== input.stageId || !queued.jobId) throw new Error("MINI_APP_STAGE_RETRY_ENQUEUE_FAILED");
  return { jobId: queued.jobId, stageId: input.stageId, attempt, created: queued.created };
}

export async function enqueueNextMiniAppFactoryStage(input: {
  pipeline: MiniAppFactoryPipeline;
  service: DevelopmentRunService;
  run: MiniAppFactoryStageScope;
  createJob?: typeof createControlPlaneJob;
  executorRegistry?: JobExecutorRegistry;
  createRunnerStage?: MiniAppFactoryStageWorkerRuntime["createRunnerStage"];
  retrySequence?: number;
}): Promise<{
  stageId: string | null;
  jobId: string | null;
  created: boolean;
  state: "ENQUEUED" | "WAITING_AUTHORIZATION" | "WAITING_DEPENDENCY" | "IMPLEMENTATION_SCOPE_COMPLETE";
}> {
  const current = await input.service.get(input.run);
  const unit = current.run.workUnit;
  if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
  const storedState = current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY];
  const profile = storedState ? parseMiniAppFactoryDurableState(storedState).profile : "PERSONAL_MINIAPP";
  const eligibleStages = getMiniAppFactoryProfileStages(input.pipeline, profile);
  const remaining = unit.progress.remainingScope.filter(scope => eligibleStages.some(stage => stage.id === scope));
  if (remaining.length === 0) return { stageId: null, jobId: null, created: false, state: "IMPLEMENTATION_SCOPE_COMPLETE" };
  const ready = selectReadyMiniAppFactoryStages(input.pipeline, unit, profile);
  if (ready.length === 0) return { stageId: null, jobId: null, created: false, state: "WAITING_DEPENDENCY" };
  const stageId = ready[0]!;
  if (input.createRunnerStage) {
    const stage = input.pipeline.stages.find(candidate => candidate.id === stageId)!;
    const child = await input.createRunnerStage({ pipeline: input.pipeline, stage, run: input.run });
    return { stageId, jobId: child.jobId, created: child.created, state: "WAITING_AUTHORIZATION" };
  }
  const createJob = input.createJob ?? createControlPlaneJob;
  const job = await createJob({
    context: {
      tenantId: input.run.tenantId,
      actorType: "user",
      actorId: input.run.actorId,
      authorizationScope: "mini_app_factory.stage",
      correlationId: `mini-app-factory:${input.run.runId}:${stageId}`,
    },
    definition: buildMiniAppFactoryStageJobDefinition({ ...input.run, stageId, retrySequence: input.retrySequence }),
    ...(input.executorRegistry ? { executorRegistry: input.executorRegistry } : {}),
  });
  return { stageId, jobId: job.jobId, created: job.created, state: "ENQUEUED" };
}

const MINI_APP_FACTORY_RECOVERY_ACTIVE_JOB_STATES = new Set([
  "pending", "queued", "leased", "claimed", "preparing", "running",
  "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing",
]);
const MINI_APP_FACTORY_RECOVERY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

/**
 * Reconcile Personal Mini-App DevelopmentRuns independently of App Home reads.
 * The sweep only repairs work already authorized by a persisted owner/run
 * binding; all writes still go through the canonical DevelopmentRun and
 * worker_jobs/outbox APIs.
 */
export async function reconcileMiniAppFactoryStageRuns(input: {
  pipeline?: MiniAppFactoryPipeline;
  service?: DevelopmentRunService;
  limit?: number;
  now?: Date;
  runId?: string;
} = {}): Promise<{ scanned: number; scheduled: number; exhausted: number; skipped: number; errors: number }> {
  const runtime = getConfiguredMiniAppFactoryStageWorkerRuntime();
  const pipeline = input.pipeline ?? runtime?.pipeline;
  const service = input.service ?? runtime?.service;
  if (!pipeline || !service) throw new Error("FACTORY_STAGE_RUNTIME_NOT_CONFIGURED");
  const limit = Math.max(1, Math.min(200, Math.trunc(input.limit ?? 100)));
  const now = input.now ?? new Date();
  const rootFilters = [sql`
    ${workerJobs.progressJson}->'spec224'->'metadata'->'miniAppFactoryProgramState'->>'profile' = 'PERSONAL_MINIAPP'
    AND ${workerJobs.progressJson}->'developmentLifecycle'->'workUnit' IS NOT NULL
  `];
  if (input.runId) rootFilters.push(sql`${workerJobs.progressJson}->'spec224'->>'runId' = ${input.runId}`);
  const roots = await getDb().select({
    id: workerJobs.id,
    tenantId: workerJobs.tenantId,
    requestedByUserId: workerJobs.requestedByUserId,
    status: workerJobs.status,
    progressJson: workerJobs.progressJson,
  }).from(workerJobs).where(and(...rootFilters)).orderBy(asc(workerJobs.createdAt)).limit(limit);

  const summary = { scanned: 0, scheduled: 0, exhausted: 0, skipped: 0, errors: 0 };
  for (const root of roots) {
    summary.scanned += 1;
    try {
      if (!root.requestedByUserId) { summary.skipped += 1; continue; }
      const projection = root.progressJson.spec224;
      if (!projection || typeof projection !== "object" || Array.isArray(projection)) { summary.skipped += 1; continue; }
      const run = projection as Record<string, unknown>;
      const runId = typeof run.runId === "string" ? run.runId : "";
      const metadata = run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)
        ? run.metadata as Record<string, unknown>
        : {};
      const state = parseMiniAppFactoryDurableState(metadata[MINI_APP_FACTORY_STATE_KEY]);
      if (!runId || state.profile !== "PERSONAL_MINIAPP" || !state.miniAppId) { summary.skipped += 1; continue; }
      const lifecycle = root.progressJson.developmentLifecycle;
      const workUnit = lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle)
        ? (lifecycle as Record<string, unknown>).workUnit
        : null;
      if (!workUnit || typeof workUnit !== "object" || Array.isArray(workUnit)) { summary.skipped += 1; continue; }
      const [identity] = await getDb().select({ appId: appIdentities.appId })
        .from(appIdentities).where(and(
          eq(appIdentities.appId, state.miniAppId),
          eq(appIdentities.tenantId, root.tenantId),
          eq(appIdentities.ownerUserId, root.requestedByUserId),
        )).limit(1);
      if (!identity) { summary.skipped += 1; continue; }

      const scope = { runId, tenantId: root.tenantId, actorId: root.requestedByUserId };
      const current = await service.get(scope);
      const unit = current.run.workUnit;
      if (!unit || unit.progress.remainingScope.length === 0) { summary.skipped += 1; continue; }
      const stageId = selectReadyMiniAppFactoryStages(pipeline, unit, state.profile)[0];
      if (!stageId) { summary.skipped += 1; continue; }
      const stageJobs = await getDb().select({
        id: workerJobs.id,
        status: workerJobs.status,
        errorCode: workerJobs.errorCode,
        finishedAt: workerJobs.finishedAt,
        inputJson: workerJobs.inputJson,
        createdAt: workerJobs.createdAt,
      }).from(workerJobs).where(and(
        eq(workerJobs.tenantId, root.tenantId),
        eq(workerJobs.requestedByUserId, root.requestedByUserId),
        eq(workerJobs.jobType, MINI_APP_FACTORY_STAGE_JOB_TYPE),
        sql`${workerJobs.inputJson}->>'runId' = ${runId}`,
      )).orderBy(asc(workerJobs.createdAt));
      if (stageJobs.some(job => MINI_APP_FACTORY_RECOVERY_ACTIVE_JOB_STATES.has(job.status))) {
        summary.skipped += 1;
        continue;
      }
      const stageJobsForStage = stageJobs.filter(job => job.inputJson.stageId === stageId);
      const latestStageJob = stageJobsForStage.at(-1);
      if (latestStageJob?.status === "cancelled" || latestStageJob?.status === "canceled") {
        summary.skipped += 1;
        continue;
      }
      let candidateRepair = false;
      if (latestStageJob && ["failed", "expired"].includes(latestStageJob.status)) {
        if (!isAutoRecoverableMiniAppFactoryError(latestStageJob.errorCode)) {
          summary.skipped += 1;
          continue;
        }
        candidateRepair = state.retryState.status === "EXHAUSTED" && state.retryState.attempt === 3 &&
          state.candidateRepairAttempts < 2 && state.artifacts.some(value =>
            value.startsWith(`app-candidate:r2://mini-app-candidates/${root.tenantId}/${state.miniAppId}/run-`),
          );
        if (state.retryState.attempt >= 3 && !candidateRepair) {
          const failureCode = String(latestStageJob.errorCode || "FACTORY_STAGE_FAILED").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100);
          const exhaustedState = {
            ...state,
            retryState: { status: "EXHAUSTED" as const, attempt: state.retryState.attempt },
            deliveryMilestone: state.deliveryMilestone === "PREVIEW_AVAILABLE" || state.deliveryMilestone === "VERIFICATION_PENDING"
              ? state.deliveryMilestone
              : "BUILD_FAILED" as const,
            blockerState: { status: "BLOCKED_TRUE" as const, code: `MINI_APP_STAGE_RETRY_EXHAUSTED:${failureCode}` },
          };
          await service.recordVerificationEvent({
            ...scope,
            type: "VERIFICATION_OUTCOME",
            // Bind the terminal projection to this immutable job. A later
            // source-only repair can fail with a different code while the
            // Gateway attempt budget remains exhausted.
            idempotencyKey: `miniapp-factory-retry-exhausted:${runId}:${stageId}:${state.retryState.attempt}:${latestStageJob.id}`,
            payload: { profile: "PERSONAL_MINIAPP", stageId, outcome: "RETRY_EXHAUSTED", code: failureCode },
            runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: exhaustedState },
          });
          summary.exhausted += 1;
          continue;
        }
        const backoffMs = MINI_APP_FACTORY_RECOVERY_BACKOFF_MS[state.retryState.attempt] ?? 15 * 60_000;
        const failedAt = latestStageJob.finishedAt?.getTime() ?? latestStageJob.createdAt.getTime();
        if (now.getTime() < failedAt + backoffMs) { summary.skipped += 1; continue; }
      } else if (!latestStageJob && !["succeeded", "failed", "expired", "cancelled", "canceled"].includes(root.status)) {
        // A fresh anchor may still be dispatching its first stage.
        summary.skipped += 1;
        continue;
      } else if (latestStageJob?.status === "succeeded") {
        // A stage reported success without a durable WorkUnit checkpoint. Do
        // not silently bill another Gateway call; retain this inconsistency.
        summary.skipped += 1;
        continue;
      }

      const result = await scheduleMiniAppFactoryStageRetry({
        pipeline,
        service,
        run: scope,
        appId: state.miniAppId,
        stageId,
        ...(candidateRepair ? { candidateRepair: true } : {}),
      });
      if (result.created) summary.scheduled += 1;
      else summary.skipped += 1;
    } catch (error) {
      summary.errors += 1;
      console.warn("[MiniAppFactory] background recovery reconciliation deferred", {
        rootJobId: root.id,
        code: error instanceof Error ? error.message.slice(0, 120) : "FACTORY_RECOVERY_RECONCILE_FAILED",
      });
    }
  }
  return summary;
}

export function createMiniAppFactoryStageJobExecutor(
  resolveRuntime: () => MiniAppFactoryStageWorkerRuntime | null,
  options: { autoScheduleNext?: boolean } = {},
): JobExecutor {
  return async ({ context, lease, reporter, controlPlane }) => {
    const input = parseMiniAppFactoryStageJobInput(context.input);
    const actorId = context.requestedByUserId;
    if (!Number.isSafeInteger(actorId) || actorId! <= 0) throw new Error("FACTORY_STAGE_JOB_OWNER_REQUIRED");
    const runtime = resolveRuntime();
    if (!runtime) {
      const error = new Error("FACTORY_STAGE_RUNTIME_NOT_CONFIGURED") as Error & { class: "retryable"; diagnosticCode: string };
      error.class = "retryable";
      error.diagnosticCode = "FACTORY_STAGE_RUNTIME_NOT_CONFIGURED";
      throw error;
    }
    const run = { runId: input.runId, tenantId: context.tenantId, actorId: actorId! };
    const enqueueNext = async () => {
      if (options.autoScheduleNext === false) return null;
      const next = await enqueueNextMiniAppFactoryStage({
        pipeline: runtime.pipeline,
        service: runtime.service,
        run,
        ...(runtime.createRunnerStage && parseMiniAppFactoryDurableState((await runtime.service.get(run)).run.metadata?.[MINI_APP_FACTORY_STATE_KEY]).profile === "PLATFORM_SELF_DEVELOPMENT" ? { createRunnerStage: runtime.createRunnerStage } : {}),
        createJob: job => createControlPlaneJob({ ...job, controlPlane }),
      });
      return next.jobId;
    };
    const current = await runtime.service.get(run);
    const unit = current.run.workUnit;
    if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
    const durableState = parseMiniAppFactoryDurableState(current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
    const revisionMatch = /^git:([a-f0-9]{40})$/i.exec(current.run.baseRevision);
    if (durableState.profile === "PLATFORM_SELF_DEVELOPMENT" && (!revisionMatch || durableState.sourceSha !== revisionMatch[1]!.toLowerCase())) {
      throw new Error("FACTORY_STAGE_SOURCE_SHA_MISMATCH");
    }
    if (unit.progress.completedScope.includes(input.stageId)) {
      await reporter.assertActive(lease);
      const nextJobId = await enqueueNext();
      return { output: { stageId: input.stageId, state: "ALREADY_CHECKPOINTED", ...(nextJobId ? { nextJobId } : {}) } };
    }
    const ready = selectReadyMiniAppFactoryStages(runtime.pipeline, unit, durableState.profile);
    if (ready[0] !== input.stageId) throw new Error("FACTORY_STAGE_JOB_NOT_NEXT_ELIGIBLE");
    await reporter.assertActive(lease);
    if (durableState.profile === "PLATFORM_SELF_DEVELOPMENT" && runtime.createRunnerStage) {
      const stage = runtime.pipeline.stages.find(candidate => candidate.id === input.stageId)!;
      const child = await runtime.createRunnerStage({ pipeline: runtime.pipeline, stage, run });
      return { output: { stageId: input.stageId, state: "WAITING_AUTHORIZATION", childRunId: child.runId, jobId: child.jobId } };
    }
    if (durableState.profile === "PERSONAL_MINIAPP" && !runtime.allowHostedPersonalExecution && !runtime.allowSyntheticExecution) {
      throw new Error("FACTORY_HOSTED_PERSONAL_EXECUTOR_NOT_CONFIGURED");
    }
    if (durableState.profile === "PLATFORM_SELF_DEVELOPMENT" && !runtime.createRunnerStage && !runtime.allowSyntheticExecution) {
      const error = new Error("FACTORY_TRUSTED_RUNNER_ADAPTER_NOT_CONFIGURED") as Error & { class: "retryable"; diagnosticCode: string };
      error.class = "retryable";
      error.diagnosticCode = "FACTORY_TRUSTED_RUNNER_ADAPTER_NOT_CONFIGURED";
      throw error;
    }
    await reporter.progress(lease, { progress: 10, stage: input.stageId, message: "Factory stage execution started" });
    let result;
    try {
      result = await executeMiniAppFactoryStages({
        pipeline: runtime.pipeline,
        service: runtime.service,
        run,
        maxStages: 1,
        executeStage: (stageId, stageContext) => runtime.executeStage(stageId, {
          runId: run.runId,
          tenantId: run.tenantId,
          actorId: run.actorId,
          ...stageContext,
          attempt: context.attempt,
        }),
        beforeCheckpoint: async stageId => {
          if (stageId !== input.stageId) throw new Error("FACTORY_STAGE_JOB_BINDING_MISMATCH");
          await reporter.assertActive(lease);
        },
      });
    } catch (error) {
      const current = await runtime.service.get(run);
      const currentState = parseMiniAppFactoryDurableState(current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
      if (currentState.profile === "PERSONAL_MINIAPP") {
        const candidateRef = error && typeof error === "object" && "candidateRef" in error
          ? (error as { candidateRef?: unknown }).candidateRef
          : null;
        const preservedArtifacts = typeof candidateRef === "string" &&
          /^r2:\/\/mini-app-candidates\/[A-Za-z0-9_-]{1,64}\/app_[A-Za-z0-9_-]{1,120}\/run-[a-f0-9]{16}\/sha256\/[a-f0-9]{64}$/.test(candidateRef)
          ? [`app-candidate:${candidateRef}`]
          : [];
        const state = failMiniAppFactoryDurableState(
          currentState,
          error instanceof Error ? error.message.slice(0, 128).replace(/[^A-Za-z0-9_.:-]/g, "_") : "FACTORY_STAGE_FAILED",
          preservedArtifacts,
        );
        try {
          await runtime.service.recordVerificationEvent({
            ...run,
            type: "VERIFICATION_OUTCOME",
            // Worker attempts are single-shot canonical jobs, so context.attempt
            // restarts at 1 for each fenced retry job. Bind the event to the
            // immutable job ID as well or later retries collide with the first
            // failure and leave the durable state stuck at RETRY_SCHEDULED.
            idempotencyKey: `miniapp-factory-failed:${createHash("sha256").update(`${run.runId}:${input.stageId}:${context.jobId}:${context.attempt}`).digest("hex")}`,
            payload: { profile: "PERSONAL_MINIAPP", stageId: input.stageId, outcome: "BUILD_FAILED", code: state.blockerState.code },
            runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: state },
          });
        } catch {
          // The worker failure remains authoritative; the next durable attempt can repair a stale projection.
        }
        const failure = error && typeof error === "object" ? error as Record<string, unknown> : {};
        const recoveryCode = failure.code ?? failure.name ?? (error instanceof Error ? error.message.split(":", 1)[0] : null);
        if (isAutoRecoverableMiniAppFactoryError(recoveryCode)) {
          try {
            Object.assign(error as object, { class: "retryable" });
          } catch {
            // The job's terminal settlement hook still schedules a fenced replacement if the error is immutable.
          }
        }
      }
      throw error;
    }
    if (result.executedStages.length !== 1 || result.executedStages[0] !== input.stageId) {
      throw new Error("FACTORY_STAGE_JOB_NOT_EXECUTED");
    }
    await reporter.assertActive(lease);
    const nextJobId = await enqueueNext();
    return { output: {
      stageId: input.stageId,
      state: "CHECKPOINTED",
      nextEligibleStages: result.nextEligibleStages,
      ...(nextJobId ? { nextJobId } : {}),
    } };
  };
}

registerJobSettlementHook(MINI_APP_FACTORY_STAGE_JOB_TYPE, async jobId => {
  const [job] = await getDb().select({
    status: workerJobs.status,
    inputJson: workerJobs.inputJson,
  }).from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
  if (!job || !["succeeded", "failed", "expired"].includes(job.status)) return;
  const input = parseMiniAppFactoryStageJobInput(job.inputJson);
  if (!getConfiguredMiniAppFactoryStageWorkerRuntime()) return;
  try {
    await reconcileMiniAppFactoryStageRuns({ runId: input.runId, limit: 5 });
  } catch (error) {
    console.error("[MiniAppFactory] settlement recovery reconciliation failed", {
      jobId,
      runId: input.runId,
      errorCode: error instanceof Error ? error.message.slice(0, 120) : "FACTORY_AUTO_RECOVERY_FAILED",
    });
  }
});
