import { describe, expect, it, vi } from "vitest";
import { completeDevelopmentWorkUnit, createDevelopmentWorkUnit, recordCanonicalCheckpoint } from "./developmentLifecycleContracts";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { defaultJobExecutorRegistry } from "./jobExecutorRegistry";
import { POSTGRES_NODE_JOB_TYPES } from "../jobs/feature186JobTypes";
import {
  buildMiniAppFactoryStageJobDefinition,
  createMiniAppFactoryStageJobExecutor,
  enqueueNextMiniAppFactoryStage,
  isAutoRecoverableMiniAppFactoryError,
  scheduleMiniAppFactoryStageRetry,
  MINI_APP_FACTORY_STAGE_CONTRACT,
  parseMiniAppFactoryStageJobInput,
} from "./miniAppFactoryStageWorker";

const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "stage-worker-test",
  stages: [{ id: "SPEC", dependsOn: [] }, { id: "TEST", dependsOn: ["SPEC"] }],
};

function makeRun(profile: "PERSONAL_MINIAPP" | "PLATFORM_SELF_DEVELOPMENT" = "PERSONAL_MINIAPP") {
  const sha = "a".repeat(40);
  const workUnit = createDevelopmentWorkUnit({
    workId: "factory-worker-work",
    projectId: "factory-worker-project",
    repositoryId: "smartspecpro",
    source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
    objective: "Run a factory stage through worker_jobs and outbox",
    ownership: { actor: "1", session: "factory-worker-test", harness: "vitest" },
    canonicalTarget: { kind: "git", locator: "refs/heads/main" },
    baseRevision: sha,
  });
  workUnit.progress.remainingScope = ["SPEC", "TEST"];
  return buildDevelopmentRun({
    runId: "factory-worker-run", tenantId: "factory-worker-tenant", actorId: 1,
    goal: "Run stage worker binding", repositoryRef: "repo:smartspecpro", baseRevision: `git:${sha}`,
    contextPackHash: "b".repeat(64), workspaceId: "factory-worker-workspace", workUnit,
    metadata: { [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
      programId: "test-program", miniAppId: "app_test", sourceSha: sha,
      profile,
    }) },
  });
}

