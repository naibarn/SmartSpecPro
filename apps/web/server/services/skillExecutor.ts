/**
 * Skill Executor Service
 * Executes detected skills by calling the appropriate service
 */

import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import { SkillDefinition } from "./skillRegistry";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
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
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { durabilizeMediaGenerationResponse } from "./durableMediaAssetService";
import {
  normalizeSkillRevenuePricing,
  settleSkillRun,
} from "./skillRevenueBilling";

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
function setApiConfigValue(
  apiConfig: Record<string, string>,
  key: string,
  value: unknown
): void {
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

function mergeApiConfigObject(
  apiConfig: Record<string, string>,
  value: unknown
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    setApiConfigValue(apiConfig, key, entryValue);
  }
}

function addReferenceImageInputMetadata(
  apiConfig: Record<string, string>,
  configJson?: Record<string, unknown>
): void {
  if (!configJson || typeof configJson !== "object") {
    return;
  }

  const inputFields = Array.isArray(configJson.inputFields)
    ? configJson.inputFields
    : [];
  for (const rawField of inputFields) {
    if (!rawField || typeof rawField !== "object") {
      continue;
    }
    const field = rawField as Record<string, unknown>;
    const rawKey = typeof field.key === "string" ? field.key.trim() : "";
    if (!rawKey) {
      continue;
    }

    const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const inferredLabel = normalizedKey.includes("video")
      ? "Reference Videos"
      : normalizedKey.includes("audio")
        ? "Reference Audio"
        : "Reference Images";
    const rawSyncWith =
      typeof field.syncWith === "string" ? field.syncWith.trim() : "";
    const rawLabel = typeof field.label === "string" ? field.label.trim() : "";
    const isReferenceImageField =
      rawSyncWith === "reference_images" ||
      normalizedKey === "imageinput" ||
      normalizedKey === "referenceimages" ||
      normalizedKey.includes("referenceimage") ||
      normalizedKey.includes("imageurl");
    if (!isReferenceImageField) {
      continue;
    }

    const rawType =
      typeof field.type === "string" ? field.type.trim().toLowerCase() : "";
    const referenceImageType =
      rawType === "array" ||
      rawType === "image_urls" ||
      rawType === "video_urls" ||
      rawType === "audio_urls"
        ? "array"
        : rawType === "url" || rawType === "text" || rawType === "string"
          ? "url"
          : null;
    if (!referenceImageType) {
      continue;
    }

    apiConfig.reference_image_input_key = rawKey;
    apiConfig.reference_image_input_label = rawLabel || inferredLabel;
    apiConfig.reference_image_input_type = referenceImageType;
    break;
  }
}

function buildMediaApiConfig(
  configJson?: Record<string, unknown>
): Record<string, string> {
  const apiConfig: Record<string, string> = {};
  if (!configJson || typeof configJson !== "object") {
    return apiConfig;
  }
  setApiConfigValue(apiConfig, "endpoint", configJson.apiEndpoint);
  setApiConfigValue(apiConfig, "query_endpoint", configJson.apiQueryEndpoint);
  setApiConfigValue(apiConfig, "payload_format", configJson.apiPayloadFormat);
  setApiConfigValue(apiConfig, "kie_model_id", configJson.kieModelId);
  setApiConfigValue(apiConfig, "generate_type", configJson.generateType);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4kEndpoint);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4KEndpoint);
  setApiConfigValue(
    apiConfig,
    "veo_4k_endpoint",
    configJson.veo4kUpgradeEndpoint
  );
  setApiConfigValue(
    apiConfig,
    "veo_4k_endpoint",
    configJson.veo4KUpgradeEndpoint
  );
  mergeApiConfigObject(apiConfig, configJson.apiConfig);
  addReferenceImageInputMetadata(apiConfig, configJson);
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

function readRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
}

function pickFirstString(
  source: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readStringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(
  source: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readNumberValue(source[key]);
    if (value != null) return value;
  }
  return null;
}

