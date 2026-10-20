import { describe, expect, it, vi } from "vitest";
import { originProvisionPlanDigest, type OriginProvisionGrant } from "./cloudflareOriginProvisionContract";
import { OriginProvisionError, provisionCloudflareOrigin, type OriginProvisionCheckpoint } from "./cloudflareOriginProvisionTransport";

function fixture() {
  const appId = "11111111-1111-4111-8111-111111111111";
  const tokenId = "22222222-2222-4222-8222-222222222222";
  const policyId = "33333333-3333-4333-8333-333333333333";
  const plan = { hostname: "origin-staging.smartaihub.app" as const, zoneId: "b".repeat(32),
    tunnelId: "44444444-4444-4444-8444-444444444444", teamName: "test-team",
    publicOrigin: "https://smartspec-cloudflare-staging.test.workers.dev", configurationExpiresAt: new Date(Date.now() + 86400_000).toISOString() };
  const grant: OriginProvisionGrant = { schemaVersion: "cloudflare.staging-origin-provision-grant.v1",
    grantRef: "55555555-5555-4555-8555-555555555555", jobId: "66666666-6666-4666-8666-666666666666",
    tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1, executorId: "cf-staging-executor:test",
    targetId: "smartspec-cloudflare-staging", environment: "staging", accountRef: "a".repeat(32),
    actions: ["provision"], expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null,
    plan, planDigest: originProvisionPlanDigest(plan) };
  const marker = `SmartAIHub staging ${grant.planDigest.slice(0, 32)}`;
  const app = { id: appId, aud: "test-audience", name: marker, domain: plan.hostname, type: "self_hosted" };
  const token = { id: tokenId, name: marker, client_id: "client-id-for-test-only", client_secret: "service-secret-for-test-only",
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() };
  let policy: any;
  let dns: any;
  const writes: string[] = [];
  let saved: OriginProvisionCheckpoint = { planDigest: grant.planDigest };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      writes.push(path);
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/access/apps")) return Response.json({ success: true, result: app });
      if (path.endsWith("/service_tokens")) return Response.json({ success: true, result: token });
      if (path.endsWith("/policies")) { policy = { ...body, id: policyId }; return Response.json({ success: true, result: policy }); }
      if (path.endsWith("/dns_records")) { dns = { ...body, id: "c".repeat(32) }; return Response.json({ success: true, result: dns }); }
    }
    let result: any;
    if (path.endsWith(`/zones/${plan.zoneId}`)) result = { name: "smartaihub.app", account: { id: grant.accountRef } };
    else if (path.endsWith(`/cfd_tunnel/${plan.tunnelId}`)) result = { id: plan.tunnelId, config_src: "local" };
    else if (path.endsWith("/organizations")) result = { auth_domain: `${plan.teamName}.cloudflareaccess.com` };
    else if (path.endsWith(`/apps/${appId}`)) result = app;
    else if (path.endsWith(`/service_tokens/${tokenId}`)) result = token;
    else if (path.endsWith("/policies")) result = policy ? [policy] : [];
    else if (path.endsWith(`/dns_records/${"c".repeat(32)}`)) result = dns;
    else result = [];
    return Response.json({ success: true, result });
  }) as unknown as typeof fetch;
  const saveCheckpoint = vi.fn(async state => { saved = structuredClone(state); });
  const assertAuthorized = vi.fn(async () => undefined);
  const saveConfiguration = vi.fn(async () => ({ configurationRef: `cf-origin:${"d".repeat(64)}`, configurationDigest: "d".repeat(64) }));
  const input = { grant, token: "provider-token-test-only", checkpoint: saved, fetchImpl, saveCheckpoint, assertAuthorized, saveConfiguration };
  return { input, writes, state: () => saved, token, app, setPolicy: (value: any) => { policy = value; } };
}

