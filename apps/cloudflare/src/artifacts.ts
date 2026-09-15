import type { R2ObjectBinding, VectorIndexBinding, VectorRecord } from "./contracts";

const MAX_OBJECT_KEY_BYTES = 512;
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024 * 1024;
const VECTORIZE_DIMENSIONS = 768;
const VECTORIZE_MAX_ID_BYTES = 64;
const VECTORIZE_MAX_METADATA_BYTES = 10 * 1024;
const VECTORIZE_MAX_BATCH = 1000;
const FORBIDDEN_OBJECT_VALUE = /(?:https?:|data:|file:|postgres(?:ql)?:|signed.?url)/i;

export type ArtifactManifest = {
  tenantId: string;
  jobId: string;
  objectKey: string;
  sizeBytes: number;
  checksumSha256: string;
  contentType: string;
  immutable: true;
};

function assertText(value: unknown, field: string, maxBytes = 512): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new Error(`ARTIFACT_${field.toUpperCase()}_INVALID`);
  }
}

function assertScopeSegment(value: unknown, field: string): asserts value is string {
  assertText(value, field);
  if (/[\\/\u0000-\u001f\u007f]/.test(value)) throw new Error(`ARTIFACT_${field.toUpperCase()}_INVALID`);
}

export function validateArtifactManifest(manifest: ArtifactManifest): ArtifactManifest {
  assertScopeSegment(manifest.tenantId, "tenant_id");
  assertScopeSegment(manifest.jobId, "job_id");
  assertText(manifest.objectKey, "object_key", MAX_OBJECT_KEY_BYTES);
  assertText(manifest.contentType, "content_type", 128);
  if (FORBIDDEN_OBJECT_VALUE.test(manifest.objectKey) || /[\\\u0000-\u001f\u007f]/.test(manifest.objectKey)) throw new Error("ARTIFACT_OBJECT_KEY_UNSAFE");
  const tenantScopedPrefix = /^(?:dev|staging|prod)\//.test(manifest.objectKey)
    && ["dev", "staging", "prod"].some(environment => manifest.objectKey.startsWith(`${environment}/${manifest.tenantId}/`));
  if (!tenantScopedPrefix) throw new Error("ARTIFACT_OBJECT_KEY_SCOPE_INVALID");
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes < 0 || manifest.sizeBytes > MAX_ARTIFACT_BYTES) {
    throw new Error("ARTIFACT_SIZE_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.checksumSha256)) throw new Error("ARTIFACT_CHECKSUM_INVALID");
  if (manifest.immutable !== true) throw new Error("ARTIFACT_MUST_BE_IMMUTABLE");
  return { ...manifest };
}

export async function putVerifiedArtifact(
  bucket: R2ObjectBinding,
  manifest: ArtifactManifest,
  value: unknown,
): Promise<void> {
  const safe = validateArtifactManifest(manifest);
  const existing = await bucket.head(safe.objectKey);
  if (existing) {
    const existingChecksum = existing.customMetadata?.checksumSha256;
    if (!existingChecksum) throw new Error("ARTIFACT_IMMUTABLE_EVIDENCE_MISSING");
    if (existingChecksum && existingChecksum !== safe.checksumSha256) throw new Error("ARTIFACT_IMMUTABLE_CONFLICT");
    return;
  }
  await bucket.put(safe.objectKey, value, {
    httpMetadata: { contentType: safe.contentType },
    customMetadata: { tenantId: safe.tenantId, jobId: safe.jobId, checksumSha256: safe.checksumSha256 },
  });
}

export function validateVectorRecord(record: VectorRecord): VectorRecord {
  assertText(record.id, "vector_id", VECTORIZE_MAX_ID_BYTES);
  assertScopeSegment(record.metadata.tenantId, "vector_tenant_id");
  assertText(record.metadata.sourceJobId, "vector_source_job_id");
  assertText(record.metadata.sourceRevision, "vector_source_revision");
  if (!Array.isArray(record.values) || record.values.length !== VECTORIZE_DIMENSIONS) {
    throw new Error("VECTOR_VALUES_INVALID");
  }
  if (record.values.some(value => !Number.isFinite(value))) throw new Error("VECTOR_VALUES_INVALID");
  const metadataBytes = new TextEncoder().encode(JSON.stringify(record.metadata)).byteLength;
  if (metadataBytes > VECTORIZE_MAX_METADATA_BYTES) throw new Error("VECTOR_METADATA_INVALID");
  return { ...record, values: [...record.values], metadata: { ...record.metadata } };
}

export async function upsertTenantVectors(index: VectorIndexBinding, records: readonly VectorRecord[], expectedTenantId: string): Promise<void> {
  assertScopeSegment(expectedTenantId, "expected_tenant_id");
  if (records.length === 0 || records.length > VECTORIZE_MAX_BATCH) throw new Error("VECTOR_BATCH_INVALID");
  const validated = records.map(validateVectorRecord);
  const tenantIds = new Set(validated.map(record => record.metadata.tenantId));
  if (tenantIds.size > 1 || [...tenantIds].some(tenantId => tenantId !== expectedTenantId)) throw new Error("VECTOR_TENANT_SCOPE_INVALID");
  await index.upsert(validated);
}
