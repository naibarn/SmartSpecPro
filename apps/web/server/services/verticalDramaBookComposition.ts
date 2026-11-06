import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { verticalDramaBookRevisions } from "../../drizzle/schema";
import { verticalDramaBookDocumentSchema, type VerticalDramaBookDocument } from "../../shared/verticalDramaSeries/bookDocument";
import { db } from "../db";
import { calculateCreditsForLLMDynamic, createCreditReservation, refundReservation } from "./creditService";
import { callLLMStructured } from "./callLLMStructured";
import { resolveStructuredAutoChatModelSelection } from "./chatModelSelection";
import { fingerprintBookSource } from "./verticalDramaBookSnapshot";

const chapterOutputSchema = z.object({
  passages: z.array(z.object({
    shotNumber: z.number().int().min(0),
    prose: z.string().trim().min(1).max(5000),
    dialogue: z.array(z.object({ speaker: z.string().trim().max(300).nullable(), text: z.string().trim().min(1).max(2000) })).max(80).default([]),
  }).strict()).min(1).max(100),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
}

function shotDescription(payload: Record<string, unknown>, shotNumber: number): string {
  const storyboard = asRecord(payload.storyboard);
  const shot = asArray(storyboard.shots).find(item => Number(item.shotNumber) === shotNumber);
  return typeof shot?.description === "string" ? shot.description.slice(0, 3000) : "";
}

const COMPOSITION_SYSTEM_PROMPT = [
  "You are composing one chapter of an illustrated novel from an author's selected vertical-drama source.",
  "Write readable prose and dialogue in the source language. Preserve event order and facts. Do not invent actions, backstory, motives, relationships, or resolution.",
  "Return one prose passage for each supplied shot, in source order, and retain dialogue meaning and known speaker names.",
  "Do not expose shot numbers as headings. Use shot numbers only in the structured passage references.",
].join(" ");
type CompositionModelSelection = { resolvedModelId: string; preferredProviderId?: number; resolvedProviderId?: number };

function buildChapterUserMessage(source: Record<string, unknown>, payload: Record<string, unknown>, shots: Array<Record<string, unknown>>): string {
  const seriesPayload = asRecord(source.seriesPayload);
  return JSON.stringify({
    series: { title: seriesPayload.title, locale: seriesPayload.locale, genre: seriesPayload.genre, tone: seriesPayload.tone, bible: seriesPayload.bible },
    episode: { title: payload.title, script: payload.script, dialogueAudioPlan: payload.dialogueAudioPlan },
    shots: shots.map(shot => ({
      shotNumber: Number(shot.shotNumber),
      description: Number(shot.shotNumber) === 0
        ? JSON.stringify(payload.script ?? {}).slice(0, 6000)
        : shotDescription(payload, Number(shot.shotNumber)),
    })),
  });
}

/** Quote the maximum prompt/output envelope with retry and price-drift headroom. */
export async function estimateVerticalDramaBookCompositionCredits(input: {
  chapterCount: number;
  maxInputBytesPerChapter?: number;
  modelSelection?: CompositionModelSelection;
}) {
  const selection = input.modelSelection ?? await resolveStructuredAutoChatModelSelection();
  const inputTokensCeiling = input.maxInputBytesPerChapter ?? 64 * 1024;
  const providerId = selection.preferredProviderId ?? selection.resolvedProviderId;
  const oneAttempt = await calculateCreditsForLLMDynamic(inputTokensCeiling, 7000, selection.resolvedModelId, providerId);
  const attempts = 2;
  const safetyMultiplier = 2;
  return {
    modelId: selection.resolvedModelId,
    preferredProviderId: providerId ?? null,
    estimatedCredits: Math.ceil(oneAttempt * attempts * safetyMultiplier * input.chapterCount),
  };
}

export async function composeVerticalDramaBookRevision(input: {
  tenantId: string;
  userId: number;
  bookId: number;
  revisionId: number;
  imageDensity: "none" | "chapter_openers" | "occasional" | "all_shots";
  modelId?: string;
  preferredProviderId?: number | null;
  onProgress?: (progress: { completedChapters: number; totalChapters: number; chapterTitle: string }) => Promise<void>;
}) {
  const [revision] = await db.select().from(verticalDramaBookRevisions).where(and(
    eq(verticalDramaBookRevisions.id, input.revisionId),
    eq(verticalDramaBookRevisions.bookId, input.bookId),
    eq(verticalDramaBookRevisions.tenantId, input.tenantId),
    eq(verticalDramaBookRevisions.userId, input.userId),
    eq(verticalDramaBookRevisions.status, "candidate"),
  )).limit(1);
  if (!revision) throw new Error("BOOK_COMPOSITION_REVISION_NOT_FOUND");

  const source = asRecord(revision.sourceSnapshot);
  const sourceEpisodes = asArray(source.episodes);
  const initial = verticalDramaBookDocumentSchema.parse(revision.document) as VerticalDramaBookDocument;
  if (sourceEpisodes.length !== initial.chapters.length) throw new Error("BOOK_COMPOSITION_SOURCE_MISMATCH");
  const mutableChapters = initial.chapters.map(chapter => ({ ...chapter, blocks: [...chapter.blocks] }));
  const density = input.imageDensity;
  const assetChecksums = new Map(asArray(source.assets).map(asset => [Number(asset.mediaAssetId), String(asset.checksum)]));
  const modelSelection = input.modelId
    ? { resolvedModelId: input.modelId, preferredProviderId: input.preferredProviderId ?? undefined }
    : await resolveStructuredAutoChatModelSelection();

  for (let index = 0; index < sourceEpisodes.length; index += 1) {
    const episode = sourceEpisodes[index];
    const chapter = mutableChapters[index];
    const existingContent = chapter.blocks.some(block => block.type !== "paragraph" || block.text.trim().length > 0);
    if (existingContent) continue;
    const payload = asRecord(episode.payload);
    const pinnedShots = asArray(episode.shots);
    const shots = pinnedShots.length > 0
      ? pinnedShots
      : [{ shotNumber: 0, mediaAssetId: null, locator: `episode:${Number(episode.episodeId)}/script` }];
    const episodeId = Number(episode.episodeId);
    const revisionFingerprint = String(episode.revisionFingerprint);
    const userMessage = buildChapterUserMessage(source, payload, shots);
    const inputBytes = Buffer.byteLength(COMPOSITION_SYSTEM_PROMPT, "utf8") + Buffer.byteLength(userMessage, "utf8");
    const inputTokensCeiling = inputBytes + 4096;
    const attemptsCeiling = 2;
    const priceSafetyMultiplier = 2;
    const reservationAmount = Math.max(1, Math.ceil(
      await calculateCreditsForLLMDynamic(inputTokensCeiling, 7000, modelSelection.resolvedModelId, modelSelection.preferredProviderId ?? modelSelection.resolvedProviderId)
      * attemptsCeiling * priceSafetyMultiplier,
    ));
    const reservation = await createCreditReservation(
      input.userId,
      reservationAmount,
      "chat",
      { feature: "326", bookId: input.bookId, revisionId: input.revisionId, chapterId: chapter.id, model: modelSelection.resolvedModelId, inputBytes, maxOutputTokens: 7000, maxAttempts: attemptsCeiling },
      `vd-book-compose:${input.tenantId}:${input.bookId}:${input.revisionId}:${chapter.id}:${randomUUID()}`,
      { tenantId: input.tenantId, description: "Vertical drama book chapter composition reservation" },
    );
    let result;
    try {
      result = await callLLMStructured({
      systemPrompt: COMPOSITION_SYSTEM_PROMPT,
      userMessage,
      model: modelSelection.resolvedModelId,
      preferredProviderId: modelSelection.preferredProviderId,
      strictProviderPin: Boolean(modelSelection.preferredProviderId),
      disableProviderFallbacks: true,
      zodSchema: chapterOutputSchema,
      maxTokens: 7000,
      maxRetries: 1,
      userId: input.userId,
      tenantId: input.tenantId,
      billingDescription: "vertical drama book chapter composition",
      billingMetadata: {
        feature: "326",
        bookId: input.bookId,
        revisionId: input.revisionId,
        chapterId: chapter.id,
        idempotencyKey: `vd-book-compose:${input.tenantId}:${input.bookId}:${input.revisionId}:${chapter.id}:${reservation.reservationId}`,
      },
      creditReservation: { reservationId: reservation.reservationId, settlementKey: reservation.reservationId },
      });
    } finally {
      await refundReservation(reservation.reservationId);
    }
    const expectedShotNumbers = new Set(shots.map(shot => Number(shot.shotNumber)));
    const actualShotNumbers = result.data.passages.map(passage => passage.shotNumber);
    if (new Set(actualShotNumbers).size !== actualShotNumbers.length || actualShotNumbers.length !== expectedShotNumbers.size || actualShotNumbers.some(number => !expectedShotNumbers.has(number))) {
      throw new Error("BOOK_COMPOSITION_PASSAGE_SET_INVALID");
    }
    const passages = new Map(result.data.passages.map(passage => [passage.shotNumber, passage]));
    const blocks: VerticalDramaBookDocument["chapters"][number]["blocks"] = [];
    for (const shot of shots) {
      const shotNumber = Number(shot.shotNumber);
      const passage = passages.get(shotNumber);
      if (!passage) throw new Error("BOOK_COMPOSITION_PASSAGE_MISSING");
      const locator = typeof shot.locator === "string" ? shot.locator : `episode:${episodeId}/shot:${shotNumber}`;
      const sourceRef = { episodeId, episodeRevisionId: episode.episodeRevisionId == null ? null : Number(episode.episodeRevisionId), locator, sourceHash: revisionFingerprint };
      blocks.push({ id: `${chapter.id}-shot-${shotNumber}-prose`, type: "paragraph", text: passage.prose, sourceRefs: [sourceRef] });
      passage.dialogue.forEach((line, lineIndex) => blocks.push({
        id: `${chapter.id}-shot-${shotNumber}-dialogue-${lineIndex + 1}`,
        type: "dialogue",
        speaker: line.speaker,
        text: line.text,
        sourceRefs: [sourceRef],
      }));
      const mediaAssetId = Number(shot.mediaAssetId);
      const checksum = assetChecksums.get(mediaAssetId);
      const includeImage = shotNumber > 0 && (density === "all_shots" || (density === "chapter_openers" && shotNumber === Number(shots[0]?.shotNumber)) || (density === "occasional" && shotNumber % 3 === 1));
      if (includeImage && Number.isSafeInteger(mediaAssetId) && mediaAssetId > 0 && checksum) {
        blocks.push({
          id: `${chapter.id}-shot-${shotNumber}-illustration`,
          type: "illustration",
          mediaAssetId,
          mediaChecksum: checksum,
          placement: shotNumber === Number(shots[0]?.shotNumber) ? "chapter_opener" : "inline",
          altText: shotDescription(payload, shotNumber),
          caption: null,
          decorative: !shotDescription(payload, shotNumber),
          sourceRefs: [sourceRef],
        });
      }
    }
    mutableChapters[index] = { ...chapter, blocks };
    const partialDocument = { ...initial, chapters: mutableChapters };
    await db.update(verticalDramaBookRevisions).set({ document: partialDocument }).where(and(
      eq(verticalDramaBookRevisions.id, revision.id), eq(verticalDramaBookRevisions.tenantId, input.tenantId), eq(verticalDramaBookRevisions.userId, input.userId), eq(verticalDramaBookRevisions.status, "candidate"),
    ));
    await input.onProgress?.({ completedChapters: index + 1, totalChapters: sourceEpisodes.length, chapterTitle: chapter.title });
  }

  const document = verticalDramaBookDocumentSchema.parse({ ...initial, chapters: mutableChapters });
  const documentFingerprint = fingerprintBookSource(document);
  await db.update(verticalDramaBookRevisions).set({ document, documentFingerprint, status: "draft" }).where(and(
    eq(verticalDramaBookRevisions.id, revision.id), eq(verticalDramaBookRevisions.tenantId, input.tenantId), eq(verticalDramaBookRevisions.userId, input.userId), eq(verticalDramaBookRevisions.status, "candidate"),
  ));
  return { revisionId: revision.id, documentFingerprint, chapterCount: document.chapters.length };
}
