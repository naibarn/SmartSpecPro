import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaEpisodes,
  verticalDramaSeries,
  verticalDramaSpecialSequenceCounters,
} from "../../drizzle/schema";
import { getTenantFeatureFlag } from "./featureFlags";
import {
  enqueueVerticalDramaInteractiveJob,
  type VerticalDramaInteractiveJobPayload,
} from "./verticalDramaInteractiveJobs";
import {
  specialTieInInputSchema,
  type SpecialEpisodeData,
  type SpecialTieInInput,
} from "../../shared/verticalDramaSeries/specialTieInContracts";
import type { VerticalDramaInteractiveJobPayload as JobPayload } from "./verticalDramaInteractiveJobs";
import { reconcileSpecialLocationSlot } from "./verticalDramaSpecialReferences";
import { listSpecialTieInModels } from "./verticalDramaSpecialModelCatalog";

export const SPECIAL_TIE_IN_FEATURE_FLAG = "verticalDramaSpecialEpisodes";
export const SPECIAL_TIE_IN_SKILL_SLUG = "idea-to-video-prompt";

export type SpecialEpisodeActor = { tenantId: string; userId: number };

export function specialEpisodeScope(seriesId: number, episodeId: number): string {
  return `series:${seriesId}:episode:${episodeId}:special`;
}

export function specialEpisodeIdempotencyKey(createIntentId: string, inputVersion = 1): string {
  return `special:${createIntentId}:v${inputVersion}`;
}

export async function assertSpecialTieInEnabled(tenantId: string): Promise<void> {
  if (!(await getTenantFeatureFlag(SPECIAL_TIE_IN_FEATURE_FLAG, tenantId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Special tie-in episodes are not enabled" });
  }
}

function initialSpecialData(input: SpecialTieInInput, createIntentId: string): SpecialEpisodeData {
  const inputFingerprint = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
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
    referenceBindings: input.referenceImages.map((reference, index) => ({
      skillReferenceId: `reference_${index + 1}`,
      role: input.referenceType === "location" || input.referenceType === "store" ? input.referenceType : "product",
      mediaAssetId: reference.mediaAssetId,
      provenance: reference.provenance ?? { source: reference.source },
    })),
    modelSnapshots: {
      image: { modelId: input.imageModelId, provider: "pending", providerModel: input.imageModelId, catalogVersion: "pending", supportedDurationsSeconds: [], supportedAspectRatios: ["9:16"], supportsReferenceConditioning: true, supportsDialogueAudio: false },
      video: { modelId: input.videoModelId, provider: "pending", providerModel: input.videoModelId, catalogVersion: "pending", supportedDurationsSeconds: [input.durationSeconds], supportedAspectRatios: ["9:16"], supportsReferenceConditioning: true, supportsDialogueAudio: input.dialogueMode === "character_dialogue" },
    },
  };
}

async function assertSeriesAndCharacters(actor: SpecialEpisodeActor, seriesId: number, input: SpecialTieInInput) {
  const [series] = await db.select({ id: verticalDramaSeries.id }).from(verticalDramaSeries).where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, actor.tenantId), eq(verticalDramaSeries.userId, actor.userId))).limit(1);
  if (!series) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  if (input.characterIds.length === 0) return;
  const rows = await db.select({ id: verticalDramaCharacters.id }).from(verticalDramaCharacters).where(and(eq(verticalDramaCharacters.seriesId, seriesId), eq(verticalDramaCharacters.tenantId, actor.tenantId), eq(verticalDramaCharacters.userId, actor.userId)));
  const allowed = new Set(rows.map(row => String(row.id)));
  if (input.characterIds.some(id => !allowed.has(id))) throw new TRPCError({ code: "FORBIDDEN", message: "One or more characters are not in this series" });
}

