import { createHash } from "node:crypto";
import { buildCloudflareJobEnvelope } from "./cloudflareJobAdapters";
import type { DispatchRef, DispatchRequest } from "./jobControlPlaneTypes";
import type { JobTransportAdapter, TransportObservation } from "./jobTransportAdapters";

/** Dedicated Workflow transport. It never masquerades as a Queue dispatch,
 * and provider delivery completion is not canonical business completion. */
export class CloudflareWorkflowHttpJobTransportAdapter implements JobTransportAdapter {
  readonly name = "cloudflare-workflows";
  readonly referenceNamespace = "cloudflare-workflows";
  private readonly origin: string;

  constructor(baseUrl: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !token.trim()) {
      throw new Error("CLOUDFLARE_WORKFLOW_RUNTIME_CONFIG_INVALID");
    }
    this.origin = url.origin;
  }

  supports(input: { jobType: string; executionClass: string; contractVersion: string }): boolean {
    return input.jobType === "emergency.report.intake" && input.executionClass === "short" && input.contractVersion === "feature-186-v1";
  }

  private instanceId(dedupeKey: string): string {
    return `cfw-${createHash("sha256").update(dedupeKey).digest("hex")}`;
  }

  private async call(action: "publish" | "inspect" | "cancel", body: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.origin}/internal/jobs/workflows/${action}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`CLOUDFLARE_WORKFLOW_HTTP_${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 16 * 1024) throw new Error("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
    return result as Record<string, unknown>;
  }

  async publish(request: DispatchRequest): Promise<DispatchRef> {
    const envelope = buildCloudflareJobEnvelope(request);
    const workflowInstanceId = this.instanceId(request.dedupeKey);
    const body = await this.call("publish", envelope);
    if (body.accepted !== true || body.workflowInstanceId !== workflowInstanceId || body.dispatchId !== request.outboxId) {
      throw new Error("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
    }
    return { jobId: request.jobId, attemptId: request.attemptId, adapter: this.name, referenceNamespace: this.referenceNamespace,
      dispatchId: request.outboxId, dedupeKey: request.dedupeKey, workflowInstanceId };
  }

  private referenceBody(reference: DispatchRef) {
    const expected = this.instanceId(reference.dedupeKey);
    if (reference.adapter !== this.name || reference.referenceNamespace !== this.referenceNamespace || reference.workflowInstanceId !== expected) {
      throw new Error("CLOUDFLARE_WORKFLOW_REFERENCE_INVALID");
    }
    return { dedupe_key: reference.dedupeKey, workflow_instance_id: expected };
  }

  async inspect(reference: DispatchRef): Promise<TransportObservation> {
    const request = this.referenceBody(reference);
    const body = await this.call("inspect", request);
    if (body.workflowInstanceId !== request.workflow_instance_id) throw new Error("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
    // A 'complete' Workflow may have durably scheduled a canonical retry.
    // Provider status is transport evidence only; worker_jobs owns success.
    if (["errored", "terminated"].includes(String(body.status))) return "failed";
    if (["queued", "running", "paused", "waiting", "waitingForPause", "rollingBack", "complete"].includes(String(body.status))) return "published";
    return "unknown";
  }

  async cancel(reference: DispatchRef): Promise<void> {
    const request = this.referenceBody(reference);
    const body = await this.call("cancel", request);
    if (body.workflowInstanceId !== request.workflow_instance_id || body.terminated !== true) throw new Error("CLOUDFLARE_WORKFLOW_RESPONSE_INVALID");
  }
}
