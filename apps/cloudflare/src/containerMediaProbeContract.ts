import type { RunnerContainerAssignment } from "./runnerContainer";

export const CONTAINER_MEDIA_PROBE_CONTRACT = "container-media-probe-v1";
export const MAX_CONTAINER_PROBE_INPUT_BYTES = 3 * 1024 * 1024;
export const MAX_CONTAINER_PROBE_RESULT_BYTES = 128 * 1024;
export type ContainerProbeInput = { contentBase64: string; checksumSha256: string; sizeBytes: number };
export type ContainerProbeScope = {
  tenantId: string;
  lease: { jobId: string; attemptId: string; leaseId: string; fencingVersion: number; expiresAtMs: number };
};
export type ContainerProbeResult = {
  contractVersion: typeof CONTAINER_MEDIA_PROBE_CONTRACT;
  scope: ContainerProbeScope;
  inputChecksumSha256: string;
  result: { artifacts: []; derived: { format: Record<string, unknown>; streams: Record<string, unknown>[]; durationMs: number } };
};
export function containerProbeScope(assignment: RunnerContainerAssignment): ContainerProbeScope {
  return { tenantId: assignment.tenantId, lease: { jobId: assignment.envelope.job_id, attemptId: assignment.attemptId,
    leaseId: assignment.leaseId, fencingVersion: assignment.fencingVersion, expiresAtMs: Date.parse(assignment.expiresAt ?? "") } };
}
export async function validateContainerProbeInput(input: ContainerProbeInput): Promise<void> {
  if (!recordWithKeys(input, ["contentBase64", "checksumSha256", "sizeBytes"]) ||
      !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_CONTAINER_PROBE_INPUT_BYTES ||
      typeof input.contentBase64 !== "string" || input.contentBase64.length > Math.ceil(MAX_CONTAINER_PROBE_INPUT_BYTES / 3) * 4 ||
      typeof input.checksumSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.checksumSha256)) throw new Error("CONTAINER_PROBE_INPUT_INVALID");
  let binary: string;
  try { binary = atob(input.contentBase64); } catch { throw new Error("CONTAINER_PROBE_INPUT_INVALID"); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const checksum = await probeSha256(bytes);
  if (bytes.length !== input.sizeBytes || checksum !== input.checksumSha256) throw new Error("CONTAINER_PROBE_INPUT_CHECKSUM_MISMATCH");
}
export async function probeSha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
function recordWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key));
}
function boundedMetadata(value: unknown, keys: string[]): value is Record<string, unknown> {
  return recordWithKeys(value, keys) && Object.values(value).every(v =>
    (typeof v === "string" && v.length <= 512) || (typeof v === "number" && Number.isFinite(v)));
}
export function validateContainerProbeResult(raw: unknown, assignment: RunnerContainerAssignment, checksum: string): ContainerProbeResult {
  const value = raw as ContainerProbeResult, expected = containerProbeScope(assignment);
  if (!recordWithKeys(value, ["contractVersion", "scope", "inputChecksumSha256", "result"]) ||
      value.contractVersion !== CONTAINER_MEDIA_PROBE_CONTRACT || value.inputChecksumSha256 !== checksum ||
      !recordWithKeys(value.scope, ["tenantId", "lease"]) || value.scope.tenantId !== expected.tenantId ||
      !recordWithKeys(value.scope.lease, Object.keys(expected.lease)) ||
      Object.entries(expected.lease).some(([key, v]) => (value.scope.lease as Record<string, unknown>)[key] !== v) ||
      !(expected.lease.expiresAtMs > Date.now()) || !recordWithKeys(value.result, ["artifacts", "derived"]) ||
      !Array.isArray(value.result.artifacts) || value.result.artifacts.length !== 0 ||
      !recordWithKeys(value.result.derived, ["format", "streams", "durationMs"]) ||
      !boundedMetadata(value.result.derived.format, ["format_name", "duration", "size"]) ||
      !Array.isArray(value.result.derived.streams) || value.result.derived.streams.length > 32 ||
      value.result.derived.streams.some(stream => !boundedMetadata(stream,
        ["index", "codec_name", "codec_type", "width", "height", "sample_rate", "channels", "duration"])) ||
      !Number.isSafeInteger(value.result.derived.durationMs) || value.result.derived.durationMs < 0 || value.result.derived.durationMs > 86_400_000 ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CONTAINER_PROBE_RESULT_BYTES) throw new Error("CONTAINER_PROBE_RESULT_SCOPE_MISMATCH");
  return JSON.parse(JSON.stringify(value)) as ContainerProbeResult;
}
