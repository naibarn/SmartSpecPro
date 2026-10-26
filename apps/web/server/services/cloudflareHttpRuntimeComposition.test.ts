import { describe, expect, it } from "vitest";
import { composeHttpRuntime } from "./cloudflareHttpRuntimeComposition";
import { applicationDatabaseRoleName, applicationDatabaseRolePlanDigest } from "./cloudflareApplicationDatabaseRole";
import { httpApplicationNamespace, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";
function fixture() {
  const scope = { tenantId: "tenant-fixture", projectId: "project-fixture", accountRef: "a".repeat(32), environment: "production" as const };
  const namespace = httpApplicationNamespace(scope.tenantId, scope.projectId), image = (runtime: string) => `registry.cloudflare.com/${scope.accountRef}/${namespace}-${runtime}-http@sha256:${"b".repeat(64)}`;
  const settings: HttpApplicationSettings = { mode: "private-canary", namespace: httpApplicationNamespace(scope.tenantId, scope.projectId, "production"),
    sourceSha: "c".repeat(40), node: { provisionJobId: "00000000-0000-4000-8000-000000000001", planDigest: "d".repeat(64), image: image("node") },
    python: { provisionJobId: "00000000-0000-4000-8000-000000000002", planDigest: "e".repeat(64), image: image("python") },
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(), maxStarts: 2, maxComputeSeconds: 1200,
    hardLifetimeSeconds: 600, idleTimeoutSeconds: 10, instance: "basic" };
  const rolePlan = { tenantId: scope.tenantId, projectId: scope.projectId, databaseName: "fixture", tables: ["users", "worker_jobs"], sequences: [],
    expiresAt: new Date(Date.now() + 600_000).toISOString(), connectionLimit: 10 as const };
  const secret = "fixture-application-secret-at-least-32-characters";
  return { scope, settings, rolePlan, configurationRef: `cf-origin:${"f".repeat(64)}`, canaryToken: "c".repeat(64),
    network: { transport: "private-vpc-websocket-v1" as const, canonicalJobId: "original-db-job", vpcServiceId: "original-vpc", hyperdriveId: "original-hyperdrive",
      tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", hostname: "db.smartaihub.app", port: 5433, databaseName: "fixture", providerReadbackVerified: true as const,
      m1Preserved: true as const, applicationRoleRequired: true as const, dnsRequired: false as const, accessApplicationRequired: false as const },
    roleSecret: { role: applicationDatabaseRoleName(scope), password: "a".repeat(64), planDigest: applicationDatabaseRolePlanDigest(rolePlan) },
    nodeEnvironment: { JWT_SECRET: secret, API_KEY_HMAC_SECRET: secret, LLM_ENCRYPTION_KEY: secret, CONTROL_PLANE_API_KEY: secret,
      CLOUDFLARE_API_TOKEN: "never-copy-this-provider-token", DATABASE_URL: "never-copy-the-db-owner-url", NODE_OPTIONS: "never-copy-loader" },
    pythonEnvironment: { JWT_SECRET: secret, SECRET_KEY: secret, ENCRYPTION_MASTER_KEY: secret, SMARTSPEC_WEB_GATEWAY_TOKEN: secret } };
}
describe("bounded native runtime composition", () => {
  it("binds the exact app identity, TLS trust, existing Tunnel and immutable images without exposing secrets in the review summary", () => {
    const f = fixture(), result = composeHttpRuntime(f);
    expect(result.summary).toMatchObject({ transport: "private-vpc-websocket-v1", trafficMutation: false, dnsMutation: false, imagePublication: false, runtimeAcceptance: false });
    const node = new URL(result.secrets.node.DATABASE_URL), python = new URL(result.secrets.python.DATABASE_URL);
    expect(node.username).toBe(f.roleSecret.role); expect(python.username).toBe(node.username); expect(python.protocol).toBe("postgresql+asyncpg:");
    expect(result.vpcNetworks).toEqual([{ binding: "DATABASE_NETWORK", tunnel_id: f.network.tunnelId }]);
    expect(result.secrets.node.DATABASE_SSL_MODE).toBe("verify-full");
    expect(JSON.stringify(result)).not.toMatch(/never-copy/);
    expect(JSON.stringify(result.summary)).not.toContain(f.roleSecret.password);
    expect(result.bindings.filter(b => b.type !== "secret_text").some(b => b.text.includes(f.roleSecret.password))).toBe(false);
    expect(result.bindings.some(b => b.name === "CLOUDFLARE_APPLICATION_HTTP_TRAFFIC")).toBe(false);
  });
  it.each(["foreign-role", "foreign-plan", "expired-role", "missing-node-secret", "missing-python-secret", "test-payment", "unbounded-starts", "traffic", "unbounded-expiry"])("rejects %s before a VM start or provider write", mode => {
    const f = fixture();
    if (mode === "foreign-role") f.roleSecret.role = "sah_cf_app_ffffffffffff";
    if (mode === "foreign-plan") f.roleSecret.planDigest = "0".repeat(64);
    if (mode === "expired-role") { f.rolePlan.expiresAt = new Date(Date.now() - 1000).toISOString(); f.roleSecret.planDigest = applicationDatabaseRolePlanDigest(f.rolePlan); }
    if (mode === "missing-node-secret") f.nodeEnvironment.CONTROL_PLANE_API_KEY = "";
    if (mode === "missing-python-secret") f.pythonEnvironment.SECRET_KEY = "";
    if (mode === "test-payment") Object.assign(f.pythonEnvironment, { STRIPE_SECRET_KEY: "sk_test_fixture" });
    if (mode === "unbounded-starts") f.settings.maxStarts = 3;
    if (mode === "traffic") f.settings.traffic = "production-full-http-v1";
    if (mode === "unbounded-expiry") f.settings.expiresAt = new Date(Date.now() + 900_000).toISOString();
    expect(() => composeHttpRuntime(f)).toThrow(/DENIED|REQUIRED/);
  });
});
