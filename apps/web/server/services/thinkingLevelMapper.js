"use strict";
/**
 * Thinking Level Mapper — Spec 038 Section 04
 *
 * Maps task complexity and skill thinking_level_hint to provider-specific
 * thinking/reasoning parameters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapThinkingLevel = mapThinkingLevel;
exports.resolveThinkingLevel = resolveThinkingLevel;
var COMPLEXITY_TO_THINKING = {
    simple: "low",
    moderate: "medium",
    complex: "high",
};
/**
 * Map a thinking level to provider-specific parameters.
 * Returns an empty object for unknown providers or "other".
 */
function mapThinkingLevel(level, provider) {
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
function mapOpenAI(level) {
    var effortMap = {
        minimal: "low",
        low: "low",
        medium: "medium",
        high: "high",
    };
    return { reasoning: { effort: effortMap[level] } };
}
function mapGemini(level) {
    return { thinking_level: level };
}
function mapAnthropic(level) {
    var budgetMap = {
        minimal: 512,
        low: 1024,
        medium: 4096,
        high: 16384,
    };
    return {
        thinking: { type: "adaptive", budget_tokens: budgetMap[level] },
    };
}
function mapKimi(level) {
    // Kimi: minimal/low = instant mode (no param), medium/high = default (no param)
    return {};
}
/**
 * Resolve the final thinking level from skill hint and task complexity.
 * Skill hint takes priority over complexity-based inference.
 * Default: "medium".
 */
function resolveThinkingLevel(skillHint, taskComplexity) {
    if (skillHint)
        return skillHint;
    if (taskComplexity)
        return COMPLEXITY_TO_THINKING[taskComplexity];
    return "medium";
}
