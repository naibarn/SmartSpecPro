import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { llmProviders, mediaAssets, modelProviderMap, verticalDramaBookRevisions } from "../../drizzle/schema";
import { verticalDramaBookDocumentSchema, verticalDramaBookChapterQualityReviewSchema, type VerticalDramaBookDocument } from "../../shared/verticalDramaSeries/bookDocument";
import type { MessageContent } from "../_core/llm";
import { db } from "../db";
import { calculateCreditsForLLMDynamic, createCreditReservation, refundReservation } from "./creditService";
import { callLLMStructured } from "./callLLMStructured";
import { resolveStructuredAutoChatModelSelection } from "./chatModelSelection";
import { fingerprintBookSource } from "./verticalDramaBookSnapshot";
import { storageReadBuffer } from "../storage";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";

const chapterOutputSchema = z.object({
  blocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), sourceShotNumbers: z.array(z.number().int().min(0)).min(1).max(9), text: z.string().trim().min(1).max(8000) }).strict(),
    z.object({ type: z.literal("dialogue"), sourceShotNumbers: z.array(z.number().int().min(0)).min(1).max(9), speaker: z.string().trim().max(300).nullable(), text: z.string().trim().min(1).max(2000) }).strict(),
    z.object({ type: z.literal("scene_break"), sourceShotNumbers: z.array(z.number().int().min(0)).min(1).max(9) }).strict(),
  ])).min(1).max(120),
  qualityReview: verticalDramaBookChapterQualityReviewSchema.optional(),
}).strict();

const NOVELIZER_OUTPUT_CONTRACT = `Return exactly one JSON object matching this shape. Do not use a root-level "novel" field, put rubric scores at the root, add other fields, or wrap the JSON in Markdown:
{"blocks":[{"type":"paragraph","sourceShotNumbers":[1,2],"text":"Narrative prose."},{"type":"dialogue","sourceShotNumbers":[2],"speaker":"Character name","text":"Dialogue."},{"type":"scene_break","sourceShotNumbers":[3]}],"qualityReview":{"flow":4,"readability":4,"continuity":4,"dialogue":4,"sourceCoverage":4,"unsupportedDetail":5,"findings":[]}}
Use only paragraph, dialogue, and scene_break blocks. Each block must include sourceShotNumbers from this episode's supplied shots; together the blocks must cover every supplied shot number and no others. Dialogue speaker may be null. Rubric scores are integers 1–5 and findings has at most six short strings.`;

const NOVELIZER_MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const NOVELIZER_MAX_IMAGE_BYTES = 300 * 1024;
const NOVELIZER_MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024;
const NOVELIZER_MAX_REQUEST_BYTES = 6 * 1024 * 1024;

function boundedJson(value: unknown, maxBytes: number): unknown {
  const serialized = JSON.stringify(value ?? null) ?? "null";
  if (Buffer.byteLength(serialized, "utf8") <= maxBytes) return value ?? null;
  let excerpt = serialized.slice(0, maxBytes);
  while (Buffer.byteLength(excerpt, "utf8") > maxBytes) excerpt = excerpt.slice(0, Math.max(0, excerpt.length - 1024));
  return `${excerpt}\n[Source context shortened to fit the novel-writing request.]`;
}