function pickFirstStringArray(
  source: Record<string, unknown> | null,
  keys: string[]
): string[] {
  if (!source) return [];
  for (const key of keys) {
    const value = readStringArrayValue(source[key]);
    if (value.length > 0) return value;
  }
  return [];
}

function extractPythonSkillLineage(
  parsed: Record<string, unknown>
): Record<string, unknown> | null {
  const lineageSource = readRecordValue(parsed.lineage);
  const source = lineageSource ?? parsed;
  const lineage: Record<string, unknown> = {};

  const schemaVersion = pickFirstNumber(source, [
    "schemaVersion",
    "schema_version",
  ]);
  if (schemaVersion != null) {
    lineage.schemaVersion = schemaVersion;
  }

  const role = pickFirstString(source, ["role"]);
  if (role) {
    lineage.role = role;
  }

  const status = pickFirstString(source, [
    "status",
    "phaseStatus",
    "phase_status",
  ]);
  if (status) {
    lineage.status = status;
  }

  const checkpointVersion = pickFirstNumber(source, [
    "checkpointVersion",
    "checkpoint_version",
  ]);
  if (checkpointVersion != null) {
    lineage.checkpointVersion = checkpointVersion;
  }

  const parentRunId = pickFirstString(source, ["parentRunId", "parent_run_id"]);
  if (parentRunId) {
    lineage.parentRunId = parentRunId;
  }

  const childRunIds = pickFirstStringArray(source, [
    "childRunIds",
    "child_run_ids",
  ]);
  if (childRunIds.length > 0) {
    lineage.childRunIds = childRunIds;
  }

  const resumeCursor = pickFirstString(source, [
    "resumeCursor",
    "resume_cursor",
    "resume_hint",
  ]);
  if (resumeCursor) {
    lineage.resumeCursor = resumeCursor;
  }

  const verificationState = pickFirstString(source, [
    "verificationState",
    "verification_state",
    "verificationStatus",
    "verification_status",
  ]);
  if (verificationState) {
    lineage.verificationState = verificationState;
  }

  const artifactRefs = pickFirstStringArray(source, [
    "artifactRefs",
    "artifact_refs",
  ]);
  if (artifactRefs.length > 0) {
    lineage.artifactRefs = artifactRefs;
  }

  if (Object.keys(lineage).length === 0) {
    return null;
  }
  if (lineage.schemaVersion == null) {
    lineage.schemaVersion = 1;
  }
  if (lineage.role == null) {
    lineage.role = "orchestrator";
  }
  return lineage;
}

function resolvePythonSkillPaths(
  skill: SkillDefinition
): PythonSkillPaths | null {
  const candidateDirs: string[] = [];

  const addSkillFilePathCandidate = () => {
    if (!skill.skillFilePath) {
      return;
    }
    const relativeDir = path.dirname(skill.skillFilePath);
    if (path.isAbsolute(relativeDir)) {
      candidateDirs.push(relativeDir);
    } else {
      candidateDirs.push(path.resolve(process.cwd(), relativeDir));
      candidateDirs.push(path.resolve(process.cwd(), "..", "..", relativeDir));
    }
  };

  const rootCandidates = [
    path.resolve(process.cwd(), "skills"),
    path.resolve(process.cwd(), "apps", "web", "skills"),
    path.resolve(process.cwd(), "..", "..", "apps", "web", "skills"),
  ];

  if (skill.id === "intelligence-skill-creator") {
    for (const root of rootCandidates) {
      candidateDirs.push(path.join(root, skill.id));
    }
    addSkillFilePathCandidate();
  } else {
    addSkillFilePathCandidate();
    for (const root of rootCandidates) {
      candidateDirs.push(path.join(root, skill.id));
    }
  }

  const deduped = Array.from(new Set(candidateDirs));
  for (const skillDir of deduped) {
    if (isWorkspaceArtifactPath(skillDir)) {
      continue;
    }
    const scriptPath = path.join(skillDir, "python", "skill.py");
    if (fs.existsSync(scriptPath)) {
      return { skillDir, scriptPath };
    }
  }

  return null;
}

