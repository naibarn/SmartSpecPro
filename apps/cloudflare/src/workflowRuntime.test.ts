import { describe, expect, it, vi } from "vitest";
import { handleCanonicalWorkflowRequest, runCanonicalWorkflow } from "./workflowRuntime";
import { createCloudflareWorker } from "./index";
import type { CloudflareEnvironment } from "./contracts";

const envelope = { job_id: "job-1", business_attempt: 1, attempt_id: null, contract_version: "feature-186-v1",
  dispatch_id: "dispatch-1", dedupe_key: "job:job-1:attempt:1", routing_metadata: {} };
function setup() {
  const instance = { id: "", status: vi.fn().mockResolvedValue({ status: "running" }), terminate: vi.fn() };
  const binding = { create: vi.fn(async ({ id }) => ({ ...instance, id })), get: vi.fn(async id => ({ ...instance, id })) };
  const env: CloudflareEnvironment = { CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_JOB_TRANSPORT: "workflows",
    CLOUDFLARE_RUNTIME_TOKEN: "test-runtime-token", HYPERDRIVE: { connectionString: "postgres://test" }, JOB_WORKFLOW: binding,
    PLATFORM_EDGE_ORIGIN: "https://platform.private.example", PLATFORM_EDGE_PRIVATE_HOST: "platform.private.example",
    CLOUDFLARE_CONTROL_PLANE_TOKEN: "test-dedicated-control-plane-token" };
  return { env, binding, instance };
}
const request = (action = "publish", body: unknown = action === "publish" ? envelope : { dedupe_key: envelope.dedupe_key }) => new Request(`https://runtime.invalid/internal/jobs/workflows/${action}`, {
  method: "POST", headers: { authorization: "Bearer test-runtime-token", "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("native canonical Workflow transport", () => {
  it("publishes the canonical envelope using a deterministic native instance id", async () => {
    const { env, binding } = setup();
    const first = await handleCanonicalWorkflowRequest(request(), env);
    const second = await handleCanonicalWorkflowRequest(request(), env);
    expect(first.status).toBe(202);
    const body = await first.json() as { workflowInstanceId: string };
    expect(body.workflowInstanceId).toMatch(/^cfw-[a-f0-9]{64}$/);
    expect(await second.json()).toEqual(body);
    expect(binding.create).toHaveBeenLastCalledWith({ id: body.workflowInstanceId, params: envelope });
  });

  it("recovers a lost create response only after native status confirms the exact instance", async () => {
    const { env, binding, instance } = setup();
    binding.create.mockRejectedValue(new Error("response lost"));
    expect((await handleCanonicalWorkflowRequest(request(), env)).status).toBe(200);
    expect(instance.status).toHaveBeenCalledOnce();
    binding.get.mockRejectedValue(new Error("not found or unavailable"));
    expect((await handleCanonicalWorkflowRequest(request(), env)).status).toBe(503);
  });

  it("rejects a provider identity mismatch without treating it as a duplicate", async () => {
    const { env, binding, instance } = setup();
    binding.create.mockResolvedValue({ ...instance, id: "foreign-instance" });
    expect((await handleCanonicalWorkflowRequest(request(), env)).status).toBe(502);
    expect(binding.get).not.toHaveBeenCalled();
  });

  it("uses the native instance status() and terminate() methods", async () => {
    const { env, instance } = setup();
    expect(await (await handleCanonicalWorkflowRequest(request("inspect"), env)).json()).toMatchObject({ status: "running" });
    expect((await handleCanonicalWorkflowRequest(request("cancel"), env)).status).toBe(200);
    expect(instance.terminate).toHaveBeenCalledOnce();
  });

  it("fails closed before provider calls on disabled mode, bad auth and unsafe envelope", async () => {
    const { env, binding } = setup();
    expect((await handleCanonicalWorkflowRequest(request(), { ...env, CLOUDFLARE_ACTIVATION: "disabled" })).status).toBe(503);
    expect((await handleCanonicalWorkflowRequest(request(), { ...env, CLOUDFLARE_JOB_TRANSPORT: undefined })).status).toBe(503);
    expect((await handleCanonicalWorkflowRequest(request(), { ...env, CLOUDFLARE_RUNTIME_TOKEN: "different" })).status).toBe(401);
    expect((await handleCanonicalWorkflowRequest(request("publish", { ...envelope, routing_metadata: { token: "secret" } }), env)).status).toBe(400);
    expect(binding.create).not.toHaveBeenCalled(); expect(binding.get).not.toHaveBeenCalled();
  });

  it.each(["completed", "retry", "quarantined"] as const)("checkpoints only the %s disposition, never leases or job output", async disposition => {
    const { env } = setup();
    const handler = vi.fn().mockResolvedValue(disposition);
    const step = { do: vi.fn(async (_name, _config, run) => run()) };
    const result = await runCanonicalWorkflow(envelope, env, step as never, handler);
    expect(result).toEqual({ jobId: envelope.job_id, businessAttempt: 1, disposition });
    expect(step.do).toHaveBeenCalledWith("canonical-delivery", expect.objectContaining({ retries: { limit: 5, delay: "10 seconds", backoff: "exponential" } }), expect.any(Function));
    expect(handler).toHaveBeenCalledWith(envelope, env);
  });

  it("lets transport/control-plane errors reach Workflow retry instead of recording false success", async () => {
    const { env } = setup();
    const step = { do: vi.fn(async (_name, _config, run) => run()) };
    await expect(runCanonicalWorkflow(envelope, env, step as never, vi.fn().mockRejectedValue(new Error("CONTROL_PLANE_UNAVAILABLE"))))
      .rejects.toThrow("CONTROL_PLANE_UNAVAILABLE");
  });

  it("reports Workflow-only readiness while honestly retaining the other missing capabilities", async () => {
    const { env } = setup();
    const worker = createCloudflareWorker(undefined, undefined, undefined, undefined, undefined, undefined, undefined, { workflowHandlerConfigured: true });
    const response = await worker.fetch(new Request("https://runtime.invalid/readyz"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, readiness: { transport: "workflows", selectedMissing: [], missing: expect.arrayContaining(["JOB_CONTAINERS", "WORKER_APP"]), jobHandlerConfigured: true } });
    expect((await worker.fetch(new Request("https://runtime.invalid/readyz"), { ...env, CLOUDFLARE_CONTROL_PLANE_TOKEN: undefined })).status).toBe(503);
  });

  it("does not consume or publish Queue work when only Workflow is enabled", async () => {
    const { env } = setup();
    const handler = vi.fn().mockResolvedValue("completed");
    const worker = createCloudflareWorker(handler);
    const message = { body: envelope, ack: vi.fn(), retry: vi.fn() };
    await worker.queue({ messages: [message] }, env);
    expect(message.retry).toHaveBeenCalledOnce(); expect(message.ack).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    const queueRequest = new Request("https://runtime.invalid/internal/jobs/publish", {
      method: "POST", body: JSON.stringify(envelope), headers: { authorization: "Bearer test-runtime-token" },
    });
    expect((await worker.fetch(queueRequest, env)).status).toBe(409);
  });
});
