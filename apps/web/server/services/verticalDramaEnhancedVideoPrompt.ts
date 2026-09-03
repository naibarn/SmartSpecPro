import {
  buildEnhancedOnlyVideoPromptVariantStore,
  buildVideoPromptVariantStore,
  computeVideoPromptVariantFingerprint,
} from "@shared/verticalDramaSeries/videoPromptVariants";
import type { VideoShotMediaBundle } from "@shared/verticalDramaShotMedia";
import {
  parseVideoCapabilityProfile,
  selectVideoCapabilityMode,
} from "./verticalDramaVideoCapabilityProfile";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VerticalDramaEnhancedRuntimeSettings } from "./verticalDramaEnhancedRuntimeSettings";

export const GENERIC_COMMERCIAL_VIDEO_DIRECTOR_VERSION = "11.0.0";
export const GENERIC_COMMERCIAL_VIDEO_DIRECTOR_SDK_RANGE = "openai-agents>=0.22.0,<0.23";
export const GENERIC_COMMERCIAL_VIDEO_DIRECTOR_SKILL_SLUG =
  "generic-commercial-video-director";
export const GENERIC_COMMERCIAL_VIDEO_DIRECTOR_ADAPTER_VERSION = "1.0.0";
// Production profile runs an observed-start-state pass before prompt intent.
// Admission must budget both bounded Agent stages; actual settlement still
// uses the bridge-reported aggregate usage.
export const ENHANCED_ESTIMATED_INPUT_TOKENS = 24_000;
export const ENHANCED_ESTIMATED_OUTPUT_TOKENS = 6_000;

const SKILL_RELATIVE_PATH = "generic-commercial-video-director";

