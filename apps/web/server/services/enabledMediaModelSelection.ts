import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { mediaModels, mediaProviders } from "../../drizzle/schema";
import { normalizeMediaProviderName } from "./mediaProviderUtils";
import type { MediaType } from "./mediaGenerationService";

type MediaModelRow = {
  id: number;
  modelId: string;
  name: string;
  modelType: "image" | "video" | "audio";
  provider: string;
  aliases: unknown;
  creditCost: number;
  aspectRatios: unknown;
  sizes: unknown;
  durations: unknown;
  voices: unknown;
  configJson: Record<string, unknown> | null;
  isEnabled: boolean;
  priority: number;
  sortOrder: number;
};

type MediaProviderRow = {
  providerName: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  apiKeyEncrypted: string | null;
  priority: number;
  sortOrder: number;
};

export type EnabledMediaModelSelection =
  | {
      ok: true;
      modelId: string;
      provider: string;
      providerName: string;
      name: string;
      reason: string;
      substituted: boolean;
      model: MediaModelRow;
      providerRow: MediaProviderRow;
    }
  | {
      ok: false;
      reasonCode:
        | "media_registry_unavailable"
        | "media_provider_disabled"
        | "media_provider_not_configured"
        | "media_model_disabled"
        | "media_model_not_enabled";
      message: string;
    };

export interface ResolveEnabledMediaModelSelectionInput {
  mediaType: MediaType;
  requestedModel?: string | null;
  requestedProvider?: string | null;
  requireConfiguredProvider?: boolean;
  allowSubstitution?: boolean;
}

