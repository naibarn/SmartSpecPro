import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  parseSkillFile,
  type SkillDefinition,
  type SkillLocalExecutionConfig,
} from "@smartspec/skills";
import type {
  LocalAiExecutionMode,
  LocalScriptManifestContract,
  LocalSkillExecutionEnvelope,
  LocalSkillExecutionTier,
  LocalSkillFrontmatterPolicy,
  LocalSkillOutputContract,
  LocalSkillRuntimeKind,
  LocalSkillSignalSummary,
  LocalSkillStagedFileDescriptor,
  ResolvedLocalSkillPolicy,
} from "../../../../packages/local-ai-core/src/index";
import {
  LOCAL_SCRIPT_RUNTIME_KINDS,
  LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS,
  LOCAL_SKILL_EXECUTION_TIERS,
} from "../../../../packages/local-ai-core/src/index";
import {
  resolveSkillBundleDir,
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";

const localSkillTierSchema = z.enum(LOCAL_SKILL_EXECUTION_TIERS);
const localScriptRuntimeKindSchema = z.enum(LOCAL_SCRIPT_RUNTIME_KINDS);
const localScriptSupportedOutputKindSchema = z.enum(
  LOCAL_SCRIPT_SUPPORTED_OUTPUT_KINDS,
);

const localScriptManifestSchema = z
  .object({
    runtimeKind: localScriptRuntimeKindSchema,
    reviewedEntry: z.string().trim().min(1),
    artifactDigestSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i),
    permissionProfile: z.string().trim().min(1).max(120),
    inputRoots: z.array(z.string().trim().min(1)).min(1),
    outputRoots: z.array(z.string().trim().min(1)).min(1),
    maxOutputMb: z.number().positive().max(1024),
    provenance: z
      .object({
        builder: z.string().trim().min(1).nullable().optional(),
        buildId: z.string().trim().min(1).nullable().optional(),
        reviewedAt: z.string().trim().min(1).nullable().optional(),
        signatureSha256: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{64}$/i)
          .nullable()
          .optional(),
        version: z.string().trim().min(1).nullable().optional(),
      })
      .strict(),
    sourceLanguage: z.string().trim().min(1).nullable().optional(),
    requiresCompiledArtifact: z.boolean().optional(),
    supportedOutputKinds: z
      .array(localScriptSupportedOutputKindSchema)
      .optional(),
  })
  .strict();

