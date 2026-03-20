/**
 * Skill Execution Policy Resolution
 *
 * Resolves the effective model and provider routing for skill invocations.
 * Supports capability-aware model selection via requirements matching,
 * with fallback to the legacy cascade (llmModelId → defaultModel → conversation → system default).
 */

import type { SkillDefinition } from "@smartspec/skills";
import {
  resolveEnabledLlmModelIdFromRows,
  loadEnabledLlmModelRows,
  type EnabledLlmModelRow,
} from "./enabledLlmModels";
import { selectBestLlmModel, describeRequirementsMatch } from "./intelligentModelSelector";
import type { CapabilityRequirements } from "./intelligentModelSelector";

export interface SkillExecutionPolicyInput {
  /** The skill being invoked */
  skill: SkillDefinition;
  /** The conversation's currently selected model (user's active choice) */
  conversationModel?: string | null;
}

export interface SkillExecutionPolicyResult {
  /** The resolved LLM model ID to use */
  modelId: string | null;
  /** Whether free-tier models are allowed for this skill */
  allowFreeModels: boolean;
  /** Optional pinned provider ID from skill configuration */
  preferredProviderId?: number;
  /** Whether to enforce the pinned provider with no fallback */
  strictProviderPin?: boolean;
  /** Source of the resolved model for auditing */
  modelSource:
    | "skill_llmModelId"
    | "skill_defaultModel"
    | "conversation"
    | "system_default"
    | "requirements_match"
    | "skill_fixedModel";
  /** Capabilities the selected model satisfies (only when modelSource="requirements_match") */
  matchedCapabilities?: string[];
  /** True when requirements found no match and a fallback model was used */
  requirementsFallback?: boolean;
}

function filterRowsByFreeModelPolicy(
  rows: EnabledLlmModelRow[],
  allowFreeModels: boolean,
): EnabledLlmModelRow[] {
  if (allowFreeModels) {
    return rows;
  }
  return rows.filter((row) => row.isFree !== true);
}

/**
 * Check if a requirements object has at least one meaningful key.
 */
function hasNonEmptyRequirements(
  requirements: Record<string, unknown> | undefined | null,
): boolean {
  if (!requirements) return false;
  return Object.values(requirements).some((v) => v !== undefined && v !== null);
}

/**
 * Normalize execution policy from legacy UI format to Feature 041 format.
 *
 * The Admin Skills UI saves Content Quality settings as flat keys:
 *   { requires_web_search: true, requires_structured_output: true, thinking_level_hint: "high", ... }
 *
 * Feature 041 expects:
 *   { mode: "requirements", requirements: { supportsWebSearch: true, supportsStructuredOutputs: true } }
 *
 * This function bridges the two formats so both work transparently.
 */
function normalizeExecutionPolicy(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw) return raw;

  // Already in Feature 041 format (has "requirements" key with object value)
  if (raw.requirements && typeof raw.requirements === "object") {
    return raw;
  }

  // Check for legacy flat keys
  const hasLegacyKeys =
    raw.requires_web_search !== undefined ||
    raw.requires_structured_output !== undefined ||
    raw.requires_citations !== undefined;

  if (!hasLegacyKeys) return raw;

  // Map legacy keys → Feature 041 capability requirements
  const requirements: Record<string, unknown> = {};
  if (raw.requires_web_search === true) {
    requirements.supportsWebSearch = true;
  }
  if (raw.requires_structured_output === true) {
    requirements.supportsStructuredOutputs = true;
  }
  // requires_citations doesn't map to a model capability flag directly,
  // but models that support web search generally support citations

  const hasReqs = Object.keys(requirements).length > 0;

  return {
    ...raw,
    mode: hasReqs ? "requirements" : raw.mode,
    requirements: hasReqs ? requirements : raw.requirements,
  };
}

/**
 * Resolve the effective execution policy for a skill invocation.
 *
 * Mode semantics:
 * - "requirements": use capability-aware selector, fallback to llmModelId/system default
 * - "fixed": skip requirements, use existing cascade
 * - "hybrid": try fixedModel first, then requirements, then cascade
 * - undefined: auto-detect — use requirements if declared, else existing cascade
 *
 * Uses a single DB call to load rows, then resolves against them in-memory.
 */
