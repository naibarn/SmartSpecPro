import { describe, expect, it } from "vitest";
import { containerProbeScope, probeSha256, validateContainerProbeInput, validateContainerProbeResult } from "./containerMediaProbeContract";
import type { RunnerContainerAssignment } from "./runnerContainer";
const assignment = (): RunnerContainerAssignment => ({ envelope: { job_id: "job-1", contract_version: "feature-186-v1", business_attempt: 1,
  attempt_id: "attempt-1", dispatch_id: "dispatch-1", dedupe_key: "dedupe-1", routing_metadata: { tenantId: "tenant-a" } },
  tenantId: "tenant-a", attemptId: "attempt-1", leaseId: "opaque-lease-reference", fencingVersion: 1,
  workspaceRef: "workspace:job-1", artifactRefs: [], resourceProfile: "small", expiresAt: new Date(Date.now() + 60_000).toISOString() });
describe("private fixed media probe contract", () => {
  it("binds actual bytes to the declared length/checksum and rejects arbitrary execution fields", async () => {
    const input = { contentBase64: btoa("media"), sizeBytes: 5, checksumSha256: await probeSha256(new TextEncoder().encode("media")) };
    await expect(validateContainerProbeInput(input)).resolves.toBeUndefined();
    await expect(validateContainerProbeInput({ ...input, sizeBytes: 4 })).rejects.toThrow("CHECKSUM");
    await expect(validateContainerProbeInput({ ...input, checksumSha256: "a".repeat(64) })).rejects.toThrow("CHECKSUM");
    await expect(validateContainerProbeInput({ ...input, command: "curl" } as never)).rejects.toThrow("INVALID");
    await expect(validateContainerProbeInput({ ...input, sizeBytes: 3 * 1024 * 1024 + 1 })).rejects.toThrow("INVALID");
  });
  it.each(["tenant", "fence", "lease", "expiry", "checksum", "filename", "artifacts", "duration", "stream"])("rejects %s drift from the private runner", scenario => {
    const a = assignment(), checksum = "a".repeat(64);
    const result = { contractVersion: "container-media-probe-v1", scope: containerProbeScope(a), inputChecksumSha256: checksum,
      result: { artifacts: [], derived: { format: { format_name: "wav" }, streams: [{ codec_name: "pcm_s16le" }], durationMs: 1000 } } };
    expect(validateContainerProbeResult(result, a, checksum)).toEqual(result);
    if (scenario === "tenant") result.scope.tenantId = "tenant-b";
    if (scenario === "fence") result.scope.lease.fencingVersion++;
    if (scenario === "lease") result.scope.lease.leaseId = "raw-other";
    if (scenario === "expiry") a.expiresAt = "2000-01-01T00:00:00Z";
    if (scenario === "checksum") result.inputChecksumSha256 = "b".repeat(64);
    if (scenario === "filename") Object.assign(result.result.derived.format, { filename: "/tmp/private/input.bin" });
    if (scenario === "artifacts") Object.assign(result.result.artifacts, { 0: { uri: "https://evil.test" } });
    if (scenario === "duration") result.result.derived.durationMs = NaN;
    if (scenario === "stream") Object.assign(result.result.derived.streams[0], { tags: { secret: "not allowed" } });
    expect(() => validateContainerProbeResult(result, a, checksum)).toThrow("SCOPE");
  });
});