describe("Mini App Factory worker_jobs binding", () => {
  it("strictly parses a stage envelope and builds a stable idempotent long-job definition", () => {
    const input = { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: "factory-worker-run", stageId: "SPEC" };
    expect(parseMiniAppFactoryStageJobInput(input)).toEqual(input);
    expect(() => parseMiniAppFactoryStageJobInput({ ...input, tenantId: "forged" })).toThrow("FACTORY_STAGE_JOB_INPUT_INVALID");
    const definition = buildMiniAppFactoryStageJobDefinition({ tenantId: "tenant", actorId: 1, runId: input.runId, stageId: input.stageId });
    expect(definition.jobType).toBe("mini_app_factory.stage");
    expect(definition.executionClass).toBe("long");
    expect(defaultJobExecutorRegistry.has("mini_app_factory.stage", MINI_APP_FACTORY_STAGE_CONTRACT)).toBe(true);
    expect(defaultJobExecutorRegistry.has("mini_app_factory.recovery_sweep", "feature-186-v1")).toBe(true);
    expect(POSTGRES_NODE_JOB_TYPES.has("mini_app_factory.recovery_sweep")).toBe(true);
    expect(buildMiniAppFactoryStageJobDefinition({ tenantId: "tenant", actorId: 1, runId: input.runId, stageId: input.stageId }).idempotencyKey)
      .toBe(definition.idempotencyKey);
    const retry = buildMiniAppFactoryStageJobDefinition({ tenantId: "tenant", actorId: 1, runId: input.runId, stageId: input.stageId, retrySequence: 1 });
    expect(retry.idempotencyKey).not.toBe(definition.idempotencyKey);
    expect(retry.activeDedupeKey).toBe(definition.activeDedupeKey);
  });

  it("enqueues only the first dependency-ready stage through the canonical job producer", async () => {
    const run = makeRun();
    const createJob = vi.fn(async () => ({ jobId: "canonical-worker-job", created: true }));
    const result = await enqueueNextMiniAppFactoryStage({
      pipeline,
      service: { get: async () => ({ run, revision: 1, events: [] }) } as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      createJob: createJob as any,
    });
    expect(result).toEqual({ stageId: "SPEC", jobId: "canonical-worker-job", created: true, state: "ENQUEUED" });
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: run.tenantId, actorType: "user", actorId: run.actorId }),
      definition: expect.objectContaining({ jobType: "mini_app_factory.stage", input: expect.objectContaining({ runId: run.runId, stageId: "SPEC" }) }),
    }));
  });

  it("schedules a bounded recovery attempt on the existing Personal Mini-App run", async () => {
    const run = makeRun();
    const createJob = vi.fn(async () => ({ jobId: "same-run-recovery-job", created: true }));
    const service = {
      get: vi.fn(async () => ({ run, revision: 1, events: [] })),
      recordVerificationEvent: vi.fn(async () => ({ accepted: true })),
    };
    const recovered = await scheduleMiniAppFactoryStageRetry({
      pipeline,
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      appId: "app_test",
      stageId: "SPEC",
      createJob: createJob as any,
    });

    expect(recovered).toEqual({ jobId: "same-run-recovery-job", stageId: "SPEC", attempt: 1, created: true });
    expect(service.recordVerificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      runId: run.runId,
      idempotencyKey: `miniapp-factory-retry:${run.runId}:SPEC:1`,
      payload: expect.objectContaining({ outcome: "RETRY_SCHEDULED", attempt: 1 }),
    }));
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      definition: expect.objectContaining({ input: expect.objectContaining({ runId: run.runId, stageId: "SPEC" }) }),
    }));
  });

  it("bounds automatic repair to recoverable errors and three durable attempts", async () => {
    expect(isAutoRecoverableMiniAppFactoryError("LLMStructuredOutputError")).toBe(true);
    expect(isAutoRecoverableMiniAppFactoryError("ETIMEDOUT")).toBe(true);
    expect(isAutoRecoverableMiniAppFactoryError("MINI_APP_OWNER_BINDING_NOT_FOUND")).toBe(false);
    const run = makeRun();
    const exhausted = {
      ...run,
      metadata: {
        [MINI_APP_FACTORY_STATE_KEY]: {
          ...run.metadata?.[MINI_APP_FACTORY_STATE_KEY],
          retryState: { status: "READY", attempt: 3 },
        },
      },
    };
    await expect(scheduleMiniAppFactoryStageRetry({
      pipeline,
      service: { get: async () => ({ run: exhausted, revision: 1, events: [] }) } as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      appId: "app_test",
      stageId: "SPEC",
    })).rejects.toThrow("MINI_APP_STAGE_RETRY_EXHAUSTED");
  });

  it("allows one non-billable same-run candidate repair after three Gateway attempts", async () => {
    const run = makeRun();
    const candidateRef = `r2://mini-app-candidates/${run.tenantId}/app_test/run-${"a".repeat(16)}/sha256/${"b".repeat(64)}`;
    const exhausted = {
      ...run,
      metadata: {
        [MINI_APP_FACTORY_STATE_KEY]: {
          ...run.metadata?.[MINI_APP_FACTORY_STATE_KEY],
          retryState: { status: "EXHAUSTED", attempt: 3 },
          artifacts: [`app-candidate:${candidateRef}`],
        },
      },
    };
    const createJob = vi.fn(async () => ({ jobId: "same-run-candidate-repair", created: true }));
    const service = {
      get: vi.fn(async () => ({ run: exhausted, revision: 1, events: [] })),
      recordVerificationEvent: vi.fn(async () => ({ accepted: true })),
    };
    const repaired = await scheduleMiniAppFactoryStageRetry({
      pipeline, service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      appId: "app_test", stageId: "SPEC", candidateRepair: true,
      createJob: createJob as any,
    });
    expect(repaired).toEqual({ jobId: "same-run-candidate-repair", stageId: "SPEC", attempt: 3, created: true });
    expect(service.recordVerificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: `miniapp-factory-candidate-repair:${run.runId}:SPEC`,
      payload: expect.objectContaining({ outcome: "CANDIDATE_REPAIR_SCHEDULED", attempt: 3 }),
    }));
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      definition: expect.objectContaining({ idempotencyKey: expect.any(String) }),
    }));
  });

  it("persists exactly the leased stage checkpoint before returning success and resumes duplicate delivery idempotently", async () => {
    let run = makeRun();
    let revision = 0;
    const service = {
      get: async () => ({ run, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        run = { ...run, workUnit: recordCanonicalCheckpoint(run.workUnit!, input.checkpoint) };
        revision += 1;
        return { run, revision };
      },
      recordImplementationCompletion: async (input: any) => {
        run = { ...run, workUnit: completeDevelopmentWorkUnit(run.workUnit!, input.completion) };
        revision += 1;
        return { run, revision };
      },
    };
    const executeStage = vi.fn(async (stageId: string) => ({ artifacts: [`artifact:${stageId}`] }));
    const assertActive = vi.fn(async () => undefined);
    const reporter = { assertActive, progress: vi.fn(async () => undefined) };
    const canonicalCreate = vi.fn(async () => ({ jobId: "auto-next-stage-job", created: true }));
    const executor = createMiniAppFactoryStageJobExecutor(() => ({ pipeline, service: service as any, executeStage, allowHostedPersonalExecution: true }));
    const job = {
      context: {
        jobId: "canonical-worker-job", tenantId: run.tenantId, requestedByUserId: run.actorId,
        input: { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: run.runId, stageId: "SPEC" },
      },
      lease: { jobId: "canonical-worker-job", attemptId: "attempt-1", fencingVersion: 1 },
      reporter: reporter as any,
      controlPlane: { create: canonicalCreate } as any,
    };
    const result = await executor(job as any);
    expect(result).toEqual({ output: { stageId: "SPEC", state: "CHECKPOINTED", nextEligibleStages: ["TEST"], nextJobId: "auto-next-stage-job" } });
    expect(canonicalCreate).toHaveBeenCalledWith(expect.objectContaining({
      jobType: "mini_app_factory.stage",
      input: expect.objectContaining({ runId: run.runId, stageId: "TEST" }),
    }), expect.anything());
    expect(run.workUnit?.progress.completedScope).toEqual(["SPEC"]);
    expect(run.workUnit?.progress.remainingScope).toEqual(["TEST"]);
    expect(assertActive).toHaveBeenCalledTimes(3);
    expect(executeStage).toHaveBeenCalledWith("SPEC", expect.objectContaining({ runId: run.runId, tenantId: run.tenantId, actorId: run.actorId }));

    const duplicate = await executor(job as any);
    expect(duplicate).toEqual({ output: { stageId: "SPEC", state: "ALREADY_CHECKPOINTED", nextJobId: "auto-next-stage-job" } });
    expect(executeStage).toHaveBeenCalledTimes(1);
  });

  it("routes production stages to a deferred DevelopmentRun and never invokes a synthetic stage callback", async () => {
    const run = makeRun("PLATFORM_SELF_DEVELOPMENT");
    const executeStage = vi.fn(async () => ({ artifacts: ["synthetic"] }));
    const createRunnerStage = vi.fn(async () => ({ runId: "factory-stage-run", jobId: "held-runner-job", created: true, state: "PENDING_AUTHORIZATION" as const }));
    const executor = createMiniAppFactoryStageJobExecutor(() => ({
      pipeline,
      service: { get: async () => ({ run, revision: 1, events: [] }) } as any,
      executeStage,
      createRunnerStage,
    }));
    const result = await executor({
      context: { jobId: "coordinator-job", tenantId: run.tenantId, requestedByUserId: run.actorId,
        input: { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: run.runId, stageId: "SPEC" } } as any,
      lease: { jobId: "coordinator-job", attemptId: "attempt-1", fencingVersion: 1 } as any,
      reporter: { assertActive: vi.fn(async () => undefined), progress: vi.fn(async () => undefined) } as any,
      controlPlane: {} as any,
    } as any);
    expect(result).toEqual({ output: { stageId: "SPEC", state: "WAITING_AUTHORIZATION", childRunId: "factory-stage-run", jobId: "held-runner-job" } });
    expect(createRunnerStage).toHaveBeenCalledOnce();
    expect(executeStage).not.toHaveBeenCalled();
  });

  it("does not fabricate success when the worker runtime is unconfigured", async () => {
    const run = makeRun();
    const executor = createMiniAppFactoryStageJobExecutor(() => null);
    await expect(executor({
      context: { jobId: "job", tenantId: run.tenantId, requestedByUserId: run.actorId,
        input: { contractVersion: MINI_APP_FACTORY_STAGE_CONTRACT, runId: run.runId, stageId: "SPEC" } } as any,
      lease: { jobId: "job" } as any,
      reporter: {} as any,
      controlPlane: {} as any,
    })).rejects.toMatchObject({ class: "retryable", diagnosticCode: "FACTORY_STAGE_RUNTIME_NOT_CONFIGURED" });
  });
});
