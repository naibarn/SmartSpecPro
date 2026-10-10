import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer as createTcpServer } from "node:net";
import { WebSocketServer } from "ws";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MoliCdpBrowserAdapter,
  type AuthorizedMoliAttempt,
  type MoliRunnerPolicy,
} from "../moliCdpBrowserAdapter";
import { DEFAULT_MOLI_FEATURE_FLAGS } from "../computerUseCapabilityRouting";

const enabledFlags = {
  moli_enabled: true,
  moli_shadow_mode: false,
  moli_production_enabled: false,
};

const attempt: AuthorizedMoliAttempt = {
  jobId: "job-test-1",
  attemptId: "attempt-test-1",
  tenantId: "tenant-test-1",
  userId: "user-test-1",
  projectRef: "project-test-1",
  leaseId: "lease-test-1",
  fencingToken: "fence-test-1",
  deadline: new Date(Date.now() + 60_000).toISOString(),
  sessionId: "session-test-1",
  authorizationGrantRef: "grant-test-1",
  capabilitySnapshotId: "snapshot-test-1",
  capabilitySnapshotRevision: "revision-test-1",
};

function policy(overrides: Partial<MoliRunnerPolicy> = {}): MoliRunnerPolicy {
  return {
    getRuntimeVersion: vi.fn(async () => "1.1.15"),
    authorizeAttempt: vi.fn(async () => true),
    assertAttemptActive: vi.fn(async () => true),
    allowNavigation: vi.fn(async () => true),
    confirmNetworkIsolation: vi.fn(async () => true),
    cleanupRuntime: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("experimental Moli CDP adapter", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let websocketServer: WebSocketServer | undefined;
  const moliChildren: ChildProcess[] = [];
  const profileDirectories: string[] = [];

  afterEach(async () => {
    for (const child of moliChildren.splice(0)) {
      if (child.exitCode !== null || child.killed) continue;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2_000);
        child.once("exit", () => { clearTimeout(timeout); resolve(); });
        child.kill("SIGTERM");
      });
    }
    await Promise.all(profileDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
    if (websocketServer) await new Promise<void>((resolve) => websocketServer!.close(() => resolve()));
    websocketServer = undefined;
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("fails closed with the requested default flags", async () => {
    const adapter = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy(), DEFAULT_MOLI_FEATURE_FLAGS);
    await expect(adapter.openSession(attempt)).rejects.toThrow("MOLI_EXPERIMENTAL_ADAPTER_DISABLED_OR_SHADOW_ONLY");
  });

  it("keeps Moli disabled in production even when a rollout flag is mis-set", async () => {
    const productionOverride = new MoliCdpBrowserAdapter(
      "http://127.0.0.1:9222",
      policy(),
      { moli_enabled: true, moli_shadow_mode: false, moli_production_enabled: true },
      "production",
    );
    await expect(productionOverride.openSession(attempt)).rejects.toThrow("MOLI_PRODUCTION_DISABLED");
  });

  it("rejects non-loopback CDP endpoints before connecting", async () => {
    const adapter = new MoliCdpBrowserAdapter("http://192.0.2.20:9222", policy(), enabledFlags);
    await expect(adapter.openSession(attempt)).rejects.toThrow("MOLI_CDP_ENDPOINT_MUST_BE_LOOPBACK");
  });

  it("requires the Runner-reported pinned binary version", async () => {
    const mismatched = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy({
      getRuntimeVersion: vi.fn(async () => "1.1.14"),
    }), enabledFlags);
    await expect(mismatched.openSession(attempt)).rejects.toThrow("MOLI_RUNTIME_VERSION_MISMATCH");
  });

  it("requires existing attempt authorization and network isolation", async () => {
    const denied = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy({
      authorizeAttempt: vi.fn(async () => false),
    }), enabledFlags);
    await expect(denied.openSession(attempt)).rejects.toThrow("MOLI_ATTEMPT_UNAUTHORIZED");

    const unisolated = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy({
      confirmNetworkIsolation: vi.fn(async () => false),
    }), enabledFlags);
    await expect(unisolated.openSession(attempt)).rejects.toThrow("MOLI_NETWORK_ISOLATION_UNAVAILABLE");
  });

  it("rejects an expired or revoked lease binding before issuing CDP commands", async () => {
    const denied = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy({
      assertAttemptActive: vi.fn(async () => false),
    }), enabledFlags);
    await expect(denied.openSession(attempt)).rejects.toThrow("MOLI_ATTEMPT_EXPIRED_OR_REVOKED");
  });

  it("rejects an invalid job deadline before opening a runtime", async () => {
    const adapter = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy(), enabledFlags);
    await expect(adapter.openSession({ ...attempt, deadline: "not-a-date" })).rejects.toThrow("MOLI_ATTEMPT_DEADLINE_INVALID");
  });

  it("surfaces cleanup and audit failures when session setup fails", async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${(server!.address() as { port: number }).port}/devtools/browser/test` }));
    });
    websocketServer = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      websocketServer!.handleUpgrade(request, socket, head, (ws) => {
        websocketServer!.emit("connection", ws, request);
      });
    });
    websocketServer.on("connection", (ws) => {
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as { id: number; method: string };
        if (message.method === "Target.disposeBrowserContext") {
          ws.send(JSON.stringify({ id: message.id, error: { message: "dispose failed" } }));
          return;
        }
        if (message.method === "Target.createTarget") {
          ws.send(JSON.stringify({ id: message.id, error: { message: "target creation failed" } }));
          return;
        }
        const result = message.method === "Target.createBrowserContext" ? { browserContextId: "ctx-test" }
          : {};
        ws.send(JSON.stringify({ id: message.id, result }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const runtimePolicy = policy({
      recordAudit: vi.fn(async () => { throw new Error("audit write failed"); }),
      cleanupRuntime: vi.fn(async () => { throw new Error("profile deletion failed"); }),
    });
    const adapter = new MoliCdpBrowserAdapter(`http://127.0.0.1:${port}`, runtimePolicy, enabledFlags);

    await expect(adapter.openSession(attempt)).rejects.toMatchObject({
      message: "MOLI_SESSION_OPEN_AND_CLEANUP_FAILED",
      errors: expect.arrayContaining([expect.objectContaining({ message: "audit write failed" })]),
    });
    expect(runtimePolicy.cleanupRuntime).toHaveBeenCalledOnce();
    expect(runtimePolicy.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      event: "moli.runtime.cleanup_failed",
      tenantId: attempt.tenantId,
      userId: attempt.userId,
      projectRef: attempt.projectRef,
      leaseId: attempt.leaseId,
      fencingToken: attempt.fencingToken,
    }));
  });

  it.skipIf(!process.env.MOLI_CDP_ENDPOINT)("navigates, executes JS, fills forms, isolates contexts, and cleans cancellation", async () => {
    server = createServer((request, response) => {
      if (new URL(request.url ?? "/", "http://127.0.0.1").pathname === "/sw.js") {
        response.writeHead(200, { "content-type": "application/javascript" });
        response.end("self.addEventListener('fetch', (event) => {});");
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<!doctype html><title>moli-adapter-test</title><form><input id="q"></form>');
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const localUrl = `http://127.0.0.1:${address.port}/`;
    const makePolicy = (overrides: Partial<MoliRunnerPolicy> = {}) => policy({
      allowNavigation: vi.fn(async (url) => url === localUrl),
      ...overrides,
    });
    let active = true;
    const firstPolicy = makePolicy({ assertAttemptActive: vi.fn(async () => active) });
    const secondPolicy = makePolicy();
    const firstAdapter = new MoliCdpBrowserAdapter(process.env.MOLI_CDP_ENDPOINT!, firstPolicy, enabledFlags);
    const secondAdapter = new MoliCdpBrowserAdapter(process.env.MOLI_CDP_ENDPOINT!, secondPolicy, enabledFlags);
    const first = await firstAdapter.openSession(attempt);
    const second = await secondAdapter.openSession({
      ...attempt,
      jobId: "job-test-2",
      attemptId: "attempt-test-2",
      tenantId: "tenant-test-2",
      userId: "user-test-2",
      projectRef: "project-test-2",
      leaseId: "lease-test-2",
      fencingToken: "fence-test-2",
      deadline: new Date(Date.now() + 60_000).toISOString(),
      sessionId: "session-test-2",
      capabilitySnapshotId: "snapshot-test-2",
      capabilitySnapshotRevision: "revision-test-2",
    });

    await expect(first.navigate("http://127.0.0.1:1/blocked")).rejects.toThrow("MOLI_NAVIGATION_POLICY_DENIED");
    await first.navigate(localUrl);
    await second.navigate(localUrl);
    await first.fill("#q", "isolated");
    expect(await first.evaluate("document.title + '|' + document.querySelector('#q').value")).toBe("moli-adapter-test|isolated");
    await first.evaluate(`(async () => {
      document.cookie = 'session-cookie=first; path=/';
      localStorage.setItem('session-local', 'first');
      sessionStorage.setItem('session-tab', 'first');
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('moli-isolation', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('tokens');
        request.onsuccess = () => {
          const tx = request.result.transaction('tokens', 'readwrite');
          tx.objectStore('tokens').put('first', 'auth');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
      const cache = await caches.open('moli-isolation');
      await cache.put('/token-cache', new Response('first'));
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return 'seeded';
    })()`);
    const secondStorage = await second.evaluate(`(async () => ({
      cookie: document.cookie,
      local: localStorage.getItem('session-local'),
      session: sessionStorage.getItem('session-tab'),
      indexedDb: await new Promise((resolve) => {
        const request = indexedDB.open('moli-isolation', 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('tokens')) return resolve(null);
          const get = db.transaction('tokens').objectStore('tokens').get('auth');
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror = () => resolve('error');
        };
        request.onerror = () => resolve('error');
      }),
      cache: await caches.has('moli-isolation'),
      serviceWorker: (await navigator.serviceWorker.getRegistrations()).length > 0,
      authToken: localStorage.getItem('auth-token'),
    }))()`);
    expect(secondStorage).toEqual({ cookie: "", local: null, session: null, indexedDb: null, cache: false, serviceWorker: false, authToken: null });

    active = false;
    expect(await firstPolicy.assertAttemptActive(attempt)).toBe(false);
    await expect(first.evaluate("document.title")).rejects.toThrow("MOLI_ATTEMPT_EXPIRED_OR_REVOKED");

    await first.close("cancelled");
    await expect(first.evaluate("document.title")).rejects.toThrow("MOLI_SESSION_INVALID");
    await second.close();
    expect(firstPolicy.cleanupRuntime).toHaveBeenCalledOnce();
    expect(firstPolicy.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "moli.session.closed", reason: "cancelled", userId: attempt.userId, projectRef: attempt.projectRef }));
  });

  it.skipIf(!process.env.MOLI_BINARY_PATH)("isolates storage across independent Moli processes and profile directories", async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>profile-isolation</title>");
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const localUrl = `http://127.0.0.1:${address.port}/`;
    const allocatePort = async () => {
      const listener = createTcpServer();
      await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => resolve()));
      const port = (listener.address() as { port: number }).port;
      await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
      return port;
    };
    const ports = [await allocatePort(), await allocatePort()];
    const profiles = [await mkdtemp(join(tmpdir(), "moli-p1-profile-a-")), await mkdtemp(join(tmpdir(), "moli-p1-profile-b-"))];
    profileDirectories.push(...profiles);
    const endpoints = ports.map((port) => `http://127.0.0.1:${port}`);
    for (let i = 0; i < 2; i += 1) {
      moliChildren.push(spawn(process.env.MOLI_BINARY_PATH!, [
        "serve", "--host", "127.0.0.1", "--port", String(ports[i]), "--profile-dir", profiles[i],
      ], { stdio: "ignore" }));
    }
    await Promise.all(endpoints.map(async (endpoint) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          if ((await fetch(new URL("/json/version", endpoint), { signal: AbortSignal.timeout(500) })).ok) return;
        } catch { /* wait for the loopback listener */ }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("MOLI_PROFILE_PROCESS_START_TIMEOUT");
    }));
    const isolatedAttempt = (suffix: string): AuthorizedMoliAttempt => ({
      ...attempt,
      jobId: `job-${suffix}`,
      attemptId: `attempt-${suffix}`,
      tenantId: `tenant-${suffix}`,
      userId: `user-${suffix}`,
      projectRef: `project-${suffix}`,
      leaseId: `lease-${suffix}`,
      fencingToken: `fence-${suffix}`,
      sessionId: `session-${suffix}`,
      capabilitySnapshotId: `snapshot-${suffix}`,
      capabilitySnapshotRevision: `revision-${suffix}`,
    });
    const first = await new MoliCdpBrowserAdapter(endpoints[0], policy(), enabledFlags).openSession(isolatedAttempt("profile-a"));
    const second = await new MoliCdpBrowserAdapter(endpoints[1], policy(), enabledFlags).openSession(isolatedAttempt("profile-b"));
    await first.navigate(localUrl);
    await second.navigate(localUrl);
    await first.evaluate("localStorage.setItem('profile-secret', 'tenant-a')");
    expect(await second.evaluate("localStorage.getItem('profile-secret')")).toBeNull();
    await first.close();
    await second.close();
  });
});