export async function createSpecialTieInEpisode(input: {
  actor: SpecialEpisodeActor;
  seriesId: number;
  createIntentId: string;
  input: SpecialTieInInput;
}): Promise<{ episodeId: number; episodeNumber: number; specialSequence: number; skillJobId: string; skillRunStatus: string; deduped: boolean }> {
  await assertSpecialTieInEnabled(input.actor.tenantId);
  const parsed = specialTieInInputSchema.parse(input.input);
  const catalog = await listSpecialTieInModels({ durationSeconds: parsed.durationSeconds, dialogueMode: parsed.dialogueMode, referenceImageCount: parsed.referenceImages.length });
  if (!catalog.imageModels.some(model => model.modelId === parsed.imageModelId) || !catalog.videoModels.some(model => model.modelId === parsed.videoModelId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selected special tie-in models are not compatible with the requested references, duration, or dialogue mode" });
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.createIntentId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid create intent" });
  await assertSeriesAndCharacters(input.actor, input.seriesId, parsed);
  const data = initialSpecialData(parsed, input.createIntentId);
  let created: Awaited<ReturnType<typeof allocateSpecialEpisode>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      created = await allocateSpecialEpisode(input, parsed, data);
      break;
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505" || attempt === 2) throw error;
    }
  }
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not allocate special episode" });
  /* Allocation is retried on the episode-number/special-sequence unique
   * constraints. This keeps a concurrent normal episode or special create
   * from leaking a counter increment into a failed user action. */
  async function allocateSpecialEpisode(actorInput: typeof input, parsedInput: SpecialTieInInput, specialData: SpecialEpisodeData) {
    return db.transaction(async tx => {
    const [existing] = await tx.select({ id: verticalDramaEpisodes.id, episodeNumber: verticalDramaEpisodes.episodeNumber, specialSequence: verticalDramaEpisodes.specialSequence, specialData: verticalDramaEpisodes.specialData }).from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.tenantId, actorInput.actor.tenantId), eq(verticalDramaEpisodes.userId, actorInput.actor.userId), eq(verticalDramaEpisodes.seriesId, actorInput.seriesId), sql`${verticalDramaEpisodes.episodeKind} = 'special_tie_in'`, sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${actorInput.createIntentId}`)).limit(1);
    if (existing) return { row: existing, deduped: true };
    const [counter] = await tx.insert(verticalDramaSpecialSequenceCounters).values({ tenantId: actorInput.actor.tenantId, userId: actorInput.actor.userId, seriesId: actorInput.seriesId, nextSequence: 2 }).onConflictDoUpdate({ target: [verticalDramaSpecialSequenceCounters.tenantId, verticalDramaSpecialSequenceCounters.seriesId], set: { nextSequence: sql`${verticalDramaSpecialSequenceCounters.nextSequence} + 1`, updatedAt: new Date() } }).returning({ nextSequence: verticalDramaSpecialSequenceCounters.nextSequence });
    const specialSequence = Math.max(1, Number(counter?.nextSequence ?? 2) - 1);
    const [max] = await tx.select({ value: sql<number>`coalesce(max(${verticalDramaEpisodes.episodeNumber}), 0)` }).from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.tenantId, actorInput.actor.tenantId), eq(verticalDramaEpisodes.seriesId, actorInput.seriesId)));
    const [row] = await tx.insert(verticalDramaEpisodes).values({ tenantId: actorInput.actor.tenantId, userId: actorInput.actor.userId, seriesId: actorInput.seriesId, episodeKind: "special_tie_in", episodeNumber: Number(max?.value ?? 0) + 1, specialSequence, specialData, title: `SPECIAL ${String(specialSequence).padStart(2, "0")}`, status: "draft", targetDurationSeconds: parsedInput.durationSeconds, durationProfileId: `vertical_drama_special_${parsedInput.durationSeconds}s_variable_shots` }).returning({ id: verticalDramaEpisodes.id, episodeNumber: verticalDramaEpisodes.episodeNumber, specialSequence: verticalDramaEpisodes.specialSequence, specialData: verticalDramaEpisodes.specialData });
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create special episode" });
    return { row: { ...row, specialData: specialData }, deduped: false };
    });
  }
  if (created.deduped) {
    const existingData = (created.row.specialData ?? {}) as Partial<SpecialEpisodeData>;
    const job = existingData.skillRun?.status === "queued" || existingData.skillRun?.status === "running"
      ? await enqueueSpecialPromptJob(input.actor, input.seriesId, Number(created.row.id), existingData.input ?? parsed, existingData.createIntentId ?? input.createIntentId, Number(existingData.inputVersion ?? 1))
      : { jobId: "", status: existingData.skillRun?.status ?? "failed" };
    return { episodeId: Number(created.row.id), episodeNumber: Number(created.row.episodeNumber), specialSequence: Number(created.row.specialSequence), skillJobId: job.jobId, skillRunStatus: job.status, deduped: true };
  }
  if (parsed.referenceType === "location" || parsed.referenceType === "store") {
    await reconcileSpecialLocationSlot({
      actor: input.actor,
      seriesId: input.seriesId,
      referenceType: parsed.referenceType,
      label: parsed.referenceImages[0]?.label || parsed.referenceType,
      mediaAssetIds: parsed.referenceImages.map(reference => reference.mediaAssetId),
    });
  }
  const job = await enqueueSpecialPromptJob(input.actor, input.seriesId, Number(created.row.id), parsed, input.createIntentId, 1);
  return { episodeId: Number(created.row.id), episodeNumber: Number(created.row.episodeNumber), specialSequence: Number(created.row.specialSequence), skillJobId: job.jobId, skillRunStatus: job.status, deduped: false };
}

export async function getSpecialTieInEpisode(actor: SpecialEpisodeActor, episodeId: number) {
  const [row] = await db.select().from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.id, episodeId), eq(verticalDramaEpisodes.tenantId, actor.tenantId), eq(verticalDramaEpisodes.userId, actor.userId))).limit(1);
  if (!row || row.episodeKind !== "special_tie_in") throw new TRPCError({ code: "NOT_FOUND", message: "Special episode not found" });
  return row;
}

export async function updateSpecialTieInInput(input: { actor: SpecialEpisodeActor; episodeId: number; inputVersion: number; input: SpecialTieInInput }) {
  await assertSpecialTieInEnabled(input.actor.tenantId);
  const parsed = specialTieInInputSchema.parse(input.input);
  const current = await getSpecialTieInEpisode(input.actor, input.episodeId);
  const data = current.specialData as SpecialEpisodeData;
  if (!data || data.inputVersion !== input.inputVersion) throw new TRPCError({ code: "CONFLICT", message: "Special episode input is stale; refresh before saving" });
  const nextData: SpecialEpisodeData = { ...data, input: parsed, inputVersion: data.inputVersion + 1, outputVersion: data.outputVersion, skillRun: { ...data.skillRun, status: "queued", idempotencyKey: specialEpisodeIdempotencyKey(data.createIntentId, data.inputVersion + 1), errorCode: undefined, errorMessage: undefined, attempt: 0 } };
  await db.update(verticalDramaEpisodes).set({ specialData: nextData, startFramePlan: null, motionPromptPack: null, updatedAt: new Date() }).where(and(eq(verticalDramaEpisodes.id, input.episodeId), eq(verticalDramaEpisodes.tenantId, input.actor.tenantId), eq(verticalDramaEpisodes.userId, input.actor.userId))).returning({ id: verticalDramaEpisodes.id });
  const job = await enqueueSpecialPromptJob(input.actor, Number(current.seriesId), input.episodeId, parsed, data.createIntentId, nextData.inputVersion);
  return { inputVersion: nextData.inputVersion, jobId: job.jobId, skillRunStatus: job.status };
}

export async function retrySpecialTieInEpisode(input: { actor: SpecialEpisodeActor; episodeId: number; inputVersion: number }) {
  const row = await getSpecialTieInEpisode(input.actor, input.episodeId);
  const data = row.specialData as SpecialEpisodeData;
  if (!data || data.inputVersion !== input.inputVersion) throw new TRPCError({ code: "CONFLICT", message: "Special episode input is stale; refresh before retrying" });
  const job = await enqueueSpecialPromptJob(input.actor, Number(row.seriesId), input.episodeId, data.input, data.createIntentId, data.inputVersion);
  return { inputVersion: data.inputVersion, jobId: job.jobId, skillRunStatus: job.status };
}

async function enqueueSpecialPromptJob(actor: SpecialEpisodeActor, seriesId: number, episodeId: number, input: SpecialTieInInput, createIntentId: string, inputVersion: number) {
  const payload: VerticalDramaInteractiveJobPayload = { tenantId: actor.tenantId, userId: actor.userId, scopeKey: specialEpisodeScope(seriesId, episodeId), kind: "special_tie_in_prompt", input: { seriesId, episodeId, createIntentId, inputVersion, input }, skillSlug: SPECIAL_TIE_IN_SKILL_SLUG, idempotencyKey: specialEpisodeIdempotencyKey(createIntentId, inputVersion) };
  return enqueueVerticalDramaInteractiveJob(payload);
}

export async function runSpecialTieInPromptJob(payload: JobPayload, execution: { jobId: string; traceId: string }): Promise<unknown> {
  if (payload.kind !== "special_tie_in_prompt") throw new Error("Invalid special job kind");
  const { executeSpecialTieInSkill } = await import("./verticalDramaSpecialSkillAdapter");
  return executeSpecialTieInSkill(payload, execution);
}