function isWorkspaceArtifactPath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return normalized.includes("/runs/workspaces/");
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
  /** Stable id for fixed-credit settlement and provider charge suppression. */
  runId?: string;
}

export interface SkillCreateAction {
  type: "create_skill";
  name: string;
  slug: string;
  description: string;
  skillContent: string;
  triggerPatterns: string[];
}

function buildPythonSkillCommonParams(
  params: SkillExecutionParams
): Record<string, unknown> {
  const commonParams: Record<string, unknown> = {};
  const setIfPresent = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    commonParams[key] = value;
  };

  setIfPresent("aspectRatio", params.aspectRatio);
  setIfPresent("resolution", params.resolution);
  setIfPresent("quality", params.quality);
  setIfPresent("style", params.style);
  setIfPresent("numImages", params.numImages);
  setIfPresent("duration", params.duration);
  setIfPresent("voice", params.voice);
  setIfPresent("model", params.model);
  setIfPresent("referenceImageUrls", params.referenceImageUrls);
  setIfPresent("referenceStyleUrl", params.referenceStyleUrl);

  return commonParams;
}

export interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: "image" | "video" | "audio" | "text" | "action";
  data?: MediaGenerationResponse;
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  isAsync?: boolean;
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
  tenantId?: string
): Promise<SkillExecutionResult> {
  const runId = params.runId ?? randomUUID();
  params = { ...params, runId };
  console.log(`[SkillExecutor] Executing skill:`, {
    id: skill.id,
    name: skill.name,
    type: skill.type,
    executionMode: (skill as any).executionMode,
    userId,
    prompt: params.prompt?.substring(0, 100),
  });

  if (skill.tenantId && skill.tenantId !== tenantId) {
    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error: "Skill is not available in the active tenant",
    };
  }
  if (
    normalizeSkillRevenuePricing(skill).totalCredits > 0 &&
    !tenantId?.trim()
  ) {
    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error: "Tenant context required for skill revenue settlement",
    };
  }

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
  if (
    executionMode === "core-text" ||
    executionMode === "llm-only" ||
    executionMode === "enhance-prompt"
  ) {
    console.log(
      `[SkillExecutor] Skill '${skill.id}' has executionMode '${executionMode}' — returning text result for LLM processing`
    );
    const settlement = await settleSkillRun({
      runId,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: { runtimeKind: "llm", originSurface: "skill_executor" },
    });
    return {
      success: true,
      skillId: skill.id,
      type: "text",
      message: params.prompt || `Using skill: ${skill.name}`,
      creditsUsed: settlement.totalCredits,
    };
  }

  // OpenSandbox execution modes are retired. Do not fall back to local execution:
  // stale records must be migrated to the worker_jobs runtime explicitly.
  if (executionMode?.startsWith("sandbox-")) {
    return {
      success: false,
      skillId: skill.id,
      type: "text",
      error:
        "This skill uses a retired sandbox runtime; migrate it to worker_jobs before execution.",
    };
  }

  // Python skills: subprocess execution (legacy)
  if (executionMode === "python") {
    console.log(
      `[SkillExecutor] Routing to executePythonSkill (executionMode: python)`
    );
    const pythonResult = await executePythonSkill(skill, params, userToken);
    if (!pythonResult.success) return pythonResult;
    const settlement = await settleSkillRun({
      runId,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: { runtimeKind: "python", originSurface: "skill_executor" },
    });
    return { ...pythonResult, creditsUsed: settlement.totalCredits };
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
      console.log(
        `[SkillExecutor] Skill type is image-video-generation, routing to video generation`
      );
      return executeVideoGeneration(skill, params, userId, userToken, tenantId);

    case "audio-generation":
      console.log(`[SkillExecutor] Routing to executeAudioGeneration`);
      return executeAudioGeneration(skill, params, userId, userToken, tenantId);

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
      console.error(
        `[SkillExecutor] Unknown skill type '${skill.type}' for skill '${skill.id}'`
      );
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
  tenantId?: string
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("image");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media_image",
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
      return {
        success: false,
        skillId: skill.id,
        type: "image",
        error: "No image models available",
      };
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
  const creditCost = normalizeSkillRevenuePricing(skill).totalCredits;

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
      ...buildMediaApiConfig(
        modelMeta.configJson as Record<string, unknown> | undefined
      ),
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
        ...(params.extraParams && Object.keys(params.extraParams).length > 0
          ? { extraParams: params.extraParams }
          : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
          skillSlug: skill.id,
          source: "skill_executor.executeImageGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    const durableResult = await durabilizeMediaGenerationResponse(result, {
      tenantId: tenantId || "",
      userId,
      mediaType: "image",
      sourceType: "chat_generated",
    });

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Extract URLs
    const urls =
      durableResult.data?.map(d => d.url).filter((u): u is string => !!u) || [];

    // Record step attempt for planner tracking
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: String(model),
        inputTokens: 0,
        outputTokens: 0,
        snapshot: plannerResult.snapshot,
        creditsUsed: durableResult.creditsUsed || creditCost,
      }).catch(() => {});
    }

    const settlement = await settleSkillRun({
      runId: params.runId!,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: { runtimeKind: "media", mediaType: "image", model },
    });
    return {
      success: true,
      skillId: skill.id,
      type: "image",
      data: durableResult,
      resultUrl: urls[0],
      resultUrls: urls,
      message: `Generated ${urls.length} image${urls.length > 1 ? "s" : ""} using ${modelMeta.name}`,
      creditsUsed: settlement.totalCredits,
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
  tenantId?: string
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("video");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media_video",
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
      return {
        success: false,
        skillId: skill.id,
        type: "video",
        error: "No video models available",
      };
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
  const creditCost = normalizeSkillRevenuePricing(skill).totalCredits;

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
      ...buildMediaApiConfig(
        modelMeta.configJson as Record<string, unknown> | undefined
      ),
      ...(params.apiConfig ?? {}),
    };

    // Generate video asynchronously — forward all params including extraParams
    console.log(
      "[executeVideoGeneration] Preparing to call generateVideoAsync with:",
      {
        model,
        duration,
        aspectRatio: params.aspectRatio,
        promptLength: params.prompt?.length,
        hasApiConfig: Object.keys(apiConfig).length > 0,
        hasExtraParams: !!(
          params.extraParams && Object.keys(params.extraParams).length > 0
        ),
      }
    );

    const task = await mediaGenerationService.generateVideoAsync(
      {
        prompt: params.prompt,
        model,
        duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        referenceImageUrls: params.referenceImageUrls,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0
          ? { extraParams: params.extraParams }
          : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
          skillSlug: skill.id,
          source: "skill_executor.executeVideoGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    console.log("[executeVideoGeneration] Task created successfully:", {
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

    const settlement = await settleSkillRun({
      runId: params.runId!,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: { runtimeKind: "media", mediaType: "video", model },
    });
    return {
      success: true,
      skillId: skill.id,
      type: "video",
      taskId: task.id,
      isAsync: true,
      message: `Video generation started using ${modelMeta.name}. Task ID: ${task.id}. You can check the status in the Media Generation panel.`,
      creditsUsed: settlement.totalCredits,
    };
  } catch (error) {
    console.error(
      "[executeVideoGeneration] Error during video generation:",
      error
    );
    console.error("[executeVideoGeneration] Error details:", {
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
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string
): Promise<SkillExecutionResult> {
  // Ensure model cache is loaded from DB before any lookups
  await getModelsByTypeAsync("audio");

  // Wire task planner for media tracking
  const plannerResult = await runPlanner({
    sourceType: "media_audio",
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
      return {
        success: false,
        skillId: "audio-generation",
        type: "audio",
        error: "No audio models available",
      };
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
  const audioCreditCost = normalizeSkillRevenuePricing(skill).totalCredits;
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
      ...buildMediaApiConfig(
        modelMeta.configJson as Record<string, unknown> | undefined
      ),
      ...(params.apiConfig ?? {}),
    };

    const result = await mediaGenerationService.generateAudio(
      {
        text: params.prompt,
        model,
        voice: params.voice,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0
          ? { extraParams: params.extraParams }
          : {}),
        ...(params.publicUrl ? { publicUrl: params.publicUrl } : {}),
        auditContext: {
          userId,
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
          skillSlug: skill.id,
          source: "skill_executor.executeAudioGeneration",
          stage: "submission",
        },
      } as any,
      userToken
    );

    const durableResult = await durabilizeMediaGenerationResponse(result, {
      tenantId: tenantId || "",
      userId,
      mediaType: "audio",
      sourceType: "chat_generated",
    });

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Record step attempt for planner tracking
    if (plannerResult) {
      recordStepAttempt({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        model: String(model),
        inputTokens: 0,
        outputTokens: 0,
        snapshot: plannerResult.snapshot,
        creditsUsed: durableResult.creditsUsed || audioCreditCost,
      }).catch(() => {});
    }

    const settlement = await settleSkillRun({
      runId: params.runId!,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: { runtimeKind: "media", mediaType: "audio", model },
    });
    return {
      success: true,
      skillId: "audio-generation",
      type: "audio",
      data: durableResult,
      resultUrl: durableResult.data?.[0]?.url,
      message: `Generated audio using ${modelMeta.name}`,
      creditsUsed: settlement.totalCredits,
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
  const venvPython = path.join(
    projectRoot,
    "python-backend",
    ".venv",
    "bin",
    "python"
  );
  const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

  const input = JSON.stringify({
    skill_name: skill.id,
    prompt: params.prompt,
    params: params.extraParams ?? {},
    context: {
      publicUrl: params.publicUrl ?? "",
      userToken,
      commonParams: buildPythonSkillCommonParams(params),
      skillRunId: params.runId,
    },
  });

  console.log(
    `[SkillExecutor] Running Python skill (async): ${paths.scriptPath}`
  );

  const TIMEOUT_MS = 600_000; // 10 minutes

  return new Promise<SkillExecutionResult>(resolve => {
    const child = spawn(pythonBin, [paths.scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

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
        message: `Python skill timed out after ${TIMEOUT_MS / 1000}s`,
        error: `Python skill timed out after ${TIMEOUT_MS / 1000}s`,
      });
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdin.write(input);
    child.stdin.end();

    child.on("error", err => {
      settle({
        success: false,
        skillId: skill.id,
        type: "text",
        message: `Python process error: ${err.message}`,
        error: `Python process error: ${err.message}`,
        metadata: {
          errorKind: "process_error",
          errorMessage: err.message,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        },
      });
    });

    child.on("close", code => {
      // Log stderr (ISC progress lines) now that process completed
      if (stderr.trim()) {
        console.log(`[SkillExecutor] Python stderr:\n${stderr.trim()}`);
      }

      if (code !== 0) {
        const errDetail = stderr.trim() || "Unknown error";
        console.error(
          `[SkillExecutor] Python skill exited ${code}: ${errDetail}`
        );
        settle({
          success: false,
          skillId: skill.id,
          type: "text",
          message: `Python skill exited with code ${code}: ${errDetail}`,
          error: `Python skill exited with code ${code}: ${errDetail}`,
          metadata: {
            errorKind: "non_zero_exit",
            exitCode: code,
            stderr: stderr.trim(),
            stdout: stdout.trim(),
          },
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        const parsedMetadata = readRecordValue(parsed.metadata);
        const lineage = extractPythonSkillLineage(parsed);
        const combinedMetadata = {
          ...(parsedMetadata ?? {}),
          ...(lineage ? { lineage } : {}),
        };
        if (!parsed.success) {
          // Python returns errors in "output" field (user-facing message), not "error"
          const errorMsg =
            parsed.error ?? parsed.output ?? "Python skill returned failure";
          console.error(`[SkillExecutor] Python skill failure: ${errorMsg}`);
          settle({
            success: false,
            skillId: skill.id,
            type: "text",
            message: errorMsg,
            error: errorMsg,
            ...(Object.keys(combinedMetadata).length > 0
              ? {
                  metadata: combinedMetadata,
                }
              : {}),
          });
          return;
        }
        settle({
          success: true,
          skillId: skill.id,
          type: "text",
          message: parsed.output ?? stdout.trim(),
          ...(parsed._action
            ? { _action: parsed._action as SkillCreateAction }
            : {}),
          ...(parsed.skill_path ||
          parsed.skill_name ||
          parsed.saved_proposals ||
          Object.keys(combinedMetadata).length > 0
            ? {
                metadata: {
                  ...combinedMetadata,
                  ...(parsed.skill_path
                    ? { skillPath: parsed.skill_path }
                    : {}),
                  ...(parsed.skill_name
                    ? { skillName: parsed.skill_name }
                    : {}),
                  ...(parsed.saved_proposals
                    ? { savedProposals: parsed.saved_proposals }
                    : {}),
                  ...(parsed.bundle_topology
                    ? { bundleTopology: parsed.bundle_topology }
                    : {}),
                  ...(parsed.subagent_manifest
                    ? { subagentManifest: parsed.subagent_manifest }
                    : {}),
                },
              }
            : {}),
        });
      } catch {
        // Non-JSON stdout — return raw output
        settle({
          success: true,
          skillId: skill.id,
          type: "text",
          message: stdout.trim(),
          metadata: {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            parseError: "Failed to parse JSON output from Python skill",
          },
        });
      }
    });
  });
}

/**
 * Admit a skill execution to the canonical worker queue.
 *
 * Returns a taskId immediately so the HTTP request can close while Python
 * continues running. The caller should poll `skill:task:<taskId>` in Redis
 * via the `chat.getSkillTaskResult` tRPC query.
 *
 */
export async function startSkillTask(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  tenantId: string,
  userToken: string = ""
): Promise<{ taskId: string }> {
  if (!tenantId.trim()) throw new Error("TENANT_CONTEXT_REQUIRED");
  const taskId = randomUUID();

  const job = await createControlPlaneJob({
    context: {
      tenantId,
      actorType: "user",
      actorId: userId,
      authorizationScope: "skill:execute",
      correlationId: taskId,
      idempotencyKey: taskId,
    },
    definition: {
      contractVersion: "feature-186-v1",
      jobType: "skill.execute",
      executionClass: "long",
      input: {
        skillId: skill.id,
        userId,
        tenantId,
        params,
        runId: params.runId ?? taskId,
      },
      retryPolicy: {
        maxAttempts: 2,
        baseDelayMs: 5_000,
        maxDelayMs: 60_000,
        jitter: "bounded",
        deadlineMs: 60 * 60_000,
        allowedErrorClasses: ["retryable", "unknown"],
      },
      timeoutPolicy: {
        softTimeoutMs: 5 * 60_000,
        hardTimeoutMs: 30 * 60_000,
      },
      requiredCapabilities: {
        skillId: skill.id,
        executionMode: skill.executionMode ?? "llm-only",
      },
    },
    createOptions: { runtimeType: "node_job_worker" },
  });
  return { taskId: job.jobId };
}

/** @deprecated Use startSkillTask. Kept for the Skill Studio compatibility API. */
export const startPythonSkillTask = startSkillTask;

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
    "image-video-generation",
  ].includes(skill.type);
}
