import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cloudflareOriginDescriptorDigest, cloudflareOriginDescriptorSchema, cloudflareWorkflowVersionBindings, validateCloudflareOriginVersionBindings,
  assertCloudflareWorkflowVersionBindings, cloudflareOriginSecretsSchema } from "./cloudflareOriginVersionBindings";
import { nativeProvisionNamespace, nativeProvisionPlanDigest } from "./cloudflareNativeProvisionContract";
import { privateDatabasePlanDigest } from "./cloudflarePrivateDatabaseContract";

function fixture() {
  const tenantId = "tenant-a", projectId = "project-a", namespace = nativeProvisionNamespace(tenantId, projectId);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const plan = { namespace, vectorDimensions: 768 as const, vectorMetric: "cosine" as const, configurationExpiresAt: expiresAt,
    workflow: true as const, reuseProvisionJobId: randomUUID() };
  const privatePlan = { namespace, hostname: "db-staging.smartaihub.app" as const, zoneId: "a".repeat(32), tunnelId: randomUUID(),
    databaseName: "test", caSha256: "b".repeat(64), connectionLimit: 5 as const, configurationExpiresAt: expiresAt };
  const descriptor = { schemaVersion: "cloudflare.origin-configuration.v1" as const, versionId: randomUUID(), tenantId, projectId,
    environment: "staging" as const, provider: "cloudflare" as const, accountRef: "a".repeat(32), targetId: "smartspec-cloudflare-staging" as const,
    origin: "https://origin-staging.smartaihub.app", allowedPublicOrigins: ["https://stage.example.workers.dev"], accessApplicationId: randomUUID(),
    accessTeamName: "test-team", accessAudience: "test-audience", expiresAt, workflowExecution: "emergency-intake" as const,
    nativeResources: { provisionJobId: randomUUID(), plan, planDigest: nativeProvisionPlanDigest(plan), queueId: "c".repeat(32), workflowId: randomUUID(),
      privateDatabase: { provisionJobId: randomUUID(), plan: privatePlan, planDigest: privateDatabasePlanDigest(privatePlan), hyperdriveId: "d".repeat(32),
        caId: randomUUID(), accessApplicationId: randomUUID(), accessPolicyId: randomUUID(), serviceTokenId: randomUUID(), dnsRecordId: randomUUID() } } };
  const parsedDescriptor = cloudflareOriginDescriptorSchema.parse(descriptor);
  const configurationDigest = cloudflareOriginDescriptorDigest(parsedDescriptor), configurationRef = `cf-origin:${configurationDigest}`;
  const secrets = { token: "origin-" + "a".repeat(32), clientId: "access-client-12345", secret: "access-secret-12345",
    workflowRuntimeToken: "runtime-" + "b".repeat(32), controlPlaneToken: "control-" + "c".repeat(32) };
  const value = { descriptor: parsedDescriptor, secrets, configurationDigest, configurationRef };
  return { value, target: { ...descriptor, runtimePolicy: configurationRef } };
}

describe("exact bounded Workflow deployment configuration", () => {
  it("binds activation, tenant, expiry, private authority and separate credentials in one immutable configuration", () => {
    const { value, target } = fixture();
    const parsed = validateCloudflareOriginVersionBindings(value, target);
    const bindings = cloudflareWorkflowVersionBindings(parsed);
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_JOB_TRANSPORT", type: "plain_text", text: "workflows" });
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_WORKFLOW_TENANT_ID", type: "plain_text", text: "tenant-a" });
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_WORKFLOW_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt });
    expect(bindings.filter(binding => binding.type === "secret_text")).toHaveLength(2);
    expect(JSON.stringify(value.descriptor)).not.toContain(value.secrets.controlPlaneToken);
    expect(() => assertCloudflareWorkflowVersionBindings(bindings, parsed)).not.toThrow();
    for (const invalid of [bindings.slice(1), [...bindings, bindings[0]], bindings.map(binding => binding.name === "CLOUDFLARE_WORKFLOW_TENANT_ID" ? { ...binding, text: "tenant-b" } : binding)]) {
      expect(() => assertCloudflareWorkflowVersionBindings(invalid, parsed)).toThrow("BINDINGS_MISMATCH");
    }
  });

  it.each(["unbound-policy", "no-workflow", "no-private-db", "missing-token", "reused-token", "disabled-with-secrets"])("rejects unsafe activation composition: %s", scenario => {
    const { value, target } = fixture();
    if (scenario === "unbound-policy") target.runtimePolicy = "foreign";
    if (scenario === "no-workflow") delete (value.descriptor as any).nativeResources;
    if (scenario === "no-private-db") delete (value.descriptor.nativeResources as any).privateDatabase;
    if (scenario === "missing-token") delete (value.secrets as any).controlPlaneToken;
    if (scenario === "reused-token") value.secrets.controlPlaneToken = value.secrets.token;
    if (scenario === "disabled-with-secrets") delete (value.descriptor as any).workflowExecution;
    expect(() => validateCloudflareOriginVersionBindings(value, target)).toThrow();
  });

  it("accepts the existing three-secret disabled configuration unchanged", () => {
    const { value } = fixture();
    const { workflowRuntimeToken, controlPlaneToken, ...secrets } = value.secrets;
    expect(cloudflareOriginSecretsSchema.parse(secrets)).toEqual(secrets);
  });
});
