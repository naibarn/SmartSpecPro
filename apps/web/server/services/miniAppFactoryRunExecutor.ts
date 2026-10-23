import { createHash } from "node:crypto";
import type { CanonicalCheckpointInput } from "./developmentLifecycleContracts";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { getMiniAppFactoryProfileStages, selectReadyMiniAppFactoryStages, type MiniAppFactoryProfile } from "./miniAppFactoryPipeline";
import {
  advanceMiniAppFactoryDurableState,
  createMiniAppFactoryDurableState,
  MINI_APP_FACTORY_STATE_KEY,
  parseMiniAppFactoryDurableState,
  type MiniAppFactoryDurableState,
} from "./miniAppFactoryDurableState";
import type { createDevelopmentRunService } from "./spec224DevelopmentRunPersistence";

type DevelopmentRunService = ReturnType<typeof createDevelopmentRunService>;

function worktreeSha(revision: string): string {
  const match = /^git:([a-f0-9]{40})$/i.exec(revision);
  if (!match) throw new Error("FACTORY_SOURCE_SHA_REQUIRED");
  return match[1]!.toLowerCase();
}

function assertArtifactRefs(artifacts: string[]): void {
  if (!Array.isArray(artifacts) || artifacts.some(value =>
    typeof value !== "string" || !/^[A-Za-z0-9_./:@#-]{1,1024}$/.test(value)
  )) {
    throw new Error("FACTORY_ARTIFACT_REF_INVALID");
  }
}

export type MiniAppFactoryStageOutput = {
  artifacts: string[];
  deliveryMilestone?: "USER_TRIAL_READY";
};

export type MiniAppFactoryRunResult = {
  executedStages: string[];
  nextEligibleStages: string[];
  state: "READY" | "WAITING_DEPENDENCY" | "IMPLEMENTATION_SCOPE_COMPLETE";
};

export type MiniAppIndependentBrowserReceipt = {
  verifierType: "spec208-independent";
  result: "PASS" | "FAIL" | "REOBSERVE" | "INCONCLUSIVE";
  verificationEvidenceRef: string;
  verificationEvidenceHash: string;
  verifiedAt: string;
  targetUrl: string;
  appId: string;
  artifactDigest: string;
};

/**
 * Record USER_TRIAL_READY only after the independent browser verifier has
 * exercised the exact private artifact that is already bound to this App.
 * This is an internal verifier integration point, not a user-facing claim API.
 */
export async function recordMiniAppIndependentBrowserAcceptance(input: {
  service: DevelopmentRunService;
  run: { runId: string; tenantId: string; actorId: number };
  receipt: MiniAppIndependentBrowserReceipt;
}): Promise<void> {
  const current = await input.service.get(input.run);
  const rawState = current.run.metadata?.[MINI_APP_FACTORY_STATE_KEY];
  const state = parseMiniAppFactoryDurableState(rawState);
  const { receipt } = input;
  const expectedUrl = `https://smartaihub.app/miniapp/${encodeURIComponent(state.miniAppId)}`;
  const artifactDigest = current.run.workUnit?.artifacts
    .find(value => value.startsWith("app-artifact-digest:"))
    ?.slice("app-artifact-digest:".length);
  if (
    state.profile !== "PERSONAL_MINIAPP" ||
    receipt.appId !== state.miniAppId ||
    receipt.targetUrl !== expectedUrl ||
    receipt.verifierType !== "spec208-independent" ||
    receipt.result !== "PASS" ||
    !/^verification-evidence:sha256:[a-f0-9]{64}$/.test(receipt.verificationEvidenceRef) ||
    receipt.verificationEvidenceRef !== `verification-evidence:sha256:${receipt.verificationEvidenceHash}` ||
    !/^[a-f0-9]{64}$/.test(receipt.verificationEvidenceHash) ||
    !Number.isFinite(Date.parse(receipt.verifiedAt)) ||
    !/^[a-f0-9]{64}$/.test(receipt.artifactDigest) ||
    receipt.artifactDigest !== artifactDigest ||
    !current.run.workUnit?.progress.completedScope.includes("deploy") ||
    !current.run.workUnit.progress.completedScope.includes("smoke")
  ) {
    throw new Error("MINI_APP_INDEPENDENT_BROWSER_RECEIPT_INVALID");
  }

  const nextState: MiniAppFactoryDurableState = {
    ...state,
    deliveryMilestone: "USER_TRIAL_READY",
    artifacts: [...new Set([...state.artifacts, `browser-journey:${receipt.verificationEvidenceRef}`])],
  };
  await input.service.recordVerificationEvent({
    ...input.run,
    type: "VERIFICATION_OUTCOME",
    idempotencyKey: `miniapp-browser-acceptance:${receipt.verificationEvidenceHash}`,
    occurredAt: receipt.verifiedAt,
    payload: {
      profile: "PERSONAL_MINIAPP",
      appId: state.miniAppId,
      artifactDigest: receipt.artifactDigest,
      targetUrl: receipt.targetUrl,
      outcome: "USER_TRIAL_READY",
      verifierType: receipt.verifierType,
      verificationEvidenceRef: receipt.verificationEvidenceRef,
      verificationEvidenceHash: receipt.verificationEvidenceHash,
    },
    runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextState },
  });
}

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
  factoryIdentity?: { programId: string; miniAppId: string };
  executeStage: (stageId: string, context: {
    completedScope: string[];
    artifacts: string[];
    canonicalRevision: string;
  }) => Promise<MiniAppFactoryStageOutput>;
  beforeCheckpoint?: (stageId: string) => Promise<void>;
  maxStages?: number;
  occurredAt?: string;
}): Promise<MiniAppFactoryRunResult> {
  const maxStages = input.maxStages ?? 1;
  if (!Number.isSafeInteger(maxStages) || maxStages < 1 || maxStages > 32) {
    throw new Error("FACTORY_STAGE_BATCH_SIZE_INVALID");
  }

  const executedStages: string[] = [];
  let latest = await input.service.get(input.run);
  const storedFactoryState = latest.run.metadata?.[MINI_APP_FACTORY_STATE_KEY];
  let durableState = storedFactoryState
    ? parseMiniAppFactoryDurableState(storedFactoryState)
    : input.factoryIdentity
      ? createMiniAppFactoryDurableState({
          ...input.factoryIdentity,
          sourceSha: worktreeSha(latest.run.baseRevision),
        })
      : undefined;

  while (executedStages.length < maxStages) {
  const workUnit = latest.run.workUnit;
    if (!workUnit) throw new Error("DEVELOPMENT_WORK_UNIT_NOT_FOUND");
    const profile: MiniAppFactoryProfile = durableState?.profile ?? "PERSONAL_MINIAPP";
    const ready = selectReadyMiniAppFactoryStages(input.pipeline, workUnit, profile);
    const eligibleStages = getMiniAppFactoryProfileStages(input.pipeline, profile);
    const remaining = workUnit.progress.remainingScope.filter(scope => eligibleStages.some(stage => stage.id === scope));

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
    await input.beforeCheckpoint?.(stageId);
    const completedScope = [...new Set([...workUnit.progress.completedScope, stageId])];
    const remainingScope = workUnit.progress.remainingScope.filter(scope => scope !== stageId);
    const outputDigest = createHash("sha256").update(JSON.stringify({ stageId, output }), "utf8").digest("hex");
    const idempotencyKey = `miniapp-factory:${createHash("sha256").update(`${input.run.runId}:${stageId}:${outputDigest}`, "utf8").digest("hex")}`;
    const artifacts = [...new Set([...workUnit.artifacts, ...output.artifacts])];
    const checkpointProjection = {
      ...workUnit,
      progress: { ...workUnit.progress, completedScope, remainingScope },
      artifacts,
    };
    const trialReadyStage = input.pipeline.profiles?.[profile]?.trialReadyStage;
    const deliveryMilestone = stageId === trialReadyStage && output.deliveryMilestone === "USER_TRIAL_READY"
      ? "USER_TRIAL_READY" as const
      : undefined;
    const nextEligibleStages = selectReadyMiniAppFactoryStages(input.pipeline, checkpointProjection, profile);
    const nextFactoryState = durableState
      ? advanceMiniAppFactoryDurableState(durableState, { stageId, artifacts: output.artifacts, nextEligibleStages, deliveryMilestone })
      : undefined;

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
          ...(nextFactoryState ? { runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextFactoryState } } : {}),
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
      ...(nextFactoryState ? { runMetadata: { [MINI_APP_FACTORY_STATE_KEY]: nextFactoryState } } : {}),
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
    durableState = nextFactoryState;
    latest = { run: persisted.run, revision: persisted.revision, events: [] };
  }

  const current = await input.service.get(input.run);
  const nextEligibleStages = current.run.workUnit
    ? selectReadyMiniAppFactoryStages(input.pipeline, current.run.workUnit, durableState?.profile ?? "PERSONAL_MINIAPP")
    : [];
  return {
    executedStages,
    nextEligibleStages,
    state: nextEligibleStages.length > 0 ? "READY" : "WAITING_DEPENDENCY",
  };
}
