import { describe, expect, it, vi } from "vitest";
import { probeCloudflareProductionRuntimeReadiness } from "./cloudflareProductionRuntimeReadiness";

function response(status: number, body: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

describe("probeCloudflareProductionRuntimeReadiness", () => {
  it("reports production activation and missing bindings from the fixed Worker endpoint", async () => {
    const fetchImpl = vi.fn(async () => response(503, {
      ok: false, readiness: {
        activation: "disabled", environment: "production",
        missing: ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"],
        ready: false, jobHandlerConfigured: false,
      },
    })) as unknown as typeof fetch;
    await expect(probeCloudflareProductionRuntimeReadiness({ fetchImpl })).resolves.toMatchObject({
      status: "NOT_READY", environment: "production", activation: "disabled", httpStatus: 503,
      missing: ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"],
      jobHandlerConfigured: false,
    });
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe("https://runtime.smartaihub.app/readyz");
  });

  it("accepts only an explicitly ready production response with no missing bindings", async () => {
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(200, { ok: true, environment: "production", activation: "enabled", missing: [] })) as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: "READY", environment: "production", missing: [] });
  });

  it("rejects a response for another environment or a malformed response", async () => {
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(200, { ok: true, environment: "staging", missing: [] })) as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "PRODUCTION_READINESS_RESPONSE_INVALID" });
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(200, { ok: true, environment: "production" })) as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "PRODUCTION_READINESS_RESPONSE_INVALID" });
  });

  it("fails closed on non-JSON and unreachable probes", async () => {
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(200, "ready", "text/plain")) as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "PRODUCTION_READINESS_RESPONSE_INVALID" });
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch,
    })).resolves.toMatchObject({ status: "UNAVAILABLE", reason: "PRODUCTION_READINESS_PROBE_UNAVAILABLE" });
  });
});
