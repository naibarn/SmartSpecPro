import { assertBindingSubset } from "./bindings";
import { upsertTenantVectors, validateArtifactManifest, type ArtifactManifest } from "./artifacts";
import type { CanonicalJobEnvelope, CloudflareEnvironment, VectorRecord } from "./contracts";

export function assertNativeBindings(env: CloudflareEnvironment, name: "JOB_QUEUE" | "JOB_WORKFLOW" | "JOB_CONTAINERS" | "WORKER_APP" | "MEDIA_BUCKET" | "VECTOR_INDEX") {
  assertBindingSubset(env, ["HYPERDRIVE", name]);
  return env;
}

export async function publishCanonicalQueueMessage(env: CloudflareEnvironment, envelope: CanonicalJobEnvelope): Promise<void> {
  return assertNativeBindings(env, "JOB_QUEUE").JOB_QUEUE!.send(envelope);
}

export async function createCanonicalWorkflow(env: CloudflareEnvironment, instanceId: string, envelope: CanonicalJobEnvelope): Promise<{ id?: string; status?: string }> {
  return assertNativeBindings(env, "JOB_WORKFLOW").JOB_WORKFLOW!.create({ id: instanceId, params: envelope });
}

export async function startCanonicalContainer(env: CloudflareEnvironment, instanceId: string, envelope: CanonicalJobEnvelope): Promise<{ id?: string; status?: string }> {
  return assertNativeBindings(env, "JOB_CONTAINERS").JOB_CONTAINERS!.start({ instanceId, envelope });
}

export async function dispatchCanonicalWorkerApp(env: CloudflareEnvironment, envelope: CanonicalJobEnvelope): Promise<{ referenceId: string }> {
  return assertNativeBindings(env, "WORKER_APP").WORKER_APP!.dispatch({ envelope });
}

export async function putCanonicalArtifact(env: CloudflareEnvironment, manifest: ArtifactManifest, value: unknown): Promise<void> {
  const ready = assertNativeBindings(env, "MEDIA_BUCKET");
  const safe = validateArtifactManifest(manifest);
  const existing = await ready.MEDIA_BUCKET!.head(safe.objectKey);
  if (existing) {
    const existingChecksum = existing.customMetadata?.checksumSha256;
    if (!existingChecksum) throw new Error("ARTIFACT_IMMUTABLE_EVIDENCE_MISSING");
    if (existingChecksum && existingChecksum !== safe.checksumSha256) throw new Error("ARTIFACT_IMMUTABLE_CONFLICT");
    return;
  }
  await ready.MEDIA_BUCKET!.put(safe.objectKey, value, {
    httpMetadata: { contentType: safe.contentType },
    customMetadata: { tenantId: safe.tenantId, jobId: safe.jobId, checksumSha256: safe.checksumSha256 },
  });
}

export async function upsertCanonicalVectors(env: CloudflareEnvironment, expectedTenantId: string, records: readonly VectorRecord[]): Promise<void> {
  await upsertTenantVectors(assertNativeBindings(env, "VECTOR_INDEX").VECTOR_INDEX!, records, expectedTenantId);
}

export async function deleteCanonicalVectors(env: CloudflareEnvironment, expectedTenantId: string, ids: readonly string[]): Promise<void> {
  const index = assertNativeBindings(env, "VECTOR_INDEX").VECTOR_INDEX!;
  const records = await index.getByIds(ids);
  const returnedIds = new Set(Array.isArray(records) ? records.map(record => record && typeof record === "object" ? String((record as { id?: unknown }).id || "") : "") : []);
  if (!Array.isArray(records) || returnedIds.size !== ids.length || ids.some(id => !returnedIds.has(id)) || records.some(record => {
    const metadata = record && typeof record === "object" ? (record as { metadata?: unknown }).metadata : null;
    const tenantId = metadata && typeof metadata === "object" ? (metadata as { tenantId?: unknown }).tenantId : undefined;
    return tenantId !== expectedTenantId;
  })) {
    throw new Error("VECTOR_TENANT_SCOPE_INVALID");
  }
  await index.deleteByIds(ids);
}
