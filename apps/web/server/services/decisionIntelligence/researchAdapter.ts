import { createHash } from "node:crypto";
import { parseResearchRequest, type ResearchMode, type ResearchRequest } from "../intelligenceFabric/researchContracts";
import type { DataRequirement } from "../intelligenceFabric/resolver";

export type ResearchNeedReason = "NO_ELIGIBLE_DATA_OFFER" | "STALE_EVIDENCE" | "CONFLICTING_EVIDENCE" | "LOW_COVERAGE" | "SOURCE_DISCOVERY_REQUIRED" | "CURRENT_RESEARCH_REQUIRED";
export interface ResearchNeed {
  readonly researchNeedId: string;
  readonly decisionProjectRef: string;
  readonly factorRef: string;
  readonly dataRequirement: DataRequirement;
  readonly reason: ResearchNeedReason;
  readonly materiality: "low" | "medium" | "high" | "critical";
  readonly preferredMode: ResearchMode;
  readonly maxCostCredits?: number;
  readonly maxExternalCost?: number | "unknown";
  readonly maxWallTimeSeconds?: number;
  readonly maxSources?: number;
  readonly policyRef: string;
}

export interface ResearchPolicyAuthority {
  readonly ref: string;
  readonly privacyClass: string;
  readonly maxCostCredits: number;
  readonly maxExternalCost: number;
  readonly maxWallTimeSeconds: number;
  readonly maxSources: number;
  readonly publicResearchAllowed?: boolean;
  readonly rightsRequirements?: readonly string[];
  readonly preferredProviderIds?: readonly string[];
  readonly prohibitedProviderIds?: readonly string[];
}

interface ResearchNeedAuthorityBase {
  readonly requestedBy: string;
  readonly resolvedProjectId: string;
  readonly activePolicy?: ResearchPolicyAuthority;
  readonly platformCeilings: Omit<ResearchPolicyAuthority, "ref" | "privacyClass" | "rightsRequirements" | "preferredProviderIds" | "prohibitedProviderIds">;
}
export type ResearchNeedAuthority = ResearchNeedAuthorityBase & (
  | { readonly authorizationScope: "TENANT"; readonly tenantId: string }
  | { readonly authorizationScope: "PUBLIC"; readonly tenantId?: undefined }
);

export type ResearchAdapterError = "RESEARCH_AUTHORITY_INVALID" | "RESEARCH_POLICY_UNAVAILABLE" | "RESEARCH_PROJECT_SCOPE_MISMATCH" | "RESEARCH_MODE_UNSUPPORTED" | "RESEARCH_BUDGET_INVALID" | "RESEARCH_CONTRACT_INVALID";
export type ResearchAdapterResult = { readonly ok: true; readonly value: { readonly request: ResearchRequest } } | { readonly ok: false; readonly code: ResearchAdapterError };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MODES = new Set<ResearchMode>(["SOURCE_DISCOVERY", "EVIDENCE_ACQUISITION", "KNOWLEDGE_SYNTHESIS", "REVALIDATION", "MONITORING"]);
const REASONS = new Set<ResearchNeedReason>(["NO_ELIGIBLE_DATA_OFFER", "STALE_EVIDENCE", "CONFLICTING_EVIDENCE", "LOW_COVERAGE", "SOURCE_DISCOVERY_REQUIRED", "CURRENT_RESEARCH_REQUIRED"]);
const MATERIALITIES = new Set(["low", "medium", "high", "critical"]);
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

function stableJson(value: unknown): string {
  const ancestors = new Set<object>();
  let visited = 0;
  let encodedChars = 0;
  const consume = (count: number): void => {
    encodedChars += count;
    if (encodedChars > 256_000) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
  };
  const encode = (current: unknown, depth: number): string | undefined => {
    visited += 1;
    if (visited > 20_000 || depth > 32) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
    if (current === undefined) return undefined;
    if (typeof current === "string" && current.length > 4_096) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      const encoded = JSON.stringify(current);
      consume(encoded.length);
      return encoded;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
      const encoded = JSON.stringify(current);
      consume(encoded.length);
      return encoded;
    }
    if (typeof current !== "object") throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
    if (ancestors.has(current)) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        if (current.length > 10_000) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
        const items: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(current, index)) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
          const item = encode(current[index], depth + 1);
          if (item === undefined) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
          items.push(item);
        }
        const encoded = "[" + items.join(",") + "]";
        consume(2);
        return encoded;
      }
      if (Object.getPrototypeOf(current) !== Object.prototype) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
      const record = current as Record<string, unknown>;
      const fields: string[] = [];
      let fieldCount = 0;
      for (const key in record) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
        fieldCount += 1;
        if (fieldCount > 128 || key.length > 128) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
        const encodedKey = JSON.stringify(key);
        const item = encode(record[key], depth + 1);
        if (item !== undefined) fields.push(encodedKey + ":" + item);
        consume(encodedKey.length + 1);
      }
      fields.sort();
      const encoded = "{" + fields.join(",") + "}";
      consume(2);
      return encoded;
    } finally {
      ancestors.delete(current);
    }
  };
  const result = encode(value, 0);
  if (result === undefined) throw new Error("RESEARCH_CANONICAL_INPUT_INVALID");
  return result;
}

