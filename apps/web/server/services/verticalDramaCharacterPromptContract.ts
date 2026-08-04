import {
  resolveConfiguredMaxPromptLength,
  resolveVdImagePromptBudgetForModel,
} from "./modelPromptBudget";
import { getStaticModelById } from "./modelRegistry";

export const VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_KEY =
  "verticalDramaCharacterPromptContract" as const;

export const VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION =
  "vd_character_natural_human_v1" as const;
export const VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER =
  "vertical_drama_character_v1" as const;

export type VerticalDramaCharacterPromptFamily =
  | "gpt_image_2"
  | "nano_banana"
  | "seedream"
  | "other";

export type VerticalDramaCharacterPromptCapability = {
  family: VerticalDramaCharacterPromptFamily;
  maxPromptChars: number;
  negativePromptMode: "inline_only" | "separate_legacy";
  promptProfile: "rich" | "compact" | "legacy";
  source: "db" | "static" | "explicit_legacy";
  canonicalModelId: string;
  configured: boolean;
};

export type VerticalDramaCharacterPromptModelContext = {
  modelId: string;
  configJson?: Record<string, unknown> | null;
  referenceImageRoute?: string;
};

export type VerticalDramaCharacterPromptRequest = {
  prompt: string;
  negativePrompt?: string;
  model: string;
};

export type NormalizedVerticalDramaCharacterPromptRequest = Omit<
  VerticalDramaCharacterPromptRequest,
  "negativePrompt"
> & {
  negativePrompt?: string;
};

export type VerticalDramaCharacterPromptContractErrorCode =
  | "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING"
  | "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID"
  | "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG";

export class VerticalDramaCharacterPromptContractError extends Error {
  readonly code: VerticalDramaCharacterPromptContractErrorCode;
  readonly modelId: string;
  readonly family?: VerticalDramaCharacterPromptFamily;
  readonly maxPromptChars?: number;
  readonly promptLength?: number;

  constructor(params: {
    code: VerticalDramaCharacterPromptContractErrorCode;
    modelId: string;
    detail: string;
    family?: VerticalDramaCharacterPromptFamily;
    maxPromptChars?: number;
    promptLength?: number;
  }) {
    super(`${params.code}: model ${params.modelId} ${params.detail}`);
    this.name = params.code;
    this.code = params.code;
    this.modelId = params.modelId;
    this.family = params.family;
    this.maxPromptChars = params.maxPromptChars;
    this.promptLength = params.promptLength;
  }
}

type TargetPromptContract = {
  family: Exclude<VerticalDramaCharacterPromptFamily, "other">;
  negativePromptMode: "inline_only";
};

const TARGET_LIMITS: Record<TargetPromptContract["family"], number> = {
  gpt_image_2: 20_000,
  nano_banana: 20_000,
  seedream: 5_000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTargetContract(value: unknown): TargetPromptContract | null {
  if (!isRecord(value)) return null;

  const family = value.family;
  const negativePromptMode = value.negativePromptMode;
  if (
    (family !== "gpt_image_2" && family !== "nano_banana" && family !== "seedream") ||
    negativePromptMode !== "inline_only"
  ) {
    return null;
  }

  return { family, negativePromptMode };
}

function capabilityError(
  code: VerticalDramaCharacterPromptContractErrorCode,
  modelId: string,
  detail: string,
  metadata: Omit<ConstructorParameters<typeof VerticalDramaCharacterPromptContractError>[0], "code" | "modelId" | "detail"> = {},
): VerticalDramaCharacterPromptContractError {
  return new VerticalDramaCharacterPromptContractError({
    code,
    modelId,
    detail,
    ...metadata,
  });
}

function readRawPromptLimit(configJson: Record<string, unknown> | undefined): number | null {
  const raw = configJson?.maxPromptLength ?? configJson?.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed) ? parsed : null;
}

