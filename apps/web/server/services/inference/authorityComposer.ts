import { createHash } from "node:crypto";
import type { InferenceAuthoritySnapshot } from "./policyResolver";
import type { InferenceRouterPolicy } from "./routerPolicy";

export type PolicyLayer = {
  tenantId: string;
  principalId: string;
  revision: string;
  observedAtMs: number;
  ready: boolean;
  allowedProviderIds: string[];
  allowedRegions: string[];
  allowedCredentialOwnerRefs: string[];
  requireZeroDataRetention: boolean;
  routerPolicy?: InferenceRouterPolicy;
};

export type InferenceAuthoritySources = {
  platform: PolicyLayer;
  tenant: PolicyLayer;
  principal: PolicyLayer;
  revocations: {
    tenantId: string;
    principalId: string;
    revision: string;
    observedAtMs: number;
    fresh: boolean;
    revokedModelProfileIds: string[];
    revokedDeploymentIds: string[];
  };
  budget: {
    tenantId: string;
    principalId: string;
    revision: string;
    observedAtMs: number;
    ready: boolean;
    availableBudgetMicros: number;
  };
  registry: {
    revision: string;
    observedAtMs: number;
  };
  router: {
    revision: string;
    scoreCalibrationRevision: string;
    routingWeights: InferenceAuthoritySnapshot["routingWeights"];
  };
};

export type AuthorityCompositionResult =
  | { ok: true; snapshot: InferenceAuthoritySnapshot }
  | {
      ok: false;
      reason:
        | "AUTHORITY_SCOPE_MISMATCH"
        | "AUTHORITY_SOURCE_INVALID"
        | "AUTHORITY_REVISION_INVALID";
    };

export const AUTHORITY_SOURCE_MAX_AGE_MS = 60_000;

