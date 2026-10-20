import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeCloudflareOriginUpgrade } from "../_core/cloudflareOriginIngress";

const publicOrigin = "https://staging.account.workers.dev";
const config = { AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.example.com", AUTH_ORIGIN_TOKEN: "upgrade-attestation-test-only",
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([publicOrigin]) };
describe("actual raw HTTP upgrade origin boundary", () => {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  let port: number;
  let reached = 0;
  let forwardedHost: string | string[] | undefined;
  let browserOrigin: string | string[] | undefined;
  beforeAll(async () => {
    server.on("upgrade", (req, socket, head) => {
      if (!authorizeCloudflareOriginUpgrade(req, socket, config)) return;
      reached++;
      forwardedHost = req.headers["x-forwarded-host"];
      browserOrigin = req.headers.origin;
      sockets.handleUpgrade(req, socket, head, ws => {
        // A transport credential cannot satisfy the downstream application's auth.
        ws.close(1008, "Application authentication required");
      });
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => { for (const ws of sockets.clients) ws.terminate(); sockets.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  async function connect(headers: Record<string, string>, path = "/api/voice/stream") {
    return new Promise<{ http?: number; closeCode?: number }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
      ws.on("unexpected-response", (request, response) => { const http = response.statusCode; response.resume(); request.destroy(); resolve({ http }); });
      ws.on("error", reject);
      ws.on("close", closeCode => resolve({ closeCode }));
    });
  }
  it("denies missing/wrong attestation and foreign browser origin before any upgrade handler", async () => {
    const previous = reached;
    for (const headers of [
      { host: config.AUTH_ORIGIN_PRIVATE_HOST },
      { host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": "wrong" },
      { host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": config.AUTH_ORIGIN_TOKEN,
        "x-smartaihub-public-origin": publicOrigin, origin: "https://foreign.example.com" },
    ]) expect((await connect(headers)).http).toBe(403);
    expect(reached).toBe(previous);
  });
  it("passes verified public-host context while preserving downstream application-auth rejection", async () => {
    const result = await connect({ host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": config.AUTH_ORIGIN_TOKEN,
      "x-smartaihub-public-origin": publicOrigin, origin: publicOrigin, "x-forwarded-host": "spoofed.example.com" });
    expect(result.closeCode).toBe(1008);
    expect(forwardedHost).toBe(new URL(publicOrigin).host);
  });
  it("allows an attested widget's embedding Origin to reach downstream application auth without changing public-host identity", async () => {
    const result = await connect({ host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": config.AUTH_ORIGIN_TOKEN,
      "x-smartaihub-public-origin": publicOrigin, origin: "https://customer.example.com" }, "/widget/v1/ws");
    expect(result.closeCode).toBe(1008);
    expect(browserOrigin).toBe("https://customer.example.com");
    expect(forwardedHost).toBe(new URL(publicOrigin).host);
  });
  it("does not relax attestation or browser-Origin syntax for embedded widgets", async () => {
    const previous = reached;
    for (const headers of [
      { host: config.AUTH_ORIGIN_PRIVATE_HOST, origin: "https://customer.example.com" },
      { host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": config.AUTH_ORIGIN_TOKEN, "x-smartaihub-public-origin": publicOrigin },
      { host: config.AUTH_ORIGIN_PRIVATE_HOST, "x-cloudflare-origin-token": config.AUTH_ORIGIN_TOKEN, "x-smartaihub-public-origin": publicOrigin, origin: "null" },
    ]) expect((await connect(headers, "/widget/v1/ws")).http).toBe(403);
    expect(reached).toBe(previous);
  });
});
