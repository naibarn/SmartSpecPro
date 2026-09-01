import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaEpisodes,
  verticalDramaLocations,
  verticalDramaSeries,
  verticalDramaSpecialSequenceCounters,
  verticalDramaSpecialTieInDebugEvents,
} from "../../drizzle/schema";
import { isTenantFeatureEnabled } from "./tenantFeatureFlagService";
import {
  enqueueVerticalDramaInteractiveJob,
  type VerticalDramaInteractiveJobPayload,
} from "./verticalDramaInteractiveJobs";
import {
  specialTieInInputSchema,
  type SpecialEpisodeData,
  type SpecialModelSnapshot,
  type SpecialReferenceBinding,
  type SpecialTieInInput,
} from "../../shared/verticalDramaSeries/specialTieInContracts";
import {
  nextSpecialEpisodeNumber,
  type EpisodeNumberRow,
} from "../../shared/verticalDramaSeries/episodeNumbering";
import type { VerticalDramaInteractiveJobPayload as JobPayload } from "./verticalDramaInteractiveJobs";
import {
  assertOwnedSpecialMediaAssets,
  reconcileSpecialStorySceneSlot,
  resolveSpecialCharacterBindings,
  resolveSpecialReferenceBindings,
} from "./verticalDramaSpecialReferences";
import { listSpecialTieInModels } from "./verticalDramaSpecialModelCatalog";
import { listConnectedMcpProviderKeys } from "./mcpConnectionService";
import {
  assertOwnedSpecialTieInBrollRenderJob,
  assertOwnedSpecialTieInBroll,
  assertOwnedSpecialTieInFootage,
} from "./verticalDramaSpecialTieInFootageService";

export const SPECIAL_TIE_IN_FEATURE_FLAG = "verticalDramaSpecialEpisodes";
export const SPECIAL_TIE_IN_SKILL_SLUG = "idea-to-video-prompt";

export type SpecialEpisodeActor = { tenantId: string; userId: number };

export function specialEpisodeScope(
  seriesId: number,
  episodeId: number
): string {
  return `series:${seriesId}:episode:${episodeId}:special`;
}

export function specialEpisodeIdempotencyKey(
  createIntentId: string,
  inputVersion = 1
): string {
  return `special:${createIntentId}:v${inputVersion}`;
}

export function specialEpisodeRetryIdempotencyKey(
  createIntentId: string,
  inputVersion: number,
  retryAttempt: number
): string {
  return `${specialEpisodeIdempotencyKey(createIntentId, inputVersion)}:retry:${retryAttempt}`;
}

function logSpecialTieInRetry(
  event: string,
  data: Record<string, unknown>
): void {
  console.info("[VD_SPECIAL_RETRY]", { event, ...data });
}

export async function assertSpecialTieInEnabled(
  tenantId: string
): Promise<void> {
  if (!(await isTenantFeatureEnabled(tenantId, SPECIAL_TIE_IN_FEATURE_FLAG))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Special tie-in episodes are not enabled",
    });
  }
}

function initialSpecialData(
  input: SpecialTieInInput,
  createIntentId: string,
  referenceBindings: SpecialReferenceBinding[],
  modelSnapshots: { image: SpecialModelSnapshot; video: SpecialModelSnapshot }
): SpecialEpisodeData {
  const inputFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  return {
    schemaVersion: 1,
    createIntentId,
    inputVersion: 1,
    outputVersion: 0,
    input,
    skillRun: {
      schemaVersion: 1,
      skillId: "idea-to-video-prompt",
      status: "queued",
      idempotencyKey: specialEpisodeIdempotencyKey(createIntentId),
      inputFingerprint,
      attempt: 0,
    },
    referenceBindings,
    modelSnapshots,
  };
}

async function resolveSpecialModelSelections(
  actor: SpecialEpisodeActor,
  input: SpecialTieInInput,
) {
  const catalog = await listSpecialTieInModels({
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    dialogueMode: input.dialogueMode,
    referenceType: input.referenceType,
    referenceImageCount: input.referenceImages.length,
    characterReferenceCount: input.characterIds.length,
    connectedMcpProviderKeys: await listConnectedMcpProviderKeys(actor),
  });
  const image = catalog.imageModels.find(
    model => model.modelId === input.imageModelId
  );
  const video = catalog.videoModels.find(
    model => model.modelId === input.videoModelId
  );
  if (!image || !video) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "SPECIAL_MODEL_INCOMPATIBLE: selected models do not support the requested references, duration, aspect ratio, or dialogue mode",
    });
  }
  return { image, video };
}

function buildSpecialReferenceBindings(
  input: SpecialTieInInput,
  characterBindings: Array<SpecialReferenceBinding & { authorizedUrl: string }>
): SpecialReferenceBinding[] {
  return [
    ...input.referenceImages.map((reference, index) => ({
      skillReferenceId: `reference_${index + 1}`,
      role:
        reference.role ??
        (input.referenceType === "location" || input.referenceType === "store"
          ? input.referenceType
          : "product"),
      mediaAssetId: reference.mediaAssetId,
      provenance: reference.provenance ?? { source: reference.source },
    })),
    ...characterBindings.map(
      ({ authorizedUrl: _authorizedUrl, ...binding }) => binding
    ),
  ];
}

