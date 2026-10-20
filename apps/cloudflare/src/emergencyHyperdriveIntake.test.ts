import { describe, expect, it, vi } from "vitest";
import { executeHyperdriveEmergencyIntake } from "./emergencyHyperdriveIntake";
const delivery = () => ({
  env: { CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_JOB_TRANSPORT: "workflows", CLOUDFLARE_WORKFLOW_DATABASE: "hyperdrive-intake",
    CLOUDFLARE_WORKFLOW_TENANT_ID: "tenant-a", CLOUDFLARE_WORKFLOW_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString() },
  job: { jobId: "job-1", tenantId: "tenant-a", businessAttempt: 1, jobType: "emergency.report.intake", contractVersion: "feature-186-v1",
    executionClass: "short", operatorReviewRequired: false, status: "running", input: { reportId: "report-1", tenantId: "tenant-a" } },
  envelope: { job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1", dispatch_id: "dispatch-1", dedupe_key: "dedupe-1", routing_metadata: {} },
  claim: { attemptId: "attempt-1", fencingVersion: 1, leaseToken: "fixture-lease" },
});
describe("direct intake admission", () => {
  it.each(["tenant", "expired", "mode", "type", "input", "attempt", "contract", "fence", "review"])("rejects %s substitution before SQL", async scenario => {
    const d = delivery();
    if (scenario === "tenant") d.job.tenantId = "tenant-b";
    if (scenario === "expired") d.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT = "2000-01-01T00:00:00Z";
    if (scenario === "mode") d.env.CLOUDFLARE_WORKFLOW_DATABASE = "";
    if (scenario === "type") d.job.jobType = "unadmitted";
    if (scenario === "input") Object.assign(d.job.input, { arbitrary: true });
    if (scenario === "attempt") d.envelope.business_attempt = 2;
    if (scenario === "contract") d.envelope.contract_version = "other";
    if (scenario === "fence") d.claim.fencingVersion = 0;
    if (scenario === "review") d.job.operatorReviewRequired = true;
    const begin = vi.fn();
    await expect(executeHyperdriveEmergencyIntake(d, { begin, unsafe: vi.fn() })).rejects.toThrow("NOT_ADMITTED");
    expect(begin).not.toHaveBeenCalled();
  });
});
