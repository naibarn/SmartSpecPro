/**
 * Skill Executor Service
 * Executes detected skills by calling the appropriate service
 */

import path from "path";
import { spawnSync, spawn } from "child_process";
import fs from "fs";
import { SkillDefinition } from "./skillRegistry";
import { getRedisClient } from "./redis";
import {
  mediaGenerationService,
  ImageModel,
  VideoModel,
  AudioModel,
  MediaGenerationResponse,
} from "./mediaGenerationService";
import { hasEnoughCredits } from "./creditService";
import {
  getModelById,
  getDefaultModel,
  mapToApiModelId,
  getModelsByTypeAsync,
} from "./modelRegistry";
import { calculateCreditCost } from "./pricingCalculator";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import {
  isSandboxEnabled,
  shouldUseSandboxForFeature,
  getDispatchMode,
  dispatchToSandbox as sandboxDispatch,
} from "./sandbox";

// Simple in-memory rate limiter per user per skill type
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  "image-generation": 10,
  // Allow longer multi-video storyboards while keeping a per-minute guardrail.
  "video-generation": 15,
  "audio-generation": 10,
};
const DEFAULT_RATE_LIMIT = 20;
const SANDBOX_SKILL_ROOT = "/workspace/skill";
const SANDBOX_INPUT_PATH = "/workspace/skill-input.json";
const SANDBOX_MAX_INLINE_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const SANDBOX_MAX_INLINE_TOTAL_BYTES = 8 * 1024 * 1024; // 8MB total
const SKILL_SKIP_DIRS = new Set([".git", "__pycache__", "node_modules", ".venv", "venv"]);
const SKILL_SKIP_SUFFIXES = [".pyc", ".pyo"];

interface PythonSkillPaths {
  skillDir: string;
  scriptPath: string;
}

interface SandboxInlineFile {
  path: string;
  contentBase64: string;
}

interface PreparedPythonSandboxPayload {
  executionMode: "sandbox-python";
  metadata: Record<string, unknown>;
}

function setApiConfigValue(apiConfig: Record<string, string>, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length > 0) {
      apiConfig[key] = normalized;
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    apiConfig[key] = String(value);
  }
}

function mergeApiConfigObject(apiConfig: Record<string, string>, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    setApiConfigValue(apiConfig, key, entryValue);
  }
}

function buildMediaApiConfig(configJson?: Record<string, unknown>): Record<string, string> {
  const apiConfig: Record<string, string> = {};
  if (!configJson || typeof configJson !== "object") {
    return apiConfig;
  }
  setApiConfigValue(apiConfig, "endpoint", configJson.apiEndpoint);
  setApiConfigValue(apiConfig, "query_endpoint", configJson.apiQueryEndpoint);
  setApiConfigValue(apiConfig, "payload_format", configJson.apiPayloadFormat);
  setApiConfigValue(apiConfig, "kie_model_id", configJson.kieModelId);
  mergeApiConfigObject(apiConfig, configJson.apiConfig);
  return apiConfig;
}

