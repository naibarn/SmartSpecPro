import { createHash } from "node:crypto";

import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { selectReadyMiniAppFactoryStages } from "./miniAppFactoryPipeline";
import { executeMiniAppFactoryStages, type MiniAppFactoryStageOutput } from "./miniAppFactoryRunExecutor";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import type { JobExecutor } from "./jobExecutor";
import type { JobDefinition } from "./jobControlPlaneTypes";
import type { JobExecutorRegistry } from "./jobExecutorRegistry";
import type { DevelopmentRunScope, createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";

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
  executeStage: (stageId: string, context: {
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
}): Omit<JobDefinition, "requestedByUserId"> {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(input.runId) || !stageIdPattern.test(input.stageId)) {
    throw new Error("FACTORY_STAGE_JOB_INPUT_INVALID");
  }
  const identity = `${input.tenantId}:${input.actorId}:${input.runId}:${input.stageId}`;
  const digest = createHash("sha256").update(identity).digest("hex");
  return {
    contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT,
    jobType: MINI_APP_FACTORY_STAGE_JOB_TYPE,
    executionClass: "long",
    input: { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: input.runId, stageId: input.stageId },
    idempotencyKey: `mini-app-factory-stage:${digest}`,
    activeDedupeKey: `mini-app-factory-stage:${digest}`,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      jitter: "bounded",
      deadlineMs: 24 * 60 * 60 * 1000,
      allowedErrorClasses: ["retryable", "unknown"],
    },
    timeoutPolicy: { softTimeoutMs: 15 * 60 * 1000, hardTimeoutMs: 20 * 60 * 1000 },
    requiredCapabilities: { miniAppFactory: true },
  };
}

export async function enqueueNextMiniAppFactoryStage(input: {
  pipeline: MiniAppFactoryPipeline;
  service: DevelopmentRunService;
  run: MiniAppFactoryStageScope;
  createJob?: typeof createControlPlaneJob;
  executorRegistry?: JobExecutorRegistry;
}): Promise<{
  stageId: string | null;
  jobId: string | null;
  created: boolean;
  state: "ENQUEUED" | "WAITING_DEPENDENCY" | "IMPLEMENTATION_SCOPE_COMPLETE";
}> {
  const current = await input.service.get(input.run);
  const unit = current.run.workUnit;
  if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
  const remaining = unit.progress.remainingScope.filter(scope => input.pipeline.stages.some(stage => stage.id === scope));
  if (remaining.length === 0) return { stageId: null, jobId: null, created: false, state: "IMPLEMENTATION_SCOPE_COMPLETE" };
  const ready = selectReadyMiniAppFactoryStages(input.pipeline, unit);
  if (ready.length === 0) return { stageId: null, jobId: null, created: false, state: "WAITING_DEPENDENCY" };
  const stageId = ready[0]!;
  const createJob = input.createJob ?? createControlPlaneJob;
  const job = await createJob({
    context: {
      tenantId: input.run.tenantId,
      actorType: "user",
      actorId: input.run.actorId,
      authorizationScope: "mini_app_factory.stage",
      correlationId: `mini-app-factory:${input.run.runId}:${stageId}`,
    },
    definition: buildMiniAppFactoryStageJobDefinition({ ...input.run, stageId }),
    ...(input.executorRegistry ? { executorRegistry: input.executorRegistry } : {}),
  });
  return { stageId, jobId: job.jobId, created: job.created, state: "ENQUEUED" };
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
        createJob: job => createControlPlaneJob({ ...job, controlPlane }),
      });
      return next.jobId;
    };
    const current = await runtime.service.get(run);
    const unit = current.run.workUnit;
    if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
    const durableState = parseMiniAppFactoryDurableState(current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
    const revisionMatch = /^git:([a-f0-9]{40})$/i.exec(current.run.baseRevision);
    if (!revisionMatch || durableState.sourceSha !== revisionMatch[1]!.toLowerCase()) {
      throw new Error("FACTORY_STAGE_SOURCE_SHA_MISMATCH");
    }
    if (unit.progress.completedScope.includes(input.stageId)) {
      await reporter.assertActive(lease);
      const nextJobId = await enqueueNext();
      return { output: { stageId: input.stageId, state: "ALREADY_CHECKPOINTED", ...(nextJobId ? { nextJobId } : {}) } };
    }
    const ready = selectReadyMiniAppFactoryStages(runtime.pipeline, unit);
    if (ready[0] !== input.stageId) throw new Error("FACTORY_STAGE_JOB_NOT_NEXT_ELIGIBLE");
    await reporter.assertActive(lease);
    await reporter.progress(lease, { progress: 10, stage: input.stageId, message: "Factory stage execution started" });
    const result = await executeMiniAppFactoryStages({
      pipeline: runtime.pipeline,
      service: runtime.service,
      run,
      maxStages: 1,
      executeStage: (stageId, stageContext) => runtime.executeStage(stageId, {
        ...stageContext,
        attempt: context.attempt,
      }),
      beforeCheckpoint: async stageId => {
        if (stageId !== input.stageId) throw new Error("FACTORY_STAGE_JOB_BINDING_MISMATCH");
        await reporter.assertActive(lease);
      },
    });
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
