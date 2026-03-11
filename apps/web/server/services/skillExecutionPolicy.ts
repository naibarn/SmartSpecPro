/**
 * Skill Execution Policy Resolution
 *
 * Resolves the effective model and provider routing for skill invocations.
 * Skill policy takes priority over conversation model — the conversation model
 * is only used as a fallback when the skill has no configured model.
 *
 * This is the compatibility bridge between legacy skill fields (defaultModel,
 * llmModelId, preferredProviderId) and future capability-first execution policy.
 */

import type { SkillDefinition } from "@smartspec/skills";
import { resolveEnabledLlmModelIdFromRows, loadEnabledLlmModelRows } from "./enabledLlmModels";

export interface SkillExecutionPolicyInput {
  /** The skill being invoked */
  skill: SkillDefinition;
  /** The conversation's currently selected model (user's active choice) */
  conversationModel?: string | null;
}

export interface SkillExecutionPolicyResult {
  /** The resolved LLM model ID to use */
  modelId: string | null;
  /** Optional pinned provider ID from skill configuration */
  preferredProviderId?: number;
  /** Whether to enforce the pinned provider with no fallback */
  strictProviderPin?: boolean;
  /** Source of the resolved model for auditing */
  modelSource: "skill_llmModelId" | "skill_defaultModel" | "conversation" | "system_default";
}

/**
 * Resolve the effective execution policy for a skill invocation.
 *
 * Priority order:
 *   1. skill.llmModelId (explicit skill model configuration)
 *   2. skill.defaultModel (skill-level default)
 *   3. conversationModel (user's active conversation choice — fallback only)
 *   4. system default (from enabled models)
 *
 * Provider pin fields (preferredProviderId, strictProviderPin) are always
 * propagated from the skill definition when present.
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

  // Build priority array: skill policy first, conversation model as fallback
  const preferredIds = [skillLlmModelId, skillDefaultModel, convModel];
  const modelId = resolveEnabledLlmModelIdFromRows({ rows, preferredModelIds: preferredIds });

  if (!modelId) {
    return { ...base, modelId: null, modelSource: "system_default" };
  }

  // Determine source by checking each candidate in priority order (in-memory, no DB)
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
