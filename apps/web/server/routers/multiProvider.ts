import { z } from "zod";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getHealthSummary } from "../services/providerHealth";
import { getAdminUsageStats, getUserUsageStats } from "../services/costTracker";
import { computeModelPriority } from "../services/intelligentModelSelector";
import { resolveProviderCatalogDefaults } from "./llmProviders";
import { listVisibleWorkerLlmModels } from "../services/workerLlmCatalog";
import {
  buildProviderCatalogLookupKey,
  canonicalModelIdForCatalogModel,
  resolveCatalogEligibility,
  resolveCatalogBackedPricing,
  type AvailableLlmProviderModel,
  type CatalogEligibility,
  type CatalogInvalidReason,
  type LlmRequestConfig,
} from "../services/llmProviderCatalog";

export interface ModelMappingListRow {
  id: number;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  /** Admin-curated quality flag (see modelProviderMap.isRecommended). */
  isRecommended?: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: "chat" | "embedding" | "parse" | "guardrail" | "reward" | "translation" | "multimodal" | "other";
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  catalogEligibility?: CatalogEligibility;
  catalogInvalidReason?: CatalogInvalidReason;
  // Model capabilities
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
  supportsStrictToolSchema?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
}

type ProviderCatalogModel = AvailableLlmProviderModel;

interface ProviderCatalogRow {
  id: number;
  providerName: string;
  providerDisplayName: string;
  isEnabled?: boolean;
  availableModels: ProviderCatalogModel[] | null;
}

export interface AdminModelCatalogRow {
  mappingId: number | null;
  isMapped: boolean;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  /** Admin-curated quality flag (see modelProviderMap.isRecommended). */
  isRecommended?: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: "chat" | "embedding" | "parse" | "guardrail" | "reward" | "translation" | "multimodal" | "other";
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  catalogEligibility?: CatalogEligibility;
  catalogInvalidReason?: CatalogInvalidReason;
  // Model capabilities
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
  supportsStrictToolSchema?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  config?: LlmRequestConfig;
}

type ProviderCatalogLookupEntry = {
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  providerEnabled: boolean;
  availableModels: ProviderCatalogModel[];
  modelsById: Map<string, ProviderCatalogModel>;
};

function defaultApiStyleForProvider(providerName: string): AdminModelCatalogRow["apiStyle"] {
  switch (providerName.toLowerCase()) {
    case "openai":
      return "responses";
    case "anthropic":
      return "messages";
    case "google":
      return "gemini";
    default:
      return "chat-completions";
  }
}

function buildCanonicalModelId(providerModelId: string) {
  if (providerModelId.length <= 128) {
    return providerModelId;
  }

  const normalized = providerModelId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 115) || "model";
  const hash = createHash("sha1").update(providerModelId).digest("hex").slice(0, 12);
  return `${normalized}-${hash}`.slice(0, 128);
}

function buildProviderCatalogLookup(providers: ProviderCatalogRow[]) {
  return new Map<string, ProviderCatalogLookupEntry>(
    providers.map((provider) => [
      String(provider.id),
      {
        providerId: provider.id,
        providerName: provider.providerName,
        providerDisplayName: provider.providerDisplayName,
        providerEnabled: provider.isEnabled !== false,
        availableModels: provider.availableModels ?? [],
        modelsById: new Map((provider.availableModels ?? []).map((model) => [model.id, model] as const)),
      },
    ]),
  );
}

function resolveProviderCatalogState(input: {
  providerLookup: Map<string, ProviderCatalogLookupEntry>;
  providerId: number;
  providerName: string;
  providerModelId: string;
  mappingExists: boolean;
}) {
  const providerEntry = input.providerLookup.get(String(input.providerId));
  const catalogModel = providerEntry?.modelsById.get(input.providerModelId) ?? null;
  const eligibility = resolveCatalogEligibility({
    providerName: providerEntry?.providerName ?? input.providerName,
    providerEnabled: providerEntry?.providerEnabled ?? true,
    catalogModel,
    mappingExists: input.mappingExists,
  });

  return {
    providerEntry,
    catalogModel,
    ...eligibility,
  };
}

function assertCatalogRowEligibleForChat(input: {
  providerLookup: Map<string, ProviderCatalogLookupEntry>;
  providerId: number;
  providerName: string;
  providerModelId: string;
  mappingExists: boolean;
}) {
  const state = resolveProviderCatalogState(input);
  if (!state.providerEntry) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Provider catalog row is not eligible for chat enablement (provider:${input.providerId}, reason=unknown)`,
    });
  }

  const providerName = state.providerEntry.providerName;

  if (state.catalogEligibility === "public-chat" || state.catalogEligibility === "manual-only") {
    return state;
  }

  const reason = !state.providerEntry.providerEnabled
    ? "provider-disabled"
    : !state.catalogModel
      ? "missing-catalog-row"
      : state.catalogModel.surface !== "chat"
        ? "surface-not-chat"
        : state.catalogModel.executionMode !== "public"
          ? "execution-mode-not-public"
          : state.catalogInvalidReason ?? "unknown";
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Provider catalog row is not eligible for chat enablement (${providerName}:${input.providerModelId}, reason=${reason})`,
  });
}

