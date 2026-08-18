/**
 * Skills tRPC Router
 * Handles skill management and prompt enhancement
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  autoSyncSkillsFromFolder,
  getAvailableSkills,
  getAvailableSkillsAsync,
  getSkillById,
  getSkillByIdOrType,
  SkillDefinition,
  refreshSkillCache,
  syncSingleSkillIfChanged,
} from "../services/skillRegistry";
import {
  getStyleCategories,
  getVFXCategories,
  getPromptOptions,
  buildSystemPrompt,
  buildUserPrompt,
  parsePromptResponse,
  loadSkillFile,
  resolvePromptEnhancementSkill,
  type PromptEnhancementRequest,
} from "../services/promptEnhancementService";
import { db, getDb } from "../db";
import {
  llmProviders,
  modelProviderMap,
  skills,
  skillContractSnapshots,
  skillImprovementRecommendations,
  skillImprovementRuns,
  skillMaintenanceSchedules,
  skillPermissions,
  userGroups,
  users as usersTable,
  type Skill,
  type InsertSkill,
} from "../../drizzle/schema";
import { eq, asc, desc, like, ilike, or, and, sql, inArray } from "drizzle-orm";
import { deductCredits, calculateCreditsForLLM, hasEnoughCredits } from "../services/creditService";
import { executeWithFallback, getProviderForModel } from "../services/llmRouter";
import { buildModelLookupCandidates } from "../services/modelLookup";
import { getUploadsDir } from "../storage";
import { getCachedPublicAppUrl } from "../services/appRuntimeConfig";
import { resolveExternalMediaReferenceUrls } from "../services/mediaGenerationService";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import yaml from "js-yaml";
import AdmZip from "adm-zip";
import { spawn } from "child_process";
import {
  getUserVisibleSkills as _getUserVisibleSkills,
  getAllSkillsForUser,
  setSkillVisibility,
  batchSetVisibility,
  setAutoTrigger,
} from "../services/userSkillService";
import { generateMarketplaceContent } from "../services/marketplaceContentGenerator";
import { decrypt } from "../services/crypto";
import { sanitizeBrandText } from "../services/brandingSanitizer";
import {
  getRecommendedExecutionModeForSkillCategory,
  isExecutionModeCompatibleWithSkillCategory,
} from "@shared/skills/skillCategoryMetadata";
import {
  applyIscProposal as applyIscProposalFile,
  launchSkillStudioTask,
  listIscProposalsWithOwners,
  readIscProposalContent,
} from "../services/skillStudioService";
import { analyzeSkillForMaintenance } from "../services/skillMaintenanceAnalyzer";
import {
  buildSkillContractSnapshot,
  compareSkillContractSnapshots,
} from "../services/skillCompatibilityGate";
import { persistSkillMaintenanceAnalysis } from "../services/skillUpgradePlanner";
import { applySkillUpgradeRecommendation } from "../services/skillUpgradeApplier";
import {
  buildPromptLengthPlan,
  resolvePromptLanguageHintFromInputs,
  truncateToPromptLength,
} from "../services/promptLengthGuard";
import {
  extractZipToDirectory,
  hasRelativeSkillManifest,
  mirrorExistingSkillManifest,
  resolveSkillManifestPath,
  resolveSkillDirCandidates,
  writeNativeSkillBundleScaffold,
  updateSkillManifestFiles,
  writeSkillManifestFiles,
} from "../services/skillFiles";
import { refreshModelCache } from "../services/modelRegistry";
import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "../services/enabledLlmModels";
import { resolveMediaTypeFromSkillCategory, sanitizeMediaModelSelection } from "../services/mediaModelSelection";
import { buildCustomSkillUserPrompt } from "../services/skillExecutionPromptBuilder";
import {
  isAudioFirstStoryboardPromptPackage,
  prepareSkillExecutionInputsForPromptPackage,
} from "../services/skillExecutionInput";
import {
  buildNativeSkillRuntimePlanContext,
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
} from "../services/agentRuntime/skillRuntimeOrchestrator";
import {
  optimizeProductReferenceStoryboardPrompt,
  runProductReferenceStoryboardPromptSkill,
} from "../services/productReferenceStoryboardSkillRunner";
import {
  extractStructuredPromptBundleTextOutput,
  prepareMediaStudioPythonPromptSkillExecution,
} from "../services/mediaStudioPromptSkillExecution";
import {
  buildElevenLabsProductVoiceoverDialogueRepairPrompt,
  evaluateElevenLabsProductVoiceoverDialogueQuality,
  normalizeElevenLabsProductVoiceoverDialogueOutput,
  resolveElevenLabsProductVoiceoverDialogueRepairMaxTokens,
} from "../services/elevenLabsProductVoiceoverDialogueQuality";
import {
  buildAudioFirstStoryboardRepairPrompt,
  buildAudioFirstStoryboardSharedSectionsFallback,
  countStoryboardPromptBlocks,
  extractStoryboardSharedSections,
  mergeSharedSectionsWithPromptBlocks,
  resolveAudioFirstStoryboardPromptRepair,
  sanitizeAudioFirstStoryboardPromptBlocks,
  shouldUseAudioFirstStoryboardSharedSectionsFallback,
  stripSharedSectionsFromPromptBlocks,
} from "../services/storyboardPromptPackageRepair";
import { resolveEffectiveLocalSkillExecutionPolicy } from "../services/localAiSkillPolicy";
import { getRequesterLocalAiSurfaceContext } from "../services/localAiUserContext";
import { getConversationById } from "../services/chatService";
import { readLocalAiConversationOverride } from "../../shared/localAiConversationSettings";
import {
  buildCompactStoryboardReviewVideoPrompt,
  extractStoryboardNativeSpeechText,
  formatStoryboardNativeSpeechDirective,
} from "../../shared/storyboardPromptAudio";
import {
  resolveConversationLocalAiMode,
  resolveExplicitChatSessionLocalAiMode,
} from "@smartspec/local-ai-core";
import {
  executeSkillMaintenanceSweep,
  resolveMaintenanceScheduleInput,
} from "../services/skillMaintenanceScheduler";
import type { Message, MessageContent } from "../_core/llm";

// Skills directory path
const SKILLS_DIR = path.resolve(process.cwd(), "skills");
const LEGACY_UPGRADE_RECOMMENDATION_TYPES = [
  "native-bundle-upgrade",
  "migrate-to-native-bundle",
] as const;
const LEGACY_UPGRADE_APPLY_RUN_STATES = [
  "queued",
  "running",
  "failed",
  "completed",
  "blocked",
  "canceled",
] as const;
const LEGACY_UPGRADE_STALE_APPLY_RUN_MINUTES = 30;
const legacyUpgradeSeedLocks = new Map<string, Promise<void>>();

function deriveLegacyUpgradeRunState(status: string): "queued" | "running" | "failed" | "completed" | "blocked" | "canceled" {
  if (status === "queued" || status === "running") {
    return status;
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "blocked") {
    return "blocked";
  }
  return "canceled";
}

function extractLegacyRunTaskId(logsJson: unknown): string | null {
  if (!logsJson || typeof logsJson !== "object") {
    return null;
  }
  const taskId = (logsJson as Record<string, unknown>).taskId;
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
}

function extractLegacyRunStringField(logsJson: unknown, key: string): string | null {
  if (!logsJson || typeof logsJson !== "object") {
    return null;
  }
  const value = (logsJson as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractLegacyRunNumberField(logsJson: unknown, key: string): number | null {
  if (!logsJson || typeof logsJson !== "object") {
    return null;
  }
  const value = (logsJson as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractLegacyRunLineage(logsJson: unknown): Record<string, unknown> | null {
  if (!logsJson || typeof logsJson !== "object") {
    return null;
  }
  const lineage = (logsJson as Record<string, unknown>).lineage;
  if (!lineage || typeof lineage !== "object" || Array.isArray(lineage)) {
    return null;
  }
  return lineage as Record<string, unknown>;
}

function isLegacyUpgradeNoChangeRunCandidate(run: {
  status: string;
  summary: string | null;
  errorMessage: string | null;
  logsJson: unknown;
}): boolean {
  if (run.status !== "failed") {
    return false;
  }

  const completionMode = extractLegacyRunStringField(run.logsJson, "completionMode");
  if (completionMode === "no_changes") {
    return true;
  }

  const summary = (run.summary || "").toLowerCase();
  const resultMessage = extractLegacyRunStringField(run.logsJson, "resultMessage")?.toLowerCase() || "";
  const errorMessage = (run.errorMessage || extractLegacyRunStringField(run.logsJson, "resultError") || "").toLowerCase();
  const combined = `${summary} ${resultMessage}`.trim();

  const noChangeSignals = [
    "no patches generated",
    "no changes required",
    "completed without code changes",
    "isc improve complete",
  ];

  if (!noChangeSignals.some((signal) => combined.includes(signal))) {
    return false;
  }

  return combined.includes("no patches generated")
    || combined.includes("no changes required")
    || combined.includes("completed without code changes")
    || (combined.includes("isc improve complete") && !errorMessage.includes("proposal generation failed"));
}

function isLegacyUpgradeCompletedHistoryRun(run: {
  runType: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  logsJson: unknown;
} | null | undefined): boolean {
  if (!run || run.status !== "completed") {
    return false;
  }

  const applyStrategy = extractLegacyRunStringField(run.logsJson, "applyStrategy");
  const completionMode = extractLegacyRunStringField(run.logsJson, "completionMode");
  const resultMessage = extractLegacyRunStringField(run.logsJson, "resultMessage");
  const combined = [
    run.summary,
    run.errorMessage,
    resultMessage,
    applyStrategy,
    completionMode,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return run.runType === "apply"
    && (
      applyStrategy === "proposal"
      || completionMode === "no_changes"
      || combined.includes("proposal generated")
      || combined.includes("no patches generated")
      || combined.includes("no code changes")
      || combined.includes("without code changes")
      || combined.includes("no changes required")
      || combined.includes("no_changes")
    );
}

function isLegacyUpgradeWorkspaceRootIssue(logsJson: unknown, resultText?: string | null): boolean {
  const fields = [
    extractLegacyRunStringField(logsJson, "failureCode"),
    extractLegacyRunStringField(logsJson, "workspaceRoot"),
    extractLegacyRunStringField(logsJson, "entrypointRoot"),
    extractLegacyRunStringField(logsJson, "resultError"),
    extractLegacyRunStringField(logsJson, "errorMessage"),
    resultText,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\\/g, "/")
    .toLowerCase();

  return fields.includes("isc_workspace_root_pollution")
    || (fields.includes("/runs/workspaces/") && fields.includes("/skills/intelligence-skill-creator/"));
}

function buildLegacyNoChangeCompletionLogs(logsJson: unknown): Record<string, unknown> {
  const current = logsJson && typeof logsJson === "object" ? logsJson as Record<string, unknown> : {};
  return {
    ...current,
    savedProposals: Array.isArray(current.savedProposals) ? current.savedProposals : [],
    latestProposal: null,
    resultError: null,
    completionMode: "no_changes",
  };
}

function buildLegacyStaleApplyRunRecoveryLogs(logsJson: unknown, recoveredAt: Date): Record<string, unknown> {
  const current = logsJson && typeof logsJson === "object" ? logsJson as Record<string, unknown> : {};
  return {
    ...current,
    failureCode: "stale_apply_task",
    staleTaskRecovered: true,
    recoveredAt: recoveredAt.toISOString(),
    resultError: "Apply task was queued or running past the recovery threshold and was retried automatically.",
  };
}

function isLegacyApplyRunStale(run: {
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  startedAt?: Date | string | null;
}, now = new Date(), thresholdMinutes = LEGACY_UPGRADE_STALE_APPLY_RUN_MINUTES): boolean {
  if (run.status !== "queued" && run.status !== "running") {
    return false;
  }
  const lastActivity = new Date(run.updatedAt ?? run.startedAt ?? run.createdAt).getTime();
  if (!Number.isFinite(lastActivity)) {
    return false;
  }
  return now.getTime() - lastActivity >= thresholdMinutes * 60 * 1000;
}

async function maybeSeedLegacyUpgradeQueue(params: {
  dbInstance: any;
  tenantId?: string | null;
  requestedBy?: number | null;
}): Promise<void> {
  const { dbInstance, tenantId = null, requestedBy = null } = params;
  const lockKey = tenantId ?? "__global__";
  const existing = legacyUpgradeSeedLocks.get(lockKey);
  if (existing) {
    return existing;
  }

  const seedPromise = (async () => {
    const conditions = [
      or(
        eq(skillImprovementRecommendations.recommendationType, LEGACY_UPGRADE_RECOMMENDATION_TYPES[0]),
        eq(skillImprovementRecommendations.recommendationType, LEGACY_UPGRADE_RECOMMENDATION_TYPES[1]),
      ),
    ];
    if (tenantId) {
      conditions.unshift(eq(skillImprovementRecommendations.tenantId, tenantId));
    }

    const [row] = await dbInstance
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(skillImprovementRecommendations)
      .where(and(...conditions));

    if ((row?.count ?? 0) > 0) {
      return;
    }

    await executeSkillMaintenanceSweep({
      db: dbInstance,
      requestedBy,
      triggerSource: "legacy-upgrade-seed",
      tenantId,
      filters: {
        limit: 200,
      },
    });
  })().finally(() => {
    legacyUpgradeSeedLocks.delete(lockKey);
  });

  legacyUpgradeSeedLocks.set(lockKey, seedPromise);
  return seedPromise;
}

const SKILL_EXECUTION_MODE_VALUES = [
  "llm-only",
  "media-generate",
  "enhance-prompt",
  "python",
  "sandbox-code",
  "sandbox-command",
  "sandbox-browser",
  "sandbox-file",
  "sandbox-media",
] as const;
const skillExecutionModeSchema = z.enum(SKILL_EXECUTION_MODE_VALUES);
const nativeBundleRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.\-/]+$/);
const nativeCheckpointPolicySchema = z.object({
  mode: z.enum(["parent-run", "per-run", "per-step", "manual"]),
  resumeCursor: z.string().trim().min(1).max(240).nullable().optional(),
}).passthrough();
const nativeSecurityPolicySchema = z.object({
  toolAllowlist: z.array(z.string().trim().min(1).max(120)).min(1),
  toolDenylist: z.array(z.string().trim().min(1).max(120)).default([]),
  networkEgress: z.enum(["none", "allowlisted", "restricted", "inherit"]),
  filesystemScopes: z.array(z.string().trim().min(1).max(120)).min(1),
  secretPolicy: z.object({
    redact: z.literal(true),
    persist: z.enum(["never", "redacted", "runtime-only"]),
  }).passthrough(),
  fanoutLimit: z.number().int().min(1).max(16),
  maxConcurrency: z.number().int().min(1).max(16),
  allowedInvocationModes: z.array(z.enum(["tool", "handoff"])).min(1),
}).passthrough().refine(
  value => value.maxConcurrency <= value.fanoutLimit,
  {
    message: "securityPolicy.maxConcurrency must not exceed fanoutLimit",
    path: ["maxConcurrency"],
  },
);
const nativeSubagentInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().min(1).max(100).optional(),
  id: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(160).optional(),
  mode: z.enum(["tool", "handoff"]).optional(),
  runtime_mode: z.enum(["tool", "handoff"]).optional(),
  runtimeMode: z.enum(["tool", "handoff"]).optional(),
  entrypoint: nativeBundleRelativePathSchema.optional(),
  path: nativeBundleRelativePathSchema.optional(),
  toolBoundary: z.array(z.string().trim().min(1).max(160)).optional(),
  tool_boundary: z.array(z.string().trim().min(1).max(160)).optional(),
  handoffPolicy: z.object({
    mode: z.enum(["always", "never", "conditional"]),
    approvalsRequired: z.boolean().optional(),
  }).passthrough().optional(),
  handoff_policy: z.object({
    mode: z.enum(["always", "never", "conditional"]),
    approvalsRequired: z.boolean().optional(),
  }).passthrough().optional(),
  checkpointPolicy: nativeCheckpointPolicySchema.optional(),
  checkpoint_policy: nativeCheckpointPolicySchema.optional(),
  verificationCommand: nativeBundleRelativePathSchema.optional(),
  verification_command: nativeBundleRelativePathSchema.optional(),
  fallbackBehavior: z.enum(["escalate-to-parent", "return-error", "retry-tool", "retry-handoff"]).optional(),
  fallback_behavior: z.enum(["escalate-to-parent", "return-error", "retry-tool", "retry-handoff"]).optional(),
}).passthrough();
const nativeOrchestratorInputSchema = nativeSubagentInputSchema.extend({
  mode: z.enum(["orchestrator"]).optional(),
  runtime_mode: z.enum(["tool", "handoff", "orchestrator"]).optional(),
  runtimeMode: z.enum(["tool", "handoff", "orchestrator"]).optional(),
});
const nativeRoutingInputSchema = z.object({
  from: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  to: z.string().trim().min(1).max(100).optional(),
  target: z.string().trim().min(1).max(100).optional(),
  subagent: z.string().trim().min(1).max(100).optional(),
  mode: z.enum(["tool", "handoff"]).optional(),
  runtime_mode: z.enum(["tool", "handoff"]).optional(),
  purpose: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
}).passthrough();
const localSkillPlatformSchema = z.enum(["web", "tauri"]).default("web");
const localSkillOriginSchema = z
  .enum([
    "chat",
    "team_room",
    "team_run",
    "agency",
    "public_api",
    "scheduler",
    "workflow_background",
    "channel_bridge",
  ])
  .default("chat");

function isSandboxExecutionMode(mode: string | null | undefined): boolean {
  return typeof mode === "string" && mode.startsWith("sandbox-");
}

function getDefaultSandboxProfileSlug(
  executionMode: string | null | undefined,
  category: string,
): string {
  if (executionMode === "sandbox-browser" || executionMode === "sandbox-command") {
    return "browser-default";
  }
  if (executionMode === "sandbox-file") {
    return "file-parser";
  }
  if (executionMode === "sandbox-media") {
    return "media-processing";
  }
  if (category === "slide_generation") {
    return "browser-default";
  }
  return "code-default";
}

function attachLocalExecutionPolicy<T extends Record<string, unknown>>(
  data: T,
  skill: SkillDefinition | undefined,
  input?: {
    platform?: "web" | "tauri";
    origin?:
      | "chat"
      | "team_room"
      | "team_run"
      | "agency"
      | "public_api"
      | "scheduler"
      | "workflow_background"
      | "channel_bridge";
    userPresent?: boolean;
    featureEnabled?: boolean;
    forceCloudOnly?: boolean;
    userEnabled?: boolean;
    executionMode?:
      | "off"
      | "auto"
      | "prefer_local"
      | "local_only"
      | "cloud_only";
  },
): T & {
  localExecutionPolicy: ReturnType<typeof resolveEffectiveLocalSkillExecutionPolicy> | null;
} {
  if (!skill) {
    return {
      ...data,
      localExecutionPolicy: null,
    };
  }

  return {
    ...data,
    localExecutionPolicy: resolveEffectiveLocalSkillExecutionPolicy({
      skill,
      platform: input?.platform ?? "web",
      origin: input?.origin ?? "chat",
      userPresent: input?.userPresent ?? true,
      featureEnabled: input?.featureEnabled ?? false,
      forceCloudOnly: input?.forceCloudOnly ?? true,
      userEnabled: input?.userEnabled ?? false,
      executionMode: input?.executionMode ?? "off",
    }),
  };
}

function attachNativeBundleMetadata<T extends Record<string, unknown>>(
  data: T,
  skill: SkillDefinition | undefined,
): T & {
  nativeBundleReady: boolean | undefined;
  nativeBundleFiles: string[] | undefined;
  nativeBundlePath: string | undefined;
  nativeBundleLockPath: string | undefined;
} {
  return {
    ...data,
    nativeBundleReady: skill?.nativeBundleReady,
    nativeBundleFiles: skill?.nativeBundleFiles,
    nativeBundlePath: skill?.nativeBundlePath,
    nativeBundleLockPath: skill?.nativeBundleLockPath,
  };
}

async function resolveLocalAiExecutionModeForSurface(input: {
  userId: number;
  tenantId: string | null | undefined;
  platform: "web" | "tauri";
  origin?: "chat" | "team_room" | "team_run" | "agency" | "public_api" | "scheduler" | "workflow_background" | "channel_bridge";
  conversationId?: number;
}) {
  const localAiContext = await getRequesterLocalAiSurfaceContext({
    userId: input.userId,
    tenantId: input.tenantId,
    platform: input.platform,
  });

  let executionMode = localAiContext.syncedPreferences.mode;
  if (
    typeof input.conversationId === "number" &&
    input.conversationId > 0
  ) {
    const conversation = await getConversationById(
      input.conversationId,
      input.userId,
    );
    if (conversation) {
      const override = readLocalAiConversationOverride(
        conversation.skillSettings?.localAiConversation,
      );
      executionMode =
        input.origin === "chat"
          ? resolveExplicitChatSessionLocalAiMode(override)
          : resolveConversationLocalAiMode(
              localAiContext.syncedPreferences,
              override,
            );
    }
  } else if (input.origin === "chat") {
    executionMode = resolveExplicitChatSessionLocalAiMode(null);
  }

  return {
    localAiContext,
    executionMode,
  };
}

/**
 * Parse skill.md frontmatter and content
 */
export interface SkillMetadata {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  auto_trigger?: boolean;
  trigger_patterns?: string[];
  credit_multiplier?: number;
  priority?: number;
  enabled_by_default?: boolean;
  llmModelId?: string;
  llm_model_id?: string;
  preferredProviderId?: number;
  preferred_provider_id?: number;
  strictProviderPin?: boolean;
  strict_provider_pin?: boolean;
  config?: Record<string, any>;
}

function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1]) as SkillMetadata;
        const body = parts.slice(2).join("---").trim();
        return { metadata: frontmatter || {}, content: body };
      } catch {
        return { metadata: {} as SkillMetadata, content };
      }
    }
  }
  return { metadata: {} as SkillMetadata, content };
}

function parseLlmJsonObject(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced || content).trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("invalid_llm_json");
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function storyboardSpeechLanguageLabel(speechMode: string, speechLanguage?: string | null): string {
  if (speechMode === "th") return "Thai";
  if (speechMode === "en") return "English";
  return String(speechLanguage ?? "").trim() || speechMode || "the requested language";
}

function storyboardNativeSpeechDirectiveExample(speechMode: string, speechLanguage?: string | null): string {
  const language = storyboardSpeechLanguageLabel(speechMode, speechLanguage);
  if (speechMode === "th" || language.toLowerCase() === "thai") {
    return 'Presenter พูดเป็นภาษาไทยว่า "[slot.voiceover_script]"';
  }
  if (speechMode === "en" || language.toLowerCase() === "english") {
    return 'Presenter says, clearly: "[slot.voiceover_script]"';
  }
  return `The presenter speaks in ${language}: "[slot.voiceover_script]"`;
}

function storyboardDialogueTargetSeconds(durationSeconds?: unknown): number {
  const durationValue = Number(durationSeconds);
  const duration = Number.isFinite(durationValue) && durationValue > 0
    ? Math.round(durationValue * 10) / 10
    : 8;
  const extraSpeechSeconds = duration <= 8 ? 1.5 : duration <= 12 ? 1 : 0;
  return Math.round(Math.max(1, duration + extraSpeechSeconds) * 2) / 2;
}

function inferStoryboardSpeechDirectiveMode(promptText: string): { speechMode: string; speechLanguage: string } {
  if (/พูดเป็นภาษาไทยว่า/i.test(promptText)) {
    return { speechMode: "th", speechLanguage: "Thai" };
  }
  if (/speaks\s+in\s+english\s*:/i.test(promptText)) {
    return { speechMode: "en", speechLanguage: "English" };
  }
  const languageMatch = promptText.match(/speaks\s+in\s+([^:]+)\s*:/i);
  const language = languageMatch?.[1]?.trim() || "";
  return { speechMode: language ? "other" : "en", speechLanguage: language || "English" };
}

function compactStoryboardPlannerContextText(
  value: unknown,
  maxCharacters = STORYBOARD_REVIEW_PLANNER_CONTEXT_MAX_CHARS,
): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxCharacters) return normalized;
  const sliced = normalized.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim();
  return `${sliced || normalized.slice(0, maxCharacters).trim()}...`;
}