export function resolveVerticalDramaCharacterPromptCapability(
  context: VerticalDramaCharacterPromptModelContext,
  options: { requireTarget?: boolean } = {},
): VerticalDramaCharacterPromptCapability {
  const modelId = context.modelId.trim();
  const hasDbConfig = context.configJson !== undefined && context.configJson !== null;
  // Reference routing changes provider transport details only. The selected
  // canonical model remains the sole family/limit authority.
  // Some isolated router suites intentionally provide a minimal model-registry
  // mock. Treat an absent static lookup as an unknown model; DB capability
  // metadata remains authoritative when present.
  let staticModel: ReturnType<typeof getStaticModelById> | undefined;
  try {
    staticModel = getStaticModelById(modelId);
  } catch {
    // Minimal test/runtime registries may not expose static lookup; an absent
    // static row is equivalent to an unknown model for capability fallback.
    staticModel = undefined;
  }
  const staticConfig = isRecord(staticModel?.configJson) ? staticModel.configJson : undefined;
  const sourceConfig = hasDbConfig ? context.configJson : staticConfig;
  const source = hasDbConfig ? "db" : "static";
  const rawContract = sourceConfig?.[VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_KEY];

  if (rawContract === undefined) {
    if (options.requireTarget) {
      throw capabilityError(
        "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING",
        modelId,
        "does not declare target character prompt capability",
      );
    }

    return {
      family: "other",
      maxPromptChars: resolveVdImagePromptBudgetForModel({
        modelId,
        configJson: context.configJson,
      }),
      negativePromptMode: "separate_legacy",
      promptProfile: "legacy",
      source: "explicit_legacy",
      canonicalModelId: staticModel?.id ?? modelId,
      configured: false,
    };
  }

  const targetContract = readTargetContract(rawContract);
  const rawConfiguredLimit = readRawPromptLimit(sourceConfig ?? undefined);
  const configuredLimit = resolveConfiguredMaxPromptLength(sourceConfig);
  if (!targetContract || configuredLimit === null) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
      modelId,
      "declares malformed family, mode, or prompt limit",
    );
  }

  if (rawConfiguredLimit === null || rawConfiguredLimit !== configuredLimit) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
      modelId,
      "declares a non-integer prompt limit",
    );
  }

  const expectedLimit = TARGET_LIMITS[targetContract.family];
  if (configuredLimit !== expectedLimit) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
      modelId,
      `declares ${configuredLimit} characters for ${targetContract.family}; expected ${expectedLimit}`,
      { family: targetContract.family, maxPromptChars: configuredLimit },
    );
  }

  return {
    family: targetContract.family,
    maxPromptChars: configuredLimit,
    negativePromptMode: targetContract.negativePromptMode,
    promptProfile: targetContract.family === "seedream" ? "compact" : "rich",
    source,
    canonicalModelId: staticModel?.id ?? modelId,
    configured: true,
  };
}

export function isTargetVerticalDramaCharacterCapability(
  capability: VerticalDramaCharacterPromptCapability,
): boolean {
  const expectedLimit = capability.family === "gpt_image_2" || capability.family === "nano_banana"
    ? 20_000
    : capability.family === "seedream"
      ? 5_000
      : null;
  const expectedProfile = capability.family === "seedream" ? "compact" : "rich";
  return (
    capability.configured &&
    capability.negativePromptMode === "inline_only" &&
    capability.family !== "other" &&
    expectedLimit !== null &&
    capability.maxPromptChars === expectedLimit &&
    capability.promptProfile === expectedProfile
  );
}

export function assertVerticalDramaCharacterPromptLength(
  prompt: string,
  capability: VerticalDramaCharacterPromptCapability,
): void {
  const length = prompt.length;
  if (length <= capability.maxPromptChars) return;

  throw capabilityError(
    "VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG",
    capability.canonicalModelId,
    `for ${capability.family} is ${length} characters; maximum is ${capability.maxPromptChars}`,
    {
      family: capability.family,
      maxPromptChars: capability.maxPromptChars,
      promptLength: length,
    },
  );
}

/**
 * Final, transport-neutral character request normalizer. This is deliberately
 * boring: it selects/removes the legacy negative field and validates the
 * already-authored prompt; it never adds creative prose.
 */
export function normalizeVerticalDramaCharacterPromptRequest(
  request: VerticalDramaCharacterPromptRequest,
  params: {
    capability?: VerticalDramaCharacterPromptCapability;
    contractVersion?: string | null;
    marker?: string | null;
  },
): NormalizedVerticalDramaCharacterPromptRequest {
  if (params.marker !== VERTICAL_DRAMA_CHARACTER_REQUEST_MARKER) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
      request.model,
      "is missing the trusted character request marker",
    );
  }
  if (!params.capability) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING",
      request.model,
      "requires a resolved character prompt capability",
    );
  }
  const isTarget = isTargetVerticalDramaCharacterCapability(params.capability);
  if (params.contractVersion === VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION && !isTarget) {
    throw capabilityError(
      "VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID",
      request.model,
      "has a target contract version without a valid target capability",
    );
  }
  assertVerticalDramaCharacterPromptLength(request.prompt, params.capability);
  const normalized: NormalizedVerticalDramaCharacterPromptRequest = { ...request };
  if (isTarget) {
    delete normalized.negativePrompt;
  }
  return normalized;
}