async function loadProviderCatalogLookupForProviderIds(providerIds: number[]) {
  const uniqueProviderIds = Array.from(new Set(providerIds));
  if (uniqueProviderIds.length === 0) {
    return new Map<string, ProviderCatalogLookupEntry>();
  }

  const providers = await db
    .select({
      id: llmProviders.id,
      providerName: llmProviders.providerName,
      providerDisplayName: llmProviders.displayName,
      isEnabled: llmProviders.isEnabled,
      availableModels: llmProviders.availableModels,
    })
    .from(llmProviders)
    .where(inArray(llmProviders.id, uniqueProviderIds));

  const hydratedProviders = providers.map((provider: typeof providers[number]) =>
    resolveProviderCatalogDefaults(provider as any));
  return buildProviderCatalogLookup(hydratedProviders as ProviderCatalogRow[]);
}

type ProviderModelUniquenessInput = {
  providerId: number;
  providerModelId: string;
  mappingId?: number | null;
  providerName?: string | null;
};

function formatProviderModelRef(input: ProviderModelUniquenessInput): string {
  return `${input.providerName ?? `provider:${input.providerId}`}:${input.providerModelId}`;
}

function assertNoDuplicateProviderModelsInRequest(rows: ProviderModelUniquenessInput[]) {
  const seen = new Set<string>();

  for (const row of rows) {
    const key = buildProviderCatalogLookupKey(row.providerId, row.providerModelId);
    if (seen.has(key)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Provider model appears multiple times in request (${formatProviderModelRef(row)})`,
      });
    }
    seen.add(key);
  }
}

async function assertNoExistingProviderModelMappingConflicts(rows: ProviderModelUniquenessInput[]) {
  if (rows.length === 0) {
    return;
  }

  assertNoDuplicateProviderModelsInRequest(rows);

  const providerIds = Array.from(new Set(rows.map((row) => row.providerId)));
  const requestedByKey = new Map(
    rows.map((row) => [buildProviderCatalogLookupKey(row.providerId, row.providerModelId), row] as const),
  );

  const existingRows = await db
    .select({
      id: modelProviderMap.id,
      providerId: modelProviderMap.providerId,
      providerModelId: modelProviderMap.providerModelId,
    })
    .from(modelProviderMap)
    .where(inArray(modelProviderMap.providerId, providerIds));

  for (const existingRow of existingRows) {
    const key = buildProviderCatalogLookupKey(existingRow.providerId, existingRow.providerModelId);
    const requestedRow = requestedByKey.get(key);
    if (!requestedRow) {
      continue;
    }
    if (requestedRow.mappingId != null && requestedRow.mappingId === existingRow.id) {
      continue;
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Provider model is already mapped for this provider (${formatProviderModelRef(requestedRow)}, existingMappingId=${existingRow.id})`,
    });
  }
}

