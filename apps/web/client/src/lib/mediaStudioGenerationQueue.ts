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
  task: GenerationQueueIdentityLike,
  trackedTaskIds: ReadonlySet<string>,
): boolean {
  if (isActiveGenerationQueueStatus(status)) {
    return true;
  }

  return getGenerationQueueIdentityCandidates(task).some((candidate) => trackedTaskIds.has(candidate));
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