function resolvedUvExecutable(): string {
  const home = process.env.HOME?.trim();
  const candidates = [
    "/usr/local/bin/uv",
    "/usr/bin/uv",
    ...(home ? [resolve(home, ".local/bin/uv"), resolve(home, ".cargo/bin/uv")] : []),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? "uv";
}

export type EnhancedVideoPromptFlags = { ui: boolean; jobs: boolean; apply: boolean };

export type EnhancedRuntimeFacts = {
  packageVersion: string;
  manifestHash: string;
  sdkVersion: string;
  adapterVersion: string;
  bridgeAvailable: boolean;
  allowListEnforced: boolean;
  manifestHashApproved: boolean;
};

function resolvedSkillRoot(): string {
  // The repository runs from its root in development, while the production
  // node-api image runs from /app/apps/web and copies skills beside server/.
  // Keep this list fixed and repository-owned; it is not user configuration.
  const candidates = [
    resolve(process.cwd(), "apps/web/skills", SKILL_RELATIVE_PATH),
    resolve(process.cwd(), "skills", SKILL_RELATIVE_PATH),
    resolve(process.cwd(), "../skills", SKILL_RELATIVE_PATH),
    resolve(process.cwd(), "../../skills", SKILL_RELATIVE_PATH),
  ];
  return candidates.find(candidate =>
    existsSync(resolve(candidate, "skill.manifest.json")) &&
    existsSync(resolve(candidate, "pyproject.toml")),
  ) ?? candidates[0];
}

function readSkillManifestHash(skillRoot: string): string | null {
  try {
    return createHash("sha256")
      .update(readFileSync(resolve(skillRoot, "skill.manifest.json")))
      .digest("hex");
  } catch {
    return null;
  }
}

/**
 * Runtime facts are intentionally environment-owned. The browser cannot turn
 * this on by sending a flag or a command path. The default is unavailable so
 * installing the skill package alone never changes production behavior.
 */
export function resolveEnhancedRuntimeFacts(
  input: {
    settings?: Pick<VerticalDramaEnhancedRuntimeSettings, "enabled" | "approvedManifestHash" | "approvedSdkVersion" | "approvedAdapterVersion">;
    probe?: { bridgeAvailable: boolean; sdkVersion: string; adapterVersion: string };
  } = {},
): EnhancedRuntimeFacts {
  const settings = input.settings ?? {
    enabled: false,
    approvedManifestHash: "",
    approvedSdkVersion: "",
    approvedAdapterVersion: "",
  };
  const probe = input.probe ?? {
    bridgeAvailable: false,
    sdkVersion: "unknown",
    adapterVersion: "unknown",
  };
  const detectedManifestHash = readSkillManifestHash(resolvedSkillRoot());
  return {
    packageVersion: GENERIC_COMMERCIAL_VIDEO_DIRECTOR_VERSION,
    manifestHash: detectedManifestHash || "unknown",
    sdkVersion: probe.sdkVersion,
    adapterVersion: probe.adapterVersion,
    bridgeAvailable: probe.bridgeAvailable,
    allowListEnforced: settings.enabled,
    manifestHashApproved: Boolean(
      settings.approvedManifestHash &&
      detectedManifestHash &&
      settings.approvedManifestHash === detectedManifestHash &&
      settings.approvedSdkVersion === probe.sdkVersion &&
      settings.approvedAdapterVersion === probe.adapterVersion,
    ),
  };
}

type EnhancedRuntimeProbe = {
  bridgeAvailable: boolean;
  sdkVersion: string;
  adapterVersion: string;
};

let runtimeProbeCache: { value: EnhancedRuntimeProbe; expiresAt: number } | null = null;
let runtimeProbePromise: Promise<EnhancedRuntimeProbe> | null = null;

/**
 * Probe the fixed, repository-owned bridge without inheriting application
 * secrets or configuration. The result is cached briefly because the
 * Storyboard asks readiness for several shots at once.
 */
export async function probeEnhancedRuntime(): Promise<EnhancedRuntimeProbe> {
  const now = Date.now();
  if (runtimeProbeCache && now < runtimeProbeCache.expiresAt) return runtimeProbeCache.value;
  if (runtimeProbePromise) return runtimeProbePromise;

  runtimeProbePromise = new Promise<EnhancedRuntimeProbe>(resolveProbe => {
    const child = spawn(resolvedUvExecutable(), [
      "run",
      "--project",
      resolvedSkillRoot(),
      "python",
      "-m",
      "smartaihub_video_director.enhanced_bridge",
      "--health",
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        PYTHONUNBUFFERED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.on("data", chunk => stdout.push(Buffer.from(chunk)));
    child.on("error", () => {
      clearTimeout(timeout);
      resolveProbe({ bridgeAvailable: false, sdkVersion: "unknown", adapterVersion: "unknown" });
    });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolveProbe({ bridgeAvailable: false, sdkVersion: "unknown", adapterVersion: "unknown" });
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout).toString("utf8").trim()) as Record<string, unknown>;
        resolveProbe({
          bridgeAvailable: result.ok === true,
          sdkVersion: typeof result.sdkVersion === "string" ? result.sdkVersion : "unknown",
          adapterVersion: typeof result.adapterVersion === "string" ? result.adapterVersion : "unknown",
        });
      } catch {
        resolveProbe({ bridgeAvailable: false, sdkVersion: "unknown", adapterVersion: "unknown" });
      }
    });
  }).then(value => {
    runtimeProbeCache = { value, expiresAt: Date.now() + 30_000 };
    runtimeProbePromise = null;
    return value;
  });

  return runtimeProbePromise;
}

export async function getEnhancedRuntimeFacts(
  settings: VerticalDramaEnhancedRuntimeSettings,
): Promise<EnhancedRuntimeFacts> {
  return resolveEnhancedRuntimeFacts({ settings, probe: await probeEnhancedRuntime() });
}

export function buildEnhancedModelCapabilityFingerprint(input: {
  id: string;
  provider?: string | null;
  configJson?: Record<string, unknown> | null;
  videoCapabilityProfile?: unknown;
  supportsStartFrame?: boolean;
  maxReferenceImages?: number;
}): string {
  return computeVideoPromptVariantFingerprint({
    id: input.id,
    provider: input.provider ?? null,
    configJson: input.configJson ?? null,
    videoCapabilityProfile: input.videoCapabilityProfile ?? null,
    supportsStartFrame: input.supportsStartFrame ?? false,
    maxReferenceImages: input.maxReferenceImages ?? null,
  });
}

