import type { AgeBand, SafetyActorContext } from "../../shared/ageSafetyPolicy";
import { enforceAgePolicy } from "./agePolicyEnforcer";
import type { AgeSafetyPolicyModeInput } from "./ageSafetyPolicyService";

export type GeneratedAssetSafetyMetadata = {
  policyVersion: string;
  policySnapshotHash: string;
  creatorEnforcementBand: Exclude<AgeBand, "unknown">;
  minimumViewerBand: Exclude<AgeBand, "unknown">;
  reviewState: "clear" | "review_required" | "quarantined";
  contentCategory: string;
};

export function buildGeneratedAssetSafetyMetadata(input: {
  creatorBand: Exclude<AgeBand, "unknown">;
  minimumViewerBand?: Exclude<AgeBand, "unknown">;
  policyVersion: string;
  policySnapshotHash: string;
  contentCategory?: string;
  reviewState?: GeneratedAssetSafetyMetadata["reviewState"];
}): GeneratedAssetSafetyMetadata {
  return {
    policyVersion: input.policyVersion,
    policySnapshotHash: input.policySnapshotHash,
    creatorEnforcementBand: input.creatorBand,
    minimumViewerBand: input.minimumViewerBand ?? input.creatorBand,
    reviewState: input.reviewState ?? "clear",
    contentCategory: input.contentCategory ?? "general",
  };
}

export function evaluateGeneratedAssetViewerPolicy(input: {
  viewer: SafetyActorContext;
  metadata: GeneratedAssetSafetyMetadata | null | undefined;
  action: "read" | "download" | "share" | "remix" | "reference";
  flags?: AgeSafetyPolicyModeInput["flags"];
}) {
  if (!input.metadata || input.metadata.reviewState !== "clear") {
    return {
      allowed: false,
      code: input.metadata ? `asset_${input.metadata.reviewState}` : "asset_safety_metadata_missing",
    };
  }
  return enforceAgePolicy({
    actor: input.viewer,
    surface: "generated_asset",
    action: input.action,
    flags: input.flags,
    policy: {
      policyVersion: input.metadata.policyVersion,
      rolloutMode: "enforce_all",
      adultOnlyServiceMode: false,
      defaultMinimumAgeBand: input.metadata.minimumViewerBand,
      rules: [],
    },
  });
}
