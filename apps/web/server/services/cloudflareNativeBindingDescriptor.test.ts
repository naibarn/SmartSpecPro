import { describe, expect, it, vi } from "vitest";
import { assertNativeProvisionReceipt, assertNativeWorkerBindings, nativeWorkerBindings, validateNativeBindingScope, verifyNativeProviderResources } from "./cloudflareNativeBindingDescriptor";
import { nativeProvisionNamespace, nativeProvisionPlanDigest, nativeResourceNames } from "./cloudflareNativeProvisionContract";

const scope = { tenantId: "tenant-a", projectId: "project-a", accountRef: "a".repeat(32), actorUserId: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString() };
const plan = { namespace: nativeProvisionNamespace(scope.tenantId, scope.projectId), vectorDimensions: 768 as const,
  vectorMetric: "cosine" as const, configurationExpiresAt: new Date(Date.now() + 3600_000).toISOString() };
const descriptor = { provisionJobId: "11111111-1111-4111-8111-111111111111", plan, planDigest: nativeProvisionPlanDigest(plan), queueId: "b".repeat(32) };
const names = nativeResourceNames(plan);
const receipt = { id: descriptor.provisionJobId, tenantId: scope.tenantId, requestedByUserId: 1,
  jobType: "cloudflare.staging.native.provision", contractVersion: "cloudflare-staging-native-provision-v1", status: "succeeded", operatorReviewRequired: false,
  inputJson: { contractVersion: "cloudflare-staging-native-provision-v1", grantRef: "22222222-2222-4222-8222-222222222222", projectId: scope.projectId, planDigest: descriptor.planDigest },
  outputJson: { accountRef: scope.accountRef, namespace: plan.namespace, queue: { id: descriptor.queueId, name: names.queue },
    bucket: { name: names.bucket }, vector: { name: names.vector }, providerConfigurationVerified: true,
    activation: "disabled", jobHandlerQualified: false, metadataIndexes: ["tenantId", "sourceJobId"] } };

