import { and, asc, eq } from "drizzle-orm";

import { llmProviders, modelProviderMap } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildModelLookupCandidates } from "./modelLookup";
import { isAvailable } from "./providerHealth";
import { resolveProviderCatalogDefaults } from "../routers/llmProviders";
import {
  buildProviderCatalogLookupKey,
  resolveCatalogEligibility,
  type AvailableLlmProviderModel,
  type CatalogEligibility,
  type CatalogInvalidReason,
} from "./llmProviderCatalog";

export type EnabledLlmModelRow = {
  providerId: number;
  providerName: string;
  modelId: string;
  providerModelId: string;
  legacyModelAliases?: string[] | null;
  defaultModel: string | null;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: "chat" | "embedding" | "parse" | "guardrail" | "reward" | "translation" | "multimodal" | "other";
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  catalogEligibility?: CatalogEligibility;
  catalogInvalidReason?: CatalogInvalidReason;
  // Capability columns (from model_provider_map)
  supportsVision: boolean | null;
  supportsThinking: boolean | null;
  supportsFunctionTools: boolean | null;
  supportsStructuredOutputs: boolean | null;
  supportsJsonMode: boolean | null;
  supportsStrictToolSchema: boolean | null;
  supportsWebSearch: boolean | null;
  supportsCodeExecution: boolean | null;
  supportsComputerUse: boolean | null;
  supportsBackground: boolean | null;
  supportsResponses: boolean | null;
  // Sizing and ranking
  contextLength: number | null;
  priority: number;
  priorityLocked: boolean | null;
  /** Admin-curated quality flag (see modelProviderMap.isRecommended). */
  isRecommended?: boolean | null;
  isFree: boolean;
  pricingInput?: string | null;
  pricingOutput?: string | null;
};

export type EnabledLlmModelSourceRow = EnabledLlmModelRow & {
  availableModels?: AvailableLlmProviderModel[] | null;
};

function trimModelId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isFreeModelIdentifier(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => {
    const normalized = trimModelId(value).toLowerCase();
    return normalized.endsWith(":free")
      || normalized.endsWith("-free")
      || normalized.includes("/:free")
      || normalized.includes("/free/");
  });
}

function addComparableId(
  ids: Set<string>,
  providerName: string,
  value: string | null | undefined,
) {
  const trimmed = trimModelId(value);
  if (!trimmed) {
    return;
  }

  ids.add(trimmed);
  for (const candidate of buildModelLookupCandidates(trimmed)) {
    ids.add(candidate);
  }
  if (providerName) {
    ids.add(`${providerName}/${trimmed}`);
  }
}

function buildComparableIds(row: EnabledLlmModelRow): Set<string> {
  const ids = new Set<string>();
  const providerName = trimModelId(row.providerName);

  for (const value of [row.modelId, row.providerModelId, ...(row.legacyModelAliases ?? [])]) {
    addComparableId(ids, providerName, value);
  }

  return ids;
}

function rowMatchesModelId(row: EnabledLlmModelRow, modelId: string | null | undefined): boolean {
  const trimmed = trimModelId(modelId);
  if (!trimmed) {
    return false;
  }

  const requestedIds = new Set(buildModelLookupCandidates(trimmed));
  requestedIds.add(trimmed);

  const comparableIds = buildComparableIds(row);
  for (const requestedId of requestedIds) {
    if (comparableIds.has(requestedId)) {
      return true;
    }
  }

  return false;
}

function buildProviderCatalogs(rows: EnabledLlmModelSourceRow[]) {
  const providerCatalogs = new Map<number, AvailableLlmProviderModel[]>();

  for (const row of rows) {
    if (providerCatalogs.has(row.providerId)) {
      continue;
    }

    const hydratedProvider = resolveProviderCatalogDefaults({
      providerName: row.providerName,
      defaultModel: row.defaultModel,
      availableModels: row.availableModels ?? null,
    });
    providerCatalogs.set(row.providerId, hydratedProvider.availableModels ?? []);
  }

  return providerCatalogs;
}

export function hydrateEnabledLlmModelRows(
  rows: EnabledLlmModelSourceRow[],
  options?: { autoSelectionOnly?: boolean },
): EnabledLlmModelRow[] {
  const providerCatalogs = buildProviderCatalogs(rows);
  const catalogModels = new Map<string, AvailableLlmProviderModel>();

  for (const row of rows) {
    const availableModels = providerCatalogs.get(row.providerId) ?? [];
    for (const model of availableModels) {
      catalogModels.set(buildProviderCatalogLookupKey(row.providerId, model.id), model);
    }
  }

  return rows
    .map((row) => {
      const catalogModel = catalogModels.get(
        buildProviderCatalogLookupKey(row.providerId, row.providerModelId),
      ) ?? null;
      const catalogState = resolveCatalogEligibility({
        providerName: row.providerName,
        providerEnabled: true,
        catalogModel,
        mappingExists: true,
      });

      return {
        ...row,
        ownedBy: catalogState.ownedBy,
        surface: catalogState.surface,
        executionMode: catalogState.executionMode,
        autoSelectionEligible: catalogState.catalogEligibility === "public-chat",
        catalogEligibility: catalogState.catalogEligibility,
        catalogInvalidReason: catalogState.catalogInvalidReason,
      };
    })
    .filter((row) => {
      if (row.providerName === "nvidia_nim") {
        return row.catalogEligibility === "public-chat" || row.catalogEligibility === "manual-only";
      }
      return true;
    })
    .filter((row) => {
      if (!options?.autoSelectionOnly) {
        return true;
      }
      return row.catalogEligibility === "public-chat";
    });
}

