import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cloudflareOriginDescriptorDigest } from "./cloudflareOriginVersionBindings";
import { resolveStagingApplicationSecrets } from "./cloudflareStagingApplicationSecrets";
import { encrypt } from "./crypto";
import { HTTP_DATABASE_ORIGIN_CA } from "./cloudflareHttpDatabaseTrust";
import { privateDatabasePlanDigest } from "./cloudflarePrivateDatabaseContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { httpApplicationNamespace } from "./cloudflareHttpApplicationBindings";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest } from "./cloudflareApplicationDatabaseRole";

const previousEncryptionKey = process.env.LLM_ENCRYPTION_KEY;
beforeAll(() => { process.env.LLM_ENCRYPTION_KEY = "staging-secret-resolution-test-encryption-key"; });
afterAll(() => { if (previousEncryptionKey === undefined) delete process.env.LLM_ENCRYPTION_KEY; else process.env.LLM_ENCRYPTION_KEY = previousEncryptionKey; });

function fixture(databaseName = "smartspec", renewedLeaseExpiresAt?: string) {
  const identity = { tenantId: "tenant-fixture", projectId: "project-fixture", provider: "cloudflare" as const, environment: "staging" as const };
  const accountRef = "a".repeat(32), namespace = nativeProvisionNamespace(identity.tenantId, identity.projectId);
  const plan = { namespace, hostname: "db-staging.smartaihub.app" as const, zoneId: "b".repeat(32),
    tunnelId: "11111111-1111-4111-8111-111111111111", databaseName, caSha256: "d3c7e85c91707fc0a12abc5d88266747aa4fa8e7b162f633ffb3c9d989947620",
    connectionLimit: 5 as const, configurationExpiresAt: new Date(Date.now() + (renewedLeaseExpiresAt ? -86_400_000 : 29 * 86_400_000)).toISOString() };
  const privateDatabase: any = { provisionJobId: "22222222-2222-4222-8222-222222222222", plan, planDigest: privateDatabasePlanDigest(plan),
    hyperdriveId: "c".repeat(32), caId: "d".repeat(32), accessApplicationId: "33333333-3333-4333-8333-333333333333",
    accessPolicyId: "44444444-4444-4444-8444-444444444444", serviceTokenId: "55555555-5555-4555-8555-555555555555",
    dnsRecordId: "e".repeat(32) };
  if (renewedLeaseExpiresAt) privateDatabase.leaseRenewal = { jobId: "77777777-7777-4777-8777-777777777777",
    leaseExpiresAt: renewedLeaseExpiresAt, planDigest: "a".repeat(64), sourceConfigurationRef: `cf-origin:${"b".repeat(64)}`,
    sourceConfigurationDigest: "b".repeat(64) };
  const descriptor: any = { schemaVersion: "cloudflare.origin-configuration.v1", versionId: "66666666-6666-4666-8666-666666666666",
    ...identity, accountRef, targetId: "smartspec-cloudflare-staging", origin: "https://origin.example.com",
    allowedPublicOrigins: ["https://staging.example.workers.dev"], accessApplicationId: "77777777-7777-4777-8777-777777777777",
    accessTeamName: "fixture-team", accessAudience: "fixture-audience", expiresAt: renewedLeaseExpiresAt ?? new Date(Date.now() + 29 * 86_400_000).toISOString(),
    nativeResources: { privateDatabase } };
  const configurationRef = `cf-origin:${cloudflareOriginDescriptorDigest(descriptor)}`;
  const sourceSha = "f".repeat(40), imageDigest = "9".repeat(64);
  const applicationHttp = { mode: "private-canary" as const, namespace: httpApplicationNamespace(identity.tenantId, identity.projectId), sourceSha,
    traffic: "staging-full-http-v1" as const,
    node: { provisionJobId: "88888888-8888-4888-8888-888888888888", planDigest: "1".repeat(64), image: `registry.cloudflare.com/${accountRef}/${namespace}-node-http@sha256:${imageDigest}` },
    python: { provisionJobId: "99999999-9999-4999-8999-999999999999", planDigest: "2".repeat(64), image: `registry.cloudflare.com/${accountRef}/${namespace}-python-http@sha256:${imageDigest}` },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 8 * 60_000).toISOString(),
    maxStarts: 2, maxComputeSeconds: 1200, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" as const };
  const applicationDatabaseRolePlan = { tenantId: identity.tenantId, projectId: identity.projectId, databaseName: "smartspec",
    tables: ["users"], sequences: ["users_id_seq"], expiresAt: new Date(Date.now() + (renewedLeaseExpiresAt ? 14 : 28) * 86_400_000).toISOString(), connectionLimit: 10 as const };
  const applicationDatabaseRole = { role: applicationDatabaseRoleName(identity), password: "a".repeat(64),
    planDigest: applicationDatabaseRolePlanDigest(applicationDatabaseRolePlan) };
  const secret = "fixture-secret-at-least-thirty-two-characters";
  const nodeEnvironment = { JWT_SECRET: secret, API_KEY_HMAC_SECRET: secret, LLM_ENCRYPTION_KEY: secret, CONTROL_PLANE_API_KEY: secret,
    DATABASE_URL: "must-not-be-copied", CLOUDFLARE_API_TOKEN: "must-not-be-copied" };
  const pythonEnvironment = { JWT_SECRET: secret, SECRET_KEY: secret, ENCRYPTION_MASTER_KEY: secret, SMARTSPEC_WEB_GATEWAY_TOKEN: secret,
    DATABASE_URL: "must-not-be-copied", PYTHONPATH: "must-not-be-copied" };
  const databaseCheckpoint = { planDigest: privateDatabase.planDigest, databaseRolePrepared: true as const,
    databasePassword: "fixture-database-password-not-real-00000", caId: privateDatabase.caId };
  const certificateInput = { ...identity, actorUserId: 17, planDigest: privateDatabase.planDigest, caCertificate: HTTP_DATABASE_ORIGIN_CA };
  const rows = [
    [{ isSensitive: true, updatedBy: 17, value: encrypt(JSON.stringify({ descriptor, secrets: {}, revokedAt: null })) }],
    [{ isSensitive: true, updatedBy: 17, value: encrypt(JSON.stringify(databaseCheckpoint)) }],
    [{ isSensitive: true, updatedBy: 17, value: encrypt(JSON.stringify(certificateInput)) }],
  ];
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.shift() }) }) }) };
  return { identity, applicationHttp, configurationRef, applicationDatabaseRole, applicationDatabaseRolePlan,
    nodeEnvironment, pythonEnvironment, db };
}

