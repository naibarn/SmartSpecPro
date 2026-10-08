import { createServer } from "node:http";

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
  sessionId: "session-test-1",
  authorizationGrantRef: "grant-test-1",
  capabilitySnapshotId: "snapshot-test-1",
};

function policy(overrides: Partial<MoliRunnerPolicy> = {}): MoliRunnerPolicy {
  return {
    getRuntimeVersion: vi.fn(async () => "1.1.15"),
    authorizeAttempt: vi.fn(async () => true),
    allowNavigation: vi.fn(async () => true),
    confirmNetworkIsolation: vi.fn(async () => true),
    cleanupRuntime: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("experimental Moli CDP adapter", () => {
  let server: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("fails closed with the requested default flags", async () => {
    const adapter = new MoliCdpBrowserAdapter("http://127.0.0.1:9222", policy(), DEFAULT_MOLI_FEATURE_FLAGS);
    await expect(adapter.openSession(attempt)).rejects.toThrow("MOLI_EXPERIMENTAL_ADAPTER_DISABLED_OR_SHADOW_ONLY");
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

  it.skipIf(!process.env.MOLI_CDP_ENDPOINT)("navigates, executes JS, fills forms, isolates contexts, and cleans cancellation", async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<!doctype html><title>moli-adapter-test</title><form><input id="q"></form>');
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const localUrl = `http://127.0.0.1:${address.port}/`;
    const makePolicy = () => policy({
      allowNavigation: vi.fn(async (url) => url === localUrl),
    });
    const firstPolicy = makePolicy();
    const secondPolicy = makePolicy();
    const firstAdapter = new MoliCdpBrowserAdapter(process.env.MOLI_CDP_ENDPOINT!, firstPolicy, enabledFlags);
    const secondAdapter = new MoliCdpBrowserAdapter(process.env.MOLI_CDP_ENDPOINT!, secondPolicy, enabledFlags);
    const first = await firstAdapter.openSession(attempt);
    const second = await secondAdapter.openSession({ ...attempt, sessionId: "session-test-2", attemptId: "attempt-test-2" });

    await expect(first.navigate("http://127.0.0.1:1/blocked")).rejects.toThrow("MOLI_NAVIGATION_POLICY_DENIED");
    await first.navigate(localUrl);
    await second.navigate(localUrl);
    await first.fill("#q", "isolated");
    expect(await first.evaluate("document.title + '|' + document.querySelector('#q').value")).toBe("moli-adapter-test|isolated");
    await first.evaluate("localStorage.setItem('session-value', 'first')");
    expect(await second.evaluate("localStorage.getItem('session-value')")).toBeNull();

    await first.close("cancelled");
    await second.close();
    expect(firstPolicy.cleanupRuntime).toHaveBeenCalledOnce();
    expect(firstPolicy.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "moli.session.closed", reason: "cancelled" }));
  });
});
