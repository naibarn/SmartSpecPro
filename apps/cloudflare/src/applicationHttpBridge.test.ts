import { describe, expect, it, vi } from "vitest";
import { forwardApplicationHttpBridge, prepareApplicationHttpBridgeRequest, type ApplicationHttpBindings } from "./applicationHttpBridge";
import type { ApplicationHttpProfile } from "./applicationHttpContainer";

function fixture() {
  const profile: ApplicationHttpProfile = {
    configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "python-http", accountRef: "a".repeat(32),
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-python-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 60, hardLifetimeSeconds: 60, idleTimeoutSeconds: 10,
    instance: "lite", networkAccess: "application-outbound",
  };
  const fetch = vi.fn(async () => new Response("actual-private-api-response"));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env: ApplicationHttpBindings = { CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
    CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(profile), PYTHON_HTTP: namespace };
  return { profile, env, namespace, fetch };
}

describe("private application HTTP binding", () => {
  it("forwards body, query and existing app credentials to one fixed private namespace", async () => {
    const f = fixture();
    const request = new Request("http://python.application.internal/api/action?tenant=a", { method: "POST", body: "request-payload",
      headers: { authorization: "Bearer real-caller-token", "x-internal-token": "existing-service-token", "x-forwarded-host": "forged.example", "cf-access-client-secret": "do-not-forward", "x-cloudflare-origin-token": "forged-token" } });
    const response = await forwardApplicationHttpBridge(request, "python-http", f.env);
    expect(await response.text()).toBe("actual-private-api-response");
    expect(f.namespace.idFromName).toHaveBeenCalledWith("smartspec-cloudflare-staging:python-http");
    expect(f.fetch).toHaveBeenCalledOnce();
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("http://127.0.0.1:8000/api/action?tenant=a");
    expect(await forwarded.text()).toBe("request-payload");
    expect(forwarded.headers.get("authorization")).toBe("Bearer real-caller-token");
    expect(forwarded.headers.get("x-internal-token")).toBe("existing-service-token");
    for (const header of ["cf-access-client-secret", "x-forwarded-host", "x-cloudflare-origin-token"]) expect(forwarded.headers.has(header)).toBe(false);
  });

  it.each(["https://python.application.internal/path", "http://foreign.example/path", "http://node.application.internal/path", "http://python.application.internal:8000/path"])("rejects a caller-selected destination: %s", async url => {
    const f = fixture();
    await expect(forwardApplicationHttpBridge(new Request(url), "python-http", f.env)).rejects.toThrow("DESTINATION_DENIED");
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("keeps protocol-relative paths as paths and never leaks Access cookies", () => {
    const forwarded = prepareApplicationHttpBridgeRequest(new Request("http://python.application.internal//foreign.example/api", {
      headers: { cookie: "session=app; CF_Authorization=private-access; other=kept" },
    }), "python-http");
    expect(forwarded.url).toBe("http://127.0.0.1:8000//foreign.example/api");
    expect(forwarded.headers.get("cookie")).toContain("session=app");
    expect(forwarded.headers.get("cookie")).not.toContain("CF_Authorization");
  });

  it("routes Python-to-Node calls to the Node namespace and its fixed local port", async () => {
    const f = fixture();
    const profile = { ...f.profile, runtime: "node-http", image: f.profile.image.replace("smartspec-python-http", "smartspec-node-http") };
    await forwardApplicationHttpBridge(new Request("http://node.application.internal/api/internal/read"), "node-http", {
      ...f.env, CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile), NODE_HTTP: f.namespace,
    });
    expect(f.namespace.idFromName).toHaveBeenCalledWith("smartspec-cloudflare-staging:node-http");
    expect((f.fetch.mock.calls[0][0] as Request).url).toBe("http://127.0.0.1:3000/api/internal/read");
  });

  it.each(["/workpacks/intake", "/api/v1/workflows/run", "/api/v1/orchestrator/factory/run", "/api/%61gency/run"])("does not boot retired routes: %s", async path => {
    const f = fixture();
    expect((await forwardApplicationHttpBridge(new Request("http://python.application.internal" + path), "python-http", f.env)).status).toBe(410);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("fails closed for an expired capability, missing namespace or production environment", async () => {
    const f = fixture(), request = () => new Request("http://python.application.internal/health/live");
    await expect(forwardApplicationHttpBridge(request(), "python-http", { ...f.env, PYTHON_HTTP: undefined })).rejects.toThrow("BINDING_REQUIRED");
    await expect(forwardApplicationHttpBridge(request(), "python-http", { ...f.env, CLOUDFLARE_ENVIRONMENT: "production" })).rejects.toThrow("DISABLED");
    f.profile.expiresAt = f.profile.issuedAt; f.env.CLOUDFLARE_PYTHON_HTTP_PROFILE = JSON.stringify(f.profile);
    await expect(forwardApplicationHttpBridge(request(), "python-http", f.env)).rejects.toThrow("PROFILE_DENIED");
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("does not boot for a request cancelled before dispatch", async () => {
    const f = fixture(), signal = new AbortController(); signal.abort();
    await expect(forwardApplicationHttpBridge(new Request("http://python.application.internal/health/live", { signal: signal.signal }), "python-http", f.env))
      .rejects.toThrow("CALLER_CANCELLED");
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
});
