/**
 * Media Models tRPC Router
 * CRUD operations for AI generation models (Nano Banana Pro, Flux, Veo, etc.)
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { mediaModels, mediaProviders } from "../../drizzle/schema";
import { eq, asc, desc, and, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { clearModelCache } from "../services/modelRegistry";
import { getStaticFallbackModels, getStaticModelById } from "../services/modelRegistry";
import { clearSkillRegistryCache } from "../services/skillRegistry";
import { decrypt } from "../services/crypto";
import {
  normalizeMediaProviderName,
  sanitizeMediaModelConfigJson,
} from "../services/mediaProviderUtils";
import {
  getMediaModelResolutionCounters,
  resetMediaModelResolutionCounters,
} from "../services/mediaGenerationService";
import {
  getModelRegistryCounters,
  resetModelRegistryCounters,
} from "../services/modelRegistry";
import {
  getMediaModelLookupCounters,
  resetMediaModelLookupCounters,
} from "./media";

// Zod schemas
const mediaModelTypeSchema = z.enum(["image", "video", "audio"]);

const adminModelListFiltersSchema = z.object({
  type: mediaModelTypeSchema.optional(),
  provider: z.string().optional(),
  search: z.string().optional(),
  includeDisabled: z.boolean().default(true),
});

const createModelSchema = z.object({
  modelId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  modelType: mediaModelTypeSchema,
  provider: z.string().min(1).max(64),
  aliases: z.array(z.string()).default([]),
  creditCost: z.number().int().min(0).default(10),
  aspectRatios: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  durations: z.array(z.number()).optional(),
  voices: z.array(z.string()).optional(),
  configJson: z.record(z.any()).optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(99),
  sortOrder: z.number().int().default(0),
});

const updateModelSchema = z.object({
  id: z.number(),
  modelId: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(128).optional(),
  description: z.string().nullable().optional(),
  modelType: mediaModelTypeSchema.optional(),
  provider: z.string().min(1).max(64).optional(),
  aliases: z.array(z.string()).optional(),
  creditCost: z.number().int().min(0).optional(),
  aspectRatios: z.array(z.string()).nullable().optional(),
  sizes: z.array(z.string()).nullable().optional(),
  durations: z.array(z.number()).nullable().optional(),
  voices: z.array(z.string()).nullable().optional(),
  configJson: z.record(z.any()).nullable().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

const optionsSourceSchema = z.object({
  type: z.enum(["provider_api", "public_api"]),
  endpoint: z.string().min(1).max(500),
  method: z.enum(["GET", "POST"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  queryParam: z.string().max(120).optional(),
  body: z.unknown().optional(),
  itemsPath: z.string().max(120).optional(),
  valueField: z.string().max(120).optional(),
  labelField: z.string().max(120).optional(),
  valueTransform: z.enum(["none", "before_dash"]).optional(),
  cacheTtlSeconds: z.number().int().min(1).max(86400).optional(),
});

type ModelFieldOption = {
  value: string;
  label: string;
};

type MediaProviderStatusRow = {
  providerName: string;
  displayName: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  lastTestResult: { success?: boolean; message?: string } | null;
};

type MediaModelProviderReadiness =
  | "ready"
  | "provider_not_found"
  | "provider_disabled"
  | "missing_api_key"
  | "test_failed";

type AdminModelFilterInput = z.infer<typeof adminModelListFiltersSchema> | undefined;

type AdminModelListCandidate = {
  modelId: string;
  name: string;
  modelType: "image" | "video" | "audio";
  provider: string;
  isEnabled: boolean;
};

const modelFieldOptionsCache = new Map<string, { expiresAt: number; options: ModelFieldOption[] }>();

function getProviderReadiness(provider: MediaProviderStatusRow | undefined): {
  providerReady: boolean;
  providerReadiness: MediaModelProviderReadiness;
  providerReadinessMessage: string | null;
  providerDisplayName: string | null;
} {
  if (!provider) {
    return {
      providerReady: false,
      providerReadiness: "provider_not_found",
      providerReadinessMessage: "Provider record not found",
      providerDisplayName: null,
    };
  }

  if (!provider.isEnabled) {
    return {
      providerReady: false,
      providerReadiness: "provider_disabled",
      providerReadinessMessage: "Provider is disabled",
      providerDisplayName: provider.displayName,
    };
  }

  if (!provider.hasApiKey) {
    return {
      providerReady: false,
      providerReadiness: "missing_api_key",
      providerReadinessMessage: "Provider has no API key configured",
      providerDisplayName: provider.displayName,
    };
  }

  if (provider.lastTestResult && provider.lastTestResult.success === false) {
    return {
      providerReady: false,
      providerReadiness: "test_failed",
      providerReadinessMessage: provider.lastTestResult.message || "Latest provider health test failed",
      providerDisplayName: provider.displayName,
    };
  }

  return {
    providerReady: true,
    providerReadiness: "ready",
    providerReadinessMessage: provider.lastTestResult?.message || null,
    providerDisplayName: provider.displayName,
  };
}

function getPathValue(source: unknown, path: string): unknown {
  if (!path) return source;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function dedupeFieldOptions(options: ModelFieldOption[]): ModelFieldOption[] {
  const seen = new Set<string>();
  const deduped: ModelFieldOption[] = [];
  for (const option of options) {
    const key = option.value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function normalizeCatalogLookupKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function matchesAdminModelFilters(
  model: AdminModelListCandidate,
  input: AdminModelFilterInput,
): boolean {
  if (input?.type && model.modelType !== input.type) {
    return false;
  }

  if (input?.provider && normalizeMediaProviderName(model.provider) !== normalizeMediaProviderName(input.provider)) {
    return false;
  }

  if (input && input.includeDisabled === false && !model.isEnabled) {
    return false;
  }

  const search = input?.search?.trim().toLowerCase();
  if (search) {
    const name = model.name.toLowerCase();
    const modelId = model.modelId.toLowerCase();
    if (!name.includes(search) && !modelId.includes(search)) {
      return false;
    }
  }

  return true;
}

function collectStaticModelLookupKeys(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
): string[] {
  const keys = new Set<string>();

  const addKey = (value: unknown) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (trimmed) {
      keys.add(trimmed);
    }
  };

  addKey(modelId);
  if (configJson && typeof configJson === "object") {
    addKey(configJson.kieModelId);
    addKey(configJson.providerModelId);
    addKey(configJson.modelId);

    const apiConfig = configJson.apiConfig;
    if (apiConfig && typeof apiConfig === "object") {
      const apiConfigRecord = apiConfig as Record<string, unknown>;
      addKey(apiConfigRecord.kieModelId);
      addKey(apiConfigRecord.providerModelId);
      addKey(apiConfigRecord.modelId);
    }
  }

  return Array.from(keys);
}

function findStaticModelConfigJson(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  for (const candidate of collectStaticModelLookupKeys(modelId, configJson)) {
    const staticConfig = getStaticModelById(candidate)?.configJson;
    if (staticConfig) {
      return staticConfig;
    }
  }
  return undefined;
}

function mergeStaticModelConfigJson(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const staticConfig = findStaticModelConfigJson(modelId, configJson);
  const dbConfig = configJson && typeof configJson === "object" ? configJson : null;

  if (!staticConfig && !dbConfig) {
    return null;
  }

  return {
    ...(staticConfig ?? {}),
    ...(dbConfig ?? {}),
  };
}

function applyOptionValueTransform(value: unknown, transform?: "none" | "before_dash"): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (transform === "before_dash") {
    return trimmed.split(/\s*-\s*/, 1)[0]?.trim() || trimmed;
  }
  return trimmed;
}

