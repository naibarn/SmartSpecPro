import { VD_IMAGE_PROMPT_MAX } from "./contracts";

export { VD_IMAGE_PROMPT_MAX };

/** Absolute ceiling accepted by the Vertical Drama image-prompt pipeline. */
export const VD_IMAGE_PROMPT_ABSOLUTE_MAX = 390_000;

/** Kie.ai provider aliases used by the model catalog and legacy routes. */
export function isKieAiProvider(provider: unknown): boolean {
  const normalized = String(provider ?? "").trim().toLowerCase();
  return (
    normalized === "kie.ai" ||
    normalized === "kie_ai" ||
    normalized === "kie-ai" ||
    normalized === "kie"
  );
}

export function resolveConfiguredImagePromptMax(
  configJson: Record<string, unknown> | null | undefined,
): number | null {
  if (!configJson || typeof configJson !== "object") return null;
  const raw = configJson.maxPromptLength ?? configJson.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

/**
 * Resolve the display/enforcement budget from a catalog model row.
 * Model-specific catalog limits take precedence. Kie.ai's 390,000-character
 * allowance is only the fallback when the catalog row has no limit.
 */
export function resolveVdImagePromptBudgetForCatalogModel(params: {
  provider?: unknown;
  configJson?: Record<string, unknown> | null;
}): number {
  const provider =
    params.provider ??
    params.configJson?.provider ??
    params.configJson?.providerName;
  const configured = resolveConfiguredImagePromptMax(params.configJson);
  if (configured !== null && isKieAiProvider(provider)) {
    return Math.min(
      VD_IMAGE_PROMPT_ABSOLUTE_MAX,
      Math.max(1, Math.floor(configured)),
    );
  }
  if (isKieAiProvider(provider)) return VD_IMAGE_PROMPT_ABSOLUTE_MAX;

  const requested = configured ?? VD_IMAGE_PROMPT_MAX;
  return Math.min(
    VD_IMAGE_PROMPT_ABSOLUTE_MAX,
    Math.max(VD_IMAGE_PROMPT_MAX, Math.floor(requested)),
  );
}