export function mergeAdminModelCatalogRows(input: {
  providers: ProviderCatalogRow[];
  mappings: ModelMappingListRow[];
}): AdminModelCatalogRow[] {
  const rows = new Map<string, AdminModelCatalogRow>();
  const providerLookup = buildProviderCatalogLookup(input.providers);

  for (const mapping of input.mappings) {
    const providerEntry = providerLookup.get(String(mapping.providerId));
    const catalogModel = providerEntry?.modelsById.get(mapping.providerModelId) ?? null;
    const state = resolveProviderCatalogState({
      providerLookup,
      providerId: mapping.providerId,
      providerName: mapping.providerName,
      providerModelId: mapping.providerModelId,
      mappingExists: true,
    });
    const effectivePricing = resolveCatalogBackedPricing({
      providerName: mapping.providerName,
      availableModels: providerEntry?.availableModels,
      providerModelId: mapping.providerModelId,
      pricingInput: mapping.pricingInput,
      pricingOutput: mapping.pricingOutput,
      isFree: mapping.isFree,
    });
    rows.set(`${mapping.providerId}:${mapping.providerModelId}`, {
      mappingId: mapping.id,
      isMapped: true,
      modelId: mapping.modelId,
      providerId: mapping.providerId,
      providerName: mapping.providerName,
      providerDisplayName: mapping.providerDisplayName,
      modelName: mapping.modelName,
      providerModelId: mapping.providerModelId,
      pricingInput: String(effectivePricing.pricingInput),
      pricingOutput: String(effectivePricing.pricingOutput),
      isFree: effectivePricing.isFree,
      contextLength: mapping.contextLength,
      isEnabled: mapping.isEnabled,
      priority: mapping.priority,
      priorityLocked: mapping.priorityLocked,
      isRecommended: mapping.isRecommended,
      apiStyle: mapping.apiStyle,
      ownedBy: state.ownedBy,
      surface: state.surface,
      executionMode: state.executionMode,
      autoSelectionEligible: state.autoSelectionEligible,
      catalogEligibility: state.catalogEligibility,
      catalogInvalidReason: state.catalogInvalidReason,
      // Capability columns
      supportsVision: !!mapping.supportsVision,
      supportsThinking: !!mapping.supportsThinking,
      supportsWebSearch: !!mapping.supportsWebSearch,
      supportsFunctionTools: !!mapping.supportsFunctionTools,
      supportsStructuredOutputs: !!mapping.supportsStructuredOutputs,
      supportsJsonMode: !!mapping.supportsJsonMode,
      supportsStrictToolSchema: !!mapping.supportsStrictToolSchema,
      supportsCodeExecution: !!mapping.supportsCodeExecution,
      supportsComputerUse: !!mapping.supportsComputerUse,
      supportsBackground: !!mapping.supportsBackground,
      supportsResponses: !!mapping.supportsResponses,
      config: catalogModel?.config,
    });
  }

  for (const provider of input.providers) {
    for (const model of provider.availableModels ?? []) {
      const key = `${provider.id}:${model.id}`;
      if (rows.has(key)) {
        continue;
      }

      const state = resolveProviderCatalogState({
        providerLookup,
        providerId: provider.id,
        providerName: provider.providerName,
        providerModelId: model.id,
        mappingExists: false,
      });

      const pricingInput = model.pricing?.input ?? 0;
      const pricingOutput = model.pricing?.output ?? 0;

      rows.set(key, {
        mappingId: null,
        isMapped: false,
        modelId: buildCanonicalModelId(
          canonicalModelIdForCatalogModel(provider.providerName, model.id),
        ),
        providerId: provider.id,
        providerName: provider.providerName,
        providerDisplayName: provider.providerDisplayName,
        modelName: model.name || model.id,
        providerModelId: model.id,
        pricingInput: String(pricingInput),
        pricingOutput: String(pricingOutput),
        isFree: pricingInput === 0 && pricingOutput === 0,
        contextLength: model.contextLength ?? null,
        isEnabled: false,
        priority: 0,
        priorityLocked: false,
        isRecommended: false,
        apiStyle: model.apiStyle ?? defaultApiStyleForProvider(provider.providerName),
        ownedBy: state.ownedBy,
        surface: state.surface,
        executionMode: state.executionMode,
        autoSelectionEligible: state.autoSelectionEligible,
        catalogEligibility: state.catalogEligibility,
        catalogInvalidReason: state.catalogInvalidReason,
        supportsVision: !!model.supportsVision,
        supportsThinking: !!model.supportsThinking,
        supportsWebSearch: !!model.supportsWebSearch,
        supportsFunctionTools: !!model.supportsFunctionTools,
        supportsStructuredOutputs: !!model.supportsStructuredOutputs,
        supportsJsonMode: !!model.supportsJsonMode,
        supportsStrictToolSchema: !!model.supportsStrictToolSchema,
        supportsCodeExecution: !!model.supportsCodeExecution,
        supportsComputerUse: !!model.supportsComputerUse,
        supportsBackground: !!model.supportsBackground,
        supportsResponses: !!model.supportsResponses,
        config: model.config,
      });
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    const nameCompare = left.modelName.localeCompare(right.modelName);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    const providerCompare = left.providerDisplayName.localeCompare(right.providerDisplayName);
    if (providerCompare !== 0) {
      return providerCompare;
    }

    return left.providerModelId.localeCompare(right.providerModelId);
  });
}

export function groupModelMappingsByModelId(rows: ModelMappingListRow[]) {
  return rows.reduce<Record<string, ModelMappingListRow[]>>((grouped, row) => {
    if (!grouped[row.modelId]) {
      grouped[row.modelId] = [];
    }
    grouped[row.modelId]!.push(row);
    return grouped;
  }, {});
}

function hydrateMappedRowsFromCatalog(input: {
  providers: ProviderCatalogRow[];
  mappings: ModelMappingListRow[];
}): ModelMappingListRow[] {
  const providerLookup = buildProviderCatalogLookup(input.providers);

  return input.mappings.map((mapping) => {
    const state = resolveProviderCatalogState({
      providerLookup,
      providerId: mapping.providerId,
      providerName: mapping.providerName,
      providerModelId: mapping.providerModelId,
      mappingExists: true,
    });
    const providerEntry = providerLookup.get(String(mapping.providerId));
    const effectivePricing = resolveCatalogBackedPricing({
      providerName: mapping.providerName,
      availableModels: providerEntry?.availableModels,
      providerModelId: mapping.providerModelId,
      pricingInput: mapping.pricingInput,
      pricingOutput: mapping.pricingOutput,
      isFree: mapping.isFree,
    });

    return {
      ...mapping,
      pricingInput: String(effectivePricing.pricingInput),
      pricingOutput: String(effectivePricing.pricingOutput),
      isFree: effectivePricing.isFree,
      ownedBy: state.ownedBy,
      surface: state.surface,
      executionMode: state.executionMode,
      autoSelectionEligible: state.autoSelectionEligible,
      catalogEligibility: state.catalogEligibility,
      catalogInvalidReason: state.catalogInvalidReason,
    };
  });
}

