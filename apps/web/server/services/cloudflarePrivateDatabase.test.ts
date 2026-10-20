import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { PRIVATE_DATABASE_CONTRACT, PRIVATE_DATABASE_GRANT, PRIVATE_DATABASE_JOB, certificateDigest,
  privateDatabaseGrantSchema, privateDatabasePlanDigest, type PrivateDatabaseGrant } from "./cloudflarePrivateDatabaseContract";
import { provisionCloudflarePrivateDatabase, type PrivateDatabaseCheckpoint } from "./cloudflarePrivateDatabaseTransport";
import { createCloudflarePrivateDatabaseExecutor } from "./cloudflarePrivateDatabaseExecutor";
import { validateJobDefinition } from "./jobCanonicalization";
import { assertPrivateDatabaseProvisionReceipt, validatePrivateDatabaseBinding, verifyPrivateDatabaseProviderResources } from "./cloudflarePrivateDatabaseBinding";
import { assertNativeWorkerBindings, nativeWorkerBindings } from "./cloudflareNativeBindingDescriptor";
import { nativeProvisionPlanDigest } from "./cloudflareNativeProvisionContract";

let caCertificate: string, certDirectory: string;
beforeAll(() => {
  certDirectory = mkdtempSync(join(tmpdir(), "sah-private-db-unit-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=Disposable unit test CA",
    "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", join(certDirectory, "key"), "-out", join(certDirectory, "ca")], { stdio: "ignore" });
  caCertificate = readFileSync(join(certDirectory, "ca"), "utf8");
});
afterAll(() => { if (certDirectory) rmSync(certDirectory, { recursive: true, force: true }); });

function fixture() {
  const plan = { namespace: nativeProvisionNamespace("tenant-test", "project-test"), hostname: "db-staging.smartaihub.app" as const,
    zoneId: "b".repeat(32), tunnelId: "11111111-1111-4111-8111-111111111111", databaseName: "unit_test_database",
    caSha256: certificateDigest(new X509Certificate(caCertificate).raw), connectionLimit: 5 as const,
    configurationExpiresAt: new Date(Date.now() + 86400_000).toISOString() };
  const grant: PrivateDatabaseGrant = { schemaVersion: PRIVATE_DATABASE_GRANT, grantRef: "22222222-2222-4222-8222-222222222222",
    jobId: "33333333-3333-4333-8333-333333333333", tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1,
    executorId: "cf-staging-executor:test", targetId: "smartspec-cloudflare-staging", environment: "staging", accountRef: "a".repeat(32),
    actions: ["provision"], expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null, plan, planDigest: privateDatabasePlanDigest(plan) };
  const checkpoints: PrivateDatabaseCheckpoint[] = [], resources: Record<string, any> = {};
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    const u = new URL(String(url)), path = u.pathname.replace("/client/v4", "");
    const account = `/accounts/${grant.accountRef}`, body = init.method === "POST" ? JSON.parse(init.body) : undefined;
    let result: any;
    if (path === `/zones/${plan.zoneId}`) result = { name: "smartaihub.app", account: { id: grant.accountRef } };
    else if (path === `${account}/cfd_tunnel/${plan.tunnelId}`) result = { id: plan.tunnelId, config_src: "local", status: "healthy" };
    else if (path === `${account}/mtls_certificates`) result = body ? (resources.ca = { ...body, id: "c".repeat(32) }) : [];
    else if (path === `${account}/mtls_certificates/${"c".repeat(32)}`) result = resources.ca;
    else if (path === `${account}/access/apps`) result = body ? (resources.app = { ...body, id: "44444444-4444-4444-8444-444444444444" }) : [];
    else if (path === `${account}/access/apps/${resources.app?.id}`) result = resources.app;
    else if (path === `${account}/access/service_tokens`) result = body ? (resources.token = { ...body, id: "55555555-5555-4555-8555-555555555555",
      client_id: "fixture-client-id-only", client_secret: "fixture-private-service-secret", expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }) : [];
    else if (path === `${account}/access/service_tokens/${resources.token?.id}`) result = resources.token;
    else if (path === `${account}/access/apps/${resources.app?.id}/policies`) result = body ? (resources.policy = { ...body, id: "66666666-6666-4666-8666-666666666666" }) : resources.policy ? [resources.policy] : [];
    else if (path === `/zones/${plan.zoneId}/dns_records`) result = body ? (resources.dns = { ...body, id: "d".repeat(32) }) : [];
    else if (path === `/zones/${plan.zoneId}/dns_records/${"d".repeat(32)}`) result = resources.dns;
    else if (path === `${account}/hyperdrive/configs`) result = body ? (resources.hyperdrive = { ...body, id: "e".repeat(32) }) : [];
    else if (path === `${account}/hyperdrive/configs/${"e".repeat(32)}`) result = resources.hyperdrive;
    else throw Error("Unexpected provider operation");
    return Response.json({ success: true, result });
  });
  const state: PrivateDatabaseCheckpoint = { planDigest: grant.planDigest, databaseRolePrepared: true, databasePassword: "fixture-database-password-not-real-00000" };
  const input = { grant, token: "fixture-provider-secret", caCertificate, checkpoint: state, fetchImpl: fetchImpl as typeof fetch,
    assertAuthorized: vi.fn(async () => {}), saveCheckpoint: vi.fn(async (value: PrivateDatabaseCheckpoint) => { checkpoints.push(structuredClone(value)); }) };
  return { grant, input, fetchImpl, checkpoints, resources };
}

