export type GenerationQueueStatus =
  | "queued"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationQueueIdentityLike {
  id?: string | null;
  backendTaskId?: string | null;
  providerTaskId?: string | null;
  taskId?: string | null;
}

export interface GenerationQueueHistoryTaskLike extends GenerationQueueIdentityLike {
  createdAt?: Date | number | string | null;
  startedAt?: Date | number | string | null;
  updatedAt?: Date | number | string | null;
}

export interface StoryboardReviewQueueTaskLike extends GenerationQueueIdentityLike {
  status?: string | null;
  result?: string | null;
  url?: string | null;
  storyboardContext?: {
    extraParams?: Record<string, unknown> | null;
  } | null;
}

export interface MergeableGenerationQueueTask extends GenerationQueueIdentityLike {
  id: string;
  status: GenerationQueueStatus;
  prompt: string;
  model?: string;
  progress?: number;
  result?: string;
  error?: string;
  createdAt: Date | number | string;
  updatedAt: Date | number | string;
  statusDetail?: string;
}

function normalizeIdentity(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getGenerationQueueIdentityCandidates(task: GenerationQueueIdentityLike): string[] {
  const candidates = [
    normalizeIdentity(task.id),
    normalizeIdentity(task.backendTaskId),
    normalizeIdentity(task.providerTaskId),
    normalizeIdentity(task.taskId),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export function getPreferredGenerationQueueTaskId(task: GenerationQueueIdentityLike): string {
  return (
    normalizeIdentity(task.providerTaskId)
    || normalizeIdentity(task.taskId)
    || normalizeIdentity(task.backendTaskId)
    || normalizeIdentity(task.id)
    || ""
  );
}

export function isTerminalGenerationQueueStatus(status: GenerationQueueStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isActiveGenerationQueueStatus(status: GenerationQueueStatus): boolean {
  return !isTerminalGenerationQueueStatus(status);
}

export function shouldIncludeHistoryTaskInGenerationQueue(
  status: GenerationQueueStatus,
  task: GenerationQueueHistoryTaskLike,
  trackedTaskIds: ReadonlySet<string>,
  options?: {
    nowMs?: number;
    activeHistoryMaxAgeMs?: number;
  },
): boolean {
  const isTracked = getGenerationQueueIdentityCandidates(task).some((candidate) => trackedTaskIds.has(candidate));
  if (isTracked) {
    return true;
  }

  if (!isActiveGenerationQueueStatus(status)) {
    return false;
  }

  const maxAgeMs = options?.activeHistoryMaxAgeMs ?? 2 * 60 * 60 * 1000;
  if (maxAgeMs <= 0) {
    return true;
  }

  const nowMs = options?.nowMs ?? Date.now();
  const timestamp = task.updatedAt ?? task.startedAt ?? task.createdAt;
  if (timestamp === undefined || timestamp === null || timestamp === "") {
    return true;
  }
  const taskTimeMs = timestamp instanceof Date
    ? timestamp.getTime()
    : typeof timestamp === "number"
      ? timestamp
      : Date.parse(String(timestamp ?? ""));

  return !Number.isFinite(taskTimeMs) || nowMs - taskTimeMs <= maxAgeMs;
}

export function isStoryboardReviewOnlyQueuedTask(
  task: StoryboardReviewQueueTaskLike,
  storyboardReviewTaskIds: ReadonlySet<string>,
): boolean {
  const taskId = normalizeIdentity(task.id);
  if (!taskId || !storyboardReviewTaskIds.has(taskId)) {
    return false;
  }

  if (String(task.status || "").toLowerCase() !== "queued") {
    return false;
  }

  if (
    normalizeIdentity(task.backendTaskId)
    || normalizeIdentity(task.providerTaskId)
    || normalizeIdentity(task.taskId)
    || normalizeIdentity(task.result)
    || normalizeIdentity(task.url)
  ) {
    return false;
  }

  const generationType = task.storyboardContext?.extraParams?.generationType;
  return generationType === "FIRST_AND_LAST_FRAMES_2_VIDEO";
}

export function isGenerationQueueTaskDismissed(
  task: GenerationQueueIdentityLike,
  dismissedTaskIds: ReadonlySet<string>,
): boolean {
  return getGenerationQueueIdentityCandidates(task).some((candidate) => dismissedTaskIds.has(candidate));
}

export function collectGenerationQueueTaskIdentityCandidates(
  tasks: readonly GenerationQueueIdentityLike[],
): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    for (const candidate of getGenerationQueueIdentityCandidates(task)) {
      ids.add(candidate);
    }
  }
  return Array.from(ids);
}

export function mergeGenerationQueueTasks<T extends MergeableGenerationQueueTask>(
  tasks: readonly T[],
): T[] {
  const merged = new Map<string, T>();
  const identityToCanonicalId = new Map<string, string>();

  for (const task of tasks) {
    const candidates = getGenerationQueueIdentityCandidates(task);
    let canonicalId: string | undefined;

    for (const candidate of candidates) {
      const existingCanonicalId = identityToCanonicalId.get(candidate);
      if (existingCanonicalId) {
        canonicalId = existingCanonicalId;
        break;
      }
    }

    if (!canonicalId) {
      canonicalId = getPreferredGenerationQueueTaskId(task) || task.id;
      const nextTask = canonicalId === task.id ? task : { ...task, id: canonicalId };
      merged.set(canonicalId, nextTask as T);
      for (const candidate of getGenerationQueueIdentityCandidates(nextTask)) {
        identityToCanonicalId.set(candidate, canonicalId);
      }
      continue;
    }

    const existing = merged.get(canonicalId);
    if (!existing) {
      const nextTask = canonicalId === task.id ? task : { ...task, id: canonicalId };
      merged.set(canonicalId, nextTask as T);
      for (const candidate of getGenerationQueueIdentityCandidates(nextTask)) {
        identityToCanonicalId.set(candidate, canonicalId);
      }
      continue;
    }

    const nextTask = {
      ...existing,
      ...task,
      id: existing.id,
      prompt: task.prompt || existing.prompt,
      result: task.result || existing.result,
      error: task.error || existing.error,
      statusDetail: task.statusDetail || existing.statusDetail,
      progress: task.progress ?? existing.progress,
    } as T;

    merged.set(existing.id, nextTask);
    for (const candidate of [
      ...getGenerationQueueIdentityCandidates(existing),
      ...candidates,
      ...getGenerationQueueIdentityCandidates(nextTask),
    ]) {
      identityToCanonicalId.set(candidate, existing.id);
    }
  }

  return Array.from(merged.values());
}
