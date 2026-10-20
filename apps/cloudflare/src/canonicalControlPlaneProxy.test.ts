import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanonicalControlPlaneProxyRepository } from "./canonicalControlPlaneProxy";
import type { CanonicalJobEnvelope, CloudflareEnvironment } from "./contracts";

const envelope: CanonicalJobEnvelope = {
  job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
  dispatch_id: "dispatch-1", dedupe_key: "job:job-1:attempt:1", routing_metadata: {},
};
const environment: CloudflareEnvironment = {
  PLATFORM_EDGE_ORIGIN: "https://platform.private.example",
  PLATFORM_EDGE_PRIVATE_HOST: "platform.private.example",
  CLOUDFLARE_CONTROL_PLANE_TOKEN: "test-only-control-plane-credential",
};
const pairedEnvironment: CloudflareEnvironment = {
  ...environment,
  PLATFORM_EDGE_ORIGIN: "https://origin-staging.smartaihub.app",
  PLATFORM_EDGE_PRIVATE_HOST: "origin-staging.smartaihub.app",
  AUTH_ORIGIN: "https://origin-staging.smartaihub.app",
  AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.smartaihub.app",
  AUTH_ORIGIN_TOKEN: "test-only-app-attestation",
  AUTH_ORIGIN_ACCESS_CLIENT_ID: "test-only-access-client",
  AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "test-only-access-secret",
  AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://stage.example.workers.dev"]',
};

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare canonical control-plane proxy", () => {
  it("uses the qualified Access ingress and keeps the canonical credential separate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCanonicalControlPlaneProxyRepository(pairedEnvironment)
      .loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).resolves.toBeNull();
    const [request] = fetchMock.mock.calls[0] as [Request];
    expect(request.url).toBe("https://origin-staging.smartaihub.app/api/internal/cloudflare-job-control/context");
    expect(request.headers.get("cf-access-client-id")).toBe(pairedEnvironment.AUTH_ORIGIN_ACCESS_CLIENT_ID);
    expect(request.headers.get("cf-access-client-secret")).toBe(pairedEnvironment.AUTH_ORIGIN_ACCESS_CLIENT_SECRET);
    expect(request.headers.get("x-cloudflare-origin-token")).toBe(pairedEnvironment.AUTH_ORIGIN_TOKEN);
    expect(request.headers.get("x-cloudflare-control-plane-token")).toBe(pairedEnvironment.CLOUDFLARE_CONTROL_PLANE_TOKEN);
    expect(request.headers.get("x-smartaihub-public-origin")).toBe("https://stage.example.workers.dev");
    expect(request.headers.has("authorization")).toBe(false);
    expect(request.redirect).toBe("manual");
    expect(await request.json()).toEqual({ jobId: "job-1", envelope });
  });

  it("accepts the canonical origin-only URL with its root slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"job":null}'));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCanonicalControlPlaneProxyRepository({
      ...pairedEnvironment, AUTH_ORIGIN: pairedEnvironment.AUTH_ORIGIN + "/",
    }).loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    { AUTH_ORIGIN_TOKEN: undefined },
    { AUTH_ORIGIN_ACCESS_CLIENT_ID: undefined },
    { AUTH_ORIGIN_ACCESS_CLIENT_SECRET: undefined },
    { AUTH_ORIGIN_PRIVATE_HOST: "other.example" },
    { AUTH_ORIGIN: "https://other.example" },
    { AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: undefined },
    { AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://stage.example.workers.dev", "https://smartaihub.app"]' },
    { AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://origin-staging.smartaihub.app"]' },
    { PLATFORM_EDGE_ORIGIN: "https://smartaihub.app", PLATFORM_EDGE_PRIVATE_HOST: "smartaihub.app" },
  ])("rejects incomplete, recursive or ambiguous protected-origin composition: %j", async (change) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCanonicalControlPlaneProxyRepository({ ...pairedEnvironment, ...change })
      .loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).rejects.toThrow("CLOUDFLARE_CONTROL_PLANE_");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["PLATFORM_EDGE_TOKEN", "AUTH_ORIGIN_TOKEN", "AUTH_ORIGIN_ACCESS_CLIENT_SECRET"] as const)(
    "rejects reuse of %s as the canonical control-plane credential", async (key) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(createCanonicalControlPlaneProxyRepository({ ...pairedEnvironment, [key]: pairedEnvironment.CLOUDFLARE_CONTROL_PLANE_TOKEN })
        .loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).rejects.toThrow("CREDENTIAL_REUSED");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("uses the configured private origin and dedicated credential for no-store job reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const repository = createCanonicalControlPlaneProxyRepository(environment);

    await expect(repository.loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://platform.private.example/api/internal/cloudflare-job-control/context");
    expect(new Headers(request.headers).get("x-cloudflare-control-plane-token")).toBe(environment.CLOUDFLARE_CONTROL_PLANE_TOKEN);
    expect(request.redirect).toBe("manual");
  });

  it("fails closed when the origin is a public application hostname", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const repository = createCanonicalControlPlaneProxyRepository({
      ...environment, PLATFORM_EDGE_ORIGIN: "https://tenant.smartaihub.app", PLATFORM_EDGE_PRIVATE_HOST: "tenant.smartaihub.app",
    });

    await expect(repository.loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).rejects.toThrow("CLOUDFLARE_CONTROL_PLANE_ORIGIN_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["smartaihub.app:8443", "smartaihub.app.", "tenant.smartaihub.app:8443", "tenant.smartspec.pro."])(
    "does not bypass public-host rejection with a port or DNS root dot: %s", async (host) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(createCanonicalControlPlaneProxyRepository({
        ...environment, PLATFORM_EDGE_ORIGIN: "https://" + host, PLATFORM_EDGE_PRIVATE_HOST: host,
      }).loadJob({ jobId: "job-1", cache: "no-store" }, envelope)).rejects.toThrow("ORIGIN_INVALID");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("maps a canonical claimed lease and durable settlement state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "claimed", claim: { attemptId: "attempt-1", leaseToken: "lease", fencingVersion: 2 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "completed" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const repository = createCanonicalControlPlaneProxyRepository(environment);
    const job = { jobId: "job-1", tenantId: "tenant-1", contractVersion: "feature-186-v1", businessAttempt: 1,
      status: "queued", operatorReviewRequired: false, jobType: "emergency.report.intake", executionClass: "short", input: {} };
    const claim = await repository.claim({ job, envelope });
    expect(claim).toEqual({ attemptId: "attempt-1", leaseToken: "lease", fencingVersion: 2 });
    if (claim === "already_terminal" || claim === "retry" || claim === "quarantine") throw new Error("expected a lease");
    await expect(repository.complete({ job, envelope, claim })).resolves.toBe("completed");
    const completion = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { claim: Record<string, unknown> };
    expect(completion.claim).toMatchObject({ jobId: "job-1", attemptId: "attempt-1", fencingVersion: 2 });
  });
});