function checkRateLimit(userId: number, skillType: string): boolean {
  const key = `${userId}:${skillType}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  const limit = RATE_LIMITS[skillType] || DEFAULT_RATE_LIMIT;

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function resolvePythonSkillPaths(skill: SkillDefinition): PythonSkillPaths | null {
  const candidateDirs: string[] = [];

  if (skill.skillFilePath) {
    const relativeDir = path.dirname(skill.skillFilePath);
    if (path.isAbsolute(relativeDir)) {
      candidateDirs.push(relativeDir);
    } else {
      candidateDirs.push(path.resolve(process.cwd(), relativeDir));
      candidateDirs.push(path.resolve(process.cwd(), "..", "..", relativeDir));
    }
  }

  const rootCandidates = [
    path.resolve(process.cwd(), "skills"),
    path.resolve(process.cwd(), "apps", "web", "skills"),
    path.resolve(process.cwd(), "..", "..", "apps", "web", "skills"),
  ];
  for (const root of rootCandidates) {
    candidateDirs.push(path.join(root, skill.id));
  }

  const deduped = Array.from(new Set(candidateDirs));
  for (const skillDir of deduped) {
    const scriptPath = path.join(skillDir, "python", "skill.py");
    if (fs.existsSync(scriptPath)) {
      return { skillDir, scriptPath };
    }
  }

  return null;
}

function collectSkillInlineFiles(skillDir: string): SandboxInlineFile[] {
  const inlineFiles: SandboxInlineFile[] = [];
  let totalBytes = 0;

  const walk = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKILL_SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(path.join(dirPath, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (SKILL_SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const content = fs.readFileSync(fullPath);
      if (content.length > SANDBOX_MAX_INLINE_FILE_BYTES) {
        throw new Error(
          `Skill file too large for sandbox inline transfer: ${fullPath} (${content.length} bytes)`,
        );
      }

      totalBytes += content.length;
      if (totalBytes > SANDBOX_MAX_INLINE_TOTAL_BYTES) {
        throw new Error(
          `Skill package exceeds sandbox inline transfer limit (${totalBytes} bytes)`,
        );
      }

      const relativePath = path.relative(skillDir, fullPath).split(path.sep).join("/");
      inlineFiles.push({
        path: `${SANDBOX_SKILL_ROOT}/${relativePath}`,
        contentBase64: content.toString("base64"),
      });
    }
  };

  walk(skillDir);
  return inlineFiles;
}

function preparePythonSandboxPayload(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userToken: string,
): PreparedPythonSandboxPayload {
  const paths = resolvePythonSkillPaths(skill);
  if (!paths) {
    throw new Error(`Python skill script not found for sandbox dispatch: ${skill.id}`);
  }

  const inlineFiles = collectSkillInlineFiles(paths.skillDir);
  const inputPayload = JSON.stringify({
    skill_name: skill.id,
    prompt: params.prompt,
    params: params.extraParams ?? {},
    context: {
      publicUrl: params.publicUrl ?? "",
      userToken,
    },
  });

  inlineFiles.push({
    path: SANDBOX_INPUT_PATH,
    contentBase64: Buffer.from(inputPayload, "utf-8").toString("base64"),
  });

  const scriptPathInSandbox = `${SANDBOX_SKILL_ROOT}/python/skill.py`;
  const command = `python3 ${shellQuote(scriptPathInSandbox)} < ${shellQuote(SANDBOX_INPUT_PATH)}`;

  return {
    executionMode: "sandbox-python",
    metadata: {
      skillSlug: skill.id,
      skillName: skill.name,
      prompt: params.prompt,
      extraParams: params.extraParams,
      commands: [command],
      inlineFiles,
    },
  };
}

export interface SkillExecutionParams {
  prompt: string;
  conversationId?: string;
  context?: Record<string, unknown>;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  numImages?: number;
  duration?: number;
  voice?: string;
  resolution?: string;
  /** Reference images for image/video generation (1-5 URLs) */
  referenceImageUrls?: string[];
  /** Reference style URL for style transfer */
  referenceStyleUrl?: string;
  /** Per-model API config from configJson (endpoint, kieModelId, etc.) */
  apiConfig?: Record<string, string>;
  /** Dynamic input field values from configJson.inputFields */
  extraParams?: Record<string, any>;
  /** Public URL for tenant domain (e.g., https://smartaihub.app) for external services */
  publicUrl?: string;
}

export interface SkillCreateAction {
  type: "create_skill";
  name: string;
  slug: string;
  description: string;
  skillContent: string;
  triggerPatterns: string[];
}

export interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: "image" | "video" | "audio" | "text" | "action" | "sandbox-job";
  data?: MediaGenerationResponse;
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  isAsync?: boolean;
  /** Sandbox job ID for polling (when type is 'sandbox-job') */
  jobId?: string;
  /** Structured side-effect from a python skill (e.g. create_skill) */
  _action?: SkillCreateAction;
  /** Extra machine-readable payload returned by the skill */
  metadata?: Record<string, unknown>;
}

/**
 * Execute a detected skill
 */
export async function executeSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,
): Promise<SkillExecutionResult> {
  console.log(`[SkillExecutor] Executing skill:`, {
    id: skill.id,
    name: skill.name,
    type: skill.type,
    executionMode: (skill as any).executionMode,
    userId,
    prompt: params.prompt?.substring(0, 100),
  });

  // Rate limit check
  if (!checkRateLimit(userId, skill.type)) {
    return {
      success: false,
      skillId: skill.id,
      type: skill.type as any,
      error: "Rate limit exceeded. Please wait before trying again.",
    };
  }

  // Route by executionMode first — type is for categorization only
  const executionMode = skill.executionMode as string | undefined;

  // core-text / llm-only / enhance-prompt: LLM text path (never uses sandbox)
  if (executionMode === "core-text" || executionMode === "llm-only" || executionMode === "enhance-prompt") {
    console.log(`[SkillExecutor] Skill '${skill.id}' has executionMode '${executionMode}' — returning text result for LLM processing`);
    return {
      success: true,
      skillId: skill.id,
      type: "text",
      message: params.prompt || `Using skill: ${skill.name}`,
    };
  }

  // Sandbox execution modes — dispatch to OpenSandbox when enabled
  if (
    executionMode?.startsWith("sandbox-") ||
    (executionMode === "media-generate" && isSandboxEnabled()) ||
    (executionMode === "python" && isSandboxEnabled())
  ) {
    const sandboxMode =
      executionMode === "python" ? "sandbox-python" : (executionMode || "sandbox-code");
    try {
      if (shouldUseSandboxForFeature("skill", sandboxMode)) {
        console.log(`[SkillExecutor] Routing to sandbox dispatch (mode: ${sandboxMode})`);
        return await executeSandboxSkill(
          skill,
          params,
          userId,
          userToken,
          sandboxMode,
          tenantId,
        );
      }
    } catch (err) {
      // shouldUseSandboxForFeature throws when required but disabled
      if (getDispatchMode() === "required") {
        return {
          success: false,
          skillId: skill.id,
          type: "text",
          error: "Secure execution environment is required but unavailable. Please contact your administrator.",
        };
      }
      // optional mode: fall through to legacy paths
      console.warn(`[SkillExecutor] Sandbox check failed, falling back to legacy:`, err);
    }
  }

  // Python skills: subprocess execution (legacy)
  if (executionMode === "python") {
    console.log(`[SkillExecutor] Routing to executePythonSkill (executionMode: python)`);
    return await executePythonSkill(skill, params, userToken);
  }

  // Media generation: route by type
  switch (skill.type) {
    case "image-generation":
      console.log(`[SkillExecutor] Routing to executeImageGeneration`);
      return executeImageGeneration(skill, params, userId, userToken, tenantId);

    case "video-generation":
      console.log(`[SkillExecutor] Routing to executeVideoGeneration`);
      return executeVideoGeneration(skill, params, userId, userToken, tenantId);

    case "image-video-generation":
      console.log(`[SkillExecutor] Skill type is image-video-generation, routing to video generation`);
      return executeVideoGeneration(skill, params, userId, userToken, tenantId);

    case "audio-generation":
      console.log(`[SkillExecutor] Routing to executeAudioGeneration`);
      return executeAudioGeneration(params, userId, userToken, tenantId);

    case "automation":
    case "chat-assistant":
    case "code-assistant":
    case "web-search":
    case "document-analysis":
    case "translation":
    case "prompt-enhancement":
      return {
        success: false,
        skillId: skill.id,
        type: "text",
        error: `Skill type '${skill.type}' requires executionMode: python or an LLM handler`,
      };

    default:
      console.error(`[SkillExecutor] Unknown skill type '${skill.type}' for skill '${skill.id}'`);
      return {
        success: false,
        skillId: skill.id,
        type: "text",
        error: `Skill type '${skill.type}' is not yet implemented for automatic execution`,
      };
  }
}

/**
 * Execute image generation skill
 */
async function executeImageGeneration(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("image");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media",
    userId,
    tenantId: tenantId || "default",
    skillSlug: skill.id,
  });

  // Get model from params or defaults
  const modelInput = params.model || skill.defaultModel;
  let model: ImageModel;
  if (modelInput) {
    model = mapToApiModelId(modelInput) as ImageModel;
  } else {
    const defaultModel = getDefaultModel("image");
    if (!defaultModel) {
      return { success: false, skillId: skill.id, type: "image", error: "No image models available" };
    }
    model = defaultModel.id as ImageModel;
  }

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: `Unknown image model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const creditCost = calculateCreditCost(modelMeta, {
    numImages: params.numImages,
    resolution: (params as any).resolution,
    quality: params.quality,
  });

  // Check credits
  const hasCredits = await hasEnoughCredits(userId, creditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: `Insufficient credits. Need ${creditCost} credits for image generation.`,
    };
  }

  try {
    // Build apiConfig from model's configJson (database is source of truth)
    const apiConfig = {
      ...buildMediaApiConfig(modelMeta.configJson as Record<string, unknown> | undefined),
      ...(params.apiConfig ?? {}),
    };

    // Generate image — forward all params including extraParams from configJson.inputFields
    const result = await mediaGenerationService.generateImage(
      {
        prompt: params.prompt,
        model,
        aspectRatio: params.aspectRatio,
        numImages: params.numImages,
        resolution: params.resolution,
        referenceImageUrls: params.referenceImageUrls,
        referenceStyleUrl: params.referenceStyleUrl,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          source: "skill_executor.executeImageGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Extract URLs
    const urls = result.data?.map((d) => d.url).filter((u): u is string => !!u) || [];

    // Record step attempt for planner tracking
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: String(model),
        inputTokens: 0,
        outputTokens: 0,
        snapshot: plannerResult.snapshot,
        creditsUsed: result.creditsUsed || creditCost,
      }).catch(() => {});
    }

    return {
      success: true,
      skillId: skill.id,
      type: "image",
      data: result,
      resultUrl: urls[0],
      resultUrls: urls,
      message: `Generated ${urls.length} image${urls.length > 1 ? "s" : ""} using ${modelMeta.name}`,
      creditsUsed: result.creditsUsed || creditCost,
    };
  } catch (error) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: error instanceof Error ? error.message : "Image generation failed",
    };
  }
}

