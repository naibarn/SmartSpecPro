import { describe, expect, it, vi } from "vitest";
import { dispatchApplicationHttpIngress } from "./applicationHttpIngress";
import { classifyApiRoute } from "./apiRouteManifest";
import { createCloudflareWorker } from "./index";

function fixture() {
  const profile = { configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "node-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 120, hardLifetimeSeconds: 120, idleTimeoutSeconds: 10, instance: "basic", networkAccess: "application-outbound" };
  const fetch = vi.fn(async (request: Request) => Response.json({ path: new URL(request.url).pathname }, { headers: { "set-cookie": "session=updated; HttpOnly" } }));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env = { CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: "staging-full-http-v1",
    AUTH_ORIGIN_TOKEN: "staging-origin-token-" + "x".repeat(32), AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://staging.smartaihub.app"]),
    CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile), CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify({ ...profile, runtime: "python-http", image: profile.image.replace("-node-http@", "-python-http@") }),
    NODE_HTTP: namespace, PYTHON_HTTP: namespace };
  return { env, fetch, namespace };
}

describe("staging full HTTP application ingress", () => {
  it("is default-off and leaves the origin route available", async () => {
    const f = fixture();
    const response = await dispatchApplicationHttpIngress(new Request("https://staging.smartaihub.app/trpc/auth.me"),
      classifyApiRoute("GET", "/trpc/auth.me"), { ...f.env, CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: undefined });
    expect(response).toBeNull();
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("forwards origin-classified requests with server-derived edge attestation and preserves method/body/query", async () => {
    const f = fixture();
    const response = await dispatchApplicationHttpIngress(new Request("https://staging.smartaihub.app/trpc/user.update?x=1", {
      method: "POST", headers: { "content-type": "application/json", cookie: "sid=actual; CF_Authorization=access",
        "x-cloudflare-origin-token": "forged", "x-smartaihub-public-origin": "https://evil.example", "x-forwarded-host": "evil.example",
        "cf-access-client-secret": "not-forwarded", "x-internal-token": "forged" }, body: JSON.stringify({ json: { value: 1 } }),
    }), classifyApiRoute("POST", "/trpc/user.update"), f.env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("set-cookie")).toContain("session=updated");
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("http://node.application.internal/trpc/user.update?x=1");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("cookie")).toBe("sid=actual");
    expect(forwarded.headers.get("x-cloudflare-origin-token")).toBe(f.env.AUTH_ORIGIN_TOKEN);
    expect(forwarded.headers.get("x-smartaihub-public-origin")).toBe("https://staging.smartaihub.app");
    expect(forwarded.headers.get("x-forwarded-host")).toBe("staging.smartaihub.app");
    for (const name of ["cf-access-client-secret", "x-internal-token"]) expect(forwarded.headers.has(name)).toBe(false);
  });

  it("connects the origin route manifest to the Container ingress switch", async () => {
    const f = fixture();
    const response = await createCloudflareWorker().fetch(new Request("https://staging.smartaihub.app/trpc/auth.me"), f.env as never);
    expect(response.status).toBe(200);
    expect(new URL((f.fetch.mock.calls[0][0] as Request).url).hostname).toBe("node.application.internal");
  });

  it("fails closed outside staging, for unapproved routes/origins, and on Container errors", async () => {
    const f = fixture();
    const route = classifyApiRoute("POST", "/api/auth/login");
    for (const [url, env, selectedRoute] of [
      ["https://staging.smartaihub.app/api/auth/login", { ...f.env, CLOUDFLARE_ENVIRONMENT: "production" }, route],
      ["https://evil.example/api/auth/login", f.env, route],
      ["https://staging.smartaihub.app/healthz", f.env, classifyApiRoute("GET", "/healthz")],
    ] as const) {
      expect((await dispatchApplicationHttpIngress(new Request(url), selectedRoute, env))?.status).toBe(503);
    }
    f.fetch.mockRejectedValueOnce(new Error("container unavailable"));
    expect((await dispatchApplicationHttpIngress(new Request("https://staging.smartaihub.app/api/auth/login", { method: "POST", body: "{}" }), route, f.env))?.status).toBe(503);
  });

  it("keeps retired runtime paths offline even when the parent API prefix is routed to the Container", async () => {
    const f = fixture();
    const response = await dispatchApplicationHttpIngress(new Request("https://staging.smartaihub.app/api/v1/workflows/run", { method: "POST", body: "{}" }),
      classifyApiRoute("POST", "/api/v1/workflows/run"), f.env);
    expect(response?.status).toBe(410);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
});
