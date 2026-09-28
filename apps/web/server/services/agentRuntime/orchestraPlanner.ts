import {
  supportsSkillCapabilityCaller,
  type SkillCapabilityManifest,
} from "../../../shared/agentRuntime/skillManifest";
import type {
  AgentRuntimeEntryPoint,
  AgentRuntimeOriginSurface,
  AgentRuntimeSurface,
} from "../../../shared/agentRuntime/types";

export type OrchestraManifestCandidate = SkillCapabilityManifest & {
  manifestHash?: string;
  signatureVerified?: boolean;
  status?: "active" | "quarantined" | "revoked";
  tenantId?: string | null;
};

export function selectOrchestraSkill(
  candidates: OrchestraManifestCandidate[],
  input: {
    taskKind: string;
    surface: AgentRuntimeSurface;
    originSurface?: AgentRuntimeOriginSurface | null;
    entryPoint?: AgentRuntimeEntryPoint | null;
    tenantId?: string;
  }
): OrchestraManifestCandidate {
  const eligible = candidates.filter(candidate => {
    if (candidate.status && candidate.status !== "active") return false;
    if (candidate.signatureVerified === false) return false;
    if (candidate.tenantId && candidate.tenantId !== input.tenantId)
      return false;
    if (!candidate.taskTypes.includes(input.taskKind)) return false;
    return supportsSkillCapabilityCaller(candidate, {
      surface: input.surface,
      originSurface: input.originSurface,
      entryPoint: input.entryPoint,
    });
  });
  if (eligible.length === 0)
    throw new Error("manifest_untrusted_or_unsupported");
  return [...eligible].sort((left, right) =>
    left.skillSlug.localeCompare(right.skillSlug)
  )[0];
}