function cleanStoryboardPlannerVoiceoverCandidate(value: unknown): string {
  return String(value ?? "")
    .replace(/^\s*(?:Voiceover|Dialogue|Spoken line|บทพูด|เสียงพูด)\s*:\s*/i, "")
    .replace(/^\s*Speaker\s+\d+\s*:\s*/i, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStoryboardPlannerSourceVoiceoverLines(sourceSlot?: {
  currentPrompt?: string | null;
  previousVoiceoverScript?: string | null;
  nextVoiceoverScript?: string | null;
}): string[] {
  const lines: string[] = [];
  const promptText = String(sourceSlot?.currentPrompt ?? "");
  for (const line of promptText.split(/\n+/)) {
    const match = line.match(/\bVoiceover\s*:\s*(.+)$/i);
    const cleaned = cleanStoryboardPlannerVoiceoverCandidate(match?.[1] ?? "");
    if (cleaned) lines.push(cleaned);
  }
  const inlineSpeech = cleanStoryboardPlannerVoiceoverCandidate(
    extractStoryboardNativeSpeechText(promptText),
  );
  if (inlineSpeech) lines.push(inlineSpeech);

  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const key = normalizeStoryboardVoiceoverForDuplicateCheck(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueLines.push(line);
  }
  return uniqueLines;
}

function repairStoryboardPlannerVoiceoversFromSource(input: {
  slots: StoryboardPlannerSlotResult[];
  sourceSlotById: ReadonlyMap<string, {
    currentPrompt?: string | null;
    durationSeconds?: number | null;
    previousVoiceoverScript?: string | null;
    nextVoiceoverScript?: string | null;
  }>;
  speechMode: string;
  speechLanguage?: string | null;
}): StoryboardPlannerSlotResult[] {
  if (input.speechMode === "none") return input.slots;

  const voiceoverCounts = buildStoryboardVoiceoverCounts(input.slots);
  return input.slots.map((slot) => {
    const sourceSlot = input.sourceSlotById.get(slot.id);
    const normalizedVoiceover = normalizeStoryboardVoiceoverForDuplicateCheck(slot.voiceoverScript);
    const needsRepair = !normalizedVoiceover
      || (voiceoverCounts.get(normalizedVoiceover) ?? 0) > 1
      || isStoryboardVoiceoverTooShort(
        slot.voiceoverScript,
        sourceSlot?.durationSeconds ?? 8,
        input.speechMode,
        input.speechLanguage ?? null,
      );
    if (!needsRepair) return slot;

    const sourceVoiceoverLines = extractStoryboardPlannerSourceVoiceoverLines(sourceSlot);
    const repairedVoiceover = sourceVoiceoverLines.join(" ").trim();
    if (!repairedVoiceover || isStoryboardVoiceoverTooShort(
      repairedVoiceover,
      sourceSlot?.durationSeconds ?? 8,
      input.speechMode,
      input.speechLanguage ?? null,
    )) {
      return slot;
    }

    return {
      ...slot,
      voiceoverScript: repairedVoiceover,
      qualityNotes: [
        ...slot.qualityNotes,
        "Voiceover repaired from the stored segment sub-shot voiceover source before validation.",
      ],
    };
  });
}

function buildStoryboardPlannerPrompt(input: {
  productMetadata: Record<string, unknown> | null;
  options: Record<string, unknown>;
  slots: Array<Record<string, unknown>>;
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  voiceoverFullScript?: string | null;
  useVoiceoverScriptAsConcept?: boolean;
}): string {
  const speechMode = String(input.options.speechMode ?? "none");
  const speechLanguage = String(input.options.speechLanguage ?? "").trim();
  const includeSpeech = speechMode !== "none";
  const suppliedVoiceoverFullScript = String(input.voiceoverFullScript ?? "").trim();
  const useVoiceoverScriptAsConcept = Boolean(input.useVoiceoverScriptAsConcept && suppliedVoiceoverFullScript);
  const globalConceptDetails = String(input.conceptDetails ?? "").trim();
  const globalStoryboardGuide = String(input.storyboardGuide ?? "").trim();
  const totalDurationSeconds = input.slots.reduce((sum, slot) => {
    const duration = Number(slot.durationSeconds);
    return sum + (Number.isFinite(duration) && duration > 0 ? duration : 8);
  }, 0);
  const nativeSpeechDirectiveExample = storyboardNativeSpeechDirectiveExample(speechMode, speechLanguage);
  const imageMap = input.slots.map((slot, index) => {
    const startImage = index * 2 + 1;
    const endImage = index * 2 + 2;
    const frameRoles = Array.isArray(slot.frameRoles) ? slot.frameRoles : ["start", "stop"];
    const firstRole = frameRoles[0] === "reference" ? "reference image" : frameRoles[0] === "stop" ? "stop/end frame" : "start frame";
    const secondRole = frameRoles[1] === "reference" ? "reference image" : frameRoles[1] === "start" ? "start frame" : "stop/end frame";
    const slotConceptDetails = String(slot.conceptDetails ?? "").trim();
    const slotStoryboardGuide = String(slot.storyboardGuide ?? "").trim();
    return {
      id: slot.id,
      index: slot.index,
      firstImageAlias: `@Image${startImage}`,
      secondImageAlias: `@Image${endImage}`,
      frameRoles,
      visionTask: [
        `Inspect @Image${startImage} as this slot's ${firstRole}.`,
        `Inspect @Image${endImage} as this slot's ${secondRole}.`,
        frameRoles[0] === "start" && frameRoles[1] === "stop"
          ? "Write motion and camera direction that fits the visible change between these two exact endpoint images."
          : "Write motion and camera direction that follows the exact endpoint roles and uses reference-only images as guidance, not as frozen start/end frames.",
      ].join(" "),
      currentPrompt: compactStoryboardPlannerContextText(slot.currentPrompt),
      conceptDetails: slotConceptDetails && slotConceptDetails !== globalConceptDetails ? slotConceptDetails : "",
      storyboardGuide: slotStoryboardGuide && slotStoryboardGuide !== globalStoryboardGuide ? slotStoryboardGuide : "",
      durationSeconds: slot.durationSeconds ?? null,
      speechBudgetSeconds: storyboardDialogueTargetSeconds(slot.durationSeconds ?? 8),
      aspectRatio: slot.aspectRatio ?? null,
      model: slot.model ?? null,
      voiceoverContinuity: {
        voiceoverFullScript: compactStoryboardPlannerContextText(slot.voiceoverFullScript, 6000),
        previousVoiceoverScript: compactStoryboardPlannerContextText(slot.previousVoiceoverScript, 1200),
        nextVoiceoverScript: compactStoryboardPlannerContextText(slot.nextVoiceoverScript, 1200),
        previousJourneyStage: slot.previousJourneyStage ?? "",
        nextJourneyStage: slot.nextJourneyStage ?? "",
        previousPrompt: compactStoryboardPlannerContextText(slot.previousPrompt),
        nextPrompt: compactStoryboardPlannerContextText(slot.nextPrompt),
      },
    };
  });
  const hasSingleSlotRewriteContext = imageMap.some((slot) => {
    const continuity = slot.voiceoverContinuity as Record<string, unknown>;
    return Boolean(
      String(continuity.voiceoverFullScript ?? "").trim()
      || String(continuity.previousVoiceoverScript ?? "").trim()
      || String(continuity.nextVoiceoverScript ?? "").trim()
    );
  });

  return [
    "Create a complete ecommerce storyboard video prompt plan.",
    "Use the ordered attached image aliases below. Each slot declares whether each attached image is an exact start frame, exact stop/end frame, or reference-only image.",
    "You MUST analyze every slot's two images with vision before writing that slot's video_prompt.",
    "Every slot.video_prompt must be unique to its own visible image pair, using the images as visual truth while focusing on motion, action, camera, and continuity instead of restating static product/prop/background details.",
    "Start each slot.video_prompt with the unique visible action/camera direction for that shot, not with a repeated alias boilerplate sentence.",
    "Do not reuse the same generic transition prompt across slots. Do not merely paraphrase currentPrompt.",
    "Every slot.video_prompt must follow this model-agnostic section format exactly: Create a cinematic video. Then sections Scene:, Characters:, Action:, Camera:, Lighting / Style:, Audio:, Dialogue:.",
    "Hard limit: every slot.video_prompt must be 2,000 characters or less, target 1,200-1,500. Do not paste Production concept, Storyboard guide, Product metadata, Options, PRODUCT FACTS LOCK, USER-SELECTED CREATIVE DIRECTION LOCK, Prop details, price, rating, or sales metadata into slot.video_prompt.",
    "For start/stop frame video, the frame images already define product, people, props, room, lighting, and composition. State that frames are the visual truth, then describe only how the shot should move and what continuity to preserve.",
    "Use product facts only as implicit context for the spoken line or movement choice; never repeat the same product/concept facts across Scene, Action, Camera, and Storyboard guide wording inside the prompt.",
    "Product fidelity hard lock: preserve the exact referenced product geometry, countable parts, proportions, material, color, and construction in every product-visible slot. Never add drawers, doors, extra panels, altered shelves, alternate materials, or a different product type.",
    "Cinematic realism hard lock: use realistic lens language, dimensional lighting, natural shadows, believable camera movement, coherent color grade, and non-plastic human skin. Reject flat catalog, real-estate listing, waxy CG, or generic bright-room looks.",
    "Human identity hard lock: when a person appears, preserve the same face, hair, skin texture, age, wardrobe, and body continuity. If the endpoint frames show only a back/side/cropped person, keep the motion non-revealing unless the same clear face is already visible; do not rotate to reveal an invented face.",
    "Write the production direction in English, but keep any requested spoken line in the target spoken language inside quotes.",
    "Voiceover quality bar: use the same customer-facing spoken-copy style as the elevenlabs-product-voiceover-dialogue skill: short stop-scroll hook, conversational ad-read phrasing, one idea per sentence, grounded benefit, no stiff presenter wording.",
    "For native video prompts, slot.voiceover_script must be pure spoken text only. Do not include Speaker 1/Speaker 2 prefixes, ElevenLabs bracket tags, planning labels, timecodes, markdown, or visual direction.",
    "For Thai voiceover, write natural central-Thai shopping-video speech. Avoid phrases like ปัญหาหน้างาน, ทางออกที่ใช้งานได้จริง, รายละเอียดสินค้า, จุดขายหลักคือ, and any PRODUCT FACTS LOCK wording.",
    "In Audio:, separate ambient sound, sound design, dialogue language, lip-sync, subtitle, and no-extra-dialogue instructions from the visual description.",
    includeSpeech
      ? "In Dialogue:, put the exact spoken line in quotes. For Thai use this exact shape inside the section: " + nativeSpeechDirectiveExample + "."
      : "In Dialogue:, write exactly: No spoken dialogue.",
    input.conceptDetails ? ["", "Selected Production Director concept / customer journey (primary source for voiceover variety):", input.conceptDetails].join("\n") : "",
    input.storyboardGuide ? ["", "Storyboard guide:", input.storyboardGuide].join("\n") : "",
    useVoiceoverScriptAsConcept
      ? [
        "",
        "Authoritative edited voiceover script:",
        suppliedVoiceoverFullScript,
        "",
        "The user chose to use this edited script instead of the concept/details as the primary content source. Segment or lightly adapt it across ordered slots according to each slot duration, while preserving its meaning and order.",
      ].join("\n")
      : suppliedVoiceoverFullScript
        ? [
          "",
          "Storyboard voiceover / dialogue contract:",
          suppliedVoiceoverFullScript,
          "",
          "Use this together with the Storyboard guide as the primary ordered narrative contract. Match each slot to the corresponding spoken beat; do not invent a different spoken story or visual story. You may tighten wording for duration, but preserve meaning, order, and product claims.",
        ].join("\n")
        : "",
    "",
    "Product metadata:",
    JSON.stringify(input.productMetadata ?? {}, null, 2),
    "",
    "Options:",
    JSON.stringify({
      ...input.options,
      totalStoryboardDurationSeconds: totalDurationSeconds,
    }, null, 2),
    "",
    includeSpeech
      ? [
        "Speech / voiceover instruction:",
        `- Include a concise spoken line for each slot in ${speechLanguage || speechMode}.`,
        "- Treat all slot.voiceover_script values as one continuous script split across ordered slots, not standalone taglines.",
        "- Use the selected Production Director concept/customer journey as the main source of the speech angle, so different selected concepts produce meaningfully different spoken content.",
        suppliedVoiceoverFullScript
          ? "- Because a voiceover/dialogue contract was supplied, preserve its ordered meaning across slots and make the video_prompt, motion, and sound match those spoken beats."
          : "",
        "- Plan the full story arc first: hook/problem in early slots, product detail/use/proof in middle slots, result/CTA in the final slot.",
        "- Each line must naturally follow the previous slot and set up the next slot. Avoid repeating the same opening phrase, benefit, or sales claim in multiple slots.",
        `- The complete voiceover_full_script must fit the total storyboard duration of about ${totalDurationSeconds} seconds. Treat each slot.durationSeconds as that slot's speech budget; if a slot duration is missing, use 8 seconds.`,
        "- Each slot includes speechBudgetSeconds. Write enough spoken content to fill that speech budget, not only the visible clip duration.",
        "- Write enough natural spoken content for the selected clip duration; avoid overly short lines that leave silence at the end.",
        "- The line must match the concept/details guideline, visible product use, journey stage, and video_prompt.",
        "- Write like customer-facing ElevenLabs ad dialogue: short, specific, speakable, and emotionally clear. Convert planning notes into real spoken copy.",
        useVoiceoverScriptAsConcept
          ? "- Because useVoiceoverScriptAsConcept is true, base the spoken lines and story arc on the authoritative edited voiceover script, not on the concept/details text."
          : "",
        "- Write the line as natural spoken speech only, not visual direction. Do not include price, rating, sales volume, promo, unsupported claims, Speaker labels, bracket audio tags, planning labels, or timecodes.",
        "- Return voiceover_full_script as the exact ordered combination of all slot.voiceover_script lines.",
        "- Put the spoken line in slot.voiceover_script. Because includeVoiceover is true, slot.voiceover_script is REQUIRED and must not be empty for any slot.",
        `- Also include the same spoken line inside slot.video_prompt as a native-audio instruction using this exact shape: ${nativeSpeechDirectiveExample}.`,
        hasSingleSlotRewriteContext
          ? [
            "",
            "Single-slot rewrite continuity:",
            "- Some slots include voiceoverContinuity because the user is regenerating only that slot.",
            "- Rewrite only the current slot.voiceover_script, while preserving the meaning and story flow of neighboring lines.",
            "- previousVoiceoverScript is the line immediately before this slot; the new line must sound like a natural continuation.",
            "- nextVoiceoverScript is the line immediately after this slot; the new line must set it up without contradiction.",
            "- voiceoverFullScript is the existing whole narration. Keep the rewritten slot compatible with that full script; do not rewrite or quote the neighboring lines as the current slot line.",
          ].join("\n")
          : "",
      ].join("\n")
      : "Speech / voiceover instruction: Do not include spoken dialogue or voiceover. Return empty voiceover_script for every slot.",
    "",
    "Storyboard slots:",
    JSON.stringify(imageMap, null, 2),
    "",
    "Important output alias rule:",
    "- The aliases above are only for your planning call, because all slot images are sent together.",
    "- In each returned slot.video_prompt, write local slot aliases only: @Image1 is that slot's first attached image and @Image2 is that slot's second attached image.",
    "- Explicitly describe whether local @Image1/@Image2 are exact start frame, exact stop/end frame, or reference-only based on each slot's frameRoles.",
    "- Never output @Image3, @Image4, @Image5, or any higher image alias in slot.video_prompt, voiceover_script, or sound_brief.",
    "- Even though returned prompts use local aliases, the content must come from the actual global aliases assigned to that input slot.",
    "",
    "Per-slot vision requirements:",
    "- Identify what is visibly present in each attached image and respect whether it is a start frame, stop/end frame, or reference-only image.",
    "- Describe the most plausible subject/object motion, hand/product action, staging change, or camera move for that exact role pair.",
    "- Preserve visible product geometry, materials, colors, room/context, people, hands, props, and composition anchors from the frames.",
    "- Preserve human identity and natural face/skin quality; avoid back-to-front face reveals unless the same face is clearly referenced in the endpoint frames.",
    "- Use camera angle, movement, lens feel, lighting, color, and depth that match the Storyboard guide and spoken beat for that slot.",
    "- If the two frames are very similar, use subtle motion such as micro push-in, parallax, lighting, hand adjustment, or product reveal rather than inventing new action.",
    "",
    `Return exactly ${imageMap.length} slot object(s), one for every input slot id.`,
    "Return valid JSON only following the output schema described in the skill instructions.",
  ].join("\n");
}

function normalizeStoryboardSlotLocalImageAliases(content: string, slotPosition: number): string {
  if (!content) return content;
  const startAlias = slotPosition * 2 + 1;
  const endAlias = slotPosition * 2 + 2;
  return content.replace(/@Image(\d+)/gi, (match, imageNumberText: string) => {
    const imageNumber = Number(imageNumberText);
    if (imageNumber === startAlias) return "@Image1";
    if (imageNumber === endAlias) return "@Image2";
    if (imageNumber === 1 || imageNumber === 2) return match;
    return match;
  });
}

function normalizeStoryboardPromptForDuplicateCheck(content: string): string {
  return String(content || "")
    .toLowerCase()
    .replace(/\bshot\s+\d+\s*:\s*/gi, "")
    .replace(/\bclip\s+\d+\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStoryboardVoiceoverForDuplicateCheck(content: string): string {
  return String(content || "")
    .replace(/^\s*Speaker\s+\d+\s*:\s*/gim, "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildStoryboardVoiceoverCounts(slots: StoryboardPlannerSlotResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    const normalized = normalizeStoryboardVoiceoverForDuplicateCheck(slot.voiceoverScript);
    if (normalized) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return counts;
}

function isStoryboardVoiceoverTooShort(
  content: string,
  durationSeconds: unknown,
  speechMode: string,
  speechLanguage?: string | null,
): boolean {
  const normalized = normalizeStoryboardVoiceoverForDuplicateCheck(content);
  if (!normalized) return true;

  const targetSeconds = storyboardDialogueTargetSeconds(durationSeconds);
  const language = storyboardSpeechLanguageLabel(speechMode, speechLanguage).toLowerCase();
  if (speechMode === "th" || language === "thai") {
    const spokenUnits = normalized.replace(/[^\u0E00-\u0E7FA-Za-z0-9]/g, "").length;
    return spokenUnits < Math.round(targetSeconds * 9.5);
  }

  if (speechMode === "en" || language === "english") {
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return wordCount < Math.round(targetSeconds * 2.1);
  }

  return normalized.length < Math.round(targetSeconds * 8);
}

function isGenericStoryboardTransitionPrompt(content: string): boolean {
  const normalized = normalizeStoryboardPromptForDuplicateCheck(content);
  return normalized.includes("create a smooth cinematic transition between the two frames while preserving the same subject");
}

async function repairStoryboardSlotVideoPrompt(input: {
  userId: number;
  tenantId?: string;
  visionModel: string;
  slotIndex: number;
  currentPrompt: string;
  startFrameUrl: string;
  endFrameUrl: string;
  frameRoles?: string[];
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  voiceoverFullScript?: string | null;
  speechMode?: string | null;
  speechLanguage?: string | null;
  aspectRatio?: string | null;
  durationSeconds?: number | null;
  model?: string | null;
  productMetadata: Record<string, unknown> | null;
  publicUrl?: string | null;
}): Promise<{ prompt: string; promptTokens: number; completionTokens: number }> {
  const frameRoles = Array.isArray(input.frameRoles) && input.frameRoles.length >= 2 ? input.frameRoles : ["start", "stop"];
  const includeSpeech = input.speechMode && input.speechMode !== "none";
  const systemPrompt = [
    "You are a senior AI video director for ecommerce video generation from storyboard images.",
    `Analyze the two attached images with vision. Image 1 role: ${frameRoles[0]}. Image 2 role: ${frameRoles[1]}.`,
    "Return one production-ready video prompt only. No markdown, no code fence, no title, no JSON, no explanation.",
    "The images are the visual truth for product, people, hands, room, props, geometry, colors, materials, and declared image roles.",
    "Focus the prompt on how the shot moves: visible action, transition, camera, continuity, audio, and dialogue. Do not re-describe static details at length.",
    "Choose motion and camera direction that follows exact start/stop frames when declared; use reference-only images as guidance without treating them as frozen endpoints.",
    "Do not reuse generic transition language. Do not invent unrelated objects, extra people, captions, UI, price badges, logos, labels, or new readable text.",
    "Keep the prompt under 1,500 characters and never exceed 2,000 characters. Do not paste product metadata, concept details, storyboard guide, USER-SELECTED CREATIVE DIRECTION LOCK, PRODUCT FACTS LOCK, Prop details, price, rating, or sales metadata.",
    "Use the model-agnostic section format: Create a cinematic video. Scene:, Characters:, Action:, Camera:, Lighting / Style:, Audio:, Dialogue:.",
    includeSpeech
      ? "The Dialogue section is required. Write one unique, natural customer-facing spoken line based on the actual two images, product details, and selected concept. Do not copy the current prompt dialogue."
      : "The Dialogue section must be: No spoken dialogue.",
  ].join("\n");
  const userPrompt = [
    `Shot ${input.slotIndex + 1}`,
    `Current prompt to replace: ${input.currentPrompt}`,
    input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}` : "",
    input.durationSeconds ? `Target duration: ${input.durationSeconds} seconds` : "",
    input.model ? `Target model: ${input.model}` : "",
    input.productMetadata ? [
      "",
      "Product metadata is context only. The attached images are the visual truth:",
      JSON.stringify(input.productMetadata, null, 2),
    ].join("\n") : "",
    input.conceptDetails ? ["", "Production concept and details guideline:", input.conceptDetails].join("\n") : "",
    input.storyboardGuide ? ["", "Storyboard guide:", input.storyboardGuide].join("\n") : "",
    input.voiceoverFullScript ? [
      "",
      "Storyboard voiceover / dialogue contract:",
      input.voiceoverFullScript,
      "The repaired prompt must keep this shot aligned with the corresponding ordered spoken beat. Do not create a different story.",
    ].join("\n") : "",
    includeSpeech ? [
      "",
      `Speech requirement: write a fresh spoken line in ${input.speechLanguage || input.speechMode}. It must match this exact image pair and product moment, sound like natural shopping-video speech, and be different from any repeated/generic line in the current prompt.`,
      `Speech budget: write about ${storyboardDialogueTargetSeconds(input.durationSeconds ?? 8)} seconds of spoken content, even if the video clip is ${input.durationSeconds ?? 8} seconds. Avoid a short line that leaves silence at the end.`,
      "Do not include Speaker labels, bracket audio tags, planning labels, timecodes, or visual direction inside the spoken line.",
    ].join("\n") : "",
    "",
    "Write the improved prompt in English. It must explicitly use local aliases only:",
    `- @Image1 role: ${frameRoles[0]}`,
    `- @Image2 role: ${frameRoles[1]}`,
    "Start with the unique visible action/camera direction for this shot, not with a repeated alias boilerplate sentence.",
    "Describe the best product/user motion or camera move for this exact pair. Static visible details should be referenced only as frame-preservation rules.",
  ].filter(Boolean).join("\n");

  const result = await callLLMWithVision(
    systemPrompt,
    userPrompt,
    input.userId,
    [input.startFrameUrl, input.endFrameUrl],
    input.visionModel,
    900,
    { tenantId: input.tenantId, publicUrl: input.publicUrl ?? null },
  );
  const rawPrompt = result.content
    .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const prompt = buildCompactStoryboardReviewVideoPrompt({
    visualPrompt: rawPrompt,
    durationSeconds: input.durationSeconds ?? null,
    aspectRatio: input.aspectRatio ?? null,
    frameRoles,
    includeVoiceover: Boolean(includeSpeech),
    speechMode: input.speechMode ?? "none",
    speechLanguage: input.speechLanguage ?? null,
    voiceoverScript: extractStoryboardNativeSpeechText(rawPrompt),
    includeSound: false,
  });
  return {
    prompt,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
  };
}

type StoryboardPlannerSlotResult = {
  id: string;
  index: number;
  journeyStage: string;
  videoPrompt: string;
  voiceoverScript: string;
  soundBrief: string;
  qualityNotes: string[];
};

function enforceStoryboardPlannerNativeAudio(input: {
  slot: StoryboardPlannerSlotResult;
  sourceSlot?: {
    currentPrompt?: string;
    conceptDetails?: string | null;
    storyboardGuide?: string | null;
    durationSeconds?: number | null;
    aspectRatio?: string | null;
    frameRoles?: string[] | null;
    previousVoiceoverScript?: string | null;
    nextVoiceoverScript?: string | null;
  };
  includeSound: boolean;
  speechMode: string;
  speechLanguage?: string | null;
}): StoryboardPlannerSlotResult {
  const existingInlineSpeech = extractStoryboardNativeSpeechText(input.slot.videoPrompt);
  const shouldIncludeVoiceover = input.speechMode !== "none";
  const voiceoverScript = shouldIncludeVoiceover
    ? input.slot.voiceoverScript.trim()
      || existingInlineSpeech
    : "";
  const videoPrompt = buildCompactStoryboardReviewVideoPrompt({
    visualPrompt: input.slot.videoPrompt || input.sourceSlot?.currentPrompt || "",
    durationSeconds: input.sourceSlot?.durationSeconds ?? null,
    aspectRatio: input.sourceSlot?.aspectRatio ?? null,
    frameRoles: input.sourceSlot?.frameRoles ?? null,
    includeVoiceover: shouldIncludeVoiceover,
    speechMode: input.speechMode,
    speechLanguage: input.speechLanguage,
    voiceoverScript,
    includeSound: input.includeSound,
    soundBrief: input.slot.soundBrief,
  });

  return {
    ...input.slot,
    videoPrompt,
    voiceoverScript,
    qualityNotes: !shouldIncludeVoiceover || voiceoverScript === input.slot.voiceoverScript.trim()
      ? input.slot.qualityNotes
      : [
        ...input.slot.qualityNotes,
        "Native speech prompt was normalized so the generated video prompt keeps the requested voiceover line.",
      ],
  };
}

/**
 * Map category string to enum value
 */
function mapCategoryToEnum(category?: string): string {
  const categoryMap: Record<string, string> = {
    "prompt_enhancement": "prompt_enhancement",
    "prompt-enhancement": "prompt_enhancement",
    "image_generation": "image_generation",
    "image-generation": "image_generation",
    "image_prompt_generation": "image_prompt_generation",
    "image-prompt-generation": "image_prompt_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "video_prompt_generation": "video_prompt_generation",
    "video-prompt-generation": "video_prompt_generation",
    "audio_prompt_generation": "audio_prompt_generation",
    "audio-prompt-generation": "audio_prompt_generation",
    "image_video_generation": "image_video_generation",
    "image-video-generation": "image_video_generation",
    "audio_generation": "audio_generation",
    "audio-generation": "audio_generation",
    "article_generation": "article_generation",
    "article-generation": "article_generation",
    "slide_generation": "slide_generation",
    "slide-generation": "slide_generation",
    "product_review": "product_review",
    "product-review": "product_review",
    "sound_effects": "sound_effects",
    "sound-effects": "sound_effects",
    "code_assistant": "code_assistant",
    "code-assistant": "code_assistant",
    "document_analysis": "document_analysis",
    "document-analysis": "document_analysis",
    "web_search": "web_search",
    "web-search": "web_search",
    "data_analysis": "data_analysis",
    "data-analysis": "data_analysis",
    "translation": "translation",
    "summarization": "summarization",
    "chat_assistant": "chat_assistant",
    "chat-assistant": "chat_assistant",
    "automation": "automation",
    "other": "other",
  };
  const cat = category?.toLowerCase() || "";
  if (categoryMap[cat]) return categoryMap[cat];
  // Fuzzy mapping for external skills with free-text categories
  if ((cat.includes("image") || cat.includes("photo") || cat.includes("visual")) && cat.includes("prompt")) return "image_prompt_generation";
  if ((cat.includes("video") || cat.includes("film") || cat.includes("movie")) && cat.includes("prompt")) return "video_prompt_generation";
  if ((cat.includes("audio") || cat.includes("music") || cat.includes("sound")) && cat.includes("prompt")) return "audio_prompt_generation";
  if (cat.includes("code") || cat.includes("dev") || cat.includes("engineer") || cat.includes("programming")) return "code_assistant";
  if (cat.includes("review") || cat.includes("reviewer") || (cat.includes("product") && !cat.includes("prompt"))) return "product_review";
  if (cat.includes("slide") || cat.includes("deck") || cat.includes("presentation") || cat.includes("storyboard")) return "slide_generation";
  if (cat.includes("write") || cat.includes("content") || cat.includes("blog") || cat.includes("copy")) return "article_generation";
  if (cat.includes("data") || cat.includes("analy")) return "data_analysis";
  if (cat.includes("image") || cat.includes("photo") || cat.includes("visual")) return "image_generation";
  if (cat.includes("video") || cat.includes("film") || cat.includes("movie")) return "video_generation";
  if (cat.includes("audio") || cat.includes("music") || cat.includes("sound")) return "audio_generation";
  if (cat.includes("translat")) return "translation";
  if (cat.includes("summar")) return "summarization";
  if (cat.includes("search")) return "web_search";
  if (cat.includes("doc") || cat.includes("document")) return "document_analysis";
  if (cat.includes("automat") || cat.includes("workflow")) return "automation";
  return "other";
}

/**
 * Determine CMS output format from skill category.
 */
function determineCmsFormat(category: string): "cms_article" | "cms_review" | "markdown" {
  if (category === "product_review") return "cms_review";
  if (category === "article_generation") return "cms_article";
  return "markdown";
}

function buildMediaStudioImprovementDedupeKey(input: {
  trigger: "prompt_qa" | "image_qa" | "video_qa" | "manual";
  issues: Array<{ id: string }>;
  proposedChanges: Array<{ title: string; targetFile: string; targetSection?: string }>;
}): string {
  const issueIds = input.issues.map((issue) => issue.id).sort();
  const changeKeys = input.proposedChanges
    .map((change) => `${change.title}|${change.targetFile}|${change.targetSection ?? ""}`.toLowerCase())
    .sort();
  return JSON.stringify({
    trigger: input.trigger,
    issueIds,
    changeKeys,
  });
}

async function findExistingMediaStudioImprovementRecommendation(
  dbInstance: Awaited<ReturnType<typeof getDb>>,
  skillId: number,
  input: {
    trigger: "prompt_qa" | "image_qa" | "video_qa" | "manual";
    issues: Array<{ id: string }>;
    proposedChanges: Array<{ title: string; targetFile: string; targetSection?: string }>;
  },
) {
  if (!dbInstance) return null;
  const dedupeKey = buildMediaStudioImprovementDedupeKey(input);
  const existingRows = await dbInstance
    .select()
    .from(skillImprovementRecommendations)
    .where(and(
      eq(skillImprovementRecommendations.skillId, skillId),
      eq(skillImprovementRecommendations.recommendationType, "media-studio-auto-learning"),
      inArray(skillImprovementRecommendations.status, ["pending_review", "approved", "applied"]),
    ))
    .orderBy(desc(skillImprovementRecommendations.updatedAt))
    .limit(30);
  const latestRuns = existingRows.length > 0
    ? await dbInstance
      .select({
        recommendationId: skillImprovementRuns.recommendationId,
        runType: skillImprovementRuns.runType,
        status: skillImprovementRuns.status,
        summary: skillImprovementRuns.summary,
        logsJson: skillImprovementRuns.logsJson,
        createdAt: skillImprovementRuns.createdAt,
      })
      .from(skillImprovementRuns)
      .where(inArray(skillImprovementRuns.recommendationId, existingRows.map((row) => row.id)))
      .orderBy(desc(skillImprovementRuns.createdAt))
    : [];
  const latestApplyRunByRecommendationId = new Map<number, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (run.recommendationId == null || run.runType !== "apply") {
      continue;
    }
    if (!latestApplyRunByRecommendationId.has(run.recommendationId)) {
      latestApplyRunByRecommendationId.set(run.recommendationId, run);
    }
  }

  return existingRows.find((row) => {
    const latestApplyRun = latestApplyRunByRecommendationId.get(row.id);
    const applyStrategy = latestApplyRun?.logsJson && typeof latestApplyRun.logsJson === "object"
      ? (latestApplyRun.logsJson as Record<string, unknown>).applyStrategy
      : null;
    const proposalOnlyCompleted = latestApplyRun?.status === "completed"
      && (applyStrategy === "proposal" || String(latestApplyRun.summary || "").toLowerCase().includes("proposal generated"));
    if (row.status === "approved" && proposalOnlyCompleted) {
      return false;
    }
    const recommendationJson = row.recommendationJson as Record<string, any> | null;
    if (!recommendationJson || recommendationJson.source !== "media_studio_auto_learning") {
      return false;
    }
    return buildMediaStudioImprovementDedupeKey({
      trigger: recommendationJson.trigger,
      issues: Array.isArray(recommendationJson.issues) ? recommendationJson.issues : [],
      proposedChanges: Array.isArray(recommendationJson.proposedChanges) ? recommendationJson.proposedChanges : [],
    }) === dedupeKey;
  }) ?? null;
}

type VisionModelOption = {
  id: string;
  name: string;
  provider: string;
  providerDisplayName: string;
  providerId: number;
  isDefault?: boolean;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  contextLength?: number | null;
};

async function getVisionModelOptions(): Promise<VisionModelOption[]> {
  const rows = await db
    .select({
      modelId: modelProviderMap.modelId,
      modelName: modelProviderMap.modelName,
      providerModelId: modelProviderMap.providerModelId,
      providerId: llmProviders.id,
      providerName: llmProviders.providerName,
      displayName: llmProviders.displayName,
      defaultModel: llmProviders.defaultModel,
      configJson: llmProviders.configJson,
      contextLength: modelProviderMap.contextLength,
      supportsVision: modelProviderMap.supportsVision,
      supportsThinking: modelProviderMap.supportsThinking,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
    .orderBy(asc(llmProviders.sortOrder), asc(modelProviderMap.priority), asc(modelProviderMap.id));

  const allModels = new Map<string, VisionModelOption>();
  const visionPatterns = [
    "gpt-4o", "gpt-4-vision", "gpt-4-turbo", "gpt-5",
    "claude-3", "claude-haiku", "claude-sonnet", "claude-opus",
    "gemini", "llava", "qwen-vl",
  ];

  for (const row of rows) {
    const config = row.configJson as { supportsVision?: boolean; supportsThinking?: boolean; contextLength?: number } | null;
    const modelId = row.modelId;
    const fullModelId = modelId.includes("/") ? modelId : `${row.providerName}/${modelId}`;
    const supportsVision = (row.supportsVision ?? config?.supportsVision) ||
      [modelId, row.providerModelId, row.modelName].some((value) =>
        visionPatterns.some((pattern) => value.toLowerCase().includes(pattern.toLowerCase())),
      );

    if (allModels.has(fullModelId)) {
      continue;
    }

    allModels.set(fullModelId, {
      id: fullModelId,
      name: row.modelName,
      provider: row.providerName,
      providerDisplayName: row.displayName,
      providerId: row.providerId,
      isDefault: modelId === row.defaultModel || fullModelId === row.defaultModel || row.providerModelId === row.defaultModel,
      supportsVision,
      supportsThinking: row.supportsThinking ?? config?.supportsThinking ?? false,
      contextLength: row.contextLength ?? config?.contextLength ?? null,
    });
  }

  return Array.from(allModels.values());
}

function resolveVisionModelId(
  models: VisionModelOption[],
  preferredModelId?: string | null,
): string | null {
  const supportedModels = models.filter((model) => model.supportsVision);
  if (supportedModels.length === 0) {
    return null;
  }

  const preferredCandidates = new Set(buildModelLookupCandidates(preferredModelId ?? ""));
  if (preferredModelId?.trim()) {
    preferredCandidates.add(preferredModelId.trim());
  }

  if (preferredCandidates.size > 0) {
    const preferredMatch = supportedModels.find((model) => {
      const modelCandidates = new Set(buildModelLookupCandidates(model.id));
      modelCandidates.add(model.id);
      for (const candidate of preferredCandidates) {
        if (modelCandidates.has(candidate)) {
          return true;
        }
      }
      return false;
    });
    if (preferredMatch) {
      return preferredMatch.id;
    }
  }

  return supportedModels.find((model) => model.isDefault)?.id || supportedModels[0]?.id || null;
}

function decryptApiKey(text: string): string {
  return decrypt(text);
}

// Note: getActiveLlmProvider removed — now uses getProviderForModel from llmRouter

const PROMPT_IMAGE_PREFIXES = ["/uploads/", "/api/storage/files/"] as const;
const LLM_VISION_MAX_IMAGE_EDGE_PX = 2048;
const LLM_VISION_JPEG_QUALITY = 92;

const IMAGE_MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function buildAbsoluteReferenceUrl(url: string, publicUrl?: string | null): string | null {
  if (!url.startsWith("/")) {
    return null;
  }

  const baseUrl = (publicUrl || getCachedPublicAppUrl() || "").replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}${url}`;
}

function parseImageDataUrl(url: string): { mimeType: string; buffer: Buffer } | null {
  const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
  };
}

async function prepareImageDataUrlForLLM(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  try {
    const optimizedBuffer = await sharp(imageBuffer, { animated: false })
      .rotate()
      .resize({
        width: LLM_VISION_MAX_IMAGE_EDGE_PX,
        height: LLM_VISION_MAX_IMAGE_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: LLM_VISION_JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

    return `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`;
  } catch (error) {
    console.warn("[Skills] Failed to optimize image for LLM; using original payload", error);
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  }
}

async function fileToImageDataUrlForLLM(filePath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES_BY_EXTENSION[ext] || "image/png";
  return prepareImageDataUrlForLLM(fileBuffer, mimeType);
}

/**
 * Convert image URL to a format the LLM can use
 * - Local image payloads are optimized before being converted to base64 data URLs
 * - Relative URLs (/uploads/... or /api/storage/files/...) are converted to optimized base64 data URLs when possible
 * - Full URLs are passed through as-is
 */
export async function convertImageUrlForLLM(url: string, publicUrl?: string | null): Promise<string> {
  // If it's already a data URL, normalize it too; direct skill inputs can be very large.
  if (url.startsWith("data:")) {
    const parsed = parseImageDataUrl(url);
    if (!parsed) {
      return url;
    }
    return prepareImageDataUrlForLLM(parsed.buffer, parsed.mimeType);
  }

  // Full HTTP URLs are passed through so providers can fetch them without inline base64 token cost.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // If it's a relative URL, read the file and convert to base64
  if (PROMPT_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    try {
      // Use the same uploads directory as storage.ts
      const uploadsDir = getUploadsDir() || path.resolve(process.cwd(), "uploads");
      const relativePath = url.startsWith("/api/storage/files/")
        ? url.replace("/api/storage/files/", "")
        : url.replace("/uploads/", "");
      const filePath = path.join(uploadsDir, relativePath);

      if (fs.existsSync(filePath)) {
        return fileToImageDataUrlForLLM(filePath);
      } else {
        console.warn(`[Skills] Image file not found: ${filePath}`);
        // Try alternate path (cwd-relative)
        const altPath = path.resolve(process.cwd(), "uploads", relativePath);
        if (fs.existsSync(altPath)) {
          return fileToImageDataUrlForLLM(altPath);
        }
        const absoluteUrl = buildAbsoluteReferenceUrl(url, publicUrl);
        if (absoluteUrl) {
          console.warn(`[Skills] Falling back to absolute image URL: ${absoluteUrl}`);
          return absoluteUrl;
        }
        throw new Error(`Unable to resolve reference image URL: ${url}`);
      }
    } catch (error) {
      console.error(`[Skills] Failed to convert image to base64:`, error);
      const absoluteUrl = buildAbsoluteReferenceUrl(url, publicUrl);
      if (absoluteUrl) {
        return absoluteUrl;
      }
      throw error;
    }
  }

  console.warn(`[Skills] Unknown URL format, returning as-is: ${url}`);
  return url;
}

/**
 * Call LLM with vision support
 * @param maxTokens - Maximum tokens for response. Default 2000. For multi-prompt, use ~500 per prompt.
 */
async function callLLMWithVision(
  systemPrompt: string,
  userPrompt: string,
  userId: number,
  imageUrls: string[] = [],
  model?: string,
  maxTokens: number = 2000,
  options?: { extraBodyParams?: Record<string, unknown>; systemPromptSuffix?: string; publicUrl?: string | null; tenantId?: string | null },
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number }; rawResponse?: any }> {
  const useModel = resolveVisionModelId(await getVisionModelOptions(), model);
  if (!useModel) {
    throw new Error("No enabled vision model configured");
  }

  // Build messages with vision support
  const userContent: MessageContent[] = [{ type: "text", text: userPrompt }];

  // Add images if provided (for vision analysis)
  // Convert relative URLs to base64 data URLs so LLM can access them
  const resolvedImageUrls = await resolveExternalMediaReferenceUrls(
    imageUrls,
    options?.tenantId
      ? { userId, tenantId: options.tenantId }
      : undefined,
    options?.publicUrl,
  ) ?? [];
  for (const imageUrl of resolvedImageUrls) {
    const convertedUrl = await convertImageUrlForLLM(imageUrl, options?.publicUrl);
    userContent.push({ type: "image_url", image_url: { url: convertedUrl, detail: "high" } });
  }

  const finalSystemPrompt = options?.systemPromptSuffix
    ? systemPrompt + options.systemPromptSuffix
    : systemPrompt;

  const messages: Message[] = [
    { role: "system", content: finalSystemPrompt },
    { role: "user", content: userContent }
  ];

  const runWithFallback = async (preferredProvider?: number) => {
    const result = await executeWithFallback({
      model: useModel,
      messages,
      stream: false,
      userId,
      ...(preferredProvider != null
        ? { preferredProvider, strictProviderPin: true }
        : {}),
      maxTokens,
      temperature: 0.7,
      extraBodyParams: options?.extraBodyParams,
    });

    if (result.type === "fallback_required") {
      // Auto Prompt is a user-initiated "make this work" flow, so keep going
      // with the suggested provider instead of surfacing a consent blocker.
      return executeWithFallback({
        model: useModel,
        messages,
        stream: false,
        userId,
        preferredProvider: result.to.providerId,
        strictProviderPin: true,
        maxTokens,
        temperature: 0.7,
        extraBodyParams: options?.extraBodyParams,
      });
    }

    return result;
  };

  const result = await runWithFallback();
  if (result.type !== "success") {
    throw new Error(
      result.type === "error"
        ? `LLM request failed: ${result.error}`
        : "LLM request did not reach a successful provider response",
    );
  }

  const data = result.response;

  // Extract content - reasoning models like GPT-5.2 may put response in `reasoning` field
  const message = data.choices?.[0]?.message;
  let content = message?.content || "";

  // Fallback: If content is empty, try to extract from reasoning field (for reasoning models)
  if (!content && message?.reasoning) {
    const reasoning = message.reasoning as string;
    // Try to extract content after "Output:" or similar markers
    const outputMatch = reasoning.match(/(?:Output|Result|Final prompt|Generated prompt):\s*(.+?)(?:\n\n|$)/is);
    if (outputMatch) {
      content = outputMatch[1].trim();
    } else {
      // If no clear marker, use the last substantial paragraph as fallback
      const paragraphs = reasoning.split(/\n\n+/).filter(p => p.trim().length > 20);
      if (paragraphs.length > 0) {
        content = paragraphs[paragraphs.length - 1].trim();
      }
    }
  }

  const usage = data.usage || {};

  return {
    content,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
    },
    rawResponse: data,
  };
}

// ==================== Zod Schemas ====================

const skillTypeSchema = z.enum([
  "image-generation",
  "video-generation",
  "audio-generation",
  "code-assistant",
  "document-analysis",
  "web-search",
  "prompt-enhancement",
]);

const promptEnhancementRequestSchema = z.object({
  skillId: z.string().optional(),
  userInput: z.string().max(5000), // Allow empty when images are provided
  // Accept any string for images - they may be relative URLs (/uploads/...) or full URLs
  referenceImages: z.array(z.string().min(1)).max(5).optional(),
  referenceImageRoles: z.array(z.object({
    role: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  styleCategory: z.string().optional(),
  styleName: z.string().optional(),
  styleCustom: z.string().optional(),
  vfxCategory: z.string().optional(),
  vfxEffect: z.string().optional(),
  vfxEffects: z.array(z.string()).optional(),
  vfxCustom: z.array(z.string()).optional(),
  realisticSkin: z.boolean().optional(),
  faceLock: z.boolean().optional(),
  identityLock: z.enum(["none", "soft_lock_person", "strict_lock_product"]).optional(),
  aspectRatio: z.string().optional(),
  aspectRatioCustom: z.string().optional(),
  // NOTE: This is a skill-content language coverage filter, distinct from SUPPORTED_LANGUAGES (UI display locales).
  // "en" = English-only skills, "th" = Thai-capable skills, "both" = supports both languages.
  // Update this enum if new content-language variants are added to the skills system.
  language: z.enum(["en", "th", "both"] as const).optional(),
  // LLM model selection for Advanced Mode - allows user to choose vision-capable model
  model: z.string().optional(), // e.g., "openai/gpt-4o", "anthropic/claude-3.5-sonnet"
  originSurface: z.enum(["media_studio"]).optional(),

  // === Full Schema Support (v2.1) ===
  generationMode: z.enum(["text_to_image", "image_to_image", "inpaint", "outpaint", "variation"]).optional(),
  backgroundType: z.enum(["normal", "green_screen", "blue_screen", "transparent"]).optional(),
  task: z.enum(["final_prompt", "background_10", "ideas_10", "angles_10", "storyboard_continue", "storyboard_6", "infographic_layout", "style_catalog", "vfx_catalog", "typography_catalog"]).optional(),
  // prompt_count can be "1", "2_distinct", "4_2x2", etc. - extract the leading number
  prompt_count: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const num = parseInt(val, 10);
        return isNaN(num) ? undefined : num;
      }
      return val;
    },
    z.number().int().min(1).max(16).optional()
  ),
  detailLevel: z.enum(["compact", "standard", "full"]).optional(),
  textOnImage: z.boolean().optional(),
  headline: z.string().optional(),
  bodyText: z.string().optional(),
  typography: z.object({
    fontPersonality: z.array(z.string()).optional(),
    compositionStyle: z.array(z.string()).optional(),
    moodTone: z.array(z.string()).optional(),
    colorDirection: z.array(z.string()).optional(),
    textEffects: z.array(z.string()).optional(),
    useCaseTemplates: z.array(z.string()).optional(),
    modernTrendPacks: z.array(z.string()).optional(),
    layoutAddOns: z.array(z.string()).optional(),
    typographyCustom: z.string().optional(),
  }).optional(),
  editMask: z.object({
    type: z.string().optional(),
    segmentPrompt: z.string().optional(),
    preserveAreas: z.array(z.string()).optional(),
    feather: z.number().optional(),
    invert: z.boolean().optional(),
  }).optional(),
  outpaintConfig: z.object({
    expandLeft: z.number().optional(),
    expandRight: z.number().optional(),
    expandTop: z.number().optional(),
    expandBottom: z.number().optional(),
    blendWidth: z.number().optional(),
    matchStyle: z.boolean().optional(),
  }).optional(),
  advancedParams: z.object({
    denoisingStrength: z.number().optional(),
    guidanceScale: z.number().optional(),
    steps: z.number().optional(),
    seed: z.number().optional(),
    sampler: z.string().optional(),
    clipSkip: z.number().optional(),
  }).optional(),
  controlnet: z.object({
    enabled: z.boolean().optional(),
    type: z.string().optional(),
    weight: z.number().optional(),
    guidanceStart: z.number().optional(),
    guidanceEnd: z.number().optional(),
  }).optional(),
  ipAdapter: z.object({
    enabled: z.boolean().optional(),
    mode: z.string().optional(),
    weight: z.number().optional(),
    startStep: z.number().optional(),
    endStep: z.number().optional(),
  }).optional(),
  targetPlatform: z.enum(["generic", "stable_diffusion", "midjourney", "dall_e_3", "gemini_imagen", "flux", "firefly"]).optional(),
  preferences: z.array(z.string()).optional(),
  // Max prompt length from selected media model - skill will respect this limit
  maxPromptLength: z.number().int().min(100).max(10000).optional(),
});

// ==================== Schema Conversion Helpers ====================

interface SkillInputSchema {
  version: string;
  skillId: string;
  title: string;
  description?: string;
  sections: SchemaSection[];
  outputMapping?: Record<string, string>;
}

interface SchemaSection {
  id: string;
  title: string;
  titleTh?: string;
  collapsed?: boolean;
  fields: SchemaField[];
}

interface SchemaField {
  id: string;
  type: "text" | "textarea" | "select" | "boolean" | "imageUpload" | "number" | "array" | "hidden";
  label: string;
  labelTh?: string;
  placeholder?: string;
  helpText?: string;
  helpTextTh?: string;
  required?: boolean;
  default?: any;
  rows?: number;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  maxImages?: number;
  multiple?: boolean;
  accept?: string;
  itemLabel?: string;
  itemFields?: SchemaField[];
  arrayItemType?: "string" | "object";
  options?: SelectOption[];
  optionGroups?: Record<string, SelectOption[]>;
  dependsOn?: {
    field: string;
    value?: string;
    notEmpty?: boolean;
  };
}

interface SelectOption {
  value: string;
  label: string;
  labelTh?: string;
}

function pickLocalizedUiText(value: unknown): { en?: string; th?: string } {
  if (typeof value === "string") {
    return { en: value };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      en: typeof record.en === "string" ? record.en : undefined,
      th: typeof record.th === "string" ? record.th : undefined,
    };
  }

  return {};
}

function resolveJsonSchemaRef(jsonSchema: any, schema: any): any {
  if (!schema?.$ref || typeof schema.$ref !== "string") {
    return schema;
  }

  const ref = schema.$ref;
  if (!ref.startsWith("#/$defs/")) {
    return schema;
  }

  const defName = ref.slice("#/$defs/".length);
  const resolved = jsonSchema.$defs?.[defName];
  return resolved ? { ...resolved, ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$ref")) } : schema;
}

function titleFromKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
}

function isObjectSchema(schema: any): boolean {
  return schema?.type === "object" && schema.properties && typeof schema.properties === "object";
}

const PRIMARY_INPUT_FIELD_HINTS = [
  "request",
  "userIdea",
  "prompt",
  "input",
  "text",
  "description",
  "concept",
];

function isFallbackBasicField(field: SchemaField): boolean {
  const fieldId = field.id.toLowerCase();

  return PRIMARY_INPUT_FIELD_HINTS.some((hint) => fieldId.includes(hint.toLowerCase()));
}

/**
 * Convert standard JSON Schema to our custom skill input schema format
 */
export function convertJsonSchemaToSkillSchema(jsonSchema: any, skillId: string, uiSchema?: any): SkillInputSchema {
  const title = jsonSchema.title || skillId;
  const description = jsonSchema.description || "";
  const properties = jsonSchema.properties || {};
  const requiredFields = jsonSchema.required || [];
  const orderedKeys = Array.isArray(uiSchema?.["ui:order"])
    ? [
        ...uiSchema["ui:order"].filter((key: unknown) => typeof key === "string" && properties[key as string]),
        ...Object.keys(properties).filter((key) => !uiSchema["ui:order"].includes(key)),
      ]
    : Object.keys(properties);

  const sections: SchemaSection[] = [];
  const outputMapping: Record<string, string> = {};
  const optionFields: SchemaField[] = [];

  const collectFields = (
    schemaNode: any,
    uiNode: any,
    pathPrefix: string,
    requiredKeys: string[],
  ): SchemaField[] => {
    const node = resolveJsonSchemaRef(jsonSchema, schemaNode);
    const nodeProperties = node?.properties || {};
    const nodeOrder = Array.isArray(uiNode?.["ui:order"])
      ? [
          ...uiNode["ui:order"].filter((key: unknown) => typeof key === "string" && nodeProperties[key as string]),
          ...Object.keys(nodeProperties).filter((key) => !uiNode["ui:order"].includes(key)),
        ]
      : Object.keys(nodeProperties);

    const collected: SchemaField[] = [];

    for (const childKey of nodeOrder) {
      const childSchema = resolveJsonSchemaRef(jsonSchema, nodeProperties[childKey]);
      const childUi = uiNode?.[childKey];
      const fieldId = pathPrefix ? `${pathPrefix}.${childKey}` : childKey;

      if (isObjectSchema(childSchema)) {
        collected.push(...collectFields(
          childSchema,
          childUi,
          fieldId,
          childSchema.required || [],
        ));
        continue;
      }

      const field = convertPropertyToField(fieldId, childSchema, requiredKeys.includes(childKey), childUi, childKey);
      if (field) {
        collected.push(field);
        outputMapping[field.id] = field.id;
      }
    }

    return collected;
  };

  for (const key of orderedKeys) {
    const prop = resolveJsonSchemaRef(jsonSchema, properties[key]);
    const uiField = uiSchema?.[key];

    if (isObjectSchema(prop)) {
      const sectionTitle = pickLocalizedUiText(uiField?.["ui:title"]);
      const sectionFields = collectFields(prop, uiField, key, prop.required || []);
      if (sectionFields.length > 0) {
        sections.push({
          id: key,
          title: sectionTitle.en || titleFromKey(key),
          titleTh: sectionTitle.th,
          collapsed: false,
          fields: sectionFields,
        });
      }
      continue;
    }

    const field = convertPropertyToField(key, prop, requiredFields.includes(key), uiField, key);
    if (field) {
      optionFields.push(field);
      outputMapping[field.id] = field.id;
    }
  }

  if (Array.isArray(uiSchema?.["ui:order"]) && (optionFields.length > 0 || sections.length > 0)) {
    return {
      version: "1.0",
      skillId,
      title,
      description,
      sections: [
        ...(optionFields.length > 0 ? [{
          id: "options",
          title: "Options",
          collapsed: false,
          fields: optionFields,
        }] : []),
        ...sections,
      ],
      outputMapping,
    };
  }

  // Group fields into logical sections
  const basicFields = optionFields.filter(isFallbackBasicField);
  const configFields = optionFields.filter(f => !basicFields.includes(f));

  const fallbackSections: SchemaSection[] = [];

  if (basicFields.length > 0) {
    fallbackSections.push({
      id: "basic",
      title: "Basic Input",
      collapsed: false,
      fields: basicFields,
    });
  }

  if (configFields.length > 0) {
    fallbackSections.push({
      id: "options",
      title: "Options",
      collapsed: true,
      fields: configFields,
    });
  }

  return {
    version: "1.0",
    skillId,
    title,
    description,
    sections: [...fallbackSections, ...sections],
    outputMapping,
  };
}

/**
 * Convert a JSON Schema property to our field format
 */
function convertPropertyToField(key: string, prop: any, isRequired: boolean, uiField?: any, displayKey = key): SchemaField | null {
  const uiWidget = typeof uiField?.["ui:widget"] === "string" ? uiField["ui:widget"] : undefined;
  const enumNames = Array.isArray(prop.enumNames) ? prop.enumNames : undefined;
  const enumNamesTh = Array.isArray(prop["x-ui-enumNamesTh"]) ? prop["x-ui-enumNamesTh"] : undefined;
  const uiTitle = pickLocalizedUiText(uiField?.["ui:title"]);
  const uiHelp = pickLocalizedUiText(uiField?.["ui:help"]);
  const uiEnumNames = uiField?.["ui:enumNames"] && typeof uiField["ui:enumNames"] === "object"
    ? uiField["ui:enumNames"] as Record<string, unknown>
    : undefined;
  const baseField = {
    id: key,
    label: uiTitle.en || prop.title || titleFromKey(displayKey),
    labelTh: uiTitle.th,
    helpText: uiHelp.en || prop.description,
    helpTextTh: uiHelp.th,
    required: isRequired,
    default: prop.default,
  };

  if (uiWidget === "imageUpload" || (uiWidget === "file" && displayKey.toLowerCase().includes("image"))) {
    return {
      ...baseField,
      type: "imageUpload",
      multiple: true,
      minItems: prop.minItems,
      maxItems: prop.maxItems || uiField?.["ui:options"]?.maxFiles,
      maxImages: prop.maxItems || uiField?.["ui:options"]?.maxFiles,
      accept: prop["x-ui-accept"] || uiField?.["ui:options"]?.accept || prop.items?.contentMediaType || "image/*",
    };
  }

  // Determine field type based on JSON Schema type and format
  if (prop.oneOf || prop.enum) {
    // Select field with options
    const options: SelectOption[] = [];

    if (prop.oneOf) {
      for (const opt of prop.oneOf) {
        options.push({
          value: opt.const || opt.value || "",
          label: opt.title || opt.const || "",
          labelTh: opt.description,
        });
      }
    } else if (prop.enum) {
      prop.enum.forEach((val: string, index: number) => {
        const uiEnumLabel = pickLocalizedUiText(uiEnumNames?.[val]);
        options.push({
          value: val,
          label: uiEnumLabel.en || enumNames?.[index] || val.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          labelTh: uiEnumLabel.th || enumNamesTh?.[index],
        });
      });
    }

    return {
      ...baseField,
      type: "select",
      options,
    };
  }

  switch (prop.type) {
    case "string":
      if (prop.format === "uri" || displayKey.toLowerCase().includes("image") || displayKey.toLowerCase().includes("url")) {
        return null; // Skip image URLs - handled separately
      }
      // Check if long text is expected
      if (prop.maxLength && prop.maxLength > 500) {
        return {
          ...baseField,
          type: "textarea",
          rows: 4,
        };
      }
      return {
        ...baseField,
        type: displayKey.toLowerCase().includes("prompt") || displayKey.toLowerCase().includes("request") || displayKey.toLowerCase().includes("notes") ? "textarea" : "text",
        rows: displayKey.toLowerCase().includes("prompt") || displayKey.toLowerCase().includes("request") || displayKey.toLowerCase().includes("notes") ? 3 : undefined,
      };

    case "boolean":
      return {
        ...baseField,
        type: "boolean",
      };

    case "integer":
    case "number":
      return {
        ...baseField,
        type: "number",
        min: prop.minimum,
        max: prop.maximum,
      };

    case "array": {
      const itemSchema = prop.items || {};
      const isImageArray =
        uiWidget === "imageUpload" ||
        (uiWidget === "file" && displayKey.toLowerCase().includes("image")) ||
        itemSchema.contentMediaType?.startsWith?.("image/") ||
        displayKey.toLowerCase().includes("image");

      if (isImageArray) {
        return {
          ...baseField,
          type: "imageUpload",
          multiple: true,
          minItems: prop.minItems,
          maxItems: prop.maxItems || uiField?.["ui:options"]?.maxFiles,
          maxImages: prop.maxItems || uiField?.["ui:options"]?.maxFiles,
          accept: prop["x-ui-accept"] || uiField?.["ui:options"]?.accept || itemSchema.contentMediaType || "image/*",
        };
      }

      if (itemSchema.type === "string") {
        return {
          ...baseField,
          type: "array",
          minItems: prop.minItems,
          maxItems: prop.maxItems || 20,
          itemLabel: baseField.label.replace(/s$/, ""),
          arrayItemType: "string",
          itemFields: [
            {
              id: "value",
              type: uiWidget === "textarea" ? "textarea" : "text",
              label: baseField.label.replace(/s$/, ""),
              rows: uiWidget === "textarea" ? 3 : undefined,
            },
          ],
        };
      }

      return null;
    }

    case "object":
      // Skip nested objects - complex handling needed
      return null;

    default:
      return {
        ...baseField,
        type: "text",
      };
  }
}

/**
 * Substitute template variables in a prompt template
 * Replaces {variableName} with actual values from userInputs
 */
function substituteTemplateVariables(template: string, userInputs: Record<string, any>): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, variableName: string) => {
    const value = userInputs[variableName];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

function hasUsableInputValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== ".";
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true; // booleans and numbers are meaningful
}

function sanitizeUserInputs(userInputs: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(userInputs || {}).filter(([, value]) => hasUsableInputValue(value))
  );
}

function extractDefaultsFromSchema(schema: any): Record<string, any> {
  const defaults: Record<string, any> = {};
  if (!schema || typeof schema !== "object") return defaults;

  // Custom UI schema format
  if (Array.isArray(schema.sections)) {
    for (const section of schema.sections) {
      if (!Array.isArray(section?.fields)) continue;
      for (const field of section.fields) {
        if (field?.id && field.default !== undefined && hasUsableInputValue(field.default)) {
          defaults[field.id] = field.default;
        }
      }
    }
  }

  // Standard JSON schema format
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      if (prop?.default !== undefined && hasUsableInputValue(prop.default)) {
        defaults[key] = prop.default;
      }
    }
  }

  return defaults;
}