async function assertSeriesAndCharacters(
  actor: SpecialEpisodeActor,
  seriesId: number,
  input: SpecialTieInInput
) {
  const [series] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, actor.tenantId),
        eq(verticalDramaSeries.userId, actor.userId)
      )
    )
    .limit(1);
  if (!series)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  if (input.characterIds.length === 0) return;
  const rows = await db
    .select({ id: verticalDramaCharacters.id })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.seriesId, seriesId),
        eq(verticalDramaCharacters.tenantId, actor.tenantId),
        eq(verticalDramaCharacters.userId, actor.userId)
      )
    );
  const allowed = new Set((rows as Array<{ id: number }>).map(row => String(row.id)));
  if (input.characterIds.some(id => !allowed.has(id)))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "One or more characters are not in this series",
    });
}

async function assertOwnedSpecialSceneLocation(
  actor: SpecialEpisodeActor,
  seriesId: number,
  locationKey: string | undefined,
): Promise<void> {
  if (!locationKey) return;
  const [location] = await db
    .select({ id: verticalDramaLocations.id })
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.seriesId, seriesId),
        eq(verticalDramaLocations.tenantId, actor.tenantId),
        eq(verticalDramaLocations.userId, actor.userId),
        eq(verticalDramaLocations.locationKey, locationKey),
      )
    )
    .limit(1);
  if (!location) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Selected scene is not in this series",
    });
  }
}

export async function createSpecialTieInEpisode(input: {
  actor: SpecialEpisodeActor;
  seriesId: number;
  createIntentId: string;
  input: SpecialTieInInput;
}): Promise<{
  episodeId: number;
  episodeNumber: number;
  specialSequence: number;
  skillJobId: string;
  skillRunStatus: string;
  deduped: boolean;
}> {
  await assertSpecialTieInEnabled(input.actor.tenantId);
  const parsed = specialTieInInputSchema.parse(input.input);
  await assertSeriesAndCharacters(input.actor, input.seriesId, parsed);
  await assertOwnedSpecialSceneLocation(
    input.actor,
    input.seriesId,
    parsed.sceneLocationKey,
  );
  await assertOwnedSpecialMediaAssets(
    input.actor,
    parsed.referenceImages.map(reference => reference.mediaAssetId)
  );
  if (parsed.footage) {
    await assertOwnedSpecialTieInFootage({ actor: input.actor, seriesId: input.seriesId, footage: parsed.footage });
  }
  await assertOwnedSpecialTieInBrollRenderJob({
    actor: input.actor,
    seriesId: input.seriesId,
    renderJobId: parsed.broll?.renderJobId,
    storyRevisionId: parsed.broll?.storyRevisionId,
    shotPlanRevisionId: parsed.broll?.shotPlanRevisionId,
  });
  if (parsed.broll) {
    await assertOwnedSpecialTieInBroll({ actor: input.actor, seriesId: input.seriesId, broll: parsed.broll });
  }
  const characterBindings = await resolveSpecialCharacterBindings({
    actor: input.actor,
    seriesId: input.seriesId,
    characterIds: parsed.characterIds,
  });
  const { image: imageModel, video: videoModel } =
    await resolveSpecialModelSelections(input.actor, parsed);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.createIntentId))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid create intent",
    });
  const referenceBindings = buildSpecialReferenceBindings(
    parsed,
    characterBindings
  );
  const data = initialSpecialData(
    parsed,
    input.createIntentId,
    referenceBindings,
    {
      image: imageModel,
      video: videoModel,
    }
  );
  let created: Awaited<ReturnType<typeof allocateSpecialEpisode>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      created = await allocateSpecialEpisode(input, parsed, data);
      break;
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505" || attempt === 2)
        throw error;
    }
  }
  if (!created)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not allocate special episode",
    });
  /* Allocation is retried on the episode-number/special-sequence unique
   * constraints. This keeps a concurrent normal episode or special create
   * from leaking a counter increment into a failed user action. The numeric
   * episode number is allocated from the dedicated 501+ range. */
  async function allocateSpecialEpisode(
    actorInput: typeof input,
    parsedInput: SpecialTieInInput,
    specialData: SpecialEpisodeData
  ) {
    return db.transaction(async tx => {
      const [existing] = await tx
        .select({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          specialSequence: verticalDramaEpisodes.specialSequence,
          specialData: verticalDramaEpisodes.specialData,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, actorInput.actor.tenantId),
            eq(verticalDramaEpisodes.userId, actorInput.actor.userId),
            eq(verticalDramaEpisodes.seriesId, actorInput.seriesId),
            sql`${verticalDramaEpisodes.episodeKind} = 'special_tie_in'`,
            sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${actorInput.createIntentId}`
          )
        )
        .limit(1);
      if (existing) return { row: existing, deduped: true };
      const [counter] = await tx
        .insert(verticalDramaSpecialSequenceCounters)
        .values({
          tenantId: actorInput.actor.tenantId,
          userId: actorInput.actor.userId,
          seriesId: actorInput.seriesId,
          nextSequence: 2,
        })
        .onConflictDoUpdate({
          target: [
            verticalDramaSpecialSequenceCounters.tenantId,
            verticalDramaSpecialSequenceCounters.seriesId,
          ],
          set: {
            nextSequence: sql`${verticalDramaSpecialSequenceCounters.nextSequence} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({
          nextSequence: verticalDramaSpecialSequenceCounters.nextSequence,
        });
      const specialSequence = Math.max(
        1,
        Number(counter?.nextSequence ?? 2) - 1
      );
      const episodeNumberRows: EpisodeNumberRow[] = await tx
        .select({
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          episodeKind: verticalDramaEpisodes.episodeKind,
        })
        .from(verticalDramaEpisodes)
        .where(
          and(
            eq(verticalDramaEpisodes.tenantId, actorInput.actor.tenantId),
            eq(verticalDramaEpisodes.seriesId, actorInput.seriesId)
          )
        );
      const [row] = await tx
        .insert(verticalDramaEpisodes)
        .values({
          tenantId: actorInput.actor.tenantId,
          userId: actorInput.actor.userId,
          seriesId: actorInput.seriesId,
          episodeKind: "special_tie_in",
          episodeNumber: nextSpecialEpisodeNumber(episodeNumberRows),
          specialSequence,
          specialData,
          title: `SPECIAL ${String(specialSequence).padStart(2, "0")}`,
          status: "draft",
          targetDurationSeconds: parsedInput.durationSeconds,
          durationProfileId: `vertical_drama_special_${parsedInput.durationSeconds}s_variable_shots`,
        })
        .returning({
          id: verticalDramaEpisodes.id,
          episodeNumber: verticalDramaEpisodes.episodeNumber,
          specialSequence: verticalDramaEpisodes.specialSequence,
          specialData: verticalDramaEpisodes.specialData,
        });
      if (!row)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create special episode",
        });
      return { row: { ...row, specialData: specialData }, deduped: false };
    });
  }
  if (created.deduped) {
    const existingData = (created.row.specialData ??
      {}) as Partial<SpecialEpisodeData>;
    const job =
      existingData.skillRun?.status === "queued" ||
      existingData.skillRun?.status === "running"
        ? await enqueueSpecialPromptJob(
            input.actor,
            input.seriesId,
            Number(created.row.id),
            existingData.input ?? parsed,
            existingData.createIntentId ?? input.createIntentId,
            Number(existingData.inputVersion ?? 1)
          )
        : { jobId: "", status: existingData.skillRun?.status ?? "failed" };
    return {
      episodeId: Number(created.row.id),
      episodeNumber: Number(created.row.episodeNumber),
      specialSequence: Number(created.row.specialSequence),
      skillJobId: job.jobId,
      skillRunStatus: job.status,
      deduped: true,
    };
  }
  const job = await enqueueSpecialPromptJob(
    input.actor,
    input.seriesId,
    Number(created.row.id),
    parsed,
    input.createIntentId,
    1
  );
  return {
    episodeId: Number(created.row.id),
    episodeNumber: Number(created.row.episodeNumber),
    specialSequence: Number(created.row.specialSequence),
    skillJobId: job.jobId,
    skillRunStatus: job.status,
    deduped: false,
  };
}

