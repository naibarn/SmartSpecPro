/**
 * Artifact Router
 *
 * Routes task execution to the appropriate artifact path:
 *   - direct_completion: model generates the artifact directly
 *   - deterministic_pipeline: structured pipeline (e.g., AI draft → layout → media)
 *
 * Decision is captured as `routeReason` for telemetry and audit.
 */

import type { TaskComplexity } from "./taskExecutionPlanner";

// ── Types ────────────────────────────────────────────────────────────

export type ArtifactIntent =
  | "chat_reply"
  | "research_report"
  | "presentation_deck"
  | "media_prompt";

export type ExecutionRoute = "direct_completion" | "deterministic_pipeline";

export interface ArtifactRoutingInput {
  artifactIntent: ArtifactIntent;
  complexity: TaskComplexity;
  modelSupportsStructuredOutput?: boolean;
}

export interface ArtifactRoute {
  route: ExecutionRoute;
  routeReason: string;
}

export interface ArtifactIntentInput {
  sourceType: string;
  skillSlug?: string;
  intentOverride?: ArtifactIntent;
}

// ── Skill slug patterns for intent classification ────────────────────

const PRESENTATION_PATTERNS = ["presentation", "slide", "deck"];
const REPORT_PATTERNS = ["report", "research", "analysis", "summary"];
const MEDIA_SOURCE_TYPES = new Set(["media_image", "media_video", "media_audio"]);

// ── Intent classification ────────────────────────────────────────────

export function classifyArtifactIntent(input: ArtifactIntentInput): ArtifactIntent {
  if (input.intentOverride) return input.intentOverride;

  if (MEDIA_SOURCE_TYPES.has(input.sourceType)) return "media_prompt";

  if (input.skillSlug) {
    const slug = input.skillSlug.toLowerCase();
    if (PRESENTATION_PATTERNS.some((p) => slug.includes(p))) return "presentation_deck";
    if (REPORT_PATTERNS.some((p) => slug.includes(p))) return "research_report";
  }

  return "chat_reply";
}

// ── Route selection ──────────────────────────────────────────────────

export function selectExecutionRoute(input: ArtifactRoutingInput): ArtifactRoute {
  const { artifactIntent, complexity, modelSupportsStructuredOutput } = input;

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
      routeReason: `presentation (${complexity}) routed to deterministic pipeline for layout/media fidelity`,
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
    routeReason: `${artifactIntent} (${complexity}) routed to direct completion`,
  };
}
