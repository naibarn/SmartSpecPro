import { VD_VIDEO_PROMPT_MAX } from "./contracts";
import { isKieAiProvider } from "./imagePromptBudget";

export { VD_VIDEO_PROMPT_MAX, isKieAiProvider };

/** Kie.ai video prompt allowance documented by the provider API. */
export const VD_VIDEO_PROMPT_KIE_AI_MAX = 4096;

/** Absolute ceiling accepted by the provider-aware video prompt pipeline. */
export const VD_VIDEO_PROMPT_ABSOLUTE_MAX = VD_VIDEO_PROMPT_KIE_AI_MAX;

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

/**
 * Resolve the effective video-prompt budget from the selected catalog model.
 * Kie.ai/Grok uses its documented 4096-character allowance; other providers
 * retain the legacy 2000-character floor unless they explicitly advertise a
 * video-specific limit in model config.
 */
export function resolveVdVideoPromptBudgetForCatalogModel(params: {
  provider?: unknown;
  configJson?: Record<string, unknown> | null;
}): number {
  const provider =
    params.provider ??
    params.configJson?.provider ??
    params.configJson?.providerName;
  if (isKieAiProvider(provider)) return VD_VIDEO_PROMPT_KIE_AI_MAX;

  const configured = resolveConfiguredVideoPromptMax(params.configJson);
  const requested = configured ?? VD_VIDEO_PROMPT_MAX;
  return Math.min(
    VD_VIDEO_PROMPT_ABSOLUTE_MAX,
    Math.max(VD_VIDEO_PROMPT_MAX, Math.floor(requested))
  );
}