describe("bounded staging origin provisioning", () => {
  it("creates four exact resources, captures secrets privately and verifies readbacks", async () => {
    const f = fixture();
    const output = await provisionCloudflareOrigin(f.input);
    expect(f.writes).toHaveLength(4);
    expect(f.writes.every(path => path.startsWith(`/client/v4/accounts/${f.input.grant.accountRef}/access/`) || path === `/client/v4/zones/${f.input.grant.plan.zoneId}/dns_records`)).toBe(true);
    expect(output).toMatchObject({ providerConfigurationVerified: true, originRuntimeVerified: false, workerDeployed: false });
    expect(JSON.stringify(output)).not.toContain(f.token.client_secret);
    expect(JSON.stringify(output)).not.toContain(f.state().token);
    expect(f.input.assertAuthorized.mock.calls.length).toBeGreaterThanOrEqual(11);
    expect(f.state().serviceToken?.secret).toBe(f.token.client_secret);
    expect(f.state().pending).toBeUndefined();
    expect(f.input.saveConfiguration).toHaveBeenCalledWith(expect.objectContaining({ clientId: f.token.client_id, secret: f.token.client_secret }));
    await provisionCloudflareOrigin({ ...f.input, checkpoint: f.state() });
    expect(f.writes).toHaveLength(4);
    expect(f.input.saveConfiguration).toHaveBeenCalledTimes(1);
  });

  it("stops before the next write when live authority is revoked", async () => {
    const f = fixture();
    f.input.assertAuthorized.mockImplementation(async () => { if (f.writes.length) throw Error("REVOKED"); });
    await expect(provisionCloudflareOrigin(f.input)).rejects.toThrow("REVOKED");
    expect(f.writes).toHaveLength(1);
  });

  it("classifies an ambiguous write for operator review instead of ordinary automatic retry", () => {
    expect(new OriginProvisionError("ORIGIN_PROVISION_AMBIGUOUS_WRITE_REVIEW_REQUIRED").class).toBe("unknown");
    expect(new OriginProvisionError("ORIGIN_PROVISION_HTTP_403").class).toBe("permanent");
  });

  it("does not retry an ambiguous service-token creation or lose its intent", async () => {
    const f = fixture();
    const original = f.input.fetchImpl;
    f.input.fetchImpl = (async (url, init) => {
      if (init?.method === "POST" && String(url).endsWith("/service_tokens")) throw Error("CONNECTION_CLOSED");
      return original(url, init);
    }) as typeof fetch;
    await expect(provisionCloudflareOrigin(f.input)).rejects.toThrow("AMBIGUOUS_WRITE");
    expect(f.state().pending).toBe("service-token.create");
    const count = f.writes.length;
    await expect(provisionCloudflareOrigin({ ...f.input, checkpoint: f.state() })).rejects.toThrow("AMBIGUOUS_WRITE");
    expect(f.writes).toHaveLength(count);
  });

  it("rejects another hostname or a modified plan before all provider calls", async () => {
    const f = fixture();
    await expect(provisionCloudflareOrigin({ ...f.input, grant: { ...f.input.grant,
      plan: { ...f.input.grant.plan, hostname: "smartaihub.app" as never } } })).rejects.toThrow();
    expect(f.input.fetchImpl).not.toHaveBeenCalled();
    await expect(provisionCloudflareOrigin({ ...f.input, grant: { ...f.input.grant,
      plan: { ...f.input.grant.plan, zoneId: "f".repeat(32) } } })).rejects.toThrow();
    expect(f.input.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a broadened Access policy before exposing DNS", async () => {
    const f = fixture();
    const original = f.input.fetchImpl;
    f.input.fetchImpl = (async (url, init) => {
      const response = await original(url, init);
      if (init?.method === "POST" && String(url).endsWith("/policies"))
        f.setPolicy({ id: "33333333-3333-4333-8333-333333333333", decision: "bypass" });
      return response;
    }) as typeof fetch;
    await expect(provisionCloudflareOrigin(f.input)).rejects.toThrow("SERVICE_AUTH_DENIED");
    expect(f.writes.some(path => path.includes("dns_records"))).toBe(false);
  });
});