async function encodeNovelizerImage(sourceBytes: Buffer): Promise<Buffer | null> {
  try {
    const encode = (width: number, quality: number) => sharp(sourceBytes, { animated: false, limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    let encoded = await encode(768, 68);
    if (encoded.length > NOVELIZER_MAX_IMAGE_BYTES) encoded = await encode(640, 48);
    return encoded.length <= NOVELIZER_MAX_IMAGE_BYTES ? encoded : null;
  } catch {
    return null;
  }
}

export type VerticalDramaBookNovelizerModel = { id: string; name: string; providerId: number };

export async function listVerticalDramaBookNovelizerModels(): Promise<VerticalDramaBookNovelizerModel[]> {
  const rows = await db.select({
    modelId: modelProviderMap.modelId,
    modelName: modelProviderMap.modelName,
    providerId: llmProviders.id,
    providerName: llmProviders.providerName,
    providerDisplayName: llmProviders.displayName,
    supportsVision: modelProviderMap.supportsVision,
  }).from(modelProviderMap).innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id)).where(and(
    eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true),
  )).orderBy(modelProviderMap.priority, modelProviderMap.id);
  const visionPatterns = ["gpt-4o", "gpt-4-vision", "gpt-4-turbo", "gpt-5", "claude-3", "claude-sonnet", "claude-opus", "gemini", "qwen-vl"];
  return rows.filter(row => row.supportsVision || [row.modelId, row.modelName].some(value => visionPatterns.some(pattern => value.toLowerCase().includes(pattern))))
    .map(row => ({ id: row.modelId.includes("/") ? row.modelId : `${row.providerName}/${row.modelId}`, name: `${row.modelName} · ${row.providerDisplayName}`, providerId: row.providerId }));
}

export async function resolveVerticalDramaBookNovelizerModel(modelId: string): Promise<VerticalDramaBookNovelizerModel> {
  const match = (await listVerticalDramaBookNovelizerModels()).find(model => model.id === modelId);
  if (!match) throw new Error("BOOK_NOVELIZER_MODEL_UNAVAILABLE");
  return match;
}

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

let cachedNovelizerPrompt: string | null = null;
function loadNovelizerPrompt(): string {
  if (cachedNovelizerPrompt) return cachedNovelizerPrompt;
  for (const directory of resolveSkillDirCandidates(path.join("skills", "vertical-drama-book-novelizer"))) {
    const manifestPath = resolveSkillManifestPath(directory);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const raw = fs.readFileSync(manifestPath, "utf8");
    cachedNovelizerPrompt = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
    if (cachedNovelizerPrompt) return cachedNovelizerPrompt;
  }
  throw new Error("BOOK_NOVELIZER_SKILL_UNAVAILABLE");
}

type CompositionModelSelection = { resolvedModelId: string; preferredProviderId?: number; resolvedProviderId?: number };