describe("server-side Staging application secret resolution", () => {
  it("composes the prepared application role and runtime allowlist without returning plaintext in the receipt", async () => {
    const f = fixture();
    const result = await resolveStagingApplicationSecrets({ ...f, actorUserId: 17 });
    const database = new URL(result.secrets.node.DATABASE_URL);
    expect(database.hostname).toBe("db-staging.smartaihub.app");
    expect(database.port).toBe("5432");
    expect(database.pathname).toBe("/smartspec");
    expect(database.username).toBe(applicationDatabaseRoleName(f.identity));
    expect(result.secrets.node.CLOUDFLARE_APPLICATION_DATABASE_TRANSPORT).toBe("private-vpc-websocket-v1");
    expect(result.secrets.node.DATABASE_SSL_MODE).toBe("verify-full");
    expect(result.secrets.node).not.toHaveProperty("CLOUDFLARE_API_TOKEN");
    expect(result.secrets.python).not.toHaveProperty("PYTHONPATH");
    expect(JSON.stringify(result.safeReceipt)).not.toContain(database.password);
    expect(JSON.stringify(result.safeReceipt)).not.toContain(f.nodeEnvironment.LLM_ENCRYPTION_KEY);
    expect(result.safeReceipt).toMatchObject({ databaseName: "smartspec", readOnlyRole: false, databaseIdentityVerified: false,
      networkConnectivityVerified: false, writeAcceptance: false });
  });

  it("rejects a database other than the canonical logical database before producing a bundle", async () => {
    const f = fixture("smartspec_dev");
    await expect(resolveStagingApplicationSecrets({ ...f, actorUserId: 17 })).rejects.toThrow("STAGING_HTTP_RUNTIME_SECRET_RESOLUTION_DENIED");
  });

  it("rejects a mismatched or near-expiry application role before producing a bundle", async () => {
    const mismatch = fixture();
    mismatch.applicationDatabaseRole.role = "sah_cf_staging_invalid";
    await expect(resolveStagingApplicationSecrets({ ...mismatch, actorUserId: 17 })).rejects.toThrow("STAGING_HTTP_RUNTIME_SECRET_RESOLUTION_DENIED");
    const short = fixture();
    short.applicationDatabaseRolePlan.expiresAt = new Date(Date.now() + 6 * 86_400_000).toISOString();
    short.applicationDatabaseRole.planDigest = applicationDatabaseRolePlanDigest(short.applicationDatabaseRolePlan);
    await expect(resolveStagingApplicationSecrets({ ...short, actorUserId: 17 })).rejects.toThrow("STAGING_HTTP_RUNTIME_SECRET_RESOLUTION_DENIED");
  });

  it("accepts an expired source plan only when its renewed Staging lease remains valid", async () => {
    const leaseExpiresAt = new Date(Date.now() + 15 * 86_400_000).toISOString();
    const renewed = fixture("smartspec", leaseExpiresAt);
    const result = await resolveStagingApplicationSecrets({ ...renewed, actorUserId: 17 });
    expect(result.safeReceipt.roleExpiresAt).toBe(renewed.applicationDatabaseRolePlan.expiresAt);

    const expiredLease = fixture("smartspec", new Date(Date.now() - 1000).toISOString());
    await expect(resolveStagingApplicationSecrets({ ...expiredLease, actorUserId: 17 }))
      .rejects.toThrow("STAGING_HTTP_RUNTIME_SECRET_RESOLUTION_DENIED");
  });
});
