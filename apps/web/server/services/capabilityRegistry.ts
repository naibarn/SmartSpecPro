/**
 * Capability Registry
 *
 * Provides capability-based model filtering and policy resolution.
 * This is the foundation for the Task Execution Planner to make
 * intelligent model selection decisions.
 *
 * Capability data comes from model_provider_map columns.
 * Skill execution policy comes from skill.md frontmatter via SkillExecutionPolicyConfig.
 */

import type { SkillExecutionPolicyConfig } from "@smartspec/skills";
import { and, eq, asc } from "drizzle-orm";
import { modelProviderMap, llmProviders } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Model capability metadata — normalized from model_provider_map rows.
 */
export interface ModelCapabilities {
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsResponses?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  contextLength?: number;
}

/**
 * Capability requirements used for filtering models.
 * Only specified fields are checked (unset = don't care).
 */
export type CapabilityRequirements = Partial<ModelCapabilities>;

/**
 * Re-export the canonical policy type from @smartspec/skills.
 * This avoids duplicate type definitions.
 */
export type { SkillExecutionPolicyConfig as SkillExecutionPolicy } from "@smartspec/skills";

/**
 * Default execution policy — no requirements, allows everything.
 */
export const DEFAULT_EXECUTION_POLICY: SkillExecutionPolicyConfig = {
  mode: "requirements",
  requirements: {},
  allowConversationOverride: true,
  fallbackPolicy: "use_default",
};

/**
 * A model with its capability metadata, for use in filtering.
 */
export interface EnabledModelWithCapabilities {
  modelId: string;
  providerModelId: string;
  providerName: string;
  capabilities: ModelCapabilities;
}

/**
 * Load enabled models with their capability metadata from the database.
 * This is the integration layer between DB and the capability filter.
 */
export async function loadEnabledModelsWithCapabilities(): Promise<EnabledModelWithCapabilities[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      modelId: modelProviderMap.modelId,
      providerModelId: modelProviderMap.providerModelId,
      providerName: llmProviders.providerName,
      contextLength: modelProviderMap.contextLength,
      supportsVision: modelProviderMap.supportsVision,
      supportsThinking: modelProviderMap.supportsThinking,
      supportsResponses: modelProviderMap.supportsResponses,
      supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
      supportsWebSearch: modelProviderMap.supportsWebSearch,
      supportsFunctionTools: modelProviderMap.supportsFunctionTools,
      supportsCodeExecution: modelProviderMap.supportsCodeExecution,
      supportsComputerUse: modelProviderMap.supportsComputerUse,
      supportsBackground: modelProviderMap.supportsBackground,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
    .orderBy(asc(llmProviders.sortOrder), asc(modelProviderMap.priority));

  return rows.map((row) => ({
    modelId: row.modelId,
    providerModelId: row.providerModelId,
    providerName: row.providerName,
    capabilities: {
      supportsVision: row.supportsVision ?? false,
      supportsThinking: row.supportsThinking ?? false,
      supportsResponses: row.supportsResponses ?? false,
      supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
      supportsWebSearch: row.supportsWebSearch ?? false,
      supportsFunctionTools: row.supportsFunctionTools ?? false,
      supportsCodeExecution: row.supportsCodeExecution ?? false,
      supportsComputerUse: row.supportsComputerUse ?? false,
      supportsBackground: row.supportsBackground ?? false,
      contextLength: row.contextLength ?? undefined,
    },
  }));
}

/**
 * Load enabled models with capability metadata AND pricing data.
 * Used by the task planner middleware for model resolution via resolveModelFromPlan().
 */
