"use strict";
/**
 * Artifact Router
 *
 * Routes task execution to the appropriate artifact path:
 *   - direct_completion: model generates the artifact directly
 *   - deterministic_pipeline: structured pipeline (e.g., AI draft → layout → media)
 *
 * Decision is captured as `routeReason` for telemetry and audit.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyArtifactIntent = classifyArtifactIntent;
exports.selectExecutionRoute = selectExecutionRoute;
// ── Skill slug patterns for intent classification ────────────────────
var PRESENTATION_PATTERNS = ["presentation", "slide", "deck"];
var REPORT_PATTERNS = ["report", "research", "analysis", "summary"];
var MEDIA_SOURCE_TYPES = new Set(["media_image", "media_video", "media_audio"]);
// ── Intent classification ────────────────────────────────────────────
function classifyArtifactIntent(input) {
    if (input.intentOverride)
        return input.intentOverride;
    if (MEDIA_SOURCE_TYPES.has(input.sourceType))
        return "media_prompt";
    if (input.skillSlug) {
        var slug_1 = input.skillSlug.toLowerCase();
        if (PRESENTATION_PATTERNS.some(function (p) { return slug_1.includes(p); }))
            return "presentation_deck";
        if (REPORT_PATTERNS.some(function (p) { return slug_1.includes(p); }))
            return "research_report";
    }
    return "chat_reply";
}
// ── Route selection ──────────────────────────────────────────────────
function selectExecutionRoute(input) {
    var artifactIntent = input.artifactIntent, complexity = input.complexity, modelSupportsStructuredOutput = input.modelSupportsStructuredOutput;
    // Presentations: prefer deterministic pipeline for fidelity
    if (artifactIntent === "presentation_deck") {
        if (complexity === "simple" && modelSupportsStructuredOutput) {
            return {
                route: "direct_completion",
                routeReason: "simple presentation with structured-output-capable model",
            };
        }
        return {
            route: "deterministic_pipeline",
            routeReason: "presentation (".concat(complexity, ") routed to deterministic pipeline for layout/media fidelity"),
        };
    }
    // Reports: direct completion (models handle text well)
    if (artifactIntent === "research_report") {
        return {
            route: "direct_completion",
            routeReason: "research report routed to direct completion (text-oriented)",
        };
    }
    // Everything else: direct completion
    return {
        route: "direct_completion",
        routeReason: "".concat(artifactIntent, " (").concat(complexity, ") routed to direct completion"),
    };
}
