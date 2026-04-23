function normalizeQueryValue(value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function appendLinkedSourceIds(
  params: URLSearchParams,
  key: string,
  values: readonly (string | number | null | undefined)[] | null | undefined,
): void {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeQueryValue(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    params.append(key, normalized);
  }
}

export function parseLinkedSourceIds(
  queryParams: URLSearchParams,
  key: string,
): string[] {
  const values = queryParams
    .getAll(key)
    .flatMap(value => value.split(","))
    .map(value => value.trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

export interface BuildWorkRequestLaunchPathInput {
  requestId?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  linkedConversationIds?: readonly (string | number | null | undefined)[];
  linkedWorkpackRunIds?: readonly (string | number | null | undefined)[];
  linkedRoleRoutineRunIds?: readonly (string | number | null | undefined)[];
}

export function buildWorkRequestLaunchPath(
  input: BuildWorkRequestLaunchPathInput = {},
): string {
  const requestId = normalizeQueryValue(input.requestId);
  if (requestId) {
    return `/work/request?requestId=${encodeURIComponent(requestId)}`;
  }

  const params = new URLSearchParams();
  const sourceType = normalizeQueryValue(input.sourceType);
  const sourceRef = normalizeQueryValue(input.sourceRef);

  if (sourceType) {
    params.set("sourceType", sourceType);
  }
  if (sourceRef) {
    params.set("sourceRef", sourceRef);
  }

  appendLinkedSourceIds(
    params,
    "linkedConversationIds",
    input.linkedConversationIds,
  );
  appendLinkedSourceIds(
    params,
    "linkedWorkpackRunIds",
    input.linkedWorkpackRunIds,
  );
  appendLinkedSourceIds(
    params,
    "linkedRoleRoutineRunIds",
    input.linkedRoleRoutineRunIds,
  );

  const query = params.toString();
  return query ? `/work/request?${query}` : "/work/request";
}
