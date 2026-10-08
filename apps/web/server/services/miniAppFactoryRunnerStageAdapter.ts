import { createHash } from "node:crypto";

import { createDevelopmentWorkUnit } from "./developmentLifecycleContracts";
import { createJobControlPlane, type JobControlPlane } from "./jobControlPlane";
import type { MiniAppFactoryStage, MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { createPersistedDevelopmentRun, createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter, type DevelopmentRunScope } from "./spec224DevelopmentRunPersistence";
import { buildDevelopmentRun, type DevelopmentRun } from "./spec224DevelopmentRunContracts";
import { defaultSpec224RunnerInputStagingService } from "./spec224RunnerInputStaging";
import { parseMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";

type ParentRun = DevelopmentRunScope & { runId: string };
type CreatePersistedRun = typeof createPersistedDevelopmentRun;

function stageRunId(parentRunId: string, stageId: string, sourceSha: string): string {
  const digest = createHash("sha256").update(`${parentRunId}\0${stageId}\0${sourceSha}`).digest("hex");
  return `factory-run-${digest.slice(0, 40)}`;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

/**
 * Composes one eligible Factory stage into the existing held DevelopmentRun →
 * external_agent_task → Runner path. The returned job is intentionally pending
 * until the normal Spec 224 authorization flow binds real policy evidence.
 */
export async function createMiniAppFactoryRunnerStage(input: {
  pipeline: MiniAppFactoryPipeline;
  stage: MiniAppFactoryStage;
  run: ParentRun;
  service?: ReturnType<typeof createDevelopmentRunService>;
  controlPlane?: JobControlPlane;
  createRun?: CreatePersistedRun;
  stageInput?: (files: Array<{ path: string; contentBase64: string }>, startRef: string, tenantId: string) => Promise<{ inputSourceRef: string; inputDigest: string; totalBytes: number }>;
  bindInput?: typeof defaultSpec224RunnerInputStagingService.bindSourceToWorkerJob;
}): Promise<{ runId: string; jobId: string; created: boolean; state: "PENDING_AUTHORIZATION" }> {
  const service = input.service ?? createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter);
  const controlPlane = input.controlPlane ?? createJobControlPlane();
  const parent = await service.get(input.run);
  const unit = parent.run.workUnit;
  if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
  const state = parseMiniAppFactoryDurableState(parent.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  const sourceSha = /^git:([a-f0-9]{40})$/i.exec(parent.run.baseRevision)?.[1]?.toLowerCase();
  if (!sourceSha || sourceSha !== state.sourceSha) throw new Error("FACTORY_STAGE_SOURCE_SHA_MISMATCH");
  const parentJob = parent.run.workerJobId
    ? await controlPlane.getContext(parent.run.workerJobId, { tenantId: input.run.tenantId, requestedByUserId: input.run.actorId })
    : null;
  const parentJobInput = asRecord(parentJob?.input);
  const manifest = asRecord(parentJobInput?.manifest);
  const execution = asRecord(manifest?.spec224Execution);
  const allowedWriteSet = execution?.allowedWriteSet;
  if (
    parentJob?.jobType !== "external_agent_task" || !manifest ||
    manifest.tenantId !== input.run.tenantId || Number(manifest.actorId) !== input.run.actorId ||
    manifest.workspaceId !== parent.run.workspaceId ||
    typeof manifest.planId !== "string" || !Number.isSafeInteger(manifest.planRevision) ||
    !["codex", "claude_code"].includes(manifest.provider) ||
    !Array.isArray(manifest.requestedCapabilities) ||
    !parent.run.workPackageId || manifest.workPackageId !== parent.run.workPackageId ||
    !execution || !Array.isArray(allowedWriteSet) || allowedWriteSet.length === 0 ||
    allowedWriteSet.some((entry: unknown) => typeof entry !== "string" || !entry.trim())
  ) throw new Error("FACTORY_RUNNER_PARENT_AUTHORITY_REQUIRED");

  const childRunId = stageRunId(input.run.runId, input.stage.id, sourceSha);
  const stageDocument = {
    schemaVersion: "mini-app-factory-runner-stage.v1",
    programId: state.programId,
    miniAppId: state.miniAppId,
    parentRunId: input.run.runId,
    stageId: input.stage.id,
    pipelineId: input.pipeline.pipelineId,
    sourceSha,
    objective: unit.objective,
    gate: input.stage.gate ?? null,
    inputs: input.stage.inputs ?? [],
    outputs: input.stage.outputs ?? [],
    completedStages: state.completedStages,
    artifacts: state.artifacts,
  };
  const stageJson = JSON.stringify(stageDocument);
  const encodedStage = Buffer.from(stageJson, "utf8").toString("base64");
  const staged = await (input.stageInput ?? ((files, startRef, tenantId) =>
    defaultSpec224RunnerInputStagingService.preStageRunnerInput({ files, startRef, tenantId })))(
      [{ path: "mini-app-factory-stage.json", contentBase64: encodedStage }], childRunId, input.run.tenantId,
    );
  const goal = `Execute Mini App Factory stage ${input.stage.id} under the existing authorized DevelopmentRun workspace. Read mini-app-factory-stage.json from the staged immutable input, satisfy its gate, and return evidence references for its declared outputs. Do not widen the authorized worktree write set.`;
  const childWork = createDevelopmentWorkUnit({
    workId: `factory-work-${createHash("sha256").update(childRunId).digest("hex").slice(0, 32)}`,
    projectId: unit.projectId,
    repositoryId: unit.repositoryId,
    source: unit.source,
    objective: goal,
    ownership: { ...unit.ownership, harness: "mini-app-factory-runner" },
    canonicalTarget: unit.canonicalTarget,
    baseRevision: sourceSha,
  });
  childWork.progress.state = "WORKING";
  childWork.progress.remainingScope = [input.stage.id];
  childWork.progress.immediatelyRunnableScope = [input.stage.id];
  const child = buildDevelopmentRun({
    runId: childRunId,
    tenantId: input.run.tenantId,
    actorId: input.run.actorId,
    goal,
    repositoryRef: parent.run.repositoryRef,
    baseRevision: parent.run.baseRevision,
    contextPackHash: parent.run.contextPackHash,
    workspaceId: parent.run.workspaceId,
    workPackageId: parent.run.workPackageId,
    workUnit: childWork,
    metadata: {
      spec224Input: { inputSourceRef: staged.inputSourceRef, inputDigest: staged.inputDigest, totalBytes: staged.totalBytes },
      spec224Execution: { sourceFingerprint: staged.inputDigest, mode: "prompt", allowedWriteSet },
      miniAppFactoryStage: {
        schemaVersion: "mini-app-factory-runner-stage.v1",
        parentRunId: input.run.runId,
        pipelineId: input.pipeline.pipelineId,
        programId: state.programId,
        miniAppId: state.miniAppId,
        stageId: input.stage.id,
        sourceSha,
      },
    },
  });
  const created = await (input.createRun ?? createPersistedDevelopmentRun)({
    run: child,
    provider: manifest.provider,
    runtime: "local_runner",
    planId: manifest.planId,
    planRevision: manifest.planRevision,
    skillIds: Array.isArray(manifest.skillIds) ? manifest.skillIds : [],
    requestedCapabilities: manifest.requestedCapabilities,
    deferredAdmission: true,
    authorizationScope: "mini_app_factory.stage",
    correlationId: `mini-app-factory:${input.run.runId}:${input.stage.id}`,
  });
  await (input.bindInput ?? defaultSpec224RunnerInputStagingService.bindSourceToWorkerJob)({
    tenantId: input.run.tenantId,
    startRef: childRunId,
    inputSourceRef: staged.inputSourceRef,
    workerJobId: created.jobRef.jobId,
  });
  if (created.run.workerJobId !== created.jobRef.jobId) throw new Error("FACTORY_STAGE_CHILD_JOB_BINDING_MISMATCH");
  return { runId: childRunId, jobId: created.jobRef.jobId, created: created.jobRef.created, state: "PENDING_AUTHORIZATION" };
}
