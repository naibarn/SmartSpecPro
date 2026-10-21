import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudflareHttpImageProvisionExecutor, httpImageProvisionCredentialRef } from "./cloudflareHttpImageProvisionExecutor";
import { httpImageProvisionPlanDigest } from "./cloudflareHttpImageProvisionContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
function fixture() {
  const plan = { namespace: nativeProvisionNamespace("tenant-test", "project-test"), runtime: "node-http" as const,
    sourceSha: "a".repeat(40), buildId: "a".repeat(40) + "-11111111-1111-4111-8111-111111111111",
    configurationExpiresAt: new Date(Date.now() + 1800_000).toISOString(), buildBudgetSeconds: 180,
    maxImageBytes: 1073741824, maxPublishedImages: 1 };
  const grant = { schemaVersion: "cloudflare.staging-http-image-provision-grant.v1", grantRef: "22222222-2222-4222-8222-222222222222",
    jobId: "33333333-3333-4333-8333-333333333333", tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1,
    executorId: "cf-staging-executor:test", accountRef: "b".repeat(32), targetId: "smartspec-cloudflare-staging", environment: "staging",
    actions: ["provision"], revokedAt: null, expiresAt: plan.configurationExpiresAt, plan, planDigest: httpImageProvisionPlanDigest(plan as never) };
  const runtime = { resolveGrant: vi.fn(async () => grant), verifyExecutor: vi.fn(async () => grant.executorId),
    resolveAccount: vi.fn(async () => grant.accountRef), withCredential: vi.fn(async (_scope, operation) => operation("private-fixture")),
    loadCheckpoint: vi.fn(async () => null), saveCheckpoint: vi.fn(), createPorts: vi.fn() };
  const contractVersion = "cloudflare-staging-http-image-provision-v1";
  const input = { context: { jobType: "cloudflare.staging.http.image.provision", contractVersion, jobId: grant.jobId,
    tenantId: grant.tenantId, requestedByUserId: 1, attempt: 1, createdAt: new Date().toISOString(),
    retryPolicy: { deadlineMode: "fixed", deadlineMs: 600_000 },
    input: { contractVersion, grantRef: grant.grantRef, projectId: grant.projectId, planDigest: grant.planDigest } },
    lease: { expiresAt: new Date(Date.now() + 60_000).toISOString(), fencingVersion: 1 },
    reporter: { assertActive: vi.fn(async () => undefined), heartbeat: vi.fn(async () => undefined) },
    controlPlane: { getStatus: vi.fn(async () => ({ attempt: 1, lease: { active: true, stale: false, fencingVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString() } })) } };
  return { grant, runtime, input };
}
afterEach(() => { vi.unstubAllEnvs(); });
describe("HTTP image canonical admission fences", () => {
  it.each(["tenantId", "jobId", "requestedByUserId"])("rejects foreign %s before credential/build access", async field => {
    const f = fixture(); Object.assign(f.input.context, { [field]: field === "requestedByUserId" ? 2 : "foreign" });
    await expect(createCloudflareHttpImageProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_DENIED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled(); expect(f.runtime.createPorts).not.toHaveBeenCalled();
  });
  it.each(["expiry", "attempt", "fence", "deadline"])("rejects persisted %s before any credential or provider write", async mode => {
    const f = fixture();
    if (mode === "deadline") f.input.context.createdAt = "2000-01-01T00:00:00Z";
    else f.input.controlPlane.getStatus.mockResolvedValue({ attempt: mode === "attempt" ? 2 : 1,
      lease: { active: true, stale: false, fencingVersion: mode === "fence" ? 2 : 1,
        expiresAt: mode === "expiry" ? "2000-01-01T00:00:00Z" : new Date(Date.now() + 60_000).toISOString() } });
    await expect(createCloudflareHttpImageProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_EXPIRED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled();
  });
  it("denies live revocation and a mismatched registered executor", async () => {
    const f = fixture(); f.runtime.resolveGrant.mockResolvedValueOnce(f.grant).mockResolvedValue(null as never);
    await expect(createCloudflareHttpImageProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_DENIED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled();
    const other = fixture(); other.runtime.verifyExecutor.mockResolvedValue("foreign");
    await expect(createCloudflareHttpImageProvisionExecutor(other.runtime as never)(other.input as never)).rejects.toThrow("EXECUTOR_DENIED");
    expect(other.runtime.withCredential).not.toHaveBeenCalled();
  });
  it("detects credential rotation before constructing publisher ports", async () => {
    const f = fixture(); f.runtime.withCredential.mockImplementationOnce(async (_scope, op) => op("first"))
      .mockImplementation(async (_scope, op) => op("rotated"));
    await expect(createCloudflareHttpImageProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("CREDENTIAL_CHANGED");
    expect(f.runtime.createPorts).not.toHaveBeenCalled();
  });
  it("never performs operator work inside an on-demand serving API runtime", async () => {
    vi.stubEnv("SMARTAIHUB_APPLICATION_RUNTIME", "cloudflare-http"); const f = fixture();
    await expect(createCloudflareHttpImageProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("OPERATOR_RUNTIME_REQUIRED");
    expect(f.runtime.resolveGrant).not.toHaveBeenCalled();
  });
  it("separates credential purpose and denies production setup", () => {
    const scope = { tenantId: "t", projectId: "p", provider: "cloudflare", environment: "staging" };
    expect(httpImageProvisionCredentialRef(scope)).toBe("cloudflare:http-image-provision:t:p:staging");
    expect(() => httpImageProvisionCredentialRef({ ...scope, environment: "production" })).toThrow();
  });
});
