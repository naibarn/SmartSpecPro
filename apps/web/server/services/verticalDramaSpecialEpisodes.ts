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
      inputFingerprint: "pending",
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
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.createIntentId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid create intent" });
  await assertSeriesAndCharacters(input.actor, input.seriesId, parsed);
  const data = initialSpecialData(parsed, input.createIntentId);
  const created = await db.transaction(async tx => {
    const [existing] = await tx.select({ id: verticalDramaEpisodes.id, episodeNumber: verticalDramaEpisodes.episodeNumber, specialSequence: verticalDramaEpisodes.specialSequence, specialData: verticalDramaEpisodes.specialData }).from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.tenantId, input.actor.tenantId), eq(verticalDramaEpisodes.userId, input.actor.userId), eq(verticalDramaEpisodes.seriesId, input.seriesId), sql`${verticalDramaEpisodes.episodeKind} = 'special_tie_in'`, sql`${verticalDramaEpisodes.specialData}->>'createIntentId' = ${input.createIntentId}`)).limit(1);
    if (existing) return { row: existing, deduped: true };
    const [counter] = await tx.insert(verticalDramaSpecialSequenceCounters).values({ tenantId: input.actor.tenantId, userId: input.actor.userId, seriesId: input.seriesId, nextSequence: 2 }).onConflictDoUpdate({ target: [verticalDramaSpecialSequenceCounters.tenantId, verticalDramaSpecialSequenceCounters.seriesId], set: { nextSequence: sql`${verticalDramaSpecialSequenceCounters.nextSequence} + 1`, updatedAt: new Date() } }).returning({ nextSequence: verticalDramaSpecialSequenceCounters.nextSequence });
    const specialSequence = Math.max(1, Number(counter?.nextSequence ?? 2) - 1);
    const [max] = await tx.select({ value: sql<number>`coalesce(max(${verticalDramaEpisodes.episodeNumber}), 0)` }).from(verticalDramaEpisodes).where(and(eq(verticalDramaEpisodes.tenantId, input.actor.tenantId), eq(verticalDramaEpisodes.seriesId, input.seriesId)));
    const [row] = await tx.insert(verticalDramaEpisodes).values({ tenantId: input.actor.tenantId, userId: input.actor.userId, seriesId: input.seriesId, episodeKind: "special_tie_in", episodeNumber: Number(max?.value ?? 0) + 1, specialSequence, specialData: data, title: `SPECIAL ${String(specialSequence).padStart(2, "0")}`, status: "draft", targetDurationSeconds: parsed.durationSeconds, durationProfileId: `vertical_drama_special_${parsed.durationSeconds}s_variable_shots` }).returning({ id: verticalDramaEpisodes.id, episodeNumber: verticalDramaEpisodes.episodeNumber, specialSequence: verticalDramaEpisodes.specialSequence, specialData: verticalDramaEpisodes.specialData });
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create special episode" });
    return { row: { ...row, specialData: data }, deduped: false };
  });
  if (created.deduped) {
    const existingData = (created.row.specialData ?? {}) as Partial<SpecialEpisodeData>;
    const job = existingData.skillRun?.idempotencyKey ? await enqueueSpecialPromptJob(input.actor, input.seriesId, Number(created.row.id), existingData.input ?? parsed, existingData.createIntentId ?? input.createIntentId, Number(existingData.inputVersion ?? 1)) : { jobId: "deduped", status: "succeeded" as const };
    return { episodeId: Number(created.row.id), episodeNumber: Number(created.row.episodeNumber), specialSequence: Number(created.row.specialSequence), skillJobId: job.jobId, skillRunStatus: job.status, deduped: true };
  }
  const job = await enqueueSpecialPromptJob(input.actor, input.seriesId, Number(created.row.id), parsed, input.createIntentId, 1);
  return { episodeId: Number(created.row.id), episodeNumber: Number(created.row.episodeNumber), specialSequence: Number(created.row.specialSequence), skillJobId: job.jobId, skillRunStatus: job.status, deduped: false };
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
