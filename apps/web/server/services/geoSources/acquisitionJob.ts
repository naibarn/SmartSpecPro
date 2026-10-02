import type { JobDefinition } from "../jobControlPlaneTypes";
import { createCanonicalJobInTransaction } from "../jobControlPlane";
import { parseGeoSourcePolicy } from "./contracts";
import type { GeoSourceAdapterDefinition } from "./registry";

export interface ApprovedGeoSourceForRefresh {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceRef: string;
  readonly status: string;
  readonly policy: unknown;
}

export interface GeoSourceRegistryResolver {
  resolve(input: { readonly sourceRef: string; readonly purpose: string; readonly geography: string; readonly capabilityId?: string }):
    | { readonly ok: true; readonly value: Pick<GeoSourceAdapterDefinition, "sourceRef" | "adapterId" | "contractVersion" | "configurationRevision"> }
    | { readonly ok: false; readonly code: string };
}

export type GeoSourceRefreshAdmission =
  | { readonly ok: true; readonly definition: JobDefinition }
  | { readonly ok: false; readonly code: "GEO_SOURCE_NOT_ACTIVE" | "GEO_SOURCE_ADAPTER_NOT_APPROVED" | "GEO_SOURCE_WINDOW_INVALID" };

const ISO_INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

/**
 * Builds the only permitted acquisition envelope after a tenant-scoped source
 * lookup and the server-owned adapter registry have both approved it. No URL,
 * credential, arbitrary cursor or browser audience enters canonical job input.
 */
export function buildGeoSourceRefreshJob(input: {
  readonly source: ApprovedGeoSourceForRefresh;
  readonly registry: GeoSourceRegistryResolver;
  readonly windowStart: string;
  readonly purpose: string;
  readonly geography: string;
  readonly capabilityId?: string;
}): GeoSourceRefreshAdmission {
  const { source } = input;
  if (source.status !== "active") return { ok: false, code: "GEO_SOURCE_NOT_ACTIVE" };
  const policy = parseGeoSourcePolicy(source.policy);
  if (!policy.ok || policy.value.configurationRevision < 1) return { ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED" };
  if (!ISO_INSTANT.test(input.windowStart) || Number.isNaN(Date.parse(input.windowStart))) {
    return { ok: false, code: "GEO_SOURCE_WINDOW_INVALID" };
  }
  const resolved = input.registry.resolve({
    sourceRef: source.sourceRef,
    purpose: input.purpose,
    geography: input.geography,
    ...(input.capabilityId ? { capabilityId: input.capabilityId } : {}),
  });
  if (!resolved.ok) return { ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED" };
  const adapter = resolved.value;
  if (adapter.sourceRef !== source.sourceRef || !Number.isSafeInteger(adapter.configurationRevision) ||
    adapter.configurationRevision !== policy.value.configurationRevision) {
    return { ok: false, code: "GEO_SOURCE_ADAPTER_NOT_APPROVED" };
  }

  const idempotencyKey = `geo-source-refresh:${source.id}:${adapter.configurationRevision}:${input.windowStart}`;
  const definition: JobDefinition = {
    contractVersion: "feature-186-v1",
    tenantId: source.tenantId,
    jobType: "geo.source.refresh",
    executionClass: "long",
    priority: 30,
    input: {
      sourceId: source.id,
      sourceRef: source.sourceRef,
      configurationRevision: adapter.configurationRevision,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.contractVersion,
      windowStart: input.windowStart,
    },
    idempotencyKey,
    activeDedupeKey: `geo-source-refresh:${source.id}`,
    retryPolicy: {
      maxAttempts: 4,
      baseDelayMs: 5_000,
      maxDelayMs: 15 * 60_000,
      jitter: "bounded",
      deadlineMs: 2 * 60 * 60_000,
      allowedErrorClasses: ["retryable", "timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 2 * 60_000, hardTimeoutMs: 10 * 60_000 },
  };
  return { ok: true, definition };
}

/**
 * Admit the job using the caller's existing DB transaction. This keeps the
 * worker_jobs row and outbox intent atomic with any source-side receipt/audit
 * row the caller writes in that transaction.
 */
export async function enqueueGeoSourceRefreshJobInTransaction(input: {
  readonly query: any;
  readonly source: ApprovedGeoSourceForRefresh;
  readonly registry: GeoSourceRegistryResolver;
  readonly windowStart: string;
  readonly purpose: string;
  readonly geography: string;
  readonly capabilityId?: string;
}) {
  const admission = buildGeoSourceRefreshJob(input);
  if (!admission.ok) return admission;
  const job = await createCanonicalJobInTransaction({
    query: input.query,
    definition: admission.definition,
    options: { runtimeType: "node_job_worker" },
  });
  return { ok: true as const, job };
}
