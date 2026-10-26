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
  it("requires the installed security-definer lease fence in Production", async () => {
    const d = delivery();
    Object.assign(d.env, { CLOUDFLARE_ENVIRONMENT: "production" });
    const begin = vi.fn();
    await expect(executeHyperdriveEmergencyIntake(d, { begin, unsafe: vi.fn() })).rejects.toThrow("NOT_ADMITTED");
    expect(begin).not.toHaveBeenCalled();
  });
  it("uses only the installed fence function for Production job-control locking", async () => {
    const d = delivery();
    Object.assign(d.env, { CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_PRODUCTION_FENCE_MODE: "security-definer-v1" });
    const unsafe = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ accepted: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "received", workerJobId: "job-1" }])
      .mockResolvedValueOnce([{ id: "case-1", revision: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "report-1" }])
      .mockResolvedValueOnce([{ id: "case-1" }])
      .mockResolvedValueOnce([{ accepted: true }]);
    const transaction = { unsafe, begin: async () => { throw new Error("nested transaction denied"); } };
    const client = { unsafe, begin: (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) };
    await executeHyperdriveEmergencyIntake(d, client);
    expect(unsafe.mock.calls[2]?.[0]).toContain("cloudflare_validate_emergency_intake_v1");
    expect(unsafe.mock.calls[2]?.[1]?.slice(0, 5)).toEqual(["job-1", "tenant-a", 1, "attempt-1", 1]);
    expect(unsafe.mock.calls[2]?.[0]).toContain("$9::text::jsonb");
    expect(unsafe.mock.calls[3]).toEqual(["SELECT set_config('smartspec.tenant_id', $1, true)", ["tenant-a"]]);
    expect(JSON.parse(String(unsafe.mock.calls[2]?.[1]?.[8]))).toEqual(d.job.input);
    expect(unsafe.mock.calls.at(-1)?.[0]).toContain("cloudflare_validate_emergency_intake_v1");
  });
});
