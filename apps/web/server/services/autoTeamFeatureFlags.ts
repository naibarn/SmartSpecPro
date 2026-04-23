export const AUTO_TEAM_FEATURE_FLAG_NAMES = {
  canonicalExecution: "AUTO_TEAM_CANONICAL_EXECUTION",
  canonicalShadowMode: "AUTO_TEAM_CANONICAL_SHADOW_MODE",
  mediaJobEnforcement: "AUTO_TEAM_MEDIA_JOB_ENFORCEMENT",
  completionEvidenceGate: "AUTO_TEAM_COMPLETION_EVIDENCE_GATE",
  rollbackReadonlyMode: "AUTO_TEAM_ROLLBACK_READONLY_MODE",
  retentionCleanup: "AUTO_TEAM_RETENTION_CLEANUP",
} as const;

export type AutoTeamExecutionMode =
  | "legacy_unverified"
  | "shadow"
  | "enforced"
  | "rollback_readonly";

export interface AutoTeamRolloutFlags {
  canonicalExecution: boolean;
  canonicalShadowMode: boolean;
  mediaJobEnforcement: boolean;
  completionEvidenceGate: boolean;
  rollbackReadonlyMode: boolean;
  retentionCleanup: boolean;
}

export interface AutoTeamExecutionModeSnapshot {
  executionMode: AutoTeamExecutionMode;
  frozenAt: string;
  flags: AutoTeamRolloutFlags;
}

function readEnvBoolean(flagName: string, fallback = false): boolean {
  const raw = process.env[flagName];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function getAutoTeamRolloutFlags(): Promise<AutoTeamRolloutFlags> {
  return {
    canonicalExecution: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.canonicalExecution, false),
    canonicalShadowMode: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.canonicalShadowMode, false),
    mediaJobEnforcement: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.mediaJobEnforcement, false),
    completionEvidenceGate: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.completionEvidenceGate, false),
    rollbackReadonlyMode: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.rollbackReadonlyMode, false),
    retentionCleanup: readEnvBoolean(AUTO_TEAM_FEATURE_FLAG_NAMES.retentionCleanup, false),
  };
}

export function resolveAutoTeamExecutionMode(
  flags: AutoTeamRolloutFlags,
): AutoTeamExecutionMode {
  if (flags.rollbackReadonlyMode) {
    return "rollback_readonly";
  }
  if (!flags.canonicalExecution) {
    return "legacy_unverified";
  }
  return flags.canonicalShadowMode ? "shadow" : "enforced";
}

export async function freezeAutoTeamExecutionModeSnapshot(): Promise<AutoTeamExecutionModeSnapshot> {
  const flags = await getAutoTeamRolloutFlags();
  return {
    executionMode: resolveAutoTeamExecutionMode(flags),
    frozenAt: new Date().toISOString(),
    flags,
  };
}

export function isAutoTeamExecutionFrozen(
  snapshot: Pick<AutoTeamExecutionModeSnapshot, "executionMode"> | null | undefined,
): boolean {
  return Boolean(snapshot?.executionMode);
}

export function isAutoTeamReadOnlyMode(flags: AutoTeamRolloutFlags): boolean {
  return flags.rollbackReadonlyMode;
}

export function shouldEnforceAutoTeamRouteGate(flags: AutoTeamRolloutFlags): boolean {
  return flags.canonicalExecution && !flags.rollbackReadonlyMode;
}

export function shouldEnforceAutoTeamMediaJobs(flags: AutoTeamRolloutFlags): boolean {
  return flags.mediaJobEnforcement && !flags.rollbackReadonlyMode;
}

export function shouldEnforceAutoTeamCompletionEvidence(flags: AutoTeamRolloutFlags): boolean {
  return flags.completionEvidenceGate && !flags.rollbackReadonlyMode;
}

export function shouldRunAutoTeamRetentionCleanup(flags: AutoTeamRolloutFlags): boolean {
  return flags.retentionCleanup;
}
