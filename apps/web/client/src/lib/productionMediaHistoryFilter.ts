type UnknownRecord = Record<string, unknown>;

export interface ProductionMediaHistoryProjectIndex {
  productionRunId: string;
  taskIds: Set<string>;
  urls: Set<string>;
}

const PRODUCTION_RUN_ID_KEYS = new Set([
  "productionRunId",
  "production_run_id",
  "productionProjectId",
  "production_project_id",
  "projectRunId",
  "project_run_id",
]);

const TASK_ID_KEYS = new Set([
  "taskId",
  "task_id",
  "backendTaskId",
  "backend_task_id",
  "providerTaskId",
  "provider_task_id",
  "mediaTaskId",
  "media_task_id",
  "linkedTaskId",
  "linked_task_id",
  "linkedBackendTaskId",
  "linked_backend_task_id",
  "linkedProviderTaskId",
  "linked_provider_task_id",
  "storyboardGridImageTaskId",
  "referenceImageTaskId",
  "startFrameTaskId",
  "stopFrameTaskId",
  "videoTaskId",
  "audioTaskId",
]);

const DIRECT_TASK_ID_KEYS = new Set([
  "id",
  "taskId",
  "task_id",
  "backendTaskId",
  "backend_task_id",
  "providerTaskId",
  "provider_task_id",
]);

const NESTED_CONTEXT_KEYS = [
  "parameters",
  "extraParams",
  "extra_params",
  "metadata",
  "resultData",
  "result_data",
  "input",
  "request",
  "config",
  "configSnapshot",
  "productionShotContext",
  "productionContext",
  "sourceContext",
] as const;

const OUTPUT_URL_KEY_RE = /(result|output|source|thumbnail|image|video|audio|file|media).*url$/i;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeId(value: unknown): string {
  return cleanString(value);
}

function normalizeUrl(value: unknown): string {
  const raw = cleanString(value);
  if (!raw) return "";
  return raw.split("#")[0].split("?")[0].toLowerCase();
}

function addNormalizedId(target: Set<string>, value: unknown): void {
  const id = normalizeId(value);
  if (id) target.add(id);
}

function addNormalizedUrl(target: Set<string>, value: unknown): void {
  const url = normalizeUrl(value);
  if (url) target.add(url);
}

function visitNestedContext(value: unknown, visitor: (record: UnknownRecord) => void, depth = 0): void {
  const record = asRecord(value);
  if (!record || depth > 4) return;
  visitor(record);

  for (const key of NESTED_CONTEXT_KEYS) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      nested.forEach((item) => visitNestedContext(item, visitor, depth + 1));
    } else {
      visitNestedContext(nested, visitor, depth + 1);
    }
  }
}

function collectProductionRunIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  visitNestedContext(value, (record) => {
    for (const [key, candidate] of Object.entries(record)) {
      if (PRODUCTION_RUN_ID_KEYS.has(key)) addNormalizedId(ids, candidate);
    }
  });
  return ids;
}

function collectTaskIdsFromTask(value: unknown): Set<string> {
  const ids = new Set<string>();
  const direct = asRecord(value);
  if (direct) {
    for (const [key, candidate] of Object.entries(direct)) {
      if (DIRECT_TASK_ID_KEYS.has(key)) addNormalizedId(ids, candidate);
    }
  }
  visitNestedContext(value, (record) => {
    for (const [key, candidate] of Object.entries(record)) {
      if (TASK_ID_KEYS.has(key)) addNormalizedId(ids, candidate);
    }
  });
  return ids;
}

function collectOutputUrls(value: unknown, target = new Set<string>(), depth = 0): Set<string> {
  if (depth > 5) return target;
  if (typeof value === "string") {
    addNormalizedUrl(target, value);
    return target;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectOutputUrls(item, target, depth + 1));
    return target;
  }
  const record = asRecord(value);
  if (!record) return target;

  for (const [key, candidate] of Object.entries(record)) {
    if (OUTPUT_URL_KEY_RE.test(key)) {
      if (Array.isArray(candidate)) {
        candidate.forEach((item) => collectOutputUrls(item, target, depth + 1));
      } else {
        addNormalizedUrl(target, candidate);
      }
      continue;
    }
    if (key === "resultData" || key === "result_data" || key === "metadata") {
      collectOutputUrls(candidate, target, depth + 1);
    }
  }

  return target;
}

function collectProjectLinks(value: unknown, index: ProductionMediaHistoryProjectIndex, depth = 0): void {
  if (depth > 7) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectProjectLinks(item, index, depth + 1));
    return;
  }
  const record = asRecord(value);
  if (!record) return;

  for (const [key, candidate] of Object.entries(record)) {
    if (TASK_ID_KEYS.has(key) || key === "outputRefId") {
      addNormalizedId(index.taskIds, candidate);
    }
    if (OUTPUT_URL_KEY_RE.test(key) || key === "url" || key === "thumbnailUrl") {
      if (Array.isArray(candidate)) {
        candidate.forEach((item) => addNormalizedUrl(index.urls, item));
      } else {
        addNormalizedUrl(index.urls, candidate);
      }
    }
  }

  for (const candidate of Object.values(record)) {
    collectProjectLinks(candidate, index, depth + 1);
  }
}

export function normalizeProductionRunId(value: unknown): string {
  const id = normalizeId(value);
  return id === "draft" ? "" : id;
}

export function buildProductionMediaHistoryProjectIndex(
  productionRunId: unknown,
  productionSpace?: unknown,
): ProductionMediaHistoryProjectIndex {
  const index: ProductionMediaHistoryProjectIndex = {
    productionRunId: normalizeProductionRunId(productionRunId),
    taskIds: new Set<string>(),
    urls: new Set<string>(),
  };

  if (productionSpace) {
    collectProjectLinks(productionSpace, index);
  }

  return index;
}

export function mediaHistoryTaskBelongsToProductionProject(
  task: unknown,
  index: ProductionMediaHistoryProjectIndex,
): boolean {
  if (!index.productionRunId) return true;

  const taskProductionRunIds = collectProductionRunIds(task);
  if (taskProductionRunIds.size > 0) {
    return taskProductionRunIds.has(index.productionRunId);
  }

  const taskIds = collectTaskIdsFromTask(task);
  for (const taskId of taskIds) {
    if (index.taskIds.has(taskId)) return true;
  }

  const outputUrls = collectOutputUrls(task);
  for (const url of outputUrls) {
    if (index.urls.has(url)) return true;
  }

  return false;
}

export function filterMediaHistoryTasksForProductionProject<T>(
  tasks: T[],
  index: ProductionMediaHistoryProjectIndex,
): T[] {
  if (!index.productionRunId) return tasks;
  return tasks.filter((task) => mediaHistoryTaskBelongsToProductionProject(task, index));
}