function normalizeModelComparable(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function inferMediaModelHintFromText(mediaType: MediaType, text?: string | null): string | null {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (mediaType === "video") {
    if (/veo.*extend|extend.*veo|veo3\/extend-video/i.test(normalized)) return "veo3/extend-video";
    if (/veo\s*3(?:\.\s*1|\.1)?|veo\s*3\.1|veo3/i.test(normalized)) return "veo3/generate-veo-3-video-lite";
    if (/\bsora\b|sora\s*2/i.test(normalized)) return "sora-2";
    if (/\bkling\b/i.test(normalized)) return "kling-2.6";
    if (/\bseedance\b/i.test(normalized)) return "seedance";
    if (/\bgrok\b/i.test(normalized)) return "grok-video";
  }
  if (mediaType === "image") {
    if (/gpt\s*image/i.test(normalized)) return "gpt-image";
    if (/nano\s*banana|banana\s*pro/i.test(normalized)) return "google-nano-banana-pro";
    if (/\bseedream\b/i.test(normalized)) return "seedream";
  }
  return null;
}

function hasConfiguredKey(provider: MediaProviderRow): boolean {
  return (
    provider.hasApiKey ||
    (typeof provider.apiKeyEncrypted === "string" && provider.apiKeyEncrypted.trim().length > 0)
  );
}

function providerIsEnabled(provider: MediaProviderRow | undefined): provider is MediaProviderRow {
  return provider !== undefined && provider.isEnabled !== false;
}

function modelIsEnabled(model: MediaModelRow): boolean {
  return model.isEnabled !== false;
}

function parseAliases(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function scoreModelMatch(model: MediaModelRow, requestedModel: string): number {
  const requestedComparable = normalizeModelComparable(requestedModel);
  if (!requestedComparable) return 0;

  const candidates = [
    model.modelId,
    model.name,
    ...parseAliases(model.aliases),
  ];
  const candidateComparables = candidates
    .map((candidate) => normalizeModelComparable(candidate))
    .filter(Boolean);

  if (candidateComparables.some((candidate) => candidate === requestedComparable)) {
    return 100;
  }
  if (
    candidateComparables.some(
      (candidate) =>
        candidate.includes(requestedComparable) ||
        requestedComparable.includes(candidate),
    )
  ) {
    return 80;
  }

  const requestedText = normalizeSearchText(requestedModel);
  const requestedTokens = requestedText.split(" ").filter(Boolean);
  if (requestedTokens.length === 0) return 0;

  let bestScore = 0;
  for (const candidate of candidates) {
    const candidateText = normalizeSearchText(candidate);
    if (!candidateText) continue;
    const matchedTokens = requestedTokens.filter((token) => candidateText.includes(token));
    const coverage = matchedTokens.length / requestedTokens.length;
    if (coverage >= 1) bestScore = Math.max(bestScore, 70);
    else if (coverage >= 0.67) bestScore = Math.max(bestScore, 50);
    else if (coverage >= 0.5) bestScore = Math.max(bestScore, 30);
  }
  return bestScore;
}

function sortModels(a: MediaModelRow, b: MediaModelRow): number {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (a.priority ?? 99) - (b.priority ?? 99) ||
    (a.id ?? 0) - (b.id ?? 0)
  );
}

function findExactModel(rows: MediaModelRow[], requestedModel: string): MediaModelRow | null {
  const requestedComparable = normalizeModelComparable(requestedModel);
  return (
    rows.find((row) => row.modelId === requestedModel) ??
    rows.find((row) => normalizeModelComparable(row.modelId) === requestedComparable) ??
    null
  );
}

export async function resolveEnabledMediaModelSelection(
  input: ResolveEnabledMediaModelSelectionInput,
): Promise<EnabledMediaModelSelection> {
  const requireConfiguredProvider = input.requireConfiguredProvider ?? true;
  const allowSubstitution = input.allowSubstitution ?? true;
  const requestedProvider = input.requestedProvider
    ? normalizeMediaProviderName(input.requestedProvider)
    : null;
  const requestedModel = input.requestedModel?.trim() || null;

  let db;
  try {
    db = await getDb();
  } catch (error) {
    return {
      ok: false,
      reasonCode: "media_registry_unavailable",
      message: error instanceof Error ? error.message : "Media registry is unavailable.",
    };
  }
  if (!db) {
    return {
      ok: false,
      reasonCode: "media_registry_unavailable",
      message: "Media registry is unavailable.",
    };
  }

  const [modelRows, providerRows] = await Promise.all([
    db
      .select({
        id: mediaModels.id,
        modelId: mediaModels.modelId,
        name: mediaModels.name,
        modelType: mediaModels.modelType,
        provider: mediaModels.provider,
        aliases: mediaModels.aliases,
        creditCost: mediaModels.creditCost,
        aspectRatios: mediaModels.aspectRatios,
        sizes: mediaModels.sizes,
        durations: mediaModels.durations,
        voices: mediaModels.voices,
        configJson: mediaModels.configJson,
        isEnabled: mediaModels.isEnabled,
        priority: mediaModels.priority,
        sortOrder: mediaModels.sortOrder,
      })
      .from(mediaModels)
      .where(eq(mediaModels.modelType, input.mediaType))
      .limit(500),
    db
      .select({
        providerName: mediaProviders.providerName,
        isEnabled: mediaProviders.isEnabled,
        hasApiKey: mediaProviders.hasApiKey,
        apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
        priority: mediaProviders.priority,
        sortOrder: mediaProviders.sortOrder,
      })
      .from(mediaProviders)
      .limit(500),
  ]);

  const rowsFromDb = modelRows as MediaModelRow[];
  const providersFromDb = providerRows as MediaProviderRow[];
  const effectiveProviderRows = providersFromDb.length > 0
    ? providersFromDb
    : Array.from(new Set(rowsFromDb.map((row) => normalizeMediaProviderName(row.provider)).filter(Boolean)))
        .map((providerName, index) => ({
          providerName,
          isEnabled: true,
          hasApiKey: true,
          apiKeyEncrypted: null,
          priority: index,
          sortOrder: index,
        }));

  const providerMap = new Map<string, MediaProviderRow>();
  for (const provider of effectiveProviderRows) {
    providerMap.set(normalizeMediaProviderName(provider.providerName), provider);
  }

  if (requestedProvider) {
    const provider = providerMap.get(requestedProvider);
    if (!providerIsEnabled(provider)) {
      return {
        ok: false,
        reasonCode: "media_provider_disabled",
        message: `Media provider "${input.requestedProvider}" is not enabled.`,
      };
    }
    if (requireConfiguredProvider && !hasConfiguredKey(provider)) {
      return {
        ok: false,
        reasonCode: "media_provider_not_configured",
        message: `Media provider "${input.requestedProvider}" is not configured.`,
      };
    }
  }

  const rows = rowsFromDb.filter((row) => !row.modelType || row.modelType === input.mediaType);
  const exactModel = requestedModel ? findExactModel(rows, requestedModel) : null;

  const enabledModels = rows
    .filter((row) => {
      if (!modelIsEnabled(row)) return false;
      const normalizedProvider = normalizeMediaProviderName(row.provider);
      const provider = providerMap.get(normalizedProvider);
      if (!providerIsEnabled(provider)) return false;
      if (requireConfiguredProvider && !hasConfiguredKey(provider)) return false;
      if (requestedProvider && normalizedProvider !== requestedProvider) return false;
      return true;
    })
    .sort(sortModels);

  let exactModelBlocked: Extract<EnabledMediaModelSelection, { ok: false }> | null = null;
  if (exactModel && modelIsEnabled(exactModel)) {
    const normalizedProvider = normalizeMediaProviderName(exactModel.provider);
    const provider = providerMap.get(normalizedProvider);
    if (!providerIsEnabled(provider)) {
      exactModelBlocked = {
        ok: false,
        reasonCode: "media_provider_disabled",
        message: `Media provider "${exactModel.provider}" for model "${exactModel.modelId}" is not enabled.`,
      };
    } else if (requireConfiguredProvider && !hasConfiguredKey(provider)) {
      exactModelBlocked = {
        ok: false,
        reasonCode: "media_provider_not_configured",
        message: `Media provider "${exactModel.provider}" for model "${exactModel.modelId}" is not configured.`,
      };
    } else if (!requestedProvider || normalizedProvider === requestedProvider) {
      return {
        ok: true,
        modelId: exactModel.modelId,
        provider: normalizedProvider,
        providerName: provider.providerName,
        name: exactModel.name || exactModel.modelId,
        reason: "explicit_enabled_model",
        substituted: false,
        model: exactModel,
        providerRow: provider,
      };
    }
  }

  if (requestedModel) {
    const ranked = enabledModels
      .map((model) => ({ model, score: scoreModelMatch(model, requestedModel) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || sortModels(a.model, b.model));
    const matched = ranked[0]?.model;
    if (matched) {
      const normalizedProvider = normalizeMediaProviderName(matched.provider);
      const provider = providerMap.get(normalizedProvider);
      if (provider) {
        return {
          ok: true,
          modelId: matched.modelId,
          provider: normalizedProvider,
          providerName: provider.providerName,
          name: matched.name || matched.modelId,
          reason: "enabled_model_alias_match",
          substituted: matched.modelId !== requestedModel,
          model: matched,
          providerRow: provider,
        };
      }
    }

    if (exactModel && !modelIsEnabled(exactModel)) {
      return {
        ok: false,
        reasonCode: "media_model_disabled",
        message: `Media model "${requestedModel}" is disabled.`,
      };
    }

    if (exactModelBlocked) {
      return exactModelBlocked;
    }

    if (!allowSubstitution) {
      return {
        ok: false,
        reasonCode: "media_model_not_enabled",
        message: `No enabled ${input.mediaType} model matches "${requestedModel}".`,
      };
    }
  }

  const fallback = enabledModels[0];
  if (!fallback) {
    return {
      ok: false,
      reasonCode: "media_model_not_enabled",
      message: `No enabled ${input.mediaType} model is available with an enabled provider.`,
    };
  }
  const normalizedProvider = normalizeMediaProviderName(fallback.provider);
  const provider = providerMap.get(normalizedProvider);
  if (!provider) {
    return {
      ok: false,
      reasonCode: "media_provider_disabled",
      message: `Media provider "${fallback.provider}" for model "${fallback.modelId}" is not enabled.`,
    };
  }

  return {
    ok: true,
    modelId: fallback.modelId,
    provider: normalizedProvider,
    providerName: provider.providerName,
    name: fallback.name || fallback.modelId,
    reason: requestedModel ? "enabled_model_fallback" : "enabled_default_model",
    substituted: Boolean(requestedModel && fallback.modelId !== requestedModel),
    model: fallback,
    providerRow: provider,
  };
}
