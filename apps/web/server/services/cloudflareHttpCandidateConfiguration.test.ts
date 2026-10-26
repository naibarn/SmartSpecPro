import { describe, expect, it } from "vitest";
import { createHttpCandidateConfiguration } from "./cloudflareHttpCandidateConfiguration";
import { httpApplicationNamespace, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB } from "./cloudflareHttpImageProvisionContract";

function fixture() {
  const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", actorUserId: 1,
    accountRef: "a".repeat(32), environment: "production" as const };
  const settings: HttpApplicationSettings = { mode: "private-canary", sourceSha: "b".repeat(40),
    namespace: httpApplicationNamespace(scope.tenantId, scope.projectId, "production"),
    node: { provisionJobId: "00000000-0000-4000-8000-000000000001", planDigest: "c".repeat(64),
      image: `registry.cloudflare.com/${scope.accountRef}/${httpApplicationNamespace(scope.tenantId, scope.projectId)}-node-http@sha256:${"d".repeat(64)}` },
    python: { provisionJobId: "00000000-0000-4000-8000-000000000002", planDigest: "e".repeat(64),
      image: `registry.cloudflare.com/${scope.accountRef}/${httpApplicationNamespace(scope.tenantId, scope.projectId)}-python-http@sha256:${"f".repeat(64)}` },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" };
  const receipt = (runtime: "node" | "python") => ({ id: settings[runtime].provisionJobId, tenantId: scope.tenantId,
    requestedByUserId: scope.actorUserId, jobType: HTTP_IMAGE_PROVISION_JOB, contractVersion: HTTP_IMAGE_PROVISION_CONTRACT,
    status: "succeeded", operatorReviewRequired: false,
    inputJson: { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, grantRef: "00000000-0000-4000-8000-000000000003",
      projectId: scope.projectId, planDigest: settings[runtime].planDigest },
    outputJson: { schemaVersion: "cloudflare-http-image-receipt-v1", jobId: settings[runtime].provisionJobId,
      planDigest: settings[runtime].planDigest, sourceSha: settings.sourceSha, runtime: `${runtime}-http`, accountRef: scope.accountRef,
      namespace: httpApplicationNamespace(scope.tenantId, scope.projectId), image: settings[runtime].image,
      registryVerified: true, containerStarts: 0, applicationCreated: false, activation: "disabled" } });
  return { scope, settings, receipts: { node: receipt("node"), python: receipt("python") } };
}
describe("production candidate Wrangler packaging", () => {
  it("packages exact published images into an isolated private Worker without any DNS, route or queue prerequisite", () => {
    const input = fixture(), { config, trafficMutation, dnsMutation } = createHttpCandidateConfiguration(input);
    expect(config.name).toMatch(/^smartspec-production-[a-f0-9]{12}-candidate$/);
    expect(config.name).not.toBe("smartspec-cloudflare-runtime");
    expect(config.routes).toEqual([]); expect(config).not.toHaveProperty("queues"); expect(config).not.toHaveProperty("assets");
    expect(config.containers.map(item => Object.values(item.images)[0])).toEqual([input.settings.node.image, input.settings.python.image]);
    expect(config.vars.CLOUDFLARE_ACTIVATION).toBe("disabled"); expect(trafficMutation || dnsMutation).toBe(false);
    expect(config).not.toHaveProperty("secrets");
  });
  it.each(["node", "python"] as const)("rejects a wrong-tenant, failed, unverified or changed %s image receipt", runtime => {
    for (const mutation of [{ tenantId: "foreign" }, { status: "failed" }, { requestedByUserId: 9 }, { outputJson: {} }]) {
      const f = fixture(); Object.assign(f.receipts[runtime], mutation);
      expect(() => createHttpCandidateConfiguration(f)).toThrow("RECEIPT_DENIED");
    }
  });
  it("rejects public ingress, enlarged budgets and expired runtime configuration", () => {
    for (const change of [{ traffic: "production-full-http-v1" }, { maxStarts: 3 }, { maxComputeSeconds: 1201 },
      { expiresAt: new Date(Date.now() - 2000).toISOString() }]) {
      const f = fixture(); Object.assign(f.settings, change);
      expect(() => createHttpCandidateConfiguration(f)).toThrow();
    }
  });
});
