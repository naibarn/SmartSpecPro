export const LOCAL_SKILL_EXECUTION_TIERS = [
  "cloud_required",
  "local_preprocess_only",
  "local_safe",
] as const;

export type LocalSkillExecutionTier =
  (typeof LOCAL_SKILL_EXECUTION_TIERS)[number];

export const LOCAL_SKILL_RUNTIME_KINDS = [
  "none",
  "gemma4_text",
  "script_bundle",
] as const;

export type LocalSkillRuntimeKind =
  (typeof LOCAL_SKILL_RUNTIME_KINDS)[number];

export const LOCAL_SCRIPT_RUNTIME_KINDS = [
  "python",
  "node_bundle",
] as const;

export type LocalScriptRuntimeKind =
  (typeof LOCAL_SCRIPT_RUNTIME_KINDS)[number];

export const LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS = [
  "text",
  "json",
  "files",
] as const;

export type LocalScriptSupportedOutputKind =
  (typeof LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS)[number];

export interface LocalSkillSignalSummary {
  requiresNetwork: boolean;
  requiresBrowser: boolean;
  maxRuntimeSeconds: number | null;
  maxInputMb: number | null;
  sandboxProfileSlug: string | null;
}

export interface LocalScriptProvenance {
  builder?: string | null;
  buildId?: string | null;
  reviewedAt?: string | null;
  signatureSha256?: string | null;
  version?: string | null;
}

export interface LocalScriptManifestContract {
  runtimeKind: LocalScriptRuntimeKind;
  reviewedEntry: string;
  artifactDigestSha256: string;
  permissionProfile: string;
  inputRoots: string[];
  outputRoots: string[];
  maxOutputMb: number;
  provenance: LocalScriptProvenance;
  sourceLanguage?: string | null;
  requiresCompiledArtifact?: boolean;
  supportedOutputKinds?: LocalScriptSupportedOutputKind[];
}

export interface LocalSkillFrontmatterPolicy {
  tier: LocalSkillExecutionTier;
  reviewed: boolean;
  allowOffline: boolean;
  runtime: "gemma4_text" | "script_bundle" | null;
}

export interface ResolvedLocalSkillPolicy {
  tier: LocalSkillExecutionTier;
  runtimeKind: LocalSkillRuntimeKind;
  eligible: boolean;
  reviewed: boolean;
  allowOffline: boolean;
  requiresTauri: boolean;
  reason: string | null;
  warnings: string[];
  derivedFrom: string[];
  signals: LocalSkillSignalSummary;
  localScriptManifest: LocalScriptManifestContract | null;
}

export interface LocalSkillStagedFileDescriptor {
  id: string;
  stagedPath: string;
  originalName?: string | null;
  mediaType?: string | null;
}

export interface LocalSkillOutputContract {
  allowedKinds: LocalScriptSupportedOutputKind[];
  outputRootIds: string[];
}

export interface LocalSkillExecutionEnvelope {
  skillId: string;
  localExecutionId: string;
  runtimeKind: Exclude<LocalSkillRuntimeKind, "none">;
  params: Record<string, unknown>;
  stagedInputs: LocalSkillStagedFileDescriptor[];
  outputContract: LocalSkillOutputContract | null;
  metadata: Record<string, unknown>;
}
