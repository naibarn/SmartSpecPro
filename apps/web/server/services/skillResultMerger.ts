/**
 * Skill Result Merger — combines multi-skill outputs into unified result.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 08).
 */

import type {
  OrchestrationResult,
  OrchestrationLevel,
  OrchestrationResultSection,
} from "@shared/orchestration/types";

export interface SkillStepResult {
  skillId: string;
  type: "text" | "image" | "video" | "audio" | "error";
  content?: string;
  urls?: string[];
  metadata?: Record<string, unknown>;
  creditsUsed: number;
  durationMs: number;
}

function classifyOutputTypes(results: SkillStepResult[]) {
  const textResults = results.filter((r) => r.type === "text" && r.content);
  const mediaResults = results.filter((r) => r.type !== "text" && r.type !== "error");
  return {
    hasText: textResults.length > 0,
    hasImages: results.some((r) => r.type === "image"),
    hasVideo: results.some((r) => r.type === "video"),
    hasAudio: results.some((r) => r.type === "audio"),
    textResults,
    mediaResults,
  };
}

export async function mergeResults(
  results: SkillStepResult[],
  originalMessage: string,
  options?: {
    traceId?: string;
    orchestrationLevel?: OrchestrationLevel;
    classificationLatencyMs?: number;
  },
): Promise<OrchestrationResult> {
  if (results.length === 0) {
    return {
      sections: [],
      totalCreditsUsed: 0,
      totalDurationMs: 0,
      traceId: options?.traceId ?? "",
      orchestrationLevel: options?.orchestrationLevel ?? "simple",
      classificationLatencyMs: options?.classificationLatencyMs ?? 0,
    };
  }

  const sections: OrchestrationResultSection[] = results.map((r) => ({
    skillId: r.skillId,
    type: r.type,
    content: r.content,
    urls: r.urls,
    metadata: {
      creditsUsed: r.creditsUsed,
      durationMs: r.durationMs,
    },
  }));

  const totalCreditsUsed = results.reduce((sum, r) => sum + r.creditsUsed, 0);
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Single result — pass through
  if (results.length === 1) {
    return {
      sections,
      summary: results[0].content,
      totalCreditsUsed,
      totalDurationMs,
      traceId: options?.traceId ?? "",
      orchestrationLevel: options?.orchestrationLevel ?? "simple",
      classificationLatencyMs: options?.classificationLatencyMs ?? 0,
    };
  }

  // Multiple results — build summary based on types
  const { textResults, hasImages, hasVideo } = classifyOutputTypes(results);
  let summary: string | undefined;

  if (textResults.length > 0) {
    // Combine text portions with separators (LLM merging deferred for now)
    summary = textResults.map((r) => r.content).join("\n\n---\n\n");
  } else if (hasImages) {
    const totalUrls = results.reduce((n, r) => n + (r.urls?.length ?? 0), 0);
    summary = `Generated ${totalUrls} images.`;
  }

  return {
    sections,
    summary,
    totalCreditsUsed,
    totalDurationMs,
    traceId: options?.traceId ?? "",
    orchestrationLevel: options?.orchestrationLevel ?? "compound",
    classificationLatencyMs: options?.classificationLatencyMs ?? 0,
  };
}
