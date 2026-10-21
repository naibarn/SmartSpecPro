import { CLOUDFLARE_CONTAINER_ON_DEMAND, CLOUDFLARE_MEDIA_PROBE, requiresContainerMediaProbe } from "./cloudflareMediaProbeContracts";
import {
  assertFeature186RuntimeConfigured,
  isCloudflareHardCutoverEnabled,
} from "./cloudflareRuntimeTarget";
import {
  CloudflareQueueHttpJobTransportAdapter,
  PostgresPullJobTransportAdapter,
  type JobTransportAdapter,
} from "./jobTransportAdapters";
import { CloudflareWorkflowHttpJobTransportAdapter } from "./cloudflareWorkflowHttpAdapter";

/**
 * Select the transport for the canonical envelope in one place. Both the
 * web outbox publisher and the reconciler use this factory so local execution
 * and the later Cloudflare migration cannot drift into different contracts.
 */
export function createFeature186RuntimeAdapter(job?: { runtimeType: string; jobType: string; executionClass: string; tenantId?: string; inputJson?: unknown; requiredCapabilities?: unknown }): JobTransportAdapter {
  // This bounded opt-in never enables the global Queue cutover. Unrelated
  // Node/Python jobs retain their existing transport and rollback behavior.
  const mediaProbe = process.env.CLOUDFLARE_CONTAINER_POLICY === CLOUDFLARE_CONTAINER_ON_DEMAND && process.env.FEATURE_186_CLOUDFLARE_MEDIA_PROBE === "true" && process.env.CLOUDFLARE_MEDIA_PROBE === CLOUDFLARE_MEDIA_PROBE &&
    job?.runtimeType === "python_job_worker" && requiresContainerMediaProbe({ ...job, input: job.inputJson });
  const emergency = process.env.FEATURE_186_CLOUDFLARE_WORKFLOW_INTAKE === "true" && job?.runtimeType === "node_job_worker" &&
    job.jobType === "emergency.report.intake" && job.executionClass === "short";
  if ((mediaProbe || emergency) && job?.tenantId &&
      job.tenantId === process.env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim() &&
      Date.parse(process.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now()) {
    const url = process.env.CLOUDFLARE_WORKFLOW_RUNTIME_URL?.trim();
    const token = process.env.CLOUDFLARE_WORKFLOW_RUNTIME_TOKEN?.trim();
    if (!url || !token) throw new Error("CLOUDFLARE_WORKFLOW_RUNTIME_CONFIG_INCOMPLETE");
    const transport = process.env.CLOUDFLARE_WORKFLOW_TRANSPORT?.trim() || "workflows";
    if (transport === "queues") return new CloudflareQueueHttpJobTransportAdapter(url, token);
    if (transport !== "workflows") throw new Error("CLOUDFLARE_INTAKE_TRANSPORT_INVALID");
    return new CloudflareWorkflowHttpJobTransportAdapter(url, token);
  }
  if (!isCloudflareHardCutoverEnabled()) {
    return new PostgresPullJobTransportAdapter();
  }

  assertFeature186RuntimeConfigured();
  const runtimeUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim();
  if (!runtimeUrl) {
    throw new Error("CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE");
  }
  return new CloudflareQueueHttpJobTransportAdapter(
    runtimeUrl,
    process.env.CLOUDFLARE_RUNTIME_TOKEN ?? ""
  );
}
