import { describe, expect, it, vi } from "vitest";
import { probeCloudflareStagingRuntimeReadiness } from "./cloudflareStagingRuntimeReadiness";

const url =
  "https://smartspec-cloudflare-staging.smartaihub-f3fb0b68.workers.dev";

function response(
  status: number,
  body: unknown,
  contentType = "application/json"
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("probeCloudflareStagingRuntimeReadiness", () => {
  it("distinguishes an intentionally disabled staging Worker from readiness failure", async () => {
    const fetchImpl = vi.fn(async () =>
      response(503, {
        ok: false,
        readiness: {
          ready: false,
          activation: "disabled",
          transport: "all",
          selectedMissing: ["JOB_WORKFLOW", "WORKER_APP"],
          missing: [
            "JOB_WORKFLOW",
            "JOB_CONTAINERS",
            "WORKER_APP",
            "DATABASE_URL",
          ],
          jobHandlerConfigured: true,
          controlPlaneConfigured: false,
        },
      })
    ) as unknown as typeof fetch;

    await expect(
      probeCloudflareStagingRuntimeReadiness({
        url,
        deploymentId: "deploy-1",
        fetchImpl,
      })
    ).resolves.toMatchObject({
      status: "ACTIVATION_DISABLED",
      activation: "disabled",
      transport: "all",
      missing: ["JOB_WORKFLOW", "WORKER_APP"],
      jobHandlerConfigured: true,
      controlPlaneConfigured: false,
      httpStatus: 503,
      reason: "CLOUDFLARE_WORKER_ACTIVATION_DISABLED",
    });
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(
      `${url}/readyz`
    );
  });

  it("reports an enabled Worker with missing bindings as a real readiness failure", async () => {
    const fetchImpl = vi.fn(async () =>
      response(503, {
        ok: false,
        readiness: {
          ready: false,
          activation: "enabled",
          transport: "queues",
          selectedMissing: ["JOB_QUEUE"],
          missing: ["JOB_QUEUE"],
        },
      })
    ) as unknown as typeof fetch;

    await expect(
      probeCloudflareStagingRuntimeReadiness({ url, deploymentId: "deploy-2", fetchImpl })
    ).resolves.toMatchObject({
      status: "NOT_READY",
      activation: "enabled",
      transport: "queues",
      missing: ["JOB_QUEUE"],
      httpStatus: 503,
      reason: "CLOUDFLARE_WORKER_RUNTIME_NOT_READY",
    });
  });

  it("accepts a healthy readiness response", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, {
        ok: true,
        readiness: {
          ready: true,
          activation: "enabled",
          transport: "queues",
          missing: [],
        },
      })
    ) as unknown as typeof fetch;

    await expect(
      probeCloudflareStagingRuntimeReadiness({
        url,
        deploymentId: "deploy-1",
        fetchImpl,
      })
    ).resolves.toMatchObject({
      status: "READY",
      activation: "enabled",
      transport: "queues",
      missing: [],
    });
  });

  it("reports application ingress separately when the job runtime is ready", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, {
        ok: true,
        readiness: {
          ready: true,
          activation: "enabled",
          transport: "queues",
          missing: [],
          applicationIngress: {
            enabled: false,
            ready: false,
            missing: ["NODE_HTTP", "PYTHON_HTTP", "Authorization: Bearer secret"],
          },
        },
      })
    ) as unknown as typeof fetch;

    await expect(
      probeCloudflareStagingRuntimeReadiness({ url, deploymentId: "deploy-1", fetchImpl })
    ).resolves.toMatchObject({
      status: "READY",
      applicationIngress: {
        enabled: false,
        ready: false,
        missing: ["NODE_HTTP", "PYTHON_HTTP"],
      },
    });
  });

  it.each([
    "http://smartspec-cloudflare-staging.example.workers.dev",
    "https://other-worker.example.workers.dev",
    "https://smartspec-cloudflare-staging.example.workers.dev.evil.test",
    "https://smartspec-cloudflare-staging.example.workers.dev:8443",
  ])(
    "refuses unsafe worker URL %s without making a request",
    async invalidUrl => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;

      await expect(
        probeCloudflareStagingRuntimeReadiness({
          url: invalidUrl,
          deploymentId: "deploy-1",
          fetchImpl,
        })
      ).resolves.toMatchObject({
        status: "UNAVAILABLE",
        reason: "STAGING_WORKER_URL_INVALID",
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it("distinguishes an unknown deployment from an unreachable probe", async () => {
    await expect(
      probeCloudflareStagingRuntimeReadiness({})
    ).resolves.toMatchObject({ status: "NOT_DEPLOYED" });
    await expect(
      probeCloudflareStagingRuntimeReadiness({
        url,
        deploymentId: "deploy-1",
        fetchImpl: vi.fn(async () => {
          throw new Error("offline");
        }),
      })
    ).resolves.toMatchObject({
      status: "UNAVAILABLE",
      reason: "STAGING_READINESS_PROBE_UNAVAILABLE",
    });
  });
});