export type EnhancedModelFacts = {
  id: string;
  enabled: boolean;
  visionCapable?: boolean;
  structuredOutputsCapable?: boolean;
  capabilityFingerprint?: string;
  providerProfileId?: string;
  capabilitySnapshot?: Record<string, unknown>;
};

export type EnhancedStoryboardShot = {
  shotNumber: number;
  description: string;
  cameraSetup: string;
  characterIds: string[];
  locationId?: string;
  continuityNotes: string[];
  durationSeconds: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstNonBlankString(...values: unknown[]): string {
  return values.find(value => typeof value === "string" && value.trim())
    ?.toString()
    .trim() ?? "";
}

function stringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const result = value
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.trim().length > 0,
        )
        .map(entry => entry.trim());
      if (result.length > 0) return result;
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

/**
 * Normalizes persisted storyboard output for Enhanced authoring. Older
 * storyboard generators persist provider-shaped snake_case keys while the
 * TypeScript projection uses camelCase; readiness must not treat that valid
 * stored shot as missing.
 */
export function normalizeEnhancedStoryboardShot(
  value: unknown,
  fallbackShotNumber?: number,
): EnhancedStoryboardShot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const shotNumber = Number(
    raw.shotNumber ?? raw.shot_number ?? fallbackShotNumber,
  );
  if (!Number.isInteger(shotNumber) || shotNumber <= 0) return null;
  const camera = asRecord(raw.camera);
  const cameraSetup = firstNonBlankString(
    raw.cameraSetup,
    raw.camera_setup,
    typeof raw.camera === "string" ? raw.camera : "",
    camera
      ? Object.entries(camera)
          .filter(([, entry]) => typeof entry === "string" && entry.trim())
          .map(([key, entry]) => `${key}: ${entry}`)
          .join(", ")
      : "",
  );
  const locationId = firstNonBlankString(
    raw.locationId,
    raw.location_id,
    raw.location,
  );
  const durationValue = Number(raw.durationSeconds ?? raw.duration_seconds);
  return {
    shotNumber,
    description: firstNonBlankString(
      raw.description,
      raw.visualDescription,
      raw.visual_description,
      raw.action,
    ),
    cameraSetup,
    characterIds: stringArray(
      raw.characterIds,
      raw.character_ids,
      raw.requiredCharacterRefs,
      raw.required_character_refs,
      raw.characters,
    ),
    ...(locationId ? { locationId } : {}),
    continuityNotes: stringArray(raw.continuityNotes, raw.continuity_notes),
    durationSeconds:
      Number.isFinite(durationValue) && durationValue > 0
        ? durationValue
        : 8,
  };
}

/**
 * Enhanced prompt authoring and paid video submission have different
 * capability boundaries. Prompt authoring needs a declared temporal frame
 * mode for the approved Start/Stop pair, but its vision references are
 * prompt-only context and may use a different provider transport at render
 * time. The paid render path remains responsible for the full reference
 * transport admission check.
 */
export function isEnhancedCapabilityCompatible(input: {
  model: EnhancedModelFacts;
  mediaBundle: VideoShotMediaBundle;
}): boolean {
  const profile = parseVideoCapabilityProfile(input.model.capabilitySnapshot);
  if (!profile) return false;
  const capabilityInput = {
    startFrame: Boolean(input.mediaBundle.startFrame),
    stopFrame: Boolean(input.mediaBundle.stopFrame),
    references: input.mediaBundle.references,
  };
  const fullSelection = selectVideoCapabilityMode(profile, capabilityInput);
  if (fullSelection.mode.id !== "unsupported") return true;

  // A Start+Stop pair is independently meaningful to Enhanced authoring.
  // References are sent to the authoring Agent as visual evidence; do not
  // reject the prompt job solely because the selected video provider has a
  // separate reference-to-video transport for those attachments. Actual
  // video submission still performs the complete selection with references.
  if (capabilityInput.startFrame && capabilityInput.stopFrame) {
    return selectVideoCapabilityMode(profile, {
      ...capabilityInput,
      references: [],
    }).mode.id !== "unsupported";
  }
  return false;
}

