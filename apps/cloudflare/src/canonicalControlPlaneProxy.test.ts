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

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare canonical control-plane proxy", () => {
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
