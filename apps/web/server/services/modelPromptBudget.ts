import {
  VD_IMAGE_PROMPT_MAX,
  VD_IMAGE_PROMPT_ABSOLUTE_MAX,
  isKieAiProvider,
} from "@shared/verticalDramaSeries/imagePromptBudget";
import { getStaticModelById } from "./modelRegistry";

export { VD_IMAGE_PROMPT_ABSOLUTE_MAX };

export function resolveConfiguredMaxPromptLength(
  configJson: Record<string, any> | null | undefined,
): number | null {
  if (!configJson || typeof configJson !== "object") {
    return null;
  }

  const raw = configJson.maxPromptLength ?? configJson.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function resolveModelMaxPromptLength(
  modelId: string,
  configJson: Record<string, any> | null | undefined,
): number | null {
  const dbLimit = resolveConfiguredMaxPromptLength(configJson);
  if (dbLimit !== null) {
    return dbLimit;
  }

  // Keep isolated callers and Vitest suites with a deliberately minimal
  // model-registry mock fail-closed as an unknown model instead of throwing
  // while resolving the optional static fallback.
  try {
    return resolveConfiguredMaxPromptLength(getStaticModelById(modelId)?.configJson);
  } catch {
    return null;
  }
}

/** Literal model allowance normalized to the bounded Vertical Drama range. */
export function resolveVdImagePromptBudget(modelMax: number | null): number {
  const requested = modelMax ?? VD_IMAGE_PROMPT_MAX;
  return Math.min(VD_IMAGE_PROMPT_ABSOLUTE_MAX, Math.max(1, Math.floor(requested)));
}

/**
 * Effective Vertical Drama allowance. Explicit model limits are honored as
 * written; the legacy 3800-character floor remains for non-Kie rows without
 * a usable provider limit.
 */
export function resolveVdImagePromptBudgetForModel(params: {
  modelId: string;
  configJson?: Record<string, any> | null;
  provider?: string | null;
}): number {
  let staticModel: ReturnType<typeof getStaticModelById> | undefined;
  try {
    staticModel = getStaticModelById(params.modelId);
  } catch {
    // Keep isolated callers fail-closed when the optional static registry is
    // unavailable (the same convention as resolveModelMaxPromptLength).
  }
  const provider =
    params.provider ??
    params.configJson?.provider ??
    params.configJson?.providerName ??
    staticModel?.provider;
  const modelMax = resolveModelMaxPromptLength(params.modelId, params.configJson);
  if (modelMax !== null && isKieAiProvider(provider)) {
    return resolveVdImagePromptBudget(modelMax);
  }
  if (isKieAiProvider(provider)) {
    return VD_IMAGE_PROMPT_ABSOLUTE_MAX;
  }
  return Math.max(VD_IMAGE_PROMPT_MAX, resolveVdImagePromptBudget(modelMax));
}
