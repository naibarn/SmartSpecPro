import { describe, expect, it, vi } from "vitest";
import { dispatchApplicationHttpRealtime } from "./applicationHttpRealtime";
import type { ApplicationHttpBindings } from "./applicationHttpBridge";
import type { ApplicationHttpProfile } from "./applicationHttpContainer";

function fixture() {
  const profile: ApplicationHttpProfile = {
    configurationRef: `cf-origin:${"c".repeat(64)}`, sourceSha: "d".repeat(40), targetId: "smartspec-cloudflare-staging",
    runtime: "node-http", accountRef: "a".repeat(32), namespace: "smartspec-staging-abcdef012345",
    image: `registry.cloudflare.com/${"a".repeat(32)}/smartspec-staging-abcdef012345-node-http@sha256:${"b".repeat(64)}`,
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(),
    maxStarts: 1, maxComputeSeconds: 600, hardLifetimeSeconds: 600, idleTimeoutSeconds: 10,
    instance: "lite", networkAccess: "application-outbound",
  };
  const fetch = vi.fn(async () => ({ status: 101, headers: new Headers({ upgrade: "websocket" }),
    webSocket: { close: vi.fn() }, body: null } as unknown as Response));
  const namespace = { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch })) };
  const env: ApplicationHttpBindings = {
    CLOUDFLARE_ENVIRONMENT: "staging", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
    CLOUDFLARE_CONTAINER_REALTIME_ROUTES: "staging-allowlisted-v1", AUTH_ORIGIN_TOKEN: "s".repeat(40),
    AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://staging.smartaihub.app"]),
    CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(profile),
    CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify({ ...profile, runtime: "python-http", image: profile.image.replace("-node-http@", "-python-http@") }),
    NODE_HTTP: namespace,
  };
  const handshake = (path: string, origin = "https://staging.smartaihub.app") => new Request(`https://staging.smartaihub.app${path}?ticket=opaque`, { headers: {
    upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    origin, "x-smartaihub-public-origin": "https://attacker.example", "x-cloudflare-origin-token": "attacker",
  } });
  return { env, fetch, namespace, handshake };
}

describe("optional Cloudflare Container realtime routing", () => {
  it("leaves normal HTTP and default-off WebSocket traffic on the existing Worker route", async () => {
    const f = fixture();
    expect(await dispatchApplicationHttpRealtime(new Request("https://staging.smartaihub.app/api/voice/stream"), f.env)).toBeUndefined();
    expect(await dispatchApplicationHttpRealtime(f.handshake("/api/voice/stream"), { ...f.env, CLOUDFLARE_CONTAINER_REALTIME_ROUTES: undefined })).toBeUndefined();
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("routes only an allowlisted Node upgrade through the private Container bridge and replaces spoofed trust headers", async () => {
    const f = fixture();
    const response = await dispatchApplicationHttpRealtime(f.handshake("/api/voice/stream"), f.env);
    expect(response?.status).toBe(101);
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-staging:node-http:${f.env.CLOUDFLARE_NODE_HTTP_PROFILE && (JSON.parse(f.env.CLOUDFLARE_NODE_HTTP_PROFILE) as ApplicationHttpProfile).namespace}`);
    const forwarded = f.fetch.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe("http://127.0.0.1:3000/api/voice/stream?ticket=opaque");
    expect(forwarded.headers.get("origin")).toBe("https://staging.smartaihub.app");
    expect(forwarded.headers.get("x-smartaihub-public-origin")).toBe("https://staging.smartaihub.app");
    expect(forwarded.headers.get("x-cloudflare-origin-token")).toBe("s".repeat(40));
  });

  it("requires a production profile and exact production realtime mode before resolving its namespace", async () => {
    const f = fixture(), productionNamespace = "smartspec-production-abcdef012345";
    const toProduction = (value: ApplicationHttpProfile): ApplicationHttpProfile => ({ ...value,
      targetId: "smartspec-cloudflare-runtime", namespace: productionNamespace, instance: "basic",
    });
    const env: ApplicationHttpBindings = { ...f.env, CLOUDFLARE_ENVIRONMENT: "production",
      CLOUDFLARE_CONTAINER_REALTIME_ROUTES: "production-allowlisted-v1",
      AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify(["https://smartaihub.app"]),
      CLOUDFLARE_NODE_HTTP_PROFILE: JSON.stringify(toProduction(JSON.parse(f.env.CLOUDFLARE_NODE_HTTP_PROFILE!) as ApplicationHttpProfile)),
      CLOUDFLARE_PYTHON_HTTP_PROFILE: JSON.stringify(toProduction(JSON.parse(f.env.CLOUDFLARE_PYTHON_HTTP_PROFILE!) as ApplicationHttpProfile)),
    };
    const request = new Request("https://smartaihub.app/api/voice/stream?ticket=opaque", { headers: {
      upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      origin: "https://smartaihub.app", "x-smartaihub-public-origin": "https://attacker.example", "x-cloudflare-origin-token": "attacker",
    } });
    const response = await dispatchApplicationHttpRealtime(request, env);
    expect(response?.status).toBe(101);
    expect(f.namespace.idFromName).toHaveBeenCalledWith(`smartspec-cloudflare-runtime:node-http:${productionNamespace}`);
    const denied = await dispatchApplicationHttpRealtime(request, { ...env, CLOUDFLARE_CONTAINER_REALTIME_ROUTES: "staging-allowlisted-v1" });
    expect(denied).toBeUndefined();
  });

  it("rejects invalid or foreign-origin handshakes before the paid Container is resolved", async () => {
    const f = fixture();
    const wrongOrigin = await dispatchApplicationHttpRealtime(f.handshake("/api/voice/stream", "https://attacker.example"), f.env);
    expect(wrongOrigin?.status).toBe(403);
    const badKey = f.handshake("/api/voice/stream");
    const badHeaders = new Headers(badKey.headers); badHeaders.set("sec-websocket-key", "bad");
    const malformed = await dispatchApplicationHttpRealtime(new Request(badKey.url, { headers: badHeaders }), f.env);
    expect(malformed?.status).toBe(400);
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("accepts an allowlisted embedded-widget origin while preserving it for the app's widget ACL", async () => {
    const f = fixture();
    const response = await dispatchApplicationHttpRealtime(f.handshake("/widget/v1/ws", "https://customer.example.com"), f.env);
    expect(response?.status).toBe(101);
    expect((f.fetch.mock.calls[0][0] as Request).headers.get("origin")).toBe("https://customer.example.com");
  });

  it("does not capture unrelated WebSocket paths", async () => {
    const f = fixture();
    expect(await dispatchApplicationHttpRealtime(f.handshake("/socket.io/"), f.env)).toBeUndefined();
    expect(f.namespace.get).not.toHaveBeenCalled();
  });

  it("matches the three current Node endpoints and excludes adjacent or retired runtime paths", async () => {
    const f = fixture();
    for (const path of ["/api/runners/runner-123/control", "/api/runners/runner-123/control/extra", "/socket.io", "/ws", "/workflows/run"]) {
      const response = await dispatchApplicationHttpRealtime(f.handshake(path), f.env);
      if (path === "/api/runners/runner-123/control") expect(response?.status).toBe(101);
      else expect(response).toBeUndefined();
    }
  });
});