export async function getSpecialTieInEpisode(
  actor: SpecialEpisodeActor,
  episodeId: number
) {
  const [row] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, episodeId),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId)
      )
    )
    .limit(1);
  if (!row || row.episodeKind !== "special_tie_in")
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Special episode not found",
    });
  return row;
}

/**
 * Repair the legacy persisted shape where a successful special episode has
 * nine start-frame records but only the location group in `storyboard`.
 * This is a free, idempotent materialization step: it never calls a model,
 * spends credits, or replaces an already-populated storyboard.
 */
export async function materializeSpecialTieInStoryboardShots(input: {
  actor: SpecialEpisodeActor;
  episodeId: number;
}): Promise<boolean> {
  const [row] = await db
    .select({
      id: verticalDramaEpisodes.id,
      seriesId: verticalDramaEpisodes.seriesId,
      episodeKind: verticalDramaEpisodes.episodeKind,
      specialData: verticalDramaEpisodes.specialData,
      storyboard: verticalDramaEpisodes.storyboard,
      startFramePlan: verticalDramaEpisodes.startFramePlan,
      motionPromptPack: verticalDramaEpisodes.motionPromptPack,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, input.episodeId),
        eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
        eq(verticalDramaEpisodes.userId, input.actor.userId),
        sql`${verticalDramaEpisodes.episodeKind} = 'special_tie_in'`
      )
    )
    .limit(1);
  if (!row || row.episodeKind !== "special_tie_in") return false;

  const existingStoryboard = (
    row.storyboard && typeof row.storyboard === "object"
      ? row.storyboard
      : {}
  ) as Record<string, unknown>;
  if (Array.isArray(existingStoryboard.shots) && existingStoryboard.shots.length > 0) {
    return false;
  }
  const specialData = row.specialData as SpecialEpisodeData | null;
  const frames = Array.isArray(
    (row.startFramePlan as { frames?: unknown[] } | null)?.frames
  )
    ? ((row.startFramePlan as { frames: unknown[] }).frames
        .filter(value => value && typeof value === "object") as Array<
        Record<string, unknown>
      >)
    : [];
  if (!specialData?.input || frames.length === 0) return false;

  const existingLocation = Array.isArray(existingStoryboard.distinct_locations)
    ? existingStoryboard.distinct_locations[0]
    : undefined;
  const locationRecord =
    existingLocation && typeof existingLocation === "object"
      ? (existingLocation as Record<string, unknown>)
      : undefined;
  const locationKey =
    (typeof locationRecord?.location_key === "string"
      ? locationRecord.location_key.trim()
      : "") ||
    frames.find(frame => typeof frame.locationKey === "string")?.locationKey;
  if (typeof locationKey !== "string" || !locationKey.trim()) return false;

  const storySummaries = new Map(
    (specialData.output?.storySummaries ?? []).map(summary => [
      summary.shotNumber,
      summary.summary,
    ])
  );
  const clips = Array.isArray(
    (row.motionPromptPack as { clips?: unknown[] } | null)?.clips
  )
    ? ((row.motionPromptPack as { clips: unknown[] }).clips.filter(
        value => value && typeof value === "object"
      ) as Array<Record<string, unknown>>)
    : [];
  const shots = frames
    .map(frame => {
      const number = Number(frame.shotNumber);
      if (!Number.isInteger(number) || number < 1) return null;
      const clip = clips.find(clip => {
        const sourceNumbers = Array.isArray(clip.sourceShotNumbers)
          ? clip.sourceShotNumbers.map(Number)
          : [];
        return (
          sourceNumbers.includes(number) || Number(clip.parentShotNumber) === number
        );
      });
      const summary =
        typeof frame.canonicalShotSummary === "string"
          ? frame.canonicalShotSummary.trim()
          : storySummaries.get(number)?.trim() ?? "";
      if (!summary) return null;
      return {
        shotNumber: number,
        summary,
        action: typeof clip?.prompt === "string" ? clip.prompt.trim() : undefined,
        requiredCharacterRefs: Array.isArray(frame.requiredCharacterRefs)
          ? frame.requiredCharacterRefs.map(String).filter(Boolean)
          : undefined,
        durationSeconds:
          typeof clip?.durationSeconds === "number"
            ? clip.durationSeconds
            : undefined,
      };
    })
    .filter((shot): shot is NonNullable<typeof shot> => shot !== null);
  if (shots.length === 0) return false;

  const { buildSpecialTieInStoryboard } = await import(
    "./verticalDramaSpecialSkillAdapter"
  );
  const storyboard = buildSpecialTieInStoryboard(
    specialData.input,
    locationKey.trim(),
    typeof locationRecord?.location_name === "string"
      ? locationRecord.location_name
      : undefined,
    shots
  );
  const updated = await db
    .update(verticalDramaEpisodes)
    .set({
      storyboard: { ...existingStoryboard, ...storyboard },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, input.episodeId),
        eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
        eq(verticalDramaEpisodes.userId, input.actor.userId),
        sql`coalesce(jsonb_array_length(${verticalDramaEpisodes.storyboard}->'shots'), 0) = 0`
      )
    )
    .returning({ id: verticalDramaEpisodes.id });
  if (updated.length > 0) {
    console.info("[VD_SPECIAL_STORYBOARD] legacy_shots_materialized", {
      episodeId: input.episodeId,
      shotCount: shots.length,
    });
  }
  return updated.length > 0;
}

