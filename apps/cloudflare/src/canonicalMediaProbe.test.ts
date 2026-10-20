import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("./canonicalControlPlaneProxy", () => ({ prepareCanonicalMediaProbe: mocks.prepare }));
import { executeCanonicalMediaProbe } from "./canonicalMediaProbe";
import { containerProbeScope, probeSha256 } from "./containerMediaProbeContract";
import { inspectBindingReadiness } from "./bindings";
import { createCanonicalControlPlaneHandler } from "./controlPlaneHandler";
import type { CanonicalWorkerExecution } from "./contracts";
function fixture() {
  const bytes = new TextEncoder().encode("test media");
  const objects = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>([["uploads/7/input.wav", { bytes }]]);
  const get = vi.fn(async (key: string) => {
    const value = objects.get(key); return value ? { size: value.bytes.byteLength, customMetadata: value.customMetadata,
      body: new Response(value.bytes).body! } : null;
  });
  const put = vi.fn(async (key: string, value: Uint8Array, options: { onlyIf: unknown; customMetadata: Record<string, string> }) => {
    expect(options.onlyIf).toEqual({ etagDoesNotMatch: "*" });
    if (objects.has(key)) return null;
    objects.set(key, { bytes: value, customMetadata: options.customMetadata }); return { key };
  });
  const expiresAt = new Date(Date.now() + 45_000).toISOString();
  const job = { jobId: "job-1", tenantId: "tenant-a", contractVersion: "feature-186-v1", businessAttempt: 1, status: "running", operatorReviewRequired: false,
    jobType: "python.legacy_task", executionClass: "long", input: { taskName: "app.tasks.media_job_worker.execute_media_job", taskImportPath: "app.tasks.media_job_worker.execute_media_job",
      args: [JSON.stringify({ jobType: "probe", jobId: "external-1", inputs: { assets: [{ uri: "r2://uploads/7/input.wav" }] } }), "7", "external-1"], kwargs: {}, queue: null, legacyUserId: "7" } };
  const envelope = { job_id: "job-1", contract_version: "feature-186-v1", business_attempt: 1, attempt_id: null, dispatch_id: "dispatch-1", dedupe_key: "job:job-1:attempt:1", routing_metadata: {} };
  const probeMedia = vi.fn(async (assignment, input) => ({ contractVersion: "container-media-probe-v1", scope: containerProbeScope(assignment), inputChecksumSha256: input.checksumSha256,
    result: { artifacts: [], derived: { format: { format_name: "wav", duration: "1.000000" }, streams: [{ codec_name: "pcm_s16le" }], durationMs: 1000 } } }));
  const env = { CLOUDFLARE_MEDIA_PROBE: "container-media-probe-v1", CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_JOB_TRANSPORT: "workflows",
    CLOUDFLARE_WORKFLOW_TENANT_ID: "tenant-a", CLOUDFLARE_WORKFLOW_EXPIRES_AT: expiresAt, CLOUDFLARE_RUNNER_IMAGE_REF: `registry.example.com/runner/image@sha256:${"a".repeat(64)}`,
    MEDIA_BUCKET: { get, put, head: vi.fn(), delete: vi.fn() }, JOB_CONTAINERS: { start: vi.fn(), probeMedia, stop: vi.fn() } };
  const delivery = { job, envelope, claim: { attemptId: "attempt-1", leaseToken: "private-canonical-lease", fencingVersion: 1, expiresAt }, env } as Parameters<CanonicalWorkerExecution>[0];
  mocks.prepare.mockImplementation(async () => ({ tenantId: "tenant-a", userId: 7, assetId: 1, objectKey: "uploads/7/input.wav", sizeBytes: bytes.length,
    checksumSha256: await probeSha256(bytes), contentType: "audio/wav", expiresAt }));
  return { delivery, env, get, put, objects, probeMedia };
}
afterEach(() => vi.restoreAllMocks());
describe("canonical media probe composition", () => {
  it("runs after claim, persists actual checked result, cleans up before settlement and preserves legacy output", async () => {
    const f = fixture(), complete = vi.fn().mockResolvedValue("completed"), retry = vi.fn();
    const repository = { loadJob: vi.fn().mockResolvedValue(f.delivery.job), recordDispatch: vi.fn().mockResolvedValue("recorded"),
      claim: vi.fn().mockResolvedValue(f.delivery.claim), complete, retry };
    const handler = createCanonicalControlPlaneHandler({ repository, execute: executeCanonicalMediaProbe });
    expect(await handler(f.delivery.envelope, f.env as never)).toBe("completed");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ result: { resultRef: expect.stringMatching(/^staging\/tenant-a\/job-1\/probe\/attempt-1\/[a-f0-9]{64}\.json$/),
      output: { artifacts: [], derived: { format: { format_name: "wav", duration: "1.000000" }, streams: [{ codec_name: "pcm_s16le" }], durationMs: 1000 } } } }));
    expect(f.env.JOB_CONTAINERS.stop.mock.invocationCallOrder[0]).toBeLessThan(complete.mock.invocationCallOrder[0]);
    const serialized = JSON.stringify(f.env.JOB_CONTAINERS.start.mock.calls);
    expect(serialized).not.toContain(f.delivery.claim.leaseToken);
    expect(serialized).toContain("lease-");
    expect(retry).not.toHaveBeenCalled();
    // Same attempt/repeated execution cannot overwrite the immutable artifact.
    await executeCanonicalMediaProbe(f.delivery); expect(f.objects.size).toBe(2);
  });
  it.each(["foreign-tenant", "checksum", "oversize", "expiry", "unsupported-task", "disabled"])("rejects %s before starting a container", async scenario => {
    const f = fixture();
    if (scenario === "foreign-tenant") f.delivery.job.tenantId = "tenant-b";
    if (scenario === "checksum") f.objects.set("uploads/7/input.wav", { bytes: new TextEncoder().encode("wrong") });
    if (scenario === "oversize") f.objects.set("uploads/7/input.wav", { bytes: new Uint8Array(3 * 1024 * 1024 + 1) });
    if (scenario === "expiry") f.delivery.claim.expiresAt = "2000-01-01T00:00:00Z";
    if (scenario === "unsupported-task") f.delivery.job.input.taskName = "app.tasks.other";
    if (scenario === "disabled") delete f.delivery.env.CLOUDFLARE_MEDIA_PROBE;
    await expect(executeCanonicalMediaProbe(f.delivery)).rejects.toThrow();
    expect(f.env.JOB_CONTAINERS.start).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
  });
  it.each(["rpc", "result-fence", "storage", "readback", "cleanup"])("never settles success after %s failure; always attempts cleanup", async scenario => {
    const f = fixture();
    if (scenario === "rpc") f.probeMedia.mockRejectedValue(new Error("rpc down"));
    if (scenario === "result-fence") f.probeMedia.mockImplementation(async (assignment, input) => ({ contractVersion: "container-media-probe-v1", scope: { ...containerProbeScope(assignment), tenantId: "tenant-b" }, inputChecksumSha256: input.checksumSha256 }));
    if (scenario === "storage") f.put.mockRejectedValue(new Error("unavailable"));
    if (scenario === "readback") f.get.mockImplementation(async key => key.startsWith("staging/") ? null : ({ size: 10, body: new Response("test media").body! }));
    if (scenario === "cleanup") f.env.JOB_CONTAINERS.stop.mockRejectedValue(new Error("destroy failed"));
    await expect(executeCanonicalMediaProbe(f.delivery)).rejects.toThrow();
    expect(f.env.JOB_CONTAINERS.stop).toHaveBeenCalledOnce();
    expect(f.env.MEDIA_BUCKET.delete).not.toHaveBeenCalled();
  });
  it("includes real input/CPU capabilities in readiness only when explicitly selected", () => {
    const f = fixture(); const env = { ...f.env, HYPERDRIVE: { connectionString: "opaque" }, JOB_WORKFLOW: { get: vi.fn(), create: vi.fn() } };
    expect(inspectBindingReadiness(env as never).ready).toBe(true);
    delete (env.JOB_CONTAINERS as any).probeMedia;
    expect(inspectBindingReadiness(env as never)).toMatchObject({ ready: false, selectedMissing: ["JOB_CONTAINERS"] });
  });
});
