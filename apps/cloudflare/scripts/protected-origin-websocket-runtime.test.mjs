import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { WebSocket } = require("ws");

test("workerd preserves an upstream WebSocket pair while removing its private Access cookie", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "smartspec-origin-ws-"));
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
  const proxyPath = fileURLToPath(new URL("../src/authOriginProxy.ts", import.meta.url));
  await writeFile(join(directory, "worker.ts"), `
import { proxyWebSocketToOrigin } from ${JSON.stringify(proxyPath)};
export default { async fetch(request) {
  if (new URL(request.url).pathname === '/healthz') return new Response('ok');
  const publicOrigin = 'https://staging.account.workers.dev';
  const publicRequest = new Request(publicOrigin + new URL(request.url).pathname, { headers: request.headers });
  return proxyWebSocketToOrigin(publicRequest, {
    AUTH_ORIGIN: 'https://private-origin.invalid', AUTH_ORIGIN_PRIVATE_HOST: 'private-origin.invalid',
    AUTH_ORIGIN_TOKEN: 'fixture-only', AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([publicOrigin]),
  }, async () => {
    const [client, server] = Object.values(new WebSocketPair()); server.accept();
    server.addEventListener('message', event => server.send('echo:' + event.data));
    const headers = new Headers();
    headers.append('set-cookie', 'CF_Authorization=fixture-private-jwt; Secure; HttpOnly; Path=/');
    headers.append('set-cookie', 'app_session_id=fixture-app-session; Secure; HttpOnly; Path=/');
    return new Response(null, { status: 101, webSocket: client, headers });
  });
} };
`);
  await writeFile(join(directory, "wrangler.json"), JSON.stringify({
    name: "smartspec-origin-websocket-fixture", main: "worker.ts", compatibility_date: "2026-10-17",
  }));
  const child = spawn("pnpm", ["dlx", "wrangler@4.151.1", "dev", "--config", join(directory, "wrangler.json"), "--local", "--port", String(port), "--persist-to", join(directory, "state")], {
    detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { log = (log + bytes).slice(-6000); });
  let socket;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (child.exitCode !== null) throw new Error(`workerd exited: ${log}`);
      try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, `workerd did not start: ${log}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket echo timed out")), 10_000);
      socket = new WebSocket(`ws://127.0.0.1:${port}/api/voice/stream`, { origin: "https://staging.account.workers.dev" });
      socket.once("upgrade", response => {
        try {
          assert.equal(response.statusCode, 101);
          const cookies = String(response.headers["set-cookie"] ?? "");
          assert.ok(!cookies.includes("CF_Authorization"));
          assert.ok(cookies.includes("app_session_id=fixture-app-session"));
        } catch (error) { clearTimeout(timer); reject(error); }
      });
      socket.once("error", error => { clearTimeout(timer); reject(error); });
      socket.once("open", () => socket.send("actual-pair"));
      socket.once("message", bytes => {
        clearTimeout(timer);
        try { assert.equal(bytes.toString(), "echo:actual-pair"); resolve(); } catch (error) { reject(error); }
      });
    });
  } finally {
    socket?.terminate();
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already exited */ }
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} resolve(); }, 3000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    await rm(directory, { recursive: true, force: true });
  }
});
