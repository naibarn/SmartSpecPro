import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  composeInferenceAuthority,
  type InferenceAuthoritySources,
} from "./authorityComposer";
import type { InferenceAuthoritySnapshot } from "./policyResolver";
import { loadInferencePolicySourceLayers } from "./policySourceLoader";
import { loadInferenceProfileRegistry } from "./profileRegistry";
import {
  resolveTrustedInferenceIntent,
  type InferenceIntentV2,
  type TrustedInferenceContext,
} from "./contracts";
import { resolveInferenceRoute } from "./routePlanner";

export type InferencePlanningSourceOwners = {
  /** Snapshot from the existing credit/budget owner; this module never reserves funds. */
  budget: InferenceAuthoritySources["budget"];
  requestContext: Pick<
    TrustedInferenceContext,
    | "tenantId"
    | "principalId"
    | "traceId"
    | "budgetScopeRef"
    | "idempotencyKey"
    | "effectivePrivacyClass"
    | "effectiveRisk"
  >;
};

export type InferencePlanningResult =
  | {
      status: "source_unavailable";
      code:
        | "POLICY_SCOPE_MISSING"
        | "POLICY_SCOPE_INVALID"
        | "POLICY_SOURCE_UNAVAILABLE"
        | "PROFILE_REGISTRY_UNAVAILABLE"
        | "PROFILE_REGISTRY_INVALID"
        | "INVALID_INFERENCE_INTENT"
        | "INFERENCE_SCOPE_MISMATCH";
      scope?: "platform" | "tenant" | "principal";
      field?: "tenantId" | "principalId";
      fields?: string[];
    }
  | {
      status: "authority_invalid";
      reason:
        | "AUTHORITY_SCOPE_MISMATCH"
        | "AUTHORITY_SOURCE_INVALID"
        | "AUTHORITY_REVISION_INVALID";
    }
  | {
      status: "planned";
      authorityRevision: string;
      registryRevision: string;
      invalidProfileIds: string[];
      boundIntent: InferenceIntentV2;
      authority: InferenceAuthoritySnapshot;
      route: ReturnType<typeof resolveInferenceRoute>;
    };

/**
 * Loads policy, revocations and qualification profiles from one PostgreSQL
 * repeatable-read snapshot, composes them with the existing budget owner and
 * server router policy, then runs deterministic route selection.
 */
export async function planInferenceRouteForRequest(input: {
  request: unknown;
  owners: InferencePlanningSourceOwners;
  now?: Date;
}): Promise<InferencePlanningResult> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { status: "authority_invalid", reason: "AUTHORITY_SOURCE_INVALID" };
  }
  const requestContext = input.owners.requestContext;
  if (
    !requestContext.tenantId.trim() ||
    !requestContext.principalId.trim() ||
    !requestContext.traceId.trim() ||
    !requestContext.budgetScopeRef.trim() ||
    !requestContext.idempotencyKey.trim()
  ) {
    return { status: "authority_invalid", reason: "AUTHORITY_SOURCE_INVALID" };
  }

  try {
    const db = getDb();
    return await db.transaction(async tx => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
      );
      const policy = await loadInferencePolicySourceLayers(
        {
          tenantId: requestContext.tenantId,
          principalId: requestContext.principalId,
          now,
        },
        tx
      );
      if (!policy.ok) {
        return {
          status: "source_unavailable" as const,
          code: policy.code,
          ...(policy.scope ? { scope: policy.scope } : {}),
        };
      }
      if (!policy.sources.platform.routerPolicy) {
        return {
          status: "source_unavailable" as const,
          code: "POLICY_SCOPE_INVALID" as const,
          scope: "platform" as const,
        };
      }
      const registry = await loadInferenceProfileRegistry(now, tx);
      if (!registry.ok) {
        return { status: "source_unavailable" as const, code: registry.code };
      }

      const composed = composeInferenceAuthority(
        {
          ...policy.sources,
          budget: input.owners.budget,
          registry: {
            revision: registry.registryRevision,
            observedAtMs: registry.observedAtMs,
          },
          router: {
            revision: policy.sources.platform.revision,
            scoreCalibrationRevision:
              policy.sources.platform.routerPolicy.scoreCalibrationRevision,
            routingWeights: policy.sources.platform.routerPolicy.weights,
          },
        },
        nowMs
      );
      if (!composed.ok) {
        return {
          status: "authority_invalid" as const,
          reason: composed.reason,
        };
      }

      const bound = resolveTrustedInferenceIntent(input.request, {
        tenantId: requestContext.tenantId,
        principalId: requestContext.principalId,
        traceId: requestContext.traceId,
        policyRevision: composed.snapshot.policyRevision,
        budgetScopeRef: requestContext.budgetScopeRef,
        idempotencyKey: requestContext.idempotencyKey,
        maxAuthorizedCostMicros: composed.snapshot.availableBudgetMicros,
        effectivePrivacyClass: requestContext.effectivePrivacyClass,
        effectiveRisk: requestContext.effectiveRisk,
        allowedRegions: composed.snapshot.allowedRegions,
        requireZeroDataRetention: composed.snapshot.requireZeroDataRetention,
      });
      if (!bound.ok) {
        return {
          status: "source_unavailable" as const,
          code: bound.code,
          ...("field" in bound ? { field: bound.field } : {}),
          ...("fields" in bound ? { fields: bound.fields } : {}),
        };
      }

      const route = resolveInferenceRoute(
        bound.intent,
        registry.profiles.map(profile => ({
          model: profile.model,
          deployment: profile.deployment,
        })),
        composed.snapshot,
        nowMs
      );
      return {
        status: "planned" as const,
        authorityRevision: composed.snapshot.policyRevision,
        registryRevision: registry.registryRevision,
        invalidProfileIds: registry.invalidProfileIds,
        boundIntent: bound.intent,
        authority: composed.snapshot,
        route,
      };
    });
  } catch {
    return {
      status: "source_unavailable",
      code: "POLICY_SOURCE_UNAVAILABLE",
    };
  }
}