/**
 * Execute video generation skill (always async)
 */
async function executeVideoGeneration(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("video");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media",
    userId,
    tenantId: tenantId || "default",
    skillSlug: skill.id,
  });

  // Get model from params or defaults
  const modelInput = params.model || skill.defaultModel;
  let model: VideoModel;
  if (modelInput) {
    model = mapToApiModelId(modelInput) as VideoModel;
  } else {
    const defaultModel = getDefaultModel("video");
    if (!defaultModel) {
      return { success: false, skillId: skill.id, type: "video", error: "No video models available" };
    }
    model = defaultModel.id as VideoModel;
  }

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: `Unknown video model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const duration = params.duration || 5;
  const creditCost = calculateCreditCost(modelMeta, {
    duration: String(duration),
    resolution: (params as any).resolution,
    quality: params.quality,
  });

  // Check credits
  const hasCredits = await hasEnoughCredits(userId, creditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: `Insufficient credits. Need ${creditCost} credits for ${duration}s video generation.`,
    };
  }

  try {
    // Build apiConfig from model's configJson (database is source of truth)
    const apiConfig = {
      ...buildMediaApiConfig(modelMeta.configJson as Record<string, unknown> | undefined),
      ...(params.apiConfig ?? {}),
    };

    // Generate video asynchronously — forward all params including extraParams
    console.log('[executeVideoGeneration] Preparing to call generateVideoAsync with:', {
      model,
      duration,
      aspectRatio: params.aspectRatio,
      promptLength: params.prompt?.length,
      hasApiConfig: Object.keys(apiConfig).length > 0,
      hasExtraParams: !!(params.extraParams && Object.keys(params.extraParams).length > 0),
    });

    const task = await mediaGenerationService.generateVideoAsync(
      {
        prompt: params.prompt,
        model,
        duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        referenceImageUrls: params.referenceImageUrls,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          source: "skill_executor.executeVideoGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    console.log('[executeVideoGeneration] Task created successfully:', {
      taskId: task.id,
      status: task.status,
    });

    // Record step attempt for planner tracking
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: String(model),
        inputTokens: 0,
        outputTokens: 0,
        snapshot: plannerResult.snapshot,
        creditsUsed: creditCost,
      }).catch(() => {});
    }

    return {
      success: true,
      skillId: skill.id,
      type: "video",
      taskId: task.id,
      isAsync: true,
      message: `Video generation started using ${modelMeta.name}. Task ID: ${task.id}. You can check the status in the Media Generation panel.`,
      creditsUsed: creditCost, // Credits will be deducted by backend when task completes
    };
  } catch (error) {
    console.error('[executeVideoGeneration] Error during video generation:', error);
    console.error('[executeVideoGeneration] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: error instanceof Error ? error.message : "Video generation failed",
    };
  }
}

/**
 * Execute audio generation skill
 */
export async function executeAudioGeneration(
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("audio");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media",
    userId,
    tenantId: tenantId || "default",
    skillSlug: "audio-generation",
  });

  // Get model from params or defaults
  const modelInput = params.model;
  let model: AudioModel;
  if (modelInput) {
    model = mapToApiModelId(modelInput) as AudioModel;
  } else {
    const defaultModel = getDefaultModel("audio");
    if (!defaultModel) {
      return { success: false, skillId: "audio-generation", type: "audio", error: "No audio models available" };
    }
    model = defaultModel.id as AudioModel;
  }

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Unknown audio model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const audioCreditCost = calculateCreditCost(modelMeta, {
    text: params.prompt,
    ...(params.extraParams ?? {}),
  });
  const hasCredits = await hasEnoughCredits(userId, audioCreditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Insufficient credits. Need ${audioCreditCost} credits for audio generation.`,
    };
  }

  try {
    const apiConfig = {
      ...buildMediaApiConfig(modelMeta.configJson as Record<string, unknown> | undefined),
      ...(params.apiConfig ?? {}),
    };

    const result = await mediaGenerationService.generateAudio(
      {
        text: params.prompt,
        model,
        voice: params.voice,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          source: "skill_executor.executeAudioGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Extract URL
    const url = result.data?.[0]?.url;

    // Record step attempt for planner tracking
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: String(model),
        inputTokens: 0,
        outputTokens: 0,
        snapshot: plannerResult.snapshot,
        creditsUsed: result.creditsUsed || audioCreditCost,
      }).catch(() => {});
    }

    return {
      success: true,
      skillId: "audio-generation",
      type: "audio",
      data: result,
      resultUrl: url,
      message: `Generated audio using ${modelMeta.name}`,
      creditsUsed: result.creditsUsed || audioCreditCost,
    };
  } catch (error) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: error instanceof Error ? error.message : "Audio generation failed",
    };
  }
}

