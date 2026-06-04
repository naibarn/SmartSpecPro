import { getDb } from "../db";
import {
  MEDIA_MODELS,
  mediaGenerationService,
  type MediaTask,
} from "./mediaGenerationService";
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import { libraryItems, mediaModels } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  createLibraryItem,
  safeEnqueueLibraryIndexJob,
  type LibraryActor,
  type LibraryVisibility,
} from "./libraryService";
import { storagePut } from "../storage";

export interface AddMediaTaskToLibraryInput {
  mediaTaskId: string;
  userToken: string;
  title?: string;
  visibility?: LibraryVisibility;
}

export interface AddMediaTaskToLibraryResult {
  itemId: number;
  created: boolean;
  indexJob: {
    jobId: number;
    status: string;
    created: boolean;
  };
  taskStatus: string;
}

function isMediaLibraryAutoAddEnabled(): boolean {
  const raw = (process.env.MEDIA_LIBRARY_AUTO_ADD_ENABLED || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function buildDefaultTitle(task: MediaTask): string {
  const modelLabel = task.model || "model";
  const mediaLabel = task.mediaType || "media";
  return `${mediaLabel.toUpperCase()} - ${modelLabel}`;
}

async function resolveModelProvider(task: MediaTask): Promise<string | null> {
  if (!task.model) {
    return null;
  }

  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ provider: mediaModels.provider })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, task.model))
        .limit(1);
      if (dbModel?.provider) {
        return dbModel.provider;
      }
    }
  } catch {
    // Fall through to static metadata.
  }

  return MEDIA_MODELS[task.model]?.provider || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTraceKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectTraceValues(
  value: unknown,
  normalizedKeys: Set<string>,
  depth = 0
): string[] {
  if (depth > 6 || value == null) return [];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item =>
      collectTraceValues(item, normalizedKeys, depth + 1)
    );
  }
  if (!isRecord(value)) return [];

  const matches: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = normalizeTraceKey(key);
    if (normalizedKeys.has(normalizedKey)) {
      const text =
        typeof raw === "number" || typeof raw === "boolean"
          ? String(raw)
          : cleanText(raw);
      if (text) matches.push(text);
    }
    matches.push(...collectTraceValues(raw, normalizedKeys, depth + 1));
  }
  return Array.from(new Set(matches));
}

function firstTraceValue(source: unknown, keys: string[]): string | null {
  const values = collectTraceValues(
    source,
    new Set(keys.map(normalizeTraceKey))
  );
  return values[0] ?? null;
}

function compactRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === "string") return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "object")
        return Object.keys(value as Record<string, unknown>).length > 0;
      return true;
    })
  );
}

function buildMarketplaceProductTrace(
  task: MediaTask
): Record<string, unknown> {
  const traceSource = {
    parameters: task.parameters ?? null,
    resultData: task.resultData ?? null,
  };
  const productId = firstTraceValue(traceSource, [
    "productId",
    "marketplaceProductId",
    "__marketplace_product_id",
    "marketplace_product_id",
  ]);
  const externalProductId = firstTraceValue(traceSource, [
    "externalProductId",
    "external_product_id",
    "externalItemId",
    "itemId",
  ]);
  const externalShopId = firstTraceValue(traceSource, [
    "externalShopId",
    "external_shop_id",
    "shopId",
  ]);
  const captureId = firstTraceValue(traceSource, [
    "captureId",
    "marketplaceCaptureId",
    "marketplace_capture_id",
  ]);
  const productName = firstTraceValue(traceSource, [
    "productName",
    "marketplaceProductName",
    "__marketplace_product_name",
    "marketplace_product_name",
  ]);
  const sourceUrl = firstTraceValue(traceSource, [
    "sourceUrl",
    "source_url",
    "productUrl",
    "product_url",
    "canonicalSourceUrl",
    "canonical_source_url",
  ]);
  const platform = firstTraceValue(traceSource, [
    "platform",
    "marketplacePlatform",
    "marketplace_platform",
  ]);
  const shopName = firstTraceValue(traceSource, [
    "shopName",
    "shop_name",
    "marketplaceShopName",
  ]);
  const productionRunId = firstTraceValue(traceSource, [
    "productionRunId",
    "__production_run_id",
    "production_run_id",
  ]);
  const autoReviewRunId = firstTraceValue(traceSource, [
    "autoReviewRunId",
    "__auto_review_run_id",
    "auto_review_run_id",
  ]);
  const conceptId = firstTraceValue(traceSource, [
    "autoReviewConceptId",
    "__auto_review_concept_id",
    "conceptId",
    "concept_id",
  ]);

  return compactRecord({
    productId,
    marketplaceProductId: productId,
    marketplace_product_id: productId,
    externalProductId,
    external_product_id: externalProductId,
    externalShopId,
    external_shop_id: externalShopId,
    captureId,
    capture_id: captureId,
    productName,
    product_name: productName,
    sourceUrl,
    source_url: sourceUrl,
    platform,
    shopName,
    shop_name: shopName,
    productionRunId,
    production_run_id: productionRunId,
    autoReviewRunId,
    auto_review_run_id: autoReviewRunId,
    conceptId,
    concept_id: conceptId,
  });
}

function hasProductTraceMetadata(metadata: Record<string, unknown>): boolean {
  return Boolean(
    cleanText(metadata.productId) ||
    cleanText(metadata.marketplaceProductId) ||
    cleanText(metadata.marketplace_product_id) ||
    cleanText(metadata.externalProductId) ||
    cleanText(metadata.external_product_id) ||
    cleanText(metadata.captureId) ||
    cleanText(metadata.productName)
  );
}

