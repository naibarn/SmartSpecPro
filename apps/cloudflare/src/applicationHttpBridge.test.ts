import { describe, expect, it, vi } from "vitest";
import { forwardApplicationHttpBridge, prepareApplicationHttpBridgeRequest, type ApplicationHttpBindings } from "./applicationHttpBridge";
import type { ApplicationHttpProfile } from "./applicationHttpContainer";

function fixture() {
  const profile: ApplicationHttpProfile = {
    configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "python-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-python-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 60, hardLifetimeSeconds: 60, idleTimeoutSeconds: 10,
    instance: "lite", networkAccess: "application-outbound",
  };
  const fetch = vi.fn(async () => new Response("actual-private-api-response"));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env: ApplicationHttpBindings = { CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
    CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(profile),
    CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify({ ...profile, runtime: "node-http", image: profile.image.replace("-python-http@", "-node-http@") }), PYTHON_HTTP: namespace };
  return { profile, env, namespace, fetch };
}

describe("private application HTTP binding", () => {
  it("forwards body, query and existing app credentials to one fixed private namespace", async () => {
    const f = fixture();
    const request = new Request("http://python.application.internal/api/action?tenant=a", { method: "POST", body: "request-payload",
      headers: { authorization: "Bearer real-caller-token", "x-internal-token": "existing-service-token", "x-forwarded-host": "forged.example", "cf-access-client-secret": "do-not-forward", "x-cloudflare-origin-token": "forged-token" } });
    const response = await forwardApplicationHttpBridge(request, "python-http", f.env);
    expect(await response.text()).toBe("actual-private-api-response");
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-staging:python-http:${f.profile.namespace}`);
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
    const profile = { ...f.profile, runtime: "node-http", image: f.profile.image.replace("smartspec-staging-abcdef012345-python-http", "smartspec-staging-abcdef012345-node-http") };
    await forwardApplicationHttpBridge(new Request("http://node.application.internal/api/internal/read"), "node-http", {
      ...f.env, CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile), NODE_HTTP: f.namespace,
    });
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-staging:node-http:${f.profile.namespace}`);
    expect((f.fetch.mock.calls[0][0] as Request).url).toBe("http://127.0.0.1:3000/api/internal/read");
  });

  it("forwards only an explicitly attested WebSocket handshake to the fixed Node port", async () => {
    const f = fixture();
    const wsResponse = { status: 101, headers: new Headers({ upgrade: "websocket" }), webSocket: { close: vi.fn() }, body: null } as unknown as Response;
    f.fetch.mockResolvedValueOnce(wsResponse);
    const env = { ...f.env, NODE_HTTP: f.namespace, AUTH_ORIGIN_TOKEN: "a".repeat(40),
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://staging.smartaihub.app"]) };
    const request = new Request("http://node.application.internal/api/voice/stream?ticket=opaque", { headers: {
      upgrade: "websocket", connection: "keep-alive, Upgrade", "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", origin: "https://staging.smartaihub.app",
      "x-smartaihub-public-origin": "https://staging.smartaihub.app", "x-cloudflare-origin-token": "attacker",
      "x-forwarded-host": "attacker.example", cookie: "app_session=session; CF_Authorization=private",
    } });
    const response = await forwardApplicationHttpBridge(request, "node-http", env);
    expect(response).toBe(wsResponse);
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("http://127.0.0.1:3000/api/voice/stream?ticket=opaque");
    expect(forwarded.headers.get("upgrade")).toBe("websocket");
    expect(forwarded.headers.get("connection")).toBe("Upgrade");
    expect(forwarded.headers.get("x-cloudflare-origin-token")).toBe("a".repeat(40));
    expect(forwarded.headers.get("x-smartaihub-public-origin")).toBe("https://staging.smartaihub.app");
    expect(forwarded.headers.get("x-forwarded-host")).toBe("staging.smartaihub.app");
    expect(forwarded.headers.get("cookie")).toBe("app_session=session");
  });

  it("denies a WebSocket without its exact configured public-origin attestation before namespace dispatch", async () => {
    const f = fixture();
    await expect(forwardApplicationHttpBridge(new Request("http://node.application.internal/api/voice/stream", { headers: {
      upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", origin: "https://staging.smartaihub.app",
      "x-smartaihub-public-origin": "https://attacker.example",
    } }), "node-http", { ...f.env, AUTH_ORIGIN_TOKEN: "a".repeat(40),
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://staging.smartaihub.app"]), NODE_HTTP: f.namespace }))
      .rejects.toThrow("REALTIME_ATTESTATION_REQUIRED");
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("isolates durable object identities across immutable configuration versions", async () => {
    const f = fixture();
    const newer = { ...f.profile, configurationRef: `cf-origin:${"f".repeat(64)}` };
    const node = { ...newer, runtime: "node-http", image: newer.image.replace("-python-http@", "-node-http@") };
    await forwardApplicationHttpBridge(new Request("http://python.application.internal/health/live"), "python-http", {
      ...f.env, CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(newer),
      CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(node),
    });
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-staging:python-http:${f.profile.namespace}`);
  });

  it.each(["/workpacks/intake", "/api/v1/workflows/run", "/api/v1/orchestrator/factory/run", "/api/%61gency/run"])("does not boot retired routes: %s", async path => {
    const f = fixture();
    expect((await forwardApplicationHttpBridge(new Request("http://python.application.internal" + path), "python-http", f.env)).status).toBe(410);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("fails closed for an expired capability, missing namespace or mismatched production profile", async () => {
    const f = fixture(), request = () => new Request("http://python.application.internal/health/live");
    await expect(forwardApplicationHttpBridge(request(), "python-http", { ...f.env, PYTHON_HTTP: undefined })).rejects.toThrow("BINDING_REQUIRED");
    await expect(forwardApplicationHttpBridge(request(), "python-http", { ...f.env, CLOUDFLARE_ENVIRONMENT: "production" })).rejects.toThrow("PROFILE_MISMATCH");
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

  it.each(["namespace", "accountRef", "configurationRef", "sourceSha", "issuedAt", "expiresAt"])("rejects a separately valid foreign %s before starting either API", async key => {
    const f = fixture(), node = JSON.parse(f.env.CLOUDFLARE_NODE_HTTP_PROFILE!);
    if (key === "namespace") { node.namespace = "smartspec-staging-111111111111"; node.image = node.image.replace("abcdef012345", "111111111111"); }
    if (key === "accountRef") { node.accountRef = "f".repeat(32); node.image = node.image.replace("a".repeat(32), "f".repeat(32)); }
    if (key === "configurationRef") node.configurationRef = `cf-origin:${"f".repeat(64)}`;
    if (key === "sourceSha") node.sourceSha = "f".repeat(40);
    if (key === "issuedAt") node.issuedAt = new Date(Date.parse(node.issuedAt) - 1000).toISOString();
    if (key === "expiresAt") node.expiresAt = new Date(Date.parse(node.expiresAt) + 1000).toISOString();
    f.env.CLOUDFLARE_NODE_HTTP_PROFILE = JSON.stringify(node);
    await expect(forwardApplicationHttpBridge(new Request("http://python.application.internal/health/live"), "python-http", f.env)).rejects.toThrow("PROFILE_PAIR_DENIED");
    expect(f.namespace.get).not.toHaveBeenCalled();
  });
});
