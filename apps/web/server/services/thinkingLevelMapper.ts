/**
 * Thinking Level Mapper — Spec 038 Section 04
 *
 * Maps task complexity and skill thinking_level_hint to provider-specific
 * thinking/reasoning parameters.
 */

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
export type ProviderFamily = "openai" | "gemini" | "anthropic" | "kimi" | "other";
export type TaskComplexity = "simple" | "moderate" | "complex";

const COMPLEXITY_TO_THINKING: Record<TaskComplexity, ThinkingLevel> = {
  simple: "low",
  moderate: "medium",
  complex: "high",
};

/**
 * Map a thinking level to provider-specific parameters.
 * Returns an empty object for unknown providers or "other".
 */
export function mapThinkingLevel(
  level: ThinkingLevel,
  provider: ProviderFamily
): Record<string, unknown> {
  switch (provider) {
    case "openai":
      return mapOpenAI(level);
    case "gemini":
      return mapGemini(level);
    case "anthropic":
      return mapAnthropic(level);
    case "kimi":
      return mapKimi(level);
    default:
      return {};
  }
}

function mapOpenAI(level: ThinkingLevel): Record<string, unknown> {
  const effortMap: Record<ThinkingLevel, string> = {
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "high",
  };
  return { reasoning: { effort: effortMap[level] } };
}

function mapGemini(level: ThinkingLevel): Record<string, unknown> {
  return { thinking_level: level };
}

function mapAnthropic(level: ThinkingLevel): Record<string, unknown> {
  const budgetMap: Record<ThinkingLevel, number> = {
    minimal: 512,
    low: 1024,
    medium: 4096,
    high: 16384,
  };
  return {
    thinking: { type: "adaptive", budget_tokens: budgetMap[level] },
  };
}

function mapKimi(level: ThinkingLevel): Record<string, unknown> {
  // Kimi: minimal/low = instant mode (no param), medium/high = default (no param)
  return {};
}

/**
 * Resolve the final thinking level from skill hint and task complexity.
 * Skill hint takes priority over complexity-based inference.
 * Default: "medium".
 */
export function resolveThinkingLevel(
  skillHint?: ThinkingLevel,
  taskComplexity?: TaskComplexity
): ThinkingLevel {
  if (skillHint) return skillHint;
  if (taskComplexity) return COMPLEXITY_TO_THINKING[taskComplexity];
  return "medium";
}