/**
 * Execute a skill via the OpenSandbox dispatch system.
 * Returns a sandbox-job result with jobId for client polling.
 */
async function executeSandboxSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string = "",
  executionModeOverride?: string,
  tenantId?: string,
): Promise<SkillExecutionResult> {
  if (!tenantId) {
    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error: "Tenant context required for secure sandbox execution.",
    };
  }

  const dispatchExecutionMode = executionModeOverride || skill.executionMode || "sandbox-code";
  try {
    const defaultMetadata: Record<string, unknown> = {
      skillSlug: skill.id,
      skillName: skill.name,
      prompt: params.prompt,
      extraParams: params.extraParams,
    };
    const dispatchPayload =
      dispatchExecutionMode === "sandbox-python"
        ? preparePythonSandboxPayload(skill, params, userToken)
        : {
            executionMode: dispatchExecutionMode,
            metadata: defaultMetadata,
          };

    const result = await sandboxDispatch({
      featureType: "skill",
      executionMode: dispatchPayload.executionMode as any,
      tenantId,
      userId,
      inputFiles: [],
      profileOverride: skill.sandboxProfileSlug,
      metadata: dispatchPayload.metadata,
    });

    return {
      success: true,
      skillId: skill.id,
      type: "sandbox-job",
      jobId: result.jobId,
      isAsync: true,
      message: `Skill '${skill.name}' dispatched to secure execution environment. Job ID: ${result.jobId}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SkillExecutor] Sandbox dispatch failed for skill '${skill.id}':`, errMsg);

    // Fall back to legacy python subprocess if dispatch mode is optional
    if (getDispatchMode() !== "required" && dispatchExecutionMode !== "sandbox-media") {
      console.warn(`[SkillExecutor] Falling back to legacy python subprocess for '${skill.id}'`);
      return await executePythonSkill(skill, params, userToken);
    }

    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error: `Secure execution environment temporarily unavailable. Please try again later.`,
    };
  }
}

