import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { intelligenceResearchRequests } from "../../../drizzle/schema";
import { createCanonicalJobInTransaction } from "../jobControlPlane";
import type { JobDefinition, JobRef } from "../jobControlPlaneTypes";
import { parseResearchRequest } from "./researchContracts";
import type { ResearchRequest } from "./researchContracts";

const RESEARCH_JOB_TYPE = "intelligence.research.execute";

export class IntelligenceResearchPersistenceError extends Error {
  constructor(readonly code: "RESEARCH_REQUEST_INVALID" | "RESEARCH_AUTHORITY_MISMATCH" | "RESEARCH_RUNTIME_NOT_CONFIGURED" | "RESEARCH_PUBLIC_ASYNC_UNSUPPORTED" | "RESEARCH_IDEMPOTENCY_CONFLICT" | "RESEARCH_ADMISSION_INCOMPLETE") {
    super(code);
    this.name = "IntelligenceResearchPersistenceError";
  }
}

/** Resolved by a protected server adapter from auth, project ownership and active policy. */
export interface ResearchAdmissionAuthority {
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  readonly requestedBy: string;
  readonly projectId?: string;
  readonly consumerKind: ResearchRequest["consumerKind"];
  readonly consumerRef: string;
  readonly privacyClass: string;
  readonly outputPolicyRef: string;
  readonly maxCostCredits: number;
  readonly maxExternalCost: number;
  readonly maxWallTimeSeconds: number;
  readonly maxSources: number;
  readonly allowedProviderIds?: readonly string[];
  readonly mandatoryProhibitedProviderIds?: readonly string[];
  readonly requiredRightsRequirements?: readonly string[];
  readonly allowedGeographyRefs?: readonly string[];
  readonly publicResearchAllowed: boolean;
}

export function assertResearchRequestAuthority(request: ResearchRequest, authority: ResearchAdmissionAuthority): void {
  if (request.authorizationScope !== authority.authorizationScope ||
    request.tenantId !== authority.tenantId || request.requestedBy !== authority.requestedBy ||
    request.projectId !== authority.projectId || request.consumerKind !== authority.consumerKind ||
    request.consumerRef !== authority.consumerRef || request.privacyClass !== authority.privacyClass ||
    request.outputPolicyRef !== authority.outputPolicyRef ||
    (request.maxCostCredits !== undefined && request.maxCostCredits > authority.maxCostCredits) ||
    (request.maxExternalCost === "unknown") ||
    (typeof request.maxExternalCost === "number" && request.maxExternalCost > authority.maxExternalCost) ||
    (request.maxWallTimeSeconds !== undefined && request.maxWallTimeSeconds > authority.maxWallTimeSeconds) ||
    (request.maxSources !== undefined && request.maxSources > authority.maxSources) ||
    (request.preferredProviderIds ?? []).some(id => !authority.allowedProviderIds?.includes(id)) ||
    (authority.mandatoryProhibitedProviderIds ?? []).some(id => !request.prohibitedProviderIds?.includes(id)) ||
    (authority.requiredRightsRequirements ?? []).some(id => !request.rightsRequirements?.includes(id)) ||
    (authority.allowedGeographyRefs !== undefined && (request.geographyRefs ?? []).some(ref => !authority.allowedGeographyRefs!.includes(ref))) ||
    (request.authorizationScope === "PUBLIC" && !authority.publicResearchAllowed) ||
    (request.authorizationScope === "TENANT" && (!authority.tenantId || !request.tenantId))) {
    throw new IntelligenceResearchPersistenceError("RESEARCH_AUTHORITY_MISMATCH");
  }
}

export function hashResearchIdempotencyKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function buildResearchRequestPersistenceSnapshot(request: ResearchRequest, idempotencyKeyHash: string): Record<string, unknown> {
  const { idempotencyKey: _discardedRawKey, ...safeRequest } = request;
  return { ...safeRequest, idempotencyKeyHash };
}