export function filterAutoSelectableLlmModelRows(rows: EnabledLlmModelRow[]): EnabledLlmModelRow[] {
  return rows.filter((row) => row.catalogEligibility == null || row.catalogEligibility === "public-chat");
}

export function resolveEnabledLlmModelIdFromRows(input: {
  rows: EnabledLlmModelRow[];
  preferredModelIds?: Array<string | null | undefined>;
}): string | null {
  const rows = input.rows;
  if (rows.length === 0) {
    return null;
  }

  for (const preferredModelId of input.preferredModelIds ?? []) {
    const match = rows.find((row) => rowMatchesModelId(row, preferredModelId));
    if (match) {
      return match.modelId;
    }
  }

  const defaultMatch = rows.find((row) => rowMatchesModelId(row, row.defaultModel));
  if (defaultMatch) {
    return defaultMatch.modelId;
  }

  return rows[0]?.modelId ?? null;
}

/**
 * Resolve only to a model that still has at least one provider outside the
 * provider-health cooldown. "Enabled" is catalog state; this is the runtime
 * admission check that prevents callers from selecting a model which cannot
 * currently be routed.
 */
export function resolveRoutableLlmModelIdFromRows(input: {
  rows: EnabledLlmModelRow[];
  preferredModelIds?: Array<string | null | undefined>;
}): string | null {
  const routableRows = input.rows.filter((row) => isAvailable(row.providerId));
  if (routableRows.length === 0) return null;

  for (const preferredModelId of input.preferredModelIds ?? []) {
    const match = routableRows.find((row) => rowMatchesModelId(row, preferredModelId));
    if (match) return match.modelId;
  }

  return null;
}

export function hasRoutableLlmModelIdFromRows(
  rows: EnabledLlmModelRow[],
  modelId: string | null | undefined,
): boolean {
  return resolveRoutableLlmModelIdFromRows({
    rows,
    preferredModelIds: [modelId],
  }) !== null;
}

export async function loadEnabledLlmModelRows(
  options?: { autoSelectionOnly?: boolean },
): Promise<EnabledLlmModelRow[]> {
  try {
    const db = await getDb();
    if (!db) {
      return [];
    }

    const rows = await db
      .select({
        providerId: llmProviders.id,
        providerName: llmProviders.providerName,
        modelId: modelProviderMap.modelId,
        providerModelId: modelProviderMap.providerModelId,
        legacyModelAliases: modelProviderMap.legacyModelAliases,
        defaultModel: llmProviders.defaultModel,
        availableModels: llmProviders.availableModels,
        apiStyle: modelProviderMap.apiStyle,
        // Capability columns
        supportsVision: modelProviderMap.supportsVision,
        supportsThinking: modelProviderMap.supportsThinking,
        supportsFunctionTools: modelProviderMap.supportsFunctionTools,
        supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
        supportsJsonMode: modelProviderMap.supportsJsonMode,
        supportsStrictToolSchema: modelProviderMap.supportsStrictToolSchema,
        supportsWebSearch: modelProviderMap.supportsWebSearch,
        supportsCodeExecution: modelProviderMap.supportsCodeExecution,
        supportsComputerUse: modelProviderMap.supportsComputerUse,
        supportsBackground: modelProviderMap.supportsBackground,
        supportsResponses: modelProviderMap.supportsResponses,
        // Sizing and ranking
        contextLength: modelProviderMap.contextLength,
        priority: modelProviderMap.priority,
        priorityLocked: modelProviderMap.priorityLocked,
        isRecommended: modelProviderMap.isRecommended,
        isFree: modelProviderMap.isFree,
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
      .orderBy(
        asc(llmProviders.sortOrder),
        asc(modelProviderMap.priority),
        asc(modelProviderMap.id),
      );

    return hydrateEnabledLlmModelRows(rows.map((row) => ({
      providerId: row.providerId,
      providerName: row.providerName,
      modelId: row.modelId,
      providerModelId: row.providerModelId,
      legacyModelAliases: row.legacyModelAliases as string[] | null,
      defaultModel: row.defaultModel,
      availableModels: row.availableModels as AvailableLlmProviderModel[] | null,
      apiStyle: row.apiStyle,
      supportsVision: row.supportsVision,
      supportsThinking: row.supportsThinking,
      supportsFunctionTools: row.supportsFunctionTools,
      supportsStructuredOutputs: row.supportsStructuredOutputs,
      supportsJsonMode: row.supportsJsonMode,
      supportsStrictToolSchema: row.supportsStrictToolSchema,
      supportsWebSearch: row.supportsWebSearch,
      supportsCodeExecution: row.supportsCodeExecution,
      supportsComputerUse: row.supportsComputerUse,
      supportsBackground: row.supportsBackground,
      supportsResponses: row.supportsResponses,
      contextLength: row.contextLength,
      priority: row.priority,
      priorityLocked: row.priorityLocked,
      isRecommended: row.isRecommended,
      isFree: row.isFree,
      pricingInput: row.pricingInput,
      pricingOutput: row.pricingOutput,
    })), options);
  } catch (error) {
    console.warn("[EnabledLlmModels] Falling back to empty model list after query failure", error);
    return [];
  }
}

export async function resolveEnabledLlmModelId(
  preferredModelIds?: Array<string | null | undefined>,
): Promise<string | null> {
  const rows = await loadEnabledLlmModelRows();
  return resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds });
}

export async function isEnabledLlmModelId(modelId: string | null | undefined): Promise<boolean> {
  const rows = await loadEnabledLlmModelRows();
  return rows.some((row) => rowMatchesModelId(row, modelId));
}