/**
 * Execute a Python skill via subprocess (executionMode: "python")
 *
 * Uses async spawn (NOT spawnSync) to keep the Node.js event loop free.
 * This is critical for skills like ISC that call back to the system LLM
 * gateway (smartaihub.app/v1) during execution — spawnSync would deadlock
 * because Node.js can't handle the incoming gateway request while blocked.
 *
 * Convention:
 *   - Skill must have: <skill_dir>/python/skill.py
 *   - Input:  JSON written to stdin → { skill_name, prompt, params, context: { publicUrl, userToken } }
 *   - Output: JSON on stdout       → { success: true, output: string }
 *                                  | { success: false, error: string }
 *
 * Python executable: python-backend/.venv/bin/python (project venv)
 */
async function executePythonSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userToken: string = ""
): Promise<SkillExecutionResult> {
  const paths = resolvePythonSkillPaths(skill);
  if (!paths) {
    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error: `Python skill script not found for skill: ${skill.id}`,
    };
  }

  // Locate venv Python
  const projectRoot = path.resolve(process.cwd(), "..", "..");
  const venvPython = path.join(projectRoot, "python-backend", ".venv", "bin", "python");
  const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

  const input = JSON.stringify({
    skill_name: skill.id,
    prompt: params.prompt,
    params: params.extraParams ?? {},
    context: {
      publicUrl: params.publicUrl ?? "",
      userToken,
    },
  });

  console.log(`[SkillExecutor] Running Python skill (async): ${paths.scriptPath}`);

  const TIMEOUT_MS = 600_000; // 10 minutes

  return new Promise<SkillExecutionResult>((resolve) => {
    const child = spawn(pythonBin, [paths.scriptPath], { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: SkillExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Kill process and resolve on timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({
        success: false,
        skillId: skill.id,
        type: "text",
        error: `Python skill timed out after ${TIMEOUT_MS / 1000}s`,
      });
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.stdin.write(input);
    child.stdin.end();

    child.on("error", (err) => {
      settle({
        success: false,
        skillId: skill.id,
        type: "text",
        error: `Python process error: ${err.message}`,
      });
    });

    child.on("close", (code) => {
      // Log stderr (ISC progress lines) now that process completed
      if (stderr.trim()) {
        console.log(`[SkillExecutor] Python stderr:\n${stderr.trim()}`);
      }

      if (code !== 0) {
        const errDetail = stderr.trim() || "Unknown error";
        console.error(`[SkillExecutor] Python skill exited ${code}: ${errDetail}`);
        settle({
          success: false,
          skillId: skill.id,
          type: "text",
          error: `Python skill exited with code ${code}: ${errDetail}`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (!parsed.success) {
          // Python returns errors in "output" field (user-facing message), not "error"
          const errorMsg = parsed.error ?? parsed.output ?? "Python skill returned failure";
          console.error(`[SkillExecutor] Python skill failure: ${errorMsg}`);
          settle({ success: false, skillId: skill.id, type: "text", error: errorMsg });
          return;
        }
        settle({
          success: true,
          skillId: skill.id,
          type: "text",
          message: parsed.output ?? stdout.trim(),
          ...(parsed._action ? { _action: parsed._action as SkillCreateAction } : {}),
          ...((parsed.skill_path || parsed.skill_name || parsed.saved_proposals)
            ? {
                metadata: {
                  ...(parsed.skill_path ? { skillPath: parsed.skill_path } : {}),
                  ...(parsed.skill_name ? { skillName: parsed.skill_name } : {}),
                  ...(parsed.saved_proposals ? { savedProposals: parsed.saved_proposals } : {}),
                },
              }
            : {}),
        });
      } catch {
        // Non-JSON stdout — return raw output
        settle({ success: true, skillId: skill.id, type: "text", message: stdout.trim() });
      }
    });
  });
}

const TASK_TTL_SECONDS = 3600; // 1 hour

/**
 * Start a Python skill in the background and store the result in Redis.
 *
 * Returns a taskId immediately so the HTTP request can close while Python
 * continues running. The caller should poll `skill:task:<taskId>` in Redis
 * via the `chat.getSkillTaskResult` tRPC query.
 *
 * @param onComplete  Optional post-processing callback applied to the raw
 *                    Python result before it's stored (e.g. handleIscCreateSkill).
 */
export async function startPythonSkillTask(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string = "",
  onComplete?: (result: SkillExecutionResult) => Promise<SkillExecutionResult>,
): Promise<{ taskId: string }> {
  const redis = getRedisClient();
  const taskId = `${skill.id}:${userId}:${Date.now()}`;

  // Mark task as running immediately
  await redis.setex(
    `skill:task:${taskId}`,
    TASK_TTL_SECONDS,
    JSON.stringify({ status: "running", skillId: skill.id, userId, startedAt: Date.now() }),
  );

  // Run Python skill in background — do NOT await
  executePythonSkill(skill, params, userToken)
    .then(async (result) => {
      const finalResult = onComplete ? await onComplete(result) : result;
      await redis.setex(
        `skill:task:${taskId}`,
        TASK_TTL_SECONDS,
        JSON.stringify({ status: "done", skillId: skill.id, userId, result: finalResult }),
      );
    })
    .catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      await redis.setex(
        `skill:task:${taskId}`,
        TASK_TTL_SECONDS,
        JSON.stringify({
          status: "done",
          skillId: skill.id,
          userId,
          result: { success: false, skillId: skill.id, type: "text", error: msg },
        }),
      );
    });

  return { taskId };
}

/**
 * Get estimated credit cost for skill execution
 */
export function estimateSkillCost(
  skill: SkillDefinition,
  params: SkillExecutionParams
): number {
  const modelInput = params.model || skill.defaultModel;
  const model = modelInput ? mapToApiModelId(modelInput) : null;

  if (!model) {
    return 0;
  }

  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return 0;
  }

  let cost = modelMeta.creditCost;

  // Multiply for multiple images
  if (skill.type === "image-generation" && params.numImages) {
    cost *= params.numImages;
  }

  // Multiply for video duration
  if (skill.type === "video-generation" && params.duration) {
    cost *= Math.ceil(params.duration / 5);
  }

  return cost;
}

/**
 * Check if a skill can be automatically executed
 */
export function canAutoExecute(skill: SkillDefinition): boolean {
  // Media generation skills can be auto-executed
  // Including image-video-generation which can generate both images and videos
  return [
    "image-generation",
    "video-generation",
    "audio-generation",
    "image-video-generation"
  ].includes(skill.type);
}
