import { createHash } from "node:crypto";

import { advanceMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { loadMiniAppFactoryPipeline, selectReadyMiniAppFactoryStages, type MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { enqueueNextMiniAppFactoryStage, type MiniAppFactoryStageWorkerRuntime } from "./miniAppFactoryStageWorker";
import type { createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";

type DevelopmentRunService = ReturnType<typeof createDevelopmentRunService>;

/** Settle one completed, already-validated Runner receipt onto its Factory parent. */
export async function settleMiniAppFactoryRunnerStage(input: {
  runId: string;
  tenantId: string;
  actorId: number;
  receiptEventId: string;
  pipeline?: MiniAppFactoryPipeline;
  developmentRuns: DevelopmentRunService;
  createRunnerStage?: MiniAppFactoryStageWorkerRuntime["createRunnerStage"];
}): Promise<{ stageId: string; nextStageId: string | null; nextJobId: string | null; created: boolean }> {
  const child = await input.developmentRuns.get(input);
  const rawLink = child.run.metadata?.miniAppFactoryStage;
  if (!rawLink || typeof rawLink !== "object" || Array.isArray(rawLink)) {
    throw new Error("FACTORY_RUNNER_STAGE_LINK_MISSING");
  }
  const link = rawLink as Record<string, unknown>;
  if (
    link.schemaVersion !== "mini-app-factory-runner-stage.v1" ||
    typeof link.parentRunId !== "string" || typeof link.pipelineId !== "string" ||
    typeof link.stageId !== "string" || typeof link.sourceSha !== "string" ||
    typeof link.programId !== "string" || typeof link.miniAppId !== "string"
  ) throw new Error("FACTORY_RUNNER_STAGE_LINK_INVALID");
  const parentScope = { runId: link.parentRunId, tenantId: input.tenantId, actorId: input.actorId };
  if (typeof child.run.workerJobId !== "string" || !child.run.workerJobId) {
    throw new Error("FACTORY_RUNNER_STAGE_JOB_BINDING_MISSING");
  }
  const parent = await input.developmentRuns.get(parentScope);
  const unit = parent.run.workUnit;
  if (!unit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
  const state = parseMiniAppFactoryDurableState(parent.run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
  const sourceSha = /^git:([a-f0-9]{40})$/i.exec(parent.run.baseRevision)?.[1]?.toLowerCase();
  if (sourceSha !== link.sourceSha || sourceSha !== state.sourceSha || state.programId !== link.programId || state.miniAppId !== link.miniAppId) {
    throw new Error("FACTORY_RUNNER_STAGE_SOURCE_BINDING_STALE");
  }
  const pipeline = input.pipeline ?? loadMiniAppFactoryPipeline();
  if (pipeline.pipelineId !== link.pipelineId || !pipeline.stages.some(stage => stage.id === link.stageId)) {
    throw new Error("FACTORY_RUNNER_STAGE_PIPELINE_MISMATCH");
  }
  let created = false;
  if (!unit.progress.completedScope.includes(link.stageId)) {
    if (!unit.progress.remainingScope.includes(link.stageId)) throw new Error("FACTORY_RUNNER_STAGE_NOT_REMAINING");
    const artifact = `runner-receipt:${input.receiptEventId}`;
    const artifacts = [...new Set([...unit.artifacts, artifact])];
    const completedScope = [...new Set([...unit.progress.completedScope, link.stageId])];
    const remainingScope = unit.progress.remainingScope.filter(stage => stage !== link.stageId);
    const projectedWork = { ...unit, progress: { ...unit.progress, completedScope, remainingScope } };
    const nextEligibleStages = selectReadyMiniAppFactoryStages(pipeline, projectedWork);
    const nextFactoryState = advanceMiniAppFactoryDurableState(state, { stageId: link.stageId, artifacts: [artifact], nextEligibleStages });
    const idempotencyKey = `miniapp-factory-runner-receipt:${createHash("sha256").update(`${child.run.workerJobId}:${input.receiptEventId}`).digest("hex")}`;
    const checkpoint = await input.developmentRuns.recordCanonicalCheckpoint({
      ...parentScope,
      expectedRevision: parent.revision,
      expectedFencingVersion: parent.run.fencingVersion,
      idempotencyKey,
      checkpoint: {
        canonicalRevision: unit.progress.canonicalRevision,
        completedScope: [link.stageId],
        remainingScope,
        pendingValidation: [],
        nextAction: `Select the next dependency-ready Factory stage after ${link.stageId}`,
        nextOwner: unit.ownership.actor,
        handoffRef: `work:${unit.workId}`,
        resumeFrom: link.stageId,
        artifacts,
        runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextFactoryState },
      },
    });
    created = checkpoint.accepted;
  }
  const next = await enqueueNextMiniAppFactoryStage({
    pipeline,
    service: input.developmentRuns,
    run: parentScope,
    ...(input.createRunnerStage ? { createRunnerStage: input.createRunnerStage } : {}),
  });
  return { stageId: link.stageId, nextStageId: next.stageId, nextJobId: next.jobId, created };
}
