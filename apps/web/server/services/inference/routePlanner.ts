import type { InferenceIntentV2 } from "./contracts";
import { validateInferenceAuthoritySnapshot } from "./authoritySnapshot";
import {
  buildQualifiedRouteCandidate,
  logicalModelProfileSchema,
  providerDeploymentProfileSchema,
  type QualificationReasonCode,
} from "./qualification";
import {
  createCandidateFilterReceipt,
  selectInferenceRoute,
  type CandidateFilterReceipt,
  type InferenceAuthoritySnapshot,
  type RouteCandidate,
} from "./policyResolver";

export type DeploymentCandidateInput = {
  model: unknown;
  deployment: unknown;
};

export type RoutePlanningResult =
  | {
      status: "selected";
      candidate: RouteCandidate;
      eligibleCandidates: RouteCandidate[];
      filterReceipt: CandidateFilterReceipt;
      qualificationExclusions: QualificationExclusion[];
    }
  | {
      status: "consent_required";
      reasonCode: "LOCKED_ROUTE_UNAVAILABLE";
      filterReceipt: CandidateFilterReceipt;
      qualificationExclusions: QualificationExclusion[];
    }
  | {
      status: "no_eligible_route";
      reasonCode:
        | "NO_ELIGIBLE_ROUTE"
        | "ROUTING_POLICY_INVALID"
        | "DUPLICATE_DEPLOYMENT_PROFILE";
      filterReceipt: CandidateFilterReceipt;
      qualificationExclusions: QualificationExclusion[];
    }
  | {
      status: "invalid_authority";
      reasonCode: "AUTHORITY_SNAPSHOT_INVALID";
      invalidFields: string[];
    };

export type QualificationExclusion = {
  modelProfileId: string | null;
  deploymentId: string | null;
  reasonCodes: QualificationReasonCode[];
};

/**
 * Pure route-planning pipeline: qualify versioned catalog records, apply policy
 * hard filters, rank only admitted routes, and return an explainable safe receipt.
 * This intentionally does not reserve credits or call a provider.
 */
export function resolveInferenceRoute(
  intent: InferenceIntentV2,
  candidateInputs: readonly DeploymentCandidateInput[],
  authority: InferenceAuthoritySnapshot,
  nowMs: number
): RoutePlanningResult {
  const validatedAuthority = validateInferenceAuthoritySnapshot(
    authority,
    nowMs
  );
  if (!validatedAuthority.ok) {
    return {
      status: "invalid_authority",
      reasonCode: "AUTHORITY_SNAPSHOT_INVALID",
      invalidFields: validatedAuthority.fields,
    };
  }
  authority = validatedAuthority.snapshot;

  const candidates: RouteCandidate[] = [];
  const qualificationExclusions: QualificationExclusion[] = [];

  for (const input of candidateInputs) {
    const result = buildQualifiedRouteCandidate(
      intent,
      input.model,
      input.deployment,
      nowMs
    );
    if (result.ok) {
      candidates.push(result.candidate);
      continue;
    }
    const model = logicalModelProfileSchema.safeParse(input.model);
    const deployment = providerDeploymentProfileSchema.safeParse(
      input.deployment
    );
    qualificationExclusions.push({
      modelProfileId: model.success ? model.data.logicalModelId : null,
      deploymentId: deployment.success ? deployment.data.deploymentId : null,
      reasonCodes: result.reasonCodes,
    });
  }

  qualificationExclusions.sort((a, b) =>
    (a.deploymentId ?? "") < (b.deploymentId ?? "")
      ? -1
      : (a.deploymentId ?? "") > (b.deploymentId ?? "")
        ? 1
        : (a.modelProfileId ?? "") < (b.modelProfileId ?? "")
          ? -1
          : (a.modelProfileId ?? "") > (b.modelProfileId ?? "")
            ? 1
            : 0
  );

  const candidatesById = new Map<string, RouteCandidate>();
  const duplicateIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidatesById.has(candidate.deploymentId))
      duplicateIds.add(candidate.deploymentId);
    else candidatesById.set(candidate.deploymentId, candidate);
  }
  if (duplicateIds.size > 0) {
    for (const deploymentId of duplicateIds)
      candidatesById.delete(deploymentId);
    for (const deploymentId of duplicateIds) {
      qualificationExclusions.push({
        modelProfileId:
          candidates.find(candidate => candidate.deploymentId === deploymentId)
            ?.modelProfileId ?? null,
        deploymentId,
        reasonCodes: ["DEPLOYMENT_ID_CONFLICT"],
      });
    }
  }

  const uniqueCandidates = [...candidatesById.values()];
  uniqueCandidates.sort((a, b) =>
    a.deploymentId < b.deploymentId
      ? -1
      : a.deploymentId > b.deploymentId
        ? 1
        : 0
  );
  const filterReceipt = createCandidateFilterReceipt(
    intent,
    uniqueCandidates,
    authority
  );
  if (duplicateIds.size > 0) {
    return {
      status: "no_eligible_route",
      reasonCode: "DUPLICATE_DEPLOYMENT_PROFILE",
      filterReceipt,
      qualificationExclusions,
    };
  }

  const selection = selectInferenceRoute(intent, uniqueCandidates, authority);
  if (selection.status === "selected") {
    return {
      status: "selected",
      candidate: selection.candidate,
      eligibleCandidates: uniqueCandidates,
      filterReceipt,
      qualificationExclusions,
    };
  }
  if (selection.status === "consent_required") {
    return {
      status: "consent_required",
      reasonCode: selection.reasonCode,
      filterReceipt,
      qualificationExclusions,
    };
  }
  return {
    status: "no_eligible_route",
    reasonCode: selection.reasonCode,
    filterReceipt,
    qualificationExclusions,
  };
}
