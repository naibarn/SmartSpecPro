import { createHash } from "node:crypto";

/**
 * Cloudflare Vectorize v2 contract limits shared by the Node adapter.
 * Business services may apply smaller per-domain limits on top of these.
 */
export const VECTORIZE_API_VERSION = "v2" as const;
export const VECTORIZE_EMBEDDING_DIMENSIONS = 768 as const;
export const VECTORIZE_MAX_ID_BYTES = 64 as const;
export const VECTORIZE_MAX_METADATA_BYTES = 10 * 1024 as const;
export const VECTORIZE_MAX_FILTER_BYTES = 2048 as const;
export const VECTORIZE_MAX_INDEX_NAME_BYTES = 64 as const;
export const VECTORIZE_MAX_UPSERT_BATCH = 5000 as const;
export const VECTORIZE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024 as const;
export const VECTORIZE_MAX_TOP_K_WITH_METADATA = 50 as const;

export class VectorizeContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "VectorizeContractError";
    this.code = code;
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function toVectorizeSafeId(value: string): string {
  if (typeof value === "string" && value.length > 0 && utf8ByteLength(value) <= VECTORIZE_MAX_ID_BYTES) {
    return value;
  }
  const digest = createHash("sha256").update(String(value)).digest("hex").slice(0, 56);
  return `v:${digest}`;
}

function assertCompactJson(value: unknown, code: string, maxBytes: number): void {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || utf8ByteLength(encoded) > maxBytes) {
      throw new VectorizeContractError(code);
    }
  } catch (error) {
    if (error instanceof VectorizeContractError) throw error;
    throw new VectorizeContractError(code);
  }
}

function validateMetadataValue(value: unknown, depth: number): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new VectorizeContractError("VECTORIZE_METADATA_INVALID");
    return;
  }
  if (depth > 4 || typeof value !== "object") {
    throw new VectorizeContractError("VECTORIZE_METADATA_INVALID");
  }
  if (Array.isArray(value)) {
    value.forEach((item) => validateMetadataValue(item, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (!key || /[.$'\"]/.test(key)) throw new VectorizeContractError("VECTORIZE_METADATA_KEY_INVALID");
    validateMetadataValue(child, depth + 1);
  }
}

export function validateVectorizeIndexName(indexName: string): void {
  if (
    typeof indexName !== "string"
    || indexName.trim().length === 0
    || indexName !== indexName.trim()
    || utf8ByteLength(indexName) > VECTORIZE_MAX_INDEX_NAME_BYTES
    || !/^[A-Za-z0-9_-]+$/.test(indexName)
  ) {
    throw new VectorizeContractError("VECTORIZE_INDEX_NAME_INVALID");
  }
}

export function validateVectorizeIds(ids: readonly string[]): void {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > VECTORIZE_MAX_UPSERT_BATCH) {
    throw new VectorizeContractError("VECTORIZE_IDS_INVALID");
  }
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || utf8ByteLength(id) > VECTORIZE_MAX_ID_BYTES) {
      throw new VectorizeContractError("VECTORIZE_ID_INVALID");
    }
  }
  if (new Set(ids).size !== ids.length) {
    throw new VectorizeContractError("VECTORIZE_IDS_INVALID");
  }
}

export function validateVectorizeEntry(entry: {
  id: string;
  values: readonly number[];
  metadata: Record<string, unknown>;
}): void {
  validateVectorizeIds([entry.id]);
  if (!Array.isArray(entry.values) || entry.values.length !== VECTORIZE_EMBEDDING_DIMENSIONS || entry.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new VectorizeContractError("VECTORIZE_VALUES_INVALID");
  }
  if (!entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata)) {
    throw new VectorizeContractError("VECTORIZE_METADATA_INVALID");
  }
  validateMetadataValue(entry.metadata, 0);
  assertCompactJson(entry.metadata, "VECTORIZE_METADATA_INVALID", VECTORIZE_MAX_METADATA_BYTES);
}

export function validateVectorizeEntries(entries: readonly {
  id: string;
  values: readonly number[];
  metadata: Record<string, unknown>;
}[]): void {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > VECTORIZE_MAX_UPSERT_BATCH) {
    throw new VectorizeContractError("VECTORIZE_BATCH_INVALID");
  }
  entries.forEach(validateVectorizeEntry);
  const uploadBytes = entries.reduce((total, entry) => total + utf8ByteLength(JSON.stringify(entry)) + 1, 0);
  if (uploadBytes > VECTORIZE_MAX_UPLOAD_BYTES) throw new VectorizeContractError("VECTORIZE_UPLOAD_TOO_LARGE");
}

export function validateVectorizeQuery(params: {
  vector: readonly number[];
  topK: number;
  filter?: Record<string, string | number | boolean>;
}): void {
  if (!Array.isArray(params.vector) || params.vector.length !== VECTORIZE_EMBEDDING_DIMENSIONS || params.vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new VectorizeContractError("VECTORIZE_QUERY_VECTOR_INVALID");
  }
  if (!Number.isSafeInteger(params.topK) || params.topK < 1 || params.topK > VECTORIZE_MAX_TOP_K_WITH_METADATA) {
    throw new VectorizeContractError("VECTORIZE_TOP_K_INVALID");
  }
  if (params.filter && Object.keys(params.filter).length > 0) {
    for (const [key, value] of Object.entries(params.filter)) {
      if (!key || /[.$'\"]/.test(key) || (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) {
        throw new VectorizeContractError("VECTORIZE_FILTER_INVALID");
      }
    }
    assertCompactJson(params.filter, "VECTORIZE_FILTER_INVALID", VECTORIZE_MAX_FILTER_BYTES);
  }
}