export type EnhancedVideoPromptReadinessInput = {
  flags: EnhancedVideoPromptFlags;
  runtime: EnhancedRuntimeFacts;
  authoringModel: EnhancedModelFacts;
  targetVideoModel: EnhancedModelFacts;
  mediaBundle: VideoShotMediaBundle | Record<string, unknown> | null;
  tenantAuthorized: boolean;
  storyboardReady: boolean;
  capabilityReady?: boolean;
  estimatedCredits?: number | null;
  operation?: "generate" | "apply" | "finalize";
};

export type EnhancedReadinessReason =
  | "ENHANCED_UI_DISABLED"
  | "ENHANCED_JOBS_DISABLED"
  | "ENHANCED_APPLY_DISABLED"
  | "AGENT_SDK_UNAVAILABLE"
  | "AGENT_SDK_VERSION_UNSUPPORTED"
  | "AGENT_RUNTIME_NOT_READY"
  | "AGENT_MODEL_NOT_CONFIGURED"
  | "AGENT_VISION_REQUIRED"
  | "AGENT_STRUCTURED_OUTPUT_REQUIRED"
  | "PROVIDER_CAPABILITY_MISMATCH"
  | "TENANT_SCOPE_FAILURE"
  | "SHOT_PRECONDITION_FAILED";

export type EnhancedVideoPromptReadiness = {
  ready: boolean;
  reasons: EnhancedReadinessReason[];
  fallback: "none";
  runtime: Pick<EnhancedRuntimeFacts, "packageVersion" | "manifestHash" | "sdkVersion" | "adapterVersion">;
  targetVideoModelId: string | null;
  authoringModelId: string | null;
  estimatedCredits: number | null;
};

function isSupportedSdkVersion(version: string): boolean {
  return /^0\.22\.(?:\d+)$/.test(version.trim());
}

export function evaluateEnhancedVideoPromptReadiness(
  input: EnhancedVideoPromptReadinessInput,
): EnhancedVideoPromptReadiness {
  const reasons: EnhancedReadinessReason[] = [];
  const operation = input.operation ?? "generate";
  if (!input.flags.ui) reasons.push("ENHANCED_UI_DISABLED");
  if (operation !== "apply" && !input.flags.jobs) reasons.push("ENHANCED_JOBS_DISABLED");
  if (operation === "apply" && !input.flags.apply) {
    reasons.push("ENHANCED_APPLY_DISABLED");
  }
  // Applying an already persisted terminal variant must remain possible when
  // Agent runtime/job admission is disabled. Generate, edit, and finalize
  // still require the complete isolated runtime and authoring-model gate.
  if (operation !== "apply") {
    if (!input.runtime.bridgeAvailable) reasons.push("AGENT_SDK_UNAVAILABLE");
    else if (!isSupportedSdkVersion(input.runtime.sdkVersion)) reasons.push("AGENT_SDK_VERSION_UNSUPPORTED");
    if (!input.runtime.allowListEnforced || !input.runtime.manifestHashApproved || input.runtime.packageVersion !== GENERIC_COMMERCIAL_VIDEO_DIRECTOR_VERSION || !input.runtime.adapterVersion || input.runtime.adapterVersion === "unknown") {
      reasons.push("AGENT_RUNTIME_NOT_READY");
    }
    if (!input.authoringModel.id) reasons.push("AGENT_MODEL_NOT_CONFIGURED");
    else if (!input.authoringModel.enabled || input.authoringModel.visionCapable !== true) reasons.push("AGENT_VISION_REQUIRED");
    else if (input.authoringModel.structuredOutputsCapable !== true) reasons.push("AGENT_STRUCTURED_OUTPUT_REQUIRED");
  }
  if (!input.targetVideoModel.id || !input.targetVideoModel.enabled || !input.targetVideoModel.capabilityFingerprint || !input.targetVideoModel.providerProfileId) {
    reasons.push("PROVIDER_CAPABILITY_MISMATCH");
  }
  if (input.capabilityReady === false) reasons.push("PROVIDER_CAPABILITY_MISMATCH");
  if (!input.tenantAuthorized) reasons.push("TENANT_SCOPE_FAILURE");
  if (!input.storyboardReady || !input.mediaBundle) reasons.push("SHOT_PRECONDITION_FAILED");
  const uniqueReasons: EnhancedReadinessReason[] = Array.from(new Set(reasons));
  return {
    ready: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    fallback: "none",
    runtime: {
      packageVersion: input.runtime.packageVersion,
      manifestHash: input.runtime.manifestHash,
      sdkVersion: input.runtime.sdkVersion,
      adapterVersion: input.runtime.adapterVersion,
    },
    targetVideoModelId: input.targetVideoModel.id || null,
    authoringModelId: input.authoringModel.id || null,
    estimatedCredits: input.estimatedCredits ?? null,
  };
}