async function repairIdempotentMediaLibraryMetadata(input: {
  itemId: number;
  existingMetadata: Record<string, unknown>;
  nextMetadata: Record<string, unknown>;
  db: Awaited<ReturnType<typeof getDb>>;
}): Promise<void> {
  if (!input.db || !hasProductTraceMetadata(input.nextMetadata)) return;
  const mergedMetadata = {
    ...input.existingMetadata,
    ...input.nextMetadata,
    marketplace_product_trace: {
      ...(isRecord(input.existingMetadata.marketplace_product_trace)
        ? input.existingMetadata.marketplace_product_trace
        : {}),
      ...(isRecord(input.nextMetadata.marketplace_product_trace)
        ? input.nextMetadata.marketplace_product_trace
        : {}),
    },
  };
  await input.db
    .update(libraryItems)
    .set({
      metadata: mergedMetadata,
      updatedAt: new Date(),
    })
    .where(eq(libraryItems.id, input.itemId));
}

async function buildTaskMetadata(
  task: MediaTask
): Promise<Record<string, unknown>> {
  const provider = await resolveModelProvider(task);
  const marketplaceProductTrace = buildMarketplaceProductTrace(task);
  const taskParameters = isRecord(task.parameters) ? task.parameters : null;
  return {
    prompt: normalizeMediaPrompt(task.prompt),
    model: task.model,
    provider,
    task_id: task.id,
    provider_task_id: task.taskId || null,
    celery_task_id: task.celeryTaskId || null,
    credits_used: task.creditsUsed ?? null,
    source_type: "media_task",
    task_parameters: taskParameters,
    marketplace_product_trace: marketplaceProductTrace,
    ...marketplaceProductTrace,
  };
}

const MEDIA_TYPE_CONTENT_TYPE: Record<string, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mpeg",
};

function guessContentType(mediaType: string, url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
  };
  return (
    extMap[ext] ??
    MEDIA_TYPE_CONTENT_TYPE[mediaType] ??
    "application/octet-stream"
  );
}

/**
 * Downloads an external media file (e.g. from kie.ai CDN) and stores it in our
 * own storage so the URL never expires and CORS issues are avoided.
 * Returns the internal proxy URL on success, or null if the download fails.
 */
async function downloadAndStore(
  externalUrl: string,
  mediaType: string,
  taskId: string,
  tenantId: string | number
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(externalUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;

    const contentType = guessContentType(mediaType, externalUrl);
    const ext = contentType.split("/")[1]?.split(";")[0] ?? mediaType;
    const key = `media-library/${tenantId}/${taskId}/original.${ext}`;

    const stored = await storagePut(key, buffer, contentType);
    return stored.url;
  } catch {
    return null;
  }
}

function assertTaskEligible(task: MediaTask, actor: LibraryActor): void {
  if (String(task.userId) !== String(actor.userId) && actor.role !== "admin") {
    throw new Error("Media task not found");
  }

  if (task.status !== "completed") {
    throw new Error("Only completed media tasks can be added to library");
  }
}

export async function addMediaTaskToLibrary(
  input: AddMediaTaskToLibraryInput,
  actor: LibraryActor
): Promise<AddMediaTaskToLibraryResult> {
  const task = await mediaGenerationService.getTask(
    input.mediaTaskId,
    input.userToken,
    {
      userId: actor.userId,
      traceId: `media_library:${input.mediaTaskId}`,
      source: "media_library.addTaskToLibrary",
      stage: "task_lookup",
    }
  );
  assertTaskEligible(task, actor);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const metadata = await buildTaskMetadata(task);
  const normalizedPrompt = normalizeMediaPrompt(task.prompt);

  // Download the external provider URL into our own storage so it never expires
  // and can be served without CORS issues. Falls back to the original URL on failure.
  let storedUrl: string | null = null;
  if (task.resultUrl) {
    storedUrl = await downloadAndStore(
      task.resultUrl,
      task.mediaType,
      task.id,
      actor.tenantId
    );
  }
  const resolvedSourceUrl = storedUrl ?? task.resultUrl ?? null;

  const created = await createLibraryItem(
    {
      itemType: task.mediaType,
      source: "media_task",
      title: input.title?.trim() || buildDefaultTitle(task),
      description: normalizedPrompt,
      status: "indexing",
      visibility: input.visibility || "private",
      metadata,
      sourceUrl: resolvedSourceUrl,
      thumbnailUrl: task.mediaType === "image" ? resolvedSourceUrl : null,
      sourceLink: {
        linkType: "media_task",
        linkId: task.id,
        providerTaskId: task.taskId || null,
      },
    },
    actor,
    db
  );
  if (created.idempotent) {
    await repairIdempotentMediaLibraryMetadata({
      itemId: created.item.id,
      existingMetadata: created.item.metadata ?? {},
      nextMetadata: metadata,
      db,
    });
  }

  const indexJob = await safeEnqueueLibraryIndexJob(
    {
      libraryItemId: created.item.id,
      tenantId: actor.tenantId,
      jobType: "initial_index",
      domain: "gallery",
      operation: "index",
      source: "gallery.media_task",
      sourceMetadata: {
        ingestion: "media_to_library",
        mediaTaskId: task.id,
      },
      allowThrottle: true,
    },
    db
  );

  return {
    itemId: created.item.id,
    created: !created.idempotent,
    indexJob,
    taskStatus: task.status,
  };
}

export async function autoAddMediaTaskToLibrary(
  input: AddMediaTaskToLibraryInput,
  actor: LibraryActor
): Promise<AddMediaTaskToLibraryResult | { skipped: true; reason: string }> {
  if (!isMediaLibraryAutoAddEnabled()) {
    return {
      skipped: true,
      reason: "MEDIA_LIBRARY_AUTO_ADD_ENABLED is disabled",
    };
  }

  return addMediaTaskToLibrary(input, actor);
}
