import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CloudflareWorkflowHttpJobTransportAdapter } from "../cloudflareWorkflowHttpAdapter";

const dispatch = { jobId: "job-1", businessAttempt: 1, outboxId: "dispatch-1", dedupeKey: "job:job-1:attempt:1",
  contractVersion: "feature-186-v1", routingMetadata: {} };
const workflowInstanceId = `cfw-${createHash("sha256").update(dispatch.dedupeKey).digest("hex")}`;
const accepted = { accepted: true, workflowInstanceId, dispatchId: dispatch.outboxId };

describe("canonical Workflow HTTP adapter", () => {
  it("retains Workflow identity and the exact canonical outbox dispatch id", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(accepted)));
    const adapter = new CloudflareWorkflowHttpJobTransportAdapter("https://stage.example.workers.dev", "test-token", fetch);
    const ref = await adapter.publish(dispatch);
    expect(ref).toEqual({ jobId: "job-1", attemptId: undefined, adapter: "cloudflare-workflows", referenceNamespace: "cloudflare-workflows",
      dispatchId: "dispatch-1", dedupeKey: dispatch.dedupeKey, workflowInstanceId });
    expect(fetch.mock.calls[0][0]).toBe("https://stage.example.workers.dev/internal/jobs/workflows/publish");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ job_id: "job-1", business_attempt: 1, attempt_id: null,
      contract_version: "feature-186-v1", dispatch_id: "dispatch-1", dedupe_key: dispatch.dedupeKey, routing_metadata: {} });
    expect(adapter.supports({ jobType: "emergency.report.intake", executionClass: "short", contractVersion: "feature-186-v1" })).toBe(true);
    expect(adapter.supports({ jobType: "database.backup", executionClass: "short", contractVersion: "feature-186-v1" })).toBe(false);
  });

  it.each(["complete", "running", "waitingForPause"])("treats native %s as transport evidence, preserving canonical business authority", async status => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(accepted)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflowInstanceId, status })));
    const adapter = new CloudflareWorkflowHttpJobTransportAdapter("https://stage.example.workers.dev", "test-token", fetch);
    const ref = await adapter.publish(dispatch);
    expect(await adapter.inspect(ref)).toBe("published");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ dedupe_key: dispatch.dedupeKey, workflow_instance_id: workflowInstanceId });
  });

  it("does not suppress ambiguous provider errors and rejects mismatched receipts", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...accepted, workflowInstanceId: "foreign" })));
    const adapter = new CloudflareWorkflowHttpJobTransportAdapter("https://stage.example.workers.dev", "test-token", fetch);
    await expect(adapter.publish(dispatch)).rejects.toThrow("CLOUDFLARE_WORKFLOW_HTTP_503");
    await expect(adapter.publish(dispatch)).rejects.toThrow("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
  });

  it("rejects unsafe routing before making a provider call", async () => {
    const fetch = vi.fn();
    const adapter = new CloudflareWorkflowHttpJobTransportAdapter("https://stage.example.workers.dev", "test-token", fetch);
    await expect(adapter.publish({ ...dispatch, routingMetadata: { token: "secret" } })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels only a matching provider reference", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(accepted)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflowInstanceId, terminated: true })));
    const adapter = new CloudflareWorkflowHttpJobTransportAdapter("https://stage.example.workers.dev", "test-token", fetch);
    const ref = await adapter.publish(dispatch);
    await expect(adapter.cancel({ ...ref, workflowInstanceId: "cfw-foreign" })).rejects.toThrow("REFERENCE_INVALID");
    await adapter.cancel(ref);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["http://stage.example", "https://user:pass@stage.example", "https://stage.example/path", "https://stage.example?redirect=evil"])("rejects an unsafe configured endpoint: %s", url => {
    expect(() => new CloudflareWorkflowHttpJobTransportAdapter(url, "test-token")).toThrow();
  });
});
