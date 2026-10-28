import type { CloudflareEnvironment } from "./contracts";
export const M3_SYNTHETIC_QUEUE_ACCEPTANCE_MODE = "m3-synthetic-v1" as const;

export function isCanonicalIntakeTransportEnabled(env: CloudflareEnvironment, transport: "workflows" | "queues") {
  return env.CLOUDFLARE_ACTIVATION === "enabled" && env.CLOUDFLARE_JOB_TRANSPORT === transport &&
    Boolean(env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim()) &&
    Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now();
}

/** Short-lived, synthetic M3 jobs may use the existing Queue consumer while
 * public HTTP remains on the accepted origin bridge and general activation is
 * disabled. The Queue Worker still rejects every non-M3 contract/job. */
export function isM3SyntheticQueueAcceptanceEnabled(env: CloudflareEnvironment) {
  const runtimeToken = env.CLOUDFLARE_RUNTIME_TOKEN?.trim();
  const controlPlaneToken = env.CLOUDFLARE_CONTROL_PLANE_TOKEN?.trim();
  return env.CLOUDFLARE_QUEUE_ACCEPTANCE_MODE === M3_SYNTHETIC_QUEUE_ACCEPTANCE_MODE &&
    env.CLOUDFLARE_ENVIRONMENT === "production" && env.CLOUDFLARE_JOB_TRANSPORT === "queues" &&
    Boolean(env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim()) &&
    Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now() &&
    Boolean(runtimeToken && runtimeToken.length >= 32 && controlPlaneToken && controlPlaneToken.length >= 32 &&
      runtimeToken !== controlPlaneToken) &&
    Boolean(env.PLATFORM_EDGE_ORIGIN?.trim() && env.PLATFORM_EDGE_PRIVATE_HOST?.trim());
}
