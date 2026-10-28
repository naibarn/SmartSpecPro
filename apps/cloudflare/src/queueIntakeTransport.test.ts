import { describe, expect, it, vi } from "vitest";
import { createCloudflareWorker } from "./index";
import type { CloudflareEnvironment } from "./contracts";
function fixture() {
  const handler = vi.fn().mockResolvedValue("completed"), cron = vi.fn();
  const worker = createCloudflareWorker(handler, undefined, undefined, cron);
  const env: CloudflareEnvironment = { CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_JOB_TRANSPORT: "queues",
    CLOUDFLARE_WORKFLOW_TENANT_ID: "tenant-a", CLOUDFLARE_WORKFLOW_EXPIRES_AT: new Date(Date.now()+60_000).toISOString(),
    CLOUDFLARE_RUNTIME_TOKEN: "fixture-runtime", CLOUDFLARE_CONTROL_PLANE_TOKEN: "fixture-plane",
    PLATFORM_EDGE_ORIGIN: "https://platform.private.example", PLATFORM_EDGE_PRIVATE_HOST: "platform.private.example",
    HYPERDRIVE: { connectionString: "postgres://disposable" }, JOB_QUEUE: { send: vi.fn() } };
  const envelope = { job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
    dispatch_id: "outbox-1", dedupe_key: "dedupe-1", routing_metadata: {} };
  return { handler, cron, worker, env, envelope };
}
describe("mutually exclusive bounded intake transports", () => {
  it("admits Queue intake with its required subset and keeps missing paid capabilities visible", async () => {
    const f = fixture(),r = await f.worker.fetch(new Request("https://runtime.invalid/readyz"),f.env);
    expect(r.status).toBe(200);
    const result = await r.json() as any;
    expect(result.readiness.transport).toBe("queues");expect(result.readiness.missing).toContain("JOB_CONTAINERS");
    const message = { body: f.envelope, ack: vi.fn(), retry: vi.fn() };
    await f.worker.queue({ messages: [message] },f.env);expect(message.ack).toHaveBeenCalledOnce();expect(f.handler).toHaveBeenCalledOnce();
    await f.worker.scheduled({ scheduledTime: Date.now() },f.env);expect(f.cron).not.toHaveBeenCalled();
  });
  it("never consumes messages or creates Workflows under another or expired capability", async () => {
    for (const mode of ["workflows","unknown","expired"]) {
      const f = fixture(),message = { body:f.envelope,ack:vi.fn(),retry:vi.fn() };
      if(mode==="expired") f.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT="2000-01-01T00:00:00Z";else f.env.CLOUDFLARE_JOB_TRANSPORT=mode;
      await f.worker.queue({ messages:[message] },f.env);expect(message.retry).toHaveBeenCalled();expect(f.handler).not.toHaveBeenCalled();
    }
  });
  it("publishes only with the dedicated token and future Queue scope", async () => {
    const f = fixture();
    const request = (token:string) => new Request("https://runtime.invalid/internal/jobs/publish",{ method:"POST",headers:{ authorization:`Bearer ${token}`,"content-type":"application/json" },body:JSON.stringify(f.envelope) });
    expect((await f.worker.fetch(request("wrong"),f.env)).status).toBe(401);
    expect((await f.worker.fetch(request("fixture-runtime"),f.env)).status).toBe(202);
    f.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT="2000-01-01T00:00:00Z";
    expect((await f.worker.fetch(request("fixture-runtime"),f.env)).status).toBe(503);
    expect(f.env.JOB_QUEUE!.send).toHaveBeenCalledOnce();
  });

  it("allows only a scoped synthetic M3 Queue delivery while public HTTP stays on the Linux bridge", async () => {
    const f = fixture();
    const m3Envelope = { ...f.envelope, contract_version: "cloudflare-m3-parity-acceptance-v1" };
    f.env.CLOUDFLARE_ACTIVATION = "disabled";
    f.env.CLOUDFLARE_ENVIRONMENT = "production";
    f.env.CLOUDFLARE_QUEUE_ACCEPTANCE_MODE = "m3-synthetic-v1";
    f.env.CLOUDFLARE_RUNTIME_TOKEN = "r".repeat(32);
    f.env.CLOUDFLARE_CONTROL_PLANE_TOKEN = "c".repeat(32);
    f.env.PLATFORM_EDGE_ORIGIN = "https://platform.private.example";
    f.env.PLATFORM_EDGE_PRIVATE_HOST = "platform.private.example";
    f.env.CLOUDFLARE_INGRESS_MODE = "production-origin-bridge-v1";
    f.env.AUTH_ORIGIN = "https://origin.private.example";
    f.env.AUTH_ORIGIN_PRIVATE_HOST = "origin.private.example";
    f.env.AUTH_ORIGIN_TOKEN = "a".repeat(32);
    f.env.AUTH_ORIGIN_ACCESS_CLIENT_ID = "access-client-id";
    f.env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET = "s".repeat(32);
    f.env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS = JSON.stringify(["https://smartaihub.app"]);
    f.env.CF_VERSION_METADATA = { id: "11111111-1111-4111-8111-111111111111" };

    const publish = (contract_version: string, token: string) => f.worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...m3Envelope, contract_version }),
    }), f.env);
    expect((await publish("feature-186-v1", "r".repeat(32))).status).toBe(403);
    expect((await publish("cloudflare-m3-parity-acceptance-v1", "wrong")).status).toBe(401);
    expect((await publish("cloudflare-m3-parity-acceptance-v1", "r".repeat(32))).status).toBe(202);

    const message = { id: "message-1", body: m3Envelope, ack: vi.fn(), retry: vi.fn() };
    await f.worker.queue({ queue: "smartspec-canonical-job-queue-production", messages: [message] }, f.env);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(f.handler).toHaveBeenCalledWith(m3Envelope, expect.objectContaining({
      __m3QueueDelivery: { queueName: "smartspec-canonical-job-queue-production", messageId: "message-1",
        workerVersionId: "11111111-1111-4111-8111-111111111111" },
    }));

    const fetchOrigin = vi.fn(async () => new Response("linux-origin"));
    vi.stubGlobal("fetch", fetchOrigin);
    const response = await f.worker.fetch(new Request("https://smartaihub.app/"), f.env);
    expect(await response.text()).toBe("linux-origin");
    expect(fetchOrigin).toHaveBeenCalledOnce();
    expect(f.env.JOB_QUEUE!.send).toHaveBeenCalledOnce();
  });

  it("keeps M3 Queue mode disabled when its tenant authority or control-plane credentials are missing", async () => {
    const f = fixture();
    f.env.CLOUDFLARE_ACTIVATION = "disabled";
    f.env.CLOUDFLARE_ENVIRONMENT = "production";
    f.env.CLOUDFLARE_QUEUE_ACCEPTANCE_MODE = "m3-synthetic-v1";
    f.env.CLOUDFLARE_RUNTIME_TOKEN = "r".repeat(32);
    f.env.CLOUDFLARE_CONTROL_PLANE_TOKEN = "r".repeat(32);
    f.env.PLATFORM_EDGE_ORIGIN = "https://platform.private.example";
    f.env.PLATFORM_EDGE_PRIVATE_HOST = "platform.private.example";
    const message = { id: "message-1", body: { ...f.envelope, contract_version: "cloudflare-m3-parity-acceptance-v1" },
      ack: vi.fn(), retry: vi.fn() };
    await f.worker.queue({ queue: "smartspec-canonical-job-queue-production", messages: [message] }, f.env);
    expect(message.retry).toHaveBeenCalledOnce();
    expect(f.handler).not.toHaveBeenCalled();
  });
});
