/**
 * Model Resolver
 *
 * Resolves a TaskExecutionPlan into a concrete model at execution time.
 * Uses the capability registry to filter, then applies the plan's
 * strategy (cheapest, fastest, best) to rank candidates.
 *
 * Also produces ModelResolutionSnapshot records that are stored
 * per step-attempt for audit and billing.
 */

import { filterModelsByCapabilities } from "./capabilityRegistry";
import type { EnabledModelWithCapabilities } from "./capabilityRegistry";
import type { TaskExecutionPlan } from "./taskExecutionPlanner";
import { buildModelLookupCandidates } from "./modelLookup";

// ── Types ────────────────────────────────────────────────────────────

export interface ModelWithPricing extends EnabledModelWithCapabilities {
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
}

export interface ModelResolutionSnapshot {
  modelId: string;
  providerModelId: string;
  providerName: string;
  pricingInput: number;
  pricingOutput: number;
  isFree: boolean;
  attemptIndex: number;
  fallbackReason?: string;
  resolvedAt: string;
}

// ── Resolution ───────────────────────────────────────────────────────

/**
 * Resolve the best model for a plan from the list of enabled models.
 * Returns null if no model meets the plan's requirements.
 */
export function resolveModelFromPlan(
  plan: TaskExecutionPlan,
  models: ModelWithPricing[],
): ModelWithPricing | null {
  let candidates = [...models];

  // Apply disallowed models filter
  if (plan.disallowedModels?.length) {
    const disallowed = new Set(plan.disallowedModels);
    candidates = candidates.filter((m) => !disallowed.has(m.modelId));
  }

  // Apply capability requirements filter
  if (plan.requirements && Object.keys(plan.requirements).length > 0) {
    candidates = filterModelsByCapabilities(candidates, plan.requirements);
  }

  if (candidates.length === 0) return null;

  const preferredConversationModelId = plan.taskType === "chat" && !plan.context?.skillSlug
    ? plan.context?.conversationModel
    : undefined;
  if (preferredConversationModelId) {
    const requestedIds = new Set(buildModelLookupCandidates(preferredConversationModelId));
    requestedIds.add(preferredConversationModelId);

    const preferredCandidate = candidates.find((candidate) => {
      const candidateIds = new Set(
        [
          candidate.modelId,
          candidate.providerModelId,
          ...(candidate.legacyModelAliases ?? []),
          ...buildModelLookupCandidates(candidate.modelId),
          ...buildModelLookupCandidates(candidate.providerModelId),
          ...(candidate.legacyModelAliases ?? []).flatMap((alias) => buildModelLookupCandidates(alias)),
        ].filter((value): value is string => Boolean(value)),
      );

      for (const requestedId of requestedIds) {
        if (candidateIds.has(requestedId)) {
          return true;
        }
      }
      return false;
    });

    if (preferredCandidate) {
      return preferredCandidate;
    }
  }

  // Apply strategy-based ranking
  switch (plan.strategy) {
    case "cheapest":
      candidates.sort((a, b) => {
        // Free models first
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        // Then by total pricing (input + output as rough proxy)
        return (a.pricingInput + a.pricingOutput) - (b.pricingInput + b.pricingOutput);
      });
      break;
    case "best":
      // Reverse of cheapest — most expensive first as proxy for quality
      candidates.sort((a, b) => {
        return (b.pricingInput + b.pricingOutput) - (a.pricingInput + a.pricingOutput);
      });
      break;
    case "fastest":
    default:
      // Preserve input order (models come pre-sorted by provider priority)
      break;
  }

  return candidates[0];
}

// ── Snapshot builder ─────────────────────────────────────────────────

/**
 * Build an immutable resolution snapshot for a step-attempt.
 * Retries within the same attempt reuse the same snapshot.
 * Fallback attempts create a new snapshot with fallbackReason.
 */
export function buildModelResolutionSnapshot(
  model: ModelWithPricing,
  attemptIndex: number,
  fallbackReason?: string,
): ModelResolutionSnapshot {
  const snapshot: ModelResolutionSnapshot = {
    modelId: model.modelId,
    providerModelId: model.providerModelId,
    providerName: model.providerName,
    pricingInput: model.pricingInput,
    pricingOutput: model.pricingOutput,
    isFree: model.isFree,
    attemptIndex,
    resolvedAt: new Date().toISOString(),
  };
  if (fallbackReason) {
    snapshot.fallbackReason = fallbackReason;
  }
  return snapshot;
}
