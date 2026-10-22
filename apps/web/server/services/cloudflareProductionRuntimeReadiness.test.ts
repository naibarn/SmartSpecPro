import { describe, expect, it, vi } from "vitest";
import { probeCloudflareProductionRuntimeReadiness } from "./cloudflareProductionRuntimeReadiness";

function response(status: number, body: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

describe("probeCloudflareProductionRuntimeReadiness", () => {
  it("infers the pinned Queue profile when an older Worker reports only its full binding inventory", async () => {
    const allBindings = ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"];
    const fetchImpl = vi.fn(async () => response(503, {
      ok: false, readiness: {
        activation: "disabled", environment: "production",
        missing: allBindings,
        ready: false, jobHandlerConfigured: false,
      },
    })) as unknown as typeof fetch;
    await expect(probeCloudflareProductionRuntimeReadiness({ fetchImpl })).resolves.toMatchObject({
      status: "NOT_READY", environment: "production", activation: "disabled", transport: "queues", httpStatus: 503,
      missing: ["HYPERDRIVE", "JOB_QUEUE"], unconfigured: allBindings,
      jobHandlerConfigured: false,
    });
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe("https://runtime.smartaihub.app/readyz");
  });

  it("separates selected-transport blockers from other unconfigured capabilities", async () => {
    const allBindings = ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"];
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(503, {
        ok: false, readiness: {
          activation: "enabled", environment: "production", transport: "queues",
          selectedMissing: ["HYPERDRIVE", "JOB_QUEUE"], missing: allBindings, ready: false,
        },
      })) as unknown as typeof fetch,
    })).resolves.toMatchObject({
      status: "NOT_READY", transport: "queues", missing: ["HYPERDRIVE", "JOB_QUEUE"], unconfigured: allBindings,
    });
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

  it("identifies Cloudflare Error 1010 as an edge-blocked probe, not a Worker readiness failure", async () => {
    await expect(probeCloudflareProductionRuntimeReadiness({
      fetchImpl: vi.fn(async () => response(403, {
        type: "about:blank", title: "Error 1010: Access denied", status: 403,
        error_code: 1010, error_name: "browser_signature_banned", error_category: "access_denied",
      })) as unknown as typeof fetch,
    })).resolves.toMatchObject({
      status: "UNAVAILABLE", environment: "unknown", httpStatus: 403,
      missing: [], unconfigured: [], reason: "PRODUCTION_READINESS_EDGE_BROWSER_SIGNATURE_BLOCKED",
    });
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
