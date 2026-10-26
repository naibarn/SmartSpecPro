import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

const fixture = vi.hoisted(() => ({ bundle: undefined as any }));
vi.mock("./cloudflareStagingArtifactAuthority", async original => ({
  ...(await original<any>()),
  resolveCloudflareStagingBundle: async () => fixture.bundle,
}));
const suite = process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true" ? describe : describe.skip;
suite("Production origin runtime adapter with encrypted PostgreSQL authority and real version transport", () => {
  let disposable: any, sql: any, db: any, schema: typeof import("../../drizzle/schema");
  let closeDb: () => Promise<void>, actorUserId: number, targetRowId: string;
  const previous = Object.fromEntries(["DATABASE_URL", "NODE_ENV", "LLM_ENCRYPTION_KEY"].map(k => [k, process.env[k]]));
  const identity = { tenantId: "origin-adapter-fixture", projectId: "project-a", environment: "production", provider: "cloudflare" };
  const sourceSha = "a".repeat(40), versionId = "22222222-2222-4222-8222-222222222222";
  beforeAll(async () => {
    disposable = await (await import("./__tests__/support/spec277DisposablePostgres")).createSpec277DisposablePostgres();
    Object.assign(process.env, { DATABASE_URL: disposable.databaseUrl, NODE_ENV: "test", LLM_ENCRYPTION_KEY: "isolated-origin-adapter-test-key" });
    sql = (await import("postgres")).default(disposable.databaseUrl, { max: 2 });
    schema = await import("../../drizzle/schema");
    await (await import("./__tests__/support/spec277AutoTeamRuntimeSchema")).installSpec277AutoTeamRuntimeSchema(sql,
      [schema.users, schema.tenants, schema.providerDeploymentTargets, schema.providerDeploymentCredentials, schema.systemSettings]);
    const database = await import("../db"); db = database.getDb(); closeDb = database.closeDb;
    const [actor] = await db.insert(schema.users).values({ openId: "origin-adapter-owner", role: "admin" }).returning(); actorUserId = actor.id;
    await db.insert(schema.tenants).values({ id: identity.tenantId, slug: identity.tenantId, name: "Isolated adapter test" });
    const result = await (await import("./providerDeploymentTargetAuthority")).createProviderDeploymentTarget(db, {
      identity, deploymentTargetId: "smartspec-cloudflare-runtime", workerRef: "smartspec-cloudflare-runtime",
      accountRef: "b".repeat(32), provenance: "isolated integration fixture",
    });
    if (result.status !== "CREATED") throw new Error("FIXTURE_TARGET_SETUP_FAILED"); targetRowId = result.target.id;
    const bytes = new TextEncoder().encode("export default {fetch(){return new Response('fixture')}}");
    const asset = new TextEncoder().encode("<html>fixture</html>");
    const manifest = [["modules/index.js", bytes], ["public/index.html", asset]].map(([name, data]) => `${name}\0${createHash("sha256").update(data as Uint8Array).digest("hex")}\0${(data as Uint8Array).byteLength}`).join("\n");
    fixture.bundle = { sourceSha, buildDigest: createHash("sha256").update(manifest).digest("hex"), mainModule: "index.js",
      compatibilityDate: "2026-10-17", moduleFiles: { "index.js": { contentType: "application/javascript", bytes } }, assets: { "index.html": { contentType: "text/html", bytes: asset } } };
  }, 30000);
  afterAll(async () => {
    vi.restoreAllMocks(); if (closeDb) await closeDb(); if (sql) await sql.end({ timeout: 5 }); if (disposable) await disposable.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }, 20000);
  async function setup() {
    const saved = await (await import("./cloudflareOriginConfiguration")).saveCloudflareOriginConfiguration(db, {
      identity, actorUserId,
      settings: { origin: "https://origin.fixture.invalid", allowedPublicOrigins: ["https://smartaihub.app", "https://runtime.smartaihub.app"],
        accessApplicationId: "33333333-3333-4333-8333-333333333333", accessTeamName: "fixture-team", accessAudience: "fixture-audience",
        expiresAt: new Date(Date.now() + 3600000).toISOString(), ingressMode: "production-origin-bridge-v1" },
      secrets: { token: "t".repeat(32), clientId: "i".repeat(24), secret: "s".repeat(32), applicationCanaryToken: "p".repeat(32) },
    });
    await db.update(schema.providerDeploymentTargets).set({ runtimePolicy: saved.configurationRef }).where(eq(schema.providerDeploymentTargets.id, targetRowId));
    let metadata: any;
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      let result: any;
      if (path.endsWith("/assets-upload-session")) result = { jwt: "fixture-upload-jwt", buckets: [] };
      else if (path.endsWith("/versions") && init?.method === "POST") {
        metadata = JSON.parse(await ((init.body as FormData).get("metadata") as File).text()); result = { id: versionId };
      } else if (path.endsWith(`/versions/${versionId}`)) result = { id: versionId, annotations: metadata.annotations, resources: { bindings: metadata.bindings } };
      else throw new Error("UNEXPECTED_PROVIDER_OPERATION");
      return new Response(JSON.stringify({ success: true, result }), { status: 200 });
    });
    const runtime = (await import("./cloudflareProductionDeploymentRuntime")).createCloudflareProductionDeploymentRuntime({ fetchImpl })!;
    const target = (await runtime.resolveTarget(identity))!; expect(target.runtimePolicy).toBe(saved.configurationRef);
    const assertMutationAuthorized = vi.fn(async () => undefined);
    const prepare = (value: any) => runtime.prepareVersion({ token: "fixture-provider-token", target,
      artifact: { artifactRef: `sha256:${fixture.bundle.buildDigest}`, sourceSha, buildDigest: fixture.bundle.buildDigest, immutable: true },
      originConfiguration: value, assertMutationAuthorized });
    const execute = (changes = {}) => runtime.withOriginConfiguration({ target, configurationRef: saved.configurationRef,
      configurationDigest: saved.configurationDigest, ...changes, operation: prepare });
    return { saved, target, runtime, prepare, execute, fetchImpl, assertMutationAuthorized };
  }
  it("passes the real encrypted config callback through the runtime adapter into prepareVersion", async () => {
    const f = await setup();
    await expect(f.execute()).resolves.toMatchObject({ versionId, configurationDigest: f.saved.configurationDigest, trafficShifted: false });
    expect(f.assertMutationAuthorized).toHaveBeenCalled();
    expect(f.fetchImpl.mock.calls.every(([url]) => !String(url).includes("/deployments") && !String(url).includes("/zones/"))).toBe(true);
  });
  it("reproduces the old incomplete callback failure without relaxing transport validation", async () => {
    const f = await setup();
    await expect((await import("./cloudflareOriginConfiguration")).withCloudflareOriginConfiguration(db,
      { identity, configurationRef: f.saved.configurationRef, configurationDigest: f.saved.configurationDigest }, f.prepare))
      .rejects.toThrow("CLOUDFLARE_PRODUCTION_ORIGIN_GRANT_REQUIRED");
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(["missing", "mismatched", "revoked", "expired", "wrong-tenant"])("rejects %s configuration before any provider operation", async kind => {
    const f = await setup(); let changes: any = {};
    if (kind === "missing") changes.configurationRef = "";
    if (kind === "mismatched") changes.configurationDigest = "f".repeat(64);
    if (kind === "wrong-tenant") changes.target = { ...f.target, tenantId: "foreign-tenant" };
    if (kind === "revoked") await (await import("./cloudflareOriginConfiguration")).revokeCloudflareOriginConfiguration(db,
      { identity, actorUserId, configurationRef: f.saved.configurationRef });
    if (kind === "expired") vi.spyOn(Date, "now").mockReturnValue(Date.parse(f.saved.descriptor.expiresAt) + 1);
    try { await expect(f.execute(changes)).rejects.toThrow("CONFIGURATION_DENIED"); expect(f.fetchImpl).not.toHaveBeenCalled(); }
    finally { vi.restoreAllMocks(); }
  });
});
