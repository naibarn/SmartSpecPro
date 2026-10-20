import type { CanonicalWorkerExecution, R2ObjectBinding } from "./contracts";
import { CLOUDFLARE_MEDIA_PROBE, parseMediaProbeCandidate, validateMediaProbeSource, type MediaProbeSource } from "../../../packages/shared/src/cloudflareMediaProbe";
import { prepareCanonicalMediaProbe } from "./canonicalControlPlaneProxy";
import { MAX_CONTAINER_PROBE_INPUT_BYTES, MAX_CONTAINER_PROBE_RESULT_BYTES, probeSha256, validateContainerProbeResult } from "./containerMediaProbeContract";
import { isPinnedRunnerImage } from "./nativeRunnerContainer";
import { runnerContainerInstanceId, type RunnerContainerAssignment } from "./runnerContainer";
import { validateArtifactManifest } from "./artifacts";

async function readBoundedObject(bucket: R2ObjectBinding, key: string, max: number) {
  const object = await bucket.get!(key);
  if (!object || !object.body || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > max) {
    await object?.body?.cancel(); throw new Error("CLOUDFLARE_MEDIA_OBJECT_INVALID");
  }
  const reader = object.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > max || size > object.size) { await reader.cancel(); throw new Error("CLOUDFLARE_MEDIA_OBJECT_TOO_LARGE"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (size !== object.size) throw new Error("CLOUDFLARE_MEDIA_OBJECT_SIZE_MISMATCH");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, object };
}
function assertDeadline(assignment: RunnerContainerAssignment) {
  if (!(Date.parse(assignment.expiresAt!) > Date.now())) throw new Error("CLOUDFLARE_MEDIA_DEADLINE_EXCEEDED");
}
async function persistResult(bucket: R2ObjectBinding, assignment: RunnerContainerAssignment, bytes: Uint8Array, environment: string) {
  const checksumSha256 = await probeSha256(bytes);
  const objectKey = `${environment}/${assignment.tenantId}/${assignment.envelope.job_id}/probe/${assignment.attemptId}/${checksumSha256}.json`;
  const manifest = validateArtifactManifest({ tenantId: assignment.tenantId, jobId: assignment.envelope.job_id, objectKey,
    sizeBytes: bytes.byteLength, checksumSha256, contentType: "application/json", immutable: true });
  assertDeadline(assignment);
  // Atomic create-only write. Never overwrite a concurrent publication, and
  // never equate self-reported metadata with actual persisted body integrity.
  await bucket.put(objectKey, bytes, { onlyIf: { etagDoesNotMatch: "*" }, sha256: checksumSha256,
    httpMetadata: { contentType: manifest.contentType }, customMetadata: { tenantId: manifest.tenantId,
      jobId: manifest.jobId, attemptId: assignment.attemptId, checksumSha256 } });
  const stored = await readBoundedObject(bucket, objectKey, MAX_CONTAINER_PROBE_RESULT_BYTES);
  if (stored.bytes.byteLength !== manifest.sizeBytes || await probeSha256(stored.bytes) !== checksumSha256 ||
      stored.object.customMetadata?.tenantId !== manifest.tenantId || stored.object.customMetadata?.jobId !== manifest.jobId ||
      stored.object.customMetadata?.attemptId !== assignment.attemptId || stored.object.customMetadata?.checksumSha256 !== checksumSha256) {
    throw new Error("CLOUDFLARE_MEDIA_ARTIFACT_INTEGRITY_FAILED");
  }
  assertDeadline(assignment);
  return objectKey;
}

/** Canonical claim precedes this function; canonical settlement follows it.
 * This fixed operation neither claims jobs nor creates a second execution ledger. */
