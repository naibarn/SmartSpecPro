import { describe, expect, it, vi } from "vitest";
import { createNativeRunnerContainerBinding, NativeRunnerContainerController } from "./nativeRunnerContainer";
import type { RunnerContainerAssignment } from "./runnerContainer";
function fixture() {
  const image = `registry.cloudflare.com/account/runner@sha256:${"a".repeat(64)}`;
  const records = new Map<string, unknown>();
  const storage = { get: async <T>(key: string) => records.get(key) as T | undefined, put: vi.fn(async (key, value) => { records.set(key, value); }) };
  const container = { running: false, images: { runner: image }, inspect: vi.fn(), start: vi.fn(), destroy: vi.fn(),
    setInactivityTimeout: vi.fn(), getTcpPort: vi.fn(() => ({ fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: "ready", profile: "shared_container" }))) })) };
  const assignment: RunnerContainerAssignment = { envelope: { job_id: "job-1", business_attempt: 1, attempt_id: "attempt-1",
    contract_version: "feature-205-v1", dispatch_id: "dispatch-1", dedupe_key: "dedupe-1", routing_metadata: { tenantId: "tenant-a" } },
    tenantId: "tenant-a", attemptId: "attempt-1", leaseId: "lease-1", fencingVersion: 1,
    workspaceRef: "workspace:job-1", artifactRefs: [], resourceProfile: "small", expiresAt: new Date(Date.now()+60_000).toISOString() };
  const controller = new NativeRunnerContainerController(container as never, storage, image);
  return { image, storage, container, records, assignment, controller };
}
describe("native Cloudflare Container lifecycle", () => {
  it("persists intent before boot and uses the approved image with no internet or secret environment", async () => {
    const f = fixture(); await f.controller.start(f.assignment);
    expect(f.storage.put.mock.invocationCallOrder[0]).toBeLessThan(f.container.start.mock.invocationCallOrder[0]);
    expect(f.container.start).toHaveBeenCalledWith(expect.objectContaining({ image: f.image, enableInternet: false, instance: "lite" }));
    expect(f.container.start.mock.calls[0][0].env).toEqual({ SAH_RUNNER_PROFILE: "shared_container", SAH_RUNNER_ID: "container:job-1",
      SAH_RUNNER_JOB_ID: "job-1", SAH_RUNNER_ATTEMPT_ID: "attempt-1", SAH_RUNNER_LEASE_ID: "lease-1", SAH_RUNNER_HEALTH_PORT: "8787" });
    f.container.running = true;
    f.container.inspect.mockResolvedValue({ image: f.image, labels: { scope: ([...f.records.values()][0] as { scopeDigest: string }).scopeDigest } });
    await f.controller.start(f.assignment);
    expect(f.container.start).toHaveBeenCalledOnce();
  });
  it("does not start on lost intent persistence, unowned instance or an unpinned image", async () => {
    const f = fixture(); f.storage.put.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(f.controller.start(f.assignment)).rejects.toThrow("storage unavailable");expect(f.container.start).not.toHaveBeenCalled();
    f.container.running = true;
    await expect(f.controller.start(f.assignment)).rejects.toThrow("UNOWNED");
    await expect(new NativeRunnerContainerController(f.container as never,f.storage,"latest").start(f.assignment)).rejects.toThrow("APPROVED_IMAGE");
  });
  it("does not boot when expiry alarm persistence fails or extend the alarm on rejected ownership", async () => {
    const f = fixture(), alarm = vi.fn().mockRejectedValue(new Error("alarm unavailable"));
    await expect(f.controller.start(f.assignment, alarm)).rejects.toThrow("alarm unavailable");
    expect(f.container.start).not.toHaveBeenCalled();expect(alarm).toHaveBeenCalledOnce();
    const foreign = { ...f.assignment, fencingVersion: 2 };alarm.mockClear();
    await expect(f.controller.start(foreign, alarm)).rejects.toThrow("ASSIGNMENT_CONFLICT");expect(alarm).not.toHaveBeenCalled();
  });
  it.each(["tenant", "fence", "deadline", "profile", "released"])("rejects %s drift against durable ownership", async scenario => {
    const f = fixture(); await f.controller.start(f.assignment);f.container.running = true;
    if (scenario === "tenant") { f.assignment.tenantId = "tenant-b"; f.assignment.envelope.routing_metadata.tenantId = "tenant-b"; }
    if (scenario === "fence") f.assignment.fencingVersion = 2;
    if (scenario === "deadline") f.assignment.expiresAt = "2000-01-01T00:00:00Z";
    if (scenario === "profile") f.assignment.resourceProfile = "large";
    if (scenario === "released") await f.controller.stop("runner:job-1:attempt-1");
    await expect(f.controller.start(f.assignment)).rejects.toThrow(); expect(f.container.start).toHaveBeenCalledOnce();
  });
  it("does not infer readiness from running; verifies provider identity and actual Runner health", async () => {
    const f = fixture();await f.controller.start(f.assignment);f.container.running = true;
    f.container.inspect.mockResolvedValue({ image: f.image, labels: { scope: "foreign" } });
    await expect(f.controller.inspect("runner:job-1:attempt-1")).rejects.toThrow("PROVIDER_SCOPE");
    const record = [...f.records.values()][0] as { scopeDigest: string };
    f.container.inspect.mockResolvedValue({ image: f.image, labels: { scope: record.scopeDigest } });
    expect(await f.controller.inspect("runner:job-1:attempt-1")).toMatchObject({ status: "ready" });
  });
  it("destroys an expired assignment and retains its tombstone", async () => {
    const f = fixture();await f.controller.start(f.assignment);
    const record = [...f.records.values()][0] as { expiresAt: string };record.expiresAt = "2000-01-01T00:00:00Z";
    await f.controller.expire();await f.controller.expire();expect(f.container.destroy).toHaveBeenCalledOnce();
    expect([...f.records.values()][0]).toMatchObject({ released: true });
  });
  it("maps namespace RPC without dropping the assignment and rejects foreign identity", async () => {
    const f = fixture(), id = "runner:job-1:attempt-1";
    const stub = { startRunner: vi.fn().mockResolvedValue({ id, status: "starting" }), inspectRunner: vi.fn(), stopRunner: vi.fn() };
    const binding = createNativeRunnerContainerBinding({ idFromName: n => n, get: () => stub });
    await binding.start({ instanceId: id, envelope: f.assignment.envelope, assignment: f.assignment });
    expect(stub.startRunner).toHaveBeenCalledWith(f.assignment);
    await expect(binding.start({ instanceId: id, envelope: f.assignment.envelope })).rejects.toThrow("ASSIGNMENT_REQUIRED");
    stub.inspectRunner.mockResolvedValue({ id: "foreign", status: "ready" }); await expect(binding.find!(id)).rejects.toThrow("PROVIDER_SCOPE");
  });
});
