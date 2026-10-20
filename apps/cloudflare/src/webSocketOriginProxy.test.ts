import { describe, expect, it, vi } from "vitest";
import { proxyWebSocketToOrigin } from "./authOriginProxy";

const origin = "https://staging.account.workers.dev";
const config = { AUTH_ORIGIN: "https://origin-staging.example.com", AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.example.com",
  AUTH_ORIGIN_TOKEN: "app-attestation-test-only", AUTH_ORIGIN_ACCESS_CLIENT_ID: "access-client-test-only",
  AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "access-secret-test-only", AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([origin]) };
const headers = { upgrade: "websocket", connection: "keep-alive, Upgrade", "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", origin, authorization: "Bearer application-user-token",
  "cf-access-client-secret": "attacker", "x-cloudflare-origin-token": "attacker", "x-forwarded-host": "attacker.example.com",
  "x-smartaihub-public-origin": "https://attacker.example.com", "x-internal-token": "attacker-internal" };

describe("exact origin WebSocket transport", () => {
  it("preserves the embedding website Origin for the widget's token and per-widget allowlist authority", async () => {
    const embeddingOrigin = "https://customer.example.com";
    const upstream = { status: 101, headers: new Headers(), webSocket: { close: vi.fn() }, body: null } as unknown as Response;
    const fetcher = vi.fn(async request => {
      expect(request.headers.get("origin")).toBe(embeddingOrigin);
      expect(request.headers.get("x-smartaihub-public-origin")).toBe(origin);
      return upstream;
    });
    expect(await proxyWebSocketToOrigin(new Request(origin + "/widget/v1/ws", {
      headers: { ...headers, origin: embeddingOrigin },
    }), config, fetcher)).toBe(upstream);
  });

  it.each([undefined, "null", "https://customer.example.com/path", "https://user@customer.example.com", "https://customer.example.com/"])("rejects a missing or noncanonical widget browser Origin: %s", async browserOrigin => {
    const requestHeaders = new Headers(headers);
    if (browserOrigin === undefined) requestHeaders.delete("origin");
    else requestHeaders.set("origin", browserOrigin);
    const fetcher = vi.fn();
    expect((await proxyWebSocketToOrigin(new Request(origin + "/widget/v1/ws", { headers: requestHeaders }), config, fetcher)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["/api/voice/stream", "/api/runners/runner-1/control", "/widget/v1/ws"])("preserves the actual WebSocket pair for %s and replaces caller trust headers", async path => {
    const upstream = { status: 101, headers: new Headers({ upgrade: "websocket", connection: "Upgrade" }), webSocket: { close: vi.fn() }, body: null } as unknown as Response;
    const fetcher = vi.fn(async request => {
      expect(request.url).toBe(`https://origin-staging.example.com${path}?token=application-ticket`);
      expect(request.redirect).toBe("manual");
      expect(request.headers.get("upgrade")).toBe("websocket");
      expect(request.headers.get("connection")).toBe("Upgrade");
      expect(request.headers.get("authorization")).toBe(headers.authorization);
      expect(request.headers.get("sec-websocket-key")).toBe(headers["sec-websocket-key"]);
      expect(request.headers.get("cf-access-client-secret")).toBe(config.AUTH_ORIGIN_ACCESS_CLIENT_SECRET);
      expect(request.headers.get("x-cloudflare-origin-token")).toBe(config.AUTH_ORIGIN_TOKEN);
      expect(request.headers.get("x-forwarded-host")).toBe(new URL(origin).host);
      expect(request.headers.get("x-smartaihub-public-origin")).toBe(origin);
      expect(request.headers.get("x-internal-token")).toBeNull();
      return upstream;
    });
    const result = await proxyWebSocketToOrigin(new Request(origin + path + "?token=application-ticket", { headers }), config, fetcher);
    expect(result).toBe(upstream);
  });

  it.each([
    ["/api/unrelated", headers, 404], ["/api/voice/stream", { ...headers, origin: "https://foreign.example.com" }, 403],
    ["/api/voice/stream", { ...headers, "sec-websocket-version": "12" }, 400],
    ["/api/voice/stream", { ...headers, "sec-websocket-key": "bad-key" }, 400],
    ["/api/voice/stream", { ...headers, connection: "close" }, 400],
  ])("rejects foreign routes/origins and malformed handshakes before provider access", async (path, requestHeaders, status) => {
    const fetcher = vi.fn();
    const result = await proxyWebSocketToOrigin(new Request(origin + path, { headers: requestHeaders }), config, fetcher);
    expect(result.status).toBe(status);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects Access HTML/redirects or a missing WebSocket pair without exposing provider contents", async () => {
    for (const response of [new Response("private Access HTML", { status: 403 }),
      new Response(null, { status: 302, headers: { location: "https://team.cloudflareaccess.com/cdn-cgi/access/login" } }),
      { status: 101, headers: new Headers(), body: null } as Response]) {
      const result = await proxyWebSocketToOrigin(new Request(origin + "/api/voice/stream", { headers }), config, async () => response);
      expect(result.status).toBe(503);
      expect(await result.text()).not.toContain("private Access");
    }
  });

  it("rejects and closes an upstream pair that reflects private trust headers", async () => {
    const close = vi.fn();
    const upstream = { status: 101, headers: new Headers({ "cf-access-client-secret": "private" }), webSocket: { close }, body: null } as unknown as Response;
    const result = await proxyWebSocketToOrigin(new Request(origin + "/api/voice/stream", { headers }), config, async () => upstream);
    expect(result.status).toBe(503);
    expect(close).toHaveBeenCalledWith(1008, expect.any(String));
    expect(await result.text()).not.toContain("private");
  });

  it("bounds a stalled handshake even if a fetch fixture does not honor abort", async () => {
    const result = await proxyWebSocketToOrigin(new Request(origin + "/api/voice/stream", { headers }), config,
      async () => new Promise<Response>(() => {}), 5);
    expect(result.status).toBe(503);
  });
});
