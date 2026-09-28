import type { OrchestraProviderCapabilityProfile } from "../../../shared/agentRuntime/orchestraSchemas";

const BUILTIN_PROFILES: Record<string, OrchestraProviderCapabilityProfile> = {
  "kie:grok": {
    providerId: "kie",
    modelId: "grok",
    maxPromptChars: 4096,
    supportsVision: true,
    supportsStructuredOutput: false,
    supportsLipSync: true,
    supportsMultiLocation: true,
  },
};

export function getProviderCapabilityProfile(
  providerId: string,
  modelId: string
): OrchestraProviderCapabilityProfile | null {
  return BUILTIN_PROFILES[`${providerId}:${modelId}`] ?? null;
}

export function assertProviderCapability(
  profile: OrchestraProviderCapabilityProfile,
  requirement: {
    requiresVision?: boolean;
    requiresLipSync?: boolean;
    requiresMultiLocation?: boolean;
  }
): void {
  if (requirement.requiresVision && !profile.supportsVision)
    throw new Error("provider_capability_mismatch:vision_required");
  if (requirement.requiresLipSync && !profile.supportsLipSync)
    throw new Error("provider_capability_mismatch:lip_sync_required");
  if (requirement.requiresMultiLocation && !profile.supportsMultiLocation)
    throw new Error("provider_capability_mismatch:multi_location_required");
}
