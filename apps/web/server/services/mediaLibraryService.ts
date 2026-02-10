import { getDb } from "../db";
import { MEDIA_MODELS, mediaGenerationService, type MediaTask } from "./mediaGenerationService";
import {
  createLibraryItem,
  enqueueLibraryIndexJob,
  type LibraryActor,
  type LibraryVisibility,
} from "./libraryService";

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

function buildTaskMetadata(task: MediaTask): Record<string, unknown> {
  const modelMeta = task.model ? MEDIA_MODELS[task.model] : null;

  return {
    prompt: task.prompt,
    model: task.model,
    provider: modelMeta?.provider || null,
    task_id: task.id,
    provider_task_id: task.taskId || null,
    celery_task_id: task.celeryTaskId || null,
    credits_used: task.creditsUsed ?? null,
    source_type: "media_task",
  };
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

  const created = await createLibraryItem(
    {
      itemType: task.mediaType,
      source: "media_task",
      title: input.title?.trim() || buildDefaultTitle(task),
      description: task.prompt,
      status: "indexing",
      visibility: input.visibility || "private",
      metadata: buildTaskMetadata(task),
      sourceUrl: task.resultUrl || null,
      thumbnailUrl: task.mediaType === "image" ? task.resultUrl || null : null,
      sourceLink: {
        linkType: "media_task",
        linkId: task.id,
        providerTaskId: task.taskId || null,
      },
    },
    actor,
    db,
  );

  const indexJob = await enqueueLibraryIndexJob(
    {
      libraryItemId: created.item.id,
      tenantId: actor.tenantId,
      jobType: "initial_index",
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