/** Canonical jobs currently require a tenant principal; public requests fail closed. */
export function buildIntelligenceResearchJobDefinition(request: ResearchRequest, idempotencyHash: string): JobDefinition {
  if (!parseResearchRequest(request).ok) throw new IntelligenceResearchPersistenceError("RESEARCH_REQUEST_INVALID");
  if (request.authorizationScope !== "TENANT" || !request.tenantId) {
    throw new IntelligenceResearchPersistenceError("RESEARCH_PUBLIC_ASYNC_UNSUPPORTED");
  }
  const maxWallTimeSeconds = request.maxWallTimeSeconds ?? 600;
  const deadlineMs = Math.min(Math.max(maxWallTimeSeconds * 1_000, 30_000), 7_200_000);
  return {
    // The canonical worker registry selects this executor contract. Keep the
    // admission envelope aligned with the registered Spec 266 executor.
    contractVersion: "spec266-research-v1",
    tenantId: request.tenantId,
    jobType: RESEARCH_JOB_TYPE,
    executionClass: "long",
    priority: 30,
    input: {
      contractVersion: request.contractVersion,
      researchRequestId: request.researchRequestId,
    },
    idempotencyKey: `intelligence-research:${idempotencyHash}`,
    activeDedupeKey: `intelligence-research:${hashResearchIdempotencyKey(request.researchRequestId)}`,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 5_000,
      maxDelayMs: 5 * 60_000,
      jitter: "bounded",
      deadlineMs,
      allowedErrorClasses: ["retryable", "timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 2 * 60_000, hardTimeoutMs: 10 * 60_000 },
  };
}

/**
 * Stores the admitted request and its reference-only canonical job in one DB transaction.
 * The caller must pass a real transaction handle; this helper never creates a second job plane.
 */
export async function admitResearchRequestInTransaction(input: {
  readonly query: any;
  readonly request: ResearchRequest;
  readonly authority: ResearchAdmissionAuthority;
  /** Must be resolved by server composition; never copy this from browser input. */
  readonly runtimeAvailable: boolean;
}): Promise<{ readonly requestId: string; readonly job: JobRef; readonly created: boolean }> {
  const { query } = input;
  const parsed = parseResearchRequest(input.request);
  if (!parsed.ok) throw new IntelligenceResearchPersistenceError("RESEARCH_REQUEST_INVALID");
  const request = parsed.value;
  assertResearchRequestAuthority(request, input.authority);
  if (!input.runtimeAvailable) throw new IntelligenceResearchPersistenceError("RESEARCH_RUNTIME_NOT_CONFIGURED");
  const idempotencyKeyHash = hashResearchIdempotencyKey(request.idempotencyKey);
  const requestSnapshot = buildResearchRequestPersistenceSnapshot(request, idempotencyKeyHash);
  const values = {
    id: request.researchRequestId,
    tenantId: request.authorizationScope === "TENANT" ? request.tenantId! : null,
    authorizationScope: request.authorizationScope,
    consumerKind: request.consumerKind,
    consumerRef: request.consumerRef,
    requestedBy: request.requestedBy,
    idempotencyKeyHash,
    projectId: request.projectId ?? null,
    status: "admitted",
    requestJson: requestSnapshot,
  };
  const [admitted] = await query
    .insert(intelligenceResearchRequests)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: intelligenceResearchRequests.id });

  if (!admitted) {
    const [existing] = await query
      .select({
        id: intelligenceResearchRequests.id,
        requestJson: intelligenceResearchRequests.requestJson,
        canonicalJobId: intelligenceResearchRequests.canonicalJobId,
      })
      .from(intelligenceResearchRequests)
      .where(and(
        eq(intelligenceResearchRequests.authorizationScope, request.authorizationScope),
        request.authorizationScope === "TENANT"
          ? eq(intelligenceResearchRequests.tenantId, request.tenantId!)
          : isNull(intelligenceResearchRequests.tenantId),
        eq(intelligenceResearchRequests.idempotencyKeyHash, idempotencyKeyHash),
      ))
      .limit(1);
    if (!existing || canonicalJson(existing.requestJson) !== canonicalJson(requestSnapshot)) {
      throw new IntelligenceResearchPersistenceError("RESEARCH_IDEMPOTENCY_CONFLICT");
    }
    if (!existing.canonicalJobId) throw new IntelligenceResearchPersistenceError("RESEARCH_ADMISSION_INCOMPLETE");
    return { requestId: existing.id, job: { jobId: existing.canonicalJobId, created: false }, created: false };
  }

  const definition = buildIntelligenceResearchJobDefinition(request, idempotencyKeyHash);
  const job = await createCanonicalJobInTransaction({ query, definition, options: { runtimeType: "node_job_worker" } });
  await query
    .update(intelligenceResearchRequests)
    .set({ canonicalJobId: job.jobId, status: "queued", updatedAt: new Date() })
    .where(eq(intelligenceResearchRequests.id, admitted.id));
  return { requestId: admitted.id, job, created: true };
}

/** Preferred public API: enforce that admission and worker/outbox writes share one DB transaction. */
export async function admitResearchRequest(input: {
  readonly database: { transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> };
  readonly request: ResearchRequest;
  readonly authority: ResearchAdmissionAuthority;
  /** Must be resolved by server composition; never copy this from browser input. */
  readonly runtimeAvailable: boolean;
}): Promise<{ readonly requestId: string; readonly job: JobRef; readonly created: boolean }> {
  return input.database.transaction(transaction =>
    admitResearchRequestInTransaction({ query: transaction, request: input.request, authority: input.authority, runtimeAvailable: input.runtimeAvailable }),
  );
}
