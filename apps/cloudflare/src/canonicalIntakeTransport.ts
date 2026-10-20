import type { CloudflareEnvironment } from "./contracts";
export function isCanonicalIntakeTransportEnabled(env: CloudflareEnvironment, transport: "workflows" | "queues") {
  return env.CLOUDFLARE_ACTIVATION === "enabled" && env.CLOUDFLARE_JOB_TRANSPORT === transport &&
    Boolean(env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim()) &&
    Date.parse(env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? "") > Date.now();
}