describe("immutable native binding descriptors", () => {
  it("binds Workflow metadata and resource identity only to its exact successful receipt", () => {
    const workflowPlan = { ...plan, workflow: true as const, reuseProvisionJobId: "33333333-3333-4333-8333-333333333333" };
    const workflowId = "44444444-4444-4444-8444-444444444444";
    const extended = { ...descriptor, plan: workflowPlan, planDigest: nativeProvisionPlanDigest(workflowPlan), workflowId };
    const workflowReceipt = { ...receipt, inputJson: { ...receipt.inputJson, planDigest: extended.planDigest },
      outputJson: { ...receipt.outputJson, workflow: { id: workflowId, name: names.workflow, className: "CanonicalJobWorkflow", scriptName: "smartspec-cloudflare-staging" } } };
    expect(() => assertNativeProvisionReceipt(extended, workflowReceipt, scope)).not.toThrow();
    expect(nativeWorkerBindings(extended)).toContainEqual({ name: "JOB_WORKFLOW", type: "workflow", workflow_name: names.workflow,
      class_name: "CanonicalJobWorkflow", script_name: "smartspec-cloudflare-staging" });
    expect(() => assertNativeProvisionReceipt({ ...extended, workflowId: "55555555-5555-4555-8555-555555555555" }, workflowReceipt, scope)).toThrow("RECEIPT_DENIED");
    const bindings = [...nativeWorkerBindings(extended), { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" }];
    expect(() => assertNativeWorkerBindings(bindings, extended)).not.toThrow();
    expect(() => assertNativeWorkerBindings(bindings.filter(item => item.name !== "JOB_WORKFLOW"), extended)).toThrow("VERSION_BINDINGS_MISMATCH");
  });
  it("admits a completed exact canonical receipt and projects only three resource bindings", () => {
    expect(validateNativeBindingScope(descriptor, scope)).toEqual(descriptor);
    expect(() => assertNativeProvisionReceipt(descriptor, receipt, scope)).not.toThrow();
    expect(nativeWorkerBindings(descriptor)).toEqual([
      { name: "JOB_QUEUE", type: "queue", queue_name: names.queue },
      { name: "MEDIA_BUCKET", type: "r2_bucket", bucket_name: names.bucket },
      { name: "VECTOR_INDEX", type: "vectorize", index_name: names.vector },
    ]);
  });
  it("allows the approved queue transport without provisioning an unused Workflow binding", () => {
    const queuePlan = { ...plan };
    const queueDescriptor = { ...descriptor, plan: queuePlan, planDigest: nativeProvisionPlanDigest(queuePlan) };
    const bindings = [...nativeWorkerBindings(queueDescriptor), { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "enabled" }];

    expect(bindings.some(binding => binding.name === "JOB_WORKFLOW")).toBe(false);
    expect(() => assertNativeWorkerBindings(bindings, queueDescriptor, true, "queues")).not.toThrow();
    expect(() => assertNativeWorkerBindings(bindings, queueDescriptor, true, "workflows")).toThrow("VERSION_BINDINGS_MISMATCH");
  });
  it.each([{ status: "failed" }, { tenantId: "foreign" }, { requestedByUserId: 2 }, { operatorReviewRequired: true },
    { id: "33333333-3333-4333-8333-333333333333" }, { jobType: "other" }, { outputJson: {} },
    { inputJson: { ...receipt.inputJson, projectId: "foreign" } },
    { outputJson: { ...receipt.outputJson, accountRef: "c".repeat(32) } },
    { outputJson: { ...receipt.outputJson, queue: { ...receipt.outputJson.queue, id: "c".repeat(32) } } }])("refuses receipt substitution: %j", changes => {
    expect(() => assertNativeProvisionReceipt(descriptor, { ...receipt, ...changes }, scope)).toThrow("RECEIPT_DENIED");
  });
  it("keeps provisioned resources scoped after the original authorization expires", () => {
    for (const change of [{ tenantId: "foreign" }, { projectId: "foreign" }])
      expect(() => validateNativeBindingScope(descriptor, { ...scope, ...change })).toThrow("SCOPE_DENIED");
    expect(validateNativeBindingScope(descriptor, { ...scope, expiresAt: new Date(Date.now() - 1000).toISOString() })).toEqual(descriptor);
    expect(validateNativeBindingScope(descriptor, scope, Date.now() + 7200_000)).toEqual(descriptor);
  });
  it("rejects a right annotation with missing, substituted, duplicate or extra native bindings", () => {
    const bindings = [...nativeWorkerBindings(descriptor), { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" }];
    expect(() => assertNativeWorkerBindings(bindings, descriptor)).not.toThrow();
    for (const invalid of [undefined, bindings.slice(1), [...bindings, bindings[0]],
      [...bindings, { name: "FOREIGN", type: "r2_bucket", bucket_name: "production" }],
      bindings.map(item => item.name === "JOB_QUEUE" ? { ...item, queue_name: "production" } : item),
      bindings.map(item => item.name === "CLOUDFLARE_ACTIVATION" ? { ...item, text: "enabled" } : item)])
      expect(() => assertNativeWorkerBindings(invalid, descriptor)).toThrow("VERSION_BINDINGS_MISMATCH");
  });

  it.each(["valid", "queue-replaced", "consumer-enabled", "vector-config-changed", "metadata-missing", "permission-denied"])("rechecks actual resources with four bounded GETs: %s", async scenario => {
    const fetchImpl = vi.fn(async (url: any) => {
      let result: unknown;
      if (String(url).includes("/queues/")) result = { queue_id: scenario === "queue-replaced" ? "f".repeat(32) : descriptor.queueId,
        queue_name: names.queue, consumers_total_count: scenario === "consumer-enabled" ? 1 : 0 };
      else if (String(url).includes("/r2/")) result = { name: names.bucket };
      else if (String(url).endsWith("/metadata_index/list")) result = { metadataIndexes: scenario === "metadata-missing" ? [] : [
        { propertyName: "tenantId", indexType: "String" }, { propertyName: "sourceJobId", indexType: "String" },
      ] };
      else result = { name: names.vector, config: { dimensions: scenario === "vector-config-changed" ? 1536 : 768, metric: "cosine" } };
      return Response.json({ success: scenario !== "permission-denied", result }, { status: scenario === "permission-denied" ? 403 : 200 });
    });
    const request = verifyNativeProviderResources({ descriptor, accountRef: scope.accountRef, token: "fixture-private-token", fetchImpl });
    if (scenario === "valid") await expect(request).resolves.toBeUndefined();
    else await expect(request).rejects.toThrow(scenario === "permission-denied" ? "READ_HTTP_403" : "RESOURCE_DRIFT");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(url).toMatch(new RegExp(`^https://api.cloudflare.com/client/v4/accounts/${scope.accountRef}/`));
      expect(init.method).toBeUndefined();
      expect(init.redirect).toBe("error");
    }
  });
});