export const executeCanonicalMediaProbe: CanonicalWorkerExecution = async delivery => {
  const { env, job, envelope, claim } = delivery, candidate = parseMediaProbeCandidate(job);
  const bucket = env.MEDIA_BUCKET, binding = env.JOB_CONTAINERS;
  if (env.CLOUDFLARE_ACTIVATION !== "enabled" || env.CLOUDFLARE_MEDIA_PROBE !== CLOUDFLARE_MEDIA_PROBE ||
      !["workflows", "queues"].includes(env.CLOUDFLARE_JOB_TRANSPORT ?? "") || job.tenantId !== env.CLOUDFLARE_WORKFLOW_TENANT_ID ||
      !(Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now()) || job.contractVersion !== "feature-186-v1" || !candidate ||
      !["dev", "staging", "prod"].includes(env.CLOUDFLARE_ENVIRONMENT ?? "") || !isPinnedRunnerImage(env.CLOUDFLARE_RUNNER_IMAGE_REF) ||
      !bucket?.get || !bucket.put || !binding?.probeMedia || !binding.stop || !claim.leaseToken ||
      !claim.attemptId || !Number.isSafeInteger(claim.fencingVersion) || claim.fencingVersion < 1) throw new Error("CLOUDFLARE_MEDIA_PROBE_NOT_ADMITTED");
  // The platform verifies persisted dispatch+claim, hard deadline and ready
  // tenant/user ownership; source references never come from the queue payload.
  const source = validateMediaProbeSource(await prepareCanonicalMediaProbe(delivery) as MediaProbeSource, job.tenantId, candidate.userId);
  const deadline = Math.min(Date.parse(source.expiresAt), Date.parse(claim.expiresAt ?? ""), Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT!));
  if (!(deadline > Date.now())) throw new Error("CLOUDFLARE_MEDIA_DEADLINE_EXCEEDED");
  const input = await readBoundedObject(bucket, source.objectKey, MAX_CONTAINER_PROBE_INPUT_BYTES);
  if (input.bytes.byteLength !== source.sizeBytes || await probeSha256(input.bytes) !== source.checksumSha256) throw new Error("CLOUDFLARE_MEDIA_INPUT_INTEGRITY_FAILED");
  // Raw canonical lease tokens never enter provider env, paths or artifact metadata.
  const leaseId = `lease-${await probeSha256(new TextEncoder().encode(claim.leaseToken))}`;
  const assignment: RunnerContainerAssignment = { envelope: { ...envelope, routing_metadata: { ...envelope.routing_metadata, tenantId: job.tenantId } },
    tenantId: job.tenantId, attemptId: claim.attemptId, leaseId, fencingVersion: claim.fencingVersion, expiresAt: new Date(deadline).toISOString(),
    workspaceRef: `workspace:${job.jobId}`, artifactRefs: [], resourceProfile: "small" };
  // 3MiB input bound keeps this conversion within Worker memory limits.
  let binary = "";
  for (let offset = 0; offset < input.bytes.length; offset += 8192) binary += String.fromCharCode(...input.bytes.subarray(offset, offset + 8192));
  assertDeadline(assignment);
  let started = false;
  try {
    started = true; // Also clean up a provider start whose response is lost.
    await binding.start({ instanceId: runnerContainerInstanceId(assignment), envelope: assignment.envelope, assignment });
    const response = await binding.probeMedia(assignment, { contentBase64: btoa(binary), sizeBytes: source.sizeBytes, checksumSha256: source.checksumSha256 });
    const result = validateContainerProbeResult(response, assignment, source.checksumSha256).result;
    const bytes = new TextEncoder().encode(JSON.stringify(result));
    if (bytes.byteLength > 20 * 1024) throw new Error("CLOUDFLARE_MEDIA_CANONICAL_RESULT_TOO_LARGE");
    const resultRef = await persistResult(bucket, assignment, bytes, env.CLOUDFLARE_ENVIRONMENT!);
    return { resultRef, output: result };
  } finally {
    if (started) await binding.stop(runnerContainerInstanceId(assignment));
  }
};
