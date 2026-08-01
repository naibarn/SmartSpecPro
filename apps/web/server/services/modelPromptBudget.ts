import { VD_IMAGE_PROMPT_MAX } from "@shared/verticalDramaSeries";
import { getStaticModelById } from "./modelRegistry";

/** Absolute ceiling for any Vertical Drama image prompt. */
export const VD_IMAGE_PROMPT_ABSOLUTE_MAX = 20_000;

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

  return resolveConfiguredMaxPromptLength(getStaticModelById(modelId)?.configJson);
}

/** Literal model allowance normalized to the bounded Vertical Drama range. */
export function resolveVdImagePromptBudget(modelMax: number | null): number {
  const requested = modelMax ?? VD_IMAGE_PROMPT_MAX;
  return Math.min(VD_IMAGE_PROMPT_ABSOLUTE_MAX, Math.max(1, Math.floor(requested)));
}

/**
 * Effective Vertical Drama allowance. The legacy 3800-character budget is a
 * floor, making this capability change widening-only for low-cap model rows.
 */
export function resolveVdImagePromptBudgetForModel(params: {
  modelId: string;
  configJson?: Record<string, any> | null;
}): number {
  const modelMax = resolveModelMaxPromptLength(params.modelId, params.configJson);
  return Math.max(VD_IMAGE_PROMPT_MAX, resolveVdImagePromptBudget(modelMax));
}
