/**
 * Skill Executor Service
 * Executes detected skills by calling the appropriate service
 */

import path from "path";
import { spawnSync, spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import { SkillDefinition } from "./skillRegistry";
import { getDb } from "../db";
import { sandboxProfiles } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
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
import {
  isSandboxEnabled,
  shouldUseSandboxForFeature,
  getDispatchMode,
  dispatchToSandbox as sandboxDispatch,
} from "./sandbox";
import { resolveSkillBundleDir } from "./skillFiles";
import { durabilizeMediaGenerationResponse } from "./durableMediaAssetService";
import { normalizeSkillRevenuePricing, settleSkillRun } from "./skillRevenueBilling";

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
const SANDBOX_FS_ROOT = "/tmp/smartspec-sandbox";
const SANDBOX_SKILL_ROOT = `${SANDBOX_FS_ROOT}/skill`;
const SANDBOX_INPUT_PATH = `${SANDBOX_FS_ROOT}/skill-input.json`;
const SANDBOX_OUTPUT_DIR = `${SANDBOX_FS_ROOT}/skill-output`;
const SANDBOX_MAX_INLINE_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const SANDBOX_MAX_INLINE_TOTAL_BYTES = 8 * 1024 * 1024; // 8MB total
const SKILL_SKIP_DIRS = new Set([".git", "__pycache__", "node_modules", ".venv", "venv", "runs"]);
const SKILL_SKIP_SUFFIXES = [".pyc", ".pyo"];
const BUILT_IN_SANDBOX_PROFILES: Record<string, SandboxProfileCapabilities> = {
  "code-default": {
    slug: "code-default",
    timeoutSeconds: 600,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: false,
    allowCodeInterpreter: true,
    maxInputMb: 50,
  },
  "browser-default": {
    slug: "browser-default",
    timeoutSeconds: 600,
    networkDefaultAction: "allow",
    allowBrowser: true,
    allowCommand: true,
    allowCodeInterpreter: false,
    maxInputMb: 50,
  },
  "file-parser": {
    slug: "file-parser",
    timeoutSeconds: 300,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: true,
    allowCodeInterpreter: false,
    maxInputMb: 100,
  },
  "media-processing": {
    slug: "media-processing",
    timeoutSeconds: 1800,
    networkDefaultAction: "deny",
    allowBrowser: false,
    allowCommand: true,
    allowCodeInterpreter: false,
    maxInputMb: 500,
  },
};

interface PythonSkillPaths {
  skillDir: string;
  scriptPath: string;
}

interface SandboxInlineFile {
  path: string;
  contentBase64: string;
}

interface SandboxProfileCapabilities {
  slug: string;
  timeoutSeconds: number;
  networkDefaultAction: string;
  allowBrowser: boolean;
  allowCommand: boolean;
  allowCodeInterpreter: boolean;
  maxInputMb: number | null;
}

interface CommandSkillPaths {
  skillDir: string;
  manifestPath: string;
  entryPath: string;
  packageJsonPath: string | null;
}

interface PreparedPythonSandboxPayload {
  executionMode: "sandbox-python";
  metadata: Record<string, unknown>;
}

interface PreparedCommandSandboxPayload {
  executionMode: "sandbox-command";
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

function addReferenceImageInputMetadata(
  apiConfig: Record<string, string>,
  configJson?: Record<string, unknown>,
): void {
  if (!configJson || typeof configJson !== "object") {
    return;
  }

  const inputFields = Array.isArray(configJson.inputFields) ? configJson.inputFields : [];
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
    const rawSyncWith = typeof field.syncWith === "string" ? field.syncWith.trim() : "";
    const rawLabel = typeof field.label === "string" ? field.label.trim() : "";
    const isReferenceImageField = (
      rawSyncWith === "reference_images"
      || normalizedKey === "imageinput"
      || normalizedKey === "referenceimages"
      || normalizedKey.includes("referenceimage")
      || normalizedKey.includes("imageurl")
    );
    if (!isReferenceImageField) {
      continue;
    }

    const rawType = typeof field.type === "string" ? field.type.trim().toLowerCase() : "";
    const referenceImageType = (
      rawType === "array"
      || rawType === "image_urls"
      || rawType === "video_urls"
      || rawType === "audio_urls"
    ) ? "array" : (
      rawType === "url"
      || rawType === "text"
      || rawType === "string"
    ) ? "url" : null;
    if (!referenceImageType) {
      continue;
    }

    apiConfig.reference_image_input_key = rawKey;
    apiConfig.reference_image_input_label = rawLabel || inferredLabel;
    apiConfig.reference_image_input_type = referenceImageType;
    break;
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
  setApiConfigValue(apiConfig, "generate_type", configJson.generateType);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4kEndpoint);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4KEndpoint);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4kUpgradeEndpoint);
  setApiConfigValue(apiConfig, "veo_4k_endpoint", configJson.veo4KUpgradeEndpoint);
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function isPathInsideDir(resolvedPath: string, rootDir: string): boolean {
  const relative = path.relative(rootDir, resolvedPath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sanitizeSandboxOutputFileName(
  value: unknown,
  fallback: string,
): string {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const normalized = raw.replace(/\\/g, "/");
  const basename = path.posix.basename(normalized);
  if (!basename || basename === "." || basename === ".." || basename !== normalized) {
    throw new Error(`Invalid sandbox output file name: ${raw}`);
  }
  return basename;
}

function readRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function pickFirstString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readStringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function pickFirstNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readNumberValue(source[key]);
    if (value != null) return value;
  }
  return null;
}