/**
 * Recover an older successful 9-shot planner result that was persisted as
 * `needs_clarification` before the storyboard materialization policy was
 * relaxed. This is deliberately non-paid and idempotent: it only reads the
 * already-captured forensic output and fills the existing episode artifacts.
 */
export async function materializeRecoverableSpecialTieInOutput(input: {
  actor: SpecialEpisodeActor;
  episodeId: number;
}): Promise<boolean> {
  const [row] = await db
    .select({
      id: verticalDramaEpisodes.id,
      seriesId: verticalDramaEpisodes.seriesId,
      episodeKind: verticalDramaEpisodes.episodeKind,
      specialData: verticalDramaEpisodes.specialData,
      startFramePlan: verticalDramaEpisodes.startFramePlan,
      motionPromptPack: verticalDramaEpisodes.motionPromptPack,
      storyboard: verticalDramaEpisodes.storyboard,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, input.episodeId),
        eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
        eq(verticalDramaEpisodes.userId, input.actor.userId),
        sql`${verticalDramaEpisodes.episodeKind} = 'special_tie_in'`
      )
    )
    .limit(1);
  if (!row || row.episodeKind !== "special_tie_in")
    return false;

  const specialData = row.specialData as SpecialEpisodeData;
  if (!specialData?.input) return false;

  const existingLocationReference = specialData.input.referenceImages.find(
    reference =>
      (reference.role === "location" ||
        reference.role === "store" ||
        specialData.input.referenceType === "location" ||
        specialData.input.referenceType === "store") &&
      typeof reference.provenance?.locationKey === "string" &&
      reference.provenance.locationKey.trim().length > 0
  );
  let specialLocationKey =
    specialData.input.sceneLocationKey?.trim() ||
    (typeof existingLocationReference?.provenance?.locationKey === "string"
      ? existingLocationReference.provenance.locationKey.trim()
      : undefined);
  if (
    !specialLocationKey &&
    (specialData.input.referenceType === "product" ||
      specialData.input.referenceType === "mixed")
  ) {
    try {
      const { buildSpecialTieInSceneSlot } = await import(
        "./verticalDramaSpecialSkillAdapter"
      );
      const sceneSlot = buildSpecialTieInSceneSlot(specialData.input);
      const location = await reconcileSpecialStorySceneSlot({
        actor: input.actor,
        seriesId: Number(row.seriesId),
        label: sceneSlot.label,
        description: sceneSlot.description,
        metadata: {
          referenceType: specialData.input.referenceType,
          source: "special_tie_in_recovery",
        },
      });
      specialLocationKey = location.locationKey;
      console.info("[VD_SPECIAL_SCENE] recovery_provisioned_scene_slot", {
        episodeId: input.episodeId,
        seriesId: Number(row.seriesId),
        locationId: location.locationId,
        locationKey: location.locationKey,
      });
    } catch (error) {
      console.warn("[VD_SPECIAL_SCENE] recovery_scene_slot_failed", {
        episodeId: input.episodeId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Backfill the explicit scene track for plans created before the product
  // reference/scene separation. This is free, idempotent, and intentionally
  // scoped to special episodes; normal-series plans are never rewritten.
  if (row.startFramePlan) {
    const {
      buildSpecialTieInSceneDescription,
      buildSpecialTieInSceneInstruction,
      buildSpecialTieInStoryboard,
    } = await import(
      "./verticalDramaSpecialSkillAdapter"
    );
    const plan = row.startFramePlan as {
      frames?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    if (!Array.isArray(plan.frames)) return false;
    const productSkillReferenceIds = new Set(
      specialData.referenceBindings
        .filter(binding => binding.role === "product")
        .map(binding => binding.skillReferenceId)
    );
    let changed = false;
    let removedGenericProductReferenceIds = 0;
    const sceneDescription = buildSpecialTieInSceneDescription(
      specialData.input
    );
    const sceneInstruction = buildSpecialTieInSceneInstruction(
      specialData.input
    );
    const sceneInstructionMarker =
      "Scene/background (primary environment, generated from the story):";
    const frames = plan.frames.map(frame => {
      const nextFrame = { ...frame };
      if (
        typeof nextFrame.sceneDescription !== "string" ||
        !nextFrame.sceneDescription.trim()
      ) {
        nextFrame.sceneDescription = sceneDescription;
        changed = true;
      }
      if (
        specialLocationKey &&
        nextFrame.locationKey !== specialLocationKey
      ) {
        nextFrame.locationKey = specialLocationKey;
        changed = true;
      }
      if (
        typeof nextFrame.imagePrompt === "string" &&
        !nextFrame.imagePrompt.includes(sceneInstructionMarker)
      ) {
        nextFrame.imagePrompt = `${nextFrame.imagePrompt.trim()}\n\n${sceneInstruction}`;
        changed = true;
      }
      if (Array.isArray(nextFrame.referenceAssetIds)) {
        const filtered = nextFrame.referenceAssetIds.filter(
          value =>
            typeof value !== "string" ||
            !productSkillReferenceIds.has(value)
        );
        if (filtered.length !== nextFrame.referenceAssetIds.length) {
          removedGenericProductReferenceIds +=
            nextFrame.referenceAssetIds.length - filtered.length;
          nextFrame.referenceAssetIds = filtered;
          changed = true;
        }
      }
      return nextFrame;
    });
    const motionPromptPack = row.motionPromptPack as {
      clips?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    } | null;
    const clips = Array.isArray(motionPromptPack?.clips)
      ? motionPromptPack.clips.map(clip => {
          if (
            typeof clip.prompt !== "string" ||
            clip.prompt.includes(sceneInstructionMarker)
          ) {
            return clip;
          }
          changed = true;
          return {
            ...clip,
            prompt: `${clip.prompt.trim()}\n\n${sceneInstruction}`,
          };
        })
      : motionPromptPack?.clips;
    const expectedStoryboard = specialLocationKey
      ? buildSpecialTieInStoryboard(
          specialData.input,
          specialLocationKey,
          specialData.input.referenceImages.find(
            reference =>
              reference.role === "location" || reference.role === "store"
          )?.label,
          plan.frames.map((frame, index) => ({
            shotNumber:
              typeof frame.shotNumber === "number"
                ? frame.shotNumber
                : typeof frame.shot_number === "number"
                  ? frame.shot_number
                  : index + 1,
            summary:
              typeof frame.canonicalShotSummary === "string" &&
              frame.canonicalShotSummary.trim()
                ? frame.canonicalShotSummary.trim()
                : typeof frame.imagePrompt === "string" && frame.imagePrompt.trim()
                  ? frame.imagePrompt.trim().slice(0, 2_000)
                  : `Shot ${index + 1}`,
            action:
              typeof frame.action === "string" ? frame.action : undefined,
            requiredCharacterRefs: Array.isArray(frame.requiredCharacterRefs)
              ? frame.requiredCharacterRefs.filter(
                  (value): value is string => typeof value === "string"
                )
              : undefined,
            durationSeconds:
              typeof frame.durationSeconds === "number"
                ? frame.durationSeconds
                : undefined,
          }))
        )
      : null;
    const nextStoryboard = expectedStoryboard ?? row.storyboard;
    const currentStoryboardLocations = (
      row.storyboard as { distinct_locations?: unknown } | null
    )?.distinct_locations;
    const currentStoryboardLocation = Array.isArray(
      currentStoryboardLocations
    )
      ? currentStoryboardLocations[0]
      : undefined;
    const expectedStoryboardLocation = expectedStoryboard?.distinct_locations[0];
    const currentStoryboardLocationRecord =
      currentStoryboardLocation &&
      typeof currentStoryboardLocation === "object"
        ? (currentStoryboardLocation as Record<string, unknown>)
        : undefined;
    const storyboardLocationMatches =
      Boolean(expectedStoryboardLocation) &&
      currentStoryboardLocationRecord?.location_key ===
        expectedStoryboardLocation?.location_key &&
      currentStoryboardLocationRecord?.location_name ===
        expectedStoryboardLocation?.location_name &&
      currentStoryboardLocationRecord?.description ===
        expectedStoryboardLocation?.description &&
      JSON.stringify(currentStoryboardLocationRecord?.shot_numbers) ===
        JSON.stringify(expectedStoryboardLocation?.shot_numbers);
    const storyboardChanged =
      Boolean(specialLocationKey) &&
      (!Array.isArray(currentStoryboardLocations) ||
        currentStoryboardLocations.length !== 1 ||
        !storyboardLocationMatches);
    if (!changed && !storyboardChanged) return false;
    const updated = await db
      .update(verticalDramaEpisodes)
      .set({
        startFramePlan: { ...plan, frames },
        ...(storyboardChanged ? { storyboard: nextStoryboard } : {}),
        ...(motionPromptPack && clips
          ? { motionPromptPack: { ...motionPromptPack, clips } }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, input.episodeId),
          eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
          eq(verticalDramaEpisodes.userId, input.actor.userId),
          sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(specialData.inputVersion)}`
        )
      )
      .returning({ id: verticalDramaEpisodes.id });
    if (updated.length) {
      console.info("[VD_SPECIAL_RECOVERY] repaired_scene_product_tracks", {
        episodeId: input.episodeId,
        inputVersion: specialData.inputVersion,
        frameCount: frames.length,
        removedGenericProductReferenceIds,
      });
    }
    return updated.length > 0;
  }

  if (
    specialData.output?.shotCount !== 9 ||
    specialData.skillRun?.status !== "needs_clarification"
  )
    return false;

  const [forensic] = await db
    .select({
      parsedOutput: verticalDramaSpecialTieInDebugEvents.parsedOutput,
      jobId: verticalDramaSpecialTieInDebugEvents.jobId,
      traceId: verticalDramaSpecialTieInDebugEvents.traceId,
    })
    .from(verticalDramaSpecialTieInDebugEvents)
    .where(
      and(
        eq(verticalDramaSpecialTieInDebugEvents.tenantId, input.actor.tenantId),
        eq(verticalDramaSpecialTieInDebugEvents.userId, input.actor.userId),
        eq(verticalDramaSpecialTieInDebugEvents.episodeId, input.episodeId),
        eq(verticalDramaSpecialTieInDebugEvents.inputVersion, specialData.inputVersion),
        eq(verticalDramaSpecialTieInDebugEvents.eventType, "output_accepted"),
        sql`${verticalDramaSpecialTieInDebugEvents.parsedOutput} IS NOT NULL`
      )
    )
    .orderBy(
      desc(verticalDramaSpecialTieInDebugEvents.createdAt),
      desc(verticalDramaSpecialTieInDebugEvents.id)
    )
    .limit(1);
  if (!forensic?.parsedOutput) return false;

  try {
    const {
      buildSpecialTieInPromptArtifacts,
      buildSpecialTieInSceneSlot,
      buildSpecialTieInStoryboard,
      validateSpecialTieInStoryOutput,
      validateSpecialSkillOutput,
    } = await import("./verticalDramaSpecialSkillAdapter");
    const output = validateSpecialSkillOutput(forensic.parsedOutput);
    validateSpecialTieInStoryOutput({
      output,
      specialInput: specialData.input,
      bindings: specialData.referenceBindings,
    });
    const resolved = await resolveSpecialReferenceBindings(
      input.actor,
      specialData.referenceBindings
    );
    const locationReference = specialData.input.referenceImages.find(
      reference =>
        (reference.role === "location" || reference.role === "store") &&
        typeof reference.provenance?.locationKey === "string"
    );
    let locationKey =
      specialData.input.sceneLocationKey?.trim() ||
      (typeof locationReference?.provenance?.locationKey === "string"
        ? locationReference.provenance.locationKey
        : undefined);
    if (
      !locationKey &&
      (specialData.input.referenceType === "product" ||
        specialData.input.referenceType === "mixed")
    ) {
      const sceneSlot = buildSpecialTieInSceneSlot(specialData.input);
      try {
        locationKey = (
          await reconcileSpecialStorySceneSlot({
            actor: input.actor,
            seriesId: Number(row.seriesId),
            label: sceneSlot.label,
            description: sceneSlot.description,
            metadata: {
              referenceType: specialData.input.referenceType,
              source: "special_tie_in_recovery",
            },
          })
        ).locationKey;
      } catch (error) {
        console.warn("[VD_SPECIAL_SCENE] materialization_scene_slot_failed", {
          episodeId: input.episodeId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const artifacts = buildSpecialTieInPromptArtifacts({
      specialData,
      output,
      productReferenceUrls: resolved
        .filter(binding => binding.role === "product")
        .map(binding => binding.authorizedUrl),
      locationKey,
    });
    if (!artifacts.startFramePlan || !artifacts.motionPromptPack) return false;

    const recoveredData: SpecialEpisodeData = {
      ...specialData,
      outputVersion: Number(specialData.outputVersion ?? 0) + 1,
      skillRun: {
        ...specialData.skillRun,
        status: "succeeded",
        completedAt: new Date().toISOString(),
        errorCode: undefined,
        errorMessage: undefined,
      },
      output: {
        ...specialData.output,
        shotCount: 9,
        storySummaries: output.shots.map(shot => ({
          shotNumber: shot.shot_number,
          summary:
            artifacts.startFramePlan?.frames.find(
              frame => frame.shotNumber === shot.shot_number
            )?.canonicalShotSummary ??
            (shot.story_summary?.trim() || shot.tie_in_action.trim()).slice(0, 2_000),
        })),
        assumptions: output.assumptions,
        qualityControl: output.quality_control,
        source: "llm",
        needsReview: true,
      },
    };
    const updated = await db
      .update(verticalDramaEpisodes)
      .set({
        specialData: recoveredData,
        startFramePlan: artifacts.startFramePlan,
        motionPromptPack: artifacts.motionPromptPack,
        ...(locationKey
          ? {
              storyboard: buildSpecialTieInStoryboard(
                specialData.input,
                locationKey,
                specialData.input.referenceImages.find(
                  reference =>
                    reference.role === "location" ||
                    reference.role === "store"
                )?.label,
                output.shots.map(shot => ({
                  shotNumber: shot.shot_number,
                  summary:
                    artifacts.startFramePlan?.frames.find(
                      frame => frame.shotNumber === shot.shot_number
                    )?.canonicalShotSummary ??
                    (shot.story_summary?.trim() || shot.tie_in_action.trim()).slice(
                      0,
                      2_000
                    ),
                  action: shot.tie_in_action,
                  requiredCharacterRefs: specialData.referenceBindings
                    .filter(binding => binding.role === "person")
                    .map(binding =>
                      String(
                        binding.provenance.characterKey ?? binding.skillReferenceId
                      )
                    ),
                  durationSeconds: output.shot_duration_seconds,
                }))
              ),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, input.episodeId),
          eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
          eq(verticalDramaEpisodes.userId, input.actor.userId),
          isNull(verticalDramaEpisodes.startFramePlan),
          sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(specialData.inputVersion)}`
        )
      )
      .returning({ id: verticalDramaEpisodes.id });
    if (!updated.length) return false;
    console.info("[VD_SPECIAL_RECOVERY] materialized_existing_output", {
      episodeId: input.episodeId,
      inputVersion: specialData.inputVersion,
      outputVersion: recoveredData.outputVersion,
      shotCount: 9,
      sourceJobId: forensic.jobId,
      sourceTraceId: forensic.traceId,
    });
    return true;
  } catch (error) {
    console.warn("[VD_SPECIAL_RECOVERY] materialization_skipped", {
      episodeId: input.episodeId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function updateSpecialTieInInput(input: {
  actor: SpecialEpisodeActor;
  episodeId: number;
  inputVersion: number;
  input: SpecialTieInInput;
}) {
  await assertSpecialTieInEnabled(input.actor.tenantId);
  const parsed = specialTieInInputSchema.parse(input.input);
  const current = await getSpecialTieInEpisode(input.actor, input.episodeId);
  const data = current.specialData as SpecialEpisodeData;
  if (!data || data.inputVersion !== input.inputVersion)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Special episode input is stale; refresh before saving",
    });
  await assertSeriesAndCharacters(
    input.actor,
    Number(current.seriesId),
    parsed
  );
  await assertOwnedSpecialSceneLocation(
    input.actor,
    Number(current.seriesId),
    parsed.sceneLocationKey,
  );
  await assertOwnedSpecialMediaAssets(
    input.actor,
    parsed.referenceImages.map(reference => reference.mediaAssetId)
  );
  if (parsed.footage) {
    await assertOwnedSpecialTieInFootage({ actor: input.actor, seriesId: Number(current.seriesId), footage: parsed.footage });
  }
  await assertOwnedSpecialTieInBrollRenderJob({
    actor: input.actor,
    seriesId: Number(current.seriesId),
    renderJobId: parsed.broll?.renderJobId,
    storyRevisionId: parsed.broll?.storyRevisionId,
    shotPlanRevisionId: parsed.broll?.shotPlanRevisionId,
  });
  if (parsed.broll) {
    await assertOwnedSpecialTieInBroll({ actor: input.actor, seriesId: Number(current.seriesId), broll: parsed.broll });
  }
  const characterBindings = await resolveSpecialCharacterBindings({
    actor: input.actor,
    seriesId: Number(current.seriesId),
    characterIds: parsed.characterIds,
  });
  const { image: imageModel, video: videoModel } =
    await resolveSpecialModelSelections(input.actor, parsed);
  const referenceBindings = buildSpecialReferenceBindings(
    parsed,
    characterBindings
  );
  const nextData: SpecialEpisodeData = {
    ...data,
    input: parsed,
    inputVersion: data.inputVersion + 1,
    outputVersion: data.outputVersion,
    skillRun: {
      ...data.skillRun,
      status: "queued",
      idempotencyKey: specialEpisodeIdempotencyKey(
        data.createIntentId,
        data.inputVersion + 1
      ),
      errorCode: undefined,
      errorMessage: undefined,
      attempt: 0,
    },
    referenceBindings,
    modelSnapshots: { image: imageModel, video: videoModel },
  };
  await db
    .update(verticalDramaEpisodes)
    .set({
      specialData: nextData,
      startFramePlan: null,
      motionPromptPack: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodes.id, input.episodeId),
        eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
        eq(verticalDramaEpisodes.userId, input.actor.userId)
      )
    )
    .returning({ id: verticalDramaEpisodes.id });
  const job = await enqueueSpecialPromptJob(
    input.actor,
    Number(current.seriesId),
    input.episodeId,
    parsed,
    data.createIntentId,
    nextData.inputVersion
  );
  return {
    inputVersion: nextData.inputVersion,
    jobId: job.jobId,
    skillRunStatus: job.status,
  };
}

export async function retrySpecialTieInEpisode(input: {
  actor: SpecialEpisodeActor;
  episodeId: number;
  inputVersion: number;
}) {
  logSpecialTieInRetry("request_start", {
    tenantId: input.actor.tenantId,
    userId: input.actor.userId,
    episodeId: input.episodeId,
    inputVersion: input.inputVersion,
  });
  try {
    await assertSpecialTieInEnabled(input.actor.tenantId);
    const row = await getSpecialTieInEpisode(input.actor, input.episodeId);
    const data = row.specialData as SpecialEpisodeData;
    if (!data || data.inputVersion !== input.inputVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Special episode input is stale; refresh before retrying",
      });
    await resolveSpecialModelSelections(input.actor, data.input);
    await assertOwnedSpecialMediaAssets(
      input.actor,
      data.input.referenceImages.map(reference => reference.mediaAssetId)
    );
    const retryAttempt = Math.max(1, data.skillRun.attempt + 1);
    const retryIdempotencyKey = specialEpisodeRetryIdempotencyKey(
      data.createIntentId,
      data.inputVersion,
      retryAttempt
    );
    logSpecialTieInRetry("validation_passed", {
      episodeId: input.episodeId,
      inputVersion: data.inputVersion,
      retryAttempt,
      idempotencyKey: retryIdempotencyKey,
    });
    const retryData: SpecialEpisodeData = {
      ...data,
      skillRun: {
        ...data.skillRun,
        status: "queued",
        errorCode: undefined,
        errorMessage: undefined,
        startedAt: undefined,
        completedAt: undefined,
      },
    };
    const queuedRows = await db
      .update(verticalDramaEpisodes)
      .set({
        specialData: retryData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(verticalDramaEpisodes.id, input.episodeId),
          eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
          eq(verticalDramaEpisodes.userId, input.actor.userId),
          sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(data.inputVersion)}`
        )
      )
      .returning({ id: verticalDramaEpisodes.id });
    logSpecialTieInRetry("state_queued", {
      episodeId: input.episodeId,
      inputVersion: data.inputVersion,
      updated: queuedRows.length,
    });
    if (!queuedRows.length)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Special episode changed while retrying; refresh before retrying",
      });
    const job = await enqueueSpecialPromptJob(
      input.actor,
      Number(row.seriesId),
      input.episodeId,
      data.input,
      data.createIntentId,
      data.inputVersion,
      retryIdempotencyKey
    );
    logSpecialTieInRetry("enqueue_result", {
      episodeId: input.episodeId,
      inputVersion: data.inputVersion,
      retryAttempt,
      jobId: job.jobId,
      skillRunStatus: job.status,
      deduped: job.deduped,
    });
    if (job.status === "failed") {
      await db
        .update(verticalDramaEpisodes)
        .set({
          specialData: {
            ...retryData,
            skillRun: {
              ...retryData.skillRun,
              status: "failed",
              errorCode: "SPECIAL_SKILL_FAILED",
              errorMessage: "Unable to enqueue special tie-in prompt job",
            },
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodes.id, input.episodeId),
            eq(verticalDramaEpisodes.tenantId, input.actor.tenantId),
            eq(verticalDramaEpisodes.userId, input.actor.userId),
            sql`${verticalDramaEpisodes.specialData}->>'inputVersion' = ${String(data.inputVersion)}`
          )
        );
      logSpecialTieInRetry("enqueue_failed_state_persisted", {
        episodeId: input.episodeId,
        inputVersion: data.inputVersion,
        jobId: job.jobId,
      });
    }
    return {
      inputVersion: data.inputVersion,
      jobId: job.jobId,
      skillRunStatus: job.status,
    };
  } catch (error) {
    console.error("[VD_SPECIAL_RETRY]", {
      event: "request_error",
      episodeId: input.episodeId,
      inputVersion: input.inputVersion,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function enqueueSpecialPromptJob(
  actor: SpecialEpisodeActor,
  seriesId: number,
  episodeId: number,
  input: SpecialTieInInput,
  createIntentId: string,
  inputVersion: number,
  idempotencyKey = specialEpisodeIdempotencyKey(createIntentId, inputVersion)
) {
  const payload: VerticalDramaInteractiveJobPayload = {
    tenantId: actor.tenantId,
    userId: actor.userId,
    scopeKey: specialEpisodeScope(seriesId, episodeId),
    kind: "special_tie_in_prompt",
    input: { seriesId, episodeId, createIntentId, inputVersion, input },
    skillSlug: SPECIAL_TIE_IN_SKILL_SLUG,
    idempotencyKey,
  };
  return enqueueVerticalDramaInteractiveJob(payload);
}

export async function runSpecialTieInPromptJob(
  payload: JobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  if (payload.kind !== "special_tie_in_prompt")
    throw new Error("Invalid special job kind");
  const { executeSpecialTieInSkill } =
    await import("./verticalDramaSpecialSkillAdapter");
  return executeSpecialTieInSkill(payload, execution);
}
