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
import { eq, asc, desc, like, or, and, sql, inArray } from "drizzle-orm";
import { deductCredits, calculateCreditsForLLM, hasEnoughCredits } from "../services/creditService";
import { executeWithFallback, getProviderForModel } from "../services/llmRouter";
import { buildModelLookupCandidates } from "../services/modelLookup";
import { getUploadsDir } from "../storage";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import AdmZip from "adm-zip";
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
  applyIscProposalDiff,
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
  updateSkillManifestFiles,
  writeSkillManifestFiles,
} from "../services/skillFiles";
import { refreshModelCache } from "../services/modelRegistry";
import { resolveSkillExecutionPolicy } from "../services/skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "../services/enabledLlmModels";
import { resolveMediaTypeFromSkillCategory, sanitizeMediaModelSelection } from "../services/mediaModelSelection";
import { buildCustomSkillUserPrompt } from "../services/skillExecutionPromptBuilder";
import { resolveEffectiveLocalSkillExecutionPolicy } from "../services/localAiSkillPolicy";
import { getRequesterLocalAiSurfaceContext } from "../services/localAiUserContext";
import { getConversationById } from "../services/chatService";
import { readLocalAiConversationOverride } from "../../shared/localAiConversationSettings";
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

type VisionModelOption = {
  id: string;
  name: string;
  provider: string;
  providerDisplayName: string;
  providerId: number;
  isDefault?: boolean;
  supportsVision?: boolean;
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
    const config = row.configJson as { supportsVision?: boolean } | null;
    const modelId = row.modelId;
    const fullModelId = modelId.includes("/") ? modelId : `${row.providerName}/${modelId}`;
    const supportsVision = config?.supportsVision ||
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

/**
 * Convert image URL to a format the LLM can use
 * - Relative URLs (/uploads/...) are converted to base64 data URLs
 * - Full URLs are passed through as-is
 */
async function convertImageUrlForLLM(url: string): Promise<string> {
  // If it's already a data URL or full HTTP URL, return as-is
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // If it's a relative URL, read the file and convert to base64
  if (url.startsWith("/uploads/")) {
    try {
      // Use the same uploads directory as storage.ts
      const uploadsDir = getUploadsDir();
      const relativePath = url.replace("/uploads/", "");
      const filePath = path.join(uploadsDir, relativePath);

      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");

        // Detect mime type from extension
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
        };
        const mimeType = mimeTypes[ext] || "image/png";

        return `data:${mimeType};base64,${base64}`;
      } else {
        console.warn(`[Skills] Image file not found: ${filePath}`);
        // Try alternate path (cwd-relative)
        const altPath = path.resolve(process.cwd(), "uploads", relativePath);
        if (fs.existsSync(altPath)) {
          const fileBuffer = fs.readFileSync(altPath);
          const base64 = fileBuffer.toString("base64");
          const ext = path.extname(altPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
          };
          const mimeType = mimeTypes[ext] || "image/png";
          return `data:${mimeType};base64,${base64}`;
        }
        console.error(`[Skills] Image not found at either path`);
        return url; // Return original URL as fallback
      }
    } catch (error) {
      console.error(`[Skills] Failed to convert image to base64:`, error);
      return url; // Return original URL as fallback
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
  options?: { extraBodyParams?: Record<string, unknown>; systemPromptSuffix?: string },
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number }; rawResponse?: any }> {
  const useModel = resolveVisionModelId(await getVisionModelOptions(), model);
  if (!useModel) {
    throw new Error("No enabled vision model configured");
  }

  // Build messages with vision support
  const userContent: MessageContent[] = [{ type: "text", text: userPrompt }];

  // Add images if provided (for vision analysis)
  // Convert relative URLs to base64 data URLs so LLM can access them
  for (const imageUrl of imageUrls) {
    const convertedUrl = await convertImageUrlForLLM(imageUrl);
    userContent.push({ type: "image_url", image_url: { url: convertedUrl } });
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
  collapsed?: boolean;
  fields: SchemaField[];
}

interface SchemaField {
  id: string;
  type: "text" | "textarea" | "select" | "boolean" | "imageUpload" | "number";
  label: string;
  labelTh?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  default?: any;
  rows?: number;
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

/**
 * Convert standard JSON Schema to our custom skill input schema format
 */
function convertJsonSchemaToSkillSchema(jsonSchema: any, skillId: string): SkillInputSchema {
  const title = jsonSchema.title || skillId;
  const description = jsonSchema.description || "";
  const properties = jsonSchema.properties || {};
  const requiredFields = jsonSchema.required || [];

  // Group fields into sections based on property names or structure
  const fields: SchemaField[] = [];

  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    const field = convertPropertyToField(key, prop, requiredFields.includes(key));
    if (field) {
      fields.push(field);
    }
  }

  // Group fields into logical sections
  const basicFields = fields.filter(f =>
    ["request", "userIdea", "prompt", "input", "text", "description"].some(k =>
      f.id.toLowerCase().includes(k)
    )
  );
  const configFields = fields.filter(f => !basicFields.includes(f));

  const sections: SchemaSection[] = [];

  if (basicFields.length > 0) {
    sections.push({
      id: "basic",
      title: "Basic Input",
      collapsed: false,
      fields: basicFields,
    });
  }

  if (configFields.length > 0) {
    sections.push({
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
    sections,
    outputMapping: Object.fromEntries(fields.map(f => [f.id, f.id])),
  };
}

/**
 * Convert a JSON Schema property to our field format
 */
function convertPropertyToField(key: string, prop: any, isRequired: boolean): SchemaField | null {
  const baseField = {
    id: key,
    label: prop.title || key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
    helpText: prop.description,
    required: isRequired,
    default: prop.default,
  };

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
      for (const val of prop.enum) {
        options.push({
          value: val,
          label: val.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
        });
      }
    }

    return {
      ...baseField,
      type: "select",
      options,
    };
  }

  switch (prop.type) {
    case "string":
      if (prop.format === "uri" || key.toLowerCase().includes("image") || key.toLowerCase().includes("url")) {
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
        type: key.toLowerCase().includes("prompt") || key.toLowerCase().includes("request") ? "textarea" : "text",
        rows: key.toLowerCase().includes("prompt") || key.toLowerCase().includes("request") ? 3 : undefined,
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
      };

    case "array":
      // Skip arrays for now - complex handling needed
      return null;

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
      return extractDefaultsFromSchema(schema);
    } catch (error) {
      console.warn(`[Skills] Failed to parse schema defaults at ${schemaPath}:`, error);
    }
  }

  return {};
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
              foundSchema = convertJsonSchemaToSkillSchema(schema, input.skillId);
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
          .where(eq(skills.slug, input.skillId))
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

        // Calculate max tokens from the requested character budget and language hint.
        // This keeps the completion budget aligned with the selected media model limit.
        const maxCharLength = input.maxPromptLength || 5000;
        const promptLanguageHint = resolvePromptLanguageHintFromInputs(input as unknown as Record<string, unknown>);
        const promptLengthPlan = buildPromptLengthPlan(maxCharLength, promptLanguageHint)
          ?? buildPromptLengthPlan(5000, promptLanguageHint)!;

        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          userId,
          input.referenceImages || [],
          visionModel,
          promptLengthPlan.maxTokens
        );

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

        const isRefusal = refusalPatterns.some(pattern => pattern.test(result.content));

        if (isRefusal) {
          console.warn("[Skills] LLM refused prompt enhancement:", result.content.substring(0, 200));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unable to generate prompt. Please try with different text or images.",
          });
        }

        // Parse the response to extract prompts
        const parsed = parsePromptResponse(result.content);

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

        // Calculate and deduct credits based on the model used
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
            skill: resolvedSkillId,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            hasReferenceImages: (input.referenceImages?.length || 0) > 0,
            referenceImageCount: input.referenceImages?.length || 0,
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        return {
          success: true,
          promptEn: finalPromptEn,
          promptTh: finalPromptTh,
          wasTruncated,
          creditsUsed,
          usage: result.usage,
          skillId: resolvedSkillId,
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
        referenceImages: z.array(z.string()).max(5).optional(),
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
          defaultModel: skills.defaultModel,
          executionPolicyJson: skills.executionPolicyJson,
        })
        .from(skills)
        .where(eq(skills.slug, input.skillId))
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

      if (!systemPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Skill '${input.skillId}' has no content to execute`,
        });
      }

      // Merge user inputs with schema defaults, and drop null/empty placeholders
      const sanitizedUserInputs = sanitizeUserInputs(input.userInputs);
      const schemaDefaults = loadSkillInputDefaults(skill.slug, skill.folderPath);
      const mergedUserInputs = {
        ...schemaDefaults,
        ...sanitizedUserInputs,
      };

      const requestedMaxPromptLength = Number(mergedUserInputs.maxPromptLength);
      const promptLengthPlan = Number.isFinite(requestedMaxPromptLength) && requestedMaxPromptLength > 0
        ? buildPromptLengthPlan(requestedMaxPromptLength, resolvePromptLanguageHintFromInputs(mergedUserInputs))
        : null;

      // Substitute template variables with actual values
      systemPrompt = substituteTemplateVariables(systemPrompt, mergedUserInputs);
      if (promptLengthPlan) {
        systemPrompt = `${systemPrompt}\n\n${promptLengthPlan.directive}`;
      }

      const referenceImageCount = Array.isArray(input.referenceImages) ? input.referenceImages.length : 0;
      let userPrompt = buildCustomSkillUserPrompt(mergedUserInputs, { referenceImageCount });

      try {
        const requestedModel = typeof input.model === "string" && !input.model.startsWith("__auto")
          ? input.model
          : null;
        const visionModel = resolveVisionModelId(
          await getVisionModelOptions(),
          requestedModel || skill.defaultModel || null,
        );
        if (!visionModel) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No enabled vision model configured",
          });
        }

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
          const provider = await getProviderForModel(visionModel);
          if (provider) {
            const { detectProviderFamily, buildWebSearchParams } = await import("../services/webSearchToolInjector");
            const family = detectProviderFamily(provider.providerName);
            webSearchOptions = buildWebSearchParams(family);
          }
        }

        // Call LLM with substituted system prompt
        const result = await callLLMWithVision(
          systemPrompt,
          userPrompt,
          userId,
          input.referenceImages || [],
          visionModel,
          promptLengthPlan?.maxTokens ?? 4000,
          webSearchOptions,
        );


        // Calculate and deduct credits
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
            skill: input.skillId,
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        // Post-process CMS output if response_mode is cms_json
        const responseMode = mergedUserInputs.response_mode as string | undefined;
        let processedContent = result.content;
        let qualityReport: Record<string, unknown> | undefined;

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
                llmOutput: result.content,
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

        let wasTruncated = false;
        if (promptLengthPlan && responseMode !== "cms_json") {
          const originalLength = processedContent.length;
          const truncated = truncateToPromptLength(processedContent, promptLengthPlan.maxPromptLength);
          processedContent = truncated.text;
          wasTruncated = truncated.wasTruncated;
          if (truncated.wasTruncated) {
            console.warn(
              `[Skills] Custom skill output exceeded limit: ${originalLength}/${promptLengthPlan.maxPromptLength} chars`,
            );
          }
        }

        return {
          success: true,
          content: processedContent,
          skillId: input.skillId,
          skillName: skill.name,
          creditsUsed,
          usage: result.usage,
          wasTruncated,
          ...(qualityReport ? { qualityReport } : {}),
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
      await autoSyncSkillsFromFolder();
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
            like(skills.name, `%${input.search}%`),
            like(skills.description, `%${input.search}%`),
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
      }));
    }),

  /**
   * Get skill by slug from database
   */
  getFromDb: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      await autoSyncSkillsFromFolder();
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
          configJson: input.configJson,
          importSource: "manual",
          createdBy: ctx.user?.id,
          visibility: input.visibility ?? "private",
          ...(input.visibility === "pending_approval" ? { requestedPublishAt: new Date() } : {}),
        })
        .returning();

      // Refresh skill cache
      await refreshSkillCache();

      return newSkill;
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
      diffFile: z.string().min(1).max(200).regex(/^[\w.\-]+\.diff$/),
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
   * Apply an ISC proposal diff to the skill files (admin only).
   * Runs: patch -N -r - -p0 < <diff_file>
   * Working directory: apps/web/skills/intelligence-skill-creator/
   */
  applyIscProposal: adminProcedure
    .input(z.object({
      skillName: z.string().min(1).max(100).regex(/^[\w-]+$/),
      diffFile: z.string().min(1).max(200).regex(/^[\w.\-]+\.diff$/),
      recommendationId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await applyIscProposalDiff(input.skillName, input.diffFile);

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
                executionMode: baselineSnapshotRow.executionMode,
                runtimeProfile: baselineSnapshotRow.runtimeProfile ?? "unknown",
                inputSchemaHash: baselineSnapshotRow.inputSchemaHash,
                outputSchemaHash: baselineSnapshotRow.outputSchemaHash,
                testsHash: baselineSnapshotRow.testsHash,
                fixtureHash: baselineSnapshotRow.fixtureHash,
                manifestHash: baselineSnapshotRow.manifestHash,
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

      return rows.map((row) => ({
        ...row,
        skill: skillMap.get(row.skillId) ?? null,
      }));
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
      complexity: z.enum(["simple", "moderate", "complex"]).optional(),
      rounds: z.number().int().min(1).max(10).optional(),
      allowTestExpansion: z.boolean().optional(),
      askUser: z.boolean().optional(),
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