function pickFirstStringArray(source: Record<string, unknown> | null, keys: string[]): string[] {
  if (!source) return [];
  for (const key of keys) {
    const value = readStringArrayValue(source[key]);
    if (value.length > 0) return value;
  }
  return [];
}

function extractPythonSkillLineage(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const lineageSource = readRecordValue(parsed.lineage);
  const source = lineageSource ?? parsed;
  const lineage: Record<string, unknown> = {};

  const schemaVersion = pickFirstNumber(source, ["schemaVersion", "schema_version"]);
  if (schemaVersion != null) {
    lineage.schemaVersion = schemaVersion;
  }

  const role = pickFirstString(source, ["role"]);
  if (role) {
    lineage.role = role;
  }

  const status = pickFirstString(source, ["status", "phaseStatus", "phase_status"]);
  if (status) {
    lineage.status = status;
  }

  const checkpointVersion = pickFirstNumber(source, ["checkpointVersion", "checkpoint_version"]);
  if (checkpointVersion != null) {
    lineage.checkpointVersion = checkpointVersion;
  }

  const parentRunId = pickFirstString(source, ["parentRunId", "parent_run_id"]);
  if (parentRunId) {
    lineage.parentRunId = parentRunId;
  }

  const childRunIds = pickFirstStringArray(source, ["childRunIds", "child_run_ids"]);
  if (childRunIds.length > 0) {
    lineage.childRunIds = childRunIds;
  }

  const resumeCursor = pickFirstString(source, ["resumeCursor", "resume_cursor", "resume_hint"]);
  if (resumeCursor) {
    lineage.resumeCursor = resumeCursor;
  }

  const verificationState = pickFirstString(source, ["verificationState", "verification_state", "verificationStatus", "verification_status"]);
  if (verificationState) {
    lineage.verificationState = verificationState;
  }

  const artifactRefs = pickFirstStringArray(source, ["artifactRefs", "artifact_refs"]);
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

function resolvePythonSkillPaths(skill: SkillDefinition): PythonSkillPaths | null {
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

function resolveCommandSkillPaths(skill: SkillDefinition): CommandSkillPaths | null {
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

  for (const skillDir of Array.from(new Set(candidateDirs))) {
    const bundleDir = resolveSkillBundleDir(skillDir) ?? skillDir;
    const manifestPath = path.join(bundleDir, "skill.manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      const entry = typeof manifest.entry === "string" ? manifest.entry.trim() : "";
      if (!entry) {
        continue;
      }

      const entryPath = path.resolve(bundleDir, entry);
      if (!isPathInsideDir(entryPath, bundleDir) || !fs.existsSync(entryPath)) {
        continue;
      }

      const packageJsonPath = path.join(bundleDir, "package.json");
      return {
        skillDir: bundleDir,
        manifestPath,
        entryPath,
        packageJsonPath: fs.existsSync(packageJsonPath) ? packageJsonPath : null,
      };
    } catch (error) {
      console.warn(`[SkillExecutor] Failed to parse skill manifest for '${skill.id}':`, error);
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
      commonParams: buildPythonSkillCommonParams(params),
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

function getSandboxCommandInputPayload(
  skill: SkillDefinition,
  params: SkillExecutionParams,
): Record<string, unknown> {
  if (params.extraParams && typeof params.extraParams === "object" && !Array.isArray(params.extraParams)) {
    const raw = params.extraParams as Record<string, unknown>;
    const prioritizedPayloads = [
      raw.sandboxInput,
      raw.inputPayload,
      raw.input,
    ];
    for (const candidate of prioritizedPayloads) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return candidate as Record<string, unknown>;
      }
    }
    return raw;
  }

  return {
    request: {
      projectTitle: skill.name,
      language: "en",
      compositionMode: "slide-deck",
      outputFormats: ["json"],
      pagination: {
        maxPages: 5,
        allowFewerPages: true,
        overflowStrategy: "condense",
      },
      content: {
        titleHint: skill.name,
        rawText: params.prompt ?? "",
      },
    },
  };
}

function buildSandboxOutputPaths(inputPayload: Record<string, unknown>): string[] {
  const request = (
    inputPayload.request && typeof inputPayload.request === "object" && !Array.isArray(inputPayload.request)
      ? inputPayload.request
      : {}
  ) as Record<string, unknown>;
  const renderOptions = (
    request.renderOptions && typeof request.renderOptions === "object" && !Array.isArray(request.renderOptions)
      ? request.renderOptions
      : {}
  ) as Record<string, unknown>;
  const requestedFormats = Array.isArray(request.outputFormats)
    ? request.outputFormats.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : ["json"];

  const outputPaths = new Set<string>([
    `${SANDBOX_OUTPUT_DIR}/manifest.json`,
    `${SANDBOX_OUTPUT_DIR}/debug-report.json`,
  ]);

  if (requestedFormats.includes("json")) {
    outputPaths.add(`${SANDBOX_OUTPUT_DIR}/${sanitizeSandboxOutputFileName(renderOptions.jsonFileName, "layout-spec.json")}`);
  }
  if (requestedFormats.includes("md")) {
    outputPaths.add(`${SANDBOX_OUTPUT_DIR}/${sanitizeSandboxOutputFileName(renderOptions.mdFileName, "slides.md")}`);
  }
  if (requestedFormats.includes("pptx") || requestedFormats.includes("pdf")) {
    outputPaths.add(`${SANDBOX_OUTPUT_DIR}/${sanitizeSandboxOutputFileName(renderOptions.pptxFileName, "slides.pptx")}`);
  }
  if (requestedFormats.includes("pdf")) {
    outputPaths.add(`${SANDBOX_OUTPUT_DIR}/${sanitizeSandboxOutputFileName(renderOptions.pdfFileName, "slides.pdf")}`);
  }

  return Array.from(outputPaths);
}

function prepareCommandSandboxPayload(
  skill: SkillDefinition,
  params: SkillExecutionParams,
): PreparedCommandSandboxPayload {
  const paths = resolveCommandSkillPaths(skill);
  if (!paths) {
    throw new Error(`Command skill manifest not found for sandbox dispatch: ${skill.id}`);
  }

  const inlineFiles = collectSkillInlineFiles(paths.skillDir);
  const inputPayload = getSandboxCommandInputPayload(skill, params);
  const request = (
    inputPayload.request && typeof inputPayload.request === "object" && !Array.isArray(inputPayload.request)
      ? inputPayload.request
      : {}
  ) as Record<string, unknown>;
  const renderOptions = (
    request.renderOptions && typeof request.renderOptions === "object" && !Array.isArray(request.renderOptions)
      ? { ...(request.renderOptions as Record<string, unknown>) }
      : {}
  );
  renderOptions.jsonFileName = sanitizeSandboxOutputFileName(renderOptions.jsonFileName, "layout-spec.json");
  renderOptions.mdFileName = sanitizeSandboxOutputFileName(renderOptions.mdFileName, "slides.md");
  renderOptions.pptxFileName = sanitizeSandboxOutputFileName(renderOptions.pptxFileName, "slides.pptx");
  renderOptions.pdfFileName = sanitizeSandboxOutputFileName(renderOptions.pdfFileName, "slides.pdf");
  const sanitizedInputPayload = {
    ...inputPayload,
    request: {
      ...request,
      renderOptions,
    },
  };
  inlineFiles.push({
    path: SANDBOX_INPUT_PATH,
    contentBase64: Buffer.from(JSON.stringify(sanitizedInputPayload), "utf-8").toString("base64"),
  });

  const entryRelativePath = path.relative(paths.skillDir, paths.entryPath).split(path.sep).join("/");
  const entryPathInSandbox = `${SANDBOX_SKILL_ROOT}/${entryRelativePath}`;
  const commands = [`mkdir -p ${shellQuote(SANDBOX_OUTPUT_DIR)}`];
  if (paths.packageJsonPath) {
    commands.push(
      `npm --prefix ${shellQuote(SANDBOX_SKILL_ROOT)} install --omit=dev --no-package-lock --ignore-scripts --no-audit --no-fund`,
    );
  }
  commands.push(
    `node ${shellQuote(entryPathInSandbox)} ${shellQuote(SANDBOX_INPUT_PATH)} ${shellQuote(SANDBOX_OUTPUT_DIR)}`,
  );

  return {
    executionMode: "sandbox-command",
    metadata: {
      skillSlug: skill.id,
      skillName: skill.name,
      prompt: params.prompt,
      extraParams: params.extraParams,
      commands,
      output_paths: buildSandboxOutputPaths(sanitizedInputPayload),
      inlineFiles,
    },
  };
}

function resolveSandboxProfileOverride(
  skill: SkillDefinition,
  executionMode: string,
): string | undefined {
  if (skill.sandboxProfileSlug?.trim()) {
    return skill.sandboxProfileSlug.trim();
  }
  if (executionMode === "sandbox-code" || executionMode === "sandbox-python") {
    return "code-default";
  }
  if (executionMode === "sandbox-command" || executionMode === "sandbox-browser") {
    return "browser-default";
  }
  if (executionMode === "sandbox-file") {
    return "file-parser";
  }
  if (executionMode === "sandbox-media") {
    return "media-processing";
  }
  return undefined;
}

async function loadSandboxProfileCapabilities(
  profileSlug: string,
): Promise<SandboxProfileCapabilities | null> {
  const fallback = BUILT_IN_SANDBOX_PROFILES[profileSlug];
  try {
    const dbInstance = await getDb();
    if (!dbInstance) {
      return fallback ?? null;
    }

    const [profile] = await dbInstance
      .select({
        slug: sandboxProfiles.slug,
        timeoutSeconds: sandboxProfiles.timeoutSeconds,
        networkDefaultAction: sandboxProfiles.networkDefaultAction,
        allowBrowser: sandboxProfiles.allowBrowser,
        allowCommand: sandboxProfiles.allowCommand,
        allowCodeInterpreter: sandboxProfiles.allowCodeInterpreter,
        maxInputMb: sandboxProfiles.maxInputMb,
      })
      .from(sandboxProfiles)
      .where(and(eq(sandboxProfiles.slug, profileSlug), eq(sandboxProfiles.isActive, true)))
      .limit(1);

    return profile ?? fallback ?? null;
  } catch {
    return fallback ?? null;
  }
}

function estimateSandboxInputBytes(
  inputFiles: Array<{ key: string; mimeType: string; sizeBytes: number }>,
  metadata: Record<string, unknown>,
): number {
  let total = inputFiles.reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0);
  const inlineFiles = Array.isArray(metadata.inlineFiles) ? metadata.inlineFiles : [];
  for (const entry of inlineFiles) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const contentBase64 = (entry as Record<string, unknown>).contentBase64;
    if (typeof contentBase64 === "string") {
      total += Buffer.byteLength(contentBase64, "base64");
    }
  }
  return total;
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

function buildPythonSkillCommonParams(params: SkillExecutionParams): Record<string, unknown> {
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
  if (normalizeSkillRevenuePricing(skill).totalCredits > 0 && !tenantId?.trim()) {
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
  if (executionMode === "core-text" || executionMode === "llm-only" || executionMode === "enhance-prompt") {
    console.log(`[SkillExecutor] Skill '${skill.id}' has executionMode '${executionMode}' — returning text result for LLM processing`);
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

  // Sandbox execution modes — dispatch to OpenSandbox when enabled
  if (
    executionMode?.startsWith("sandbox-") ||
    (executionMode === "python" && isSandboxEnabled())
  ) {
    const sandboxMode =
      executionMode === "python"
        ? "sandbox-python"
        : (executionMode || "sandbox-code");
    let sandboxResult: SkillExecutionResult | null = null;
    try {
      if (shouldUseSandboxForFeature("skill", sandboxMode)) {
        console.log(`[SkillExecutor] Routing to sandbox dispatch (mode: ${sandboxMode})`);
        sandboxResult = await executeSandboxSkill(
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
    if (sandboxResult) {
      if (!sandboxResult.success) return sandboxResult;
      try {
        const settlement = await settleSkillRun({
          runId,
          userId,
          tenantId,
          skillSlug: skill.id,
          description: `Skill run: ${skill.name}`,
          metadata: { runtimeKind: "sandbox" },
        });
        return { ...sandboxResult, creditsUsed: settlement.totalCredits };
      } catch (err) {
        return {
          success: false,
          skillId: skill.id,
          type: sandboxResult.type,
          error: err instanceof Error ? err.message : "Skill billing settlement failed",
        };
      }
    }
  }

  // Python skills: subprocess execution (legacy)
  if (executionMode === "python") {
    console.log(`[SkillExecutor] Routing to executePythonSkill (executionMode: python)`);
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
      console.log(`[SkillExecutor] Skill type is image-video-generation, routing to video generation`);
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
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
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
    const urls = durableResult.data?.map((d) => d.url).filter((u): u is string => !!u) || [];

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
  tenantId?: string,
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
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
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
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string,
  tenantId?: string,
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
          tenantId: tenantId || undefined,
          skillRunId: params.runId,
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
      skillRunId: params.runId,
      prompt: params.prompt,
      extraParams: params.extraParams,
    };
    const dispatchPayload =
      dispatchExecutionMode === "sandbox-python"
        ? preparePythonSandboxPayload(skill, params, userToken)
        : dispatchExecutionMode === "sandbox-command"
          ? prepareCommandSandboxPayload(skill, params)
        : {
            executionMode: dispatchExecutionMode,
            metadata: defaultMetadata,
          };

    const profileOverride = resolveSandboxProfileOverride(
      skill,
      dispatchPayload.executionMode,
    );
    if (!profileOverride) {
      throw new Error(`No sandbox profile resolved for skill '${skill.id}'`);
    }

    const profile = await loadSandboxProfileCapabilities(profileOverride);
    if (!profile) {
      throw new Error(`Sandbox profile '${profileOverride}' not found or inactive`);
    }

    if (dispatchPayload.executionMode === "sandbox-command" && !profile.allowCommand) {
      throw new Error(`Sandbox profile '${profile.slug}' does not allow command execution`);
    }

    if (
      (dispatchPayload.executionMode === "sandbox-code" || dispatchPayload.executionMode === "sandbox-python")
      && !profile.allowCodeInterpreter
    ) {
      throw new Error(`Sandbox profile '${profile.slug}' does not allow code execution`);
    }

    if ((dispatchPayload.executionMode === "sandbox-browser" || skill.requiresBrowser) && !profile.allowBrowser) {
      throw new Error(`Sandbox profile '${profile.slug}' does not allow browser access`);
    }

    if (skill.requiresNetwork && profile.networkDefaultAction !== "allow") {
      throw new Error(`Sandbox profile '${profile.slug}' does not allow network access`);
    }

    const inputLimitMb = [skill.maxInputMb ?? null, profile.maxInputMb ?? null]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
      .reduce<number | null>((minValue, value) => minValue == null ? value : Math.min(minValue, value), null);
    if (inputLimitMb != null) {
      const inputBytes = estimateSandboxInputBytes([], dispatchPayload.metadata);
      if (inputBytes > inputLimitMb * 1024 * 1024) {
        throw new Error(
          `Sandbox input size ${Math.ceil(inputBytes / (1024 * 1024))}MB exceeds limit of ${inputLimitMb}MB`,
        );
      }
    }

    const requestedTimeoutSeconds = (
      typeof skill.maxRuntimeSeconds === "number" && Number.isFinite(skill.maxRuntimeSeconds) && skill.maxRuntimeSeconds > 0
        ? Math.min(skill.maxRuntimeSeconds, profile.timeoutSeconds)
        : null
    );
    if (requestedTimeoutSeconds != null && requestedTimeoutSeconds !== profile.timeoutSeconds) {
      dispatchPayload.metadata = {
        ...dispatchPayload.metadata,
        runtimeOverrides: {
          timeoutSeconds: requestedTimeoutSeconds,
        },
      };
    }

    const result = await sandboxDispatch({
      featureType: "skill",
      executionMode: dispatchPayload.executionMode as any,
      tenantId,
      userId,
      inputFiles: [],
      profileOverride,
      idempotencyKey: params.runId,
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
    // BUT only if the skill actually has a Python script — media-generate
    // skills (image-creator, etc.) don't have python/skill.py and should
    // fall through to type-based routing (executeImageGeneration, etc.)
    if (getDispatchMode() !== "required" && dispatchExecutionMode !== "sandbox-media") {
      const hasPythonScript = resolvePythonSkillPaths(skill) !== null;
      if (hasPythonScript) {
        console.warn(`[SkillExecutor] Falling back to legacy python subprocess for '${skill.id}'`);
        const pythonResult = await executePythonSkill(skill, params, userToken);
        if (!pythonResult.success) return pythonResult;
        const settlement = await settleSkillRun({
          runId: params.runId ?? randomUUID(),
          userId,
          tenantId,
          skillSlug: skill.id,
          description: `Skill run: ${skill.name}`,
          metadata: { runtimeKind: "python", originSurface: "sandbox_fallback" },
        });
        return { ...pythonResult, creditsUsed: settlement.totalCredits };
      }
      return {
        success: false,
        skillId: skill.id,
        type: "text",
        error: errMsg,
      };
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
      commonParams: buildPythonSkillCommonParams(params),
      skillRunId: params.runId,
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
        message: `Python skill timed out after ${TIMEOUT_MS / 1000}s`,
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
          const errorMsg = parsed.error ?? parsed.output ?? "Python skill returned failure";
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
          ...(parsed._action ? { _action: parsed._action as SkillCreateAction } : {}),
          ...((parsed.skill_path || parsed.skill_name || parsed.saved_proposals || Object.keys(combinedMetadata).length > 0)
            ? {
                metadata: {
                  ...combinedMetadata,
                  ...(parsed.skill_path ? { skillPath: parsed.skill_path } : {}),
                  ...(parsed.skill_name ? { skillName: parsed.skill_name } : {}),
                  ...(parsed.saved_proposals ? { savedProposals: parsed.saved_proposals } : {}),
                  ...(parsed.bundle_topology ? { bundleTopology: parsed.bundle_topology } : {}),
                  ...(parsed.subagent_manifest ? { subagentManifest: parsed.subagent_manifest } : {}),
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
