import { getDb } from "../db";
import { MEDIA_MODELS, mediaGenerationService, type MediaTask } from "./mediaGenerationService";
import { mediaModels } from "../../drizzle/schema";
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

async function buildTaskMetadata(task: MediaTask): Promise<Record<string, unknown>> {
  const provider = await resolveModelProvider(task);
  return {
    prompt: task.prompt,
    model: task.model,
    provider,
    task_id: task.id,
    provider_task_id: task.taskId || null,
    celery_task_id: task.celeryTaskId || null,
    credits_used: task.creditsUsed ?? null,
    source_type: "media_task",
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
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  };
  return extMap[ext] ?? MEDIA_TYPE_CONTENT_TYPE[mediaType] ?? "application/octet-stream";
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
  tenantId: string | number,
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
  actor: LibraryActor,
): Promise<AddMediaTaskToLibraryResult> {
  const task = await mediaGenerationService.getTask(input.mediaTaskId, input.userToken);
  assertTaskEligible(task, actor);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  const metadata = await buildTaskMetadata(task);

  // Download the external provider URL into our own storage so it never expires
  // and can be served without CORS issues. Falls back to the original URL on failure.
  let storedUrl: string | null = null;
  if (task.resultUrl) {
    storedUrl = await downloadAndStore(
      task.resultUrl,
      task.mediaType,
      task.id,
      actor.tenantId,
    );
  }
  const resolvedSourceUrl = storedUrl ?? task.resultUrl ?? null;

  const created = await createLibraryItem(
    {
      itemType: task.mediaType,
      source: "media_task",
      title: input.title?.trim() || buildDefaultTitle(task),
      description: task.prompt,
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
    db,
  );

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
    db,
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
  actor: LibraryActor,
): Promise<AddMediaTaskToLibraryResult | { skipped: true; reason: string }> {
  if (!isMediaLibraryAutoAddEnabled()) {
    return {
      skipped: true,
      reason: "MEDIA_LIBRARY_AUTO_ADD_ENABLED is disabled",
    };
  }

  return addMediaTaskToLibrary(input, actor);
}
