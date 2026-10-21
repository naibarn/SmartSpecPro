import { describe, expect, it, vi } from "vitest";
import { handleApplicationHttpCanary, APPLICATION_HTTP_CANARY_PREFIX as PREFIX } from "./applicationHttpCanary";
function fixture() {
  const profile = { configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "node-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic", networkAccess: "application-outbound" };
  const token = "fixture-canary-" + "c".repeat(32), fetch = vi.fn(async () => Response.json({ actual: "app" }, { headers: { "set-cookie": "session=fixture" } }));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env = { CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_APPLICATION_CANARY_TOKEN: token,
    CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile), CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify({ ...profile, runtime: "python-http", image: profile.image.replace("-node-http@", "-python-http@") }),
    NODE_HTTP: namespace, PYTHON_HTTP: namespace };
  const request = (path: string, init: RequestInit = {}) => new Request("https://staging.example" + PREFIX + path,
    { ...init, headers: { "x-smartaihub-application-canary-token": token, ...init.headers } });
  return { env, namespace, fetch, request, profile };
}
describe("bounded read-only API migration canary", () => {
  it("reads lifecycle diagnostics through a fixed RPC without forwarding a request or booting a VM", async () => {
    const f = fixture(), diagnostics = vi.fn(async () => ({ running: false, starts: 0 }));
    f.namespace.get.mockReturnValue({ fetch: f.fetch, diagnostics } as never);
    const response = await handleApplicationHttpCanary(f.request("node/status"), f.env);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ running: false, starts: 0 });
    expect(diagnostics).toHaveBeenCalledOnce(); expect(f.fetch).not.toHaveBeenCalled();
    expect(f.namespace.idFromName).toHaveBeenCalledWith("smartspec-cloudflare-staging:node-http");
    f.namespace.get.mockClear();
    expect((await handleApplicationHttpCanary(f.request("node/status", { headers: { "x-smartaihub-application-canary-token": "invalid" } }), f.env)).status).toBe(404);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("requires the distinct canary credential before resolving any paid namespace", async () => {
    const f = fixture();
    for (const token of ["", "wrong", "a".repeat(5000)]) {
      expect((await handleApplicationHttpCanary(f.request("node/health", { headers: { "x-smartaihub-application-canary-token": token } }), f.env)).status).toBe(404);
    }
    expect((await handleApplicationHttpCanary(f.request("node/health"), { ...f.env, CLOUDFLARE_ENVIRONMENT: "production" })).status).toBe(404);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it.each(["node/auth", "python/auth", "python/database"])("forwards only app credentials to the fixed %s probe", async path => {
    const f = fixture();
    const result = await handleApplicationHttpCanary(f.request(path, { headers: { authorization: "Bearer actual-user-fixture",
      "x-internal-token": "forged", "x-forwarded-for": "127.0.0.1", "cf-access-client-secret": "forged" } }), f.env);
    expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(result.headers.has("set-cookie")).toBe(false);
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.headers.get("authorization")).toBe("Bearer actual-user-fixture");
    for (const header of ["x-smartaihub-application-canary-token", "x-internal-token", "x-forwarded-for", "cf-access-client-secret"]) expect(forwarded.headers.has(header)).toBe(false);
    expect(forwarded.url).toBe(path === "node/auth" ? "http://127.0.0.1:3000/trpc/auth.me" : path === "python/auth" ? "http://127.0.0.1:8000/api/v1/auth/me" : "http://127.0.0.1:8000/health");
  });
  it("does not accept arbitrary paths, query selectors, writes or upgrades", async () => {
    const f = fixture();
    for (const request of [f.request("node/api/admin"), f.request("node/health?url=https://foreign"),
      f.request("node/health", { method: "POST", body: "write" }), f.request("node/health", { headers: { upgrade: "websocket" } })]) {
      expect([404, 405]).toContain((await handleApplicationHttpCanary(request, f.env)).status);
    }
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
  it("denies an expired deployment capability before any namespace access", async () => {
    const f = fixture();f.env.CLOUDFLARE_NODE_HTTP_PROFILE = JSON.stringify({ ...f.profile, expiresAt: f.profile.issuedAt });
    expect((await handleApplicationHttpCanary(f.request("node/health"), f.env)).status).toBe(503);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
});
