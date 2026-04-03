import { and, asc, eq } from "drizzle-orm";

import { llmProviders, modelProviderMap } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildModelLookupCandidates } from "./modelLookup";

export type EnabledLlmModelRow = {
  providerId: number;
  providerName: string;
  modelId: string;
  providerModelId: string;
  defaultModel: string | null;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  // Capability columns (from model_provider_map)
  supportsVision: boolean | null;
  supportsThinking: boolean | null;
  supportsFunctionTools: boolean | null;
  supportsStructuredOutputs: boolean | null;
  supportsWebSearch: boolean | null;
  supportsCodeExecution: boolean | null;
  supportsComputerUse: boolean | null;
  supportsBackground: boolean | null;
  supportsResponses: boolean | null;
  // Sizing and ranking
  contextLength: number | null;
  priority: number;
  priorityLocked: boolean | null;
  isFree: boolean;
};

function trimModelId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildComparableIds(row: EnabledLlmModelRow): Set<string> {
  const ids = new Set<string>();
  const providerName = trimModelId(row.providerName);

  for (const value of [row.modelId, row.providerModelId]) {
    const trimmed = trimModelId(value);
    if (!trimmed) {
      continue;
    }
    ids.add(trimmed);
    for (const candidate of buildModelLookupCandidates(trimmed)) {
      ids.add(candidate);
    }
    if (providerName) {
      ids.add(`${providerName}/${trimmed}`);
    }
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

export async function loadEnabledLlmModelRows(): Promise<EnabledLlmModelRow[]> {
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
      defaultModel: llmProviders.defaultModel,
      apiStyle: modelProviderMap.apiStyle,
      // Capability columns
      supportsVision: modelProviderMap.supportsVision,
      supportsThinking: modelProviderMap.supportsThinking,
      supportsFunctionTools: modelProviderMap.supportsFunctionTools,
      supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
      supportsWebSearch: modelProviderMap.supportsWebSearch,
      supportsCodeExecution: modelProviderMap.supportsCodeExecution,
      supportsComputerUse: modelProviderMap.supportsComputerUse,
      supportsBackground: modelProviderMap.supportsBackground,
      supportsResponses: modelProviderMap.supportsResponses,
      // Sizing and ranking
      contextLength: modelProviderMap.contextLength,
      priority: modelProviderMap.priority,
      priorityLocked: modelProviderMap.priorityLocked,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
    .orderBy(
      asc(llmProviders.sortOrder),
      asc(modelProviderMap.priority),
      asc(modelProviderMap.id),
    );

  return rows.map((row) => ({
    providerId: row.providerId,
    providerName: row.providerName,
    modelId: row.modelId,
    providerModelId: row.providerModelId,
    defaultModel: row.defaultModel,
    apiStyle: row.apiStyle,
    supportsVision: row.supportsVision,
    supportsThinking: row.supportsThinking,
    supportsFunctionTools: row.supportsFunctionTools,
    supportsStructuredOutputs: row.supportsStructuredOutputs,
    supportsWebSearch: row.supportsWebSearch,
    supportsCodeExecution: row.supportsCodeExecution,
    supportsComputerUse: row.supportsComputerUse,
    supportsBackground: row.supportsBackground,
    supportsResponses: row.supportsResponses,
    contextLength: row.contextLength,
    priority: row.priority,
    priorityLocked: row.priorityLocked,
    isFree: row.isFree,
  }));
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
