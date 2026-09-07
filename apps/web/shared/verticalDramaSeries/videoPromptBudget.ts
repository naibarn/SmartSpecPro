import { VD_VIDEO_PROMPT_MAX } from "./contracts";
import { isKieAiProvider } from "./imagePromptBudget";

export { VD_VIDEO_PROMPT_MAX, isKieAiProvider };

export const VD_VIDEO_PROMPT_GROK_MAX = 4096;
export const VD_VIDEO_PROMPT_MINIMAX_H3_MAX = 7000;
export const VD_VIDEO_PROMPT_OMNI_FLASH_1_1_MAX = 20_000;
export const VD_VIDEO_PROMPT_WAN_3_MAX = 20_000;
export const VD_VIDEO_PROMPT_SEEDANCE_2_5_MAX = 30_000;

/** @deprecated Provider identity is not a prompt-budget identity. */
export const VD_VIDEO_PROMPT_KIE_AI_MAX = VD_VIDEO_PROMPT_GROK_MAX;

/** Absolute ceiling accepted by the provider-aware video prompt pipeline. */
export const VD_VIDEO_PROMPT_ABSOLUTE_MAX = VD_VIDEO_PROMPT_SEEDANCE_2_5_MAX;

function resolveConfiguredVideoPromptMax(
  configJson: Record<string, unknown> | null | undefined
): number | null {
  if (!configJson || typeof configJson !== "object") return null;
  const raw =
    configJson.maxVideoPromptLength ?? configJson.max_video_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function resolveConfiguredGenericPromptMax(
  configJson: Record<string, unknown> | null | undefined
): number | null {
  if (!configJson || typeof configJson !== "object") return null;
  const raw = configJson.maxPromptLength ?? configJson.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function normalizedModelIdentity(params: {
  modelId?: unknown;
  name?: unknown;
  providerProfileId?: unknown;
  configJson?: Record<string, unknown> | null;
}): string {
  const config = params.configJson;
  return [
    params.modelId,
    params.name,
    params.providerProfileId,
    config?.modelId,
    config?.model_id,
    config?.modelKey,
    config?.model_key,
    config?.kieModelId,
    config?.kie_model_id,
    config?.providerProfileId,
    config?.provider_profile_id,
    config?.name,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function resolveKnownModelCeiling(identity: string): number | null {
  if (/grok.*(?:imagine-?video|video-?1[.-]?5)/.test(identity)) {
    return VD_VIDEO_PROMPT_GROK_MAX;
  }
  if (/(?:minimax|hailuo).*h3|h3.*(?:minimax|hailuo)/.test(identity)) {
    return VD_VIDEO_PROMPT_MINIMAX_H3_MAX;
  }
  if (/(?:gemini-)?omni.*(?:1[.-]?1).*flash|(?:gemini-)?omni.*flash.*(?:1[.-]?1)/.test(identity)) {
    return VD_VIDEO_PROMPT_OMNI_FLASH_1_1_MAX;
  }
  if (/seedance.*2[.-]?5/.test(identity)) {
    return VD_VIDEO_PROMPT_SEEDANCE_2_5_MAX;
  }
  if (/\bwan-?3[.-]?0\b/.test(identity)) {
    return VD_VIDEO_PROMPT_WAN_3_MAX;
  }
  return null;
}

/**
 * Resolve the effective video-prompt budget from the selected catalog model.
 * Kie.ai/Grok uses its documented 4096-character allowance; other providers
 * retain the legacy 2000-character floor unless they explicitly advertise a
 * video-specific limit in model config.
 */
export function resolveVdVideoPromptBudgetForCatalogModel(params: {
  modelId?: unknown;
  name?: unknown;
  providerProfileId?: unknown;
  provider?: unknown;
  configJson?: Record<string, unknown> | null;
}): number {
  const knownCeiling = resolveKnownModelCeiling(normalizedModelIdentity(params));
  const configuredVideo = resolveConfiguredVideoPromptMax(params.configJson);
  if (knownCeiling !== null) {
    return Math.max(
      1,
      Math.min(knownCeiling, configuredVideo ?? knownCeiling),
    );
  }
  const requested = configuredVideo ??
    resolveConfiguredGenericPromptMax(params.configJson) ??
    VD_VIDEO_PROMPT_MAX;
  return Math.min(
    VD_VIDEO_PROMPT_ABSOLUTE_MAX,
    Math.max(VD_VIDEO_PROMPT_MAX, Math.floor(requested))
  );
}