function loadSkillInputDefaults(skillSlug: string, folderPath?: string | null): Record<string, any> {
  const schemaPaths: string[] = [];

  if (folderPath) {
    schemaPaths.push(
      path.resolve(process.cwd(), folderPath, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), folderPath, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "..", folderPath, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "..", folderPath, "schemas", "input.schema.json"),
    );
  }

  const slugVariants = [
    skillSlug,
    skillSlug.replace(/-/g, "_"),
    skillSlug.replace(/_/g, "-"),
  ];

  for (const slug of slugVariants) {
    schemaPaths.push(
      path.resolve(SKILLS_DIR, slug, "schemas", "ui.schema.json"),
      path.resolve(SKILLS_DIR, slug, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "..", "skills", slug, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "..", "skills", slug, "schemas", "input.schema.json"),
      path.resolve(process.cwd(), "skills", slug, "schemas", "ui.schema.json"),
      path.resolve(process.cwd(), "skills", slug, "schemas", "input.schema.json"),
    );
  }

  for (const schemaPath of schemaPaths) {
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      const defaults = extractDefaultsFromSchema(schema);
      if (Object.keys(defaults).length > 0) {
        return defaults;
      }
    } catch (error) {
      console.warn(`[Skills] Failed to parse schema defaults at ${schemaPath}:`, error);
    }
  }

  return {};
}

const PRODUCT_REFERENCE_STORYBOARD_SKILL_ID = "product-reference-storyboard";
const PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 3800;
const STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000;
const STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS = 20000;
const STORYBOARD_REVIEW_PLANNER_CONTEXT_MAX_CHARS = 2400;
const PRODUCT_REFERENCE_STORYBOARD_CATEGORY_IDS = new Set([
  "household_product",
  "computer_laptop",
  "electrical_appliance",
  "food_beverage",
  "electronics",
  "fashion_clothing",
  "shoes",
  "watch_eyewear",
  "mobile_tablet",
  "jewelry",
  "mother_baby",
  "pet_supplies",
  "sports_equipment",
  "camera_photography",
  "gaming_accessories",
  "automotive",
  "stationery",
  "books",
  "furniture",
  "cosmetics",
]);

const PRODUCT_REFERENCE_STORYBOARD_CATEGORY_SIGNAL_RULES: Array<{ category: string; signals: string[] }> = [
  {
    category: "mother_baby",
    signals: ["แม่และเด็ก", "สินค้าแม่และเด็ก", "เด็กอ่อน", "ทารก", "เก้าอี้กินข้าวเด็ก", "รถเข็นเด็ก", "ขวดนม", "ผ้าอ้อม", "baby", "infant", "toddler", "high chair", "stroller", "diaper"],
  },
  {
    category: "mobile_tablet",
    signals: ["มือถือ", "สมาร์ทโฟน", "โทรศัพท์", "แท็บเล็ต", "เคสมือถือ", "ฟิล์มกันรอย", "smartphone", "mobile phone", "tablet", "ipad", "phone case", "screen protector"],
  },
  {
    category: "computer_laptop",
    signals: ["คอมพิวเตอร์", "แล็ปท็อป", "โน้ตบุ๊ก", "โน๊ตบุ๊ค", "จอคอม", "คีย์บอร์ด", "เมาส์", "laptop", "notebook computer", "desktop computer", "monitor", "keyboard", "mouse"],
  },
  {
    category: "camera_photography",
    signals: ["กล้อง", "เลนส์", "ขาตั้งกล้อง", "กิมบอล", "แฟลช", "ไฟถ่ายภาพ", "camera", "lens", "tripod", "gimbal", "flash", "action camera", "photography"],
  },
  {
    category: "gaming_accessories",
    signals: ["เกม", "เกมส์", "เกมมิ่ง", "จอยเกม", "คอนโทรลเลอร์", "เครื่องเกม", "gaming", "game console", "controller", "gamepad", "gaming headset"],
  },
  {
    category: "electrical_appliance",
    signals: ["เครื่องใช้ไฟฟ้า", "ตู้เย็น", "เครื่องซักผ้า", "ไมโครเวฟ", "หม้อทอด", "เครื่องปั่น", "พัดลม", "เครื่องฟอกอากาศ", "กาต้มน้ำ", "appliance", "refrigerator", "washing machine", "microwave", "air fryer", "blender", "vacuum cleaner"],
  },
  {
    category: "electronics",
    signals: ["อุปกรณ์อิเล็กทรอนิกส์", "หูฟัง", "ลำโพง", "เราเตอร์", "สายชาร์จ", "พาวเวอร์แบงค์", "ไมโครโฟน", "รีโมต", "earbuds", "headphones", "speaker", "router", "charger", "power bank", "cable", "adapter", "remote", "gadget"],
  },
  {
    category: "automotive",
    signals: ["ยานยนต์", "รถยนต์", "มอเตอร์ไซค์", "หมวกกันน็อค", "กล้องติดรถ", "ยางรถ", "น้ำมันเครื่อง", "automotive", "motorcycle", "helmet", "dash cam", "car mount", "tire"],
  },
  {
    category: "food_beverage",
    signals: ["อาหาร", "เครื่องดื่ม", "ขนม", "ซอส", "กาแฟ", "ชา", "น้ำดื่ม", "ผงชงดื่ม", "food", "beverage", "snack", "sauce", "coffee", "tea", "drink"],
  },
  {
    category: "pet_supplies",
    signals: ["สัตว์เลี้ยง", "อาหารสัตว์", "ของใช้สัตว์", "ปลอกคอ", "สายจูง", "ทรายแมว", "pet", "pet food", "pet supplies", "collar", "leash", "litter"],
  },
  {
    category: "shoes",
    signals: ["รองเท้า", "สนีกเกอร์", "รองเท้าวิ่ง", "รองเท้าแตะ", "บูท", "ส้นสูง", "sneakers", "running shoes", "sandals", "slippers", "boots", "heels", "footwear"],
  },
  {
    category: "fashion_clothing",
    signals: ["เสื้อผ้า", "แฟชั่น", "เดรส", "กางเกง", "กระโปรง", "แจ็คเก็ต", "clothing", "fashion", "shirt", "dress", "pants", "skirt", "jacket", "activewear"],
  },
  {
    category: "watch_eyewear",
    signals: ["นาฬิกา", "แว่นตา", "แว่นกันแดด", "กรอบแว่น", "watch", "smart watch", "sunglasses", "eyewear", "glasses"],
  },
  {
    category: "jewelry",
    signals: ["เครื่องประดับ", "แหวน", "สร้อย", "ต่างหู", "กำไล", "จี้", "jewelry", "ring", "necklace", "pendant", "earrings", "bracelet"],
  },
  {
    category: "sports_equipment",
    signals: ["อุปกรณ์กีฬา", "ฟิตเนส", "ดัมเบล", "โยคะ", "ลูกบอล", "แร็กเก็ต", "sports equipment", "fitness", "dumbbell", "yoga", "ball", "racket"],
  },
  {
    category: "books",
    signals: ["หนังสือ", "นิยาย", "มังงะ", "การ์ตูน", "ตำรา", "แบบฝึกหัด", "นิตยสาร", "book", "textbook", "novel", "comic", "manga", "workbook", "magazine"],
  },
  {
    category: "stationery",
    signals: ["เครื่องเขียน", "ปากกา", "ดินสอ", "สมุด", "แฟ้ม", "กระดาษ", "ยางลบ", "stationery", "pen", "pencil", "marker", "notebook", "planner", "folder"],
  },
  {
    category: "household_product",
    signals: ["เครื่องใช้ในบ้าน", "ของใช้ในบ้าน", "อุปกรณ์ทำความสะอาด", "ที่เก็บของ", "กล่องเก็บของ", "เครื่องครัว", "ห้องน้ำ", "ซักผ้า", "household", "home goods", "cleaning tool", "organizer", "storage container", "kitchenware", "bathroom", "laundry"],
  },
  {
    category: "cosmetics",
    signals: ["คอสเมติก", "เครื่องสำอาง", "บิวตี้", "สกินแคร์", "เซรั่ม", "ครีม", "ลิป", "รองพื้น", "beauty", "cosmetic", "cosmetics", "makeup", "skincare", "serum", "cream", "lipstick", "foundation"],
  },
  {
    category: "furniture",
    signals: ["เฟอร์นิเจอร์", "โต๊ะ", "เก้าอี้", "ชั้นวาง", "ตู้", "โซฟา", "เตียง", "โต๊ะข้างเตียง", "โต๊ะวางของ", "ลิ้นชัก", "สตูล", "furniture", "table", "chair", "shelf", "shelves", "rack", "cabinet", "sofa", "bed", "desk", "nightstand", "bedside table", "drawer", "wardrobe", "stool"],
  },
];

function normalizeProductReferenceStoryboardCategory(value: unknown): string | null {
  const category = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!category || category === "auto") return null;
  return PRODUCT_REFERENCE_STORYBOARD_CATEGORY_IDS.has(category) ? category : null;
}

function normalizeProductReferenceStoryboardSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreProductReferenceStoryboardSignal(searchableText: string, signal: string): number {
  const normalizedSignal = normalizeProductReferenceStoryboardSearchText(signal);
  if (!normalizedSignal || !searchableText.includes(normalizedSignal)) return 0;
  return normalizedSignal.length >= 12 ? 3 : normalizedSignal.includes(" ") ? 2 : 1;
}

