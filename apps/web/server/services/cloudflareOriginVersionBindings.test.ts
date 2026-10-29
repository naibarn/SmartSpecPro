import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cloudflareOriginDescriptorDigest, cloudflareOriginDescriptorSchema, cloudflareWorkflowVersionBindings, validateCloudflareOriginVersionBindings,
  assertCloudflareWorkflowVersionBindings, cloudflareOriginSecretsSchema } from "./cloudflareOriginVersionBindings";
import { nativeProvisionNamespace, nativeProvisionPlanDigest } from "./cloudflareNativeProvisionContract";
import { privateDatabasePlanDigest } from "./cloudflarePrivateDatabaseContract";
import { httpApplicationNamespace, httpApplicationWorkerMetadata } from "./cloudflareHttpApplicationBindings";

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
  it("supports a separate production origin version while rejecting staging target reuse", () => {
    const { value, target } = fixture();
    delete value.descriptor.nativeResources;
    delete value.descriptor.workflowExecution;
    delete value.secrets.workflowRuntimeToken;
    delete value.secrets.controlPlaneToken;
    value.descriptor.environment = "production";
    value.descriptor.targetId = "smartspec-cloudflare-runtime";
    value.descriptor = cloudflareOriginDescriptorSchema.parse(value.descriptor);
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor);
    value.configurationRef = `cf-origin:${value.configurationDigest}`;
    target.environment = "production";
    target.targetId = "smartspec-cloudflare-runtime";
    target.runtimePolicy = value.configurationRef;
    expect(validateCloudflareOriginVersionBindings(value, target).descriptor.environment).toBe("production");
    expect(() => validateCloudflareOriginVersionBindings(value, { ...target, targetId: "smartspec-cloudflare-staging" })).toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, targetId: "smartspec-cloudflare-staging" })).toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, workflowExecution: "emergency-intake" })).toThrow();
  });

  it("admits only an exact production Node/Python Container pair in a production origin version", () => {
    const { value, target } = fixture();
    delete value.descriptor.nativeResources;
    delete value.descriptor.workflowExecution;
    delete value.secrets.workflowRuntimeToken;
    delete value.secrets.controlPlaneToken;
    value.descriptor.environment = "production";
    value.descriptor.targetId = "smartspec-cloudflare-runtime";
    const namespace = httpApplicationNamespace(value.descriptor.tenantId, value.descriptor.projectId, "production");
    value.descriptor.applicationHttp = {
      mode: "private-canary", namespace, sourceSha: "e".repeat(40),
      traffic: "production-full-http-v1", realtime: "production-allowlisted-v1",
      node: { provisionJobId: randomUUID(), planDigest: "f".repeat(64), image: `registry.cloudflare.com/${value.descriptor.accountRef}/${nativeProvisionNamespace(value.descriptor.tenantId, value.descriptor.projectId)}-node-http@sha256:${"1".repeat(64)}` },
      python: { provisionJobId: randomUUID(), planDigest: "2".repeat(64), image: `registry.cloudflare.com/${value.descriptor.accountRef}/${nativeProvisionNamespace(value.descriptor.tenantId, value.descriptor.projectId)}-python-http@sha256:${"3".repeat(64)}` },
      issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 50_000).toISOString(),
      maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 30, instance: "basic",
    };
    value.secrets.applicationHttp = {
      node: { CONTROL_PLANE_API_KEY: "bootstrap-fixture-key-1234567890", JWT_SECRET: "node-runtime-secret-value" },
      python: { SECRET_KEY: "python-runtime-secret-value" },
    };
    value.secrets.applicationCanaryToken = "application-canary-token-" + "a".repeat(32);
    value.descriptor = cloudflareOriginDescriptorSchema.parse(value.descriptor);
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor);
    value.configurationRef = `cf-origin:${value.configurationDigest}`;
    target.environment = "production";
    target.targetId = "smartspec-cloudflare-runtime";
    target.runtimePolicy = value.configurationRef;
    const validated = validateCloudflareOriginVersionBindings(value, target);
    const bindings = cloudflareWorkflowVersionBindings(validated);
    expect(bindings.find(binding => binding.name === "CLOUDFLARE_NODE_HTTP_PROFILE")?.text).toContain("smartspec-cloudflare-runtime");
    expect(bindings.find(binding => binding.name === "CLOUDFLARE_APPLICATION_HTTP_TRAFFIC")?.text).toBe("production-full-http-v1");
    expect(bindings.find(binding => binding.name === "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS")?.text)
      .toBe(JSON.stringify(value.descriptor.allowedPublicOrigins));
    expect(bindings.find(binding => binding.name === "CLOUDFLARE_NODE_HTTP_SECRETS")?.type).toBe("secret_text");
    expect(() => assertCloudflareWorkflowVersionBindings(bindings, validated)).not.toThrow();
    expect(() => assertCloudflareWorkflowVersionBindings([...bindings,
      { name: "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS", type: "plain_text", text: '["https://unreviewed.example"]' }], validated)).toThrow("MISMATCH");
    const wrongNamespace = cloudflareOriginDescriptorSchema.parse({ ...value.descriptor,
      applicationHttp: { ...value.descriptor.applicationHttp!, namespace: nativeProvisionNamespace("tenant-a", "project-a") } });
    const wrongNamespaceDigest = cloudflareOriginDescriptorDigest(wrongNamespace);
    const wrongNamespaceRef = `cf-origin:${wrongNamespaceDigest}`;
    expect(() => validateCloudflareOriginVersionBindings({ ...validated, descriptor: wrongNamespace,
      configurationDigest: wrongNamespaceDigest, configurationRef: wrongNamespaceRef }, { ...target, runtimePolicy: wrongNamespaceRef })).toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, nativeResources: fixture().value.descriptor.nativeResources })).toThrow();
  });

  it("derives Staging auth origins and paired runtime bindings from the reviewed immutable configuration", () => {
    const { value } = fixture();
    const namespace = httpApplicationNamespace(value.descriptor.tenantId, value.descriptor.projectId, "staging");
    const image = (runtime: "node" | "python") => `registry.cloudflare.com/${value.descriptor.accountRef}/${namespace}-${runtime}-http@sha256:${(runtime === "node" ? "1" : "2").repeat(64)}`;
    value.descriptor.applicationHttp = {
      mode: "private-canary", namespace, sourceSha: "e".repeat(40), traffic: "staging-full-http-v1",
      node: { provisionJobId: randomUUID(), planDigest: "f".repeat(64), image: image("node") },
      python: { provisionJobId: randomUUID(), planDigest: "1".repeat(64), image: image("python") },
      issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 50_000).toISOString(),
      maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic",
    };
    value.secrets.applicationHttp = { node: { CONTROL_PLANE_API_KEY: "bootstrap-fixture-key-1234567890" }, python: {} };
    value.secrets.applicationCanaryToken = "application-canary-token-" + "a".repeat(32);
    value.descriptor = cloudflareOriginDescriptorSchema.parse(value.descriptor);
    const bindings = cloudflareWorkflowVersionBindings(value);
    expect(bindings.find(binding => binding.name === "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS")?.text)
      .toBe(JSON.stringify(value.descriptor.allowedPublicOrigins));
    expect(bindings.find(binding => binding.name === "CLOUDFLARE_APPLICATION_HTTP_TRAFFIC")?.text).toBe("staging-full-http-v1");
    expect(bindings.find(binding => binding.name === "CLOUDFLARE_CONTAINER_POLICY")?.text).toBe("on-demand");
    expect(bindings.some(binding => binding.name === "CLOUDFLARE_NODE_HTTP_PROFILE")).toBe(true);
    expect(bindings.some(binding => binding.name === "CLOUDFLARE_PYTHON_HTTP_PROFILE")).toBe(true);
    const metadata = httpApplicationWorkerMetadata(value.descriptor.applicationHttp!, value.descriptor);
    expect(metadata.bindings).toEqual(expect.arrayContaining([
      { name: "NODE_HTTP", type: "durable_object_namespace", class_name: "StagingNodeHttpContainer" },
      { name: "PYTHON_HTTP", type: "durable_object_namespace", class_name: "StagingPythonHttpContainer" },
    ]));
  });

  it("binds public Runner catalog reads independently of paid job transport, and rejects capability injection", () => {
    const { value, target } = fixture();
    delete value.descriptor.workflowExecution;
    delete value.secrets.workflowRuntimeToken; delete value.secrets.controlPlaneToken;
    value.descriptor.runnerReleaseCatalog = "hyperdrive";
    value.descriptor.nativeResources!.privateDatabase!.plan.publicRunnerCatalogSourceJobId = randomUUID();
    value.descriptor.nativeResources!.privateDatabase!.planDigest = privateDatabasePlanDigest(value.descriptor.nativeResources!.privateDatabase!.plan);
    value.descriptor = cloudflareOriginDescriptorSchema.parse(value.descriptor);
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor);
    value.configurationRef = `cf-origin:${value.configurationDigest}`; target.runtimePolicy = value.configurationRef;
    const validated = validateCloudflareOriginVersionBindings(value, target);
    const bindings = cloudflareWorkflowVersionBindings(validated);
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_RUNNER_RELEASE_CATALOG", type: "plain_text", text: "hyperdrive" });
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT", type: "plain_text", text: value.descriptor.expiresAt });
    expect(bindings.some(binding => binding.name === "CLOUDFLARE_JOB_TRANSPORT")).toBe(false);
    expect(() => assertCloudflareWorkflowVersionBindings(bindings, validated)).not.toThrow();
    expect(() => assertCloudflareWorkflowVersionBindings(bindings.map(binding => binding.name === "CLOUDFLARE_RUNNER_RELEASE_EXPIRES_AT"
      ? { ...binding, text: new Date(Date.now()+86_400_000).toISOString() } : binding), validated)).toThrow("MISMATCH");
    const disabled = fixture().value;
    expect(() => assertCloudflareWorkflowVersionBindings([...cloudflareWorkflowVersionBindings(disabled), ...bindings], disabled)).toThrow("MISMATCH");
    delete value.descriptor.nativeResources.privateDatabase;
    expect(() => cloudflareWorkflowVersionBindings(value)).toThrow("DENIED");
  });

  it("pins fixed media capability and image to a new immutable configuration, rejecting unapproved env injection", () => {
    const { value, target } = fixture(), imageRef = `registry.cloudflare.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/runner/image@sha256:${"e".repeat(64)}`;
    const original = cloudflareWorkflowVersionBindings(value);
    expect(() => assertCloudflareWorkflowVersionBindings([...original, { name: "CLOUDFLARE_MEDIA_PROBE", type: "plain_text", text: "container-media-probe-v1" }], value)).toThrow("MISMATCH");
    value.descriptor.mediaProbe = { containerPolicy: "on-demand", capability: "container-media-probe-v1", imageRef };
    expect(() => validateCloudflareOriginVersionBindings(value, target)).toThrow();
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor); value.configurationRef = `cf-origin:${value.configurationDigest}`; target.runtimePolicy = value.configurationRef;
    const parsed = validateCloudflareOriginVersionBindings(value, target), bindings = cloudflareWorkflowVersionBindings(parsed);
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_CONTAINER_POLICY", type: "plain_text", text: "on-demand" });
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, mediaProbe: { ...value.descriptor.mediaProbe, containerPolicy: "always-on" } })).toThrow();
    expect(bindings).toContainEqual({ name: "CLOUDFLARE_RUNNER_IMAGE_REF", type: "plain_text", text: imageRef });
    expect(() => assertCloudflareWorkflowVersionBindings(bindings, parsed)).not.toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, mediaProbe: { containerPolicy: "on-demand", capability: "arbitrary", imageRef } })).toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, mediaProbe: { containerPolicy: "on-demand", capability: "container-media-probe-v1", imageRef: imageRef.replace("registry.cloudflare.com", "docker.io") } })).toThrow();
    const foreign = { ...value, descriptor: { ...value.descriptor, mediaProbe: { ...value.descriptor.mediaProbe, imageRef: imageRef.replace("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") } } };
    expect(() => validateCloudflareOriginVersionBindings(foreign, target)).toThrow();
    expect(() => cloudflareOriginDescriptorSchema.parse({ ...value.descriptor, mediaProbe: { containerPolicy: "on-demand", capability: "container-media-probe-v1", imageRef: "latest" } })).toThrow();
  });

  it("pins direct SQL opt-in in the immutable digest and rejects unapproved extra activation", () => {
    const { value, target } = fixture();
    const hybridBindings = cloudflareWorkflowVersionBindings(value);
    expect(() => assertCloudflareWorkflowVersionBindings([...hybridBindings,
      { name: "CLOUDFLARE_WORKFLOW_DATABASE", type: "plain_text", text: "hyperdrive-intake" }], value)).toThrow("MISMATCH");
    value.descriptor.workflowDatabase = "hyperdrive-intake";
    expect(() => validateCloudflareOriginVersionBindings(value, target)).toThrow();
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor);
    value.configurationRef = `cf-origin:${value.configurationDigest}`; target.runtimePolicy = value.configurationRef;
    const direct = validateCloudflareOriginVersionBindings(value, target);
    expect(cloudflareWorkflowVersionBindings(direct)).toContainEqual({ name: "CLOUDFLARE_WORKFLOW_DATABASE", type: "plain_text", text: "hyperdrive-intake" });
  });
  it("requires a new immutable digest to switch the transport to Queues", () => {
    const { value, target } = fixture();value.descriptor.jobTransport = "queues";
    expect(() => validateCloudflareOriginVersionBindings(value,target)).toThrow();
    value.configurationDigest=cloudflareOriginDescriptorDigest(value.descriptor);value.configurationRef=`cf-origin:${value.configurationDigest}`;target.runtimePolicy=value.configurationRef;
    const bindings=cloudflareWorkflowVersionBindings(validateCloudflareOriginVersionBindings(value,target));
    expect(bindings).toContainEqual({ name:"CLOUDFLARE_JOB_TRANSPORT",type:"plain_text",text:"queues" });
  });
  it("allows bounded queue execution without an unused Workflow resource", () => {
    const { value, target } = fixture();
    const plan = { ...value.descriptor.nativeResources!.plan };
    delete plan.workflow;
    delete plan.reuseProvisionJobId;
    value.descriptor.nativeResources!.plan = plan;
    value.descriptor.nativeResources!.planDigest = nativeProvisionPlanDigest(plan);
    delete value.descriptor.nativeResources!.workflowId;
    value.descriptor.jobTransport = "queues";
    value.configurationDigest = cloudflareOriginDescriptorDigest(value.descriptor);
    value.configurationRef = `cf-origin:${value.configurationDigest}`;
    target.runtimePolicy = value.configurationRef;

    const validated = validateCloudflareOriginVersionBindings(value, target);
    const bindings = cloudflareWorkflowVersionBindings(validated);

    expect(bindings).toContainEqual({ name: "CLOUDFLARE_JOB_TRANSPORT", type: "plain_text", text: "queues" });
    expect(bindings.some(binding => binding.name === "CLOUDFLARE_RUNTIME_TOKEN" && binding.type === "secret_text")).toBe(true);
    expect(bindings.some(binding => binding.name === "CLOUDFLARE_CONTROL_PLANE_TOKEN" && binding.type === "secret_text")).toBe(true);
    expect(bindings.some(binding => binding.name === "JOB_WORKFLOW")).toBe(false);
    expect(() => assertCloudflareWorkflowVersionBindings(bindings, validated)).not.toThrow();
  });
  it("binds retention independently with a separate secret and rejects unapproved extra schedule activation", () => {
    const { value,target }=fixture();
    const original=cloudflareWorkflowVersionBindings(value);
    expect(()=>assertCloudflareWorkflowVersionBindings([...original,{name:"CLOUDFLARE_RETENTION_SCHEDULE",type:"plain_text",text:"evidence-retention"}],value)).toThrow("MISMATCH");
    value.descriptor.retentionSchedule="evidence-retention";
    (value.secrets as typeof value.secrets & {retentionToken:string}).retentionToken="retention-"+"e".repeat(32);
    expect(()=>validateCloudflareOriginVersionBindings(value,target)).toThrow();
    value.configurationDigest=cloudflareOriginDescriptorDigest(value.descriptor);value.configurationRef=`cf-origin:${value.configurationDigest}`;target.runtimePolicy=value.configurationRef;
    const parsed=validateCloudflareOriginVersionBindings(value,target),bindings=cloudflareWorkflowVersionBindings(parsed);
    expect(bindings).toContainEqual({name:"CLOUDFLARE_RETENTION_TENANT_ID",type:"plain_text",text:"tenant-a"});
    expect(bindings).toContainEqual({name:"PLATFORM_EDGE_TOKEN",type:"secret_text",text:(value.secrets as any).retentionToken});
    expect(bindings.filter(b=>b.name==="PLATFORM_EDGE_ORIGIN")).toHaveLength(1);
    expect(()=>assertCloudflareWorkflowVersionBindings(bindings,parsed)).not.toThrow();
    delete parsed.descriptor.workflowExecution;delete parsed.descriptor.jobTransport;
    delete parsed.descriptor.workflowDatabase;delete parsed.secrets.workflowRuntimeToken;delete parsed.secrets.controlPlaneToken;
    const retentionOnly=cloudflareWorkflowVersionBindings(parsed);
    expect(retentionOnly.some(b=>b.name==="CLOUDFLARE_JOB_TRANSPORT")).toBe(false);
    delete parsed.secrets.retentionToken;expect(()=>cloudflareWorkflowVersionBindings(parsed)).toThrow();
  });
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
