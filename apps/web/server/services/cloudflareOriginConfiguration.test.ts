import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { nativeProvisionNamespace, nativeProvisionPlanDigest, nativeResourceNames } from "./cloudflareNativeProvisionContract";
import { saveCloudflareOriginConfiguration, getCloudflareOriginConfiguration,
  withCloudflareOriginConfiguration, withCloudflareOriginConfigurationForTransition, revokeCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";

const identity = { tenantId: "origin-test", projectId: "origin-project", environment: "staging", provider: "cloudflare" };
const settings = () => ({ origin: "https://origin-staging.smartaihub.app", allowedPublicOrigins: ["https://staging.account.workers.dev"],
  accessApplicationId: "11111111-1111-4111-8111-111111111111", accessTeamName: "fixture-team",
  accessAudience: "fixture-audience", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
const secrets = { token: "fixture-origin-token-not-a-real-secret", clientId: "fixture-client-id.access", secret: "fixture-client-secret" };

describe("origin configuration validation before storage", () => {
  it.each([
    { origin: "https://localhost" }, { origin: "https://origin-staging.smartaihub.app/path" },
    { allowedPublicOrigins: ["https://*.smartaihub.app"] },
    { allowedPublicOrigins: ["https://origin-staging.smartaihub.app"] },
    { expiresAt: "2020-01-01T00:00:00Z" },
  ])("rejects unsafe origin settings before a database transaction: %j", async changes => {
    const db = { transaction: vi.fn() };
    await expect(saveCloudflareOriginConfiguration(db as never, { identity, settings: { ...settings(), ...changes }, secrets, actorUserId: 1 })).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("refuses production or incomplete credential material before storage", async () => {
    const db = { transaction: vi.fn() };
    await expect(saveCloudflareOriginConfiguration(db as never, { identity: { ...identity, environment: "production" }, settings: settings(), secrets, actorUserId: 1 })).rejects.toThrow();
    await expect(saveCloudflareOriginConfiguration(db as never, { identity, settings: settings(), secrets: { ...secrets, secret: "" }, actorUserId: 1 })).rejects.toThrow();
    await expect(saveCloudflareOriginConfiguration(db as never, { identity, settings: settings(), secrets: { ...secrets, secret: secrets.token }, actorUserId: 1 })).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

const enabled = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true";
(enabled ? describe : describe.skip)("origin configuration against disposable PostgreSQL", () => {
  let disposable: Awaited<ReturnType<typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres>>;
  let sql: import("postgres").Sql;
  let db: import("../db").DrizzleDB;
  let schema: typeof import("../../drizzle/schema");
  let closeDb: typeof import("../db").closeDb;
  const previous = { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV, LLM_ENCRYPTION_KEY: process.env.LLM_ENCRYPTION_KEY };
  let targetRowId: string;
  let actorUserId: number;

  beforeAll(async () => {
    const { createSpec277DisposablePostgres } = await import("./__tests__/support/spec277DisposablePostgres");
    const { installSpec277AutoTeamRuntimeSchema } = await import("./__tests__/support/spec277AutoTeamRuntimeSchema");
    disposable = await createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.LLM_ENCRYPTION_KEY = "origin-config-disposable-test-key";
    sql = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    schema = await import("../../drizzle/schema");
    await installSpec277AutoTeamRuntimeSchema(sql, [schema.users, schema.tenants, schema.providerDeploymentTargets, schema.providerDeploymentCredentials, schema.systemSettings]);
    const database = await import("../db"); db = database.getDb(); closeDb = database.closeDb;
    const [actor] = await db.insert(schema.users).values({ openId: "origin-config-fixture", role: "admin", plan: "free", credits: 0 }).returning();
    actorUserId = actor!.id;
    await db.insert(schema.tenants).values({ id: identity.tenantId, slug: identity.tenantId, name: "Disposable Origin Test" });
    const { createProviderDeploymentTarget } = await import("./providerDeploymentTargetAuthority");
    const target = await createProviderDeploymentTarget(db, { identity, deploymentTargetId: "smartspec-cloudflare-staging",
      workerRef: "smartspec-cloudflare-staging", accountRef: "0123456789abcdef0123456789abcdef", provenance: "disposable origin test" });
    if (target.status !== "CREATED") throw new Error("DISPOSABLE_TARGET_SETUP_FAILED");
    targetRowId = target.target.id;
  }, 30_000);
  afterAll(async () => {
    if (closeDb) await closeDb();
    if (sql) await sql.end({ timeout: 5 });
    if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }, 20_000);

  it("binds native resources only to an exact succeeded canonical provision receipt and rechecks it before resolving secrets", async () => {
    const plan = { namespace: nativeProvisionNamespace(identity.tenantId, identity.projectId), vectorDimensions: 768 as const,
      vectorMetric: "cosine" as const, configurationExpiresAt: new Date(Date.now() + 7200_000).toISOString() };
    const nativeResources = { provisionJobId: randomUUID(), plan, planDigest: nativeProvisionPlanDigest(plan), queueId: "b".repeat(32) };
    const names = nativeResourceNames(plan);
    const outputJson = { accountRef: "0123456789abcdef0123456789abcdef", namespace: plan.namespace, queue: { name: names.queue, id: nativeResources.queueId },
      bucket: { name: names.bucket }, vector: { name: names.vector }, metadataIndexes: ["tenantId", "sourceJobId"],
      providerConfigurationVerified: true, activation: "disabled", jobHandlerQualified: false };
    await db.insert(schema.workerJobs).values({ id: nativeResources.provisionJobId, tenantId: identity.tenantId, requestedByUserId: actorUserId,
      runtimeType: "node_job_worker", jobType: "cloudflare.staging.native.provision", contractVersion: "cloudflare-staging-native-provision-v1", status: "failed",
      inputJson: { contractVersion: "cloudflare-staging-native-provision-v1", grantRef: randomUUID(), projectId: identity.projectId, planDigest: nativeResources.planDigest }, outputJson });
    const input = { identity, settings: { ...settings(), nativeResources }, secrets, actorUserId };
    await expect(saveCloudflareOriginConfiguration(db, input)).rejects.toThrow("RECEIPT_DENIED");
    await db.update(schema.workerJobs).set({ status: "succeeded" }).where(eq(schema.workerJobs.id, nativeResources.provisionJobId));
    await expect(saveCloudflareOriginConfiguration(db, { ...input, actorUserId: actorUserId + 1 })).rejects.toThrow("RECEIPT_DENIED");
    const saved = await saveCloudflareOriginConfiguration(db, input);
    expect(saved.descriptor.nativeResources).toEqual(nativeResources);
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    const request = { identity, configurationRef: saved.configurationRef, configurationDigest: saved.configurationDigest }, operation = vi.fn(async () => true);
    await expect(withCloudflareOriginConfiguration(db, request, operation)).resolves.toBe(true);
    await db.update(schema.workerJobs).set({ outputJson: { ...outputJson, accountRef: "f".repeat(32) } }).where(eq(schema.workerJobs.id, nativeResources.provisionJobId));
    await expect(withCloudflareOriginConfiguration(db, request, operation)).rejects.toThrow("RECEIPT_DENIED");
    expect(operation).toHaveBeenCalledOnce();
    await db.update(schema.workerJobs).set({ outputJson }).where(eq(schema.workerJobs.id, nativeResources.provisionJobId));
    const { PRIVATE_DATABASE_JOB, PRIVATE_DATABASE_CONTRACT, privateDatabasePlanDigest } = await import("./cloudflarePrivateDatabaseContract");
    const privatePlan = { namespace: plan.namespace, hostname: "db-staging.smartaihub.app" as const, zoneId: "a".repeat(32),
      tunnelId: randomUUID(), databaseName: "disposable_database", caSha256: "b".repeat(64), connectionLimit: 5 as const,
      configurationExpiresAt: plan.configurationExpiresAt };
    const privateDatabase = { provisionJobId: randomUUID(), plan: privatePlan, planDigest: privateDatabasePlanDigest(privatePlan),
      hyperdriveId: "c".repeat(32), caId: randomUUID(), accessApplicationId: randomUUID(), accessPolicyId: randomUUID(), serviceTokenId: randomUUID(), dnsRecordId: "d".repeat(32) };
    await db.insert(schema.workerJobs).values({ id: privateDatabase.provisionJobId, tenantId: identity.tenantId, requestedByUserId: actorUserId,
      runtimeType: "node_job_worker", jobType: PRIVATE_DATABASE_JOB, contractVersion: PRIVATE_DATABASE_CONTRACT, status: "succeeded",
      inputJson: { contractVersion: PRIVATE_DATABASE_CONTRACT, grantRef: randomUUID(), projectId: identity.projectId, planDigest: privateDatabase.planDigest },
      outputJson: { ...privateDatabase, accountRef: outputJson.accountRef, namespace: plan.namespace, hostname: privatePlan.hostname, tunnelId: privatePlan.tunnelId,
        serviceTokenId: "[REDACTED]", sslmode: "verify-full", cachingDisabled: true, providerConfigurationVerified: true,
        activation: "disabled", databaseAccess: "read_only_connection_probe" } });
    const privateInput = { ...input, settings: { ...input.settings, nativeResources: { ...nativeResources, privateDatabase } } };
    await expect(saveCloudflareOriginConfiguration(db, privateInput)).rejects.toThrow();
    const { encrypt } = await import("./crypto");
    await db.insert(schema.systemSettings).values({ category: "cloudflare_private_database_runs", key: privateDatabase.provisionJobId,
      isSensitive: true, updatedBy: actorUserId, value: encrypt(JSON.stringify({ planDigest: privateDatabase.planDigest,
        hyperdriveId: privateDatabase.hyperdriveId, caId: privateDatabase.caId, appId: privateDatabase.accessApplicationId,
        policyId: privateDatabase.accessPolicyId, dnsRecordId: privateDatabase.dnsRecordId,
        serviceToken: { id: privateDatabase.serviceTokenId, clientId: "disposable-client-id", secret: "disposable-client-secret", expiresAt: privatePlan.configurationExpiresAt } })) });
    const privateSaved = await saveCloudflareOriginConfiguration(db, privateInput);
    await expect(getCloudflareOriginConfiguration(db, { identity, configurationRef: privateSaved.configurationRef })).resolves.toMatchObject({ status: "STORED" });
    await expect(saveCloudflareOriginConfiguration(db, { ...privateInput,
      settings: { ...privateInput.settings, runnerReleaseCatalog: "hyperdrive" } })).rejects.toThrow("DENIED");
    const publicPlan = { ...privatePlan, publicRunnerCatalogSourceJobId: privateDatabase.provisionJobId };
    const publicDatabase = { ...privateDatabase, provisionJobId: randomUUID(), plan: publicPlan, planDigest: privateDatabasePlanDigest(publicPlan) };
    const publicCatalog = { viewName: `sah_cf_releases_${plan.namespace.slice(-12)}`, sourceProvisionJobId: privateDatabase.provisionJobId, definitionSha256: "e".repeat(64) };
    const [probeReceipt] = await db.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, privateDatabase.provisionJobId));
    await db.insert(schema.workerJobs).values({ id: publicDatabase.provisionJobId, tenantId: identity.tenantId, requestedByUserId: actorUserId,
      runtimeType: "node_job_worker", jobType: PRIVATE_DATABASE_JOB, contractVersion: PRIVATE_DATABASE_CONTRACT, status: "succeeded",
      inputJson: { contractVersion: PRIVATE_DATABASE_CONTRACT, grantRef: randomUUID(), projectId: identity.projectId, planDigest: publicDatabase.planDigest },
      outputJson: { ...probeReceipt.outputJson as Record<string, unknown>, planDigest: publicDatabase.planDigest, databaseAccess: "read_only_public_runner_catalog", publicCatalog } });
    await db.insert(schema.systemSettings).values({ category: "cloudflare_private_database_runs", key: publicDatabase.provisionJobId,
      isSensitive: true, updatedBy: actorUserId, value: encrypt(JSON.stringify({ planDigest: publicDatabase.planDigest, publicCatalog,
        hyperdriveId: privateDatabase.hyperdriveId, caId: privateDatabase.caId, appId: privateDatabase.accessApplicationId,
        policyId: privateDatabase.accessPolicyId, dnsRecordId: privateDatabase.dnsRecordId,
        serviceToken: { id: privateDatabase.serviceTokenId, clientId: "disposable-client-id", secret: "disposable-client-secret", expiresAt: privatePlan.configurationExpiresAt } })) });
    const catalogSaved = await saveCloudflareOriginConfiguration(db, { ...privateInput,
      settings: { ...privateInput.settings, nativeResources: { ...nativeResources, privateDatabase: publicDatabase }, runnerReleaseCatalog: "hyperdrive" } });
    const catalogMetadata = await getCloudflareOriginConfiguration(db, { identity, configurationRef: catalogSaved.configurationRef });
    expect(catalogMetadata.descriptor.runnerReleaseCatalog).toBe("hyperdrive");
    expect(catalogMetadata.descriptor.workflowExecution).toBeUndefined();
    expect(JSON.stringify(catalogMetadata)).not.toContain(secrets.token);
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: catalogSaved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await expect(withCloudflareOriginConfiguration(db, { identity, configurationRef: catalogSaved.configurationRef,
      configurationDigest: catalogSaved.configurationDigest }, async value => value.descriptor.runnerReleaseCatalog)).resolves.toBe("hyperdrive");
    await db.update(schema.systemSettings).set({ updatedBy: actorUserId + 1 }).where(eq(schema.systemSettings.key, privateDatabase.provisionJobId));
    await expect(getCloudflareOriginConfiguration(db, { identity, configurationRef: privateSaved.configurationRef })).rejects.toThrow();
  });

  it("stores HTTP API secrets encrypted only after both canonical image receipts succeed", async () => {
    const { HTTP_IMAGE_PROVISION_CONTRACT, HTTP_IMAGE_PROVISION_JOB } = await import("./cloudflareHttpImageProvisionContract");
    const namespace = nativeProvisionNamespace(identity.tenantId, identity.projectId), accountRef = "0123456789abcdef0123456789abcdef";
    const descriptor = (runtime: string) => ({ provisionJobId: randomUUID(), planDigest: (runtime === "node" ? "a" : "b").repeat(64),
      image: `registry.cloudflare.com/${accountRef}/${namespace}-${runtime}-http@sha256:${"c".repeat(64)}` });
    const applicationHttp = { mode: "private-canary" as const, namespace, sourceSha: "d".repeat(40), node: descriptor("node"), python: descriptor("python"),
      issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic" as const };
    const httpSecrets = { node: { JWT_SECRET: "disposable-node-secret" }, python: { SECRET_KEY: "disposable-python-secret" } };
    const input = { identity, settings: { ...settings(), applicationHttp }, secrets: { ...secrets, applicationHttp: httpSecrets, applicationCanaryToken: "disposable-canary-token-12345678901234567890" }, actorUserId };
    for (const runtime of ["node", "python"] as const) {
      const expected = applicationHttp[runtime];
      await db.insert(schema.workerJobs).values({ id: expected.provisionJobId, tenantId: identity.tenantId, requestedByUserId: actorUserId,
        runtimeType: "node_job_worker", jobType: HTTP_IMAGE_PROVISION_JOB, contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, status: runtime === "node" ? "succeeded" : "failed",
        inputJson: { contractVersion: HTTP_IMAGE_PROVISION_CONTRACT, grantRef: randomUUID(), projectId: identity.projectId, planDigest: expected.planDigest },
        outputJson: { schemaVersion: "cloudflare-http-image-receipt-v1", jobId: expected.provisionJobId, planDigest: expected.planDigest,
          sourceSha: applicationHttp.sourceSha, runtime: `${runtime}-http`, accountRef, namespace, image: expected.image,
          registryVerified: true, containerStarts: 0, applicationCreated: false, activation: "disabled" } });
    }
    await expect(saveCloudflareOriginConfiguration(db, input)).rejects.toThrow("RECEIPT_DENIED");
    await db.update(schema.workerJobs).set({ status: "succeeded" }).where(eq(schema.workerJobs.id, applicationHttp.python.provisionJobId));
    const saved = await saveCloudflareOriginConfiguration(db, input);
    const metadata = await getCloudflareOriginConfiguration(db, { identity, configurationRef: saved.configurationRef });
    expect(metadata.descriptor.applicationHttp?.node.image).toBe(applicationHttp.node.image);
    expect(JSON.stringify(metadata)).not.toContain("disposable-node-secret");
    const [stored] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, saved.configurationRef));
    expect(stored!.value).not.toContain("disposable-python-secret"); expect(stored!.valueJson).toBeNull();
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    const request = { identity, configurationRef: saved.configurationRef, configurationDigest: saved.configurationDigest };
    await expect(withCloudflareOriginConfiguration(db, request, async value => value.secrets.applicationHttp?.node.JWT_SECRET)).resolves.toBe("disposable-node-secret");
    const expiredApplicationHttp = { ...applicationHttp, issuedAt: new Date(Date.now() - 120000).toISOString(), expiresAt: new Date(Date.now() - 60000).toISOString() };
    await expect(saveCloudflareOriginConfiguration(db, { ...input, settings: { ...input.settings, applicationHttp: expiredApplicationHttp } })).rejects.toThrow("SCOPE_DENIED");
    const namespaceSaved = await saveCloudflareOriginConfiguration(db, {
      ...input, settings: { ...input.settings, applicationHttp: expiredApplicationHttp, applicationHttpPhase: "namespace-only" }, secrets,
    });
    const namespaceMetadata = await getCloudflareOriginConfiguration(db, { identity, configurationRef: namespaceSaved.configurationRef });
    expect(namespaceMetadata.descriptor.applicationHttpPhase).toBe("namespace-only");
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: namespaceSaved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await expect(withCloudflareOriginConfiguration(db, { identity, configurationRef: namespaceSaved.configurationRef, configurationDigest: namespaceSaved.configurationDigest }, async value => value.secrets.applicationHttp)).resolves.toBeUndefined();
    await expect(saveCloudflareOriginConfiguration(db, { ...input, settings: { ...input.settings, applicationHttp: expiredApplicationHttp,
      applicationHttpPhase: "namespace-only", expiresAt: expiredApplicationHttp.expiresAt }, secrets })).rejects.toThrow();
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await db.update(schema.workerJobs).set({ operatorReviewRequired: true }).where(eq(schema.workerJobs.id, applicationHttp.python.provisionJobId));
    const operation = vi.fn(); await expect(withCloudflareOriginConfiguration(db, request, operation)).rejects.toThrow("RECEIPT_DENIED");
    expect(operation).not.toHaveBeenCalled();
  });

  it("round trips the independently encrypted bounded retention configuration without exposing its token", async () => {
    const retentionToken="disposable-retention-token-not-a-real-secret";
    const saved=await saveCloudflareOriginConfiguration(db,{identity,settings:{...settings(),retentionSchedule:"evidence-retention"},
      secrets:{...secrets,retentionToken},actorUserId});
    const metadata=await getCloudflareOriginConfiguration(db,{identity,configurationRef:saved.configurationRef});
    expect(metadata.descriptor.retentionSchedule).toBe("evidence-retention");
    expect(JSON.stringify(metadata)).not.toContain(retentionToken);
    const [stored]=await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key,saved.configurationRef));
    expect(stored!.isSensitive).toBe(true);expect(stored!.value).not.toContain(retentionToken);
    await db.update(schema.providerDeploymentTargets).set({runtimePolicy:saved.configurationRef}).where(eq(schema.providerDeploymentTargets.id,targetRowId));
    const request={identity,configurationRef:saved.configurationRef,configurationDigest:saved.configurationDigest};
    await expect(withCloudflareOriginConfiguration(db,request,async value=>value.secrets.retentionToken)).resolves.toBe(retentionToken);
    await revokeCloudflareOriginConfiguration(db,{identity,configurationRef:saved.configurationRef,actorUserId});
    await expect(withCloudflareOriginConfiguration(db,request,async()=>true)).rejects.toThrow();
  });

  it("stores provisioning credentials separately without violating or replacing the unique Worker credential scope", async () => {
    const { saveCloudflareDeploymentCredential, withCloudflareDeploymentCredential } = await import("./cloudflareCredentialCenter");
    const { deploymentCredentialRef } = await import("./providerDeploymentTargetAuthority");
    const { saveCloudflareOriginProvisionCredential, createCloudflareOriginProvisionRuntime } = await import("./cloudflareOriginProvisionExecutor");
    await saveCloudflareDeploymentCredential(db, { identity, token: "worker-deploy-disposable-token", actorUserId });
    await saveCloudflareOriginProvisionCredential(db, { identity, token: "ingress-provision-disposable-token", actorUserId });
    const runtime = createCloudflareOriginProvisionRuntime();
    await expect(runtime.withCredential(identity, async token => token === "ingress-provision-disposable-token")).resolves.toBe(true);
    await expect(withCloudflareDeploymentCredential(db, { identity, credentialRef: deploymentCredentialRef(identity) },
      async token => token === "worker-deploy-disposable-token")).resolves.toMatchObject({ status: "CONFIGURED", value: true });
    await expect(runtime.withCredential({ ...identity, projectId: "other" }, async () => true)).rejects.toThrow("CREDENTIAL_DENIED");
    const rows = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.category, "cloudflare_origin_provision_credentials"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).not.toContain("ingress-provision-disposable-token");
    expect(rows[0]!.valueJson).toBeNull();
    await saveCloudflareOriginProvisionCredential(db, { identity, token: "ingress-provision-replacement-token", actorUserId });
    await expect(runtime.withCredential(identity, async token => token === "ingress-provision-replacement-token")).resolves.toBe(true);
  });

  it("encrypts immutable versions, returns metadata only and requires exact current target/digest before secret resolution", async () => {
    const saved = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets, actorUserId });
    expect(saved).toMatchObject({ status: "STORED", providerAccessVerified: false, deploymentAuthorized: false });
    expect(JSON.stringify(saved)).not.toContain(secrets.token);
    expect(saved.configurationRef.length).toBeLessThan(128);
    const [row] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, saved.configurationRef));
    expect(row!.isSensitive).toBe(true); expect(row!.valueJson).toBeNull();
    expect(row!.value).not.toContain(secrets.token); expect(row!.value).not.toContain(secrets.secret);
    const request = { identity, configurationRef: saved.configurationRef, configurationDigest: saved.configurationDigest };
    const operation = vi.fn(async value => ({ paired: value.secrets.token === secrets.token }));
    await expect(withCloudflareOriginConfiguration(db, request, operation)).rejects.toThrow("DENIED");
    expect(operation).not.toHaveBeenCalled();
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await expect(withCloudflareOriginConfiguration(db, request, operation)).resolves.toEqual({ paired: true });
    for (const changes of [{ identity: { ...identity, tenantId: "other" } }, { identity: { ...identity, projectId: "other" } }, { configurationDigest: "0".repeat(64) }]) {
      await expect(withCloudflareOriginConfiguration(db, { ...request, ...changes }, operation)).rejects.toThrow("DENIED");
    }
    expect(operation).toHaveBeenCalledOnce();
    await revokeCloudflareOriginConfiguration(db, { identity, configurationRef: saved.configurationRef, actorUserId });
    expect((await getCloudflareOriginConfiguration(db, request)).status).toBe("REVOKED");
    await expect(withCloudflareOriginConfiguration(db, request, operation)).rejects.toThrow("DENIED");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("retains prior versions and refuses plaintext or ambiguous duplicate settings", async () => {
    const first = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets, actorUserId });
    const second = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets, actorUserId });
    expect(first.configurationRef).not.toBe(second.configurationRef);
    expect((await getCloudflareOriginConfiguration(db, { identity, configurationRef: first.configurationRef })).status).toBe("STORED");
    const [row] = await db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, second.configurationRef));
    await db.insert(schema.systemSettings).values({ category: row!.category, key: row!.key, value: row!.value, isSensitive: true });
    await expect(getCloudflareOriginConfiguration(db, { identity, configurationRef: second.configurationRef })).rejects.toThrow("DENIED");
    await db.update(schema.systemSettings).set({ isSensitive: false }).where(eq(schema.systemSettings.key, first.configurationRef));
    await expect(getCloudflareOriginConfiguration(db, { identity, configurationRef: first.configurationRef })).rejects.toThrow("DENIED");
  });

  it("resolves a retained rollback version only under the exact active transition and rejects revocation", async () => {
    const old = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets, actorUserId });
    const current = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets: { ...secrets, secret: "fixture-replacement-secret" }, actorUserId });
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: current.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    const scope = { identity, configurationRef: old.configurationRef, configurationDigest: old.configurationDigest, activeConfigurationRef: current.configurationRef };
    const operation = vi.fn(async value => ({ priorSecret: value.secrets.secret === secrets.secret }));
    await expect(withCloudflareOriginConfiguration(db, scope, operation)).rejects.toThrow("DENIED");
    await expect(withCloudflareOriginConfigurationForTransition(db, scope, operation)).resolves.toEqual({ priorSecret: true });
    for (const change of [{ activeConfigurationRef: old.configurationRef }, { configurationDigest: "0".repeat(64) }, { identity: { ...identity, tenantId: "foreign" } }]) {
      await expect(withCloudflareOriginConfigurationForTransition(db, { ...scope, ...change }, operation)).rejects.toThrow("DENIED");
    }
    await revokeCloudflareOriginConfiguration(db, { identity, configurationRef: old.configurationRef, actorUserId });
    await expect(withCloudflareOriginConfigurationForTransition(db, scope, operation)).rejects.toThrow("DENIED");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("rejects expired versions and a disabled or rebound target", async () => {
    const saved = await saveCloudflareOriginConfiguration(db, { identity, settings: settings(), secrets, actorUserId });
    const scope = { identity, configurationRef: saved.configurationRef, configurationDigest: saved.configurationDigest };
    const operation = vi.fn();
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef, enabled: false }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await expect(withCloudflareOriginConfiguration(db, scope, operation)).rejects.toThrow("DENIED");
    await db.update(schema.providerDeploymentTargets).set({ enabled: true, accountRef: "f".repeat(32) }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    await expect(withCloudflareOriginConfiguration(db, scope, operation)).rejects.toThrow("DENIED");
    await db.update(schema.providerDeploymentTargets).set({ accountRef: "0123456789abcdef0123456789abcdef" }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    const future = Date.now() + 7_200_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(future);
    try {
      expect((await getCloudflareOriginConfiguration(db, scope)).status).toBe("EXPIRED");
      await expect(withCloudflareOriginConfiguration(db, scope, operation)).rejects.toThrow("DENIED");
    } finally { clock.mockRestore(); }
    expect(operation).not.toHaveBeenCalled();
  });
});