function clamp(requested: number | undefined, policy: number, ceiling: number): number {
  return Math.min(requested ?? policy, policy, ceiling);
}

/** Maps decision-owned intent to the sole supported SIF request contract. */
export function mapResearchNeedToRequest(need: ResearchNeed, authority: ResearchNeedAuthority): ResearchAdapterResult {
  if ((authority.authorizationScope === "TENANT" && !isId(authority.tenantId)) || !isId(authority.requestedBy) || !isId(authority.resolvedProjectId)) return { ok: false, code: "RESEARCH_AUTHORITY_INVALID" };
  if (!authority.activePolicy || authority.activePolicy.ref !== need.policyRef || !isId(authority.activePolicy.ref)) return { ok: false, code: "RESEARCH_POLICY_UNAVAILABLE" };
  if (authority.authorizationScope === "PUBLIC" && authority.activePolicy.publicResearchAllowed !== true) return { ok: false, code: "RESEARCH_POLICY_UNAVAILABLE" };
  if (!isId(need.researchNeedId) || !isId(need.factorRef) || !isId(need.policyRef) || !REASONS.has(need.reason) || !MATERIALITIES.has(need.materiality)) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (need.decisionProjectRef !== authority.resolvedProjectId) return { ok: false, code: "RESEARCH_PROJECT_SCOPE_MISMATCH" };
  if (!MODES.has(need.preferredMode)) return { ok: false, code: "RESEARCH_MODE_UNSUPPORTED" };
  const policy = authority.activePolicy;
  const ceilings = authority.platformCeilings;
  const requestedExternalCost = need.maxExternalCost === "unknown" ? undefined : need.maxExternalCost;
  const budgets = [need.maxCostCredits, requestedExternalCost, need.maxWallTimeSeconds, need.maxSources];
  const authorityBudgets = [policy.maxCostCredits, policy.maxExternalCost, policy.maxWallTimeSeconds, policy.maxSources, ceilings.maxCostCredits, ceilings.maxExternalCost, ceilings.maxWallTimeSeconds, ceilings.maxSources];
  if (budgets.some(value => value !== undefined && !finiteNonNegative(value)) || authorityBudgets.some(value => !finiteNonNegative(value)) ||
    !Number.isInteger(policy.maxWallTimeSeconds) || !Number.isInteger(policy.maxSources) || !Number.isInteger(ceilings.maxWallTimeSeconds) || !Number.isInteger(ceilings.maxSources) ||
    need.maxExternalCost === "unknown") return { ok: false, code: "RESEARCH_BUDGET_INVALID" };
  let canonical: string;
  try {
    canonical = stableJson({ scope: authority.authorizationScope, tenantId: authority.authorizationScope === "TENANT" ? authority.tenantId : undefined, requestedBy: authority.requestedBy, projectId: authority.resolvedProjectId, needId: need.researchNeedId, factorRef: need.factorRef, requirement: need.dataRequirement, reason: need.reason, materiality: need.materiality, mode: need.preferredMode, requestedBudget: { credits: need.maxCostCredits, external: need.maxExternalCost, wallTime: need.maxWallTimeSeconds, sources: need.maxSources }, policyRef: policy.ref, policy, ceilings });
  } catch {
    return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  }
  const digest = createHash("sha256").update(canonical).digest("hex");
  const rawRequest = {
    contractVersion: "spec266-research-v1" as const,
    // Persisted request IDs use varchar(36); retain entropy in the idempotency hash.
    researchRequestId: "decision-" + digest.slice(0, 27),
    idempotencyKey: "sha256:" + digest,
    authorizationScope: authority.authorizationScope,
    consumerKind: "DECISION_ANALYSIS" as const,
    consumerRef: need.researchNeedId,
    ...(authority.authorizationScope === "TENANT" ? { tenantId: authority.tenantId } : {}),
    projectId: authority.resolvedProjectId,
    requestedBy: authority.requestedBy,
    goal: "Decision evidence " + need.factorRef + ": " + need.reason + "; materiality " + need.materiality + ". Return source-linked candidates only.",
    mode: need.preferredMode,
    dataRequirements: [need.dataRequirement],
    geographyRefs: need.dataRequirement.geography ? [need.dataRequirement.geography.ref] : undefined,
    temporalRequirement: need.dataRequirement.temporal,
    maxCostCredits: Math.min(clamp(need.maxCostCredits, policy.maxCostCredits, ceilings.maxCostCredits), need.dataRequirement.maximumCostCredits ?? Number.POSITIVE_INFINITY),
    maxExternalCost: clamp(requestedExternalCost, policy.maxExternalCost, ceilings.maxExternalCost),
    maxWallTimeSeconds: Math.floor(clamp(need.maxWallTimeSeconds, policy.maxWallTimeSeconds, ceilings.maxWallTimeSeconds)),
    maxSources: Math.floor(clamp(need.maxSources, policy.maxSources, ceilings.maxSources)),
    privacyClass: policy.privacyClass,
    rightsRequirements: policy.rightsRequirements,
    preferredProviderIds: policy.preferredProviderIds,
    prohibitedProviderIds: policy.prohibitedProviderIds,
    outputPolicyRef: policy.ref,
  };
  const parsed = parseResearchRequest(rawRequest);
  return parsed.ok ? { ok: true, value: { request: parsed.value } } : { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
}
