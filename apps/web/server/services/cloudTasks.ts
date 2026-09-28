/**
 * Retired Google Cloud Tasks compatibility surface.
 *
 * This file intentionally contains no Google SDK, Cloud Run URL, OIDC, or
 * project configuration. Existing callers are kept temporarily so a missed
 * migration fails closed with an actionable error instead of silently
 * publishing work to the retired runtime.
 */

export type EnqueueTaskOptions = {
  queueName: string;
  handlerPath: string;
  payload: Record<string, unknown>;
  delaySeconds?: number;
  taskId?: string;
  targetService?: "python" | "node";
};

export type CloudTasksConfigStatus = {
  configured: false;
  missingKeys: ["GOOGLE_CLOUD_RUNTIME_RETIRED"];
  projectId: "";
  region: "";
  serviceUrl: "";
  serviceAccountEmail: "";
};

export function getCloudTasksConfigStatus(_targetService: "python" | "node" = "python"): CloudTasksConfigStatus {
  return {
    configured: false,
    missingKeys: ["GOOGLE_CLOUD_RUNTIME_RETIRED"],
    projectId: "",
    region: "",
    serviceUrl: "",
    serviceAccountEmail: "",
  };
}

export async function enqueueTask(_options: EnqueueTaskOptions): Promise<never> {
  throw new Error("GOOGLE_CLOUD_RUNTIME_RETIRED: create a canonical worker_jobs outbox intent for the Cloudflare target");
}

export async function deleteTask(_taskName: string): Promise<void> {
  throw new Error("GOOGLE_CLOUD_RUNTIME_RETIRED: cancel the canonical worker_jobs job instead");
}
