export interface VideoEditorCapabilityRequirement {
  operation: string;
  claim: string;
  contractVersion: string;
  locality: "browser" | "node" | "windows" | "container";
  resourceProfile?: string;
}

export interface VideoEditorExecutorCapability {
  claim: string;
  contractVersions: string[];
  localities: string[];
  resourceProfiles?: string[];
  available: boolean;
}

export type VideoEditorCapabilityDecision =
  | { state: "eligible"; executorCount: number }
  | {
      state: "waiting_agent";
      reason: "agent_unavailable";
      retryAfterMs: number;
      expiresAt: string;
    }
  | {
      state: "capability_blocked";
      reason:
        | "claim_mismatch"
        | "contract_mismatch"
        | "locality_mismatch"
        | "resource_mismatch"
        | "no_executor";
    };

export function evaluateVideoEditorCapability(
  requirement: VideoEditorCapabilityRequirement,
  executors: VideoEditorExecutorCapability[],
  now = Date.now()
): VideoEditorCapabilityDecision {
  const claimMatches = executors.filter(
    executor => executor.claim === requirement.claim
  );
  if (claimMatches.length === 0)
    return { state: "capability_blocked", reason: "claim_mismatch" };
  const contractMatches = claimMatches.filter(executor =>
    executor.contractVersions.includes(requirement.contractVersion)
  );
  if (contractMatches.length === 0)
    return { state: "capability_blocked", reason: "contract_mismatch" };
  const localityMatches = contractMatches.filter(executor =>
    executor.localities.includes(requirement.locality)
  );
  if (localityMatches.length === 0)
    return { state: "capability_blocked", reason: "locality_mismatch" };
  const resourceMatches = requirement.resourceProfile
    ? localityMatches.filter(executor =>
        executor.resourceProfiles?.includes(requirement.resourceProfile)
      )
    : localityMatches;
  if (resourceMatches.length === 0)
    return { state: "capability_blocked", reason: "resource_mismatch" };
  const available = resourceMatches.filter(executor => executor.available);
  if (available.length === 0)
    return {
      state: "waiting_agent",
      reason: "agent_unavailable",
      retryAfterMs: 2_000,
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    };
  return { state: "eligible", executorCount: available.length };
}

export function projectVideoEditorStatus(
  decision: Exclude<VideoEditorCapabilityDecision, { state: "eligible" }>
): { label: "capability-blocked" | "waiting-agent"; reason: string } {
  if (decision.state === "waiting_agent")
    return { label: "waiting-agent", reason: decision.reason };
  return { label: "capability-blocked", reason: decision.reason };
}

export function canPromoteVideoEditorEvidence(
  jobState: string,
  evidenceState: string
): boolean {
  return (
    (jobState === "completed" || jobState === "succeeded") &&
    evidenceState === "available"
  );
}