export type EnhancedSkillInput = {
  shot: Record<string, unknown>;
  continuity: Record<string, unknown>;
  dialogue: unknown[];
  mediaBundle: VideoShotMediaBundle;
  /** Authorized, transient vision inputs; never persisted in the variant. */
  visionReferences: Array<{ assetId: number; url: string; label: string }>;
  modelRouting: {
    mode: "locked";
    preferredModels: [string];
    fallbackModels: [];
    allowCrossProviderFallback: false;
  };
  targetVideoModel: EnhancedModelFacts;
  authoringModel: EnhancedModelFacts;
  generationMode: "plan_only";
  researchMode: "off" | "bounded";
  nativeAudioEnabled?: boolean;
};

export type EnhancedBridgeResult = {
  prompt: string;
  inputTokens?: number;
  outputTokens?: number;
  negativeMotionPrompt?: string;
  dialogue?: unknown[];
  audioDirection?: string;
  warnings?: string[];
  assumptions?: string[];
  researchProvenance?: unknown[];
  terminalPromptHash: string;
  skillVersion: string;
  adapterVersion: string;
  sdkVersion: string;
};

export class EnhancedVideoDirectorBridgeError extends Error {
  readonly code: "BRIDGE_UNAVAILABLE" | "BRIDGE_FAILED" | "BRIDGE_INVALID_OUTPUT";

  constructor(
    code: EnhancedVideoDirectorBridgeError["code"],
    message: string,
  ) {
    super(message);
    this.name = "EnhancedVideoDirectorBridgeError";
    this.code = code;
  }
}

export function getEnhancedBridgeResultValidationError(value: unknown): string | null {
  if (!value || typeof value !== "object") return "result must be an object";
  const result = value as Partial<EnhancedBridgeResult>;
  if (typeof result.prompt !== "string" || result.prompt.trim().length === 0 || result.prompt.length > 40_000) return "prompt must contain 1-40000 characters";
  if (typeof result.terminalPromptHash !== "string" || !/^[a-f0-9]{64}$/i.test(result.terminalPromptHash)) return "terminalPromptHash must be sha256 hex";
  const promptHash = createHash("sha256").update(result.prompt).digest("hex");
  if (promptHash !== result.terminalPromptHash.toLowerCase()) return "terminalPromptHash does not match prompt";
  if (result.skillVersion !== GENERIC_COMMERCIAL_VIDEO_DIRECTOR_VERSION) return "skillVersion mismatch";
  if (result.adapterVersion !== GENERIC_COMMERCIAL_VIDEO_DIRECTOR_ADAPTER_VERSION) return "adapterVersion mismatch";
  if (typeof result.sdkVersion !== "string" || !/^0\.22\.(?:\d+)$/.test(result.sdkVersion.trim())) return "sdkVersion is unsupported";
  for (const tokenCount of [result.inputTokens, result.outputTokens]) {
    if (tokenCount !== undefined && (!Number.isSafeInteger(tokenCount) || tokenCount < 0 || tokenCount > 500_000)) return "token counts must be safe integers between 0 and 500000";
  }
  if (result.negativeMotionPrompt !== undefined && typeof result.negativeMotionPrompt !== "string") return "negativeMotionPrompt must be a string when present";
  if (result.audioDirection !== undefined && typeof result.audioDirection !== "string") return "audioDirection must be a string when present";
  for (const list of [result.warnings, result.assumptions, result.researchProvenance]) {
    if (list !== undefined && !Array.isArray(list)) return "warnings, assumptions, and researchProvenance must be arrays when present";
  }
  return null;
}

