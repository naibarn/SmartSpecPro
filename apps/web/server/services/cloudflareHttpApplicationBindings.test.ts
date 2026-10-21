import { describe, expect, it } from "vitest";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB } from "./cloudflareHttpImageProvisionContract";
import { assertHttpImageProvisionReceipt, validateHttpApplicationSettings, httpApplicationWorkerMetadata,
  httpApplicationVersionBindings, cloudflareHttpApplicationSecretsSchema, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
function fixture() {
  const scope = { tenantId: "tenant-test", projectId: "project-test", accountRef: "a".repeat(32), actorUserId: 1 };
  const namespace = nativeProvisionNamespace(scope.tenantId, scope.projectId);
  const image = (runtime: string) => `registry.cloudflare.com/${scope.accountRef}/${namespace}-${runtime}-http@sha256:${"b".repeat(64)}`;
  const settings: HttpApplicationSettings = { mode: "private-canary", namespace, sourceSha: "c".repeat(40),
    node: { provisionJobId: "11111111-1111-4111-8111-111111111111", planDigest: "d".repeat(64), image: image("node") },
    python: { provisionJobId: "22222222-2222-4222-8222-222222222222", planDigest: "e".repeat(64), image: image("python") },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic" };
  const receipt = { id: settings.node.provisionJobId, tenantId: scope.tenantId, requestedByUserId: 1,
    jobType: HTTP_IMAGE_PROVISION_JOB, contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, status: "succeeded", operatorReviewRequired: false,
    inputJson: { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, grantRef: "33333333-3333-4333-8333-333333333333",
      projectId: scope.projectId, planDigest: settings.node.planDigest }, outputJson: { schemaVersion: "cloudflare-http-image-receipt-v1",
      jobId: settings.node.provisionJobId, planDigest: settings.node.planDigest, sourceSha: settings.sourceSha, runtime: "node-http",
      accountRef: scope.accountRef, namespace, image: settings.node.image, registryVerified: true, containerStarts: 0,
      applicationCreated: false, activation: "disabled" } };
  return { scope, settings, receipt };
}
describe("paired HTTP API deployment capabilities", () => {
  it("declares fixed classes and image aliases with on-demand profiles, without VM activation", () => {
    const f = fixture(); expect(validateHttpApplicationSettings(f.settings, f.scope)).toEqual(f.settings);
    const metadata = httpApplicationWorkerMetadata(f.settings, f.scope);
    expect(metadata.containers).toEqual([
      { name: `${f.settings.namespace}-node-http`, class_name: "StagingNodeHttpContainer", images: { node: f.settings.node.image } },
      { name: `${f.settings.namespace}-python-http`, class_name: "StagingPythonHttpContainer", images: { python: f.settings.python.image } },
    ]);
    expect(metadata.exports.StagingNodeHttpContainer).toMatchObject({ type: "durable-object", storage: "sqlite" });
    expect(metadata.bindings.map(b => b.name)).toEqual(["NODE_HTTP", "PYTHON_HTTP"]);
    const bindings = httpApplicationVersionBindings(f.settings, { ...f.scope, configurationRef: `cf-origin:${"f".repeat(64)}` },
      { node: { JWT_SECRET: "app-fixture" }, python: { SECRET_KEY: "app-fixture" } });
    expect(bindings.find(b => b.name === "CLOUDFLARE_NODE_HTTP_SECRETS")?.type).toBe("secret_text");
    const node = JSON.parse(bindings.find(b => b.name === "CLOUDFLARE_NODE_HTTP_PROFILE")!.text);
    expect(node).toMatchObject({ runtime: "node-http", namespace: f.settings.namespace, image: f.settings.node.image, instance: "basic", maxStarts: 1 });
    expect(node).not.toHaveProperty("JWT_SECRET"); expect(JSON.stringify(metadata)).not.toContain("app-fixture");
  });
  it.each(["namespace", "image-account", "image-runtime", "unbounded-time", "starts", "compute", "idle", "one-job"])("rejects %s before metadata creation", mode => {
    const f = fixture();
    if (mode === "namespace") f.settings.namespace = "smartspec-staging-111111111111";
    if (mode === "image-account") f.settings.node.image = f.settings.node.image.replace(f.scope.accountRef, "f".repeat(32));
    if (mode === "image-runtime") f.settings.node.image = f.settings.python.image;
    if (mode === "unbounded-time") f.settings.expiresAt = new Date(Date.now() + 3600_000).toISOString();
    if (mode === "starts") f.settings.maxStarts = 3;
    if (mode === "compute") f.settings.maxComputeSeconds = 119;
    if (mode === "idle") f.settings.idleTimeoutSeconds = 31;
    if (mode === "one-job") f.settings.python.provisionJobId = f.settings.node.provisionJobId;
    expect(() => httpApplicationWorkerMetadata(f.settings, f.scope)).toThrow();
  });
  it("requires an exact successful actor-owned canonical image receipt", () => {
    const f = fixture(); expect(() => assertHttpImageProvisionReceipt(f.settings, "node", f.receipt, f.scope)).not.toThrow();
    for (const changes of [{ tenantId: "foreign" }, { requestedByUserId: 2 }, { status: "failed" }, { operatorReviewRequired: true },
      { contractVersion: "unknown" }, { inputJson: { ...f.receipt.inputJson, projectId: "foreign" } },
      { outputJson: { ...f.receipt.outputJson, image: f.settings.python.image } }, { outputJson: { ...f.receipt.outputJson, registryVerified: false } },
      { outputJson: { ...f.receipt.outputJson, sourceSha: "f".repeat(40) } }, { outputJson: { ...f.receipt.outputJson, containerStarts: 1 } }]) {
      expect(() => assertHttpImageProvisionReceipt(f.settings, "node", { ...f.receipt, ...changes }, f.scope)).toThrow("RECEIPT_DENIED");
    }
  });
  it.each(["NODE_OPTIONS", "PYTHONPATH", "LD_PRELOAD", "PATH", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_STAGING_EXECUTOR_PRIVATE_KEY"])("never injects operator authority or loader control %s", key => {
    expect(() => cloudflareHttpApplicationSecretsSchema.parse({ node: { [key]: "fixture" }, python: {} })).toThrow();
  });
});
