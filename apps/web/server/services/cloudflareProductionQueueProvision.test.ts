import { describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_PRODUCTION_QUEUE_NAME, createProductionQueue, productionQueueName } from "./cloudflareProductionQueueProvision";

const accountRef = "a".repeat(32);
const scope = { tenantId: "tenant-a", projectId: "project-a", accountRef, token: "test-token", assertAuthorized: vi.fn(async () => {}) };
const response = (result: unknown, status = 200, totalPages = 1) => new Response(JSON.stringify({ success: status < 300, result,
  result_info: { total_pages: totalPages } }), { status, headers: { "content-type": "application/json" } });

describe("Cloudflare Production Queue preparation", () => {
  it("uses the exact queue name bound by the production Worker config", () => {
    const name = productionQueueName("tenant-a", "project-a");
    expect(name).toBe("smartspec-canonical-job-queue-production");
    expect(name).toBe(CLOUDFLARE_PRODUCTION_QUEUE_NAME);
    expect(productionQueueName("tenant-b", "project-a")).toBe(name);
    expect(productionQueueName("tenant-a", "project-b")).toBe(name);
  });

  it("creates only the missing Production queue and verifies provider readback", async () => {
    const name = productionQueueName("tenant-a", "project-a"), queueId = "b".repeat(32);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(_url));
      if (url.pathname.endsWith("/queues") && init?.method === "GET") return response([]);
      if (url.pathname.endsWith("/queues") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ queue_name: name });
        return response({ queue_id: queueId, queue_name: name }, 200);
      }
      if (url.pathname.endsWith(`/queues/${queueId}`)) return response({ queue_id: queueId, queue_name: name, consumers_total_count: 0 });
      throw new Error(`Unexpected request ${init?.method} ${url.pathname}`);
    });
    const result = await createProductionQueue({ ...scope, projectId: "project-a", fetchImpl });
    expect(result).toMatchObject({ accountRef, queueId, queueName: name, environment: "production", providerConfigurationVerified: true,
      workerBound: false, trafficShifted: false });
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "POST", "GET"]);
    expect(scope.assertAuthorized).toHaveBeenCalled();
  });

  it("reuses the exact deterministic queue after an uncertain create retry without a second write", async () => {
    const name = productionQueueName("tenant-a", "project-a"), queueId = "c".repeat(32);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(_url));
      if (url.pathname.endsWith("/queues") && init?.method !== "POST") return response([{ queue_id: queueId, queue_name: name }]);
      if (url.pathname.endsWith(`/queues/${queueId}`)) return response({ queue_id: queueId, queue_name: name, consumers_total_count: 0 });
      throw new Error(`Unexpected request ${init?.method} ${url.pathname}`);
    });
    const result = await createProductionQueue({ ...scope, projectId: "project-a", fetchImpl });
    expect(result.queueId).toBe(queueId);
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("fails closed when provider inventory is incomplete or readback has a consumer", async () => {
    const incomplete = vi.fn(async () => response([], 200, 11));
    await expect(createProductionQueue({ ...scope, projectId: "project-a", fetchImpl: incomplete })).rejects.toThrow("INVENTORY_TOO_LARGE");

    const name = productionQueueName("tenant-a", "project-a"), queueId = "d".repeat(32);
    const consumed = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(_url));
      if (url.pathname.endsWith("/queues") && init?.method === "GET") return response([]);
      if (url.pathname.endsWith("/queues") && init?.method === "POST") return response({ queue_id: queueId, queue_name: name });
      return response({ queue_id: queueId, queue_name: name, consumers_total_count: 1 });
    });
    await expect(createProductionQueue({ ...scope, projectId: "project-a", fetchImpl: consumed })).rejects.toThrow("READBACK_MISMATCH");
  });

  it("returns the sanitized Cloudflare error code when Queue Write permission is denied", async () => {
    const forbidden = vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "secret-bearing provider text" }] }),
      { status: 403, headers: { "content-type": "application/json" } }));
    await expect(createProductionQueue({ ...scope, projectId: "project-a", fetchImpl: forbidden })).rejects.toThrow("CLOUDFLARE_PRODUCTION_QUEUE_HTTP_403_CF_10000");
  });
});