export async function resolveSkillExecutionPolicy(
  input: SkillExecutionPolicyInput,
): Promise<SkillExecutionPolicyResult> {
  const { skill, conversationModel } = input;

  const skillLlmModelId = skill.llmModelId || undefined;
  const skillDefaultModel = skill.defaultModel || undefined;
  const convModel = conversationModel ?? undefined;

  // Single DB call: load all enabled model rows
  const rows = await loadEnabledLlmModelRows();

  const base = {
    preferredProviderId: skill.preferredProviderId,
    strictProviderPin: skill.strictProviderPin,
  };

  const rawPolicy = skill.executionPolicy;
  const policy = normalizeExecutionPolicy(rawPolicy as Record<string, unknown> | undefined) as
    typeof rawPolicy;
  const mode = policy?.mode;
  const requirements = policy?.requirements;
  const hasReqs = hasNonEmptyRequirements(requirements);
  const allowConvOverride = policy?.allowConversationOverride ?? false;
  const allowFreeModels = policy?.allowFreeModels === true;
  const eligibleRows = filterRowsByFreeModelPolicy(rows, allowFreeModels);
  const resolvedBase = {
    ...base,
    allowFreeModels,
  };

  // ─── Fixed mode: skip requirements, run existing cascade ───
  if (mode === "fixed") {
    return legacyCascade({
      rows: eligibleRows,
      base: resolvedBase,
      skillLlmModelId,
      skillDefaultModel,
      convModel,
    });
  }

  // ─── Hybrid mode: try fixedModel first ───
  if (mode === "hybrid" && policy?.fixedModel) {
    const fixedResolved = resolveEnabledLlmModelIdFromRows({
      rows: eligibleRows,
      preferredModelIds: [policy.fixedModel],
    });
    if (fixedResolved) {
      return { ...resolvedBase, modelId: fixedResolved, modelSource: "skill_fixedModel" };
    }
    // fixedModel unavailable: fall through to requirements
  }

  // ─── Requirements matching (when applicable) ───
  const shouldTryRequirements =
    mode === "requirements" || mode === "hybrid" || (mode === undefined && hasReqs);

  // mode === "requirements" with empty requirements: use restricted fallback (no defaultModel)
  if (shouldTryRequirements && !hasReqs && mode === "requirements") {
    return requirementsFallbackCascade({
      rows: eligibleRows,
      base: resolvedBase,
      skillLlmModelId,
      skillDefaultModel,
      convModel,
      allowConvOverride,
      mode,
    });
  }

  if (shouldTryRequirements && hasReqs) {
    const matched = selectBestLlmModel(
      requirements as Partial<CapabilityRequirements>,
      eligibleRows,
    );

    if (matched) {
      // Find the matching row for capability description
      const matchedRow = eligibleRows.find((r) => r.modelId === matched);
      const caps = matchedRow
        ? describeRequirementsMatch(
            requirements as Partial<CapabilityRequirements>,
            matchedRow,
          )
        : { matched: [], missing: [] };

      return {
        ...resolvedBase,
        modelId: matched,
        modelSource: "requirements_match",
        matchedCapabilities: caps.matched,
        requirementsFallback: false,
      };
    }

    // Requirements found no match — fall through with requirementsFallback flag
    return requirementsFallbackCascade({
      rows: eligibleRows,
      base: resolvedBase,
      skillLlmModelId,
      skillDefaultModel,
      convModel,
      allowConvOverride,
      mode,
    });
  }

  // ─── No requirements: existing cascade ───
  return legacyCascade({
    rows: eligibleRows,
    base: resolvedBase,
    skillLlmModelId,
    skillDefaultModel,
    convModel,
  });
}

/**
 * Legacy cascade: llmModelId → defaultModel → conversationModel → system default.
 * Used when no requirements are active (fixed mode, or undefined mode without requirements).
 */
function legacyCascade(opts: {
  rows: EnabledLlmModelRow[];
  base: { allowFreeModels: boolean; preferredProviderId?: number; strictProviderPin?: boolean };
  skillLlmModelId?: string;
  skillDefaultModel?: string;
  convModel?: string;
}): SkillExecutionPolicyResult {
  const { rows, base, skillLlmModelId, skillDefaultModel, convModel } = opts;

  const preferredIds = [skillLlmModelId, skillDefaultModel, convModel];
  const modelId = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: preferredIds });

  if (!modelId) {
    return { ...base, modelId: null, modelSource: "system_default" };
  }

  // Determine source by checking each candidate in priority order
  if (skillLlmModelId) {
    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [skillLlmModelId] });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "skill_llmModelId" };
    }
  }
  if (skillDefaultModel) {
    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [skillDefaultModel] });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "skill_defaultModel" };
    }
  }
  if (convModel) {
    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [convModel] });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "conversation" };
    }
  }

  return { ...base, modelId, modelSource: "system_default" };
}

/**
 * Fallback cascade after requirements matching failed.
 * Sets requirementsFallback: true on the result.
 * Respects allowConversationOverride setting.
 */
function requirementsFallbackCascade(opts: {
  rows: EnabledLlmModelRow[];
  base: { allowFreeModels: boolean; preferredProviderId?: number; strictProviderPin?: boolean };
  skillLlmModelId?: string;
  skillDefaultModel?: string;
  convModel?: string;
  allowConvOverride: boolean;
  mode?: string;
}): SkillExecutionPolicyResult {
  const { rows, base, skillLlmModelId, skillDefaultModel, convModel, allowConvOverride, mode } =
    opts;

  // In "requirements" mode, skip defaultModel as a fallback tier
  const useDefaultModel = mode !== "requirements";
  const useConvModel = allowConvOverride;

  const preferredIds = [
    skillLlmModelId,
    useDefaultModel ? skillDefaultModel : undefined,
    useConvModel ? convModel : undefined,
  ];
  const modelId = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: preferredIds });

  if (!modelId) {
    return { ...base, modelId: null, modelSource: "system_default", requirementsFallback: true };
  }

  // Determine source
  if (skillLlmModelId) {
    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [skillLlmModelId] });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "skill_llmModelId", requirementsFallback: true };
    }
  }
  if (useDefaultModel && skillDefaultModel) {
    const check = resolveEnabledLlmModelIdFromRows({
      rows,
      preferredModelIds: [skillDefaultModel],
    });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "skill_defaultModel", requirementsFallback: true };
    }
  }
  if (useConvModel && convModel) {
    const check = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: [convModel] });
    if (check === modelId) {
      return { ...base, modelId, modelSource: "conversation", requirementsFallback: true };
    }
  }

  return { ...base, modelId, modelSource: "system_default", requirementsFallback: true };
}
