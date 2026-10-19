import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { saveCloudflareOriginConfiguration, getCloudflareOriginConfiguration,
  withCloudflareOriginConfiguration, revokeCloudflareOriginConfiguration } from "./cloudflareOriginConfiguration";

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
    await installSpec277AutoTeamRuntimeSchema(sql, [schema.users, schema.tenants, schema.providerDeploymentTargets, schema.systemSettings]);
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
