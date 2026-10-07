import type { DrizzleDB } from "../db";
import { withCloudflareCredential } from "./cloudflareCredentialCenter";

export type RuntimeEvidenceStatus = "OBSERVED" | "UNAVAILABLE" | "NOT_CONFIGURED" | "PERMISSION_DENIED" | "STALE" | "ERROR";
export type RuntimeEvidence<T> = { status: RuntimeEvidenceStatus; observedAt: string; source: string; value: T | null; diagnostic?: string };

type CloudflareFetch = (url: string, init: RequestInit) => Promise<Response>;
type JsonResponse = { response: Response; body: Record<string, unknown> | null };

async function requestJson(fetchImpl: CloudflareFetch, url: string, token: string): Promise<JsonResponse> {
  const response = await fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}

function failureStatus(response: Response): RuntimeEvidenceStatus {
  if (response.status === 401 || response.status === 403) return "PERMISSION_DENIED";
  if (response.status === 404) return "UNAVAILABLE";
  return "ERROR";
}

async function cloudflareQuery<T>(input: {
  db: DrizzleDB; profile: "audit" | "deployment"; path: string; source: string;
  normalize: (body: Record<string, unknown>, observedAt: string) => T | null; fetchImpl?: CloudflareFetch; now?: Date;
}): Promise<RuntimeEvidence<T>> {
  const observedAt = (input.now ?? new Date()).toISOString();
  try {
    const resolved = await withCloudflareCredential(input.db, input.profile, async token => {
      const { response, body } = await requestJson(input.fetchImpl ?? fetch, `https://api.cloudflare.com/client/v4${input.path}`, token);
      if (!response.ok) return { status: failureStatus(response), value: null } as const;
      if (body?.success !== true) return { status: "ERROR", value: null } as const;
      const value = input.normalize(body, observedAt);
      return value === null ? { status: "UNAVAILABLE", value: null } as const : { status: "OBSERVED", value } as const;
    });
    if (!resolved.configured) return { status: "NOT_CONFIGURED", observedAt, source: input.source, value: null };
    return { ...resolved.value, observedAt, source: input.source };
  } catch (error) {
    return { status: "ERROR", observedAt, source: input.source, value: null, diagnostic: error instanceof Error ? error.name : "unknown" };
  }
}

export function getCloudflareWorkerDeploymentEvidence(input: {
  db: DrizzleDB; accountId: string; scriptName: string; fetchImpl?: CloudflareFetch; now?: Date;
}) {
  const path = `/accounts/${encodeURIComponent(input.accountId)}/workers/scripts/${encodeURIComponent(input.scriptName)}/deployments`;
  return cloudflareQuery({
    db: input.db, profile: "deployment", path, source: "cloudflare_workers_api", fetchImpl: input.fetchImpl, now: input.now,
    normalize: body => {
      const result = body.result as Record<string, unknown> | null;
      const deployments = result?.deployments;
      if (!Array.isArray(deployments) || deployments.length === 0) return null;
      const deployment = deployments[0] as Record<string, unknown>;
      const versions = Array.isArray(deployment.versions) ? deployment.versions as Array<Record<string, unknown>> : [];
      return { accountId: input.accountId, scriptName: input.scriptName, deploymentId: typeof deployment.id === "string" ? deployment.id : null,
        createdAt: typeof deployment.created_on === "string" ? deployment.created_on : null,
        versions: versions.map(version => ({ versionId: typeof version.version_id === "string" ? version.version_id : null, percentage: typeof version.percentage === "number" ? version.percentage : null })) };
    },
  });
}

export function getCloudflareContainerInstanceEvidence(input: {
  db: DrizzleDB; accountId: string; applicationId: string; fetchImpl?: CloudflareFetch; now?: Date;
}) {
  const path = `/accounts/${encodeURIComponent(input.accountId)}/containers/applications/${encodeURIComponent(input.applicationId)}/instances-v2`;
  return cloudflareQuery({
    db: input.db, profile: "deployment", path, source: "cloudflare_containers_api", fetchImpl: input.fetchImpl, now: input.now,
    normalize: body => {
      const instances = body.result;
      if (!Array.isArray(instances)) return null;
      return { accountId: input.accountId, applicationId: input.applicationId,
        instances: instances.map(instance => {
          const record = instance as Record<string, unknown>;
          return { id: typeof record.id === "string" ? record.id : null, image: typeof record.image === "string" ? record.image : null,
            status: typeof record.status === "string" ? record.status : null, state: typeof record.state === "string" ? record.state : null,
            updatedAt: typeof record.updated_at === "string" ? record.updated_at : null };
        }) };
    },
  });
}