export function validateEnhancedBridgeResult(value: unknown): value is EnhancedBridgeResult {
  return getEnhancedBridgeResultValidationError(value) === null;
}

function bridgeCommand(): [string, string[]] {
  return [resolvedUvExecutable(), [
    "run",
    "--project",
    resolvedSkillRoot(),
    "python",
    "-m",
    "smartaihub_video_director.enhanced_bridge",
  ]];
}

/**
 * JSON-lines bridge to the skill's isolated Python runtime. Only canonical,
 * server-built input is sent. The bridge has no callback into the app and its
 * output is still validated by the caller before persistence.
 */
export async function invokeEnhancedVideoDirectorBridge(
  input: EnhancedSkillInput,
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<EnhancedBridgeResult> {
  const env = options.env ?? {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    PYTHONUNBUFFERED: "1",
  };
  const [command, args] = bridgeCommand();
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...env, PYTHONUNBUFFERED: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on("data", chunk => chunks.push(Buffer.from(chunk)));
  child.stderr.on("data", chunk => errors.push(Buffer.from(chunk)));
  child.stdin.end(JSON.stringify(input));
  const timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 10 * 60_000);
  try {
    const [result] = (await once(child, "close")) as [number | null];
    const stdout = Buffer.concat(chunks).toString("utf8").trim();
    if (result !== 0) {
      throw new EnhancedVideoDirectorBridgeError(
        "BRIDGE_FAILED",
        errors.length ? Buffer.concat(errors).toString("utf8").slice(-2_000) : `bridge exited with ${result}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new EnhancedVideoDirectorBridgeError(
        "BRIDGE_INVALID_OUTPUT",
        "Enhanced Agent bridge returned invalid JSON",
      );
    }
    const validationError = getEnhancedBridgeResultValidationError(parsed);
    if (validationError) {
      throw new EnhancedVideoDirectorBridgeError(
        "BRIDGE_INVALID_OUTPUT",
        `Enhanced Agent bridge returned an invalid prompt bundle: ${validationError}`,
      );
    }
    return parsed as EnhancedBridgeResult;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildEnhancedSkillInput(input: {
  shot: Record<string, unknown>;
  continuity: Record<string, unknown>;
  mediaBundle: VideoShotMediaBundle;
  visionReferences?: Array<{ assetId: number; url: string; label: string }>;
  targetVideoModel: EnhancedModelFacts;
  authoringModel: EnhancedModelFacts;
  researchMode?: "off" | "bounded";
  nativeAudioEnabled?: boolean;
}): EnhancedSkillInput {
  const dialogue = Array.isArray(input.shot.dialogue) ? input.shot.dialogue : [];
  return {
    shot: { ...input.shot },
    continuity: { ...input.continuity },
    dialogue,
    mediaBundle: input.mediaBundle,
    visionReferences: input.visionReferences ?? [],
    modelRouting: {
      mode: "locked",
      preferredModels: [input.targetVideoModel.id],
      fallbackModels: [],
      allowCrossProviderFallback: false,
    },
    targetVideoModel: { ...input.targetVideoModel },
    authoringModel: { ...input.authoringModel },
    generationMode: "plan_only",
    researchMode: input.researchMode ?? "off",
    nativeAudioEnabled: input.nativeAudioEnabled ?? false,
  };
}

export function buildEnhancedVariantStore(input: {
  clip: Record<string, unknown>;
  skillInput: EnhancedSkillInput;
  bridge: EnhancedBridgeResult;
  sourceImageModelId?: string;
  targetModelFingerprint: string;
  providerProfileId: string;
  providerPlanHash: string;
  now?: string;
  jobId?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const enhanced = {
    variantId: "enhanced" as const,
    status: "ready" as const,
    prompt: input.bridge.prompt,
    ...(input.bridge.negativeMotionPrompt
      ? { negativeMotionPrompt: input.bridge.negativeMotionPrompt }
      : {}),
    ...(input.bridge.dialogue ? { dialogue: input.bridge.dialogue } : {}),
    ...(input.bridge.audioDirection
      ? { audioDirection: input.bridge.audioDirection }
      : {}),
    mediaBundle: input.skillInput.mediaBundle,
    inputFingerprint: buildEnhancedInputFingerprint(input.skillInput),
    terminalPromptHash: input.bridge.terminalPromptHash,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    skillVersion: input.bridge.skillVersion,
    adapterVersion: input.bridge.adapterVersion,
    sdkVersion: input.bridge.sdkVersion,
    ...(input.sourceImageModelId ? { sourceImageModelId: input.sourceImageModelId } : {}),
    authoringModelId: input.skillInput.authoringModel.id,
    targetVideoModelId: input.skillInput.targetVideoModel.id,
    targetModelSnapshot: input.skillInput.targetVideoModel.capabilitySnapshot ?? {},
    targetModelFingerprint: input.targetModelFingerprint,
    providerProfileId: input.providerProfileId,
    providerPlanHash: input.providerPlanHash,
    warnings: input.bridge.warnings ?? [],
    assumptions: input.bridge.assumptions ?? [],
    researchProvenance: Array.isArray(input.bridge.researchProvenance)
      ? input.bridge.researchProvenance.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
        )
      : [],
    ...(input.jobId ? { sourceJobId: input.jobId } : {}),
  };
  const hasLegacyPrompt =
    typeof input.clip.prompt === "string" && input.clip.prompt.trim().length > 0;
  return hasLegacyPrompt
    ? buildVideoPromptVariantStore({
        clip: input.clip,
        inputFingerprint: buildEnhancedInputFingerprint(input.skillInput),
        createdAt: now,
        selectedVideoModelId: input.skillInput.targetVideoModel.id,
        enhanced,
      })
    : buildEnhancedOnlyVideoPromptVariantStore({ enhanced });
}

export function buildEnhancedJobKey(input: {
  tenantId: string;
  userId: string;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  variantId: "enhanced";
  operation: "generate" | "finalize";
  idempotencyKey: string;
}): string {
  return [
    "vd-enhanced",
    input.tenantId,
    input.userId,
    input.seriesId,
    input.episodeId,
    input.shotNumber,
    input.variantId,
    input.operation,
    input.idempotencyKey,
  ].join(":");
}

export function buildEnhancedInputFingerprint(input: EnhancedSkillInput): string {
  return computeVideoPromptVariantFingerprint({
    shot: input.shot,
    continuity: input.continuity,
    dialogue: input.dialogue,
    mediaBundle: input.mediaBundle,
    modelRouting: input.modelRouting,
    targetVideoModel: input.targetVideoModel,
    authoringModel: input.authoringModel,
    generationMode: input.generationMode,
    researchMode: input.researchMode,
    nativeAudioEnabled: input.nativeAudioEnabled ?? false,
  });
}

export function isEnhancedJobResultApplicable(input: {
  expectedRevision: number;
  currentRevision: number;
  expectedInputFingerprint: string;
  currentInputFingerprint: string;
  flagEnabled: boolean;
}): boolean {
  return input.flagEnabled
    && input.expectedRevision === input.currentRevision
    && input.expectedInputFingerprint === input.currentInputFingerprint;
}

export function classifyEnhancedJobError(error: unknown): {
  code: "retryable" | "stale" | "blocked" | "failed";
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|temporar|rate limit|429/i.test(message)) return { code: "retryable", message };
  if (/stale|revision|fingerprint|model changed|media changed/i.test(message)) return { code: "stale", message };
  if (/credit|scope|unauthor|capability|disabled|sdk/i.test(message)) return { code: "blocked", message };
  return { code: "failed", message };
}