export const multiProviderRouter = router({
  // --- Model Mapping CRUD (Admin) ---

  listModelMappings: adminProcedure.query(async () => {
    const [providers, rows] = await Promise.all([
      db
        .select({
          id: llmProviders.id,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          isEnabled: llmProviders.isEnabled,
          availableModels: llmProviders.availableModels,
        })
        .from(llmProviders),
      db
        .select({
          id: modelProviderMap.id,
          modelId: modelProviderMap.modelId,
          providerId: modelProviderMap.providerId,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          modelName: modelProviderMap.modelName,
          providerModelId: modelProviderMap.providerModelId,
          pricingInput: modelProviderMap.pricingInput,
          pricingOutput: modelProviderMap.pricingOutput,
          isFree: modelProviderMap.isFree,
          contextLength: modelProviderMap.contextLength,
          isEnabled: modelProviderMap.isEnabled,
          priority: modelProviderMap.priority,
          priorityLocked: modelProviderMap.priorityLocked,
          isRecommended: modelProviderMap.isRecommended,
          apiStyle: modelProviderMap.apiStyle,
          supportsVision: modelProviderMap.supportsVision,
          supportsThinking: modelProviderMap.supportsThinking,
          supportsWebSearch: modelProviderMap.supportsWebSearch,
          supportsFunctionTools: modelProviderMap.supportsFunctionTools,
          supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
          supportsJsonMode: modelProviderMap.supportsJsonMode,
          supportsStrictToolSchema: modelProviderMap.supportsStrictToolSchema,
          supportsCodeExecution: modelProviderMap.supportsCodeExecution,
          supportsComputerUse: modelProviderMap.supportsComputerUse,
          supportsBackground: modelProviderMap.supportsBackground,
          supportsResponses: modelProviderMap.supportsResponses,
        })
        .from(modelProviderMap)
        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
        .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority)),
    ]);

    const hydratedProviders = (Array.isArray(providers) ? providers : [] as ProviderCatalogRow[]).map((provider) =>
      resolveProviderCatalogDefaults(provider as any),
    );
    const hydratedMappings = hydrateMappedRowsFromCatalog({
      providers: hydratedProviders,
      mappings: rows as ModelMappingListRow[],
    });

    return groupModelMappingsByModelId(hydratedMappings);
  }),

  listAdminModelCatalog: adminProcedure.query(async () => {
    const [providers, mappings] = await Promise.all([
      db
        .select({
          id: llmProviders.id,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          isEnabled: llmProviders.isEnabled,
          availableModels: llmProviders.availableModels,
        })
        .from(llmProviders)
        .orderBy(asc(llmProviders.sortOrder)),
      db
        .select({
          id: modelProviderMap.id,
          modelId: modelProviderMap.modelId,
          providerId: modelProviderMap.providerId,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          modelName: modelProviderMap.modelName,
          providerModelId: modelProviderMap.providerModelId,
          pricingInput: modelProviderMap.pricingInput,
          pricingOutput: modelProviderMap.pricingOutput,
          isFree: modelProviderMap.isFree,
          contextLength: modelProviderMap.contextLength,
          isEnabled: modelProviderMap.isEnabled,
          priority: modelProviderMap.priority,
          priorityLocked: modelProviderMap.priorityLocked,
          isRecommended: modelProviderMap.isRecommended,
          apiStyle: modelProviderMap.apiStyle,
          // Capability columns
          supportsVision: modelProviderMap.supportsVision,
          supportsThinking: modelProviderMap.supportsThinking,
          supportsWebSearch: modelProviderMap.supportsWebSearch,
          supportsFunctionTools: modelProviderMap.supportsFunctionTools,
          supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
          supportsJsonMode: modelProviderMap.supportsJsonMode,
          supportsStrictToolSchema: modelProviderMap.supportsStrictToolSchema,
          supportsCodeExecution: modelProviderMap.supportsCodeExecution,
          supportsComputerUse: modelProviderMap.supportsComputerUse,
          supportsBackground: modelProviderMap.supportsBackground,
          supportsResponses: modelProviderMap.supportsResponses,
        })
        .from(modelProviderMap)
        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
        .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority)),
    ]);

    const hydratedProviders = (Array.isArray(providers) ? providers : [] as ProviderCatalogRow[]).map((provider) =>
      resolveProviderCatalogDefaults(provider as any),
    );
    return mergeAdminModelCatalogRows({
      providers: hydratedProviders,
      mappings: hydrateMappedRowsFromCatalog({
        providers: hydratedProviders,
        mappings: mappings as ModelMappingListRow[],
      }),
    });
  }),

  bulkSetModelMappingsEnabled: adminProcedure
    .input(z.object({
      ids: z.array(z.number().int()).min(1).max(500),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const uniqueIds = Array.from(new Set(input.ids));

      if (input.isEnabled) {
        const mappings = await db
          .select({
            id: modelProviderMap.id,
            providerId: modelProviderMap.providerId,
            providerModelId: modelProviderMap.providerModelId,
            providerName: llmProviders.providerName,
          })
          .from(modelProviderMap)
          .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
          .where(inArray(modelProviderMap.id, uniqueIds));

        const providerLookup = await loadProviderCatalogLookupForProviderIds(
          mappings.map((mapping: typeof mappings[number]) => mapping.providerId),
        );

        mappings.forEach((mapping: typeof mappings[number]) => {
          assertCatalogRowEligibleForChat({
            providerLookup,
            providerId: mapping.providerId,
            providerName: mapping.providerName,
            providerModelId: mapping.providerModelId,
            mappingExists: true,
          });
        });
      }

      await db
        .update(modelProviderMap)
        .set({ isEnabled: input.isEnabled })
        .where(inArray(modelProviderMap.id, uniqueIds));

      return {
        success: true,
        updatedCount: uniqueIds.length,
        isEnabled: input.isEnabled,
      };
    }),

  bulkSetAdminModelCatalogEnabled: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        mappingId: z.number().nullable().optional(),
        modelId: z.string().min(1).max(128),
        providerId: z.number(),
        modelName: z.string().min(1).max(512),
        providerModelId: z.string().min(1).max(256),
        pricingInput: z.number().min(0),
        pricingOutput: z.number().min(0),
        isFree: z.boolean(),
        contextLength: z.number().int().nonnegative().nullable().optional(),
        priority: z.number().int().optional(),
        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).optional(),
        supportsVision: z.boolean().optional(),
        supportsThinking: z.boolean().optional(),
        supportsWebSearch: z.boolean().optional(),
        supportsFunctionTools: z.boolean().optional(),
        supportsStructuredOutputs: z.boolean().optional(),
        supportsJsonMode: z.boolean().optional(),
        supportsStrictToolSchema: z.boolean().optional(),
        supportsCodeExecution: z.boolean().optional(),
        supportsComputerUse: z.boolean().optional(),
        supportsBackground: z.boolean().optional(),
        supportsResponses: z.boolean().optional(),
      })).min(1).max(500),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const providerLookup = input.isEnabled
        ? await loadProviderCatalogLookupForProviderIds(input.items.map((item) => item.providerId))
        : new Map<string, ProviderCatalogLookupEntry>();

      if (input.isEnabled) {
        input.items.forEach((item) => {
          assertCatalogRowEligibleForChat({
            providerLookup,
            providerId: item.providerId,
            providerName: "",
            providerModelId: item.providerModelId,
            mappingExists: item.mappingId != null,
          });
        });

        await assertNoExistingProviderModelMappingConflicts(input.items.map((item) => ({
          mappingId: item.mappingId ?? null,
          providerId: item.providerId,
          providerModelId: item.providerModelId,
          providerName: providerLookup.get(String(item.providerId))?.providerName ?? null,
        })));
      }

      const mappedIds = Array.from(new Set(
        input.items
          .map((item) => item.mappingId ?? null)
          .filter((id): id is number => typeof id === "number"),
      ));

      if (mappedIds.length > 0) {
        await db
          .update(modelProviderMap)
          .set({ isEnabled: input.isEnabled })
          .where(inArray(modelProviderMap.id, mappedIds));
      }

      let insertedCount = 0;
      if (input.isEnabled) {
        const unmappedItems = input.items.filter((item) => item.mappingId == null);
        if (unmappedItems.length > 0) {
          // Build Map<providerId:providerModelId, SyncedModel> for O(1) lookup
          const syncedModelMap = new Map<string, {
            createdAt?: number;
            pricing?: { input: number; output: number };
            contextLength?: number;
          }>();
          for (const providerEntry of providerLookup.values()) {
            for (const model of providerEntry.availableModels) {
              syncedModelMap.set(buildProviderCatalogLookupKey(providerEntry.providerId, model.id), {
                createdAt: model.createdAt,
                pricing: model.pricing,
                contextLength: model.contextLength,
              });
            }
          }

          await db
            .insert(modelProviderMap)
            .values(unmappedItems.map((item) => {
              const providerEntry = providerLookup.get(String(item.providerId));
              const syncedModel = syncedModelMap.get(
                buildProviderCatalogLookupKey(item.providerId, item.providerModelId),
              );
              const computedPriority = item.priority ?? computeModelPriority({
                pricingInput: item.pricingInput,
                pricingOutput: item.pricingOutput,
                isFree: item.isFree,
                contextLength: item.contextLength ?? syncedModel?.contextLength ?? null,
                createdAt: syncedModel?.createdAt,
                supportsFunctionTools: !!item.supportsFunctionTools,
                supportsStructuredOutputs: !!item.supportsStructuredOutputs,
                supportsWebSearch: !!item.supportsWebSearch,
                supportsThinking: !!item.supportsThinking,
                supportsCodeExecution: !!item.supportsCodeExecution,
                supportsComputerUse: !!item.supportsComputerUse,
                supportsBackground: !!item.supportsBackground,
                supportsResponses: !!item.supportsResponses,
                supportsVision: !!item.supportsVision,
              });

              return {
                modelId: buildCanonicalModelId(
                  canonicalModelIdForCatalogModel(
                    providerEntry?.providerName ?? item.providerId.toString(),
                    item.providerModelId,
                  ),
                ),
                providerId: item.providerId,
                modelName: item.modelName.slice(0, 128),
                providerModelId: item.providerModelId,
                pricingInput: String(item.pricingInput),
                pricingOutput: String(item.pricingOutput),
                isFree: item.isFree,
                contextLength: item.contextLength ?? null,
                isEnabled: true,
                priority: computedPriority,
                apiStyle: item.apiStyle ?? "chat-completions",
                supportsVision: !!item.supportsVision,
                supportsThinking: !!item.supportsThinking,
                supportsWebSearch: !!item.supportsWebSearch,
                supportsFunctionTools: !!item.supportsFunctionTools,
                supportsStructuredOutputs: !!item.supportsStructuredOutputs,
                supportsJsonMode: !!item.supportsJsonMode,
                supportsStrictToolSchema: !!item.supportsStrictToolSchema,
                supportsCodeExecution: !!item.supportsCodeExecution,
                supportsComputerUse: !!item.supportsComputerUse,
                supportsBackground: !!item.supportsBackground,
                supportsResponses: !!item.supportsResponses,
              };
            }))
            .onConflictDoUpdate({
              target: [modelProviderMap.providerId, modelProviderMap.providerModelId],
              set: {
                isEnabled: true,
              },
            });
          insertedCount = unmappedItems.length;
        }
      }

      return {
        success: true,
        updatedCount: mappedIds.length,
        insertedCount,
        isEnabled: input.isEnabled,
      };
    }),

  upsertModelMapping: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        modelId: z.string().min(1).max(128),
        providerId: z.number(),
        modelName: z.string().min(1).max(128),
        providerModelId: z.string().min(1).max(256),
        pricingInput: z.number().min(0),
        pricingOutput: z.number().min(0),
        isFree: z.boolean(),
        contextLength: z.number().int().positive(),
        isEnabled: z.boolean(),
        priority: z.number().int().min(0).max(999).optional(),
        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).default("chat-completions"),
        // Model capabilities — editable by admin
        supportsVision: z.boolean().optional(),
        supportsThinking: z.boolean().optional(),
        supportsWebSearch: z.boolean().optional(),
        supportsFunctionTools: z.boolean().optional(),
        supportsStructuredOutputs: z.boolean().optional(),
        supportsJsonMode: z.boolean().optional(),
        supportsStrictToolSchema: z.boolean().optional(),
        supportsCodeExecution: z.boolean().optional(),
        supportsComputerUse: z.boolean().optional(),
        supportsBackground: z.boolean().optional(),
        supportsResponses: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const isExplicitPriority = input.priority !== undefined;
      const providerLookup = await loadProviderCatalogLookupForProviderIds([input.providerId]);

      assertCatalogRowEligibleForChat({
        providerLookup,
        providerId: input.providerId,
        providerName: "",
        providerModelId: input.providerModelId,
        mappingExists: Boolean(input.id),
      });

      await assertNoExistingProviderModelMappingConflicts([{
        mappingId: input.id ?? null,
        providerId: input.providerId,
        providerModelId: input.providerModelId,
        providerName: providerLookup.get(String(input.providerId))?.providerName ?? null,
      }]);

      // Build capability fields object (only include fields that were explicitly sent)
      const capabilityFields: Record<string, boolean> = {};
      if (input.supportsVision !== undefined) capabilityFields.supportsVision = input.supportsVision;
      if (input.supportsThinking !== undefined) capabilityFields.supportsThinking = input.supportsThinking;
      if (input.supportsWebSearch !== undefined) capabilityFields.supportsWebSearch = input.supportsWebSearch;
      if (input.supportsFunctionTools !== undefined) capabilityFields.supportsFunctionTools = input.supportsFunctionTools;
      if (input.supportsStructuredOutputs !== undefined) capabilityFields.supportsStructuredOutputs = input.supportsStructuredOutputs;
      if (input.supportsJsonMode !== undefined) capabilityFields.supportsJsonMode = input.supportsJsonMode;
      if (input.supportsStrictToolSchema !== undefined) capabilityFields.supportsStrictToolSchema = input.supportsStrictToolSchema;
      if (input.supportsCodeExecution !== undefined) capabilityFields.supportsCodeExecution = input.supportsCodeExecution;
      if (input.supportsComputerUse !== undefined) capabilityFields.supportsComputerUse = input.supportsComputerUse;
      if (input.supportsBackground !== undefined) capabilityFields.supportsBackground = input.supportsBackground;
      if (input.supportsResponses !== undefined) capabilityFields.supportsResponses = input.supportsResponses;

      if (input.id) {
        await db
          .update(modelProviderMap)
          .set({
            modelId: input.modelId,
            providerId: input.providerId,
            modelName: input.modelName,
            providerModelId: input.providerModelId,
            pricingInput: String(input.pricingInput),
            pricingOutput: String(input.pricingOutput),
            isFree: input.isFree,
            contextLength: input.contextLength,
            isEnabled: input.isEnabled,
            apiStyle: input.apiStyle,
            ...capabilityFields,
            ...(isExplicitPriority ? { priority: input.priority, priorityLocked: true } : {}),
          })
          .where(eq(modelProviderMap.id, input.id));
        return { success: true, id: input.id };
      }

      const computedPriority = isExplicitPriority
        ? input.priority!
        : computeModelPriority({
            pricingInput: input.pricingInput,
            pricingOutput: input.pricingOutput,
            isFree: input.isFree,
            contextLength: input.contextLength,
            createdAt: undefined,
            supportsFunctionTools: input.supportsFunctionTools ?? false,
            supportsStructuredOutputs: input.supportsStructuredOutputs ?? false,
            supportsWebSearch: input.supportsWebSearch ?? false,
            supportsThinking: input.supportsThinking ?? false,
            supportsCodeExecution: input.supportsCodeExecution ?? false,
            supportsComputerUse: input.supportsComputerUse ?? false,
            supportsBackground: input.supportsBackground ?? false,
            supportsResponses: input.supportsResponses ?? false,
            supportsVision: input.supportsVision ?? false,
          });

      const result = await db
        .insert(modelProviderMap)
        .values({
          modelId: input.modelId,
          providerId: input.providerId,
          modelName: input.modelName,
          providerModelId: input.providerModelId,
          pricingInput: String(input.pricingInput),
          pricingOutput: String(input.pricingOutput),
          isFree: input.isFree,
          contextLength: input.contextLength,
          isEnabled: input.isEnabled,
          priority: computedPriority,
          priorityLocked: isExplicitPriority,
          apiStyle: input.apiStyle,
          ...capabilityFields,
        })
        .returning({ id: modelProviderMap.id });

      return { success: true, id: result[0]?.id };
    }),

  deleteModelMapping: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(modelProviderMap).where(eq(modelProviderMap.id, input.id));
      return { success: true };
    }),

  updateModelPriority: adminProcedure
    .input(
      z.object({
        mappingId: z.number().int(),
        priority: z.number().int().min(0).max(999).optional(),
        // Admin-curated quality flag (model_provider_map.isRecommended). Optional so this
        // endpoint doubles as a lightweight single-field toggle from the mappings table
        // (e.g. the Recommended column) without having to resubmit priority.
        isRecommended: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updateFields: {
        priority?: number;
        priorityLocked?: boolean;
        isRecommended?: boolean;
      } = {};

      if (input.priority !== undefined) {
        updateFields.priority = input.priority;
        updateFields.priorityLocked = true;
      }
      if (input.isRecommended !== undefined) {
        updateFields.isRecommended = input.isRecommended;
      }

      if (Object.keys(updateFields).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one of priority or isRecommended must be provided",
        });
      }

      const result = await db
        .update(modelProviderMap)
        .set(updateFields)
        .where(eq(modelProviderMap.id, input.mappingId))
        .returning({
          id: modelProviderMap.id,
          modelId: modelProviderMap.modelId,
          priority: modelProviderMap.priority,
          priorityLocked: modelProviderMap.priorityLocked,
          isRecommended: modelProviderMap.isRecommended,
        });

      if (!result[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model mapping not found" });
      }

      return { success: true as const, mapping: result[0] };
    }),

  // --- Routing Rules CRUD (Admin) ---

  listRoutingRules: adminProcedure.query(async () => {
    const rules = await db
      .select()
      .from(routingRules)
      .orderBy(asc(routingRules.modelPattern));

    // Sort: exact matches first, then globs, then wildcard
    return rules.sort((a: (typeof rules)[number], b: (typeof rules)[number]) => {
      const aHasWild = a.modelPattern.includes("*");
      const bHasWild = b.modelPattern.includes("*");
      if (!aHasWild && bHasWild) return -1;
      if (aHasWild && !bHasWild) return 1;
      if (a.modelPattern === "*") return 1;
      if (b.modelPattern === "*") return -1;
      return a.modelPattern.localeCompare(b.modelPattern);
    });
  }),

  upsertRoutingRule: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        modelPattern: z.string().min(1).max(128),
        routingMode: z.enum(["cost", "quality", "priority"]),
        providerOrder: z.array(z.number()).optional(),
        maxFallbacks: z.number().int().min(0).max(10).default(3),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      if (input.routingMode === "priority" && (!input.providerOrder || input.providerOrder.length === 0)) {
        throw new Error("providerOrder is required when routingMode is 'priority'");
      }

      const values = {
        modelPattern: input.modelPattern,
        routingMode: input.routingMode,
        providerOrder: input.providerOrder ?? null,
        maxFallbacks: input.maxFallbacks,
        isActive: input.isActive,
      };

      if (input.id) {
        await db.update(routingRules).set(values).where(eq(routingRules.id, input.id));
        return { success: true, id: input.id };
      }

      const result = await db.insert(routingRules).values(values).returning({ id: routingRules.id });
      return { success: true, id: result[0]?.id };
    }),

  deleteRoutingRule: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(routingRules).where(eq(routingRules.id, input.id));
      return { success: true };
    }),

  // --- Provider Health (Admin) ---

  getProviderHealth: adminProcedure.query(async () => {
    const summary = getHealthSummary();
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        lastHealthCheck: llmProviders.lastHealthCheck,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true));

    return providers.map((p: (typeof providers)[number]) => {
      const state = summary.get(p.id);
      return {
        providerId: p.id,
        providerName: p.providerName,
        status: state?.status ?? "healthy",
        failureCount: state?.failureCount ?? 0,
        successCount: state?.successCount ?? 0,
        lastHealthCheck: p.lastHealthCheck,
      };
    });
  }),

  // --- Usage Stats (Admin) ---

  getAdminUsageStats: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        providerId: z.number().optional(),
        userId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return getAdminUsageStats({
        dateRange: { start: new Date(input.startDate), end: new Date(input.endDate) },
        providerId: input.providerId,
        userId: input.userId,
      });
    }),

  // --- User Endpoints ---

  getAvailableModelsWithProviders: protectedProcedure.query(async ({ ctx }) => {
    const mappedRows = await db
      .select({
        modelId: modelProviderMap.modelId,
        modelName: modelProviderMap.modelName,
        providerId: modelProviderMap.providerId,
        providerName: llmProviders.providerName,
        providerDisplayName: llmProviders.displayName,
        providerModelId: modelProviderMap.providerModelId,
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
        isFree: modelProviderMap.isFree,
        isEnabled: modelProviderMap.isEnabled,
        contextLength: modelProviderMap.contextLength,
        availableModels: llmProviders.availableModels,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
      .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority));

    const modelProviders: Record<string, { modelId: string; modelName: string; providers: any[] }> = {};

    for (const row of mappedRows) {
      const hydratedProvider = resolveProviderCatalogDefaults({
        providerName: row.providerName,
        availableModels: row.availableModels,
      } as any);
      const effectivePricing = resolveCatalogBackedPricing({
        providerName: row.providerName,
        availableModels: hydratedProvider.availableModels,
        providerModelId: row.providerModelId,
        pricingInput: row.pricingInput,
        pricingOutput: row.pricingOutput,
        isFree: row.isFree,
      });
      if (!modelProviders[row.modelId]) {
        modelProviders[row.modelId] = { modelId: row.modelId, modelName: row.modelName, providers: [] };
      }
      modelProviders[row.modelId].providers.push({
        ...row,
        pricingInput: String(effectivePricing.pricingInput),
        pricingOutput: String(effectivePricing.pricingOutput),
        isFree: effectivePricing.isFree,
      });
    }

    if (ctx.tenantId) {
      const workerModels = await listVisibleWorkerLlmModels({
        tenantId: ctx.tenantId,
        userId: ctx.user!.id,
        task: "chat",
      });
      for (const workerModel of workerModels) {
        modelProviders[workerModel.modelRef] = {
          modelId: workerModel.modelRef,
          modelName: workerModel.name,
          providers: [{
            providerId: workerModel.workerId,
            providerName: workerModel.providerDisplayName,
            providerDisplayName: workerModel.providerDisplayName,
            providerModelId: workerModel.localProviderId,
            pricingInput: "0",
            pricingOutput: "0",
            isFree: true,
            contextLength: workerModel.contextLength,
            sourceType: "worker_app",
            privacyMode: workerModel.privacyMode,
            selectable: workerModel.selectable,
          }],
        };
      }
    }

    return Object.values(modelProviders);
  }),

  getUserUsageStats: protectedProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getUserUsageStats(ctx.user!.id, {
        start: new Date(input.startDate),
        end: new Date(input.endDate),
      });
    }),

  backfillModelPriorities: adminProcedure
    .mutation(async () => {
      const unlockedRows = await db
        .select()
        .from(modelProviderMap)
        .where(eq(modelProviderMap.priorityLocked, false));

      const updates = unlockedRows.map((row: typeof unlockedRows[number]) => {
        const priority = computeModelPriority({
          pricingInput: row.pricingInput ? Number(row.pricingInput) : null,
          pricingOutput: row.pricingOutput ? Number(row.pricingOutput) : null,
          isFree: row.isFree,
          createdAt: undefined,
          supportsFunctionTools: row.supportsFunctionTools ?? false,
          supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
          supportsWebSearch: row.supportsWebSearch ?? false,
          supportsThinking: row.supportsThinking ?? false,
          supportsCodeExecution: row.supportsCodeExecution ?? false,
          supportsComputerUse: row.supportsComputerUse ?? false,
          supportsBackground: row.supportsBackground ?? false,
          supportsResponses: row.supportsResponses ?? false,
          supportsVision: row.supportsVision ?? false,
        });
        return db
          .update(modelProviderMap)
          .set({ priority })
          .where(eq(modelProviderMap.id, row.id));
      });

      await Promise.all(updates);

      return { success: true as const, updatedCount: updates.length };
    }),
});