function buildChapterUserMessage(source: Record<string, unknown>, payload: Record<string, unknown>, shots: Array<Record<string, unknown>>): string {
  const seriesPayload = asRecord(source.seriesPayload);
  return JSON.stringify({
    series: {
      title: seriesPayload.title,
      synopsis: boundedJson(seriesPayload.synopsis, 6000),
      locale: seriesPayload.locale,
      genre: seriesPayload.genre,
      tone: seriesPayload.tone,
      bible: boundedJson(seriesPayload.bible, 24000),
    },
    episode: {
      title: payload.title,
      script: boundedJson(payload.script, 24000),
      dialogueAudioPlan: boundedJson(payload.dialogueAudioPlan, 16000),
    },
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
  targetChapterId?: string;
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
  const model = input.modelId
    ? await resolveVerticalDramaBookNovelizerModel(input.modelId)
    : (await listVerticalDramaBookNovelizerModels())[0];
  if (!model) throw new Error("BOOK_NOVELIZER_MODEL_UNAVAILABLE");
  const modelSelection = { resolvedModelId: model.id, preferredProviderId: model.providerId };

  let completedChapters = 0;
  for (let index = 0; index < sourceEpisodes.length; index += 1) {
    const episode = sourceEpisodes[index];
    const chapter = mutableChapters[index];
    if (input.targetChapterId && chapter.id !== input.targetChapterId) continue;
    const existingContent = chapter.blocks.some(block => block.type !== "paragraph" || block.text.trim().length > 0);
    if (!input.targetChapterId && existingContent) continue;
    const payload = asRecord(episode.payload);
    const pinnedShots = asArray(episode.shots);
    const shots = pinnedShots.length > 0
      ? pinnedShots
      : [{ shotNumber: 0, mediaAssetId: null, locator: `episode:${Number(episode.episodeId)}/script` }];
    const episodeId = Number(episode.episodeId);
    const revisionFingerprint = String(episode.revisionFingerprint);
    const userPrompt = buildChapterUserMessage(source, payload, shots);
    const sourceAssetIds = [...new Set(shots.map(shot => Number(shot.mediaAssetId)).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 9);
    const imageRowsUnordered = sourceAssetIds.length ? await db.select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType, status: mediaAssets.status, checksum: mediaAssets.checksumSha256 })
      .from(mediaAssets).where(and(eq(mediaAssets.tenantId, input.tenantId), eq(mediaAssets.userId, input.userId), inArray(mediaAssets.id, sourceAssetIds))) : [];
    const imageOrder = new Map(sourceAssetIds.map((id, order) => [id, order]));
    const imageRows = imageRowsUnordered.sort((left, right) => (imageOrder.get(left.id) ?? 0) - (imageOrder.get(right.id) ?? 0));
    const imageParts: MessageContent[] = [];
    const attachedAssetIds = new Set<number>();
    let imageBytes = 0;
    let sourceImageBytes = 0;
    for (const row of imageRows) {
      if (row.status !== "ready" || !row.mimeType.startsWith("image/") || assetChecksums.get(row.id) !== row.checksum) continue;
      const bytes = await storageReadBuffer(row.storageKey);
      if (!bytes || bytes.length > NOVELIZER_MAX_SOURCE_IMAGE_BYTES) continue;
      const optimized = await encodeNovelizerImage(bytes);
      if (!optimized || imageBytes + optimized.length > NOVELIZER_MAX_TOTAL_IMAGE_BYTES) continue;
      sourceImageBytes += bytes.length;
      imageBytes += optimized.length;
      imageParts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${optimized.toString("base64")}`, detail: "low" } });
      attachedAssetIds.add(row.id);
    }
    const imageLabels = attachedAssetIds.size ? imageRows.filter(row => attachedAssetIds.has(row.id)).map(row => `Authorized episode shot image asset ${row.id}.`).join(" ") : "No source images could be attached.";
    const userMessage: MessageContent[] = [
      { type: "text", text: `${userPrompt}\n\nAttached images are ordered by the media asset IDs referenced in the source shot records. ${imageLabels} Use visible evidence conservatively.` },
      ...imageParts,
    ];
    const systemPrompt = `${loadNovelizerPrompt()}\n\n## Required structured output contract\n${NOVELIZER_OUTPUT_CONTRACT}`;
    const requestBytes = Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(JSON.stringify(userMessage), "utf8");
    if (requestBytes > NOVELIZER_MAX_REQUEST_BYTES) throw new Error("BOOK_COMPOSITION_INPUT_TOO_LARGE");
    const inputBytes = Buffer.byteLength(systemPrompt, "utf8") + Buffer.byteLength(userPrompt, "utf8") + imageParts.length * 8192;
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
      { feature: "326", bookId: input.bookId, revisionId: input.revisionId, chapterId: chapter.id, model: modelSelection.resolvedModelId, inputBytes, maxOutputTokens: 7000, maxAttempts: attemptsCeiling, skillSlug: "vertical-drama-book-novelizer", sourceImageCount: imageParts.length, sourceImageBytes, optimizedImageBytes: imageBytes, serializedRequestBytes: requestBytes },
      `vd-book-compose:${input.tenantId}:${input.bookId}:${input.revisionId}:${chapter.id}:${randomUUID()}`,
      { tenantId: input.tenantId, description: "Vertical drama book chapter composition reservation" },
    );
    let result;
    try {
      result = await callLLMStructured({
      systemPrompt,
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
        skillSlug: "vertical-drama-book-novelizer",
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
    const referencedShotNumbers = new Set(result.data.blocks.flatMap(block => block.sourceShotNumbers));
    if ([...expectedShotNumbers].some(number => !referencedShotNumbers.has(number)) || [...referencedShotNumbers].some(number => !expectedShotNumbers.has(number))) {
      throw new Error("BOOK_COMPOSITION_SOURCE_COVERAGE_INVALID");
    }
    const blocks: VerticalDramaBookDocument["chapters"][number]["blocks"] = [];
    const shotByNumber = new Map(shots.map(shot => [Number(shot.shotNumber), shot]));
    result.data.blocks.forEach((block, blockIndex) => {
      const sourceRefs = block.sourceShotNumbers.map(shotNumber => {
        const shot = shotByNumber.get(shotNumber);
        if (!shot) throw new Error("BOOK_COMPOSITION_SOURCE_COVERAGE_INVALID");
        return { episodeId, episodeRevisionId: episode.episodeRevisionId == null ? null : Number(episode.episodeRevisionId), locator: typeof shot.locator === "string" ? shot.locator : `episode:${episodeId}/shot:${shotNumber}`, sourceHash: revisionFingerprint };
      });
      if (block.type === "scene_break") {
        blocks.push({ id: `${chapter.id}-scene-${blockIndex + 1}`, type: "scene_break", sourceRefs });
        return;
      }
      blocks.push(block.type === "paragraph"
        ? { id: `${chapter.id}-narrative-${blockIndex + 1}`, type: "paragraph", text: block.text, sourceRefs }
        : { id: `${chapter.id}-dialogue-${blockIndex + 1}`, type: "dialogue", speaker: block.speaker, text: block.text, sourceRefs });
    });
    for (const shot of shots) {
      const shotNumber = Number(shot.shotNumber);
      const mediaAssetId = Number(shot.mediaAssetId);
      const checksum = assetChecksums.get(mediaAssetId);
      const includeImage = shotNumber > 0 && (density === "all_shots" || (density === "chapter_openers" && shotNumber === Number(shots[0]?.shotNumber)) || (density === "occasional" && shotNumber % 3 === 1));
      if (includeImage && Number.isSafeInteger(mediaAssetId) && mediaAssetId > 0 && checksum) {
        const sourceRef = {
          episodeId,
          episodeRevisionId: episode.episodeRevisionId == null ? null : Number(episode.episodeRevisionId),
          locator: typeof shot.locator === "string" ? shot.locator : `episode:${episodeId}/shot:${shotNumber}`,
          sourceHash: revisionFingerprint,
        };
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
    mutableChapters[index] = { ...chapter, blocks, ...(result.data.qualityReview ? { qualityReview: result.data.qualityReview } : {}) };
    const partialDocument = { ...initial, chapters: mutableChapters };
    await db.update(verticalDramaBookRevisions).set({ document: partialDocument }).where(and(
      eq(verticalDramaBookRevisions.id, revision.id), eq(verticalDramaBookRevisions.tenantId, input.tenantId), eq(verticalDramaBookRevisions.userId, input.userId), eq(verticalDramaBookRevisions.status, "candidate"),
    ));
    completedChapters += 1;
    await input.onProgress?.({ completedChapters, totalChapters: input.targetChapterId ? 1 : sourceEpisodes.length, chapterTitle: chapter.title });
  }

  const document = verticalDramaBookDocumentSchema.parse({ ...initial, chapters: mutableChapters });
  const documentFingerprint = fingerprintBookSource(document);
  await db.update(verticalDramaBookRevisions).set({ document, documentFingerprint, status: input.targetChapterId ? "candidate" : "draft" }).where(and(
    eq(verticalDramaBookRevisions.id, revision.id), eq(verticalDramaBookRevisions.tenantId, input.tenantId), eq(verticalDramaBookRevisions.userId, input.userId), eq(verticalDramaBookRevisions.status, "candidate"),
  ));
  return { revisionId: revision.id, documentFingerprint, chapterCount: document.chapters.length };
}