function validId(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 256
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validLayer(input: unknown): input is PolicyLayer {
  if (!isRecord(input)) return false;
  const layer = input as unknown as PolicyLayer;
  return (
    validId(layer.tenantId) &&
    validId(layer.principalId) &&
    validId(layer.revision) &&
    Number.isSafeInteger(layer.observedAtMs) &&
    layer.observedAtMs >= 0 &&
    typeof layer.ready === "boolean" &&
    typeof layer.requireZeroDataRetention === "boolean" &&
    [
      layer.allowedProviderIds,
      layer.allowedRegions,
      layer.allowedCredentialOwnerRefs,
    ].every(
      values =>
        Array.isArray(values) &&
        values.every(value => validId(value)) &&
        new Set(values).size === values.length
    )
  );
}

function intersect(lists: string[][]): string[] {
  if (lists.length === 0) return [];
  const remaining = lists.slice(1).map(values => new Set(values));
  return [...new Set(lists[0])]
    .filter(value => remaining.every(values => values.has(value)))
    .sort();
}

function union(lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

function revisionDigest(values: string[]): string {
  return `inference-authority:${createHash("sha256")
    .update(values.join("\n"))
    .digest("hex")}`;
}

/**
 * Intersects all authorization scopes. Missing permissions stay missing; this
 * function never broadens a source allowlist or manufactures readiness.
 */
export function composeInferenceAuthority(
  input: unknown,
  nowMs: number
): AuthorityCompositionResult {
  if (
    !isRecord(input) ||
    ![
      "platform",
      "tenant",
      "principal",
      "revocations",
      "budget",
      "registry",
      "router",
    ].every(key => isRecord(input[key]))
  ) {
    return { ok: false, reason: "AUTHORITY_SOURCE_INVALID" };
  }
  const sources = input as unknown as InferenceAuthoritySources;
  const { platform, tenant, principal, revocations, budget, registry, router } =
    sources;
  if (![platform, tenant, principal].every(validLayer)) {
    return { ok: false, reason: "AUTHORITY_SOURCE_INVALID" };
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, reason: "AUTHORITY_SOURCE_INVALID" };
  }
  if (
    !validId(revocations.tenantId) ||
    !validId(revocations.principalId) ||
    !validId(revocations.revision) ||
    !Number.isSafeInteger(revocations.observedAtMs) ||
    revocations.observedAtMs < 0 ||
    typeof revocations.fresh !== "boolean" ||
    !Array.isArray(revocations.revokedModelProfileIds) ||
    !revocations.revokedModelProfileIds.every(validId) ||
    !Array.isArray(revocations.revokedDeploymentIds) ||
    !revocations.revokedDeploymentIds.every(validId) ||
    !validId(budget.tenantId) ||
    !validId(budget.principalId) ||
    !validId(budget.revision) ||
    !Number.isSafeInteger(budget.observedAtMs) ||
    budget.observedAtMs < 0 ||
    typeof budget.ready !== "boolean" ||
    !Number.isSafeInteger(budget.availableBudgetMicros) ||
    budget.availableBudgetMicros < 0 ||
    !validId(registry.revision) ||
    !Number.isSafeInteger(registry.observedAtMs) ||
    registry.observedAtMs < 0 ||
    !validId(router.revision) ||
    !validId(router.scoreCalibrationRevision) ||
    !router.routingWeights ||
    !Object.values(router.routingWeights).every(
      value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
    )
  ) {
    return { ok: false, reason: "AUTHORITY_SOURCE_INVALID" };
  }

  const tenantId = tenant.tenantId;
  const principalId = principal.principalId;
  if (
    platform.tenantId !== tenantId ||
    principal.tenantId !== tenantId ||
    platform.principalId !== principalId ||
    tenant.principalId !== principalId ||
    revocations.tenantId !== tenantId ||
    revocations.principalId !== principalId ||
    budget.tenantId !== tenantId ||
    budget.principalId !== principalId
  ) {
    return { ok: false, reason: "AUTHORITY_SCOPE_MISMATCH" };
  }

  const revisions = [
    platform.revision,
    tenant.revision,
    principal.revision,
    revocations.revision,
    budget.revision,
    registry.revision,
    router.revision,
    router.scoreCalibrationRevision,
  ];
  if (!revisions.every(validId)) {
    return { ok: false, reason: "AUTHORITY_REVISION_INVALID" };
  }
  const weights = Object.values(router.routingWeights);
  if (weights.reduce((sum, value) => sum + value, 0) !== 1_000_000) {
    return { ok: false, reason: "AUTHORITY_SOURCE_INVALID" };
  }
  const sourceObservedAt = [
    platform.observedAtMs,
    tenant.observedAtMs,
    principal.observedAtMs,
    revocations.observedAtMs,
    budget.observedAtMs,
    registry.observedAtMs,
  ];
  const sourcesFresh = sourceObservedAt.every(
    observedAt =>
      observedAt <= nowMs && nowMs - observedAt <= AUTHORITY_SOURCE_MAX_AGE_MS
  );

  return {
    ok: true,
    snapshot: {
      tenantId,
      principalId,
      policyRevision: revisionDigest(revisions),
      platformPolicyReady: platform.ready && sourcesFresh,
      tenantPolicyReady: tenant.ready && sourcesFresh,
      emergencyRevocationFresh: revocations.fresh && sourcesFresh,
      budgetAuthorityReady: budget.ready && sourcesFresh,
      platformAllowedProviderIds: [...platform.allowedProviderIds].sort(),
      tenantAllowedProviderIds: intersect([
        platform.allowedProviderIds,
        tenant.allowedProviderIds,
      ]),
      principalAllowedProviderIds: intersect([
        platform.allowedProviderIds,
        tenant.allowedProviderIds,
        principal.allowedProviderIds,
      ]),
      allowedCredentialOwnerRefs: intersect([
        platform.allowedCredentialOwnerRefs,
        tenant.allowedCredentialOwnerRefs,
        principal.allowedCredentialOwnerRefs,
      ]),
      allowedRegions: intersect([
        platform.allowedRegions,
        tenant.allowedRegions,
        principal.allowedRegions,
      ]),
      requireZeroDataRetention:
        platform.requireZeroDataRetention ||
        tenant.requireZeroDataRetention ||
        principal.requireZeroDataRetention,
      availableBudgetMicros: budget.availableBudgetMicros,
      revokedModelProfileIds: union([revocations.revokedModelProfileIds]),
      revokedDeploymentIds: union([revocations.revokedDeploymentIds]),
      observedAtMs: Math.min(
        platform.observedAtMs,
        tenant.observedAtMs,
        principal.observedAtMs,
        revocations.observedAtMs,
        budget.observedAtMs,
        registry.observedAtMs
      ),
      registryRevision: registry.revision,
      routerPolicyRevision: router.revision,
      scoreCalibrationRevision: router.scoreCalibrationRevision,
      routingWeights: { ...router.routingWeights },
    },
  };
}
