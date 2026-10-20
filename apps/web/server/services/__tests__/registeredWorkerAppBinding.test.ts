import { describe, expect, it, vi } from "vitest";
import { createRegisteredWorkerAppBinding } from "../registeredWorkerAppBinding";
import { createCloudflareTransportAdapters } from "../cloudflareJobAdapters";
function fixture() {
  const envelope = { job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
    dispatch_id: "outbox-1", dedupe_key: "dedupe-1", routing_metadata: {} };
  const job = { id: "job-1", tenantId: "tenant-a", requestedByUserId: 17, runtimeType: "external_runtime", jobType: "registered.test",
    contractVersion: "feature-186-v1", attempt: 1, status: "queued", operatorReviewRequired: false };
  const intent = { id: "outbox-1", dedupeKey: "dedupe-1", cancelledAt: null as Date | null, quarantinedAt: null as Date | null,
    envelopeJson: { jobId: "job-1", businessAttempt: 1, contractVersion: "feature-186-v1", dedupeKey: "dedupe-1" } };
  const scope = { tenantId: "tenant-a", actorUserId: 17, expiresAt: new Date(Date.now()+60_000).toISOString(), jobTypes: new Set(["registered.test"]) };
  const ports = { publication: vi.fn().mockResolvedValue({ job, intent }), reference: vi.fn().mockResolvedValue(job), cancel: vi.fn() };
  return { envelope, job, intent, scope, ports, binding: createRegisteredWorkerAppBinding(scope, ports) };
}
describe("registered Worker App canonical adapter, independent of WFP", () => {
  it("returns the original canonical reference without creating or claiming a job", async () => {
    const f = fixture();
    expect(await f.binding.dispatch({ envelope: f.envelope })).toEqual({ referenceId: "job-1" });
    expect(await f.binding.dispatch({ envelope: f.envelope })).toEqual({ referenceId: "job-1" });
    expect(createCloudflareTransportAdapters({ workerApp: f.binding }).has("cloudflare-worker-app")).toBe(true);
    expect(f.ports.cancel).not.toHaveBeenCalled();
  });
  it.each(["tenant", "actor", "runtime", "jobType", "attempt", "review", "cancelled", "quarantined", "envelope"])("rejects %s substitution", async scenario => {
    const f = fixture();
    if (scenario === "tenant") f.job.tenantId = "tenant-b";
    if (scenario === "actor") f.job.requestedByUserId = 18;
    if (scenario === "runtime") f.job.runtimeType = "node_job_worker";
    if (scenario === "jobType") f.job.jobType = "unapproved";
    if (scenario === "attempt") f.job.attempt = 2;
    if (scenario === "review") f.job.operatorReviewRequired = true;
    if (scenario === "cancelled") f.intent.cancelledAt = new Date();
    if (scenario === "quarantined") f.intent.quarantinedAt = new Date();
    if (scenario === "envelope") f.intent.envelopeJson.businessAttempt = 2;
    await expect(f.binding.dispatch({ envelope: f.envelope })).rejects.toThrow("PUBLICATION_DENIED");
  });
  it("observes canonical state and uses the original scoped cancellation owner", async () => {
    const f = fixture();expect(await f.binding.inspect!("job-1")).toBe("published");
    f.job.status = "running";expect(await f.binding.inspect!("job-1")).toBe("consumed");
    await f.binding.cancel!("job-1");expect(f.ports.cancel).toHaveBeenCalledWith("job-1",{ tenantId: "tenant-a", requestedByUserId: 17 });
    f.job.tenantId = "tenant-b";
    expect(await f.binding.findByDedupeKey!("dedupe-1")).toBeNull();
    await expect(f.binding.cancel!("job-1")).rejects.toThrow("SCOPE_DENIED");
  });
  it("snapshots the grant scope and rejects expired authority", async () => {
    const f = fixture(); f.scope.tenantId = "tenant-b";f.scope.jobTypes.add("unapproved");
    expect(await f.binding.dispatch({ envelope: f.envelope })).toEqual({ referenceId: "job-1" });
    f.job.jobType = "unapproved";await expect(f.binding.dispatch({ envelope: f.envelope })).rejects.toThrow("PUBLICATION_DENIED");
    const expired = createRegisteredWorkerAppBinding({ ...f.scope, expiresAt: "2000-01-01T00:00:00Z" },f.ports);
    await expect(expired.inspect!("job-1")).rejects.toThrow("SCOPE_DENIED");
  });
});
