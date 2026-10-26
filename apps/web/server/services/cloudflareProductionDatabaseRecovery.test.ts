import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createProductionDatabaseGrant, type CloudflareProductionDatabaseRuntime } from "./cloudflareProductionDatabaseExecutor";
import { inspectProductionDatabaseRecovery } from "./cloudflareProductionDatabaseRecovery";

function fixture() {
  const jobId = "b9ca8316-1604-4764-a769-d92f46e4c823", tenantId = "tenant-test", projectId = "project-test";
  const { grant, databasePassword } = createProductionDatabaseGrant({ jobId, tenantId, projectId, requesterUserId: 17,
    accountRef: "a".repeat(32), plan: { tunnelId: "191d047e-674a-48f4-b105-b37269c2dad6", databaseHostname: "db.smartaihub.app",
      databaseName: "smartspec", databaseUser: "sah_cf_prod_0123456789ab", vpcTcpPort: 5433, connectionLimit: 5, tlsVerification: "verify_full" } });
  grant.expiresAt = new Date(Date.now() - 60000).toISOString();
  const checkpoint = { jobId, planDigest: grant.planDigest, databasePasswordDigest: createHash("sha256").update(databasePassword).digest("hex"),
    pending: "hyperdrive" as const, vpcServiceId: jobId };
  const service = { service_id: jobId, name: `smartspec-production-postgres-${grant.planDigest.slice(0,12)}`, type: "tcp", app_protocol: "postgresql",
    tcp_port: 5433, host: { hostname: grant.plan.databaseHostname, resolver_network: { tunnel_id: grant.plan.tunnelId } }, tls_settings: { cert_verification_mode: "verify_full" } };
  let hyperdrives: any[] = [];
  let hyperdriveReadback: any = null;
  const fetchImpl = vi.fn<typeof fetch>(async url => new Response(JSON.stringify({ success: true, result:
    String(url).includes("cfd_tunnel") ? { id: grant.plan.tunnelId, status: "healthy" } :
      String(url).includes("/services/") ? service : String(url).match(/\/hyperdrive\/configs\/[^/?]+$/) ? hyperdriveReadback : hyperdrives }), { status: 200 }));
  const runtime = { resolveGrant: async () => ({ grant, databasePassword }), checkpoint: async () => checkpoint,
    resolveTarget: async () => ({ targetId: grant.targetId, accountRef: grant.accountRef, credentialRef: "test" }),
    withCredential: async (_p: string, _t: string, _r: string, op: (token: string) => unknown) => op("test-token"), fetchImpl } as unknown as CloudflareProductionDatabaseRuntime;
  const input = { runtime, jobId, tenantId, projectId, requesterUserId: 17, planDigest: grant.planDigest };
  return { input, grant, checkpoint, service, fetchImpl, setHyperdrives: (value: any[]) => { hyperdrives = value; },
    setCompletedHyperdrive: (value: any) => { Object.assign(checkpoint, { pending: null, hyperdriveId: "abcdefabcdefabcdefabcdefabcdefab" }); hyperdriveReadback = value; hyperdrives = [value]; } };
}
describe("Production database original-checkpoint read-only recovery", () => {
  it("inspects expired authority for identity only and never performs provider writes", async () => {
    const f = fixture();
    await expect(inspectProductionDatabaseRecovery(f.input)).resolves.toMatchObject({ providerReadbackVerified: true, databaseConnectionVerified: false });
    expect(f.fetchImpl).toHaveBeenCalledTimes(3);
    expect(f.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET" && init.redirect === "error")).toBe(true);
  });
  it.each(["tenant", "actor", "revoked", "password", "checkpoint"])("rejects changed %s before provider access", async change => {
    const f = fixture();
    if (change === "tenant") f.input.tenantId = "foreign";
    if (change === "actor") f.input.requesterUserId++;
    if (change === "revoked") f.grant.revokedAt = new Date().toISOString();
    if (change === "password") f.checkpoint.databasePasswordDigest = "0".repeat(64);
    if (change === "checkpoint") f.checkpoint.jobId = "foreign";
    await expect(inspectProductionDatabaseRecovery(f.input)).rejects.toThrow("CLOUDFLARE_");
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("denies changed TLS and uncertain existing Hyperdrive without adopting or mutating", async () => {
    const f = fixture(); f.service.tls_settings.cert_verification_mode = "disabled";
    await expect(inspectProductionDatabaseRecovery(f.input)).rejects.toThrow("READBACK_MISMATCH");
    const next = fixture(); next.setHyperdrives([{ origin: { service_id: next.checkpoint.vpcServiceId } }]);
    await expect(inspectProductionDatabaseRecovery(next.input)).rejects.toThrow("REQUIRES_RECONCILIATION");
  });

  it("reconciles an already-created VPC Hyperdrive after a readback mismatch without provider writes", async () => {
    const f = fixture();
    f.setCompletedHyperdrive({ id: "abcdefabcdefabcdefabcdefabcdefab", name: `smartspec-production-database-${f.grant.planDigest.slice(0, 12)}`,
      origin: { service_id: f.checkpoint.vpcServiceId, database: f.grant.plan.databaseName, user: f.grant.plan.databaseUser, scheme: "postgres" },
      caching: { disabled: true }, origin_connection_limit: 5, mtls: {} });

    await expect(inspectProductionDatabaseRecovery(f.input)).resolves.toMatchObject({
      providerReadbackVerified: true, databaseConnectionVerified: false,
      vpcServiceId: f.checkpoint.vpcServiceId, hyperdriveId: "abcdefabcdefabcdefabcdefabcdefab",
    });
    expect(f.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
});
