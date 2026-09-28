import { createHash } from "node:crypto";
import type { ProfileRegistryLoadResult } from "./profileRegistry";
import { evaluateDeploymentQualification } from "./qualification";

export type InferenceCapabilityRecheckAssessment =
  | {
      ready: true;
      reason: null;
      reference: string;
      registryRevision: string;
      eligibleProfileCount: number;
      ineligibleDeploymentIds: [];
    }
  | {
      ready: false;
      reason:
        | "PROFILE_REGISTRY_UNAVAILABLE"
        | "NO_CERTIFIED_PROFILES"
        | "INVALID_PROFILES"
        | "INELIGIBLE_PROFILES";
      reference: null;
      registryRevision: string | null;
      eligibleProfileCount: number;
      ineligibleDeploymentIds: string[];
    };

/** Re-check certified provider evidence without contacting providers or inventing readiness. */
export function assessInferenceCapabilityRecheck(
  registry: ProfileRegistryLoadResult,
  nowMs: number
): InferenceCapabilityRecheckAssessment {
  if (!registry.ok) {
    return {
      ready: false,
      reason: "PROFILE_REGISTRY_UNAVAILABLE",
      reference: null,
      registryRevision: null,
      eligibleProfileCount: 0,
      ineligibleDeploymentIds: [],
    };
  }
  if (registry.profiles.length === 0) {
    return {
      ready: false,
      reason: "NO_CERTIFIED_PROFILES",
      reference: null,
      registryRevision: registry.registryRevision,
      eligibleProfileCount: 0,
      ineligibleDeploymentIds: [],
    };
  }
  if (registry.invalidProfileIds.length > 0) {
    return {
      ready: false,
      reason: "INVALID_PROFILES",
      reference: null,
      registryRevision: registry.registryRevision,
      eligibleProfileCount: registry.profiles.length,
      ineligibleDeploymentIds: registry.invalidProfileIds,
    };
  }

  const ineligibleDeploymentIds = registry.profiles
    .filter(profile => {
      const deployment = profile.deployment;
      return (
        !deployment.runtimeBinding ||
        evaluateDeploymentQualification(profile.model, deployment, nowMs)
          .eligible !== true
      );
    })
    .map(profile => profile.deployment.deploymentId)
    .sort();
  if (ineligibleDeploymentIds.length > 0) {
    return {
      ready: false,
      reason: "INELIGIBLE_PROFILES",
      reference: null,
      registryRevision: registry.registryRevision,
      eligibleProfileCount:
        registry.profiles.length - ineligibleDeploymentIds.length,
      ineligibleDeploymentIds,
    };
  }

  const certifiedProfiles = registry.profiles
    .map(({ model, deployment }) => ({
      logicalModelId: model.logicalModelId,
      modelRevision: model.revision,
      capabilityRefs: [...model.capabilityRefs].sort(),
      deploymentId: deployment.deploymentId,
      deploymentRevision: deployment.revision,
      providerId: deployment.providerId,
      runtimeBinding: deployment.runtimeBinding,
      probe: {
        suiteRevision: deployment.probe.probeSuiteRevision,
        evidenceRef: deployment.probe.evidenceRef,
        observedAtMs: deployment.probe.observedAtMs,
        validUntilMs: deployment.probe.validUntilMs,
        probedCapabilityRefs: [...deployment.probe.probedCapabilityRefs].sort(),
        checks: deployment.probe.checks,
      },
      price: {
        snapshotRef: deployment.price.snapshotRef,
        inputMicrosPerMillion: deployment.price.inputMicrosPerMillion,
        outputMicrosPerMillion: deployment.price.outputMicrosPerMillion,
        validUntilMs: deployment.price.validUntilMs,
      },
    }))
    .sort((left, right) => left.deploymentId.localeCompare(right.deploymentId));
  const canonical = JSON.stringify({
    contract: "SAH-INFERENCE-CAPABILITY-RECHECK-1",
    registryRevision: registry.registryRevision,
    profiles: certifiedProfiles,
  });
  const reference = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
  return {
    ready: true,
    reason: null,
    reference,
    registryRevision: registry.registryRevision,
    eligibleProfileCount: registry.profiles.length,
    ineligibleDeploymentIds: [],
  };
}
