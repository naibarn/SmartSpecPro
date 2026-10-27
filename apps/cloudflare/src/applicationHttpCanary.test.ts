import { describe, expect, it, vi } from "vitest";
import { handleApplicationHttpCanary, APPLICATION_HTTP_CANARY_PREFIX as PREFIX } from "./applicationHttpCanary";
function fixture() {
  const profile = { configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "node-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic", networkAccess: "application-outbound" };
  const token = "fixture-canary-" + "c".repeat(32), fetch = vi.fn(async (_request: Request) => Response.json({ actual: "app" }, { headers: { "set-cookie": "session=fixture" } }));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env = { CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_APPLICATION_CANARY_TOKEN: token,
    CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile), CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify({ ...profile, runtime: "python-http", image: profile.image.replace("-node-http@", "-python-http@") }),
    NODE_HTTP: namespace, PYTHON_HTTP: namespace };
  const request = (path: string, init: RequestInit = {}) => new Request("https://staging.example" + PREFIX + path,
    { ...init, headers: { "x-smartaihub-application-canary-token": token, ...init.headers } });
  return { env, namespace, fetch, request, profile };
}
describe("bounded read-only API migration canary", () => {
  it("compensates only the exact authenticated runtime without starting or forwarding", async () => {
    const f = fixture(), stop = vi.fn(async () => ({ stopped: true, runtime: "node-http" }));
    f.namespace.get.mockReturnValue({ fetch: f.fetch, stop } as never);
    expect((await handleApplicationHttpCanary(f.request("node/stop", { method: "POST" }), f.env)).status).toBe(200);
    expect(stop).toHaveBeenCalledOnce(); expect(f.fetch).not.toHaveBeenCalled();
    for (const req of [f.request("node/stop?target=other", { method: "POST" }),
      f.request("node/stop", { method: "POST", headers: { "x-smartaihub-application-canary-token": "foreign" } }), f.request("node/stop")])
      expect([404, 405]).toContain((await handleApplicationHttpCanary(req, f.env)).status);
    expect(stop).toHaveBeenCalledOnce();
  });
  it("reads lifecycle diagnostics through a fixed RPC without forwarding a request or booting a VM", async () => {
    const f = fixture(), diagnostics = vi.fn(async () => ({ running: false, starts: 0 }));
    f.namespace.get.mockReturnValue({ fetch: f.fetch, diagnostics } as never);
    const response = await handleApplicationHttpCanary(f.request("node/status"), f.env);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ running: false, starts: 0 });
    expect(diagnostics).toHaveBeenCalledOnce(); expect(f.fetch).not.toHaveBeenCalled();
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-staging:node-http:${f.profile.namespace}`);
    f.namespace.get.mockClear();
    expect((await handleApplicationHttpCanary(f.request("node/status", { headers: { "x-smartaihub-application-canary-token": "invalid" } }), f.env)).status).toBe(404);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("requires the distinct canary credential before resolving any paid namespace", async () => {
    const f = fixture();
    for (const token of ["", "wrong", "a".repeat(5000)]) {
      expect((await handleApplicationHttpCanary(f.request("node/health", { headers: { "x-smartaihub-application-canary-token": token } }), f.env)).status).toBe(404);
    }
    expect((await handleApplicationHttpCanary(f.request("node/health"), { ...f.env, CLOUDFLARE_ENVIRONMENT: "production" })).status).toBe(503);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("reports only fixed bridge categories to the authenticated probe and redacts thrown details", async () => {
    const f = fixture();
    const disabled = await handleApplicationHttpCanary(f.request("node/health"), { ...f.env, CLOUDFLARE_CONTAINER_POLICY: "disabled" });
    expect(await disabled.json()).toEqual({ error: "APPLICATION_HTTP_BRIDGE_DISABLED" });
    f.fetch.mockRejectedValueOnce(new Error("private-provider-detail"));
    const failed = await handleApplicationHttpCanary(f.request("node/health"), f.env);
    expect(await failed.json()).toEqual({ error: "APPLICATION_HTTP_CANARY_UNAVAILABLE" });
  });
  it.each(["node/auth", "node/database", "python/auth", "python/database"])("forwards only app credentials to the fixed %s probe", async path => {
    const f = fixture();
    const result = await handleApplicationHttpCanary(f.request(path, { headers: { authorization: "Bearer actual-user-fixture",
      "x-internal-token": "forged", "x-forwarded-for": "127.0.0.1", "cf-access-client-secret": "forged" } }), f.env);
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(result.headers.has("set-cookie")).toBe(false);
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.headers.get("authorization")).toBe("Bearer actual-user-fixture");
    for (const header of ["x-smartaihub-application-canary-token", "x-internal-token", "x-forwarded-for", "cf-access-client-secret"]) expect(forwarded.headers.has(header)).toBe(false);
    expect(forwarded.url).toBe(path === "node/auth" ? "http://127.0.0.1:3000/trpc/auth.me"
      : path === "node/database" ? "http://127.0.0.1:3000/readyz"
        : path === "python/auth" ? "http://127.0.0.1:8000/api/users/me" : "http://127.0.0.1:8000/health");
  });
  it("does not accept arbitrary paths, query selectors, writes or upgrades", async () => {
    const f = fixture();
    for (const request of [f.request("node/api/admin"), f.request("node/health?url=https://foreign"),
      f.request("node/health", { method: "POST", body: "write" }), f.request("node/health", { headers: { upgrade: "websocket" } })]) {
      expect([404, 405]).toContain((await handleApplicationHttpCanary(request, f.env)).status);
    }
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("runs only the fixed synthetic login/session/tenant-isolation sequence and returns no credentials", async () => {
    const f = fixture();
    const revoked = new Set<string>();
    const jwt = (jti: string) => `header.${btoa(JSON.stringify({ jti })).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.signature`;
    f.fetch.mockImplementation(async (request: Request) => {
      const url = new URL(request.url), cookie = request.headers.get("cookie"), auth = request.headers.get("authorization");
      if (url.pathname === "/trpc/auth.login") {
        const { json } = await request.json() as any;
        if (json.email === "a@example.invalid" && json.password === "BadPassword123x") return Response.json({ error: { data: { code: "UNAUTHORIZED" } } }, { status: 401 });
        if (json.email === "a@example.invalid" && json.password === "PrimaryPassword123") {
          const headers = new Headers();
          headers.append("set-cookie", "pending_2fa_challenge=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly");
          headers.append("set-cookie", `app_session_id=${jwt("test-jti-a")}; HttpOnly`);
          return Response.json({ result: { data: { json: { success: true } } } }, { headers });
        }
        return Response.json({ error: { data: { code: "UNAUTHORIZED" } } }, { status: 401 });
      }
      if (url.pathname === "/trpc/auth.me") {
        return Response.json({ result: { data: { json: cookie === `app_session_id=${jwt("test-jti-a")}`
          && !revoked.has(cookie) ? { id: 1001, currentTenantId: "tenant-a" } : null } } });
      }
      if (url.pathname === "/trpc/credits.balance") return Response.json({ result: { data: { json: { credits: 0, plan: "free" } } } });
      if (url.pathname === "/v1/models") return Response.json({ object: "list", data: [{ id: "fixture-model", object: "model" }] });
      if (url.pathname === "/trpc/tenantFeatureFlags.getFeatureFlags") return Response.json({ error: { data: { code: "FORBIDDEN" } } }, { status: 403 });
      if (url.pathname === "/api/users/me") return Response.json({ id: "1001", email: "a@example.invalid" }, { status: auth === `Bearer ${jwt("test-jti-a")}` ? 200 : 401 });
      if (url.pathname === "/trpc/auth.logout") { if (cookie) revoked.add(cookie); return Response.json({ result: { data: { json: { success: true } } } }); }
      throw new Error("unexpected acceptance path");
    });
    const response = await handleApplicationHttpCanary(f.request("node/application-auth", { method: "POST", body: JSON.stringify({
      version: "application-auth-acceptance-v1",
      primary: { email: "a@example.invalid", password: "PrimaryPassword123", tenantId: "tenant-a", userId: 1001 },
      foreignTenantId: "tenant-b",
    }) }), f.env);
    expect(response.status).toBe(200);
    const receipt = await response.json() as any;
    expect(receipt.passed, JSON.stringify(receipt)).toBe(true);
    expect(receipt.checks).toEqual({ invalidLoginDenied: true, primaryLogin: true, primarySessionTenant: true,
      authenticatedCreditRead: true, authenticatedGatewayModelRouting: true, crossTenantReadDenied: true, pythonAuthenticatedUserRead: true, logout: true,
      revokedSessionDenied: true });
    expect(JSON.stringify(receipt)).not.toMatch(/PrimaryPassword|test-jti-a|example\.invalid/);
    expect(f.fetch).toHaveBeenCalledTimes(9);
    const forwardedLogin = f.fetch.mock.calls.find(([request]) => new URL(request.url).pathname === "/trpc/auth.login")?.[0] as Request;
    expect(forwardedLogin.headers.get("x-smartaihub-application-canary-token")).toBeNull();
    expect(forwardedLogin.url).toBe("http://127.0.0.1:3000/trpc/auth.login");
    const forwardedPython = f.fetch.mock.calls.find(([request]) => new URL(request.url).pathname === "/api/users/me")?.[0] as Request;
    expect(forwardedPython.url).toBe("http://127.0.0.1:8000/api/users/me");
    expect(JSON.stringify(receipt.revocationHashes)).toMatch(/^\["[a-f0-9]{64}"\]$/);
  });
  it("rejects broad or cross-scope application acceptance input before resolving a Container", async () => {
    const f = fixture();
    const response = await handleApplicationHttpCanary(f.request("node/application-auth", { method: "POST", body: JSON.stringify({
      version: "application-auth-acceptance-v1", primary: { email: "a@example.invalid", password: "x", tenantId: "tenant-a", userId: 1001 },
      foreignTenantId: "tenant-a", path: "https://example.com",
    }) }), f.env);
    expect(response.status).toBe(400); expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("rejects oversized acceptance payloads before resolving a Container", async () => {
    const f = fixture();
    const response = await handleApplicationHttpCanary(f.request("node/application-auth", { method: "POST", body: "x".repeat(4097) }), f.env);
    expect(response.status).toBe(400); expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("denies an expired deployment capability before any namespace access", async () => {
    const f = fixture();f.env.CLOUDFLARE_NODE_HTTP_PROFILE = JSON.stringify({ ...f.profile, expiresAt: f.profile.issuedAt });
    expect((await handleApplicationHttpCanary(f.request("node/health"), f.env)).status).toBe(503);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
});