function interpolateTemplateValue(template: unknown, query: string): unknown {
  if (typeof template === "string") {
    return template.replaceAll("{{query}}", query);
  }
  if (Array.isArray(template)) {
    return template.map((entry) => interpolateTemplateValue(entry, query));
  }
  if (!template || typeof template !== "object") {
    return template;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
    out[key] = interpolateTemplateValue(value, query);
  }
  return out;
}

async function resolveProviderConnection(providerName: string): Promise<{ baseUrl: string; apiKey: string } | null> {
  const normalizedProviderName = normalizeMediaProviderName(providerName);
  const providers = await db
    .select({
      providerName: mediaProviders.providerName,
      baseUrl: mediaProviders.baseUrl,
      apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
    })
    .from(mediaProviders)
    .limit(200);

  const provider = providers.find((candidate: { providerName: string | null }) => (
    normalizeMediaProviderName(candidate.providerName) === normalizedProviderName
  ));

  if (!provider?.baseUrl || !provider.apiKeyEncrypted) {
    return null;
  }

  const apiKey = decrypt(provider.apiKeyEncrypted);
  if (!apiKey) {
    return null;
  }

  return {
    baseUrl: provider.baseUrl,
    apiKey,
  };
}

async function fetchFieldOptionsFromSource(
  providerName: string,
  source: z.infer<typeof optionsSourceSchema>,
  query?: string,
): Promise<ModelFieldOption[]> {
  const endpointRaw = source.endpoint.trim();
  if (!endpointRaw) return [];

  const sourceType = source.type;
  const method = source.method === "POST" ? "POST" : "GET";
  const itemsPath = source.itemsPath || "data";
  const valueField = source.valueField || "id";
  const labelField = source.labelField || "name";
  const valueTransform = source.valueTransform || "none";
  const cacheTtlSeconds = source.cacheTtlSeconds && source.cacheTtlSeconds > 0 ? source.cacheTtlSeconds : 300;

  const cacheKey = `${sourceType}|${providerName}|${endpointRaw}|${method}|${itemsPath}|${valueField}|${labelField}|${valueTransform}|${query || ""}`;
  const now = Date.now();
  const cached = modelFieldOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.options;
  }

  let url: URL;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (sourceType === "provider_api") {
    if (/^https?:\/\//i.test(endpointRaw)) return [];
    if (endpointRaw.startsWith("//")) return [];
    if (endpointRaw.includes("..")) return [];

    const connection = await resolveProviderConnection(providerName);
    if (!connection) return [];
    url = new URL(endpointRaw.replace(/^\//, ""), `${connection.baseUrl.replace(/\/$/, "")}/`);
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else {
    if (!/^https:\/\//i.test(endpointRaw)) return [];
    if (endpointRaw.includes("..")) return [];
    url = new URL(endpointRaw);
  }

  if (query && source.queryParam && source.queryParam.trim().length > 0) {
    url.searchParams.set(source.queryParam.trim(), query);
  }

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  if (source.headers) {
    for (const [key, value] of Object.entries(source.headers)) {
      const headerValue = typeof value === "string" ? value.trim() : "";
      if (headerValue) {
        headers[key] = headerValue;
      }
    }
  }

  const payload = method === "POST"
    ? interpolateTemplateValue(source.body ?? {}, query ?? "")
    : undefined;

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    return [];
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    return [];
  }

  const items = itemsPath ? getPathValue(parsed, itemsPath) : parsed;
  if (!Array.isArray(items)) {
    return [];
  }

  const options: ModelFieldOption[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const valueRaw = getPathValue(item, valueField);
    const labelRaw = getPathValue(item, labelField);
    const value = applyOptionValueTransform(valueRaw, valueTransform);
    const label = typeof labelRaw === "string" ? labelRaw.trim() : value;
    if (!value) continue;
    options.push({ value, label: label || value });
  }

  const deduped = dedupeFieldOptions(options);
  modelFieldOptionsCache.set(cacheKey, {
    expiresAt: now + cacheTtlSeconds * 1000,
    options: deduped,
  });
  return deduped;
}

export const mediaModelsRouter = router({
  // ==================== Admin Operations ====================

  /**
   * List all models (admin)
   */
  adminList: adminProcedure
    .input(adminModelListFiltersSchema.optional())
    .query(async ({ input }) => {
      try {
        const conditions = [];

        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type));
        }

        if (input?.provider) {
          conditions.push(eq(mediaModels.provider, input.provider));
        }

        if (!input?.includeDisabled) {
          conditions.push(eq(mediaModels.isEnabled, true));
        }

        if (input?.search) {
          conditions.push(
            sql`(${mediaModels.name} ILIKE ${`%${input.search}%`} OR ${mediaModels.modelId} ILIKE ${`%${input.search}%`})`
          );
        }

        const models = await db
          .select()
          .from(mediaModels)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority));

        const providers = await db
          .select({
            providerName: mediaProviders.providerName,
            displayName: mediaProviders.displayName,
            isEnabled: mediaProviders.isEnabled,
            hasApiKey: mediaProviders.hasApiKey,
            lastTestResult: mediaProviders.lastTestResult,
          })
          .from(mediaProviders)
          .orderBy(asc(mediaProviders.sortOrder), asc(mediaProviders.displayName));

        const providerRows = providers as MediaProviderStatusRow[];
        const providersByName = new Map<string, MediaProviderStatusRow>(
          providerRows.map((provider: MediaProviderStatusRow) => [normalizeMediaProviderName(provider.providerName), provider]),
        );

        return models.map((model: typeof models[number]) => {
          const provider = providersByName.get(normalizeMediaProviderName(model.provider));
          const readiness = getProviderReadiness(provider);
          return {
            ...model,
            configJson: mergeStaticModelConfigJson(model.modelId, model.configJson as Record<string, unknown> | null | undefined),
            ...readiness,
            providerConfigFound: Boolean(provider),
          };
        });
      } catch (error: any) {
        console.warn("[MediaModels] List query failed:", error.message);
        return [];
      }
    }),

  /**
   * List static fallback model templates that are not yet imported into the DB.
   */
  adminTemplates: adminProcedure
    .input(adminModelListFiltersSchema.optional())
    .query(async ({ input }) => {
      try {
        const [existingRows, providers] = await Promise.all([
          db
            .select({ modelId: mediaModels.modelId })
            .from(mediaModels),
          db
            .select({
              providerName: mediaProviders.providerName,
              displayName: mediaProviders.displayName,
              isEnabled: mediaProviders.isEnabled,
              hasApiKey: mediaProviders.hasApiKey,
              lastTestResult: mediaProviders.lastTestResult,
            })
            .from(mediaProviders)
            .orderBy(asc(mediaProviders.sortOrder), asc(mediaProviders.displayName)),
        ]);

        const existingModelIds = new Set(
          existingRows.map((row: { modelId: string | null }) => normalizeCatalogLookupKey(row.modelId)),
        );

        const providerRows = providers as MediaProviderStatusRow[];
        const providersByName = new Map<string, MediaProviderStatusRow>(
          providerRows.map((provider: MediaProviderStatusRow) => [normalizeMediaProviderName(provider.providerName), provider]),
        );

        return getStaticFallbackModels()
          .map((template) => {
            const provider = providersByName.get(normalizeMediaProviderName(template.provider));
            const readiness = getProviderReadiness(provider);

            return {
              modelId: template.id,
              name: template.name,
              description: template.description || null,
              modelType: template.type,
              provider: normalizeMediaProviderName(template.provider),
              aliases: template.aliases,
              creditCost: template.creditCost,
              aspectRatios: template.aspectRatios ?? null,
              sizes: template.sizes ?? null,
              durations: template.durations ?? null,
              voices: template.voices ?? null,
              configJson: template.configJson ?? null,
              isEnabled: template.isEnabled !== false,
              priority: template.priority ?? 99,
              sortOrder: template.priority ?? 99,
              providerConfigFound: Boolean(provider),
              ...readiness,
            };
          })
          .filter((template) => !existingModelIds.has(normalizeCatalogLookupKey(template.modelId)))
          .filter((template) => matchesAdminModelFilters(template, input))
          .sort((a, b) => (
            a.modelType.localeCompare(b.modelType)
            || a.sortOrder - b.sortOrder
            || a.priority - b.priority
            || a.name.localeCompare(b.name)
          ));
      } catch (error: any) {
        console.warn("[MediaModels] Template query failed:", error.message);
        return [];
      }
    }),

  /**
   * Get single model by ID
   */
  adminGet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, input.id));

      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      return {
        ...model,
        configJson: mergeStaticModelConfigJson(model.modelId, model.configJson as Record<string, unknown> | null | undefined),
      };
    }),

  /**
   * Get model by modelId
   */
  getByModelId: adminProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId));

      return model
        ? {
          ...model,
          configJson: mergeStaticModelConfigJson(model.modelId, model.configJson as Record<string, unknown> | null | undefined),
        }
        : null;
    }),

  /**
   * Create new model
   */
  create: adminProcedure
    .input(createModelSchema)
    .mutation(async ({ input }) => {
      const configJson = sanitizeMediaModelConfigJson(input.configJson as Record<string, unknown> | null | undefined);

      // Check if modelId already exists
      const [existing] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId));

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Model with ID '${input.modelId}' already exists`,
        });
      }

      const [model] = await db
        .insert(mediaModels)
        .values({
          modelId: input.modelId,
          name: input.name,
          description: input.description,
          modelType: input.modelType,
          provider: normalizeMediaProviderName(input.provider),
          aliases: input.aliases,
          creditCost: input.creditCost,
          aspectRatios: input.aspectRatios,
          sizes: input.sizes,
          durations: input.durations,
          voices: input.voices,
          configJson,
          isEnabled: input.isEnabled,
          priority: input.priority,
          sortOrder: input.sortOrder,
        })
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return model;
    }),

  /**
   * Import a static fallback model template into the DB-backed admin catalog.
   */
  importTemplate: adminProcedure
    .input(z.object({ modelId: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const template = getStaticFallbackModels().find((candidate) => candidate.id === input.modelId);
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Static model template '${input.modelId}' not found`,
        });
      }

      const [existing] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId));

      if (existing) {
        return {
          imported: false,
          model: {
            ...existing,
            configJson: mergeStaticModelConfigJson(
              existing.modelId,
              existing.configJson as Record<string, unknown> | null | undefined,
            ),
          },
        };
      }

      const configJson = sanitizeMediaModelConfigJson(
        (template.configJson as Record<string, unknown> | null | undefined) ?? undefined,
      );

      const [created] = await db
        .insert(mediaModels)
        .values({
          modelId: template.id,
          name: template.name,
          description: template.description,
          modelType: template.type,
          provider: normalizeMediaProviderName(template.provider),
          aliases: template.aliases,
          creditCost: template.creditCost,
          aspectRatios: template.aspectRatios,
          sizes: template.sizes,
          durations: template.durations,
          voices: template.voices,
          configJson,
          isEnabled: template.isEnabled !== false,
          priority: template.priority ?? 99,
          sortOrder: template.priority ?? 99,
        })
        .returning();

      clearModelCache();
      clearSkillRegistryCache();

      return {
        imported: true,
        model: {
          ...created,
          configJson: mergeStaticModelConfigJson(
            String(created.modelId ?? ""),
            created.configJson as Record<string, unknown> | null | undefined,
          ),
        },
      };
    }),

  /**
   * Update model
   */
  update: adminProcedure
    .input(updateModelSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const configJson = data.configJson === undefined
        ? undefined
        : sanitizeMediaModelConfigJson(data.configJson as Record<string, unknown> | null | undefined);

      // Check if model exists
      const [existing] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, id));

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      // Check if new modelId conflicts
      if (data.modelId && data.modelId !== existing.modelId) {
        const [conflict] = await db
          .select()
          .from(mediaModels)
          .where(eq(mediaModels.modelId, data.modelId));

        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Model with ID '${data.modelId}' already exists`,
          });
        }
      }

      const [updated] = await db
        .update(mediaModels)
        .set({
          ...data,
          ...(data.provider ? { provider: normalizeMediaProviderName(data.provider) } : {}),
          ...(configJson !== undefined ? { configJson } : {}),
          updatedAt: new Date(),
        })
        .where(eq(mediaModels.id, id))
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return updated;
    }),

  /**
   * Delete model
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [deleted] = await db
        .delete(mediaModels)
        .where(eq(mediaModels.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return { success: true };
    }),

  /**
   * Toggle model enabled/disabled
   */
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, input.id));

      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      const [updated] = await db
        .update(mediaModels)
        .set({
          isEnabled: !model.isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(mediaModels.id, input.id))
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return updated;
    }),

  /**
   * Disable all models whose backing provider is not ready for runtime use.
   */
  disableUnavailable: adminProcedure
    .mutation(async () => {
      const [models, providers] = await Promise.all([
        db.select().from(mediaModels).orderBy(asc(mediaModels.id)),
        db.select({
          providerName: mediaProviders.providerName,
          displayName: mediaProviders.displayName,
          isEnabled: mediaProviders.isEnabled,
          hasApiKey: mediaProviders.hasApiKey,
          lastTestResult: mediaProviders.lastTestResult,
        }).from(mediaProviders),
      ]);

      const providerRows = providers as MediaProviderStatusRow[];
      const providersByName = new Map<string, MediaProviderStatusRow>(
        providerRows.map((provider: MediaProviderStatusRow) => [normalizeMediaProviderName(provider.providerName), provider]),
      );

      const unavailableEnabledModels = models.filter((model: typeof models[number]) => {
        if (!model.isEnabled) {
          return false;
        }
        const provider = providersByName.get(normalizeMediaProviderName(model.provider));
        return !getProviderReadiness(provider).providerReady;
      });

      for (const model of unavailableEnabledModels) {
        await db
          .update(mediaModels)
          .set({
            isEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(mediaModels.id, model.id));
      }

      if (unavailableEnabledModels.length > 0) {
        clearModelCache();
        clearSkillRegistryCache();
      }

      return {
        success: true,
        disabledCount: unavailableEnabledModels.length,
        disabledModelIds: unavailableEnabledModels.map((model: typeof unavailableEnabledModels[number]) => model.modelId),
      };
    }),

  /**
   * Reorder models (update sortOrder)
   */
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      for (const item of input.items) {
        await db
          .update(mediaModels)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(mediaModels.id, item.id));
      }

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return { success: true };
    }),

  /**
   * Get statistics
   */
  stats: adminProcedure.query(async () => {
    try {
      const [models, providers] = await Promise.all([
        db.select().from(mediaModels),
        db.select({
          providerName: mediaProviders.providerName,
          displayName: mediaProviders.displayName,
          isEnabled: mediaProviders.isEnabled,
          hasApiKey: mediaProviders.hasApiKey,
          lastTestResult: mediaProviders.lastTestResult,
        }).from(mediaProviders),
      ]);

      const providerRows = providers as MediaProviderStatusRow[];
      const providersByName = new Map<string, MediaProviderStatusRow>(
        providerRows.map((provider: MediaProviderStatusRow) => [normalizeMediaProviderName(provider.providerName), provider]),
      );
      const unavailable = models.filter((model: typeof models[number]) => {
        const provider = providersByName.get(normalizeMediaProviderName(model.provider));
        return !getProviderReadiness(provider).providerReady;
      }).length;

      return {
        total: models.length,
        enabled: models.filter((m: (typeof models)[number]) => m.isEnabled).length,
        unavailable,
        byType: {
          image: models.filter((m: (typeof models)[number]) => m.modelType === "image").length,
          video: models.filter((m: (typeof models)[number]) => m.modelType === "video").length,
          audio: models.filter((m: (typeof models)[number]) => m.modelType === "audio").length,
        },
        providers: [...new Set(models.map((m: (typeof models)[number]) => m.provider))],
      };
    } catch (error: any) {
      console.warn("[MediaModels] Stats query failed:", error.message);
      return {
        total: 0,
        enabled: 0,
        unavailable: 0,
        byType: { image: 0, video: 0, audio: 0 },
        providers: [],
      };
    }
  }),

  /**
   * Runtime observability counters for model resolution/fallback behavior
   */
  runtimeCounters: adminProcedure.query(() => {
    const mediaLookup = getMediaModelLookupCounters();
    const mediaResolution = getMediaModelResolutionCounters();
    const modelRegistry = getModelRegistryCounters();

    const fallbackTotal =
      mediaLookup.pricingDbMissFallback +
      mediaLookup.metadataDbMissFallback +
      mediaLookup.defaultFallbackStatic +
      mediaResolution.providerDefaultFallback +
      modelRegistry.staticFallbackHits;

    return {
      generatedAt: new Date().toISOString(),
      mediaLookup,
      mediaResolution,
      modelRegistry,
      fallbackTotal,
    };
  }),

  /**
   * Reset runtime observability counters
   */
  resetRuntimeCounters: adminProcedure.mutation(() => {
    resetMediaModelLookupCounters();
    resetMediaModelResolutionCounters();
    resetModelRegistryCounters();
    return {
      success: true,
      resetAt: new Date().toISOString(),
    };
  }),

  /**
   * Preview dynamic field options for admin configuration UI
   */
  previewFieldOptions: adminProcedure
    .input(z.object({
      provider: z.string().min(1).max(64),
      optionsSource: optionsSourceSchema,
      query: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(2000).default(2000),
    }))
    .mutation(async ({ input }) => {
      const options = await fetchFieldOptionsFromSource(
        input.provider,
        input.optionsSource,
        input.query,
      );
      return {
        options: options.slice(0, input.limit),
      };
    }),

  // ==================== Public Operations ====================

  /**
   * List enabled models (for clients)
   * Returns { models: [...], providers: [...] } for UI consumption
   */
  list: protectedProcedure
    .input(z.object({
      type: mediaModelTypeSchema.optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        const conditions = [eq(mediaModels.isEnabled, true)];

        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type));
        }

        if (input?.search) {
          conditions.push(
            sql`(${mediaModels.name} ILIKE ${`%${input.search}%`} OR ${mediaModels.modelId} ILIKE ${`%${input.search}%`} OR ${mediaModels.provider} ILIKE ${`%${input.search}%`})`
          );
        }

        const models = await db
          .select({
            id: mediaModels.id,
            modelId: mediaModels.modelId,
            name: mediaModels.name,
            description: mediaModels.description,
            modelType: mediaModels.modelType,
            provider: mediaModels.provider,
            creditCost: mediaModels.creditCost,
            aspectRatios: mediaModels.aspectRatios,
            sizes: mediaModels.sizes,
            durations: mediaModels.durations,
            voices: mediaModels.voices,
            priority: mediaModels.priority,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(and(...conditions))
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority));

        // Get unique providers for grouping
        const providers = [...new Set(models.map((m: (typeof models)[number]) => m.provider))];

        return {
          models: models.map((model: (typeof models)[number]) => ({
            ...model,
            configJson: mergeStaticModelConfigJson(model.modelId, model.configJson as Record<string, unknown> | null | undefined),
          })),
          providers,
        };
      } catch (error: any) {
        console.warn("[MediaModels] Public list query failed:", error.message);
        return { models: [], providers: [] };
      }
    }),

  /**
   * Get available providers
   */
  providers: adminProcedure.query(async () => {
    try {
      const result = await db.instance
        .selectDistinct({ provider: mediaModels.provider })
        .from(mediaModels);

      return result.map((r: (typeof result)[number]) => r.provider);
    } catch (error: any) {
      return [];
    }
  }),
});
