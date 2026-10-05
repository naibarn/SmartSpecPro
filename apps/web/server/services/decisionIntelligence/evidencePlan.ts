import { resolveDataRequirement, type DataOffer, type DataRequirement, type OfferRejectionCode } from "../intelligenceFabric/resolver";

export interface PlannedRequirement {
  readonly id: string;
  readonly required: boolean;
  readonly priority: number;
  readonly requirement: DataRequirement;
}

export interface EvidencePlanInput {
  readonly requirements: readonly PlannedRequirement[];
  readonly offers: readonly DataOffer[];
  readonly now: Date;
  readonly authorizationScope?: "PUBLIC" | "TENANT";
  readonly tenantId?: string;
  /** Server-resolved policy revision used to reauthorize every planned offer. */
  readonly currentPolicyVersion: string;
  readonly maxCostCredits?: number;
  readonly allowedPlacements?: readonly string[];
}

export interface EvidencePlan {
  readonly bindings: readonly { readonly requirementId: string; readonly offerId: string; readonly sourceRef: string; readonly datasetRef: string }[];
  readonly missing: readonly {
    readonly requirementId: string;
    readonly required: boolean;
    readonly code: OfferRejectionCode | "NO_ELIGIBLE_OFFER" | "COST_REVIEW_REQUIRED";
    readonly candidateOfferIds: readonly string[];
  }[];
  readonly estimatedCostCredits: number;
  readonly readiness: "blocked" | "partial" | "ready";
}

function validate(input: EvidencePlanInput): void {
  if (input.requirements.length > 100 || input.offers.length > 2_000 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.currentPolicyVersion) ||
    (input.maxCostCredits !== undefined && (!Number.isFinite(input.maxCostCredits) || input.maxCostCredits < 0))) {
    throw new Error("EVIDENCE_PLAN_INVALID");
  }
  const ids = new Set<string>();
  for (const requirement of input.requirements) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(requirement.id) || ids.has(requirement.id) ||
      !Number.isFinite(requirement.priority) || requirement.priority < 0 || typeof requirement.required !== "boolean") {
      throw new Error("EVIDENCE_PLAN_INVALID");
    }
    ids.add(requirement.id);
  }
}

/**
 * Builds a provider-neutral plan. Offers are resolved/re-authorized first;
 * unknown-cost offers remain candidates and are never treated as free work.
 */
export function buildEvidencePlan(input: EvidencePlanInput): EvidencePlan {
  validate(input);
  const ordered = [...input.requirements].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const bindings: Array<{ requirementId: string; offerId: string; sourceRef: string; datasetRef: string }> = [];
  const missing: Array<{ requirementId: string; required: boolean; code: OfferRejectionCode | "NO_ELIGIBLE_OFFER" | "COST_REVIEW_REQUIRED"; candidateOfferIds: string[] }> = [];
  let estimatedCostCredits = 0;

  for (const planned of ordered) {
    const resolution = resolveDataRequirement(planned.requirement, input.offers, {
      now: input.now,
      authorizationScope: input.authorizationScope,
      tenantId: input.tenantId,
      allowedPlacements: input.allowedPlacements,
      currentPolicyVersion: input.currentPolicyVersion,
    });
    const pricedEligible = resolution.eligible.filter(offer => offer.estimatedCost.kind !== "unknown");
    const affordable = pricedEligible.find(offer => {
      const cost = offer.estimatedCost.kind === "zero" ? 0 : offer.estimatedCost.credits;
      return cost === 0 || (input.maxCostCredits !== undefined && estimatedCostCredits + cost <= input.maxCostCredits);
    });

    if (affordable) {
      const cost = affordable.estimatedCost.kind === "zero" ? 0 : affordable.estimatedCost.credits;
      estimatedCostCredits = Math.round((estimatedCostCredits + cost) * 1_000_000) / 1_000_000;
      bindings.push({ requirementId: planned.id, offerId: affordable.id, sourceRef: affordable.sourceRef, datasetRef: affordable.datasetRef });
      continue;
    }

    const candidateOfferIds = resolution.eligible.map(offer => offer.id);
    const unknownCostAvailable = resolution.eligible.some(offer => offer.estimatedCost.kind === "unknown");
    const paidBudgetMissing = input.maxCostCredits === undefined && resolution.eligible.some(offer => offer.estimatedCost.kind === "known" || offer.estimatedCost.kind === "estimated");
    const rejectedForCost = resolution.eligible.some(offer => offer.estimatedCost.kind !== "unknown");
    const code = !input.authorizationScope
      ? "AUTHORIZATION_SCOPE_REQUIRED"
      : unknownCostAvailable || paidBudgetMissing
        ? "COST_REVIEW_REQUIRED"
        : rejectedForCost
          ? "COST_LIMIT_EXCEEDED"
          : resolution.rejections[0]?.code ?? "NO_ELIGIBLE_OFFER";
    missing.push({ requirementId: planned.id, required: planned.required, code, candidateOfferIds });
  }

  const required = ordered.filter(item => item.required);
  const requiredMissing = missing.filter(item => item.required).length;
  const requiredBound = required.length - requiredMissing;
  const readiness = required.length > 0 && requiredBound === 0 ? "blocked" : requiredMissing > 0 ? "partial" : "ready";
  return { bindings, missing, estimatedCostCredits, readiness };
}
