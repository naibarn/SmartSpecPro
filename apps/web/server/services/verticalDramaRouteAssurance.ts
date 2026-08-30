import { createHash } from "node:crypto";
import {
  fingerprintVerticalDramaStageInput,
  type VerticalDramaAssuranceResult,
  type VerticalDramaAssuranceTaskKind,
  type VerticalDramaAssuredArtifactRef,
} from "../../shared/verticalDramaSeries/assurance";
import {
  buildProductionContextSnapshot,
  type ProductionContextSnapshot,
  type ProductionContextSourcePackRef,
} from "../../shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  getSeriesProfile,
  type VdSeriesProfileId,
} from "../../shared/verticalDramaSeries/seriesProfile";
import {
  runAssuredBrollAssemblyQc,
  runAssuredDeepStoryDraft,
  runAssuredFullStory,
  runAssuredPostGenerationQc,
  runAssuredReferenceImagePrompt,
  runAssuredSeasonQc,
  runAssuredStartFramePrompt,
  runAssuredStoryArchitecture,
  runAssuredVideoPrompt,
  type VerticalDramaStageAssuranceOutput,
} from "./verticalDramaStoryPromptMediaAssurance";
import type { VerticalDramaAssuranceMemoryRepository } from "./verticalDramaAssuranceRepository";

/**
 * The route names are deliberately explicit.  This is an audit surface as
 * well as a dispatch map: adding a new story/media entry point without adding
 * it here makes the focused route-coverage test fail.
 */
export const VERTICAL_DRAMA_ASSURANCE_ROUTES = [
  "series.generateStoryBible",
  "series.generateStoryBibleDeep",
  "series.extendStoryDraftHorizon",
  "episodes.generateShotStartFramePrompt",
  "episodes.executeShotStartFramePromptJob",
  "episodes.generateShotReferenceFramePrompt",
  "episodes.generateShotReferenceFrameImage",
  "episodes.generateShotVideoPrompt",
  "episodes.generateVideoClip",
  "episodes.brollBinding",
  "episodes.assembleEpisodeVideo",
  "series.assembleSeasonVideos",
  "episodes.postGenerationQc",
  "series.seasonQc",
] as const;

export type VerticalDramaAssuranceRoute =
  (typeof VERTICAL_DRAMA_ASSURANCE_ROUTES)[number];

export const VERTICAL_DRAMA_ROUTE_TASKS: Record<
  VerticalDramaAssuranceRoute,
  VerticalDramaAssuranceTaskKind
> = {
  "series.generateStoryBible": "story_architecture",
  "series.generateStoryBibleDeep": "full_story",
  "series.extendStoryDraftHorizon": "full_story",
  "episodes.generateShotStartFramePrompt": "start_frame_prompt",
  "episodes.executeShotStartFramePromptJob": "start_frame_prompt",
  "episodes.generateShotReferenceFramePrompt": "reference_image_prompt",
  "episodes.generateShotReferenceFrameImage": "reference_image_prompt",
  "episodes.generateShotVideoPrompt": "video_prompt_qc",
  "episodes.generateVideoClip": "video_prompt_qc",
  "episodes.brollBinding": "broll_assembly_qc",
  "episodes.assembleEpisodeVideo": "broll_assembly_qc",
  "series.assembleSeasonVideos": "broll_assembly_qc",
  "episodes.postGenerationQc": "draft_qc",
  "series.seasonQc": "season_qc",
};

export type VerticalDramaRouteAssuranceOwner = {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId?: number;
  shotNumber?: number;
};

export type VerticalDramaRouteAssuranceInput<TOutput> = {
  route: VerticalDramaAssuranceRoute;
  owner: VerticalDramaRouteAssuranceOwner;
  context: ProductionContextSnapshot;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  idempotencyKey: string;
  stageInput: unknown;
  output: TOutput;
  domainArtifactId: string;
  domainArtifactVersion?: string;
  boundary?: "advisory" | "activation" | "paid" | "export";
};