function stringifyProductReferenceStoryboardInput(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyProductReferenceStoryboardInput).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function inferProductReferenceStoryboardCategoryFromInputs(userInputs: Record<string, any>): string | null {
  const searchableText = normalizeProductReferenceStoryboardSearchText([
    userInputs.product_title,
    userInputs.production_concept_details,
    userInputs.storyboard_guide,
    userInputs.voiceover_script,
    userInputs.product_label_text,
    userInputs.marketplace_category,
    userInputs.marketplace_category_text,
    userInputs.planning_context_pack,
  ].map(stringifyProductReferenceStoryboardInput).filter(Boolean).join(" "));

  if (!searchableText) return null;

  let bestCategory: string | null = null;
  let bestScore = 0;
  for (const rule of PRODUCT_REFERENCE_STORYBOARD_CATEGORY_SIGNAL_RULES) {
    const score = rule.signals.reduce(
      (sum, signal) => sum + scoreProductReferenceStoryboardSignal(searchableText, signal),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

function resolveSkillFolderCandidates(skillSlug: string, folderPath?: string | null): string[] {
  const candidates: string[] = [];
  if (folderPath) {
    candidates.push(
      path.resolve(process.cwd(), folderPath),
      path.resolve(process.cwd(), "..", folderPath),
      path.resolve(process.cwd(), "apps", "web", folderPath),
    );
  }
  candidates.push(
    path.resolve(SKILLS_DIR, skillSlug),
    path.resolve(process.cwd(), "skills", skillSlug),
    path.resolve(process.cwd(), "..", "skills", skillSlug),
    path.resolve(process.cwd(), "apps", "web", "skills", skillSlug),
  );
  return Array.from(new Set(candidates));
}

function appendProductReferenceStoryboardCategoryRules(
  systemPrompt: string,
  params: {
    skillSlug: string;
    folderPath?: string | null;
    userInputs: Record<string, any>;
  },
): string {
  if (params.skillSlug !== PRODUCT_REFERENCE_STORYBOARD_SKILL_ID) return systemPrompt;

  const explicitCategory = normalizeProductReferenceStoryboardCategory(params.userInputs.product_category);
  const inferredCategory = explicitCategory ?? inferProductReferenceStoryboardCategoryFromInputs(params.userInputs);
  const category = inferredCategory;
  if (!category) {
    return `${systemPrompt}\n\n## Product Category Rule Runtime Note\nNo concrete product_category rule file was appended because product_category is auto or unsupported. Infer the category from Product Detail, product_title, marketplace context, and current reference_product_images; if uncertain, use only the shared PRODUCT REFERENCE LOCK and do not invent category-specific facts.`;
  }

  for (const skillDir of resolveSkillFolderCandidates(params.skillSlug, params.folderPath)) {
    const categoryPath = path.join(skillDir, "references", "product-categories", `${category}.md`);
    if (!fs.existsSync(categoryPath)) continue;
    try {
      const categoryRules = fs.readFileSync(categoryPath, "utf-8").trim();
      if (categoryRules) {
        const selectionNote = explicitCategory
          ? `Selected product_category: ${category}.`
          : `Auto-inferred product_category: ${category} from Product Detail, product title, storyboard guide, and voiceover inputs.`;
        return `${systemPrompt}\n\n## Selected Product Category Rule File\n${selectionNote}\n${categoryRules}`;
      }
    } catch (error) {
      console.warn(`[Skills] Failed to read product category rules at ${categoryPath}:`, error);
    }
  }

  return `${systemPrompt}\n\n## Product Category Rule Runtime Note\nThe selected product_category '${category}' did not resolve to a category rule file. Continue with the shared PRODUCT REFERENCE LOCK and current product references only.`;
}

function resolveCustomPythonSkillScript(folderPath: string | null | undefined, skillSlug: string): string | null {
  const candidates: string[] = [];

  if (folderPath) {
    candidates.push(
      path.resolve(process.cwd(), folderPath),
      path.resolve(process.cwd(), "..", folderPath),
      path.resolve(process.cwd(), "..", "..", folderPath),
      path.resolve(process.cwd(), "apps", "web", folderPath),
    );
  }

  candidates.push(
    path.resolve(SKILLS_DIR, skillSlug),
    path.resolve(process.cwd(), "..", "skills", skillSlug),
    path.resolve(process.cwd(), "skills", skillSlug),
  );

  for (const skillDir of Array.from(new Set(candidates))) {
    const scriptPath = path.join(skillDir, "python", "skill.py");
    if (fs.existsSync(scriptPath)) {
      return scriptPath;
    }
  }

  return null;
}

async function executeCustomPythonSkillText(params: {
  skillSlug: string;
  folderPath: string | null;
  prompt: string;
  userInputs: Record<string, any>;
  context?: Record<string, unknown>;
  publicUrl?: string | null;
  userToken?: string | null;
}): Promise<string> {
  const scriptPath = resolveCustomPythonSkillScript(params.folderPath, params.skillSlug);
  if (!scriptPath) {
    throw new Error(`Python skill script not found for '${params.skillSlug}'`);
  }

  const projectRoot = path.resolve(process.cwd(), "..", "..");
  const venvPython = path.join(projectRoot, "python-backend", ".venv", "bin", "python");
  const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";
  const inputPayload = JSON.stringify({
    skill_name: params.skillSlug,
    prompt: params.prompt,
    params: params.userInputs,
    context: {
      ...(params.context ?? {}),
      publicUrl: params.publicUrl ?? "",
      userToken: params.userToken ?? "",
    },
  });

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (value: string | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (value instanceof Error) {
        reject(value);
      } else {
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(new Error("Python skill timed out after 120 seconds"));
    }, 120_000);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => settle(error));
    child.on("close", (code) => {
      if (code !== 0) {
        settle(new Error(stderr.trim() || `Python skill exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed?.success) {
          settle(new Error(String(parsed?.error || parsed?.output || "Python skill returned failure")));
          return;
        }
        settle(String(parsed.output ?? ""));
      } catch (error) {
        settle(new Error(`Failed to parse Python skill output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.write(inputPayload);
    child.stdin.end();
  });
}

// ==================== Router ====================

export const skillsRouter = router({
  // List all available skills
  list: protectedProcedure
    .input(
      z.object({
        type: skillTypeSchema.optional(),
        enabledOnly: z.boolean().optional(),
        platform: localSkillPlatformSchema.optional(),
        origin: localSkillOriginSchema.optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      let skills = await getAvailableSkillsAsync();
      const localAiContext = await getRequesterLocalAiSurfaceContext({
        userId: ctx.user.id,
        tenantId: ctx.tenantId ?? String(ctx.user.currentTenantId ?? ""),
        platform: input?.platform ?? "web",
      });

      if (input?.type) {
        skills = skills.filter((s) => s.type === input.type);
      }

      if (input?.enabledOnly) {
        skills = skills.filter((s) => s.enabledByDefault);
      }

      // Return simplified skill info for listing
      return skills.map((skill) =>
        attachLocalExecutionPolicy(
          {
            id: skill.id,
            name: sanitizeBrandText(skill.name),
            description: sanitizeBrandText(skill.description),
            icon: skill.icon,
            type: skill.type,
            creditMultiplier: skill.creditMultiplier,
            enabledByDefault: skill.enabledByDefault,
            priority: skill.priority,
            hasSkillFile: !!skill.skillFilePath,
            // Sandbox metadata
            sandboxRequired: !!skill.executionMode?.startsWith("sandbox-"),
            sandboxProfileSlug: skill.sandboxProfileSlug ?? null,
            executionMode: skill.executionMode ?? null,
          },
          skill,
          {
            platform: input?.platform,
            origin: input?.origin,
            userPresent: true,
            featureEnabled: localAiContext.policy.featureEnabled,
            forceCloudOnly: localAiContext.policy.forceCloudOnly,
            userEnabled: localAiContext.syncedPreferences.enabled,
            executionMode: localAiContext.syncedPreferences.mode,
          },
        ),
      );
    }),

  // List skills visible to the current user (for workflow node)
  listForWorkflow: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Import here to avoid circular dependency
      const { getUserVisibleSkills } = await import("../services/userSkillService");

      const result = await getUserVisibleSkills(userId, {
        search: input?.search,
        limit: input?.limit || 50,
      });

      // Return skills in format suitable for workflow node dropdown
      return {
        skills: result.skills.map((skill) => ({
          id: skill.id,
          slug: skill.slug,
          name: sanitizeBrandText(skill.name || ""),
          description: sanitizeBrandText(skill.description || ""),
          icon: skill.icon,
          category: skill.category,
          creditMultiplier: skill.creditMultiplier,
        })),
        total: result.total,
      };
    }),

  // Get a specific skill by ID
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        platform: localSkillPlatformSchema.optional(),
        origin: localSkillOriginSchema.optional(),
        conversationId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      const { localAiContext, executionMode } =
        await resolveLocalAiExecutionModeForSurface({
        userId: ctx.user.id,
        tenantId: ctx.tenantId ?? String(ctx.user.currentTenantId ?? ""),
        platform: input.platform ?? "web",
        origin: input.origin,
        conversationId: input.conversationId,
      });

      // Load skill file content if available
      let skillContent: string | null = null;
      if (skill.skillFilePath) {
        skillContent = await loadSkillFile(input.id);
      }

      return attachLocalExecutionPolicy(
        {
          ...skill,
          triggers: skill.triggers.map((t) => t.pattern), // Return original pattern string
          skillContent,
        },
        skill,
        {
          platform: input.platform,
          origin: input.origin,
          userPresent: true,
          featureEnabled: localAiContext.policy.featureEnabled,
          forceCloudOnly: localAiContext.policy.forceCloudOnly,
          userEnabled: localAiContext.syncedPreferences.enabled,
          executionMode,
        },
      );
    }),

  // Get skill file content (for editing)
  getSkillFile: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      if (!skill.skillFilePath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.id}' does not have an editable skill file`,
        });
      }

      const content = await loadSkillFile(input.id);

      if (!content) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill file not found for '${input.id}'`,
        });
      }

      return {
        skillId: input.id,
        filePath: skill.skillFilePath,
        content,
      };
    }),

  // Update skill file content (admin only)
  updateSkillFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().min(1).max(100000),
      })
    )
    .mutation(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found`,
        });
      }

      if (!skill.skillFilePath) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.id}' does not have an editable skill file`,
        });
      }

      try {
        // Try to find the skill file path
        let filePath = path.resolve(process.cwd(), "..", skill.skillFilePath);
        if (!fs.existsSync(filePath)) {
          filePath = path.resolve(process.cwd(), skill.skillFilePath);
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the updated content
        fs.writeFileSync(filePath, input.content, "utf-8");

        return {
          success: true,
          skillId: input.id,
          filePath: skill.skillFilePath,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update skill file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get skill input schema (for dynamic form generation)
  getInputSchema: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ input }) => {
      // Sync skill if contentHash changed (ensures latest skill.md is used)
      await syncSingleSkillIfChanged(input.skillId);

      // Use getSkillByIdOrType to support both slug and type lookup
      const skill = getSkillByIdOrType(input.skillId);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      // Convert skill ID variations (hyphen to underscore)
      const skillIdVariations = [
        input.skillId,
        input.skillId.replace(/-/g, "_"), // create-image-prompt -> create_image_prompt
        input.skillId.replace(/_/g, "-"), // image_prompt_engineer -> image-prompt-engineer
      ];

      // Try to find the input schema file
      // Check multiple possible paths - ui.schema.json first (custom format), then input.schema.json
      const possiblePaths: string[] = [];

      // From skill folder path (if available) - ui.schema.json first
      if (skill.skillFilePath) {
        possiblePaths.push(
          path.resolve(process.cwd(), "..", path.dirname(skill.skillFilePath), "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), path.dirname(skill.skillFilePath), "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "..", path.dirname(skill.skillFilePath), "schemas", "input.schema.json"),
          path.resolve(process.cwd(), path.dirname(skill.skillFilePath), "schemas", "input.schema.json"),
        );
      }

      // From skills directory using skill ID variations - ui.schema.json first
      for (const skillIdVariant of skillIdVariations) {
        possiblePaths.push(
          path.resolve(SKILLS_DIR, skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "..", "skills", skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(process.cwd(), "skills", skillIdVariant, "schemas", "ui.schema.json"),
          path.resolve(SKILLS_DIR, skillIdVariant, "schemas", "input.schema.json"),
          path.resolve(process.cwd(), "..", "skills", skillIdVariant, "schemas", "input.schema.json"),
          path.resolve(process.cwd(), "skills", skillIdVariant, "schemas", "input.schema.json"),
        );
      }

      // Also check skills directory for partial matches - ui.schema.json first
      try {
        const skillsDirs = [SKILLS_DIR, path.resolve(process.cwd(), "..", "skills"), path.resolve(process.cwd(), "skills")];
        for (const skillsDir of skillsDirs) {
          if (fs.existsSync(skillsDir)) {
            const folders = fs.readdirSync(skillsDir);
            for (const folder of folders) {
              possiblePaths.push(path.resolve(skillsDir, folder, "schemas", "ui.schema.json"));
            }
            for (const folder of folders) {
              possiblePaths.push(path.resolve(skillsDir, folder, "schemas", "input.schema.json"));
            }
          }
        }
      } catch (e) {
        // Ignore errors when scanning directories
      }

      let foundSchema: any = null;

      for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
          try {
            const content = fs.readFileSync(schemaPath, "utf-8");
            const schema = JSON.parse(content);

            // If we are scanning generic folders, we MUST verify the skillId matches
            // It could be checking ui.schema.json which might contain skillId
            const isTargetedPath = skillIdVariations.some(variant => schemaPath.includes(`/${variant}/`) || schemaPath.includes(`\\${variant}\\`)) || (skill?.skillFilePath && schemaPath.includes(path.dirname(skill.skillFilePath)));

            if (!isTargetedPath) {
              // Only accept it if it declares the exact skillId, since it came from a random folder
              if (schema.skillId !== input.skillId) {
                continue;
              }
            }

            // Check if schema has our custom format with sections
            // or if it's a standard JSON Schema that needs conversion
            if (schema.sections) {
              foundSchema = schema;
              break;
            } else if (schema.properties) {
              let siblingUiSchema: any | undefined;
              const siblingUiSchemaPath = path.resolve(path.dirname(schemaPath), "ui.schema.json");
              if (path.basename(schemaPath) !== "ui.schema.json" && fs.existsSync(siblingUiSchemaPath)) {
                try {
                  siblingUiSchema = JSON.parse(fs.readFileSync(siblingUiSchemaPath, "utf-8"));
                } catch {
                  siblingUiSchema = undefined;
                }
              }
              foundSchema = convertJsonSchemaToSkillSchema(schema, input.skillId, siblingUiSchema);
              break;
            }
          } catch (error) {
            console.error(`[Skills] Error parsing schema for ${input.skillId} at ${schemaPath}:`, error);
          }
        }
      }

      if (foundSchema) {
        return {
          skillId: input.skillId,
          hasSchema: true,
          schema: foundSchema,
        };
      }

      // No schema found - return hasSchema: false
      return {
        skillId: input.skillId,
        hasSchema: false,
        schema: null,
      };
    }),

  // Get prompt enhancement options (styles, VFX, features)
  getPromptOptions: protectedProcedure.query(() => {
    return getPromptOptions();
  }),

  // Get available LLM models for skill execution (Advanced Mode)
  // Returns only enabled models from enabled providers.
  getVisionModels: protectedProcedure.query(async () => {
    try {
      return { models: await getVisionModelOptions() };
    } catch (error) {
      console.error("[Skills] Error fetching models:", error);
      return { models: [] };
    }
  }),

  // Get skill's default model configuration
  getSkillConfig: protectedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ input }) => {
      // Sync skill if contentHash changed
      await syncSingleSkillIfChanged(input.skillId);

      try {
        await refreshModelCache().catch((error) => {
          console.warn("[Skills] Failed to refresh media model cache before loading skill config", {
            skillId: input.skillId,
            error: error instanceof Error ? error.message : String(error),
          });
        });

        const [skill] = await db
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          category: skills.category,
          defaultModel: skills.defaultModel,
          llmModelId: skills.llmModelId,
          preferredProviderId: skills.preferredProviderId,
          strictProviderPin: skills.strictProviderPin,
          availableModels: skills.availableModels,
        })
          .from(skills)
          .where(and(eq(skills.slug, input.skillId), eq(skills.isEnabled, true)))
          .limit(1);

        if (!skill) {
          return {
            defaultModel: null,
            llmModelId: null,
            preferredProviderId: null,
            strictProviderPin: false,
            availableModels: null,
          };
        }

        const mediaType = resolveMediaTypeFromSkillCategory(skill.category);
        const sanitizedSelection = mediaType
          ? sanitizeMediaModelSelection(mediaType, {
            availableModels: skill.availableModels,
            defaultModel: skill.defaultModel,
          })
          : {
            availableModels: skill.availableModels,
            defaultModel: skill.defaultModel,
          };

        return {
          defaultModel: sanitizedSelection.defaultModel,
          llmModelId: skill.llmModelId || sanitizedSelection.defaultModel,
          preferredProviderId: skill.preferredProviderId ?? null,
          strictProviderPin: skill.strictProviderPin ?? false,
          availableModels: sanitizedSelection.availableModels,
        };
      } catch (error) {
        console.error("[Skills] Error fetching skill config:", error);
        return {
          defaultModel: null,
          llmModelId: null,
          preferredProviderId: null,
          strictProviderPin: false,
          availableModels: null,
        };
      }
    }),

  // Get style categories
  getStyleCategories: protectedProcedure.query(() => {
    return getStyleCategories();
  }),

  // Get VFX categories
  getVFXCategories: protectedProcedure.query(() => {
    return getVFXCategories();
  }),

  // Build prompt using CreateImagePrompt skill (returns system prompt for LLM)
  buildPrompt: protectedProcedure
    .input(promptEnhancementRequestSchema)
    .mutation(({ input }) => {
      try {
        const { resolvedSkillId } = resolvePromptEnhancementSkill(input.skillId);
        const systemPrompt = buildSystemPrompt(input);
        const userPrompt = buildUserPrompt(input);

        return {
          success: true,
          systemPrompt,
          userPrompt,
          skillId: resolvedSkillId,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to build prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  generateStoryboardVideoPrompt: protectedProcedure
    .input(z.object({
      currentPrompt: z.string().trim().min(1).max(5000),
      startFrameUrl: z.string().trim().min(1),
      endFrameUrl: z.string().trim().min(1),
      frameRoles: z.array(z.enum(["start", "stop", "reference"])).min(2).max(2).optional(),
      conceptDetails: z.string().trim().max(12000).optional(),
      storyboardGuide: z.string().trim().max(12000).optional(),
      voiceoverFullScript: z.string().trim().max(12000).optional(),
      aspectRatio: z.string().trim().max(32).optional(),
      durationSeconds: z.number().positive().max(60).optional(),
      model: z.string().trim().max(255).optional(),
      marketplaceContext: z.object({
        productId: z.string().trim().max(255).nullable().optional(),
        platform: z.enum(["shopee", "tiktok_shop"]).optional(),
        productName: z.string().trim().max(1000).nullable().optional(),
        shopName: z.string().trim().max(500).nullable().optional(),
        shopId: z.string().trim().max(255).nullable().optional(),
        itemId: z.string().trim().max(255).nullable().optional(),
        sourceUrl: z.string().trim().max(2048).nullable().optional(),
      }).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits" });
      }

      const visionModel = resolveVisionModelId(await getVisionModelOptions(), null);
      if (!visionModel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No enabled vision model configured",
        });
      }

      const systemPrompt = [
        "You are a senior AI video director for storyboard image-to-video generation.",
        `Analyze the two images with these roles: Image 1 = ${(input.frameRoles ?? ["start", "stop"])[0]}, Image 2 = ${(input.frameRoles ?? ["start", "stop"])[1]}.`,
        "Return one production-ready video prompt only. No markdown, no code fence, no title, no explanation.",
        "The prompt must preserve product identity, people identity, composition intent, text/logo fidelity, colors, lighting, and the declared frame/reference relationship.",
        "Product fidelity is a hard lock: preserve the exact product geometry, countable parts, proportions, material, color, and visible construction from the reference frames. Never add drawers, doors, extra panels, different shelves, alternate materials, or a different product type.",
        "Human identity is a hard lock: if a person appears, preserve the same face, hair, skin texture, age, wardrobe, and body continuity. Avoid waxy, plastic, CG-looking skin, face drift, blurred faces, or identity swaps.",
        "If endpoint frames show only a back/side/cropped person, keep the motion non-revealing unless the same clear face is already visible in the references; do not rotate the person to reveal an invented face.",
        "Use cinematic realism: realistic lens language, dimensional lighting, natural shadows, believable camera movement, and coherent color grade that matches the storyboard beat.",
        "Describe a natural camera move and subject/product motion that respects exact start/stop roles and treats reference-only images as guidance, not frozen endpoints.",
        "Keep it concise and action-focused, suitable for Veo/Kling-style image-to-video generation. Never exceed 2,000 characters.",
        "Do not paste concept, storyboard guide, product metadata, PRODUCT FACTS LOCK, USER-SELECTED CREATIVE DIRECTION LOCK, Prop details, price, rating, or sales metadata into the final prompt.",
      ].join("\n");
      const existingSpeechText = extractStoryboardNativeSpeechText(input.currentPrompt);
      const existingSpeechMode = existingSpeechText
        ? inferStoryboardSpeechDirectiveMode(input.currentPrompt)
        : null;
      const userPrompt = [
        `Current generic prompt: ${input.currentPrompt}`,
        input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}` : "",
        input.durationSeconds ? `Target duration: ${input.durationSeconds} seconds` : "",
        input.model ? `Target model: ${input.model}` : "",
        input.marketplaceContext ? [
          "",
          "Marketplace product metadata for the sliced storyboard frames:",
          input.marketplaceContext.productName ? `- Product title: ${input.marketplaceContext.productName}` : "",
          input.marketplaceContext.platform ? `- Platform: ${input.marketplaceContext.platform}` : "",
          input.marketplaceContext.shopName ? `- Shop name: ${input.marketplaceContext.shopName}` : "",
          input.marketplaceContext.shopId ? `- Shop ID: ${input.marketplaceContext.shopId}` : "",
          input.marketplaceContext.itemId ? `- Item ID: ${input.marketplaceContext.itemId}` : "",
          input.marketplaceContext.sourceUrl ? `- Product page URL: ${input.marketplaceContext.sourceUrl}` : "",
        ].filter(Boolean).join("\n") : "",
        input.conceptDetails ? [
          "",
          "Production concept and details guideline:",
          input.conceptDetails,
        ].join("\n") : "",
        input.storyboardGuide ? [
          "",
          "Storyboard guide:",
          input.storyboardGuide,
        ].join("\n") : "",
        input.voiceoverFullScript ? [
          "",
          "Storyboard voiceover / dialogue contract:",
          input.voiceoverFullScript,
          "The improved prompt must remain aligned with the matching ordered spoken beat and must not create a different story.",
        ].join("\n") : "",
        existingSpeechText && existingSpeechMode ? [
          "",
          "Native audio instruction from the current prompt:",
          `- Preserve this spoken line exactly in the improved prompt: ${formatStoryboardNativeSpeechDirective(existingSpeechText, existingSpeechMode.speechMode, existingSpeechMode.speechLanguage)}`,
          "- Do not remove requested speech, voiceover, music, sound, or audio mood directions already present in the current prompt.",
        ].join("\n") : "",
        "",
        "Write the improved prompt in English. It must explicitly say:",
        `- @Image1 role: ${(input.frameRoles ?? ["start", "stop"])[0]}`,
        `- @Image2 role: ${(input.frameRoles ?? ["start", "stop"])[1]}`,
        "- preserve all visible product/package/brand details from both frames",
        "- preserve exact product structure, material, countable parts, proportions, and color; do not add or replace components",
        "- preserve human identity, natural facial detail, and realistic skin; if a face is not visible in the endpoints, do not invent a new face turn",
        "- use cinematic camera language, dimensional lighting, natural shadows, and realistic color continuity",
        "- create only plausible movement between these two frames",
        "- keep static product/prop/room/person details as frame-preservation rules, not long descriptions",
      ].filter(Boolean).join("\n");

      try {
        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          userId,
          [input.startFrameUrl, input.endFrameUrl],
          visionModel,
          900,
          { tenantId: ctx.tenantId, publicUrl: ctx.publicUrl ?? null },
        );
        let prompt = result.content
          .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        prompt = buildCompactStoryboardReviewVideoPrompt({
          visualPrompt: prompt,
          durationSeconds: input.durationSeconds ?? null,
          aspectRatio: input.aspectRatio ?? null,
          frameRoles: input.frameRoles ?? ["start", "stop"],
          includeVoiceover: Boolean(existingSpeechText && existingSpeechMode),
          speechMode: existingSpeechMode?.speechMode ?? "none",
          speechLanguage: existingSpeechMode?.speechLanguage ?? null,
          voiceoverScript: existingSpeechText,
          includeSound: false,
        });
        if (!prompt) {
          throw new Error("Vision prompt generation returned no usable action/camera direction");
        }

        const creditsUsed = Math.max(1, calculateCreditsForLLM(
          result.usage.promptTokens,
          result.usage.completionTokens,
          visionModel,
        ));
        await deductCredits({
          userId,
          amount: creditsUsed,
          description: "Storyboard video prompt from start/end frames",
          sourceType: "skill",
          metadata: {
            model: visionModel,
            llmModel: visionModel,
            runtimeKind: "llm",
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            referenceImageCount: 2,
            originSurface: "storyboard_review",
          },
        });

        return { prompt };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate storyboard video prompt",
        });
      }
    }),

  planStoryboardVideoPrompts: protectedProcedure
    .input(z.object({
      productMetadata: z.record(z.unknown()).nullable().optional(),
      includeVoiceover: z.boolean().default(false),
      speechMode: z.enum(["none", "en", "th", "other"]).default("none"),
      speechLanguage: z.string().trim().max(80).optional(),
      includeSound: z.boolean().default(false),
      tone: z.enum(["sales", "premium", "demo", "ugc", "cinematic"]).default("sales"),
      language: z.enum(["auto", "th", "en"]).default("auto"),
      conceptDetails: z.string().trim().max(12000).optional(),
      storyboardGuide: z.string().trim().max(12000).optional(),
      voiceoverFullScript: z.string().trim().max(12000).optional(),
      useVoiceoverScriptAsConcept: z.boolean().default(false),
      slots: z.array(z.object({
        id: z.string().trim().min(1).max(255),
        index: z.number().int().min(0),
        currentPrompt: z.string().max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS).optional(),
        startFrameUrl: z.string().trim().min(1),
        endFrameUrl: z.string().trim().min(1),
        frameRoles: z.array(z.enum(["start", "stop", "reference"])).min(2).max(2).optional(),
        conceptDetails: z.string().trim().max(12000).optional(),
        storyboardGuide: z.string().trim().max(12000).optional(),
        aspectRatio: z.string().trim().max(32).optional(),
        durationSeconds: z.number().positive().max(60).optional(),
        model: z.string().trim().max(255).optional(),
        voiceoverFullScript: z.string().trim().max(12000).optional(),
        previousVoiceoverScript: z.string().trim().max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS).optional(),
        nextVoiceoverScript: z.string().trim().max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS).optional(),
        previousJourneyStage: z.string().trim().max(255).optional(),
        nextJourneyStage: z.string().trim().max(255).optional(),
        previousPrompt: z.string().max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS).optional(),
        nextPrompt: z.string().max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS).optional(),
      })).min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits" });
      }

      const skillSlug = "storyboard-video-customer-journey-prompt";
      await syncSingleSkillIfChanged(skillSlug).catch((error) => {
        console.warn("[Skills] Failed to auto-sync storyboard planner skill:", error);
      });

      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select({
          slug: skills.slug,
          name: skills.name,
          skillContent: skills.skillContent,
          systemPrompt: skills.systemPrompt,
          folderPath: skills.folderPath,
          defaultModel: skills.defaultModel,
          llmModelId: skills.llmModelId,
        })
        .from(skills)
        .where(and(eq(skills.slug, skillSlug), eq(skills.isEnabled, true)))
        .limit(1);

      let systemPrompt = skill?.skillContent || skill?.systemPrompt || "";
      if (!systemPrompt) {
        const fallbackPath = path.resolve(process.cwd(), "skills", skillSlug, "skill.md");
        const appFallbackPath = path.resolve(process.cwd(), "apps/web/skills", skillSlug, "skill.md");
        const sourcePath = fs.existsSync(fallbackPath) ? fallbackPath : appFallbackPath;
        if (fs.existsSync(sourcePath)) {
          systemPrompt = parseSkillFile(fs.readFileSync(sourcePath, "utf-8")).content;
        }
      }
      if (!systemPrompt) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill '${skillSlug}' not found` });
      }

      const visionModel = resolveVisionModelId(
        await getVisionModelOptions(),
        skill?.llmModelId || skill?.defaultModel || null,
      );
      if (!visionModel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No enabled vision model configured",
        });
      }

      const orderedSlots = [...input.slots].sort((a, b) => a.index - b.index);
      const referenceImages = orderedSlots.flatMap((slot) => [slot.startFrameUrl, slot.endFrameUrl]);
      const suppliedVoiceoverFullScript = input.voiceoverFullScript ?? "";
      const useVoiceoverScriptAsConcept = Boolean(input.useVoiceoverScriptAsConcept && suppliedVoiceoverFullScript.trim());
      const shouldIncludeVoiceover = input.speechMode !== "none";
      const effectiveConceptDetails = useVoiceoverScriptAsConcept
        ? suppliedVoiceoverFullScript
        : input.conceptDetails ?? null;
      const userPrompt = buildStoryboardPlannerPrompt({
        productMetadata: input.productMetadata ?? null,
        options: {
          includeVoiceover: shouldIncludeVoiceover,
          speechMode: input.speechMode,
          speechLanguage: input.speechMode === "none"
            ? ""
            : input.speechMode === "th"
              ? "Thai"
              : input.speechMode === "en"
                ? "English"
                : input.speechLanguage,
          includeSound: input.includeSound,
          tone: input.tone,
          language: input.language,
          useVoiceoverScriptAsConcept,
        },
        conceptDetails: effectiveConceptDetails,
        storyboardGuide: input.storyboardGuide ?? null,
        voiceoverFullScript: suppliedVoiceoverFullScript,
        useVoiceoverScriptAsConcept,
        slots: orderedSlots.map((slot) => ({
          id: slot.id,
          index: slot.index,
          currentPrompt: slot.currentPrompt ?? "",
          frameRoles: slot.frameRoles ?? ["start", "stop"],
          conceptDetails: slot.conceptDetails ?? effectiveConceptDetails ?? "",
          storyboardGuide: slot.storyboardGuide ?? input.storyboardGuide ?? "",
          durationSeconds: slot.durationSeconds ?? null,
          aspectRatio: slot.aspectRatio ?? null,
          model: slot.model ?? null,
          voiceoverFullScript: slot.voiceoverFullScript ?? suppliedVoiceoverFullScript,
          previousVoiceoverScript: slot.previousVoiceoverScript ?? "",
          nextVoiceoverScript: slot.nextVoiceoverScript ?? "",
          previousJourneyStage: slot.previousJourneyStage ?? "",
          nextJourneyStage: slot.nextJourneyStage ?? "",
          previousPrompt: slot.previousPrompt ?? "",
          nextPrompt: slot.nextPrompt ?? "",
        })),
      });

      try {
        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          userId,
          referenceImages,
          visionModel,
          7000,
          { tenantId: ctx.tenantId, publicUrl: ctx.publicUrl ?? null },
        );
        const parsed = parseLlmJsonObject(result.content);
        let totalPromptTokens = result.usage.promptTokens;
        let totalCompletionTokens = result.usage.completionTokens;
        const slotPositionById = new Map(orderedSlots.map((slot, position) => [slot.id, position]));
        const parsedSlots = Array.isArray(parsed.slots)
          ? parsed.slots
            .filter((slot): slot is Record<string, unknown> => Boolean(slot) && typeof slot === "object")
            .map((slot) => {
              const id = String(slot.id ?? "");
              const slotPosition = slotPositionById.get(id) ?? 0;
              return {
                id,
                index: Number.isFinite(Number(slot.index)) ? Number(slot.index) : 0,
                journeyStage: String(slot.journey_stage ?? slot.journeyStage ?? ""),
                videoPrompt: normalizeStoryboardSlotLocalImageAliases(
                  String(slot.video_prompt ?? slot.videoPrompt ?? ""),
                  slotPosition,
                ),
                voiceoverScript: normalizeStoryboardSlotLocalImageAliases(
                  String(slot.voiceover_script ?? slot.voiceoverScript ?? ""),
                  slotPosition,
                ),
                soundBrief: normalizeStoryboardSlotLocalImageAliases(
                  String(slot.sound_brief ?? slot.soundBrief ?? ""),
                  slotPosition,
                ),
                qualityNotes: Array.isArray(slot.quality_notes)
                  ? slot.quality_notes.map((note) => String(note)).filter(Boolean)
                  : [],
              };
            })
          : [];
        const parsedSlotById = new Map(parsedSlots.map((slot) => [slot.id, slot]));
        const sourceSlotById = new Map(orderedSlots.map((slot) => [slot.id, slot]));
        let slots: StoryboardPlannerSlotResult[] = orderedSlots.map((slot) => parsedSlotById.get(slot.id) ?? {
          id: slot.id,
          index: slot.index,
          journeyStage: "",
          videoPrompt: "",
          voiceoverScript: "",
          soundBrief: "",
          qualityNotes: [],
        });
        slots = repairStoryboardPlannerVoiceoversFromSource({
          slots,
          sourceSlotById,
          speechMode: input.speechMode,
          speechLanguage: input.speechLanguage ?? null,
        });
        slots = slots.map((slot) => enforceStoryboardPlannerNativeAudio({
          slot,
          sourceSlot: sourceSlotById.get(slot.id),
          includeSound: input.includeSound,
          speechMode: input.speechMode,
          speechLanguage: input.speechLanguage ?? null,
        }));
        const normalizedPromptCounts = new Map<string, number>();
        for (const slot of slots) {
          const normalized = normalizeStoryboardPromptForDuplicateCheck(slot.videoPrompt);
          if (normalized) {
            normalizedPromptCounts.set(normalized, (normalizedPromptCounts.get(normalized) ?? 0) + 1);
          }
        }
        const normalizedVoiceoverCounts = buildStoryboardVoiceoverCounts(slots);
        const repairSlotIds = new Set(slots
          .filter((slot) => {
            const sourceSlot = sourceSlotById.get(slot.id);
            const normalized = normalizeStoryboardPromptForDuplicateCheck(slot.videoPrompt);
            const normalizedVoiceover = normalizeStoryboardVoiceoverForDuplicateCheck(slot.voiceoverScript);
            const hasBadVoiceover = shouldIncludeVoiceover && (
              !normalizedVoiceover
              || (normalizedVoiceoverCounts.get(normalizedVoiceover) ?? 0) > 1
              || isStoryboardVoiceoverTooShort(
                slot.voiceoverScript,
                sourceSlot?.durationSeconds ?? 8,
                input.speechMode,
                input.speechLanguage ?? null,
              )
            );
            return !normalized
              || isGenericStoryboardTransitionPrompt(slot.videoPrompt)
              || (normalizedPromptCounts.get(normalized) ?? 0) > 1
              || hasBadVoiceover;
          })
          .map((slot) => slot.id));

        if (repairSlotIds.size > 0) {
          const repairResults = await Promise.all(slots.map(async (slot) => {
            if (!repairSlotIds.has(slot.id)) return null;
            const inputSlot = orderedSlots.find((candidate) => candidate.id === slot.id);
            if (!inputSlot) return null;
            const repaired = await repairStoryboardSlotVideoPrompt({
              userId,
              visionModel,
              slotIndex: inputSlot.index,
              currentPrompt: inputSlot.currentPrompt ?? slot.videoPrompt,
              startFrameUrl: inputSlot.startFrameUrl,
              endFrameUrl: inputSlot.endFrameUrl,
              frameRoles: inputSlot.frameRoles ?? ["start", "stop"],
              conceptDetails: inputSlot.conceptDetails ?? effectiveConceptDetails ?? null,
              storyboardGuide: inputSlot.storyboardGuide ?? input.storyboardGuide ?? null,
              voiceoverFullScript: inputSlot.voiceoverFullScript ?? suppliedVoiceoverFullScript,
              speechMode: input.speechMode,
              speechLanguage: input.speechLanguage ?? null,
              aspectRatio: inputSlot.aspectRatio ?? null,
              durationSeconds: inputSlot.durationSeconds ?? null,
              model: inputSlot.model ?? null,
              productMetadata: input.productMetadata ?? null,
              tenantId: ctx.tenantId,
              publicUrl: ctx.publicUrl ?? null,
            });
            return { slotId: slot.id, repaired };
          }));
          const repairedPromptBySlotId = new Map<string, Awaited<ReturnType<typeof repairStoryboardSlotVideoPrompt>>>();
          for (const repairResult of repairResults) {
            if (!repairResult) continue;
            repairedPromptBySlotId.set(repairResult.slotId, repairResult.repaired);
            totalPromptTokens += repairResult.repaired.promptTokens;
            totalCompletionTokens += repairResult.repaired.completionTokens;
          }
          slots = slots.map((slot) => {
            const repaired = repairedPromptBySlotId.get(slot.id);
            if (!repaired) return slot;
            const repairedPrompt = normalizeStoryboardSlotLocalImageAliases(repaired.prompt, slotPositionById.get(slot.id) ?? 0);
            const repairedVoiceoverScript = extractStoryboardNativeSpeechText(repairedPrompt);
            return {
              ...slot,
              videoPrompt: repairedPrompt,
              voiceoverScript: repairedVoiceoverScript || slot.voiceoverScript,
              qualityNotes: [
                ...slot.qualityNotes,
                "Auto-repaired from the slot's own start/end frames because the planner returned generic or duplicate prompt/dialogue content.",
              ],
            };
          });
          slots = slots.map((slot) => enforceStoryboardPlannerNativeAudio({
            slot,
            sourceSlot: sourceSlotById.get(slot.id),
            includeSound: input.includeSound,
            speechMode: input.speechMode,
            speechLanguage: input.speechLanguage ?? null,
          }));
        }
        slots = repairStoryboardPlannerVoiceoversFromSource({
          slots,
          sourceSlotById,
          speechMode: input.speechMode,
          speechLanguage: input.speechLanguage ?? null,
        });
        slots = slots.map((slot) => enforceStoryboardPlannerNativeAudio({
          slot,
          sourceSlot: sourceSlotById.get(slot.id),
          includeSound: input.includeSound,
          speechMode: input.speechMode,
          speechLanguage: input.speechLanguage ?? null,
        }));

        let optimizedPromptSlotCount = 0;
        let optimizerPromptTokens = 0;
        let optimizerCompletionTokens = 0;
        let optimizerCreditsUsed = 0;
        const overLengthPromptSlots = slots.filter(
          (slot) => slot.videoPrompt.trim().length > STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS
        );
        if (overLengthPromptSlots.length > 0) {
          console.warn("[Skills] storyboard review video prompts exceeded limit; optimizing before use", {
            maxOutputChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
            slotCount: overLengthPromptSlots.length,
            slots: overLengthPromptSlots.map((slot) => ({
              id: slot.id,
              length: slot.videoPrompt.trim().length,
            })),
          });
          const optimizedResults = await Promise.all(overLengthPromptSlots.map(async (slot) => {
            const sourcePrompt = slot.videoPrompt.trim();
            const optimizerResult = await optimizeProductReferenceStoryboardPrompt({
              tenantId: ctx.tenantId ?? "default",
              userId,
              sourcePrompt,
              originSurface: "storyboard_review",
              unitId: slot.id,
              model: visionModel,
              maxOutputChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
            });
            const slotPosition = slotPositionById.get(slot.id) ?? 0;
            const optimizedPrompt = normalizeStoryboardSlotLocalImageAliases(
              optimizerResult.value.rawContent
                .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
                .replace(/\s*```$/i, "")
                .trim(),
              slotPosition,
            );
            return {
              slotId: slot.id,
              sourceLength: sourcePrompt.length,
              optimizedPrompt,
              optimizedLength: optimizedPrompt.length,
              optimizerResult,
            };
          }));
          const optimizedPromptBySlotId = new Map(optimizedResults.map((result) => [result.slotId, result]));
          optimizedPromptSlotCount = optimizedResults.length;
          for (const result of optimizedResults) {
            optimizerPromptTokens += Number(result.optimizerResult.value.usage?.promptTokens ?? 0);
            optimizerCompletionTokens += Number(result.optimizerResult.value.usage?.completionTokens ?? 0);
            optimizerCreditsUsed += Number(result.optimizerResult.value.creditsUsed ?? 0);
          }
          slots = slots.map((slot) => {
            const optimized = optimizedPromptBySlotId.get(slot.id);
            if (!optimized) return slot;
            return {
              ...slot,
              videoPrompt: optimized.optimizedPrompt,
              qualityNotes: [
                ...slot.qualityNotes,
                `Optimized by product-reference-storyboard-prompt-optimizer from ${optimized.sourceLength} to ${optimized.optimizedLength} chars for Storyboard Review video prompt limit.`,
              ],
            };
          });
        }

        const finalNormalizedPromptCounts = new Map<string, number>();
        for (const slot of slots) {
          const normalized = normalizeStoryboardPromptForDuplicateCheck(slot.videoPrompt);
          if (normalized) {
            finalNormalizedPromptCounts.set(normalized, (finalNormalizedPromptCounts.get(normalized) ?? 0) + 1);
          }
        }
        const invalidPromptSlotIds = slots
          .filter((slot) => {
            const normalized = normalizeStoryboardPromptForDuplicateCheck(slot.videoPrompt);
            return !normalized
              || isGenericStoryboardTransitionPrompt(slot.videoPrompt)
              || (finalNormalizedPromptCounts.get(normalized) ?? 0) > 1;
          })
          .map((slot) => slot.id);
        const overLengthPromptSlotIds = slots
          .filter((slot) => slot.videoPrompt.trim().length > STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS)
          .map((slot) => slot.id);
        const finalVoiceoverCounts = buildStoryboardVoiceoverCounts(slots);
        const invalidVoiceoverSlotIds = shouldIncludeVoiceover
          ? slots
            .filter((slot) => {
              const sourceSlot = sourceSlotById.get(slot.id);
              const normalizedVoiceover = normalizeStoryboardVoiceoverForDuplicateCheck(slot.voiceoverScript);
              return !normalizedVoiceover
                || (finalVoiceoverCounts.get(normalizedVoiceover) ?? 0) > 1
                || isStoryboardVoiceoverTooShort(
                  slot.voiceoverScript,
                  sourceSlot?.durationSeconds ?? 8,
                  input.speechMode,
                  input.speechLanguage ?? null,
                );
            })
            .map((slot) => slot.id)
          : [];
        if (invalidPromptSlotIds.length > 0) {
          throw new Error(`Planner returned generic or duplicate prompts for slots: ${invalidPromptSlotIds.join(",")}`);
        }
        if (overLengthPromptSlotIds.length > 0) {
          throw new Error(`Storyboard Review prompt optimizer returned prompts over ${STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS} chars for slots: ${overLengthPromptSlotIds.join(",")}`);
        }
        if (invalidVoiceoverSlotIds.length > 0) {
          throw new Error(`Planner returned missing, duplicate, or too-short dialogue for slots: ${invalidVoiceoverSlotIds.join(",")}`);
        }

        const creditsUsed = Math.max(1, calculateCreditsForLLM(
          totalPromptTokens,
          totalCompletionTokens,
          visionModel,
        ));
        await deductCredits({
          userId,
          amount: creditsUsed,
          description: "Storyboard customer journey video prompt plan",
          skillSlug,
          sourceType: "skill",
          metadata: {
            model: visionModel,
            llmModel: visionModel,
            skill: skillSlug,
            runtimeKind: "llm",
            inputTokens: totalPromptTokens,
            outputTokens: totalCompletionTokens,
            referenceImageCount: referenceImages.length,
            slotCount: orderedSlots.length,
            repairedSlotCount: repairSlotIds.size,
            optimizedPromptSlotCount,
            optimizerInputTokens: optimizerPromptTokens,
            optimizerOutputTokens: optimizerCompletionTokens,
            optimizerCreditsUsed,
            promptMaxChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
            originSurface: "storyboard_review",
          },
        });

        return {
          success: true,
          skillId: skillSlug,
          model: visionModel,
          creditsUsed: creditsUsed + optimizerCreditsUsed,
          globalVideoStrategy: parsed.global_video_strategy ?? parsed.globalVideoStrategy ?? {},
          slots,
          voiceoverFullScript: String(parsed.voiceover_full_script ?? parsed.voiceoverFullScript ?? "") || suppliedVoiceoverFullScript,
          soundFullBrief: String(parsed.sound_full_brief ?? parsed.soundFullBrief ?? ""),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to plan storyboard video prompts",
        });
      }
    }),

  /**
   * Auto-shorten a single Storyboard Review video/motion prompt before a
   * paid single-shot video generation, mirroring the batch planner's
   * over-length handling above (`planStoryboardVideoPrompts`). Only calls the
   * optimizer LLM (and only spends credits) when the prompt actually exceeds
   * `STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS`; otherwise it is a no-op that
   * returns the prompt unchanged.
   */
  optimizeStoryboardReviewVideoPrompt: protectedProcedure
    .input(z.object({
      prompt: z.string().trim().min(1).max(STORYBOARD_REVIEW_PLANNER_INPUT_TEXT_MAX_CHARS),
      unitId: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const sourcePrompt = input.prompt.trim();
      if (sourcePrompt.length <= STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS) {
        return {
          prompt: sourcePrompt,
          optimized: false,
          sourceLength: sourcePrompt.length,
          optimizedLength: sourcePrompt.length,
          maxChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
        };
      }

      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits" });
      }

      const visionModel = resolveVisionModelId(await getVisionModelOptions(), null);
      if (!visionModel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No enabled vision model configured",
        });
      }

      try {
        const optimizerResult = await optimizeProductReferenceStoryboardPrompt({
          tenantId: ctx.tenantId ?? "default",
          userId,
          sourcePrompt,
          originSurface: "storyboard_review",
          unitId: input.unitId,
          model: visionModel,
          maxOutputChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
        });
        const optimizedPrompt = normalizeStoryboardSlotLocalImageAliases(
          optimizerResult.value.rawContent
            .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim(),
          0,
        );
        return {
          prompt: optimizedPrompt || sourcePrompt,
          optimized: Boolean(optimizedPrompt),
          sourceLength: sourcePrompt.length,
          optimizedLength: (optimizedPrompt || sourcePrompt).length,
          maxChars: STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to optimize storyboard review video prompt",
        });
      }
    }),

  /**
   * Enhance prompt using CreateImagePrompt skill with LLM
   * This procedure:
   * 1. Builds the system and user prompts
   * 2. Calls the LLM (with vision for reference images)
   * 3. Parses the response and returns the enhanced prompt
   */
  enhancePrompt: protectedProcedure
    .input(promptEnhancementRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Check if user has enough credits
      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient credits",
        });
      }

      try {
        // DEBUG: Log maxPromptLength to verify it's being passed
        console.log(`[Skills] enhancePrompt called with maxPromptLength: ${input.maxPromptLength}`);
        const { resolvedSkillId, skillName } = resolvePromptEnhancementSkill(input.skillId);

        // Build prompts using the selected prompt skill
        const systemPrompt = buildSystemPrompt(input);
        const userPrompt = buildUserPrompt(input);

        // Call LLM with vision support
        // Feature 041: When no model explicitly selected, use skill execution policy
        let visionModel: string | null = null;
        const requestedModel = typeof input.model === "string" && !input.model.startsWith("__auto")
          ? input.model
          : null;
        if (requestedModel) {
          // User explicitly selected a model — use it
          visionModel = resolveVisionModelId(await getVisionModelOptions(), requestedModel);
        } else {
          // Auto mode: try skill execution policy first (capability-aware selection)
          const skill = getSkillByIdOrType(resolvedSkillId);
          if (skill) {
            try {
              const policy = await resolveSkillExecutionPolicy({ skill });
              if (policy.modelId) {
                visionModel = policy.modelId;
              }
            } catch {
              // Policy resolution failed — fall through to vision model fallback
            }
          }
          // Fallback: use default vision model
          if (!visionModel) {
            visionModel = resolveVisionModelId(await getVisionModelOptions(), null);
          }
        }
        if (!visionModel) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No enabled vision model configured",
          });
        }
        const runtimeProvider = await getProviderForModel(visionModel);

        // Calculate max tokens from the requested character budget and language hint.
        // This keeps the completion budget aligned with the selected media model limit.
        const maxCharLength = input.maxPromptLength || 5000;
        const promptLanguageHint = resolvePromptLanguageHintFromInputs(input as unknown as Record<string, unknown>);
        const promptLengthPlan = buildPromptLengthPlan(maxCharLength, promptLanguageHint)
          ?? buildPromptLengthPlan(5000, promptLanguageHint)!;
        const execution = await executeSharedSkillTextRuntime({
          tenantId: ctx.tenantId ?? "default",
          userId,
          objective: `Enhance prompt with skill '${resolvedSkillId}' for Media Studio while respecting the prompt length budget.`,
          originSurface: input.originSurface ?? "media_studio",
          entryPoint: "enhance_prompt",
          requestLabel: `enhance_prompt:${resolvedSkillId}`,
          skillSlugs: [resolvedSkillId],
          systemPrompt,
          userPrompt,
          referenceImages: input.referenceImages || [],
          schemaHint: {
            name: "prompt_enhancement_text_output",
            validationMode: "text_output",
          },
          planContext: {
            skillId: resolvedSkillId,
            skillName,
            maxPromptLength: input.maxPromptLength ?? null,
          },
          modelConfig: buildRuntimeModelConfig({
            modelId: visionModel,
            providerId: runtimeProvider?.providerId ?? null,
            gatewayRouteId: null,
            resolvedGatewayModelId: visionModel,
          }),
          legacyExecute: async () => {
            const result = await callLLMWithVision(
              systemPrompt,
              userPrompt,
              userId,
              input.referenceImages || [],
              visionModel,
              promptLengthPlan.maxTokens,
              {
                tenantId: ctx.tenantId,
                publicUrl: ctx.publicUrl ?? null,
              }
            );

            const creditsUsed = calculateCreditsForLLM(
              result.usage.promptTokens,
              result.usage.completionTokens,
              visionModel
            );

            await deductCredits({
              userId,
              amount: creditsUsed,
              description: `Auto Prompt enhancement (${skillName})`,
              skillSlug: resolvedSkillId,
              sourceType: "skill",
              metadata: {
                model: visionModel,
                llmModel: visionModel,
                skill: resolvedSkillId,
                skillName,
                runtimeKind: "llm",
                inputTokens: result.usage.promptTokens,
                outputTokens: result.usage.completionTokens,
                hasReferenceImages: (input.referenceImages?.length || 0) > 0,
                referenceImageCount: input.referenceImages?.length || 0,
                ...(input.originSurface ? { originSurface: input.originSurface } : {}),
              },
            });

            return {
              rawContent: result.content,
              usage: result.usage,
              creditsUsed,
              providerName: runtimeProvider?.providerName ?? null,
              modelId: visionModel,
              rawResponse: result.rawResponse,
            };
          },
        });
        const result = execution.value;

        // Check if LLM refused the request (safety filter)
        const refusalPatterns = [
          /I'm sorry/i,
          /I cannot/i,
          /I can't/i,
          /I am not able to/i,
          /I won't be able to/i,
          /I apologize/i,
          /against my guidelines/i,
          /inappropriate/i,
          /not appropriate/i,
        ];

        const isRefusal = refusalPatterns.some(pattern => pattern.test(result.rawContent));

        if (isRefusal) {
          console.warn("[Skills] LLM refused prompt enhancement:", result.rawContent.substring(0, 200));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to generate prompt. Please try with different text or images.",
          });
        }

        // Parse the response to extract prompts
        const parsed = parsePromptResponse(result.rawContent);

        // HARD LIMIT ENFORCEMENT: Truncate prompt if it exceeds maxPromptLength
        // LLMs don't always follow character limit instructions strictly,
        // so we enforce the limit server-side as a safety net
        let finalPromptEn = parsed.promptEn;
        let finalPromptTh = parsed.promptTh;
        let wasTruncated = false;

        if (input.maxPromptLength && finalPromptEn.length > input.maxPromptLength) {
          console.warn(
            `[Skills] Prompt exceeded limit: ${finalPromptEn.length}/${input.maxPromptLength} chars - truncating`
          );
          const truncatedPrompt = truncateToPromptLength(finalPromptEn, input.maxPromptLength);
          finalPromptEn = truncatedPrompt.text;
          wasTruncated = truncatedPrompt.wasTruncated;
        }

        // Also truncate Thai prompt if provided
        if (input.maxPromptLength && finalPromptTh && finalPromptTh.length > input.maxPromptLength) {
          const truncatedPrompt = truncateToPromptLength(finalPromptTh, input.maxPromptLength);
          finalPromptTh = truncatedPrompt.text;
          wasTruncated = wasTruncated || truncatedPrompt.wasTruncated;
        }

        return {
          success: true,
          promptEn: finalPromptEn,
          promptTh: finalPromptTh,
          wasTruncated,
          creditsUsed: result.creditsUsed,
          usage: result.usage,
          skillId: resolvedSkillId,
          runtime: execution.runtime,
        };
      } catch (error) {
        console.error("[Skills] enhancePrompt error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to enhance prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Parse LLM response to extract prompts
  parsePromptResponse: protectedProcedure
    .input(
      z.object({
        response: z.string().min(1),
      })
    )
    .mutation(({ input }) => {
      const result = parsePromptResponse(input.response);
      return {
        success: true,
        ...result,
      };
    }),

  /**
   * Execute a custom skill with LLM using skill's content as system prompt
   * This is for skills that need their skill.md content to guide the LLM
   * (not for media-generation skills which are auto-executed)
   */
  executeCustomSkill: protectedProcedure
    .input(
      z.object({
        skillId: z.string().min(1),
        userInputs: z.record(z.any()), // Dynamic form values
        model: z.string().optional(),
        referenceImages: z.array(z.string()).max(20).optional(),
        originSurface: z.enum(["media_studio"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      // Check credits
      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient credits",
        });
      }

      // Sync skill if contentHash changed (ensures latest skill.md is used)
      const syncResult = await syncSingleSkillIfChanged(input.skillId);
      if (syncResult.synced) {
        // Skill was auto-synced before execution
      }

      // Get skill from database
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          skillContent: skills.skillContent,
          systemPrompt: skills.systemPrompt,
          folderPath: skills.folderPath,
          category: skills.category,
          llmModelId: skills.llmModelId,
          defaultModel: skills.defaultModel,
          preferredProviderId: skills.preferredProviderId,
          strictProviderPin: skills.strictProviderPin,
          executionMode: skills.executionMode,
          executionPolicyJson: skills.executionPolicyJson,
        })
        .from(skills)
        .where(and(eq(skills.slug, input.skillId), eq(skills.isEnabled, true)))
        .limit(1);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      // Try to load prompt template from prompts/ directory first
      let systemPrompt = skill.skillContent || skill.systemPrompt;

      if (skill.folderPath) {
        // Check for prompt template files in prompts/ directory
        const possiblePromptPaths = [
          path.resolve(process.cwd(), skill.folderPath, 'prompts', 'storyboard.prompt.md'),
          path.resolve(process.cwd(), skill.folderPath, 'prompts', 'prompt.md'),
          path.resolve(process.cwd(), skill.folderPath, 'prompts', `${skill.slug}.prompt.md`),
        ];

        for (const promptPath of possiblePromptPaths) {
          if (fs.existsSync(promptPath)) {
            try {
              systemPrompt = fs.readFileSync(promptPath, 'utf-8');
              break;
            } catch (error) {
              console.warn(`[Skills] Failed to read prompt template at ${promptPath}:`, error);
            }
          }
        }
      }

      if (!systemPrompt && skill.executionMode !== "python") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.skillId}' has no content to execute`,
        });
      }

      // Merge user inputs with schema defaults, and drop null/empty placeholders
      const sanitizedUserInputs = sanitizeUserInputs(input.userInputs);
      const schemaDefaults = loadSkillInputDefaults(skill.slug, skill.folderPath);
      let mergedUserInputs = {
        ...schemaDefaults,
        ...sanitizedUserInputs,
      };
      const preparedPromptPackageInputs = prepareSkillExecutionInputsForPromptPackage(
        input.skillId,
        mergedUserInputs,
      );
      mergedUserInputs = preparedPromptPackageInputs.userInputs;
      const isMultiPromptPackage = preparedPromptPackageInputs.suppressPromptLengthPlan;
      const promptPackageMode = preparedPromptPackageInputs.promptPackageMode;

      const requestedMaxPromptLength = Number(mergedUserInputs.maxPromptLength);
      const requestedPositiveMaxPromptLength =
        Number.isFinite(requestedMaxPromptLength) && requestedMaxPromptLength > 0
          ? requestedMaxPromptLength
          : 0;
      const effectiveMaxPromptLength =
        input.skillId === PRODUCT_REFERENCE_STORYBOARD_SKILL_ID
          ? Math.min(
              requestedPositiveMaxPromptLength || PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS,
              PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS
            )
          : requestedPositiveMaxPromptLength;
      const promptLengthPlan = effectiveMaxPromptLength > 0
        ? buildPromptLengthPlan(effectiveMaxPromptLength, resolvePromptLanguageHintFromInputs(mergedUserInputs))
        : null;

      if (input.skillId === PRODUCT_REFERENCE_STORYBOARD_SKILL_ID) {
        if (!mergedUserInputs.product_detail) {
          mergedUserInputs.product_detail =
            mergedUserInputs.production_concept_details ||
            mergedUserInputs.product_title ||
            mergedUserInputs.storyboard_guide ||
            mergedUserInputs.prompt ||
            mergedUserInputs.userIdea ||
            "Product details are provided by the attached product reference image.";
        }
        if (!mergedUserInputs.production_concept_details) {
          mergedUserInputs.production_concept_details = mergedUserInputs.product_detail;
        }
        const productReferenceResult = await runProductReferenceStoryboardPromptSkill({
          tenantId: ctx.tenantId ?? "default",
          userId,
          userInputs: mergedUserInputs,
          referenceImages: input.referenceImages || [],
          model: input.model ?? null,
          maxOutputChars: promptLengthPlan?.maxPromptLength ?? PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS,
          publicUrl: ctx.publicUrl ?? null,
          originSurface: input.originSurface ?? "media_studio",
        });

        return {
          success: true,
          content: productReferenceResult.rawOutput.trim(),
          skillId: input.skillId,
          skillName: skill.name,
          creditsUsed: productReferenceResult.creditsUsed,
          usage: productReferenceResult.usage,
          wasTruncated: false,
          runtime: productReferenceResult.runtime,
        };
      }

      if (skill.executionMode === "python") {
        const preparedPromptSkillExecution = prepareMediaStudioPythonPromptSkillExecution({
          skillSlug: skill.slug,
          folderPath: skill.folderPath,
          userInputs: mergedUserInputs,
          referenceImages: input.referenceImages || [],
          originSurface: input.originSurface ?? null,
        });
        const rawPythonContent = await executeCustomPythonSkillText({
          skillSlug: skill.slug,
          folderPath: skill.folderPath,
          prompt: String(preparedPromptSkillExecution.userInputs.topic || preparedPromptSkillExecution.userInputs.prompt || preparedPromptSkillExecution.userInputs.request || ""),
          userInputs: preparedPromptSkillExecution.userInputs,
          context: preparedPromptSkillExecution.context,
          publicUrl: ctx.publicUrl ?? null,
          userToken: ctx.userToken ?? null,
        });
        const structuredPromptExtraction = preparedPromptSkillExecution.extractStructuredPrompt
          ? extractStructuredPromptBundleTextOutput(rawPythonContent, preparedPromptSkillExecution.textPromptField)
          : null;
        const fallbackStructuredPromptExtraction = structuredPromptExtraction?.promptText
          ? null
          : extractStructuredPromptBundleTextOutput(rawPythonContent, preparedPromptSkillExecution.textPromptField);
        let processedContent = structuredPromptExtraction?.promptText
          || fallbackStructuredPromptExtraction?.promptText
          || rawPythonContent;
        let wasTruncated = false;
        if (promptLengthPlan) {
          const truncated = truncateToPromptLength(processedContent, promptLengthPlan.maxPromptLength);
          processedContent = truncated.text;
          wasTruncated = truncated.wasTruncated;
        }

        await deductCredits({
          userId,
          amount: 1,
          description: `Skill execution: ${skill.name}`,
          skillSlug: input.skillId,
          sourceType: "skill",
          metadata: {
            skill: input.skillId,
            skillName: skill.name,
            executionMode: skill.executionMode,
            runtimeKind: "python",
            llmModel: "none",
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        return {
          success: true,
          content: processedContent,
          skillId: input.skillId,
          skillName: skill.name,
          creditsUsed: 1,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
          },
          wasTruncated,
          ...(structuredPromptExtraction?.reviewSummary ? { promptReview: structuredPromptExtraction.reviewSummary } : {}),
          runtime: {
            mode: "python",
            source: "native_skill",
            ...(preparedPromptSkillExecution.extractStructuredPrompt ? { structuredReview: true } : {}),
          },
        };
      }

      // Substitute template variables with actual values
      if (!systemPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.skillId}' has no content to execute`,
        });
      }
      systemPrompt = appendProductReferenceStoryboardCategoryRules(systemPrompt, {
        skillSlug: skill.slug,
        folderPath: skill.folderPath,
        userInputs: mergedUserInputs,
      });
      systemPrompt = substituteTemplateVariables(systemPrompt, mergedUserInputs);
      if (promptLengthPlan) {
        systemPrompt = `${systemPrompt}\n\n${promptLengthPlan.directive}`;
      }

        const referenceImageCount = Array.isArray(input.referenceImages) ? input.referenceImages.length : 0;
        let userPrompt = buildCustomSkillUserPrompt(mergedUserInputs, { referenceImageCount });
        const nativeSkillRuntime = buildNativeSkillRuntimePlanContext(
          {
            id: skill.slug,
            slug: skill.slug,
            folderPath: skill.folderPath ?? null,
            nativeBundlePath: (skill as Record<string, unknown>).nativeBundlePath as string | null | undefined,
            nativeBundleReady: (skill as Record<string, unknown>).nativeBundleReady as boolean | null | undefined,
          },
          {
            requestedSubagent:
              typeof mergedUserInputs.requestedSubagent === "string"
                ? mergedUserInputs.requestedSubagent
                : typeof mergedUserInputs.requested_subagent === "string"
                  ? mergedUserInputs.requested_subagent
                  : null,
            taskHint: `Execute custom skill '${input.skillId}' for Media Studio.`,
          },
        );

      try {
        const requestedModel = typeof input.model === "string" && !input.model.startsWith("__auto")
          ? input.model
          : null;
        let visionModel: string | null = null;
        const executionPolicy = skill.executionPolicyJson && typeof skill.executionPolicyJson === "object"
          ? skill.executionPolicyJson as Record<string, unknown>
          : null;
        const requiresPolicyMatchedModel = executionPolicy?.mode === "requirements"
          && executionPolicy?.fallbackPolicy === "error";
        try {
          const policy = await resolveSkillExecutionPolicy({
            skill: {
              id: skill.slug,
              name: skill.name,
              description: "",
              icon: "sparkles",
              type: "chat-assistant",
              triggers: [],
              requiresExplicit: false,
              creditMultiplier: 1,
              enabledByDefault: true,
              priority: 50,
              llmModelId: skill.llmModelId ?? undefined,
              defaultModel: skill.defaultModel ?? undefined,
              preferredProviderId: skill.preferredProviderId ?? undefined,
              strictProviderPin: skill.strictProviderPin ?? undefined,
              executionPolicy: skill.executionPolicyJson ?? undefined,
            } as SkillDefinition,
            conversationModel: requestedModel,
          });
          visionModel = policy.modelId;
          if (!visionModel && requiresPolicyMatchedModel) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `No enabled LLM model satisfies the execution policy for skill '${input.skillId}'`,
            });
          }
        } catch (policyError) {
          if (policyError instanceof TRPCError) {
            throw policyError;
          }
          console.warn("[Skills] Skill execution policy resolution failed; falling back to vision model resolver:", policyError);
        }
        if (!visionModel) {
          visionModel = resolveVisionModelId(
            await getVisionModelOptions(),
            requestedModel || skill.defaultModel || null,
          );
        }
        if (!visionModel) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No enabled vision model configured",
          });
        }
        const runtimeProvider = await getProviderForModel(visionModel);

        // Check if skill requires web search grounding
        let webSearchOptions: { extraBodyParams?: Record<string, unknown>; systemPromptSuffix?: string } | undefined;
        let requiresWebSearch = false;

        if (skill.folderPath) {
          const skillMdPath = path.resolve(process.cwd(), skill.folderPath, "skill.md");
          if (fs.existsSync(skillMdPath)) {
            try {
              const rawMd = fs.readFileSync(skillMdPath, "utf-8");
              const parsedMd = parseSkillFile(rawMd);
              const execPolicy = (parsedMd.metadata as any).execution_policy;
              requiresWebSearch = execPolicy?.requires_web_search === true;
            } catch { /* non-critical */ }
          }
        }

        if (requiresWebSearch) {
          if (runtimeProvider) {
            const { detectProviderFamily, buildWebSearchParams } = await import("../services/webSearchToolInjector");
            const family = detectProviderFamily(runtimeProvider.providerName);
            const searchParams = buildWebSearchParams(family);
            webSearchOptions = {
              extraBodyParams: searchParams.bodyParams,
              systemPromptSuffix: searchParams.systemPromptSuffix,
            };
          }
        }

        const execution = await executeSharedSkillTextRuntime({
          tenantId: ctx.tenantId ?? "default",
          userId,
          objective: `Execute custom skill '${input.skillId}' for Media Studio and preserve the caller's prompt contract.`,
          originSurface: input.originSurface ?? "media_studio",
          entryPoint: "execute_custom_skill",
          requestLabel: `execute_custom_skill:${input.skillId}`,
          skillSlugs: [input.skillId],
          systemPrompt,
          userPrompt,
          dynamicParams: mergedUserInputs,
          referenceImages: input.referenceImages || [],
          publicUrl: ctx.publicUrl ?? null,
          schemaHint: {
            name: "custom_skill_text_output",
            validationMode: "text_output",
          },
          planContext: {
            skillId: input.skillId,
            skillName: skill.name,
            responseMode: mergedUserInputs.response_mode ?? null,
            requiresWebSearch,
            maxPromptLength: promptLengthPlan?.maxPromptLength ?? null,
            ...(isMultiPromptPackage ? { multiPromptPackage: true, promptPackageMode } : {}),
            nativeSkillRuntime,
          },
          modelConfig: buildRuntimeModelConfig({
            modelId: visionModel,
            providerId: runtimeProvider?.providerId ?? null,
            gatewayRouteId: null,
            resolvedGatewayModelId: visionModel,
          }),
          legacyExecute: async () => {
            const result = await callLLMWithVision(
              systemPrompt,
              userPrompt,
              userId,
              input.referenceImages || [],
              visionModel,
              promptLengthPlan?.maxTokens ?? (isMultiPromptPackage ? 9000 : 4000),
              {
                ...webSearchOptions,
                tenantId: ctx.tenantId,
                publicUrl: ctx.publicUrl ?? null,
              },
            );

            const creditsUsed = calculateCreditsForLLM(
              result.usage.promptTokens,
              result.usage.completionTokens,
              visionModel
            );

            await deductCredits({
              userId,
              amount: creditsUsed,
              description: `Skill execution: ${skill.name}`,
              skillSlug: input.skillId,
              sourceType: "skill",
              metadata: {
                model: visionModel,
                llmModel: visionModel,
                skill: input.skillId,
                skillName: skill.name,
                executionMode: skill.executionMode,
                runtimeKind: "llm",
                inputTokens: result.usage.promptTokens,
                outputTokens: result.usage.completionTokens,
                ...(input.originSurface ? { originSurface: input.originSurface } : {}),
              },
            });

            return {
              rawContent: result.content,
              usage: result.usage,
              creditsUsed,
              providerName: runtimeProvider?.providerName ?? null,
              modelId: visionModel,
              rawResponse: result.rawResponse,
            };
          },
        });
        const result = execution.value;
        let finalUsage = result.usage;
        let finalCreditsUsed = result.creditsUsed;

        // Post-process CMS output if response_mode is cms_json
        const responseMode = mergedUserInputs.response_mode as string | undefined;
        let processedContent = result.rawContent;
        let qualityReport: Record<string, unknown> | undefined;
        let promptReview: Record<string, unknown> | undefined;

        if (responseMode === "cms_json" && skill.category) {
          try {
            const outputFormat = determineCmsFormat(skill.category);
            if (outputFormat !== "markdown") {
              // Load content_quality from skill frontmatter
              let contentQuality: Record<string, unknown> | undefined;
              if (skill.folderPath) {
                const skillMdPath = path.resolve(process.cwd(), skill.folderPath, "skill.md");
                if (fs.existsSync(skillMdPath)) {
                  const rawMd = fs.readFileSync(skillMdPath, "utf-8");
                  const parsedMd = parseSkillFile(rawMd);
                  contentQuality = (parsedMd.metadata as any).content_quality;
                }
              }

              // Extract citations from raw LLM response if web search was used
              let extractedCitations: any[] | undefined;
              if (requiresWebSearch && result.rawResponse) {
                try {
                  const { extractCitationsFromResponse } = await import("../services/citationExtractor");
                  const { detectProviderFamily: detectFamily } = await import("../services/webSearchToolInjector");
                  const providerObj = await getProviderForModel(visionModel);
                  const family = providerObj ? detectFamily(providerObj.providerName) : "other";
                  if (family !== "other") {
                    extractedCitations = extractCitationsFromResponse(result.rawResponse, family as "openai" | "gemini" | "anthropic" | "kimi");
                  }
                } catch { /* non-critical */ }
              }

              const { processContentOutput } = await import("../services/contentOutputProcessor");
              const processed = processContentOutput({
                llmOutput: result.rawContent,
                outputFormat,
                skillSlug: input.skillId,
                contentQuality: contentQuality as any,
                ...(extractedCitations?.length ? { extractedCitations } : {}),
              });

              processedContent = typeof processed.content === "string"
                ? processed.content
                : JSON.stringify(processed.content, null, 2);
              qualityReport = processed.quality as unknown as Record<string, unknown>;

              // Save artifact if quality gate passed
              if (processed.quality.quality_gate_passed) {
                try {
                  const { saveArtifact } = await import("../services/contentArtifactStore");
                  await saveArtifact({
                    tenantId: ctx.tenantId ?? "default",
                    userId,
                    skillSlug: input.skillId,
                    outputFormat,
                    contentJson: processed.content,
                    qualityScore: processed.quality,
                    refreshCadenceDays: contentQuality?.refresh_cadence_days as number | undefined,
                  });
                } catch (artifactError) {
                  console.warn("[Skills] Failed to save content artifact:", artifactError);
                }
              }
            }
          } catch (processingError) {
            console.warn("[Skills] CMS post-processing failed, returning raw content:", processingError);
          }
        }

        if (input.originSurface === "media_studio" && responseMode !== "cms_json") {
          const structuredPromptExtraction = extractStructuredPromptBundleTextOutput(
            processedContent,
            typeof mergedUserInputs.text_prompt_field === "string" ? mergedUserInputs.text_prompt_field : "detailed",
          );
          if (structuredPromptExtraction.promptText) {
            processedContent = structuredPromptExtraction.promptText;
          }
          if (structuredPromptExtraction.reviewSummary) {
            promptReview = structuredPromptExtraction.reviewSummary as unknown as Record<string, unknown>;
          }
        }

        let wasTruncated = false;
        const isAudioFirstStoryboard = isAudioFirstStoryboardPromptPackage(input.skillId, mergedUserInputs);
        const audioFirstFallbackSharedSections = buildAudioFirstStoryboardSharedSectionsFallback({
          skillId: input.skillId,
          userInputs: mergedUserInputs,
          referenceImageCount: input.referenceImages?.length ?? 0,
        });
        const audioFirstSharedSections = isAudioFirstStoryboard
          ? shouldUseAudioFirstStoryboardSharedSectionsFallback({
              skillId: input.skillId,
              userInputs: mergedUserInputs,
              referenceImageCount: input.referenceImages?.length ?? 0,
            })
            ? audioFirstFallbackSharedSections
            : extractStoryboardSharedSections(processedContent) || audioFirstFallbackSharedSections
          : "";
        const promptBlocksForAudioFirstRepair = isAudioFirstStoryboard
          ? stripSharedSectionsFromPromptBlocks(processedContent)
          : processedContent;
        if (isAudioFirstStoryboard) {
          processedContent = mergeSharedSectionsWithPromptBlocks(
            audioFirstSharedSections,
            sanitizeAudioFirstStoryboardPromptBlocks(promptBlocksForAudioFirstRepair),
          );
        }
        const audioFirstRepair = resolveAudioFirstStoryboardPromptRepair({
          skillId: input.skillId,
          userInputs: mergedUserInputs,
          content: promptBlocksForAudioFirstRepair,
          referenceImageCount: input.referenceImages?.length ?? 0,
        });
        if (audioFirstRepair) {
          try {
            console.warn(
              `[Skills] Audio-first storyboard repair needed (${audioFirstRepair.reason}): ${audioFirstRepair.actualPromptCount}/${audioFirstRepair.expectedPromptCount} prompts.`,
            );
            const repairResult = await callLLMWithVision(
              [
                "You repair incomplete Media Studio video storyboard prompt packages.",
                "Return only the corrected prompt blocks requested by the user.",
                "No markdown fences, no explanations, no shared notes unless explicitly requested.",
              ].join("\n"),
              buildAudioFirstStoryboardRepairPrompt({
                userInputs: mergedUserInputs,
                previousContent: promptBlocksForAudioFirstRepair,
                ...audioFirstRepair,
              }),
              userId,
              input.referenceImages || [],
              visionModel,
              Math.max(6000, Math.min(16000, audioFirstRepair.expectedPromptCount * 900)),
              {
                ...webSearchOptions,
                tenantId: ctx.tenantId,
                publicUrl: ctx.publicUrl ?? null,
              },
            );
            const repairedPromptCount = countStoryboardPromptBlocks(repairResult.content);
            if (repairedPromptCount >= audioFirstRepair.expectedPromptCount) {
              processedContent = mergeSharedSectionsWithPromptBlocks(
                audioFirstSharedSections,
                sanitizeAudioFirstStoryboardPromptBlocks(stripSharedSectionsFromPromptBlocks(repairResult.content)),
              );
            } else {
              console.warn(
                `[Skills] Audio-first storyboard repair still returned ${repairedPromptCount}/${audioFirstRepair.expectedPromptCount} prompts; keeping original output.`,
              );
            }
          } catch (repairError) {
            console.warn("[Skills] Audio-first storyboard repair failed; keeping original output:", repairError);
          }
        }

        const initialProductVoiceoverDialogueQuality = evaluateElevenLabsProductVoiceoverDialogueQuality(processedContent, input.skillId, mergedUserInputs);
        let productVoiceoverDialogueRepairAttempts = 0;
        let productVoiceoverDialogueQuality = initialProductVoiceoverDialogueQuality;
        while (!productVoiceoverDialogueQuality.passed && productVoiceoverDialogueRepairAttempts < 2) {
          productVoiceoverDialogueRepairAttempts += 1;
          try {
            const repairResult = await callLLMWithVision(
              [
                "You are a strict final-quality reviewer and repair editor for ElevenLabs dialogue ads.",
                "You repair only the provided dialogue according to the user's product inputs and the listed quality issues.",
                "Return only the corrected dialogue. No markdown fences, no explanations.",
              ].join("\n"),
              buildElevenLabsProductVoiceoverDialogueRepairPrompt({
                previousContent: processedContent,
                issues: productVoiceoverDialogueQuality.issues,
                userInputs: mergedUserInputs,
              }),
              userId,
              input.referenceImages || [],
              visionModel,
              resolveElevenLabsProductVoiceoverDialogueRepairMaxTokens(mergedUserInputs),
              {
                ...webSearchOptions,
                tenantId: ctx.tenantId,
                publicUrl: ctx.publicUrl ?? null,
              },
            );
            const repairedContent = repairResult.content.trim();
            const repairedQuality = evaluateElevenLabsProductVoiceoverDialogueQuality(repairedContent, input.skillId, mergedUserInputs);
            processedContent = repairedContent;
            productVoiceoverDialogueQuality = repairedQuality;
          } catch (repairError) {
            console.warn("[Skills] ElevenLabs product voiceover dialogue quality repair failed; keeping current output:", repairError);
            break;
          }
        }
        processedContent = normalizeElevenLabsProductVoiceoverDialogueOutput(processedContent, input.skillId, mergedUserInputs);

        if (promptLengthPlan && responseMode !== "cms_json") {
          const originalLength = processedContent.length;
          if (
            input.skillId === PRODUCT_REFERENCE_STORYBOARD_SKILL_ID &&
            originalLength > promptLengthPlan.maxPromptLength
          ) {
            console.warn(
              `[Skills] product-reference-storyboard output exceeded limit; optimizing before use: ${originalLength}/${promptLengthPlan.maxPromptLength} chars`,
            );
            const optimizerResult = await optimizeProductReferenceStoryboardPrompt({
              tenantId: ctx.tenantId ?? "default",
              userId,
              sourcePrompt: processedContent,
              originSurface: input.originSurface ?? "media_studio",
              model: input.model ?? null,
              maxOutputChars: promptLengthPlan.maxPromptLength,
            });
            processedContent = optimizerResult.value.rawContent.trim();
            finalUsage = {
              promptTokens:
                Number(result.usage?.promptTokens ?? 0) +
                Number(optimizerResult.value.usage?.promptTokens ?? 0),
              completionTokens:
                Number(result.usage?.completionTokens ?? 0) +
                Number(optimizerResult.value.usage?.completionTokens ?? 0),
            };
            finalCreditsUsed =
              Number(result.creditsUsed ?? 0) +
              Number(optimizerResult.value.creditsUsed ?? 0);
            if (processedContent.length > promptLengthPlan.maxPromptLength) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `product-reference-storyboard prompt optimizer returned ${processedContent.length}/${promptLengthPlan.maxPromptLength} chars`,
              });
            }
          } else {
            const truncated = truncateToPromptLength(processedContent, promptLengthPlan.maxPromptLength);
            processedContent = truncated.text;
            wasTruncated = truncated.wasTruncated;
            if (truncated.wasTruncated) {
              console.warn(
                `[Skills] Custom skill output exceeded limit: ${originalLength}/${promptLengthPlan.maxPromptLength} chars`,
              );
            }
          }
        }

        return {
          success: true,
          content: processedContent,
          skillId: input.skillId,
          skillName: skill.name,
          creditsUsed: finalCreditsUsed,
          usage: finalUsage,
          wasTruncated,
          ...(qualityReport ? { qualityReport } : {}),
          ...(promptReview ? { promptReview } : {}),
          runtime: execution.runtime,
        };
      } catch (error) {
        console.error("[Skills] executeCustomSkill error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to execute skill: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // List editable skills (skills with skill files)
  listEditable: adminProcedure.query(async () => {
    const skills = await getAvailableSkillsAsync();
    const editableSkills = skills.filter((s) => s.skillFilePath);

    return editableSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      type: skill.type,
      skillFilePath: skill.skillFilePath,
    }));
  }),

  // Preview model resolution for a skill (admin diagnostic)
  previewModelResolution: adminProcedure
    .input(z.object({
      skillId: z.number().int(),
      conversationModel: z.string().optional(),
    }))
    .query(async ({ input }) => {
      // Load skill from DB
      const [skill] = await db
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          llmModelId: skills.llmModelId,
          defaultModel: skills.defaultModel,
          preferredProviderId: skills.preferredProviderId,
          strictProviderPin: skills.strictProviderPin,
          executionPolicyJson: skills.executionPolicyJson,
        })
        .from(skills)
        .where(eq(skills.id, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill ${input.skillId} not found`,
        });
      }

      // Build a SkillDefinition-compatible shape for the resolver
      const skillDef = {
        llmModelId: skill.llmModelId ?? undefined,
        defaultModel: skill.defaultModel ?? undefined,
        preferredProviderId: skill.preferredProviderId ?? undefined,
        strictProviderPin: skill.strictProviderPin ?? false,
        executionPolicy: skill.executionPolicyJson ?? undefined,
      };

      // resolveSkillExecutionPolicy loads rows internally; we call loadEnabledLlmModelRows
      // separately just for availableModelCount. This is a preview endpoint, double-load is fine.
      const [result, rows] = await Promise.all([
        resolveSkillExecutionPolicy({
          skill: skillDef as any,
          conversationModel: input.conversationModel,
        }),
        loadEnabledLlmModelRows(),
      ]);

      return {
        modelId: result.modelId,
        modelSource: result.modelSource,
        matchedCapabilities: result.matchedCapabilities ?? [],
        requirementsFallback: result.requirementsFallback ?? false,
        availableModelCount: rows.length,
      };
    }),

  // Get skill reference files (for skills with references directory)
  getSkillReferences: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Get references directory
      const skillDir = path.dirname(skill.skillFilePath);
      const refsDir = path.join(skillDir, "references");

      try {
        // Try both possible paths
        let fullRefsDir = path.resolve(process.cwd(), "..", refsDir);
        if (!fs.existsSync(fullRefsDir)) {
          fullRefsDir = path.resolve(process.cwd(), refsDir);
        }

        if (!fs.existsSync(fullRefsDir)) {
          return { references: [] };
        }

        const files = fs.readdirSync(fullRefsDir);
        const references = files
          .filter((f) => f.endsWith(".md"))
          .map((f) => ({
            name: f.replace(".md", ""),
            fileName: f,
            path: path.join(refsDir, f),
          }));

        return { references };
      } catch (error) {
        return { references: [] };
      }
    }),

  // Get skill reference file content
  getSkillReferenceFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        fileName: z.string(),
      })
    )
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Validate filename to prevent path traversal
      if (input.fileName.includes("..") || input.fileName.includes("/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file name",
        });
      }

      const skillDir = path.dirname(skill.skillFilePath);
      const refPath = path.join(skillDir, "references", input.fileName);

      try {
        // Try both possible paths
        let fullPath = path.resolve(process.cwd(), "..", refPath);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(process.cwd(), refPath);
        }

        if (!fs.existsSync(fullPath)) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Reference file '${input.fileName}' not found`,
          });
        }

        const content = fs.readFileSync(fullPath, "utf-8");

        return {
          fileName: input.fileName,
          content,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to read reference file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Update skill reference file content
  updateSkillReferenceFile: adminProcedure
    .input(
      z.object({
        id: z.string(),
        fileName: z.string(),
        content: z.string().min(1).max(100000),
      })
    )
    .mutation(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill || !skill.skillFilePath) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.id}' not found or has no skill file`,
        });
      }

      // Validate filename to prevent path traversal
      if (input.fileName.includes("..") || input.fileName.includes("/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid file name",
        });
      }

      const skillDir = path.dirname(skill.skillFilePath);
      const refPath = path.join(skillDir, "references", input.fileName);

      try {
        // Try both possible paths
        let fullPath = path.resolve(process.cwd(), "..", refPath);
        if (!fs.existsSync(path.dirname(fullPath))) {
          fullPath = path.resolve(process.cwd(), refPath);
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, input.content, "utf-8");

        return {
          success: true,
          fileName: input.fileName,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update reference file: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // ==================== Database-based Skill Management ====================

  /**
   * List all skills from database (unified source)
   */
  listFromDb: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        enabledOnly: z.boolean().optional(),
        autoTriggerOnly: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      await autoSyncSkillsFromFolder({ force: true });
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [];

      if (input?.category) {
        conditions.push(eq(skills.category, input.category as any));
      }

      if (input?.enabledOnly) {
        conditions.push(eq(skills.isEnabled, true));
      }

      if (input?.autoTriggerOnly) {
        conditions.push(eq(skills.isAutoTrigger, true));
      }

      if (input?.search) {
        conditions.push(
          or(
            ilike(skills.slug, `%${input.search}%`),
            ilike(skills.name, `%${input.search}%`),
            ilike(skills.description, `%${input.search}%`),
          )
        );
      }

      let query = dbInstance.select().from(skills);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      query = query.orderBy(desc(skills.priority), asc(skills.name)) as typeof query;

      if (input?.limit) {
        query = query.limit(input.limit) as typeof query;
      }

      if (input?.offset) {
        query = query.offset(input.offset) as typeof query;
      }

      const result = await query;

      return result.map((skill) => ({
        ...skill,
        name: sanitizeBrandText(skill.name || ""),
        description: sanitizeBrandText(skill.description || ""),
        author: sanitizeBrandText(skill.author || ""),
        marketplaceContent: skill.marketplaceContent ? sanitizeBrandText(skill.marketplaceContent) : null,
        creditMultiplier: Number(skill.creditMultiplier) || 1,
        tags: skill.tags || [],
        triggerPatterns: skill.triggerPatterns || [],
        hasLocalFolder: hasRelativeSkillManifest(path.join("skills", skill.slug)),
        nativeBundleReady: getSkillById(skill.slug)?.nativeBundleReady ?? false,
        nativeBundleFiles: getSkillById(skill.slug)?.nativeBundleFiles ?? [],
        nativeBundlePath: getSkillById(skill.slug)?.nativeBundlePath ?? null,
        nativeBundleLockPath: getSkillById(skill.slug)?.nativeBundleLockPath ?? null,
        nativeSubagentNames:
          (getSkillById(skill.slug) as Record<string, unknown> | undefined)?.nativeSubagentNames ??
          [],
      }));
    }),

  /**
   * Get skill by slug from database
   */
  getFromDb: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      await autoSyncSkillsFromFolder({ force: true });
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.slug}' not found`,
        });
      }

      return {
        ...skill,
        name: sanitizeBrandText(skill.name || ""),
        description: sanitizeBrandText(skill.description || ""),
        author: sanitizeBrandText(skill.author || ""),
        marketplaceContent: skill.marketplaceContent ? sanitizeBrandText(skill.marketplaceContent) : null,
        creditMultiplier: Number(skill.creditMultiplier) || 1,
        tags: skill.tags || [],
        triggerPatterns: skill.triggerPatterns || [],
        nativeBundleReady: getSkillById(skill.slug)?.nativeBundleReady ?? false,
        nativeBundleFiles: getSkillById(skill.slug)?.nativeBundleFiles ?? [],
        nativeBundlePath: getSkillById(skill.slug)?.nativeBundlePath ?? null,
        nativeBundleLockPath: getSkillById(skill.slug)?.nativeBundleLockPath ?? null,
        nativeSubagentNames:
          (getSkillById(skill.slug) as Record<string, unknown> | undefined)?.nativeSubagentNames ??
          [],
      };
    }),

  /**
   * List skills waiting for admin approval to become public.
   */
  listPending: adminProcedure
    .query(async () => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const rows = await dbInstance
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          description: skills.description,
          category: skills.category,
          version: skills.version,
          author: skills.author,
          icon: skills.icon,
          tags: skills.tags,
          folderPath: skills.folderPath,
          isAutoTrigger: skills.isAutoTrigger,
          triggerPatterns: skills.triggerPatterns,
          isEnabled: skills.isEnabled,
          enabledByDefault: skills.enabledByDefault,
          visibleByDefault: skills.visibleByDefault,
          creditMultiplier: skills.creditMultiplier,
          priority: skills.priority,
          availableModels: skills.availableModels,
          defaultModel: skills.defaultModel,
          llmModelId: skills.llmModelId,
          preferredProviderId: skills.preferredProviderId,
          strictProviderPin: skills.strictProviderPin,
          systemPrompt: skills.systemPrompt,
          skillContent: skills.skillContent,
          knowledgebase: skills.knowledgebase,
          configJson: skills.configJson,
          executionMode: skills.executionMode,
          marketplaceContent: skills.marketplaceContent,
          importSource: skills.importSource,
          importedFromZip: skills.importedFromZip,
          createdBy: skills.createdBy,
          createdAt: skills.createdAt,
          updatedAt: skills.updatedAt,
          visibility: skills.visibility,
          tenantId: skills.tenantId,
          approvedBy: skills.approvedBy,
          approvedAt: skills.approvedAt,
          rejectionReason: skills.rejectionReason,
          requestedPublishAt: skills.requestedPublishAt,
          ownerName: usersTable.name,
        })
        .from(skills)
        .leftJoin(usersTable, eq(skills.createdBy, usersTable.id))
        .where(eq(skills.visibility, "pending_approval"))
        .orderBy(asc(skills.requestedPublishAt), desc(skills.createdAt));

      return rows.map((skill) => ({
        ...skill,
        name: sanitizeBrandText(skill.name || ""),
        description: sanitizeBrandText(skill.description || ""),
        author: sanitizeBrandText(skill.author || ""),
        marketplaceContent: skill.marketplaceContent ? sanitizeBrandText(skill.marketplaceContent) : null,
        ownerName: skill.ownerName ? sanitizeBrandText(skill.ownerName) : null,
        creditMultiplier: Number(skill.creditMultiplier) || 1,
        tags: skill.tags || [],
        triggerPatterns: skill.triggerPatterns || [],
      }));
    }),

  /**
   * Approve a pending skill and make it public.
   */
  approveSkill: adminProcedure
    .input(z.object({ skillId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [updated] = await dbInstance
        .update(skills)
        .set({
          visibility: "public",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
          rejectionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, input.skillId))
        .returning({ id: skills.id, visibility: skills.visibility });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
      }

      // Notify the skill creator
      try {
        const [skillInfo] = await dbInstance
          .select({ createdBy: skills.createdBy, name: skills.name })
          .from(skills)
          .where(eq(skills.id, input.skillId))
          .limit(1);
        if (skillInfo?.createdBy) {
          const { createNotification } = await import("../services/notificationService");
          await createNotification({
            db: dbInstance,
            userId: skillInfo.createdBy,
            type: "system",
            title: "Skill Approved!",
            content: `Your skill "${skillInfo.name}" has been approved and is now public.`,
            priority: "normal",
            relatedResourceType: "skill",
            relatedResourceId: String(input.skillId),
            actionUrl: `/skills?skillId=${input.skillId}`,
            actionLabel: "View Skill",
            metadata: { source: "skill.approved" },
          });
        }
      } catch (_notifErr) {
        // Non-fatal — approval still succeeds
      }

      await refreshSkillCache();
      return { success: true, skillId: updated.id, visibility: updated.visibility };
    }),

  /**
   * Reject a pending skill submission.
   */
  rejectSkill: adminProcedure
    .input(
      z.object({
        skillId: z.number(),
        reason: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [updated] = await dbInstance
        .update(skills)
        .set({
          visibility: "rejected",
          approvedBy: null,
          approvedAt: null,
          rejectionReason: input.reason?.trim() || "Rejected by admin",
          updatedAt: new Date(),
        })
        .where(eq(skills.id, input.skillId))
        .returning({ id: skills.id, visibility: skills.visibility });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
      }

      // Notify the skill creator
      try {
        const [skillInfo] = await dbInstance
          .select({ createdBy: skills.createdBy, name: skills.name })
          .from(skills)
          .where(eq(skills.id, input.skillId))
          .limit(1);
        if (skillInfo?.createdBy) {
          const { createNotification } = await import("../services/notificationService");
          const reasonText = input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : "";
          await createNotification({
            db: dbInstance,
            userId: skillInfo.createdBy,
            type: "system",
            title: "Skill Publish Request Rejected",
            content: `Your skill "${skillInfo.name}" was not approved for public visibility.${reasonText}`,
            priority: "normal",
            relatedResourceType: "skill",
            relatedResourceId: String(input.skillId),
            actionUrl: `/skills?skillId=${input.skillId}`,
            actionLabel: "View Skill",
            metadata: { source: "skill.rejected" },
          });
        }
      } catch (_notifErr) {
        // Non-fatal — rejection still succeeds
      }

      await refreshSkillCache();
      return { success: true, skillId: updated.id, visibility: updated.visibility };
    }),

  /**
   * Get groups that currently have access to a private skill.
   */
  getSkillGroups: protectedProcedure
    .input(z.object({ skillId: z.number() }))
    .query(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select({ createdBy: skills.createdBy })
        .from(skills)
        .where(eq(skills.id, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
      }

      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && skill.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view groups for your own skills" });
      }

      return dbInstance
        .select({
          id: userGroups.id,
          name: userGroups.name,
          description: userGroups.description,
        })
        .from(skillPermissions)
        .innerJoin(userGroups, eq(skillPermissions.groupId, userGroups.id))
        .where(eq(skillPermissions.skillId, input.skillId))
        .orderBy(asc(userGroups.name));
    }),

  /**
   * Share a private skill with one or more groups.
   */
  shareWithGroups: protectedProcedure
    .input(
      z.object({
        skillId: z.number(),
        groupIds: z.array(z.number()).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select({ createdBy: skills.createdBy })
        .from(skills)
        .where(eq(skills.id, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
      }

      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && skill.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only share your own skills" });
      }

      const ownedGroups = await dbInstance
        .select({ id: userGroups.id })
        .from(userGroups)
        .where(
          isAdmin
            ? inArray(userGroups.id, input.groupIds)
            : and(inArray(userGroups.id, input.groupIds), eq(userGroups.ownerId, ctx.user.id)),
        );

      if (ownedGroups.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid groups were provided" });
      }

      for (const group of ownedGroups) {
        await dbInstance
          .insert(skillPermissions)
          .values({
            skillId: input.skillId,
            groupId: group.id,
            grantedByUserId: ctx.user.id,
          })
          .onConflictDoNothing();
      }

      return { success: true, sharedCount: ownedGroups.length };
    }),

  /**
   * Remove a group's access to a private skill.
   */
  unshareGroup: protectedProcedure
    .input(
      z.object({
        skillId: z.number(),
        groupId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select({ createdBy: skills.createdBy })
        .from(skills)
        .where(eq(skills.id, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.skillId} not found` });
      }

      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && skill.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage sharing for your own skills" });
      }

      if (!isAdmin) {
        const [group] = await dbInstance
          .select({ id: userGroups.id })
          .from(userGroups)
          .where(and(eq(userGroups.id, input.groupId), eq(userGroups.ownerId, ctx.user.id)))
          .limit(1);
        if (!group) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only unshare groups you own" });
        }
      }

      await dbInstance
        .delete(skillPermissions)
        .where(and(eq(skillPermissions.skillId, input.skillId), eq(skillPermissions.groupId, input.groupId)));

      return { success: true };
    }),

  /**
   * Create a new skill (admin only)
   */
  create: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().default("other"),
        version: z.string().optional(),
        author: z.string().optional(),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isAutoTrigger: z.boolean().optional(),
        triggerPatterns: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
        enabledByDefault: z.boolean().optional(),
        visibleByDefault: z.boolean().optional(),
        creditMultiplier: z.number().min(0).max(100).optional(),
        priority: z.number().min(0).max(100).optional(),
        systemPrompt: z.string().optional(),
        skillContent: z.string().optional(),
        marketplaceContent: z.string().optional(),
        knowledgebase: z.string().optional(),
        configJson: z.record(z.any()).optional(),
        visibility: z.enum(["private", "pending_approval", "public", "rejected"]).optional(),
        llmModelId: z.string().nullable().optional(),
        preferredProviderId: z.number().int().positive().nullable().optional(),
        strictProviderPin: z.boolean().optional(),
        executionMode: skillExecutionModeSchema.optional(),
        sandboxProfileSlug: z.string().trim().min(1).max(64).nullable().optional(),
        requiresNetwork: z.boolean().nullable().optional(),
        requiresBrowser: z.boolean().nullable().optional(),
        maxRuntimeSeconds: z.number().int().min(1).max(3600).nullable().optional(),
        maxInputMb: z.number().int().min(1).max(2048).nullable().optional(),
        bundleType: z.enum(["native", "legacy"]).default("native"),
        bundleProfile: z.enum(["general", "research", "workflow", "media", "custom"]).default("general"),
        subagents: z.array(nativeSubagentInputSchema).optional(),
        orchestrator: nativeOrchestratorInputSchema.optional(),
        routing: z.array(nativeRoutingInputSchema).optional(),
        checkpointPolicy: nativeCheckpointPolicySchema.optional(),
        verificationPolicy: z.object({
          command: nativeBundleRelativePathSchema,
          onFailure: z.string().trim().max(120).nullable().optional(),
        }).passthrough().optional(),
        fallbackPolicy: z.object({
          behavior: z.enum(["escalate-to-parent", "return-error", "retry-tool", "retry-handoff"]),
          retryLimit: z.number().int().min(0).max(8).optional(),
        }).passthrough().optional(),
        securityPolicy: nativeSecurityPolicySchema.optional(),
        subagentManifestVersion: z.string().trim().min(1).max(16).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      if (input.strictProviderPin && !input.preferredProviderId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "strictProviderPin requires preferredProviderId",
        });
      }
      if (input.preferredProviderId) {
        const [provider] = await dbInstance
          .select({ id: llmProviders.id })
          .from(llmProviders)
          .where(eq(llmProviders.id, input.preferredProviderId))
          .limit(1);
        if (!provider) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `LLM provider ${input.preferredProviderId} not found`,
          });
        }
      }

      const normalizedCategory = mapCategoryToEnum(input.category);
      const effectiveExecutionMode = input.executionMode ?? getRecommendedExecutionModeForSkillCategory(normalizedCategory) ?? "llm-only";
      if (!isExecutionModeCompatibleWithSkillCategory(normalizedCategory, effectiveExecutionMode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Category '${normalizedCategory}' is not compatible with executionMode '${effectiveExecutionMode}'.`,
        });
      }
      const shouldUseSandbox = isSandboxExecutionMode(effectiveExecutionMode);

      // Check if slug already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill with slug '${input.slug}' already exists`,
        });
      }

      const createNativeBundle = input.bundleType !== "legacy";
      const skillDir = path.join(SKILLS_DIR, input.slug);
      const nextConfigJson = createNativeBundle
        ? {
            ...(input.configJson || {}),
            nativeBundleProfile: input.bundleProfile,
          }
        : input.configJson;
      let nativeBundleTempDir: string | null = null;
      let insertedSkillId: number | null = null;

      try {
        if (createNativeBundle) {
          fs.mkdirSync(SKILLS_DIR, { recursive: true });
          nativeBundleTempDir = fs.mkdtempSync(path.join(SKILLS_DIR, `.${input.slug}-native-`));
          writeNativeSkillBundleScaffold(nativeBundleTempDir, {
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
            category: normalizedCategory,
            version: input.version ?? "1.0.0",
            author: input.author ?? null,
            bundleProfile: input.bundleProfile,
            skillContent: input.skillContent ?? null,
            systemPrompt: input.systemPrompt ?? null,
            subagents: input.subagents ?? null,
            orchestrator: input.orchestrator ?? null,
            routing: input.routing ?? null,
            checkpointPolicy: input.checkpointPolicy ?? null,
            verificationPolicy: input.verificationPolicy ?? null,
            fallbackPolicy: input.fallbackPolicy ?? null,
            securityPolicy: input.securityPolicy ?? null,
            subagentManifestVersion: input.subagentManifestVersion ?? null,
          });
        }

        const [newSkill] = await dbInstance
          .insert(skills)
          .values({
            slug: input.slug,
            name: input.name,
            description: input.description,
            category: normalizedCategory as any,
            version: input.version || "1.0.0",
            author: input.author,
            icon: input.icon || "sparkles",
            tags: input.tags || [],
            isAutoTrigger: input.isAutoTrigger ?? false,
            triggerPatterns: input.triggerPatterns || [],
            isEnabled: input.isEnabled ?? true,
            enabledByDefault: input.enabledByDefault ?? true,
            visibleByDefault: input.visibleByDefault ?? true,
            creditMultiplier: String(input.creditMultiplier ?? 1.0),
            priority: input.priority ?? 50,
            systemPrompt: input.systemPrompt,
            skillContent: input.skillContent,
            marketplaceContent: input.marketplaceContent || generateMarketplaceContent(input.skillContent || "", { name: input.name, description: input.description }),
            knowledgebase: input.knowledgebase,
            llmModelId: input.llmModelId ?? null,
            preferredProviderId: input.preferredProviderId ?? null,
            strictProviderPin: input.strictProviderPin ?? false,
            executionMode: effectiveExecutionMode,
            sandboxProfileSlug: shouldUseSandbox
              ? (input.sandboxProfileSlug ?? getDefaultSandboxProfileSlug(effectiveExecutionMode, normalizedCategory))
              : null,
            requiresNetwork: shouldUseSandbox
              ? (input.requiresNetwork ?? (
                  effectiveExecutionMode === "sandbox-command"
                  || effectiveExecutionMode === "sandbox-browser"
                  || normalizedCategory === "slide_generation"
                ))
              : null,
            requiresBrowser: shouldUseSandbox
              ? (input.requiresBrowser ?? (effectiveExecutionMode === "sandbox-browser"))
              : null,
            maxRuntimeSeconds: shouldUseSandbox
              ? (input.maxRuntimeSeconds ?? (normalizedCategory === "slide_generation" ? 600 : 300))
              : null,
            maxInputMb: shouldUseSandbox
              ? (input.maxInputMb ?? (normalizedCategory === "slide_generation" ? 50 : 25))
              : null,
            configJson: nextConfigJson,
            folderPath: createNativeBundle ? `skills/${input.slug}` : null,
            importSource: createNativeBundle ? "native_bundle" : "manual",
            createdBy: ctx.user?.id,
            visibility: input.visibility ?? "private",
            ...(input.visibility === "pending_approval" ? { requestedPublishAt: new Date() } : {}),
          })
          .returning();

        insertedSkillId = newSkill.id;

        if (createNativeBundle) {
          if (fs.existsSync(skillDir)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Skill bundle directory '${skillDir}' already exists`,
            });
          }

          if (!nativeBundleTempDir) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Native bundle scaffold directory was not initialized",
            });
          }

          fs.renameSync(nativeBundleTempDir, skillDir);
          nativeBundleTempDir = null;
        }

        // Refresh skill cache
        await refreshSkillCache();

        return newSkill;
      } catch (error) {
        if (insertedSkillId !== null) {
          await dbInstance.delete(skills).where(eq(skills.id, insertedSkillId));
        }
        if (nativeBundleTempDir) {
          fs.rmSync(nativeBundleTempDir, { recursive: true, force: true });
        }
        if (createNativeBundle && fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true, force: true });
        }
        throw error;
      }
    }),

  /**
   * Update an existing skill (admin only)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        version: z.string().optional(),
        author: z.string().optional(),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isAutoTrigger: z.boolean().optional(),
        triggerPatterns: z.array(z.string()).optional(),
        isEnabled: z.boolean().optional(),
        enabledByDefault: z.boolean().optional(),
        visibleByDefault: z.boolean().optional(),
        creditMultiplier: z.number().min(0).max(100).optional(),
        priority: z.number().min(0).max(100).optional(),
        defaultModel: z.string().nullable().optional(),
        llmModelId: z.string().nullable().optional(),
        preferredProviderId: z.number().int().positive().nullable().optional(),
        strictProviderPin: z.boolean().optional(),
        executionMode: skillExecutionModeSchema.optional(),
        sandboxProfileSlug: z.string().trim().min(1).max(64).nullable().optional(),
        requiresNetwork: z.boolean().nullable().optional(),
        requiresBrowser: z.boolean().nullable().optional(),
        maxRuntimeSeconds: z.number().int().min(1).max(3600).nullable().optional(),
        maxInputMb: z.number().int().min(1).max(2048).nullable().optional(),
        systemPrompt: z.string().nullable().optional(),
        skillContent: z.string().nullable().optional(),
        marketplaceContent: z.string().nullable().optional(),
        knowledgebase: z.string().nullable().optional(),
        configJson: z.record(z.any()).nullable().optional(),
        visibility: z.enum(["private", "pending_approval", "public", "rejected"]).optional(),
        // Spec 038: Content Quality & Execution Policy
        executionPolicy: z.object({
          // Spec 038 fields
          thinking_level_hint: z.enum(["low", "medium", "high"]).nullable().optional(),
          requires_web_search: z.boolean().optional(),
          requires_structured_output: z.boolean().optional(),
          min_citation_coverage: z.number().min(0).max(1).optional(),
          refresh_cadence_days: z.number().min(1).max(365).optional(),
          disclosure_required: z.boolean().optional(),
          response_mode: z.enum(["markdown", "cms_json"]).optional(),
          // Feature 041: Capability requirements
          requirements: z.object({
            supportsVision: z.boolean().optional(),
            supportsThinking: z.boolean().optional(),
            supportsFunctionTools: z.boolean().optional(),
            supportsStructuredOutputs: z.boolean().optional(),
            supportsJsonMode: z.boolean().optional(),
            supportsStrictToolSchema: z.boolean().optional(),
            supportsWebSearch: z.boolean().optional(),
            supportsCodeExecution: z.boolean().optional(),
            supportsComputerUse: z.boolean().optional(),
            supportsBackground: z.boolean().optional(),
            supportsResponses: z.boolean().optional(),
            contextLength: z.number().int().min(1000).max(2000000).optional(),
          }).nullable().optional(),
          // Feature 041: Execution mode
          mode: z.enum(["requirements", "fixed", "hybrid"]).optional(),
          // Feature 041: Conversation override flag
          allowConversationOverride: z.boolean().optional(),
          // Feature 041: Free-model policy
          allowFreeModels: z.boolean().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updateData } = input;

      const [currentSkill] = await dbInstance
        .select({
          folderPath: skills.folderPath,
          preferredProviderId: skills.preferredProviderId,
          category: skills.category,
          executionMode: skills.executionMode,
          sandboxProfileSlug: skills.sandboxProfileSlug,
          requiresNetwork: skills.requiresNetwork,
          requiresBrowser: skills.requiresBrowser,
          maxRuntimeSeconds: skills.maxRuntimeSeconds,
          maxInputMb: skills.maxInputMb,
        })
        .from(skills)
        .where(eq(skills.id, id))
        .limit(1);
      if (!currentSkill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill with id ${id} not found`,
        });
      }

      if (updateData.strictProviderPin === true && updateData.preferredProviderId === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "strictProviderPin requires preferredProviderId",
        });
      }
      if (
        updateData.strictProviderPin === true
        && updateData.preferredProviderId === undefined
        && currentSkill.preferredProviderId == null
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "strictProviderPin requires preferredProviderId",
        });
      }
      if (updateData.preferredProviderId !== undefined && updateData.preferredProviderId !== null) {
        const [provider] = await dbInstance
          .select({ id: llmProviders.id })
          .from(llmProviders)
          .where(eq(llmProviders.id, updateData.preferredProviderId))
          .limit(1);
        if (!provider) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `LLM provider ${updateData.preferredProviderId} not found`,
          });
        }
      }

      const effectiveCategory = updateData.category !== undefined
        ? mapCategoryToEnum(updateData.category)
        : currentSkill.category;
      const effectiveExecutionMode = updateData.executionMode !== undefined
        ? updateData.executionMode
        : currentSkill.executionMode;

      if (
        effectiveExecutionMode
        && !isExecutionModeCompatibleWithSkillCategory(effectiveCategory, effectiveExecutionMode)
      ) {
        const recommendedExecutionMode = getRecommendedExecutionModeForSkillCategory(effectiveCategory);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: recommendedExecutionMode
            ? `Category '${effectiveCategory}' requires executionMode '${recommendedExecutionMode}' or another compatible mode.`
            : `Category '${effectiveCategory}' is not compatible with executionMode '${effectiveExecutionMode}'.`,
        });
      }

      // Build update object
      const updateObj: Record<string, any> = { updatedAt: new Date() };

      if (updateData.name !== undefined) updateObj.name = updateData.name;
      if (updateData.description !== undefined) updateObj.description = updateData.description;
      if (updateData.category !== undefined) updateObj.category = mapCategoryToEnum(updateData.category);
      if (updateData.version !== undefined) updateObj.version = updateData.version;
      if (updateData.author !== undefined) updateObj.author = updateData.author;
      if (updateData.icon !== undefined) updateObj.icon = updateData.icon;
      if (updateData.tags !== undefined) updateObj.tags = updateData.tags;
      if (updateData.isAutoTrigger !== undefined) updateObj.isAutoTrigger = updateData.isAutoTrigger;
      if (updateData.triggerPatterns !== undefined) updateObj.triggerPatterns = updateData.triggerPatterns;
      if (updateData.isEnabled !== undefined) updateObj.isEnabled = updateData.isEnabled;
      if (updateData.enabledByDefault !== undefined) updateObj.enabledByDefault = updateData.enabledByDefault;
      if (updateData.visibleByDefault !== undefined) updateObj.visibleByDefault = updateData.visibleByDefault;
      if (updateData.creditMultiplier !== undefined) updateObj.creditMultiplier = String(updateData.creditMultiplier);
      if (updateData.priority !== undefined) updateObj.priority = updateData.priority;
      if (updateData.defaultModel !== undefined) updateObj.defaultModel = updateData.defaultModel;
      if (updateData.llmModelId !== undefined) updateObj.llmModelId = updateData.llmModelId;
      if (updateData.preferredProviderId !== undefined) {
        updateObj.preferredProviderId = updateData.preferredProviderId;
        if (updateData.preferredProviderId === null && updateData.strictProviderPin === undefined) {
          updateObj.strictProviderPin = false;
        }
      }
      if (updateData.strictProviderPin !== undefined) updateObj.strictProviderPin = updateData.strictProviderPin;
      if (updateData.executionMode !== undefined) updateObj.executionMode = updateData.executionMode;
      if (updateData.sandboxProfileSlug !== undefined) updateObj.sandboxProfileSlug = updateData.sandboxProfileSlug;
      if (updateData.requiresNetwork !== undefined) updateObj.requiresNetwork = updateData.requiresNetwork;
      if (updateData.requiresBrowser !== undefined) updateObj.requiresBrowser = updateData.requiresBrowser;
      if (updateData.maxRuntimeSeconds !== undefined) updateObj.maxRuntimeSeconds = updateData.maxRuntimeSeconds;
      if (updateData.maxInputMb !== undefined) updateObj.maxInputMb = updateData.maxInputMb;
      if (updateData.systemPrompt !== undefined) updateObj.systemPrompt = updateData.systemPrompt;
      if (updateData.skillContent !== undefined) updateObj.skillContent = updateData.skillContent;
      if (updateData.marketplaceContent !== undefined) updateObj.marketplaceContent = updateData.marketplaceContent;
      if (updateData.knowledgebase !== undefined) updateObj.knowledgebase = updateData.knowledgebase;
      if (updateData.configJson !== undefined) updateObj.configJson = updateData.configJson;
      if (updateData.visibility !== undefined) {
        updateObj.visibility = updateData.visibility;
        if (updateData.visibility === "pending_approval") {
          updateObj.requestedPublishAt = new Date();
        }
      }

      if (isSandboxExecutionMode(effectiveExecutionMode)) {
        if (updateData.sandboxProfileSlug === undefined && currentSkill.sandboxProfileSlug == null) {
          updateObj.sandboxProfileSlug = getDefaultSandboxProfileSlug(
            effectiveExecutionMode,
            effectiveCategory,
          );
        }
        if (updateData.requiresNetwork === undefined && currentSkill.requiresNetwork == null) {
          updateObj.requiresNetwork = (
            effectiveExecutionMode === "sandbox-command"
            || effectiveExecutionMode === "sandbox-browser"
            || effectiveCategory === "slide_generation"
          );
        }
        if (updateData.requiresBrowser === undefined && currentSkill.requiresBrowser == null) {
          updateObj.requiresBrowser = effectiveExecutionMode === "sandbox-browser";
        }
        if (updateData.maxRuntimeSeconds === undefined && currentSkill.maxRuntimeSeconds == null) {
          updateObj.maxRuntimeSeconds = effectiveCategory === "slide_generation" ? 600 : 300;
        }
        if (updateData.maxInputMb === undefined && currentSkill.maxInputMb == null) {
          updateObj.maxInputMb = effectiveCategory === "slide_generation" ? 50 : 25;
        }
      } else if (updateData.executionMode !== undefined) {
        updateObj.sandboxProfileSlug = null;
        updateObj.requiresNetwork = null;
        updateObj.requiresBrowser = null;
        updateObj.maxRuntimeSeconds = null;
        updateObj.maxInputMb = null;
      }

      // Spec 038: Merge execution policy into executionPolicyJson
      if (updateData.executionPolicy !== undefined) {
        const existing = (await dbInstance
          .select({ executionPolicyJson: skills.executionPolicyJson })
          .from(skills)
          .where(eq(skills.id, id))
          .limit(1)
        )[0]?.executionPolicyJson ?? {};

        // Build Feature 041 requirements from Spec 038 flags when not explicitly provided
        const incomingReqs = updateData.executionPolicy.requirements;
        const existingReqs = (existing as any)?.requirements;
        let mergedRequirements = incomingReqs ?? existingReqs;

        // Auto-derive requirements from Spec 038 toggle flags
        if (!incomingReqs) {
          const derived: Record<string, boolean> = {};
          if (updateData.executionPolicy.requires_web_search === true) {
            derived.supportsWebSearch = true;
          }
          if (updateData.executionPolicy.requires_structured_output === true) {
            derived.supportsStructuredOutputs = true;
          }
          if (Object.keys(derived).length > 0) {
            mergedRequirements = { ...(existingReqs ?? {}), ...derived };
          }
        }

        const hasReqs = mergedRequirements && Object.values(mergedRequirements).some(Boolean);

        updateObj.executionPolicyJson = {
          ...existing,
          // Spec 038 fields (backward compat)
          thinking_level_hint: updateData.executionPolicy.thinking_level_hint,
          requires_web_search: updateData.executionPolicy.requires_web_search,
          min_citation_coverage: updateData.executionPolicy.min_citation_coverage,
          refresh_cadence_days: updateData.executionPolicy.refresh_cadence_days,
          disclosure_required: updateData.executionPolicy.disclosure_required,
          response_mode: updateData.executionPolicy.response_mode,
          // Feature 041 fields — auto-derived from Spec 038 flags when not explicit
          requirements: mergedRequirements ?? undefined,
          mode: updateData.executionPolicy.mode ?? (hasReqs ? "requirements" : (existing as any)?.mode),
          ...(updateData.executionPolicy.allowConversationOverride !== undefined
            ? { allowConversationOverride: updateData.executionPolicy.allowConversationOverride }
            : {}),
          ...(updateData.executionPolicy.allowFreeModels !== undefined
            ? { allowFreeModels: updateData.executionPolicy.allowFreeModels }
            : {}),
        };
      }

      if (currentSkill.folderPath && hasRelativeSkillManifest(currentSkill.folderPath)) {
        const skillDir = resolveSkillDirCandidates(currentSkill.folderPath)
          .find((candidate) => !!resolveSkillManifestPath(candidate));

        if (skillDir) {
          const shouldClearSandboxManifestFields = (
            updateData.executionMode !== undefined
            && !isSandboxExecutionMode(updateData.executionMode)
          );
          const manifestResult = updateSkillManifestFiles(
            skillDir,
            {
              name: updateData.name,
              description: updateData.description,
              category: updateData.category !== undefined ? mapCategoryToEnum(updateData.category) : undefined,
              version: updateData.version,
              author: updateData.author,
              icon: updateData.icon,
              tags: updateData.tags,
              auto_trigger: updateData.isAutoTrigger,
              trigger_patterns: updateData.triggerPatterns,
              enabled_by_default: updateData.enabledByDefault,
              credit_multiplier: updateData.creditMultiplier,
              priority: updateData.priority,
              execution_mode: updateData.executionMode,
              sandbox_profile: shouldClearSandboxManifestFields ? null : updateData.sandboxProfileSlug,
              requires_network: shouldClearSandboxManifestFields ? null : updateData.requiresNetwork,
              requires_browser: shouldClearSandboxManifestFields ? null : updateData.requiresBrowser,
              max_runtime_seconds: shouldClearSandboxManifestFields ? null : updateData.maxRuntimeSeconds,
              max_input_mb: shouldClearSandboxManifestFields ? null : updateData.maxInputMb,
              default_model: updateData.defaultModel,
              llm_model_id: updateData.llmModelId,
              preferred_provider_id: updateData.preferredProviderId,
              strict_provider_pin: updateData.strictProviderPin,
              config: updateData.configJson === undefined ? undefined : updateData.configJson,
            },
            updateData.skillContent,
          );

          updateObj.contentHash = crypto.createHash("md5").update(manifestResult.content).digest("hex");
        }
      }

      const [updated] = await dbInstance
        .update(skills)
        .set(updateObj)
        .where(eq(skills.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill with id ${id} not found`,
        });
      }

      // Refresh skill cache
      await refreshSkillCache();

      return updated;
    }),

  /**
   * Enable or disable a skill globally without editing the full skill payload.
   */
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number(), isEnabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [updated] = await dbInstance
        .update(skills)
        .set({
          isEnabled: input.isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, input.id))
        .returning({
          id: skills.id,
          slug: skills.slug,
          isEnabled: skills.isEnabled,
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill with id ${input.id} not found`,
        });
      }

      await refreshSkillCache();
      return updated;
    }),

  /**
   * Delete a skill (admin only)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get skill slug before deleting (to clean up folder)
      const [skill] = await dbInstance
        .select({ slug: skills.slug })
        .from(skills)
        .where(eq(skills.id, input.id))
        .limit(1);

      await dbInstance.delete(skills).where(eq(skills.id, input.id));

      // Delete skill folder to prevent auto-sync re-import
      if (skill?.slug) {
        const fs = await import("fs");
        const path = await import("path");
        const skillDir = path.resolve(process.cwd(), "skills", skill.slug);
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true, force: true });
        }
      }

      // Refresh skill cache
      await refreshSkillCache();

      return { success: true };
    }),

  /**
   * Delete a skill owned by the current user
   */
  deleteOwn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify the skill exists and belongs to the current user
      const [skill] = await dbInstance
        .select({ id: skills.id, slug: skills.slug, createdBy: skills.createdBy })
        .from(skills)
        .where(eq(skills.id, input.id))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
      }

      if (skill.createdBy !== ctx.user?.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete skills you own" });
      }

      await dbInstance.delete(skills).where(eq(skills.id, input.id));

      // Delete skill folder to prevent auto-sync re-import
      if (skill.slug) {
        const fs = await import("fs");
        const path = await import("path");
        const skillDir = path.resolve(process.cwd(), "skills", skill.slug);
        if (fs.existsSync(skillDir)) {
          fs.rmSync(skillDir, { recursive: true, force: true });
        }
      }

      await refreshSkillCache();
      return { success: true };
    }),

  /**
   * Regenerate marketplace content from skillContent (admin only)
   */
  regenerateMarketplaceContent: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [skill] = await dbInstance
        .select({ id: skills.id, name: skills.name, description: skills.description, skillContent: skills.skillContent })
        .from(skills)
        .where(eq(skills.id, input.id))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill with id ${input.id} not found` });
      }

      const marketplaceContent = generateMarketplaceContent(
        skill.skillContent || "",
        { name: skill.name, description: skill.description || undefined }
      );

      await dbInstance
        .update(skills)
        .set({ marketplaceContent, updatedAt: new Date() })
        .where(eq(skills.id, input.id));

      return { success: true, marketplaceContent };
    }),

  /**
   * Scan skills directory for new skill folders (admin only)
   */
  scanFolders: adminProcedure.query(async () => {
    const folders: Array<{
      slug: string;
      hasSkillMd: boolean;
      manifestFileName?: string;
      hasPython: boolean;
      hasJs: boolean;
      metadata?: SkillMetadata;
      existsInDb: boolean;
    }> = [];

    if (!fs.existsSync(SKILLS_DIR)) {
      return folders;
    }

    const dbInstance = await getDb();
    const existingSlugs = dbInstance
      ? (await dbInstance.select({ slug: skills.slug }).from(skills)).map((s) => s.slug)
      : [];

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const slug = entry.name;
      const skillDir = path.join(SKILLS_DIR, slug);
      const skillMdPath = resolveSkillManifestPath(skillDir);
      const pythonDir = path.join(skillDir, "python");
      const jsDir = path.join(skillDir, "js");

      const hasSkillMd = !!skillMdPath;
      const hasPython = fs.existsSync(pythonDir);
      const hasJs = fs.existsSync(jsDir);

      let metadata: SkillMetadata | undefined;
      if (skillMdPath) {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillFile(content);
        metadata = parsed.metadata;
      }

      folders.push({
        slug,
        hasSkillMd,
        manifestFileName: skillMdPath ? path.basename(skillMdPath) : undefined,
        hasPython,
        hasJs,
        metadata,
        existsInDb: existingSlugs.includes(slug),
      });
    }

    return folders;
  }),

  /**
   * Import skill from folder (admin only)
   */
  importFolder: adminProcedure
    .input(z.object({ slug: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/) }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const skillDir = path.join(SKILLS_DIR, input.slug);
      const skillMdPath = resolveSkillManifestPath(skillDir) || path.join(skillDir, "skill.md");

      if (!fs.existsSync(skillDir)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill folder '${input.slug}' not found`,
        });
      }

      // Check if already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill '${input.slug}' already exists in database`,
        });
      }

      // Read skill.md
      let metadata: SkillMetadata = { name: input.slug };
      let skillContent = "";

      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillFile(content);
        metadata = { ...metadata, ...parsed.metadata };
        skillContent = parsed.content;
        mirrorExistingSkillManifest(skillDir);
      }

      // Insert into database
      const [newSkill] = await dbInstance
        .insert(skills)
        .values({
          slug: input.slug,
          name: metadata.name || input.slug,
          description: metadata.description,
          category: mapCategoryToEnum(metadata.category) as any,
          version: metadata.version || "1.0.0",
          author: metadata.author,
          icon: metadata.icon || "sparkles",
          tags: metadata.tags || [],
          folderPath: `skills/${input.slug}`,
          isAutoTrigger: metadata.auto_trigger ?? false,
          triggerPatterns: metadata.trigger_patterns || [],
          isEnabled: true,
          enabledByDefault: metadata.enabled_by_default ?? false,
          creditMultiplier: String(metadata.credit_multiplier ?? 1.0),
          priority: metadata.priority ?? 50,
          systemPrompt: skillContent || undefined,
          skillContent,
          marketplaceContent: generateMarketplaceContent(skillContent, { name: metadata.name || input.slug, description: metadata.description }),
          configJson: metadata.config,
          visibleByDefault: false,
          importSource: "folder",
          createdBy: ctx.user?.id,
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return newSkill;
    }),

  /**
   * Import skill from ZIP file (admin only)
   * Supports both:
   * 1. Shared skill bundle format (Codex/Claude compatible manifest)
   * 2. SystemPrompt+KnowledgeBase format (Custom GPT)
   */
  importZip: adminProcedure
    .input(
      z.object({
        fileName: z.string(),
        base64Content: z.string(),
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if slug already exists
      const [existing] = await dbInstance
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.slug, input.slug))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill with slug '${input.slug}' already exists`,
        });
      }

      // Decode ZIP
      const zipBuffer = Buffer.from(input.base64Content, "base64");
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();

      // Detect format by checking for skill.md
      let skillMdEntry: AdmZip.IZipEntry | null = null;
      let skillMdPath = "";
      let hasPythonDir = false;
      let hasJsDir = false;

      for (const entry of entries) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith("skill.md") || name.endsWith("skill.yaml") || name.endsWith("skill.yml")) {
          skillMdEntry = entry;
          skillMdPath = entry.entryName;
        }
        if (name.includes("/python/") || name.startsWith("python/")) {
          hasPythonDir = true;
        }
        if (name.includes("/js/") || name.startsWith("js/")) {
          hasJsDir = true;
        }
      }

      const isClaudeFormat = skillMdEntry !== null;
      let metadata: SkillMetadata = { name: input.slug };
      let skillContent = "";
      let systemPrompt = "";
      let knowledgebase = "";
      const knowledgeFiles: string[] = [];
      let importFormat: "shared-skill" | "custom-gpt" = "custom-gpt";

      if (isClaudeFormat && skillMdEntry) {
        // Shared skill bundle format
        importFormat = "shared-skill";
        const skillMdContent = skillMdEntry.getData().toString("utf-8");
        const parsed = parseSkillFile(skillMdContent);
        metadata = { ...metadata, ...parsed.metadata };
        skillContent = skillMdContent;
        // Body of the manifest markdown is the default LLM system prompt
        if (parsed.content) {
          systemPrompt = parsed.content;
        }

        // Extract knowledgebase from other text files
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const name = entry.entryName.toLowerCase();
          if (name === skillMdPath.toLowerCase()) continue;
          if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json")) {
            // Skip python/js files
            if (!name.includes("/python/") && !name.includes("/js/")) {
              knowledgeFiles.push(entry.entryName);
              knowledgebase += `--- ${entry.entryName} ---\n`;
              knowledgebase += entry.getData().toString("utf-8") + "\n\n";
            }
          }
        }
      } else {
        // SystemPrompt+KnowledgeBase format (Custom GPT)
        importFormat = "custom-gpt";

        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const name = entry.entryName.toLowerCase();

          if (name.includes("system") || name.includes("prompt") || name.includes("instructions")) {
            if (name.endsWith(".txt") || name.endsWith(".md")) {
              systemPrompt += entry.getData().toString("utf-8") + "\n\n";
            }
          } else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".json")) {
            knowledgeFiles.push(entry.entryName);
            knowledgebase += `--- ${entry.entryName} ---\n`;
            knowledgebase += entry.getData().toString("utf-8") + "\n\n";
          }
        }

        // Create skill.md content from system prompt
        skillContent = `---
name: ${input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
version: 1.0.0
description: Imported from Custom GPT (${input.fileName})
category: other
icon: bot
auto_trigger: false
enabled_by_default: true
---

# ${input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}

## System Prompt

${systemPrompt || "(No system prompt found in ZIP)"}

## Knowledgebase Files

${knowledgeFiles.map((f) => `- ${f}`).join("\n") || "(No knowledge files found)"}
`;
      }

      // Create skill folder
      const skillDir = path.join(SKILLS_DIR, input.slug);
      if (!fs.existsSync(skillDir)) {
        fs.mkdirSync(skillDir, { recursive: true });
      }

      // Write manifest aliases if the ZIP did not already include one
      if (!isClaudeFormat) {
        writeSkillManifestFiles(skillDir, skillContent);
      }

      // Extract the ZIP to the skill folder
      if (isClaudeFormat) {
        // For shared skill bundles, extract to root of skill folder
        extractZipToDirectory(zip, skillDir);
        mirrorExistingSkillManifest(skillDir);
      } else {
        // For Custom GPT format, extract to imported subfolder
        extractZipToDirectory(zip, path.join(skillDir, "imported"));
        writeSkillManifestFiles(skillDir, skillContent);
      }

      // Determine values based on format
      const skillName = metadata.name || input.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const skillDescription = metadata.description || (isClaudeFormat
        ? `Imported from shared skill bundle (${input.fileName})`
        : `Imported from Custom GPT (${input.fileName})`);
      const skillCategory = mapCategoryToEnum(metadata.category) as any || "other";
      const skillIcon = metadata.icon || (isClaudeFormat ? "sparkles" : "bot");
      const skillTags = metadata.tags || (isClaudeFormat ? ["shared-skill", "imported"] : ["custom-gpt", "imported"]);

      // Insert into database
      const [newSkill] = await dbInstance
        .insert(skills)
        .values({
          slug: input.slug,
          name: skillName,
          description: skillDescription,
          category: skillCategory,
          version: metadata.version || "1.0.0",
          author: metadata.author,
          icon: skillIcon,
          tags: skillTags,
          folderPath: `skills/${input.slug}`,
          isAutoTrigger: metadata.auto_trigger ?? false,
          triggerPatterns: metadata.trigger_patterns || [],
          isEnabled: true,
          enabledByDefault: metadata.enabled_by_default ?? false,
          creditMultiplier: String(metadata.credit_multiplier ?? 1.0),
          priority: metadata.priority ?? 50,
          llmModelId: metadata.llmModelId ?? metadata.llm_model_id ?? null,
          preferredProviderId: metadata.preferredProviderId ?? metadata.preferred_provider_id ?? null,
          strictProviderPin: metadata.strictProviderPin ?? metadata.strict_provider_pin ?? false,
          systemPrompt: systemPrompt || undefined,
          skillContent,
          marketplaceContent: generateMarketplaceContent(skillContent, { name: skillName, description: skillDescription }),
          knowledgebase: knowledgebase || undefined,
          configJson: metadata.config,
          visibleByDefault: false,
          importSource: "zip",
          importedFromZip: input.fileName,
          createdBy: ctx.user?.id,
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return {
        ...newSkill,
        importFormat,
        knowledgeFilesCount: knowledgeFiles.length,
        hasSystemPrompt: !!systemPrompt,
        hasPython: hasPythonDir,
        hasJs: hasJsDir,
      };
    }),

  /**
   * Get skill categories for filtering
   */
  getCategories: protectedProcedure.query(async () => {
    const dbInstance = await getDb();
    if (!dbInstance) return [];

    const result = await dbInstance
      .select({
        category: skills.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(skills)
      .where(eq(skills.isEnabled, true))
      .groupBy(skills.category);

    return result.map((r) => ({
      id: r.category,
      name: r.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count: Number(r.count),
    }));
  }),

  // ── User Skill Visibility ──────────────────────────────────────

  /**
   * Get user's visible skills (paginated, for chat panel)
   */
  getUserVisibleSkills: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      platform: localSkillPlatformSchema.optional(),
      origin: localSkillOriginSchema.optional(),
      conversationId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      await autoSyncSkillsFromFolder();
      const { localAiContext, executionMode } =
        await resolveLocalAiExecutionModeForSurface({
        userId: ctx.user.id,
        tenantId: ctx.tenantId ?? String(ctx.user.currentTenantId ?? ""),
        platform: input?.platform ?? "web",
        origin: input?.origin,
        conversationId: input?.conversationId,
      });
      const result = await _getUserVisibleSkills(ctx.user.id, {
        search: input?.search,
        category: input?.category,
        limit: input?.limit,
        offset: input?.offset,
      });
      return {
        ...result,
        skills: result.skills.map((skill) =>
          attachNativeBundleMetadata(
            attachLocalExecutionPolicy(
              skill,
              getSkillById(skill.slug),
              {
                platform: input?.platform,
                origin: input?.origin,
                userPresent: true,
                featureEnabled: localAiContext.policy.featureEnabled,
                forceCloudOnly: localAiContext.policy.forceCloudOnly,
                userEnabled: localAiContext.syncedPreferences.enabled,
                executionMode,
              },
            ),
            getSkillById(skill.slug),
          ),
        ),
      };
    }),

  /**
   * Browse ALL skills with visibility flag (for settings page)
   */
  browseAllSkills: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      platform: localSkillPlatformSchema.optional(),
      origin: localSkillOriginSchema.optional(),
      conversationId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      await autoSyncSkillsFromFolder();
      const { localAiContext, executionMode } =
        await resolveLocalAiExecutionModeForSurface({
        userId: ctx.user.id,
        tenantId: ctx.tenantId ?? String(ctx.user.currentTenantId ?? ""),
        platform: input?.platform ?? "web",
        origin: input?.origin,
        conversationId: input?.conversationId,
      });
      const result = await getAllSkillsForUser(ctx.user.id, {
        search: input?.search,
        category: input?.category,
        limit: input?.limit,
        offset: input?.offset,
      });
      return {
        ...result,
        skills: result.skills.map((skill) =>
          attachNativeBundleMetadata(
            attachLocalExecutionPolicy(
              skill,
              getSkillById(skill.slug),
              {
                platform: input?.platform,
                origin: input?.origin,
                userPresent: true,
                featureEnabled: localAiContext.policy.featureEnabled,
                forceCloudOnly: localAiContext.policy.forceCloudOnly,
                userEnabled: localAiContext.syncedPreferences.enabled,
                executionMode,
              },
            ),
            getSkillById(skill.slug),
          ),
        ),
      };
    }),

  /**
   * Toggle skill visibility for current user
   */
  toggleSkillVisibility: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      visible: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setSkillVisibility(ctx.user.id, input.skillId, input.visible);
      return { success: true };
    }),

  /**
   * Batch toggle visibility
   */
  batchToggleVisibility: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        skillId: z.number(),
        visible: z.boolean(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await batchSetVisibility(ctx.user.id, input.updates);
      return { success: true };
    }),

  /**
   * List ISC (Intelligence Skill Creator) proposals pending admin review.
   * Proposals are unified diffs saved in:
   *   apps/web/skills/intelligence-skill-creator/runs/proposals/<skill_name>/*.diff
   */
  listIscProposals: adminProcedure
    .query(async () => ({ proposals: await listIscProposalsWithOwners() })),

  /**
   * Preview an ISC proposal diff.
   */
  getIscProposalContent: adminProcedure
    .input(z.object({
      skillName: z.string().min(1).max(100).regex(/^[\w-]+$/),
      diffFile: z.string().min(1).max(200).regex(/^[\w.\-]+\.(diff|json)$/),
    }))
    .query(async ({ input }) => {
      try {
        return {
          skillName: input.skillName,
          diffFile: input.diffFile,
          content: await readIscProposalContent(input.skillName, input.diffFile),
        };
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "Proposal not found",
        });
      }
    }),

  /**
   * Apply an ISC proposal payload to the skill files (admin only).
   * Supports current JSON payload proposals and legacy .diff proposals.
   */
  applyIscProposal: adminProcedure
    .input(z.object({
      skillName: z.string().min(1).max(100).regex(/^[\w-]+$/),
      diffFile: z.string().min(1).max(200).regex(/^[\w.\-]+\.(diff|json)$/),
      recommendationId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await applyIscProposalFile(input.skillName, input.diffFile);

        if (input.recommendationId) {
          const dbInstance = await getDb();
          if (!dbInstance) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
          }

          const [recommendation] = await dbInstance
            .select()
            .from(skillImprovementRecommendations)
            .where(eq(skillImprovementRecommendations.id, input.recommendationId))
            .limit(1);

          if (!recommendation) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Recommendation ${input.recommendationId} not found` });
          }

          const [skill] = await dbInstance
            .select()
            .from(skills)
            .where(eq(skills.id, recommendation.skillId))
            .limit(1);

          if (!skill) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Skill ${recommendation.skillId} not found` });
          }

          const [run] = await dbInstance
            .insert(skillImprovementRuns)
            .values({
              skillId: skill.id,
              tenantId: skill.tenantId,
              recommendationId: recommendation.id,
              scheduleId: recommendation.scheduleId,
              runType: "verify",
              status: "running",
              triggerSource: "manual",
              requestedBy: ctx.user?.id ?? null,
              summary: `Verifying applied proposal ${input.diffFile} for ${skill.slug}`,
              logsJson: {
                diffFile: input.diffFile,
                skillName: input.skillName,
              },
              metricsJson: {},
              verificationJson: {},
              diffSummaryJson: {},
              startedAt: new Date(),
            })
            .returning();

          const [baselineSnapshotRow] = await dbInstance
            .select()
            .from(skillContractSnapshots)
            .where(and(
              eq(skillContractSnapshots.recommendationId, recommendation.id),
              eq(skillContractSnapshots.snapshotType, "baseline"),
            ))
            .orderBy(desc(skillContractSnapshots.capturedAt))
            .limit(1);

          if (baselineSnapshotRow) {
            const candidateSnapshot = buildSkillContractSnapshot({
              id: skill.id,
              slug: skill.slug,
              name: skill.name,
              description: skill.description,
              folderPath: skill.folderPath,
              executionMode: skill.executionMode,
              configJson: (skill.configJson as Record<string, unknown> | null) ?? null,
              sandboxProfileSlug: skill.sandboxProfileSlug,
              requiresNetwork: skill.requiresNetwork,
              requiresBrowser: skill.requiresBrowser,
            });

            const compatibilityReport = compareSkillContractSnapshots(
              {
                skillSlug: skill.slug,
                skillDir: null,
                bundleDir: null,
                manifestPath: baselineSnapshotRow.manifestPath,
                lockPath: null,
                executionMode: baselineSnapshotRow.executionMode,
                runtimeProfile: baselineSnapshotRow.runtimeProfile ?? "unknown",
                nativeBundleReady: false,
                nativeBundleFiles: [],
                inputSchemaHash: baselineSnapshotRow.inputSchemaHash,
                outputSchemaHash: baselineSnapshotRow.outputSchemaHash,
                testsHash: baselineSnapshotRow.testsHash,
                fixtureHash: baselineSnapshotRow.fixtureHash,
                manifestHash: baselineSnapshotRow.manifestHash,
                subagentManifestHash: null,
                contractHash: baselineSnapshotRow.contractHash ?? "",
                schemaSummary: baselineSnapshotRow.schemaSummaryJson as any,
                fileInventory: [],
              },
              candidateSnapshot,
            );

            await dbInstance.insert(skillContractSnapshots).values({
              skillId: skill.id,
              tenantId: skill.tenantId,
              recommendationId: recommendation.id,
              runId: run.id,
              snapshotType: "post_apply",
              executionMode: candidateSnapshot.executionMode,
              runtimeProfile: candidateSnapshot.runtimeProfile,
              manifestPath: candidateSnapshot.manifestPath,
              manifestHash: candidateSnapshot.manifestHash,
              inputSchemaHash: candidateSnapshot.inputSchemaHash,
              outputSchemaHash: candidateSnapshot.outputSchemaHash,
              fixtureHash: candidateSnapshot.fixtureHash,
              testsHash: candidateSnapshot.testsHash,
              contractHash: candidateSnapshot.contractHash,
              schemaSummaryJson: candidateSnapshot.schemaSummary,
              sampleInputsJson: [],
              sampleOutputsJson: [],
	              compatibilityNotesJson: {
	                status: compatibilityReport.status,
	                issues: compatibilityReport.issues,
	              },
              snapshotJson: {
                fileInventory: candidateSnapshot.fileInventory,
                source: "applyIscProposal",
                diffFile: input.diffFile,
              },
              capturedAt: new Date(),
              createdAt: new Date(),
            });

            await dbInstance
              .update(skillImprovementRecommendations)
              .set({
                status: compatibilityReport.status === "blocked" ? "blocked" : "applied",
                reviewedAt: new Date(),
                reviewedBy: ctx.user?.id ?? null,
                approvedAt: recommendation.approvedAt ?? new Date(),
                approvedBy: recommendation.approvedBy ?? ctx.user?.id ?? null,
                appliedAt: compatibilityReport.status === "blocked" ? null : new Date(),
                compatibilityStatus: compatibilityReport.status,
                updatedAt: new Date(),
              })
              .where(eq(skillImprovementRecommendations.id, recommendation.id));

            await dbInstance
              .update(skillImprovementRuns)
              .set({
                status: compatibilityReport.status === "blocked" ? "failed" : "completed",
                summary: compatibilityReport.status === "blocked"
                  ? `Proposal applied but compatibility gate blocked ${skill.slug}`
                  : `Proposal applied and verified for ${skill.slug}`,
                errorMessage: compatibilityReport.status === "blocked"
                  ? compatibilityReport.issues.map((issue) => issue.message).join(" ")
                  : null,
	                verificationJson: {
	                  status: compatibilityReport.status,
	                  issues: compatibilityReport.issues,
	                },
                endedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(skillImprovementRuns.id, run.id));
          }
        }

        return { success: true, output: result.output };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Apply failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  analyzeUpgrade: adminProcedure
    .input(z.object({
      skillId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.id, input.skillId))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill ${input.skillId} not found` });
      }

      const result = await persistSkillMaintenanceAnalysis({
        db: dbInstance,
        skill,
        requestedBy: ctx.user?.id ?? null,
        triggerSource: "manual",
      });

      return {
        skillId: skill.id,
        skillSlug: skill.slug,
        qualityScore: result.analysis.qualityScore,
        currentRuntime: result.analysis.currentRuntime,
        isGenjsCandidate: result.analysis.isGenjsCandidate,
        genjsCandidateScore: result.analysis.genjsCandidateScore,
        run: result.run,
        recommendations: result.recommendations,
      };
    }),

  getUpgradeRecommendations: adminProcedure
    .input(z.object({
      skillId: z.number().int().positive().optional(),
      status: z.enum(["pending_review", "approved", "dismissed", "applied", "blocked", "failed"]).optional(),
      riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
      recommendationType: z.string().min(1).max(100).optional(),
      includeDismissed: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const conditions = [];
      if (input?.skillId) {
        conditions.push(eq(skillImprovementRecommendations.skillId, input.skillId));
      }
      if (input?.status) {
        conditions.push(eq(skillImprovementRecommendations.status, input.status));
      } else if (!input?.includeDismissed) {
        conditions.push(inArray(skillImprovementRecommendations.status, [
          "pending_review",
          "approved",
          "blocked",
          "failed",
          "applied",
        ]));
      }
      if (input?.riskLevel) {
        conditions.push(eq(skillImprovementRecommendations.riskLevel, input.riskLevel));
      }
      if (input?.recommendationType) {
        conditions.push(eq(skillImprovementRecommendations.recommendationType, input.recommendationType));
      }

      let query = dbInstance.select().from(skillImprovementRecommendations);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }
      query = query.orderBy(desc(skillImprovementRecommendations.analyzedAt)) as typeof query;
      if (input?.limit) {
        query = query.limit(input.limit) as typeof query;
      }
      if (input?.offset) {
        query = query.offset(input.offset) as typeof query;
      }

      const rows = await query;
      const skillIds = Array.from(new Set(rows.map((row) => row.skillId)));
      const relatedSkills = skillIds.length > 0
        ? await dbInstance
          .select({
            id: skills.id,
            slug: skills.slug,
            name: skills.name,
            category: skills.category,
            executionMode: skills.executionMode,
            sandboxProfileSlug: skills.sandboxProfileSlug,
          })
          .from(skills)
          .where(inArray(skills.id, skillIds))
        : [];
      const skillMap = new Map(relatedSkills.map((skill) => [skill.id, skill]));

      const latestRunRows = rows.length > 0
        ? await dbInstance
          .select({
            id: skillImprovementRuns.id,
            recommendationId: skillImprovementRuns.recommendationId,
            runType: skillImprovementRuns.runType,
            status: skillImprovementRuns.status,
            summary: skillImprovementRuns.summary,
            errorMessage: skillImprovementRuns.errorMessage,
            verificationJson: skillImprovementRuns.verificationJson,
            logsJson: skillImprovementRuns.logsJson,
            startedAt: skillImprovementRuns.startedAt,
            endedAt: skillImprovementRuns.endedAt,
            createdAt: skillImprovementRuns.createdAt,
            updatedAt: skillImprovementRuns.updatedAt,
          })
          .from(skillImprovementRuns)
          .where(inArray(skillImprovementRuns.recommendationId, rows.map((row) => row.id)))
          .orderBy(desc(skillImprovementRuns.createdAt))
        : [];

      const latestRunByRecommendationId = new Map<number, (typeof latestRunRows)[number]>();
      for (const run of latestRunRows) {
        if (run.recommendationId == null) {
          continue;
        }
        const existing = latestRunByRecommendationId.get(run.recommendationId);
        if (!existing || (existing.runType !== "apply" && run.runType === "apply")) {
          latestRunByRecommendationId.set(run.recommendationId, run);
        }
      }

      return rows.map((row) => ({
        ...row,
        skill: skillMap.get(row.skillId) ?? null,
        latestRun: latestRunByRecommendationId.get(row.id) ?? null,
      }));
    }),

  getLegacyUpgradeQueue: adminProcedure
    .input(z.object({
      includeApplied: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const statuses = input?.includeApplied
        ? (["pending_review", "approved", "blocked", "failed", "applied"] as const)
        : (["pending_review", "approved", "blocked", "failed"] as const);

      const rows = await dbInstance
        .select()
        .from(skillImprovementRecommendations)
        .where(and(
          inArray(skillImprovementRecommendations.status, statuses),
          or(
            eq(skillImprovementRecommendations.recommendationType, "native-bundle-upgrade"),
            eq(skillImprovementRecommendations.recommendationType, "migrate-to-native-bundle"),
          ),
        ))
        .orderBy(desc(skillImprovementRecommendations.analyzedAt))
        .limit(input?.limit ?? 100);

      if (rows.length === 0) {
        await maybeSeedLegacyUpgradeQueue({
          dbInstance,
          tenantId: null,
          requestedBy: null,
        });
      }

      const seededRows = rows.length === 0
        ? await dbInstance
          .select()
          .from(skillImprovementRecommendations)
          .where(and(
            inArray(skillImprovementRecommendations.status, statuses),
            or(
              eq(skillImprovementRecommendations.recommendationType, "native-bundle-upgrade"),
              eq(skillImprovementRecommendations.recommendationType, "migrate-to-native-bundle"),
            ),
          ))
          .orderBy(desc(skillImprovementRecommendations.analyzedAt))
          .limit(input?.limit ?? 100)
        : rows;

      const skillIds = Array.from(new Set(seededRows.map((row) => row.skillId)));
      const relatedSkills = skillIds.length > 0
        ? await dbInstance
          .select({
            id: skills.id,
            slug: skills.slug,
            name: skills.name,
            category: skills.category,
            executionMode: skills.executionMode,
            sandboxProfileSlug: skills.sandboxProfileSlug,
          })
        .from(skills)
        .where(inArray(skills.id, skillIds))
        : [];
      const skillMap = new Map(relatedSkills.map((skill) => [skill.id, skill]));

      const queue = seededRows.map((row) => {
        const recommendationJson = (row.recommendationJson as Record<string, unknown> | null) ?? {};
        const upgradePriorityScore = typeof recommendationJson.upgradePriorityScore === "number"
          ? recommendationJson.upgradePriorityScore
          : 0;
        const upgradePriorityTier = typeof recommendationJson.upgradePriorityTier === "string"
          ? recommendationJson.upgradePriorityTier
          : "low";
        const parallelUpgradeEligible = Boolean(recommendationJson.parallelUpgradeEligible);
        const legacyUpgradeSignals = recommendationJson.legacyUpgradeSignals && typeof recommendationJson.legacyUpgradeSignals === "object"
          ? recommendationJson.legacyUpgradeSignals as Record<string, unknown>
          : null;

        return {
          ...row,
          upgradePriorityScore,
          upgradePriorityTier,
          parallelUpgradeEligible,
          legacyUpgradeSignals,
          skill: skillMap.get(row.skillId) ?? null,
        };
      });

      const latestRunRows = queue.length > 0
        ? await dbInstance
          .select({
            id: skillImprovementRuns.id,
            recommendationId: skillImprovementRuns.recommendationId,
            runType: skillImprovementRuns.runType,
            status: skillImprovementRuns.status,
            summary: skillImprovementRuns.summary,
            errorMessage: skillImprovementRuns.errorMessage,
            verificationJson: skillImprovementRuns.verificationJson,
            logsJson: skillImprovementRuns.logsJson,
            startedAt: skillImprovementRuns.startedAt,
            endedAt: skillImprovementRuns.endedAt,
            createdAt: skillImprovementRuns.createdAt,
            updatedAt: skillImprovementRuns.updatedAt,
          })
          .from(skillImprovementRuns)
          .where(inArray(skillImprovementRuns.recommendationId, queue.map((item) => item.id)))
          .orderBy(desc(skillImprovementRuns.createdAt))
        : [];

      const latestRunByRecommendationId = new Map<number, (typeof latestRunRows)[number]>();
      for (const run of latestRunRows) {
        if (run.recommendationId == null) {
          continue;
        }
        const existing = latestRunByRecommendationId.get(run.recommendationId);
        if (!existing || (existing.runType !== "apply" && run.runType === "apply")) {
          latestRunByRecommendationId.set(run.recommendationId, run);
        }
      }

      const visibleQueue = input?.includeApplied
        ? queue
        : queue.filter((item) => !isLegacyUpgradeCompletedHistoryRun(latestRunByRecommendationId.get(item.id)));

      visibleQueue.sort((left, right) => {
        if (right.upgradePriorityScore !== left.upgradePriorityScore) {
          return right.upgradePriorityScore - left.upgradePriorityScore;
        }
        const leftQuality = left.qualityScore ?? 0;
        const rightQuality = right.qualityScore ?? 0;
        if (rightQuality !== leftQuality) {
          return rightQuality - leftQuality;
        }
        return String(left.skill?.slug ?? "").localeCompare(String(right.skill?.slug ?? ""));
      });

      return visibleQueue.map((item) => ({
        ...item,
        latestRun: latestRunByRecommendationId.get(item.id) ?? null,
      }));
    }),

  getLegacyUpgradeQueueSummary: adminProcedure
    .input(z.object({
      includeApplied: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const statuses = input?.includeApplied
        ? (["pending_review", "approved", "blocked", "failed", "applied"] as const)
        : (["pending_review", "approved", "blocked", "failed"] as const);

      const [row] = await dbInstance
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(skillImprovementRecommendations)
        .where(and(
          inArray(skillImprovementRecommendations.status, statuses),
          or(
            eq(skillImprovementRecommendations.recommendationType, "native-bundle-upgrade"),
            eq(skillImprovementRecommendations.recommendationType, "migrate-to-native-bundle"),
          ),
        ));

      if ((row?.count ?? 0) === 0) {
        await maybeSeedLegacyUpgradeQueue({
          dbInstance,
          tenantId: null,
          requestedBy: null,
        });
      }

      const [seededRow] = ((row?.count ?? 0) === 0
        ? await dbInstance
          .select({
            count: sql<number>`count(*)::int`,
          })
          .from(skillImprovementRecommendations)
          .where(and(
            inArray(skillImprovementRecommendations.status, statuses),
            or(
              eq(skillImprovementRecommendations.recommendationType, "native-bundle-upgrade"),
              eq(skillImprovementRecommendations.recommendationType, "migrate-to-native-bundle"),
            ),
          ))
        : [row]);

      return {
        count: seededRow?.count ?? 0,
      };
    }),

  getLegacyUpgradeApplyRuns: adminProcedure
    .input(z.object({
      state: z.enum(["all", "queued", "running", "failed", "completed", "blocked", "canceled"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).optional())
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const rows = await dbInstance
        .select({
          id: skillImprovementRuns.id,
          recommendationId: skillImprovementRuns.recommendationId,
          skillId: skillImprovementRuns.skillId,
          runType: skillImprovementRuns.runType,
          status: skillImprovementRuns.status,
          summary: skillImprovementRuns.summary,
          errorMessage: skillImprovementRuns.errorMessage,
          verificationJson: skillImprovementRuns.verificationJson,
          logsJson: skillImprovementRuns.logsJson,
          startedAt: skillImprovementRuns.startedAt,
          endedAt: skillImprovementRuns.endedAt,
          createdAt: skillImprovementRuns.createdAt,
          updatedAt: skillImprovementRuns.updatedAt,
          recommendationType: skillImprovementRecommendations.recommendationType,
          recommendationStatus: skillImprovementRecommendations.status,
          recommendationTitle: skillImprovementRecommendations.title,
          recommendationRiskLevel: skillImprovementRecommendations.riskLevel,
          recommendationCompatibilityStatus: skillImprovementRecommendations.compatibilityStatus,
          recommendationQualityScore: skillImprovementRecommendations.qualityScore,
          recommendationCurrentRuntime: skillImprovementRecommendations.currentRuntime,
          recommendationProposedRuntime: skillImprovementRecommendations.proposedRuntime,
          recommendationProposedAction: skillImprovementRecommendations.proposedAction,
          recommendationIsAutoApplySafe: skillImprovementRecommendations.isAutoApplySafe,
          recommendationJson: skillImprovementRecommendations.recommendationJson,
          skillSlug: skills.slug,
          skillName: skills.name,
          skillExecutionMode: skills.executionMode,
        })
        .from(skillImprovementRuns)
        .leftJoin(skillImprovementRecommendations, eq(skillImprovementRuns.recommendationId, skillImprovementRecommendations.id))
        .leftJoin(skills, eq(skillImprovementRuns.skillId, skills.id))
        .where(eq(skillImprovementRuns.runType, "apply"))
        .orderBy(desc(skillImprovementRuns.createdAt))
        .limit(input?.limit ?? 100);

      const latestApplyRunByRecommendationId = new Map<number, (typeof rows)[number]>();
      for (const row of rows) {
        if (row.recommendationId == null) {
          continue;
        }
        if (!latestApplyRunByRecommendationId.has(row.recommendationId)) {
          latestApplyRunByRecommendationId.set(row.recommendationId, row);
        }
      }

      const items = Array.from(latestApplyRunByRecommendationId.values()).map((row) => {
        const queueState = deriveLegacyUpgradeRunState(row.status);
        const resultMessage = extractLegacyRunStringField(row.logsJson, "resultMessage");
        const resultError = extractLegacyRunStringField(row.logsJson, "resultError") ?? row.errorMessage ?? null;
        const workspaceRootIssue = isLegacyUpgradeWorkspaceRootIssue(row.logsJson, `${resultMessage || ""} ${resultError || ""} ${row.summary || ""}`);
        return {
          ...row,
          queueState,
          taskId: extractLegacyRunTaskId(row.logsJson),
          resolvedLlmModelId: extractLegacyRunStringField(row.logsJson, "resolvedLlmModelId"),
          resultMessage,
          resultError,
          diagnosticCode: workspaceRootIssue ? "isc_workspace_root_pollution" : extractLegacyRunStringField(row.logsJson, "failureCode"),
          workspaceRootIssue,
          workspaceRoot: extractLegacyRunStringField(row.logsJson, "workspaceRoot"),
          proposalRoot: extractLegacyRunStringField(row.logsJson, "proposalRoot"),
          entrypointRoot: extractLegacyRunStringField(row.logsJson, "entrypointRoot"),
          canonicalIscRoot: extractLegacyRunStringField(row.logsJson, "canonicalIscRoot"),
          sourceRunId: extractLegacyRunNumberField(row.logsJson, "sourceRunId"),
          retryReason: extractLegacyRunStringField(row.logsJson, "retryReason"),
          latestRun: {
            id: row.id,
            runType: row.runType,
            status: row.status,
            summary: row.summary,
            errorMessage: row.errorMessage,
            verificationJson: row.verificationJson,
            logsJson: row.logsJson,
            lineage: extractLegacyRunLineage(row.logsJson),
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
          recommendation: row.recommendationId
            ? {
              id: row.recommendationId,
              recommendationType: row.recommendationType,
              status: row.recommendationStatus,
              title: row.recommendationTitle,
              riskLevel: row.recommendationRiskLevel,
              compatibilityStatus: row.recommendationCompatibilityStatus,
              qualityScore: row.recommendationQualityScore,
              currentRuntime: row.recommendationCurrentRuntime,
              proposedRuntime: row.recommendationProposedRuntime,
              proposedAction: row.recommendationProposedAction,
              isAutoApplySafe: row.recommendationIsAutoApplySafe,
              recommendationJson: row.recommendationJson,
            }
            : null,
          skill: row.skillId && row.skillSlug
            ? {
              id: row.skillId,
              slug: row.skillSlug,
              name: row.skillName,
              executionMode: row.skillExecutionMode,
            }
            : null,
        };
      });

      const activeItems = items.filter((item) => item.queueState !== "completed" && item.queueState !== "canceled");
      const filteredItems = input?.state && input.state !== "all"
        ? items.filter((item) => item.queueState === input.state)
        : activeItems;

      const counts = items.reduce((acc, item) => {
        if (item.queueState !== "completed" && item.queueState !== "canceled") {
          acc.total += 1;
        }
        acc[item.queueState] += 1;
        return acc;
      }, {
        total: 0,
        queued: 0,
        running: 0,
        failed: 0,
        completed: 0,
        blocked: 0,
        canceled: 0,
      });

      return {
        counts,
        items: filteredItems.slice(0, input?.limit ?? 100),
      };
    }),

  getLegacyUpgradeApplyRunDetail: adminProcedure
    .input(z.object({
      runId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [row] = await dbInstance
        .select({
          id: skillImprovementRuns.id,
          recommendationId: skillImprovementRuns.recommendationId,
          skillId: skillImprovementRuns.skillId,
          runType: skillImprovementRuns.runType,
          status: skillImprovementRuns.status,
          summary: skillImprovementRuns.summary,
          errorMessage: skillImprovementRuns.errorMessage,
          verificationJson: skillImprovementRuns.verificationJson,
          logsJson: skillImprovementRuns.logsJson,
          diffSummaryJson: skillImprovementRuns.diffSummaryJson,
          scopeJson: skillImprovementRuns.scopeJson,
          startedAt: skillImprovementRuns.startedAt,
          endedAt: skillImprovementRuns.endedAt,
          createdAt: skillImprovementRuns.createdAt,
          updatedAt: skillImprovementRuns.updatedAt,
          recommendationType: skillImprovementRecommendations.recommendationType,
          recommendationStatus: skillImprovementRecommendations.status,
          recommendationTitle: skillImprovementRecommendations.title,
          recommendationSummary: skillImprovementRecommendations.summary,
          recommendationRationale: skillImprovementRecommendations.rationale,
          recommendationRiskLevel: skillImprovementRecommendations.riskLevel,
          recommendationCompatibilityStatus: skillImprovementRecommendations.compatibilityStatus,
          recommendationQualityScore: skillImprovementRecommendations.qualityScore,
          recommendationCurrentRuntime: skillImprovementRecommendations.currentRuntime,
          recommendationProposedRuntime: skillImprovementRecommendations.proposedRuntime,
          recommendationProposedAction: skillImprovementRecommendations.proposedAction,
          recommendationIsAutoApplySafe: skillImprovementRecommendations.isAutoApplySafe,
          recommendationJson: skillImprovementRecommendations.recommendationJson,
          skillSlug: skills.slug,
          skillName: skills.name,
          skillDescription: skills.description,
          skillExecutionMode: skills.executionMode,
          skillFolderPath: skills.folderPath,
        })
        .from(skillImprovementRuns)
        .leftJoin(skillImprovementRecommendations, eq(skillImprovementRuns.recommendationId, skillImprovementRecommendations.id))
        .leftJoin(skills, eq(skillImprovementRuns.skillId, skills.id))
        .where(eq(skillImprovementRuns.id, input.runId))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Apply run ${input.runId} not found` });
      }

      const snapshots = await dbInstance
        .select()
        .from(skillContractSnapshots)
        .where(eq(skillContractSnapshots.runId, row.id))
        .orderBy(desc(skillContractSnapshots.capturedAt))
        .limit(20);

      const relatedRunsRaw = row.recommendationId
        ? await dbInstance
          .select()
          .from(skillImprovementRuns)
          .where(eq(skillImprovementRuns.recommendationId, row.recommendationId))
          .orderBy(desc(skillImprovementRuns.createdAt))
          .limit(10)
        : [];

      type LegacyUpgradeRunDetailRow = {
        id: number;
        recommendationId: number | null;
        skillId: number | null;
        runType: "analysis" | "apply" | "sweep" | "verify";
        status: "blocked" | "failed" | "queued" | "running" | "completed" | "canceled";
        summary: string | null;
        errorMessage: string | null;
        verificationJson: unknown;
        logsJson: unknown;
        diffSummaryJson: unknown;
        scopeJson: unknown;
        startedAt: Date | null;
        endedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      };

      const mapRun = (run: LegacyUpgradeRunDetailRow) => ({
        id: run.id,
        recommendationId: run.recommendationId,
        skillId: run.skillId,
        runType: run.runType,
        status: run.status,
        summary: run.summary,
        errorMessage: run.errorMessage,
        verificationJson: run.verificationJson,
        logsJson: run.logsJson,
        diffSummaryJson: run.diffSummaryJson,
        scopeJson: run.scopeJson,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        queueState: deriveLegacyUpgradeRunState(run.status),
        taskId: extractLegacyRunTaskId(run.logsJson),
        resolvedLlmModelId: extractLegacyRunStringField(run.logsJson, "resolvedLlmModelId"),
        repoRoot: extractLegacyRunStringField(run.logsJson, "repoRoot"),
        workspaceRoot: extractLegacyRunStringField(run.logsJson, "workspaceRoot"),
        resultMessage: extractLegacyRunStringField(run.logsJson, "resultMessage"),
        resultError: extractLegacyRunStringField(run.logsJson, "resultError") ?? run.errorMessage ?? null,
        sourceRunId: extractLegacyRunNumberField(run.logsJson, "sourceRunId"),
        retryReason: extractLegacyRunStringField(run.logsJson, "retryReason"),
        lineage: extractLegacyRunLineage(run.logsJson),
      });

      const recommendation = row.recommendationId ? {
        id: row.recommendationId,
        recommendationType: row.recommendationType,
        status: row.recommendationStatus,
        title: row.recommendationTitle,
        summary: row.recommendationSummary,
        rationale: row.recommendationRationale,
        riskLevel: row.recommendationRiskLevel,
        compatibilityStatus: row.recommendationCompatibilityStatus,
        qualityScore: row.recommendationQualityScore,
        currentRuntime: row.recommendationCurrentRuntime,
        proposedRuntime: row.recommendationProposedRuntime,
        proposedAction: row.recommendationProposedAction,
        isAutoApplySafe: row.recommendationIsAutoApplySafe,
        recommendationJson: row.recommendationJson,
      } : null;

      const skill = row.skillId && row.skillSlug ? {
        id: row.skillId,
        slug: row.skillSlug,
        name: row.skillName,
        description: row.skillDescription,
        executionMode: row.skillExecutionMode,
        folderPath: row.skillFolderPath,
      } : null;

      return {
        run: mapRun(row),
        recommendation,
        skill,
        snapshots,
        relatedRuns: relatedRunsRaw.map(mapRun),
      };
    }),

  getUpgradeRecommendationDetail: adminProcedure
    .input(z.object({
      recommendationId: z.number().int().positive(),
    }))
    .query(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [recommendation] = await dbInstance
        .select()
        .from(skillImprovementRecommendations)
        .where(eq(skillImprovementRecommendations.id, input.recommendationId))
        .limit(1);

      if (!recommendation) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Recommendation ${input.recommendationId} not found` });
      }

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.id, recommendation.skillId))
        .limit(1);

      const snapshots = await dbInstance
        .select()
        .from(skillContractSnapshots)
        .where(eq(skillContractSnapshots.recommendationId, recommendation.id))
        .orderBy(desc(skillContractSnapshots.capturedAt))
        .limit(5);

      const runs = await dbInstance
        .select()
        .from(skillImprovementRuns)
        .where(eq(skillImprovementRuns.recommendationId, recommendation.id))
        .orderBy(desc(skillImprovementRuns.createdAt))
        .limit(10);

      return {
        recommendation,
        skill: skill ?? null,
        snapshots,
        runs,
      };
    }),

  dismissUpgradeRecommendation: adminProcedure
    .input(z.object({
      recommendationId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [updated] = await dbInstance
        .update(skillImprovementRecommendations)
        .set({
          status: "dismissed",
          dismissedAt: new Date(),
          dismissedBy: ctx.user?.id ?? null,
          reviewedAt: new Date(),
          reviewedBy: ctx.user?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(skillImprovementRecommendations.id, input.recommendationId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Recommendation ${input.recommendationId} not found` });
      }

      return updated;
    }),

  createMediaStudioSkillImprovementRecommendation: adminProcedure
    .input(z.object({
      skillSlug: z.string().min(1).max(100),
      trigger: z.enum(["prompt_qa", "image_qa", "video_qa", "manual"]),
      score: z.number().int().min(0).max(100).optional(),
      issues: z.array(z.object({
        id: z.string().min(1).max(100),
        severity: z.enum(["low", "medium", "high"]),
        title: z.string().min(1).max(255),
        evidence: z.string().max(2000).optional(),
        recommendation: z.string().min(1).max(2000),
        affectedSection: z.string().max(255).optional(),
      })).min(1).max(20),
      proposedChanges: z.array(z.object({
        title: z.string().min(1).max(255),
        reason: z.string().min(1).max(2000),
        targetFile: z.string().min(1).max(255),
        targetSection: z.string().max(255).optional(),
        risk: z.enum(["low", "medium", "high"]),
      })).min(1).max(20),
      userAdditionalInstruction: z.string().max(4000).optional(),
      evidence: z.object({
        promptPreview: z.string().max(4000).optional(),
        activeTab: z.enum(["image", "video", "audio"]).optional(),
        source: z.string().max(100).optional(),
        skillName: z.string().max(255).optional(),
        skillSlug: z.string().max(100).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.slug, input.skillSlug))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill '${input.skillSlug}' not found` });
      }

      const highCount = input.issues.filter((issue) => issue.severity === "high").length;
      const mediumCount = input.issues.filter((issue) => issue.severity === "medium").length;
      const riskLevel = highCount > 0 ? "high" : mediumCount > 0 ? "medium" : "low";
      const score = input.score ?? Math.max(0, 100 - highCount * 18 - mediumCount * 10 - (input.issues.length - highCount - mediumCount) * 4);
      const now = new Date();
      const adminInstruction = input.userAdditionalInstruction?.trim() || "";
      const affectedFiles = Array.from(new Set(input.proposedChanges.map((change) => change.targetFile)));

      const recommendationJson = {
        source: "media_studio_auto_learning",
        trigger: input.trigger,
        score,
        adminOnly: true,
        affectedFiles,
        issues: input.issues,
        proposedChanges: input.proposedChanges,
        userAdditionalInstruction: adminInstruction,
        details: {
          source: "media_studio_auto_learning",
          issues: input.issues,
          proposedChanges: input.proposedChanges,
          userAdditionalInstruction: adminInstruction,
          evidence: input.evidence ?? {},
        },
        skill: {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          executionMode: skill.executionMode,
        },
        evidence: input.evidence ?? {},
      };

      const existingRecommendation = await findExistingMediaStudioImprovementRecommendation(
        dbInstance,
        skill.id,
        input,
      );
      if (existingRecommendation) {
        return { recommendation: existingRecommendation, duplicate: true as const };
      }

      const [recommendation] = await dbInstance
        .insert(skillImprovementRecommendations)
        .values({
          skillId: skill.id,
          tenantId: ctx.tenantId ?? null,
          recommendationType: "media-studio-auto-learning",
          title: `Media Studio improvement proposal: ${skill.name}`,
          summary: input.issues.map((issue) => issue.title).join("; ").slice(0, 1000),
          rationale: [
            `Generated from Media Studio ${input.trigger.replace("_", " ")} review.`,
            adminInstruction ? `Admin instruction: ${adminInstruction}` : "",
          ].filter(Boolean).join("\n\n"),
          status: "pending_review",
          riskLevel,
          compatibilityStatus: "unknown",
          qualityScore: score,
          confidenceScore: 70,
          currentRuntime: skill.executionMode ?? null,
          proposedRuntime: skill.executionMode ?? null,
          proposedAction: "review-and-patch-skill-instructions",
          isAutoApplySafe: true,
          recommendationJson,
          contractDeltaJson: {
            expectedFiles: affectedFiles,
            contractImpact: "instruction-only proposal; admin confirmation applies through maintenance runner and compatibility verification",
          },
          analyzedAt: now,
          reviewedAt: now,
          reviewedBy: ctx.user?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await dbInstance.insert(skillImprovementRuns).values({
        skillId: skill.id,
        tenantId: ctx.tenantId ?? null,
        recommendationId: recommendation.id,
        runType: "analysis",
        status: "completed",
        triggerSource: "media_studio",
        requestedBy: ctx.user?.id ?? null,
        summary: `Created Media Studio improvement proposal with ${input.issues.length} issue(s).`,
        scopeJson: {
          skillSlug: input.skillSlug,
          trigger: input.trigger,
          activeTab: input.evidence?.activeTab ?? null,
        },
        logsJson: recommendationJson,
        metricsJson: { score, issueCount: input.issues.length },
        verificationJson: {
          status: "pending_admin_review",
          requiresAdminApproval: true,
        },
        startedAt: now,
        endedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { recommendation, duplicate: false as const };
    }),

  createMediaStudioSkillAutoLearningSignal: protectedProcedure
    .input(z.object({
      skillSlug: z.string().min(1).max(100),
      trigger: z.enum(["prompt_qa", "image_qa", "video_qa", "manual"]),
      score: z.number().int().min(0).max(100).optional(),
      issues: z.array(z.object({
        id: z.string().min(1).max(100),
        severity: z.enum(["low", "medium", "high"]),
        title: z.string().min(1).max(255),
        evidence: z.string().max(2000).optional(),
        recommendation: z.string().min(1).max(2000),
        affectedSection: z.string().max(255).optional(),
      })).min(1).max(20),
      proposedChanges: z.array(z.object({
        title: z.string().min(1).max(255),
        reason: z.string().min(1).max(2000),
        targetFile: z.string().min(1).max(255),
        targetSection: z.string().max(255).optional(),
        risk: z.enum(["low", "medium", "high"]),
      })).min(1).max(20),
      evidence: z.object({
        promptPreview: z.string().max(4000).optional(),
        activeTab: z.enum(["image", "video", "audio"]).optional(),
        source: z.string().max(100).optional(),
        skillName: z.string().max(255).optional(),
        skillSlug: z.string().max(100).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [skill] = await dbInstance
        .select()
        .from(skills)
        .where(eq(skills.slug, input.skillSlug))
        .limit(1);

      if (!skill) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Skill '${input.skillSlug}' not found` });
      }

      const configJson = (skill.configJson && typeof skill.configJson === "object")
        ? skill.configJson as Record<string, any>
        : {};
      const autoLearning = configJson.media_studio?.auto_learning;
      const isGeminiOmniVideoQaSignal =
        input.trigger === "video_qa" && skill.slug === "gemini-omni-video-director";
      if ((!autoLearning || autoLearning.enabled !== true) && !isGeminiOmniVideoQaSignal) {
        return { skipped: true as const, reason: "auto_learning_disabled" as const };
      }
      if (input.trigger === "prompt_qa" && autoLearning?.prompt_qa_after_auto_prompt === false) {
        return { skipped: true as const, reason: "prompt_qa_disabled" as const };
      }
      if (input.trigger === "image_qa" && autoLearning?.image_qa_after_generation === false) {
        return { skipped: true as const, reason: "image_qa_disabled" as const };
      }
      if (input.trigger === "video_qa" && autoLearning?.video_qa_after_generation === false) {
        return { skipped: true as const, reason: "video_qa_disabled" as const };
      }

      const highCount = input.issues.filter((issue) => issue.severity === "high").length;
      const mediumCount = input.issues.filter((issue) => issue.severity === "medium").length;
      const riskLevel = highCount > 0 ? "high" : mediumCount > 0 ? "medium" : "low";
      const score = input.score ?? Math.max(0, 100 - highCount * 18 - mediumCount * 10 - (input.issues.length - highCount - mediumCount) * 4);
      const now = new Date();
      const affectedFiles = Array.from(new Set(input.proposedChanges.map((change) => change.targetFile)));
      const recommendationJson = {
        source: "media_studio_auto_learning",
        trigger: input.trigger,
        score,
        adminOnly: true,
        silentUserSignal: true,
        affectedFiles,
        issues: input.issues,
        proposedChanges: input.proposedChanges,
        details: {
          source: "media_studio_auto_learning",
          issues: input.issues,
          proposedChanges: input.proposedChanges,
          evidence: input.evidence ?? {},
          silentUserSignal: true,
        },
        skill: {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          executionMode: skill.executionMode,
        },
        evidence: {
          ...(input.evidence ?? {}),
          reportedByUserId: ctx.user?.id ?? null,
        },
      };

      const existingRecommendation = await findExistingMediaStudioImprovementRecommendation(
        dbInstance,
        skill.id,
        input,
      );
      if (existingRecommendation) {
        return {
          skipped: true as const,
          reason: "duplicate_existing_recommendation" as const,
          recommendationId: existingRecommendation.id,
        };
      }

      const [recommendation] = await dbInstance
        .insert(skillImprovementRecommendations)
        .values({
          skillId: skill.id,
          tenantId: ctx.tenantId ?? null,
          recommendationType: "media-studio-auto-learning",
          title: `Media Studio auto-learning signal: ${skill.name}`,
          summary: input.issues.map((issue) => issue.title).join("; ").slice(0, 1000),
          rationale: `Generated silently from Media Studio ${input.trigger.replace("_", " ")} review by a skill user.`,
          status: "pending_review",
          riskLevel,
          compatibilityStatus: "unknown",
          qualityScore: score,
          confidenceScore: 65,
          currentRuntime: skill.executionMode ?? null,
          proposedRuntime: skill.executionMode ?? null,
          proposedAction: "review-and-patch-skill-instructions",
          isAutoApplySafe: true,
          recommendationJson,
          contractDeltaJson: {
            expectedFiles: affectedFiles,
            contractImpact: "instruction-only auto-learning signal; admin confirmation applies through maintenance runner and compatibility verification",
          },
          analyzedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await dbInstance.insert(skillImprovementRuns).values({
        skillId: skill.id,
        tenantId: ctx.tenantId ?? null,
        recommendationId: recommendation.id,
        runType: "analysis",
        status: "completed",
        triggerSource: "media_studio",
        requestedBy: ctx.user?.id ?? null,
        summary: `Captured silent Media Studio auto-learning signal with ${input.issues.length} issue(s).`,
        scopeJson: {
          skillSlug: input.skillSlug,
          trigger: input.trigger,
          activeTab: input.evidence?.activeTab ?? null,
          silentUserSignal: true,
        },
        logsJson: recommendationJson,
        metricsJson: { score, issueCount: input.issues.length },
        verificationJson: {
          status: "pending_admin_review",
          requiresAdminApproval: true,
        },
        startedAt: now,
        endedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { skipped: false as const, recommendationId: recommendation.id };
    }),

  applyUpgradeRecommendation: adminProcedure
    .input(z.object({
      recommendationId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      try {
        const result = await applySkillUpgradeRecommendation({
          db: dbInstance,
          recommendationId: input.recommendationId,
          requestedBy: ctx.user?.id ?? null,
          tenantId: ctx.tenantId ?? null,
          userRole: ctx.user?.role ?? "admin",
          userToken: ctx.userToken ?? null,
          publicUrl: ctx.publicUrl ?? null,
        });

        if (result.compatibilityReport?.status === "blocked" && result.mode === "applied") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Compatibility gate blocked this apply attempt.",
          });
        }

        return result;
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to apply upgrade recommendation",
        });
      }
    }),

  applyMaintenanceRecommendations: adminProcedure
    .input(z.object({
      recommendationIds: z.array(z.number().int().positive()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const uniqueIds = Array.from(new Set(input.recommendationIds));
      const results = await Promise.all(uniqueIds.map(async (recommendationId) => {
        try {
          const result = await applySkillUpgradeRecommendation({
            db: dbInstance,
            recommendationId,
            requestedBy: ctx.user?.id ?? null,
            tenantId: ctx.tenantId ?? null,
            userRole: ctx.user?.role ?? "admin",
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
          });

          return {
            recommendationId,
            success: true,
            mode: result.mode,
            applyStrategy: result.applyStrategy,
            taskId: result.taskId ?? null,
          };
        } catch (error) {
          return {
            recommendationId,
            success: false,
            error: error instanceof Error ? error.message : "Failed to apply upgrade recommendation",
          };
        }
      }));

      return {
        requestedIds: uniqueIds,
        appliedCount: results.filter((item) => item.success).length,
        failedCount: results.filter((item) => !item.success).length,
        results,
      };
    }),

  applyLegacyUpgradeRecommendations: adminProcedure
    .input(z.object({
      recommendationIds: z.array(z.number().int().positive()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const uniqueIds = Array.from(new Set(input.recommendationIds));
      const results = await Promise.all(uniqueIds.map(async (recommendationId) => {
        try {
          const result = await applySkillUpgradeRecommendation({
            db: dbInstance,
            recommendationId,
            requestedBy: ctx.user?.id ?? null,
            tenantId: ctx.tenantId ?? null,
            userRole: ctx.user?.role ?? "admin",
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
          });

          return {
            recommendationId,
            success: true,
            mode: result.mode,
            applyStrategy: result.applyStrategy,
            taskId: result.taskId ?? null,
          };
        } catch (error) {
          return {
            recommendationId,
            success: false,
            error: error instanceof Error ? error.message : "Failed to apply upgrade recommendation",
          };
        }
      }));

      return {
        requestedIds: uniqueIds,
        appliedCount: results.filter((item) => item.success).length,
        failedCount: results.filter((item) => !item.success).length,
        results,
      };
    }),

  retryLegacyUpgradeApplyRuns: adminProcedure
    .input(z.object({
      runIds: z.array(z.number().int().positive()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const uniqueRunIds = Array.from(new Set(input.runIds));
      const runs = await dbInstance
        .select({
          id: skillImprovementRuns.id,
          recommendationId: skillImprovementRuns.recommendationId,
          runType: skillImprovementRuns.runType,
          status: skillImprovementRuns.status,
        })
        .from(skillImprovementRuns)
        .where(inArray(skillImprovementRuns.id, uniqueRunIds));

      const runsById = new Map(runs.map((run) => [run.id, run]));
      const results = await Promise.all(uniqueRunIds.map(async (runId) => {
        const run = runsById.get(runId);
        if (!run) {
          return {
            runId,
            success: false,
            error: `Run ${runId} not found`,
          };
        }
        if (run.runType !== "apply") {
          return {
            runId,
            success: false,
            error: `Run ${runId} is not an apply run`,
          };
        }
        if (!run.recommendationId) {
          return {
            runId,
            success: false,
            error: `Run ${runId} is missing a recommendation link`,
          };
        }

        try {
          const result = await applySkillUpgradeRecommendation({
            db: dbInstance,
            recommendationId: run.recommendationId,
            requestedBy: ctx.user?.id ?? null,
            tenantId: ctx.tenantId ?? null,
            userRole: ctx.user?.role ?? "admin",
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
            sourceRunId: run.id,
            retryReason: `Retry from apply run ${run.id}`,
          });

          return {
            runId,
            recommendationId: run.recommendationId,
            success: true,
            mode: result.mode,
            applyStrategy: result.applyStrategy,
            taskId: result.taskId ?? null,
            retryOfRunId: run.id,
          };
        } catch (error) {
          return {
            runId,
            recommendationId: run.recommendationId,
            success: false,
            error: error instanceof Error ? error.message : "Failed to retry apply run",
          };
        }
      }));

      return {
        requestedRunIds: uniqueRunIds,
        appliedCount: results.filter((item) => item.success).length,
        failedCount: results.filter((item) => !item.success).length,
        results,
      };
    }),

  recoverStaleLegacyUpgradeApplyRuns: adminProcedure
    .input(z.object({
      runIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
      olderThanMinutes: z.number().int().min(5).max(24 * 60).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const thresholdMinutes = input?.olderThanMinutes ?? LEGACY_UPGRADE_STALE_APPLY_RUN_MINUTES;
      const now = new Date();
      const runIds = input?.runIds ? Array.from(new Set(input.runIds)) : [];

      const query = dbInstance
        .select({
          id: skillImprovementRuns.id,
          recommendationId: skillImprovementRuns.recommendationId,
          runType: skillImprovementRuns.runType,
          status: skillImprovementRuns.status,
          summary: skillImprovementRuns.summary,
          errorMessage: skillImprovementRuns.errorMessage,
          logsJson: skillImprovementRuns.logsJson,
          startedAt: skillImprovementRuns.startedAt,
          createdAt: skillImprovementRuns.createdAt,
          updatedAt: skillImprovementRuns.updatedAt,
        })
        .from(skillImprovementRuns);

      const rows = await (runIds.length > 0
        ? query.where(inArray(skillImprovementRuns.id, runIds))
        : query
          .where(and(
            eq(skillImprovementRuns.runType, "apply"),
            inArray(skillImprovementRuns.status, ["queued", "running"]),
          ))
          .orderBy(desc(skillImprovementRuns.updatedAt))
          .limit(200));

      const candidates = rows.filter((row) => (
        row.runType === "apply"
        && !!row.recommendationId
        && isLegacyApplyRunStale(row, now, thresholdMinutes)
      ));

      const results: Array<{
        runId: number;
        recommendationId: number | null;
        recovered: boolean;
        retried: boolean;
        taskId?: string | null;
        error?: string;
      }> = [];

      for (const row of candidates) {
        try {
          await dbInstance
            .update(skillImprovementRuns)
            .set({
              status: "failed",
              summary: row.summary || "Apply task became stale and was queued for automatic retry",
              errorMessage: "Apply task exceeded the recovery threshold before completion.",
              logsJson: buildLegacyStaleApplyRunRecoveryLogs(row.logsJson, now),
              endedAt: now,
              updatedAt: now,
            })
            .where(eq(skillImprovementRuns.id, row.id));

          await dbInstance
            .update(skillImprovementRecommendations)
            .set({
              status: "failed",
              updatedAt: now,
            })
            .where(eq(skillImprovementRecommendations.id, row.recommendationId!));

          const retryResult = await applySkillUpgradeRecommendation({
            db: dbInstance,
            recommendationId: row.recommendationId!,
            requestedBy: ctx.user?.id ?? null,
            tenantId: ctx.tenantId ?? null,
            userRole: ctx.user?.role ?? "admin",
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
            sourceRunId: row.id,
            retryReason: `Automatic retry after stale apply run ${row.id}`,
          });

          results.push({
            runId: row.id,
            recommendationId: row.recommendationId,
            recovered: true,
            retried: true,
            taskId: retryResult.taskId ?? null,
          });
        } catch (error) {
          results.push({
            runId: row.id,
            recommendationId: row.recommendationId,
            recovered: false,
            retried: false,
            error: error instanceof Error ? error.message : "Failed to recover stale apply run",
          });
        }
      }

      return {
        scannedCount: rows.length,
        staleCount: candidates.length,
        recoveredCount: results.filter((item) => item.recovered).length,
        retriedCount: results.filter((item) => item.retried).length,
        failedCount: results.filter((item) => !item.recovered || !item.retried).length,
        results,
      };
    }),

  normalizeLegacyUpgradeApplyRuns: adminProcedure
    .mutation(async ({ ctx }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const rows = await dbInstance
        .select({
          id: skillImprovementRuns.id,
          recommendationId: skillImprovementRuns.recommendationId,
          status: skillImprovementRuns.status,
          summary: skillImprovementRuns.summary,
          errorMessage: skillImprovementRuns.errorMessage,
          logsJson: skillImprovementRuns.logsJson,
          createdAt: skillImprovementRuns.createdAt,
        })
        .from(skillImprovementRuns)
        .where(eq(skillImprovementRuns.runType, "apply"))
        .orderBy(desc(skillImprovementRuns.createdAt))
        .limit(200);

      const candidates = rows.filter((row) => isLegacyUpgradeNoChangeRunCandidate(row));
      const normalizedRunIds: number[] = [];

      for (const row of candidates) {
        if (row.recommendationId) {
          await dbInstance
            .update(skillImprovementRecommendations)
            .set({
              status: "approved",
              reviewedAt: new Date(),
              reviewedBy: ctx.user?.id ?? null,
              approvedAt: new Date(),
              approvedBy: ctx.user?.id ?? null,
              updatedAt: new Date(),
            })
            .where(eq(skillImprovementRecommendations.id, row.recommendationId));
        }

        await dbInstance
          .update(skillImprovementRuns)
          .set({
            status: "completed",
            summary: row.summary || "Proposal generation completed without code changes",
            errorMessage: null,
            logsJson: buildLegacyNoChangeCompletionLogs(row.logsJson),
            diffSummaryJson: {
              savedProposals: [],
              latestProposal: null,
              completionMode: "no_changes",
            },
            endedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(skillImprovementRuns.id, row.id));

        normalizedRunIds.push(row.id);
      }

      return {
        scannedCount: rows.length,
        normalizedCount: normalizedRunIds.length,
        normalizedRunIds,
      };
    }),

  runMaintenanceSweep: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).optional(),
      category: z.string().optional(),
      executionMode: skillExecutionModeSchema.optional(),
      genjsCandidatesOnly: z.boolean().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      return executeSkillMaintenanceSweep({
        db: dbInstance,
        requestedBy: ctx.user?.id ?? null,
        triggerSource: "sweep",
        tenantId: ctx.tenantId ?? null,
        filters: {
          limit: input?.limit,
          category: input?.category,
          executionMode: input?.executionMode,
          genjsCandidatesOnly: input?.genjsCandidatesOnly,
        },
      });
    }),

  listMaintenanceSchedules: adminProcedure
    .query(async () => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      return dbInstance
        .select()
        .from(skillMaintenanceSchedules)
        .orderBy(desc(skillMaintenanceSchedules.updatedAt));
    }),

  createMaintenanceSchedule: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      cronExpression: z.string().min(1).max(128).optional(),
      timezone: z.string().min(1).max(64).optional(),
      scopeType: z.string().min(1).max(50).optional(),
      scopeJson: z.record(z.any()).optional(),
      policyJson: z.record(z.any()).optional(),
      status: z.enum(["active", "paused", "disabled"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      let resolved;
      try {
        resolved = resolveMaintenanceScheduleInput({
          name: input.name,
          description: input.description,
          cronExpression: input.cronExpression,
          timezone: input.timezone,
          scopeType: input.scopeType,
          scopeJson: input.scopeJson,
          policyJson: input.policyJson,
          status: input.status,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid maintenance schedule",
        });
      }

      const [schedule] = await dbInstance
        .insert(skillMaintenanceSchedules)
        .values({
          tenantId: ctx.tenantId ?? null,
          name: resolved.name,
          description: resolved.description,
          cronExpression: resolved.cronExpression,
          timezone: resolved.timezone,
          scopeType: resolved.scopeType,
          scopeJson: resolved.scopeJson,
          policyJson: resolved.policyJson,
          status: resolved.status,
          createdBy: ctx.user?.id ?? null,
          nextRunAt: resolved.nextRunAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return schedule;
    }),

  updateMaintenanceSchedule: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      cronExpression: z.string().min(1).max(128).optional(),
      timezone: z.string().min(1).max(64).optional(),
      scopeType: z.string().min(1).max(50).optional(),
      scopeJson: z.record(z.any()).optional(),
      policyJson: z.record(z.any()).optional(),
      status: z.enum(["active", "paused", "disabled"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const dbInstance = await getDb();
      if (!dbInstance) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [existing] = await dbInstance
        .select()
        .from(skillMaintenanceSchedules)
        .where(eq(skillMaintenanceSchedules.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Schedule ${input.id} not found` });
      }

      let resolved;
      try {
        resolved = resolveMaintenanceScheduleInput({
          name: input.name ?? existing.name,
          description: input.description ?? existing.description,
          cronExpression: input.cronExpression ?? existing.cronExpression,
          timezone: input.timezone ?? existing.timezone,
          scopeType: input.scopeType ?? existing.scopeType,
          scopeJson: input.scopeJson ?? (existing.scopeJson as Record<string, unknown> | null) ?? {},
          policyJson: input.policyJson ?? (existing.policyJson as Record<string, unknown> | null) ?? {},
          status: input.status ?? existing.status,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid maintenance schedule",
        });
      }

      const [updated] = await dbInstance
        .update(skillMaintenanceSchedules)
        .set({
          name: resolved.name,
          description: resolved.description,
          cronExpression: resolved.cronExpression,
          timezone: resolved.timezone,
          scopeType: resolved.scopeType,
          scopeJson: resolved.scopeJson,
          policyJson: resolved.policyJson,
          status: resolved.status,
          nextRunAt: resolved.nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(skillMaintenanceSchedules.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Launch the shared Skill Studio flow backed by Intelligence Skill Creator.
   */
  launchStudioTask: protectedProcedure
    .input(z.object({
      mode: z.enum(["create", "improve"]),
      brief: z.string().min(10).max(20000),
      targetSkillId: z.number().int().positive().optional(),
      newSkillSlug: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/).optional(),
      skillLanguage: z.enum(["auto", "python", "javascript"]).optional(),
      targetPlatform: z.enum(["classic", "agents_python"]).optional(),
      targetPlatformHint: z.enum(["classic", "agents_python"]).optional(),
      complexity: z.enum(["simple", "moderate", "complex"]).optional(),
      rounds: z.number().int().min(1).max(10).optional(),
      allowTestExpansion: z.boolean().optional(),
      askUser: z.boolean().optional(),
      improvementPreset: z.enum(["custom", "deterministic", "trace_friendly", "retry_safe", "compatibility_fix"]).optional(),
      improvementRequest: z.string().max(4000).optional(),
      desiredVisibility: z.enum(["private", "pending_approval", "public"]).optional(),
      autoApplyProposal: z.boolean().optional(),
      specText: z.string().max(20000).optional(),
      specFileName: z.string().max(255).optional(),
      specFileContent: z.string().max(30000).optional(),
      cloneFromSkillId: z.number().int().positive().optional(),
      referenceSkillIds: z.array(z.number().int().positive()).max(4).optional(),
      zipFileName: z.string().max(255).optional(),
      zipBase64: z.string().max(12_000_000).optional(),
      llmGatewayMode: z.enum(["system", "custom"]).optional(),
      llmModelSearch: z.string().max(200).optional(),
      llmBaseUrl: z.string().max(500).optional(),
      llmModel: z.string().max(200).optional(),
      llmApiKey: z.string().max(500).optional(),
      llmTemperature: z.number().min(0).max(2).optional(),
      llmTimeoutS: z.number().int().min(30).max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await launchSkillStudioTask(
          {
            userId: ctx.user.id,
            userRole: ctx.user.role,
            userToken: ctx.userToken ?? null,
            publicUrl: ctx.publicUrl ?? null,
          },
          input,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to launch Skill Studio task",
        });
      }
    }),

  /**
   * Toggle auto-trigger for a specific skill
   */
  toggleAutoTrigger: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setAutoTrigger(ctx.user.id, input.skillId, input.enabled);
      return { success: true };
    }),
});
