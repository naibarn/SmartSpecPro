import { createHash } from "node:crypto";
import type { CanonicalCheckpointInput } from "./developmentLifecycleContracts";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { selectReadyMiniAppFactoryStages } from "./miniAppFactoryPipeline";
import type { createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";

type DevelopmentRunService = ReturnType<typeof createDevelopmentRunService>;

function assertArtifactRefs(artifacts: string[]): void {
  if (!Array.isArray(artifacts) || artifacts.some(value =>
    typeof value !== "string" || !/^[A-Za-z0-9_./:@#-]{1,1024}$/.test(value)
  )) {
    throw new Error("FACTORY_ARTIFACT_REF_INVALID");
  }
}

export type MiniAppFactoryStageOutput = {
  artifacts: string[];
};

export type MiniAppFactoryRunResult = {
  executedStages: string[];
  nextEligibleStages: string[];
  state: "READY" | "WAITING_DEPENDENCY" | "IMPLEMENTATION_SCOPE_COMPLETE";
};

/**
 * Execute dependency-ready stages on the existing DevelopmentRun. Each
 * successful stage is durably checkpointed before the next stage is selected.
 * The caller supplies the stage implementation; persistence, fencing, and
 * durable job scheduling remain owned by DevelopmentRun/worker_jobs.
 */
export async function executeMiniAppFactoryStages(input: {
  pipeline: MiniAppFactoryPipeline;
  service: DevelopmentRunService;
  run: { runId: string; tenantId: string; actorId: number };
  executeStage: (stageId: string, context: {
    completedScope: string[];
    artifacts: string[];
    canonicalRevision: string;
  }) => Promise<MiniAppFactoryStageOutput>;
  maxStages?: number;
  occurredAt?: string;
}): Promise<MiniAppFactoryRunResult> {
  const maxStages = input.maxStages ?? 1;
  if (!Number.isSafeInteger(maxStages) || maxStages < 1 || maxStages > 32) {
    throw new Error("FACTORY_STAGE_BATCH_SIZE_INVALID");
  }

  const executedStages: string[] = [];
  let latest = await input.service.get(input.run);

  while (executedStages.length < maxStages) {
    const workUnit = latest.run.workUnit;
    if (!workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
    const ready = selectReadyMiniAppFactoryStages(input.pipeline, workUnit);
    const remaining = workUnit.progress.remainingScope.filter(scope =>
      input.pipeline.stages.some(stage => stage.id === scope)
    );

    if (remaining.length === 0) {
      return { executedStages, nextEligibleStages: [], state: "IMPLEMENTATION_SCOPE_COMPLETE" };
    }
    if (ready.length === 0) {
      return { executedStages, nextEligibleStages: [], state: "WAITING_DEPENDENCY" };
    }

    const stageId = ready[0];
    const output = await input.executeStage(stageId, {
      completedScope: [...workUnit.progress.completedScope],
      artifacts: [...workUnit.artifacts],
      canonicalRevision: workUnit.progress.canonicalRevision,
    });
    assertArtifactRefs(output.artifacts);
    const completedScope = [...new Set([...workUnit.progress.completedScope, stageId])];
    const remainingScope = workUnit.progress.remainingScope.filter(scope => scope !== stageId);
    const outputDigest = createHash("sha256").update(JSON.stringify({ stageId, output }), "utf8").digest("hex");
    const idempotencyKey = `miniapp-factory:${createHash("sha256").update(`${input.run.runId}:${stageId}:${outputDigest}`, "utf8").digest("hex")}`;
    const artifacts = [...new Set([...workUnit.artifacts, ...output.artifacts])];

    if (remainingScope.length === 0) {
      await input.service.recordImplementationCompletion({
        ...input.run,
        expectedRevision: latest.revision,
        expectedFencingVersion: latest.run.fencingVersion,
        idempotencyKey,
        completion: {
          canonicalRevision: workUnit.progress.canonicalRevision,
          completedScope: [stageId],
          pendingValidation: [],
          artifacts,
        },
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      });
      executedStages.push(stageId);
      return { executedStages, nextEligibleStages: [], state: "IMPLEMENTATION_SCOPE_COMPLETE" };
    }

    const checkpoint: CanonicalCheckpointInput = {
      canonicalRevision: workUnit.progress.canonicalRevision,
      completedScope: [stageId],
      remainingScope,
      pendingValidation: [],
      nextAction: `Select the next dependency-ready Mini App Factory stage after ${stageId}`,
      nextOwner: workUnit.ownership.actor,
      handoffRef: `work:${workUnit.workId}`,
      resumeFrom: stageId,
      artifacts,
    };
    const persisted = await input.service.recordCanonicalCheckpoint({
      ...input.run,
      expectedRevision: latest.revision,
      expectedFencingVersion: latest.run.fencingVersion,
      idempotencyKey,
      checkpoint,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    });
    executedStages.push(stageId);
    latest = { run: persisted.run, revision: persisted.revision, events: [] };
  }

  const current = await input.service.get(input.run);
  const nextEligibleStages = current.run.workUnit
    ? selectReadyMiniAppFactoryStages(input.pipeline, current.run.workUnit)
    : [];
  return {
    executedStages,
    nextEligibleStages,
    state: nextEligibleStages.length > 0 ? "READY" : "WAITING_DEPENDENCY",
  };
}