function isPathInsideDir(resolvedPath: string, rootDir: string): boolean {
  const relative = path.relative(rootDir, resolvedPath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveSkillSourcePaths(
  skill: SkillDefinition,
): {
  skillDir: string;
  skillManifestPath: string | null;
  bundleDir: string;
  bundleManifestPath: string | null;
} | null {
  if (typeof skill.skillFilePath !== "string" || skill.skillFilePath.trim().length === 0) {
    return null;
  }

  const skillFolder = path.dirname(skill.skillFilePath.trim());
  for (const candidateDir of resolveSkillDirCandidates(skillFolder)) {
    const skillManifestPath = resolveSkillManifestPath(candidateDir);
    if (!skillManifestPath) {
      continue;
    }
    const bundleDir = resolveSkillBundleDir(candidateDir) ?? candidateDir;
    const bundleManifestPath = path.join(bundleDir, "skill.manifest.json");
    return {
      skillDir: candidateDir,
      skillManifestPath,
      bundleDir,
      bundleManifestPath: fs.existsSync(bundleManifestPath)
        ? bundleManifestPath
        : null,
    };
  }

  return null;
}

function normalizeFrontmatterPolicy(
  raw: unknown,
): LocalSkillFrontmatterPolicy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const input = raw as SkillLocalExecutionConfig;
  const parsedTier = localSkillTierSchema.safeParse(input.tier);
  if (!parsedTier.success) {
    return null;
  }

  const runtime =
    input.runtime === "gemma4_text" || input.runtime === "script_bundle"
      ? input.runtime
      : null;

  return {
    tier: parsedTier.data,
    reviewed: input.reviewed === true,
    allowOffline:
      input.allowOffline === true || input.allow_offline === true,
    runtime,
  };
}

function readSkillFrontmatterPolicy(
  skill: SkillDefinition,
): {
  policy: LocalSkillFrontmatterPolicy | null;
  warnings: string[];
} {
  const resolved = resolveSkillSourcePaths(skill);
  if (!resolved?.skillManifestPath) {
    return { policy: null, warnings: [] };
  }

  try {
    const rawContent = fs.readFileSync(resolved.skillManifestPath, "utf-8");
    const parsed = parseSkillFile(rawContent);
    const rawMetadata = parsed.metadata as unknown as Record<string, unknown>;
    const policy = normalizeFrontmatterPolicy(
      rawMetadata.localExecution ?? rawMetadata.local_execution,
    );

    return {
      policy,
      warnings: parsed.warnings ?? [],
    };
  } catch (error) {
    return {
      policy: null,
      warnings: [
        `local_skill_frontmatter_read_failed:${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

export function readReviewedLocalScriptManifest(
  skill: SkillDefinition,
): {
  manifest: LocalScriptManifestContract | null;
  warnings: string[];
} {
  const resolved = resolveSkillSourcePaths(skill);
  if (!resolved?.bundleManifestPath) {
    return { manifest: null, warnings: [] };
  }

  try {
    const raw = JSON.parse(
      fs.readFileSync(resolved.bundleManifestPath, "utf-8"),
    ) as Record<string, unknown>;
    const parsed = localScriptManifestSchema.safeParse(raw.localExecution);

    if (!parsed.success) {
      return {
        manifest: null,
        warnings: [`local_script_manifest_invalid:${parsed.error.issues[0]?.message ?? "invalid"}`],
      };
    }

    const manifest = parsed.data;
    const reviewedEntryPath = path.resolve(
      resolved.bundleDir,
      manifest.reviewedEntry,
    );
    if (
      !isPathInsideDir(reviewedEntryPath, resolved.bundleDir) ||
      !fs.existsSync(reviewedEntryPath)
    ) {
      return {
        manifest: null,
        warnings: ["local_script_reviewed_entry_missing_or_outside_bundle"],
      };
    }

    return {
      manifest,
      warnings: [],
    };
  } catch (error) {
    return {
      manifest: null,
      warnings: [
        `local_script_manifest_read_failed:${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function getSkillSignals(skill: SkillDefinition): LocalSkillSignalSummary {
  return {
    requiresNetwork: skill.requiresNetwork === true,
    requiresBrowser: skill.requiresBrowser === true,
    maxRuntimeSeconds:
      typeof skill.maxRuntimeSeconds === "number"
        ? skill.maxRuntimeSeconds
        : null,
    maxInputMb:
      typeof skill.maxInputMb === "number" ? skill.maxInputMb : null,
    sandboxProfileSlug:
      typeof skill.sandboxProfileSlug === "string" &&
      skill.sandboxProfileSlug.trim().length > 0
        ? skill.sandboxProfileSlug.trim()
        : null,
  };
}

function isScriptCandidate(skill: SkillDefinition): boolean {
  return (
    skill.executionMode === "python" ||
    skill.executionMode === "sandbox-command"
  );
}

function isTextLocalCandidate(skill: SkillDefinition): boolean {
  return (
    skill.executionMode === "llm-only" ||
    skill.executionMode === "core-text" ||
    skill.executionMode === ("enhance-prompt" as typeof skill.executionMode)
  );
}

const CURATED_TAURI_LOCAL_SAFE_TEXT_SKILL_IDS = new Set<string>([
  "translation",
  "storyboard-writer",
  "video-storyboard-to-prompts",
  "image_prompt_engineer",
  "smart-landscape-designer",
  "text-to-seedanceprompt",
  "cartoon-storyboard-prompts",
  "presentation-layout-designer",
  "editorial-layout-planner",
  "general-article-writer",
  "business-article-writer",
  "marketing-article-writer",
  "lifestyle-article-writer",
  "education-article-writer",
  "parenting-article-writer",
  "creative-story-writer",
  "documentary-script-writer",
  "help-content-writer",
]);

function matchesCuratedLocalSafeTextSkill(skill: SkillDefinition): boolean {
  const normalizedId = String(skill.id ?? "").trim().toLowerCase();
  if (CURATED_TAURI_LOCAL_SAFE_TEXT_SKILL_IDS.has(normalizedId)) {
    return true;
  }
  return (
    normalizedId.endsWith("-article-writer") ||
    normalizedId.endsWith("-reviewer")
  );
}

export function resolveLocalSkillExecutionPolicy(input: {
  skill: SkillDefinition;
  platform: "web" | "tauri";
  userPresent?: boolean;
  origin?:
    | "chat"
    | "team_room"
    | "team_run"
    | "agency"
    | "public_api"
    | "scheduler"
    | "workflow_background"
    | "channel_bridge";
}): ResolvedLocalSkillPolicy {
  const warnings: string[] = [];
  const derivedFrom = ["default"];
  const signals = getSkillSignals(input.skill);

  const frontmatter = readSkillFrontmatterPolicy(input.skill);
  warnings.push(...frontmatter.warnings);
  if (frontmatter.policy) {
    derivedFrom.push("frontmatter");
  }

  const declaredTier = frontmatter.policy?.tier ?? "cloud_required";
  const reviewed = frontmatter.policy?.reviewed === true;
  const allowOffline = frontmatter.policy?.allowOffline === true;
  const declaredRuntime = frontmatter.policy?.runtime ?? null;
  const origin = input.origin ?? "chat";
  const userPresent = input.userPresent !== false;

  const fail = (
    reason: string,
    tier: LocalSkillExecutionTier = "cloud_required",
    runtimeKind: LocalSkillRuntimeKind = "none",
    localScriptManifest: LocalScriptManifestContract | null = null,
  ): ResolvedLocalSkillPolicy => ({
    tier,
    runtimeKind,
    eligible: false,
    reviewed,
    allowOffline,
    requiresTauri: tier === "local_safe",
    reason,
    warnings,
    derivedFrom,
    signals,
    localScriptManifest,
  });

  if (
    origin === "public_api" ||
    origin === "scheduler" ||
    origin === "workflow_background" ||
    origin === "channel_bridge" ||
    origin === "team_run"
  ) {
    return fail("origin_cloud_required");
  }

  if (!frontmatter.policy && !(isTextLocalCandidate(input.skill) && matchesCuratedLocalSafeTextSkill(input.skill))) {
    return fail("missing_local_execution_policy");
  }

  if (!frontmatter.policy && isTextLocalCandidate(input.skill) && matchesCuratedLocalSafeTextSkill(input.skill)) {
    warnings.push("curated_local_safe_text_skill");
    derivedFrom.push("curated_allowlist");
  }

  if (
    declaredTier === "cloud_required" &&
    !derivedFrom.includes("curated_allowlist")
  ) {
    return fail("declared_cloud_required");
  }

  if (declaredTier === "local_preprocess_only") {
    if (declaredRuntime === "script_bundle") {
      warnings.push("local_preprocess_only_runtime_script_bundle_ignored");
    }
    return {
      tier: "local_preprocess_only",
      runtimeKind: "gemma4_text",
      eligible: true,
      reviewed,
      allowOffline,
      requiresTauri: false,
      reason: "local_preprocess_only_declared",
      warnings,
      derivedFrom: [...derivedFrom, "skill_definition"],
      signals,
      localScriptManifest: null,
    };
  }

  if (!reviewed && !derivedFrom.includes("curated_allowlist")) {
    return fail("local_safe_not_reviewed");
  }

  if (!userPresent) {
    return fail("local_safe_requires_user_present");
  }

  if (input.platform !== "tauri" && !isTextLocalCandidate(input.skill)) {
    return fail("local_safe_requires_tauri");
  }

  if (signals.requiresBrowser) {
    return fail("requires_browser_not_local_safe");
  }

  if (signals.requiresNetwork) {
    return fail("requires_network_not_local_safe");
  }

  if (isTextLocalCandidate(input.skill)) {
    return {
      tier: "local_safe",
      runtimeKind: "gemma4_text",
      eligible: true,
      reviewed: reviewed || derivedFrom.includes("curated_allowlist"),
      allowOffline,
      requiresTauri: false,
      reason: derivedFrom.includes("curated_allowlist")
        ? "local_safe_text_skill_curated"
        : "local_safe_text_skill",
      warnings,
      derivedFrom: [...derivedFrom, "skill_definition"],
      signals,
      localScriptManifest: null,
    };
  }

  if (!isScriptCandidate(input.skill)) {
    return fail("unsupported_execution_mode_for_local_safe");
  }

  const scriptManifest = readReviewedLocalScriptManifest(input.skill);
  warnings.push(...scriptManifest.warnings);
  if (scriptManifest.manifest) {
    derivedFrom.push("bundle_manifest");
  }

  if (!scriptManifest.manifest) {
    return fail("missing_reviewed_local_script_manifest");
  }

  return {
    tier: "local_safe",
    runtimeKind: "script_bundle",
    eligible: true,
    reviewed,
    allowOffline,
    requiresTauri: true,
    reason: "local_safe_script_skill",
    warnings,
    derivedFrom: [...derivedFrom, "skill_definition"],
    signals,
    localScriptManifest: scriptManifest.manifest,
  };
}

function blockLocalPolicy(
  policy: ResolvedLocalSkillPolicy,
  reason: string,
): ResolvedLocalSkillPolicy {
  return {
    ...policy,
    eligible: false,
    reason,
    warnings: policy.warnings.includes(reason)
      ? policy.warnings
      : [...policy.warnings, reason],
  };
}

export function applyLocalSkillExecutionPolicyGate(
  policy: ResolvedLocalSkillPolicy,
  input: {
    featureEnabled: boolean;
    forceCloudOnly: boolean;
    userEnabled: boolean;
    executionMode: LocalAiExecutionMode;
  },
): ResolvedLocalSkillPolicy {
  if (!input.featureEnabled) {
    return blockLocalPolicy(policy, "tenant_disabled");
  }

  if (input.forceCloudOnly) {
    return blockLocalPolicy(policy, "force_cloud_only");
  }

  if (!input.userEnabled || input.executionMode === "off") {
    return blockLocalPolicy(policy, "user_local_ai_disabled");
  }

  if (input.executionMode === "cloud_only") {
    return blockLocalPolicy(policy, "user_cloud_only_mode");
  }

  if (
    input.executionMode === "local_only" &&
    policy.tier !== "local_safe"
  ) {
    return blockLocalPolicy(policy, "local_only_requires_local_safe_skill");
  }

  return policy;
}

export function resolveEffectiveLocalSkillExecutionPolicy(input: {
  skill: SkillDefinition;
  platform: "web" | "tauri";
  userPresent?: boolean;
  origin?:
    | "chat"
    | "team_room"
    | "team_run"
    | "agency"
    | "public_api"
    | "scheduler"
    | "workflow_background"
    | "channel_bridge";
  featureEnabled: boolean;
  forceCloudOnly: boolean;
  userEnabled: boolean;
  executionMode: LocalAiExecutionMode;
}): ResolvedLocalSkillPolicy {
  const base = resolveLocalSkillExecutionPolicy({
    skill: input.skill,
    platform: input.platform,
    userPresent: input.userPresent,
    origin: input.origin,
  });

  return applyLocalSkillExecutionPolicyGate(base, {
    featureEnabled: input.featureEnabled,
    forceCloudOnly: input.forceCloudOnly,
    userEnabled: input.userEnabled,
    executionMode: input.executionMode,
  });
}

export function buildLocalSkillExecutionEnvelope(input: {
  skillId: string;
  localExecutionId: string;
  runtimeKind: Exclude<LocalSkillRuntimeKind, "none">;
  params?: Record<string, unknown>;
  stagedInputs?: LocalSkillStagedFileDescriptor[];
  outputContract?: LocalSkillOutputContract | null;
  metadata?: Record<string, unknown>;
  userToken?: string;
  providerApiKeys?: string[];
  refreshToken?: string;
  sessionToken?: string;
}): LocalSkillExecutionEnvelope {
  return {
    skillId: input.skillId,
    localExecutionId: input.localExecutionId,
    runtimeKind: input.runtimeKind,
    params: { ...(input.params ?? {}) },
    stagedInputs: [...(input.stagedInputs ?? [])],
    outputContract: input.outputContract ?? null,
    metadata: { ...(input.metadata ?? {}) },
  };
}