export async function loadEnabledModelsWithPricing(): Promise<
  Array<EnabledModelWithCapabilities & { pricingInput: number; pricingOutput: number; isFree: boolean }>
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      modelId: modelProviderMap.modelId,
      providerModelId: modelProviderMap.providerModelId,
      providerName: llmProviders.providerName,
      contextLength: modelProviderMap.contextLength,
      supportsVision: modelProviderMap.supportsVision,
      supportsThinking: modelProviderMap.supportsThinking,
      supportsResponses: modelProviderMap.supportsResponses,
      supportsStructuredOutputs: modelProviderMap.supportsStructuredOutputs,
      supportsWebSearch: modelProviderMap.supportsWebSearch,
      supportsFunctionTools: modelProviderMap.supportsFunctionTools,
      supportsCodeExecution: modelProviderMap.supportsCodeExecution,
      supportsComputerUse: modelProviderMap.supportsComputerUse,
      supportsBackground: modelProviderMap.supportsBackground,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
    .orderBy(asc(llmProviders.sortOrder), asc(modelProviderMap.priority));

  return rows.map((row) => ({
    modelId: row.modelId,
    providerModelId: row.providerModelId,
    providerName: row.providerName,
    capabilities: {
      supportsVision: row.supportsVision ?? false,
      supportsThinking: row.supportsThinking ?? false,
      supportsResponses: row.supportsResponses ?? false,
      supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
      supportsWebSearch: row.supportsWebSearch ?? false,
      supportsFunctionTools: row.supportsFunctionTools ?? false,
      supportsCodeExecution: row.supportsCodeExecution ?? false,
      supportsComputerUse: row.supportsComputerUse ?? false,
      supportsBackground: row.supportsBackground ?? false,
      contextLength: row.contextLength ?? undefined,
    },
    pricingInput: parseFloat(String(row.pricingInput)) || 0,
    pricingOutput: parseFloat(String(row.pricingOutput)) || 0,
    isFree: row.isFree ?? false,
  }));
}

/**
 * Filter models by capability requirements.
 * All specified requirements must be met (AND logic).
 * For contextLength, the model's value must be >= the requirement.
 */
export function filterModelsByCapabilities<
  T extends { modelId: string; capabilities: ModelCapabilities },
>(
  models: T[],
  requirements: CapabilityRequirements,
): T[] {
  return models.filter((model) => {
    const caps = model.capabilities;
    for (const [key, required] of Object.entries(requirements)) {
      if (required === undefined || required === null) continue;

      if (key === "contextLength") {
        if ((caps.contextLength ?? 0) < (required as number)) return false;
      } else {
        if (caps[key as keyof ModelCapabilities] !== required) return false;
      }
    }
    return true;
  });
}

/**
 * Resolve the list of allowed models for a skill execution policy.
 * Returns models in preference order (preferred first, then others).
 */
export function resolveModelsForPolicy<
  T extends { modelId: string; capabilities: ModelCapabilities },
>(
  enabledModels: T[],
  policy: SkillExecutionPolicyConfig,
): T[] {
  let candidates = [...enabledModels];

  // Apply disallowedModels filter
  if (policy.disallowedModels?.length) {
    const disallowed = new Set(policy.disallowedModels);
    candidates = candidates.filter((m) => !disallowed.has(m.modelId));
  }

  if (policy.mode === "fixed" && policy.fixedModel) {
    // Fixed mode: only the specified model
    return candidates.filter((m) => m.modelId === policy.fixedModel);
  }

  // Requirements-based filtering (for requirements and hybrid modes)
  if (policy.requirements && Object.keys(policy.requirements).length > 0) {
    candidates = filterModelsByCapabilities(candidates, policy.requirements);
  }

  if (policy.mode === "hybrid" && policy.fixedModel) {
    // Hybrid: put fixed model first if it's in the candidates (i.e., it meets requirements)
    const fixedIdx = candidates.findIndex((m) => m.modelId === policy.fixedModel);
    if (fixedIdx > 0) {
      const [fixed] = candidates.splice(fixedIdx, 1);
      candidates.unshift(fixed);
    }
  }

  // Apply preferredProfiles ordering
  if (policy.preferredProfiles?.length) {
    const preferenceOrder = new Map(
      policy.preferredProfiles.map((id, idx) => [id, idx]),
    );
    candidates.sort((a, b) => {
      const aOrder = preferenceOrder.get(a.modelId) ?? Infinity;
      const bOrder = preferenceOrder.get(b.modelId) ?? Infinity;
      return aOrder - bOrder;
    });
  }

  return candidates;
}
