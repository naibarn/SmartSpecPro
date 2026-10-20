import { describe, expect, it, vi } from "vitest";
import { createCloudflareNativeProvisionExecutor } from "./cloudflareNativeProvisionExecutor";
import { nativeProvisionPlanDigest, nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";

function fixture() {
  const plan = { namespace: nativeProvisionNamespace("tenant-test", "project-test"), vectorDimensions: 768 as const,
    vectorMetric: "cosine" as const, configurationExpiresAt: new Date(Date.now() + 86400_000).toISOString() };
  const grant = { schemaVersion: "cloudflare.staging-native-provision-grant.v1", grantRef: "55555555-5555-4555-8555-555555555555",
    jobId: "66666666-6666-4666-8666-666666666666", tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1,
    executorId: "cf-staging-executor:test", targetId: "smartspec-cloudflare-staging", environment: "staging", accountRef: "a".repeat(32),
    actions: ["provision"], expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null, plan, planDigest: nativeProvisionPlanDigest(plan) };
  const runtime = { resolveGrant: vi.fn(async () => grant), verifyExecutor: vi.fn(async () => grant.executorId),
    resolveAccount: vi.fn(async () => grant.accountRef), withCredential: vi.fn(), loadCheckpoint: vi.fn(), saveCheckpoint: vi.fn(), saveConfiguration: vi.fn() };
  const contractVersion = "cloudflare-staging-native-provision-v1";
  const input = { context: { jobType: "cloudflare.staging.native.provision", contractVersion, jobId: grant.jobId,
    tenantId: grant.tenantId, requestedByUserId: 1, retryPolicy: { deadlineMs: 600000, deadlineMode: "fixed" }, createdAt: new Date().toISOString(),
    input: { contractVersion, grantRef: grant.grantRef, projectId: grant.projectId, planDigest: grant.planDigest } },
    lease: { expiresAt: new Date(Date.now() + 60_000).toISOString() }, reporter: { assertActive: vi.fn(async () => undefined) } };
  return { grant, runtime, input };
}

describe("canonical native provisioning admission fences", () => {
  it.each(["tenantId", "jobId", "requestedByUserId"])("denies mismatched %s before credentials/provider use", async field => {
    const f = fixture();
    Object.assign(f.input.context, { [field]: field === "requestedByUserId" ? 2 : "foreign" });
    await expect(createCloudflareNativeProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_DENIED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled();
    expect(f.runtime.verifyExecutor).not.toHaveBeenCalled();
  });

  it("rejects an expired canonical lease before resolving credentials", async () => {
    const f = fixture();
    f.input.lease.expiresAt = "2000-01-01T00:00:00Z";
    await expect(createCloudflareNativeProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_EXPIRED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled();
  });

  it("refuses a credential rotated after callback admission before any provider request", async () => {
    const f = fixture();
    const fetchImpl = vi.fn();
    f.runtime.withCredential.mockImplementationOnce(async (_scope, operation) => operation("original-provider-token"))
      .mockImplementation(async (_scope, operation) => operation("replacement-provider-token"));
    await expect(createCloudflareNativeProvisionExecutor({ ...f.runtime, fetchImpl } as never)(f.input as never)).rejects.toThrow("CREDENTIAL_CHANGED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a revoked live grant after initial resolution", async () => {
    const f = fixture();
    f.runtime.resolveGrant.mockResolvedValueOnce(f.grant).mockResolvedValue(null as never);
    await expect(createCloudflareNativeProvisionExecutor(f.runtime as never)(f.input as never)).rejects.toThrow("AUTHORITY_DENIED");
    expect(f.runtime.withCredential).not.toHaveBeenCalled();
  });
});
