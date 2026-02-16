export type LibraryIndexDomain = "library" | "gallery";
export type LibraryIndexOperation = "index" | "delete";
export type LibraryIndexPayloadVersion = "v2" | "legacy";

export interface LibraryIndexJobPayloadV2 {
  version: "v2";
  domain: LibraryIndexDomain;
  operation: LibraryIndexOperation;
  tenantId: string;
  entityId: string;
  dedupeKey: string;
  source: string;
  sourceMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface ParsedLibraryIndexJobPayload {
  version: LibraryIndexPayloadVersion;
  domain: LibraryIndexDomain;
  operation: LibraryIndexOperation;
  tenantId: string;
  entityId: string;
  dedupeKey: string;
  source: string;
  sourceMetadata: Record<string, unknown>;
}

export interface BuildLibraryIndexJobPayloadInput {
  domain: LibraryIndexDomain;
  operation: LibraryIndexOperation;
  tenantId: string;
  entityId: string;
  source: string;
  sourceMetadata?: Record<string, unknown>;
}

export interface LibraryEnqueueBackpressureInput {
  enabled: boolean;
  currentQueueLagMinutes: number;
  maxQueueLagMinutes: number;
}

function normalizeTenantId(tenantId: string | number): string {
  return String(tenantId).trim();
}

function buildDedupeKey(params: {
  domain: LibraryIndexDomain;
  operation: LibraryIndexOperation;
  tenantId: string;
  entityId: string;
}): string {
  return `libidx:v2:${params.domain}:${params.operation}:${params.tenantId}:${params.entityId}`;
}

export function buildLibraryIndexJobPayload(
  input: BuildLibraryIndexJobPayloadInput,
): LibraryIndexJobPayloadV2 {
  const tenantId = normalizeTenantId(input.tenantId);

  return {
    version: "v2",
    domain: input.domain,
    operation: input.operation,
    tenantId,
    entityId: input.entityId,
    dedupeKey: buildDedupeKey({
      domain: input.domain,
      operation: input.operation,
      tenantId,
      entityId: input.entityId,
    }),
    source: input.source,
    sourceMetadata: input.sourceMetadata || {},
    createdAt: new Date().toISOString(),
  };
}

function deriveLegacyDomain(jobType: string): LibraryIndexDomain {
  return jobType.startsWith("gallery") ? "gallery" : "library";
}

function deriveLegacyOperation(jobType: string): LibraryIndexOperation {
  return jobType.includes("delete") ? "delete" : "index";
}

export function parseLibraryIndexJobPayload(raw: unknown): ParsedLibraryIndexJobPayload {
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { version?: string }).version === "v2"
  ) {
    const payload = raw as LibraryIndexJobPayloadV2;
    return {
      version: "v2",
      domain: payload.domain,
      operation: payload.operation,
      tenantId: normalizeTenantId(payload.tenantId),
      entityId: payload.entityId,
      dedupeKey: payload.dedupeKey,
      source: payload.source,
      sourceMetadata: payload.sourceMetadata || {},
    };
  }

  if (raw && typeof raw === "object") {
    const legacy = raw as {
      tenantId?: string | number;
      libraryItemId?: number;
      galleryItemId?: number;
      entityId?: string;
      dedupeKey?: string;
      source?: string;
      sourceMetadata?: Record<string, unknown>;
      jobType?: string;
    };

    const tenantId = normalizeTenantId(legacy.tenantId || "");
    const jobType = (legacy.jobType || "initial_index").trim();
    const domain = deriveLegacyDomain(jobType);
    const operation = deriveLegacyOperation(jobType);
    const entityId =
      legacy.entityId ||
      (legacy.libraryItemId ? `library:${legacy.libraryItemId}` : legacy.galleryItemId ? `gallery:${legacy.galleryItemId}` : "unknown:0");
    const dedupeKey =
      legacy.dedupeKey ||
      buildDedupeKey({
        domain,
        operation,
        tenantId,
        entityId,
      });

    return {
      version: "legacy",
      domain,
      operation,
      tenantId,
      entityId,
      dedupeKey,
      source: legacy.source || `legacy:${jobType}`,
      sourceMetadata: legacy.sourceMetadata || {},
    };
  }

  throw new Error("Invalid library index job payload");
}

export function shouldThrottleLibraryEnqueue(input: LibraryEnqueueBackpressureInput): boolean {
  if (!input.enabled) {
    return false;
  }
  return input.currentQueueLagMinutes > input.maxQueueLagMinutes;
}