describe("private PostgreSQL staging provisioning", () => {
  it("creates dedicated CA/Access/DNS/Hyperdrive metadata with strict TLS, disabled query cache and bounded connections", async () => {
    const f = fixture(), output = await provisionCloudflarePrivateDatabase(f.input);
    expect(output).toMatchObject({ providerConfigurationVerified: true, workerBound: false, activation: "disabled", sslmode: "verify-full", databaseAccess: "read_only_connection_probe" });
    const writes = f.fetchImpl.mock.calls.filter(([, init]) => init.method === "POST");
    expect(writes).toHaveLength(6);
    expect(f.resources.hyperdrive).toMatchObject({ caching: { disabled: true }, origin_connection_limit: 5, mtls: { sslmode: "verify-full", ca_certificate_id: "c".repeat(32) } });
    expect(f.resources.hyperdrive.origin).not.toHaveProperty("port");
    expect(f.resources.policy.include).toEqual([{ service_token: { token_id: f.resources.token.id } }]);
    expect(JSON.stringify(output)).not.toMatch(/fixture-provider-secret|fixture-database-password|fixture-private-service-secret|fixture-client-id/);
    for (const [url, init] of f.fetchImpl.mock.calls) {
      expect(init.method).toMatch(/^(GET|POST)$/);
      expect(String(url)).not.toMatch(/subscriptions|tokens\/create|connectivity|consumers|dispatch/);
    }
  });
  it("replays a completed checkpoint through reads only", async () => {
    const f = fixture(); await provisionCloudflarePrivateDatabase(f.input);
    f.fetchImpl.mockClear(); f.input.checkpoint = f.checkpoints.at(-1)!;
    await provisionCloudflarePrivateDatabase({ ...f.input, readOnly: true });
    expect(f.fetchImpl.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it.each(["tenantId", "projectId", "planDigest"])("rejects a substituted %s before network calls", async field => {
    const f = fixture(); Object.assign(f.grant, { [field]: "foreign" });
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects an untrusted CA before network calls", async () => {
    const f = fixture(); f.input.caCertificate = "not a certificate";
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("CA_INVALID"); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("refuses a pending ambiguous write without replay", async () => {
    const f = fixture(); f.input.checkpoint.pending = "hyperdrive.create";
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("AMBIGUOUS"); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("keeps durable intent after an uncertain provider write", async () => {
    const f = fixture(), original = f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async (url, init) => { if (init.method === "POST") throw Error("private details"); return original(url, init); });
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("AMBIGUOUS");
    expect(f.checkpoints.at(-1)?.pending).toBe("ca.create");
  });
  it("does not adopt an existing same-name resource", async () => {
    const f = fixture(), original = f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async (url, init) => String(url).includes("mtls_certificates?")
      ? Response.json({ success: true, result: [{ name: `${f.grant.plan.namespace}-database-${f.grant.planDigest.slice(0, 12)}` }] }) : original(url, init));
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("EXISTING_CA");
    expect(f.fetchImpl.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("rechecks revocation after saving intent and before POST", async () => {
    const f = fixture(); f.input.saveCheckpoint.mockImplementation(async () => { f.input.assertAuthorized.mockRejectedValue(Error("revoked")); });
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("revoked");
    expect(f.fetchImpl.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("rejects provider TLS/caching drift rather than accepting a receipt annotation", async () => {
    const f = fixture(), original = f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (String(url).endsWith(`/hyperdrive/configs/${"e".repeat(32)}`)) return Response.json({ success: true, result: { ...f.resources.hyperdrive, caching: { disabled: false } } });
      return response;
    });
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toThrow("HYPERDRIVE_DENIED");
  });
  it("classifies definite DNS propagation rejection as retryable with cleared durable intent", async () => {
    const f = fixture(), original = f.fetchImpl.getMockImplementation()!;
    f.fetchImpl.mockImplementation(async (url, init) => String(url).endsWith("/hyperdrive/configs") && init.method === "POST"
      ? Response.json({ success: false, errors: [{ code: 2008, message: "DNS lookup failed" }] }, { status: 400 }) : original(url, init));
    await expect(provisionCloudflarePrivateDatabase(f.input)).rejects.toMatchObject({ diagnosticCode: "PRIVATE_DATABASE_DNS_NOT_READY", class: "retryable" });
    expect(f.checkpoints.at(-1)?.pending).toBeUndefined(); expect(f.checkpoints.at(-1)?.hyperdriveId).toBeUndefined();
  });
});

describe("private database canonical executor fences", () => {
  it("fits the canonical job identity limits before policy issuance", () => {
    const f = fixture();
    expect(() => validateJobDefinition({ contractVersion: PRIVATE_DATABASE_CONTRACT, tenantId: f.grant.tenantId,
      jobType: PRIVATE_DATABASE_JOB, executionClass: "long", requestedByUserId: 1,
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 5000, jitter: "none", deadlineMs: 600000, deadlineMode: "fixed", allowedErrorClasses: ["transient"] },
      timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 600000 },
      input: { contractVersion: PRIVATE_DATABASE_CONTRACT, grantRef: f.grant.grantRef, projectId: f.grant.projectId, planDigest: f.grant.planDigest } } as never)).not.toThrow();
  });
  function execution() {
    const f = fixture();
    const runtime = { resolveGrant: vi.fn(async () => f.grant), resolveAccount: vi.fn(async () => f.grant.accountRef),
      verifyExecutor: vi.fn(async () => f.grant.executorId), certificate: vi.fn(async () => caCertificate), prepareDatabase: vi.fn(async () => {}),
      loadCheckpoint: vi.fn(async () => f.input.checkpoint), saveCheckpoint: f.input.saveCheckpoint,
      withCredential: vi.fn(async (_scope: any, operation: any) => operation(f.input.token)), fetchImpl: f.input.fetchImpl };
    const args = { context: { jobType: PRIVATE_DATABASE_JOB, contractVersion: PRIVATE_DATABASE_CONTRACT, jobId: f.grant.jobId,
      tenantId: f.grant.tenantId, requestedByUserId: 1, attempt: 1, retryPolicy: { deadlineMs: 600000, deadlineMode: "fixed" }, createdAt: new Date().toISOString(),
      input: { contractVersion: PRIVATE_DATABASE_CONTRACT, grantRef: f.grant.grantRef, projectId: f.grant.projectId, planDigest: f.grant.planDigest } },
      lease: { expiresAt: new Date(Date.now() + 60_000).toISOString(), fencingVersion: 1 },
      reporter: { assertActive: vi.fn(async () => {}), heartbeat: vi.fn(async () => {}) },
      controlPlane: { getStatus: vi.fn(async () => ({ attempt: 1, lease: { active: true, stale: false, fencingVersion: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() } })) } };
    return { ...f, runtime, args };
  }
  it("runs the bounded operation after canonical admission", async () => {
    const f = execution();
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).resolves.toMatchObject({ output: { providerConfigurationVerified: true } });
    expect(f.runtime.prepareDatabase).toHaveBeenCalledTimes(2);
  });
  it("resumes the same bounded plan on a reviewed recovery attempt after definite pre-submission failure", async () => {
    const f = execution(); f.args.context.attempt = 2;
    f.args.controlPlane.getStatus.mockResolvedValue({ attempt: 2, lease: { active: true, stale: false, fencingVersion: 1, expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).resolves.toMatchObject({ output: { providerConfigurationVerified: true } });
  });
  it("refuses uncertain writes before local role/connector preparation on recovery", async () => {
    const f = execution(); f.input.checkpoint.pending = "hyperdrive.create";
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).rejects.toThrow("AMBIGUOUS_WRITE_REVIEW_REQUIRED");
    expect(f.runtime.prepareDatabase).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(["tenantId", "jobId", "requestedByUserId"])("denies substituted %s before database/provider work", async field => {
    const f = execution(); Object.assign(f.args.context, { [field]: field === "requestedByUserId" ? 2 : "foreign" });
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).rejects.toThrow("AUTHORITY_DENIED");
    expect(f.runtime.prepareDatabase).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("denies a persisted expired lease even before reconciliation", async () => {
    const f = execution(); f.args.controlPlane.getStatus.mockResolvedValue({ attempt: 1, lease: { active: true, stale: false, fencingVersion: 1, expiresAt: "2000-01-01T00:00:00Z" } });
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).rejects.toThrow("LEASE_EXPIRED"); expect(f.runtime.prepareDatabase).not.toHaveBeenCalled();
  });
  it("denies revoked authority before preparing a local role", async () => {
    const f = execution(); f.runtime.resolveGrant.mockResolvedValueOnce(f.grant).mockResolvedValue(null as never);
    await expect(createCloudflarePrivateDatabaseExecutor(f.runtime)(f.args as never)).rejects.toThrow("AUTHORITY_DENIED"); expect(f.runtime.prepareDatabase).not.toHaveBeenCalled();
  });
  it("rejects foreign plan fields and SQL identifiers", () => {
    const f = fixture();
    for (const plan of [{ ...f.grant.plan, hostname: "foreign.example" }, { ...f.grant.plan, databaseName: 'db";DROP DATABASE other;' }, { ...f.grant.plan, connectionLimit: 100 }]) {
      expect(privateDatabaseGrantSchema.safeParse({ ...f.grant, plan, planDigest: privateDatabasePlanDigest(plan as never) }).success).toBe(false);
    }
  });
});

describe("immutable private database binding authority", () => {
  async function bindingFixture() {
    const f = fixture(), output = await provisionCloudflarePrivateDatabase(f.input);
    const descriptor = { provisionJobId: f.grant.jobId, plan: f.grant.plan, planDigest: f.grant.planDigest,
      hyperdriveId: output.hyperdriveId!, caId: output.caId!, accessApplicationId: output.accessApplicationId!, accessPolicyId: output.accessPolicyId!,
      serviceTokenId: output.serviceTokenId!, dnsRecordId: output.dnsRecordId! };
    const scope = { tenantId: f.grant.tenantId, projectId: f.grant.projectId, accountRef: f.grant.accountRef, actorUserId: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString() };
    const receipt = { id: f.grant.jobId, tenantId: f.grant.tenantId, requestedByUserId: 1, jobType: PRIVATE_DATABASE_JOB,
      contractVersion: PRIVATE_DATABASE_CONTRACT, status: "succeeded", operatorReviewRequired: false,
      inputJson: { contractVersion: PRIVATE_DATABASE_CONTRACT, grantRef: f.grant.grantRef, projectId: f.grant.projectId, planDigest: f.grant.planDigest }, outputJson: output };
    f.fetchImpl.mockClear(); return { ...f, output, descriptor, scope, receipt };
  }
  it("requires the exact succeeded canonical provision receipt, requester and immutable resource IDs", async () => {
    const f = await bindingFixture();
    expect(validatePrivateDatabaseBinding(f.descriptor, f.scope)).toEqual(f.descriptor);
    expect(() => assertPrivateDatabaseProvisionReceipt(f.descriptor, f.receipt, f.scope)).not.toThrow();
    for (const change of [{ status: "failed" }, { requestedByUserId: 2 }, { tenantId: "foreign" }, { operatorReviewRequired: true },
      { outputJson: { ...f.output, hyperdriveId: "f".repeat(32) } }, { outputJson: { ...f.output, sslmode: "require" } },
      { inputJson: { ...f.receipt.inputJson, projectId: "foreign" } }]) {
      expect(() => assertPrivateDatabaseProvisionReceipt(f.descriptor, { ...f.receipt, ...change }, f.scope)).toThrow("RECEIPT_DENIED");
    }
    expect(() => validatePrivateDatabaseBinding(f.descriptor, { ...f.scope, tenantId: "foreign" })).toThrow("SCOPE_DENIED");
  });
  it("projects Hyperdrive only from a declared private database configuration and detects version substitution", async () => {
    const f = await bindingFixture();
    const plan = { namespace: f.grant.plan.namespace, vectorDimensions: 768 as const, vectorMetric: "cosine" as const,
      configurationExpiresAt: f.grant.plan.configurationExpiresAt };
    const descriptor = { provisionJobId: "77777777-7777-4777-8777-777777777777", plan, planDigest: nativeProvisionPlanDigest(plan), queueId: "f".repeat(32), privateDatabase: f.descriptor };
    const actual = [...nativeWorkerBindings(descriptor), { name: "CLOUDFLARE_ACTIVATION", type: "plain_text", text: "disabled" }];
    expect(actual).toContainEqual({ name: "HYPERDRIVE", type: "hyperdrive", id: f.descriptor.hyperdriveId });
    expect(() => assertNativeWorkerBindings(actual, descriptor)).not.toThrow();
    expect(() => assertNativeWorkerBindings(actual.map(b => b.name === "HYPERDRIVE" ? { ...b, id: "a".repeat(32) } : b), descriptor)).toThrow("BINDINGS_MISMATCH");
    const { privateDatabase, ...legacy } = descriptor;
    expect(() => assertNativeWorkerBindings(actual, legacy)).toThrow("BINDINGS_MISMATCH");
  });
  it("verifies eight dedicated provider resources using GET only and rejects TLS/cache/policy drift", async () => {
    const f = await bindingFixture();
    await verifyPrivateDatabaseProviderResources({ descriptor: f.descriptor, accountRef: f.grant.accountRef, token: f.input.token, fetchImpl: f.input.fetchImpl });
    expect(f.fetchImpl).toHaveBeenCalledTimes(8);
    expect(f.fetchImpl.mock.calls.every(([, init]) => !init.method || init.method === "GET")).toBe(true);
    f.resources.hyperdrive.mtls.sslmode = "require";
    await expect(verifyPrivateDatabaseProviderResources({ descriptor: f.descriptor, accountRef: f.grant.accountRef, token: f.input.token, fetchImpl: f.input.fetchImpl })).rejects.toThrow("RESOURCE_DRIFT");
  });
});
