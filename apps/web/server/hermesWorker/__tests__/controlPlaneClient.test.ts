/**
 * Feature 135 — Hermes Grok media worker (section 07): `controlPlaneClient.ts`
 * unit tests. Injected `fetchImpl` — no real network/DB.
 */
import { describe, expect, it, vi } from "vitest";

import { HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY } from "../../../shared/workerRuntime";
import { createControlPlaneClient, HermesControlPlaneError } from "../controlPlaneClient";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

describe("createControlPlaneClient", () => {
  it("register() advertises hermesMedia.advertised=true only when doctorOk, plus maxConcurrentJobs", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse(201, { created: true, workerId: "worker-1", tokens: { executionToken: "e", uploadToken: "u", refreshToken: "r" } });
    });
    const client = createControlPlaneClient({ baseUrl: "https://example.test", workerId: "worker-1", refreshToken: "refresh", fetchImpl });

    await client.register({
      bearerToken: "registration-token",
      payload: {
        displayName: "Shared Hermes Worker",
        externalReference: "hermes://host/worker-1",
        runtimeVersion: "0.1.0",
        maxConcurrentJobs: 2,
        doctorOk: true,
        hermesVersion: "0.18.2",
      },
    });

    expect(calls[0].url).toBe("https://example.test/api/workers/register");
    const body = calls[0].body as any;
    expect(body.runtimeType).toBe("hermes_agent_gateway");
    expect(body.capabilitiesJson.maxConcurrentJobs).toBe(2);
    expect(body.capabilitiesJson.hermesMedia.advertised).toBe(true);

    await client.register({
      bearerToken: "registration-token",
      payload: {
        displayName: "Shared Hermes Worker",
        externalReference: "hermes://host/worker-1",
        runtimeVersion: "0.1.0",
        maxConcurrentJobs: 2,
        doctorOk: false,
        hermesVersion: "0.18.2",
      },
    });
    const secondBody = calls[1].body as any;
    expect(secondBody.capabilitiesJson.hermesMedia.advertised).toBe(false);
  });

  it("heartbeat() carries freeDiskBytes", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/connect/refresh")) {
        return jsonResponse(200, { tokens: { executionToken: "e1", uploadToken: "u1", refreshToken: "r1" } });
      }
      return jsonResponse(200, { status: "online", workerId: "worker-1", lastSeenAt: null });
    });
    const client = createControlPlaneClient({ baseUrl: "https://example.test", workerId: "worker-1", refreshToken: "refresh", fetchImpl });

    await client.heartbeat({ freeDiskBytes: 123456, activeJobIds: [] });

    const heartbeatCall = calls.find((call) => call.url.includes("/heartbeat"));
    expect(heartbeatCall?.body.freeDiskBytes).toBe(123456);
  });

  it("heartbeat() forwards runtimeMetadataJson when supplied (capability observability — FIX 4)", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/connect/refresh")) {
        return jsonResponse(200, { tokens: { executionToken: "e1", uploadToken: "u1", refreshToken: "r1" } });
      }
      return jsonResponse(200, { status: "online", workerId: "worker-1", lastSeenAt: null });
    });
    const client = createControlPlaneClient({ baseUrl: "https://example.test", workerId: "worker-1", refreshToken: "refresh", fetchImpl });

    await client.heartbeat({
      freeDiskBytes: 123456,
      activeJobIds: [],
      runtimeMetadataJson: { hermesMedia: { hermesVersion: "0.18.2", doctorOk: true } },
    });

    const heartbeatCall = calls.find((call) => call.url.includes("/heartbeat"));
    expect(heartbeatCall?.body.runtimeMetadataJson).toEqual({ hermesMedia: { hermesVersion: "0.18.2", doctorOk: true } });
  });

  it("claim() includes capabilityHints: [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY] by default", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/connect/refresh")) {
        return jsonResponse(200, { tokens: { executionToken: "e1", uploadToken: "u1", refreshToken: "r1" } });
      }
      return jsonResponse(200, { job: null, queueDepth: 0 });
    });
    const client = createControlPlaneClient({ baseUrl: "https://example.test", workerId: "worker-1", refreshToken: "refresh", fetchImpl });

    await client.claim({ capabilityHints: undefined });

    const claimCall = calls.find((call) => call.url.includes("/jobs/claim"));
    expect(claimCall?.body.capabilityHints).toEqual([HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY]);
  });

  it("retries once on 401 after a token refresh, then surfaces a typed error if it 401s again", async () => {
    let heartbeatAttempts = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/connect/refresh")) {
        return jsonResponse(200, { tokens: { executionToken: "fresh-exec", uploadToken: "fresh-upload", refreshToken: "fresh-refresh" } });
      }
      if (url.includes("/heartbeat")) {
        heartbeatAttempts += 1;
        return jsonResponse(401, { error: { code: "worker_auth_invalid", message: "expired" } });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const client = createControlPlaneClient({
      baseUrl: "https://example.test",
      workerId: "worker-1",
      refreshToken: "refresh",
      fetchImpl,
      initialTokens: { executionToken: "stale-exec", uploadToken: "stale-upload" },
    });

    await expect(client.heartbeat({ freeDiskBytes: 0, activeJobIds: [] })).rejects.toBeInstanceOf(HermesControlPlaneError);
    // One refresh-and-retry: original attempt + one retry = 2 heartbeat calls.
    expect(heartbeatAttempts).toBe(2);
  });

  it("succeeds after exactly one refresh-and-retry when the second attempt is authorized", async () => {
    let heartbeatAttempts = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/connect/refresh")) {
        return jsonResponse(200, { tokens: { executionToken: "fresh-exec", uploadToken: "fresh-upload", refreshToken: "fresh-refresh" } });
      }
      if (url.includes("/heartbeat")) {
        heartbeatAttempts += 1;
        if (heartbeatAttempts === 1) {
          return jsonResponse(401, { error: { code: "worker_auth_invalid", message: "expired" } });
        }
        return jsonResponse(200, { status: "online", workerId: "worker-1", lastSeenAt: null });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const client = createControlPlaneClient({
      baseUrl: "https://example.test",
      workerId: "worker-1",
      refreshToken: "refresh",
      fetchImpl,
      initialTokens: { executionToken: "stale-exec", uploadToken: "stale-upload" },
    });

    await expect(client.heartbeat({ freeDiskBytes: 0, activeJobIds: [] })).resolves.toBeUndefined();
    expect(heartbeatAttempts).toBe(2);
  });
});