export type VerticalDramaRouteAssuranceResult<TOutput> = {
  status: "accepted" | "deduped";
  output: TOutput;
  assurance: VerticalDramaAssuranceResult;
  artifactRef: VerticalDramaAssuredArtifactRef;
  lineage: VerticalDramaStageAssuranceOutput<TOutput>["lineage"];
};

export function buildVerticalDramaRouteContext(input: {
  seriesId: number;
  profileId?: string | null;
  visualSource: {
    snapshotId: string;
    revision: number;
    fingerprint: string;
  };
  sourcePack?: ProductionContextSourcePackRef | null;
}): ProductionContextSnapshot {
  const profile = getSeriesProfile(
    (input.profileId ?? "drama_romance") as VdSeriesProfileId
  );
  return buildProductionContextSnapshot({
    schemaVersion: 1,
    snapshotId: `vd-route-context:${input.seriesId}:${input.visualSource.snapshotId}`,
    revision: input.visualSource.revision,
    seriesId: input.seriesId,
    profile: {
      profileId: profile.profileId,
      version: profile.version,
      contentKind: profile.contentKind,
      visualGroundingVersion: profile.visualVersion,
      visualGroundingFingerprint: input.visualSource.fingerprint,
      factPolicyVersion: profile.version,
      brollPolicyVersion: profile.version,
    },
    sourcePackPolicy:
      profile.sourceGatePolicy === "required" ? "required" : "optional",
    sourcePackDecision: input.sourcePack ? "selected" : "explicit_none",
    sourcePack: input.sourcePack ?? null,
    visualSource: {
      snapshotId: input.visualSource.snapshotId,
      revision: input.visualSource.revision,
      fingerprint: input.visualSource.fingerprint,
      visualCanonVersion: profile.visualVersion,
      visualCanonFingerprint: input.visualSource.fingerprint,
    },
    claimLedger: null,
    coveragePlan: null,
    references: {
      storyControlRefs: [],
      characterRefs: [],
      sceneRefs: [],
      shotRefs: [],
      claimRefs: [],
      coverageRefs: [],
      slotRefs: [],
      assetRefs: [],
      segmentRefs: [],
      mediaBindingRefs: [],
    },
  });
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requiredReadiness(
  boundary: VerticalDramaRouteAssuranceInput<unknown>["boundary"]
): "verified" | "provider_ready" | "production_ready" {
  return boundary === "export"
    ? "production_ready"
    : boundary === "paid"
      ? "provider_ready"
      : "verified";
}

/**
 * Executes the coordinator against an already persisted route candidate.
 * Callers must persist the ordinary domain artifact first and pass its real
 * id.  The assurance run is then finalized against that exact id, so a
 * successful envelope cannot point at a fabricated or provider-only URL.
 */
export async function assurePersistedVerticalDramaRoute<TOutput>(
  input: VerticalDramaRouteAssuranceInput<TOutput>,
  deps: {
    repository: VerticalDramaAssuranceMemoryRepository;
    activate: (args: {
      executionId: string;
      attemptId: string;
      lineage: VerticalDramaStageAssuranceOutput<TOutput>["lineage"];
    }) => Promise<"accepted" | "stale">;
  }
): Promise<VerticalDramaRouteAssuranceResult<TOutput>> {
  const taskKind = VERTICAL_DRAMA_ROUTE_TASKS[input.route];
  const contextRef = {
    snapshotId: input.context.snapshotId,
    revision: input.context.revision,
    fingerprint: input.context.fingerprint,
  };
  const stageInputFingerprint = fingerprintVerticalDramaStageInput({
    taskKind,
    contextSnapshotRef: contextRef,
    predecessorRefs: input.predecessorRefs,
    contractVersion: input.contractVersion,
    policyHash: input.policyHash,
    modelPolicy: input.modelPolicy,
    stageInput: input.stageInput,
  });
  const contractHash = hash({
    route: input.route,
    contractVersion: input.contractVersion,
  });
  const admission = await deps.repository.admit({
    tenantId: input.owner.tenantId,
    userId: input.owner.userId,
    surface: input.route,
    domainTaskKind: taskKind,
    domainOwnerType:
      input.owner.episodeId == null
        ? "series"
        : input.owner.shotNumber == null
          ? "episode"
          : "shot",
    domainOwnerId: String(
      input.owner.shotNumber ?? input.owner.episodeId ?? input.owner.seriesId
    ),
    sourceFingerprint: stageInputFingerprint,
    contextFingerprint: input.context.fingerprint,
    contractHash,
    policyHash: input.policyHash,
    idempotencyKey: input.idempotencyKey,
    sourceRevision: String(input.context.revision),
    contextSnapshotId: input.context.snapshotId,
    contextSnapshotRevision: input.context.revision,
    runtimeTaskKind: taskKind,
    budget: {
      maxTurns: 1,
      maxToolCalls: 0,
      maxParallelAgents: 1,
      maxPlanDepth: 1,
      maxWallClockSeconds: 120,
      maxInputTokens: 0,
      maxOutputTokens: 0,
      maxRepairAttempts: 0,
      estimatedCost: 0,
    },
    sideEffectPolicy:
      input.boundary === "paid" || input.boundary === "export"
        ? "provider_ready"
        : "candidate_only",
  });
  if (admission.deduped && admission.execution.state === "succeeded") {
    const lineage = (
      input.output as {
        assuranceLineage?: VerticalDramaStageAssuranceOutput<TOutput>["lineage"];
      }
    ).assuranceLineage;
    if (!lineage)
      throw new Error("VD_ASSURANCE_DEDUPLICATED_OUTPUT_MISSING_LINEAGE");
    return {
      status: "deduped",
      output: input.output,
      assurance: {
        executionId: admission.execution.executionId,
        attemptId: admission.attempt.attemptId,
        state: "succeeded",
        disposition: "verified",
        readiness: requiredReadiness(input.boundary),
        findings: [],
        mode: "legacy_deterministic",
        fallbackReason: null,
        traceId: null,
        nextAction: "continue",
      },
      artifactRef: {
        kind:
          taskKind === "story_architecture"
            ? "story_architecture"
            : taskKind === "full_story"
              ? "full_story"
              : taskKind === "start_frame_prompt"
                ? "start_frame_prompt"
                : taskKind === "reference_image_prompt"
                  ? "reference_image_prompt"
                  : taskKind === "video_prompt_qc"
                    ? "video_motion_prompt_pack"
                    : taskKind === "draft_qc"
                      ? "post_generation_qc"
                      : taskKind === "season_qc"
                        ? "season_qc"
                        : "assembly_manifest",
        artifactId: input.domainArtifactId,
        version: input.domainArtifactVersion ?? "1",
        fingerprint: lineage.outputFingerprint,
      },
      lineage,
    };
  }
  const lease = await deps.repository.claimLease({
    tenantId: input.owner.tenantId,
    executionId: admission.execution.executionId,
    workerId: `route:${input.route}`,
    leaseMs: 120_000,
  });
  if (!lease.ok) throw new Error("VD_ASSURANCE_ROUTE_LEASE_UNAVAILABLE");
  await deps.repository.append({
    tenantId: input.owner.tenantId,
    executionId: admission.execution.executionId,
    attemptId: admission.attempt.attemptId,
    expectedFenceToken: lease.fenceToken,
    eventIdempotencyKey: `running:${input.idempotencyKey}`,
    nextState: "running",
    actorClass: "route",
    reasonCode: "route_assurance_started",
  });
  try {
    const run =
      input.route === "series.generateStoryBible"
        ? runAssuredStoryArchitecture
        : input.route === "series.generateStoryBibleDeep" ||
            input.route === "series.extendStoryDraftHorizon"
          ? runAssuredDeepStoryDraft
          : input.route === "episodes.generateShotStartFramePrompt" ||
              input.route === "episodes.executeShotStartFramePromptJob"
            ? runAssuredStartFramePrompt
            : input.route === "episodes.generateShotReferenceFramePrompt" ||
                input.route === "episodes.generateShotReferenceFrameImage"
              ? runAssuredReferenceImagePrompt
              : input.route === "episodes.generateShotVideoPrompt" ||
                  input.route === "episodes.generateVideoClip"
                ? runAssuredVideoPrompt
                : input.route === "episodes.brollBinding" ||
                    input.route === "episodes.assembleEpisodeVideo" ||
                    input.route === "series.assembleSeasonVideos"
                  ? runAssuredBrollAssemblyQc
                  : input.route === "episodes.postGenerationQc"
                    ? runAssuredPostGenerationQc
                    : runAssuredSeasonQc;
    const assured = await run(
      {
        tenantId: input.owner.tenantId,
        userId: input.owner.userId,
        domainOwner: {
          tenantId: input.owner.tenantId,
          userId: input.owner.userId,
          entityType:
            input.owner.episodeId == null
              ? "series"
              : input.owner.shotNumber == null
                ? "episode"
                : "shot",
          entityId: String(
            input.owner.shotNumber ??
              input.owner.episodeId ??
              input.owner.seriesId
          ),
        },
        context: input.context,
        contextRef,
        predecessorRefs: input.predecessorRefs,
        contractVersion: input.contractVersion,
        policyHash: input.policyHash,
        modelPolicy: input.modelPolicy,
        idempotencyKey: input.idempotencyKey,
        stageInput: input.stageInput,
        boundary: input.boundary ?? "advisory",
      },
      {
        execute: async () => ({
          output: input.output,
          assurance: {
            executionId: admission.execution.executionId,
            attemptId: admission.attempt.attemptId,
            state: "succeeded",
            disposition: "verified",
            readiness: requiredReadiness(input.boundary),
            findings: [],
            mode: "legacy_deterministic",
            fallbackReason: null,
            traceId: null,
            nextAction: "continue",
          },
          artifactId: input.domainArtifactId,
          artifactVersion: input.domainArtifactVersion ?? "1",
          outputContractVersion: input.contractVersion,
        }),
      }
    );
    const activated = await deps.activate({
      executionId: admission.execution.executionId,
      attemptId: admission.attempt.attemptId,
      lineage: assured.lineage,
    });
    const final = await deps.repository.finalize({
      tenantId: input.owner.tenantId,
      executionId: admission.execution.executionId,
      attemptId: admission.attempt.attemptId,
      expectedFenceToken: lease.fenceToken,
      finalizationKey: `finalize:${input.idempotencyKey}`,
      activate: async () =>
        activated === "accepted"
          ? { kind: "accepted", domainRef: input.domainArtifactId }
          : {
              kind: "stale",
              reasonCode: "VD_ASSURANCE_DOMAIN_ARTIFACT_NOT_CURRENT",
            },
    });
    if (final.state !== "succeeded")
      throw new Error("VD_ASSURANCE_ROUTE_FINAL_GATE_BLOCKED");
    return {
      status: "accepted",
      output: input.output,
      assurance: assured.assurance,
      artifactRef: {
        ...assured.artifactRef,
        artifactId: input.domainArtifactId,
      },
      lineage: assured.lineage,
    };
  } catch (error) {
    await deps.repository
      .append({
        tenantId: input.owner.tenantId,
        executionId: admission.execution.executionId,
        attemptId: admission.attempt.attemptId,
        expectedFenceToken: lease.fenceToken,
        eventIdempotencyKey: `failed:${input.idempotencyKey}`,
        nextState: "fatal_failed",
        actorClass: "route",
        reasonCode:
          error instanceof Error
            ? error.message.slice(0, 96)
            : "route_assurance_failed",
      })
      .catch(() => undefined);
    throw error;
  }
}
