import type { VdEpisodeMemory, VdOpenThread } from "./seriesMemoryState";

export const VD_THREAD_CLOSURE_INTENTS = [
  "payoff_required",
  "background_close_ok",
  "intentional_open",
  "surprise_payoff",
] as const;
export type VdThreadClosureIntent = (typeof VD_THREAD_CLOSURE_INTENTS)[number];

export const VD_THREAD_CLOSURE_DISPOSITIONS = [
  "explicit_payoff",
  "implicit_payoff",
  "expected_continuation",
  "intentional_open",
  "surprise_payoff",
  "needs_repair",
] as const;
export type VdThreadClosureDisposition =
  (typeof VD_THREAD_CLOSURE_DISPOSITIONS)[number];

export type VdThreadClosureAnnotation = {
  threadId: string;
  disposition: VdThreadClosureDisposition;
  evidenceEpisodeNumbers: number[];
  rationale: string;
  confidence?: "high" | "medium" | "low";
};

export type VdThreadClosureAssessment = {
  threadId: string;
  description: string;
  disposition: VdThreadClosureDisposition;
  confidence: "high" | "medium" | "low";
  evidenceEpisodeNumbers: number[];
  rationale: string;
  recommendedAction: "none" | "review" | "repair";
  severity: "info" | "warning" | "blocking";
};

function latestThreadMap(
  episodes: VdEpisodeMemory[]
): Map<string, VdOpenThread> {
  const map = new Map<string, VdOpenThread>();
  for (const episode of [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  )) {
    for (const thread of episode.threadsOpened ?? []) {
      if (thread.threadId.trim())
        map.set(thread.threadId.trim(), { ...thread });
    }
  }
  return map;
}

function findAnnotation(
  episodes: VdEpisodeMemory[],
  threadId: string
): VdThreadClosureAnnotation | undefined {
  for (const episode of [...episodes].sort(
    (a, b) => b.episodeNumber - a.episodeNumber
  )) {
    const annotation = episode.threadClosures?.find(
      item => item.threadId === threadId
    );
    if (annotation) return annotation;
  }
  return undefined;
}

export function assessThreadClosures(params: {
  episodes: VdEpisodeMemory[];
  horizonEpisode: number;
  seasonComplete?: boolean;
}): VdThreadClosureAssessment[] {
  const episodes = Array.isArray(params.episodes) ? params.episodes : [];
  const threads = latestThreadMap(episodes);
  const resolvedAt = new Map<string, number[]>();
  for (const episode of episodes) {
    for (const rawId of episode.threadsResolved ?? []) {
      const threadId = rawId.trim();
      if (!threadId) continue;
      resolvedAt.set(threadId, [
        ...(resolvedAt.get(threadId) ?? []),
        episode.episodeNumber,
      ]);
    }
  }

  return [...threads.values()]
    .sort(
      (a, b) =>
        a.openedEpisode - b.openedEpisode ||
        a.threadId.localeCompare(b.threadId)
    )
    .map(thread => {
      const evidence = resolvedAt.get(thread.threadId) ?? [];
      const annotation = findAnnotation(episodes, thread.threadId);
      if (annotation) {
        const blocking = annotation.disposition === "needs_repair";
        return {
          threadId: thread.threadId,
          description: thread.description,
          disposition: annotation.disposition,
          confidence: annotation.confidence ?? "medium",
          evidenceEpisodeNumbers: annotation.evidenceEpisodeNumbers,
          rationale: annotation.rationale,
          recommendedAction: blocking ? "repair" : "none",
          severity: blocking ? "blocking" : "info",
        };
      }
      if (evidence.length > 0) {
        return {
          threadId: thread.threadId,
          description: thread.description,
          disposition: "explicit_payoff" as const,
          confidence: "high" as const,
          evidenceEpisodeNumbers: evidence,
          rationale:
            "The exact thread ID is marked resolved in episode memory.",
          recommendedAction: "none" as const,
          severity: "info" as const,
        };
      }
      if (
        thread.closureIntent === "intentional_open" ||
        thread.closureIntent === "surprise_payoff"
      ) {
        const disposition = thread.closureIntent;
        return {
          threadId: thread.threadId,
          description: thread.description,
          disposition,
          confidence: "high" as const,
          evidenceEpisodeNumbers: [],
          rationale:
            disposition === "intentional_open"
              ? "The author explicitly chose an open ending for audience interpretation."
              : "The author reserved this thread for a later surprise reveal.",
          recommendedAction: "none" as const,
          severity: "info" as const,
        };
      }
      if (
        thread.expectedResolutionEpisode != null &&
        thread.expectedResolutionEpisode > params.horizonEpisode
      ) {
        return {
          threadId: thread.threadId,
          description: thread.description,
          disposition: "expected_continuation" as const,
          confidence: "high" as const,
          evidenceEpisodeNumbers: [],
          rationale: `The planned payoff is episode ${thread.expectedResolutionEpisode}, beyond the current horizon.`,
          recommendedAction: "none" as const,
          severity: "info" as const,
        };
      }
      if (!params.seasonComplete && thread.expectedResolution !== "season") {
        return {
          threadId: thread.threadId,
          description: thread.description,
          disposition: "expected_continuation" as const,
          confidence: "medium" as const,
          evidenceEpisodeNumbers: [],
          rationale:
            "The current draft horizon is not the season end, so this is not yet a defect.",
          recommendedAction: "review" as const,
          severity: "warning" as const,
        };
      }
      return {
        threadId: thread.threadId,
        description: thread.description,
        disposition: "needs_repair" as const,
        confidence: "high" as const,
        evidenceEpisodeNumbers: [],
        rationale:
          "A required thread reached the completed horizon without a resolution or intentional disposition.",
        recommendedAction: "repair" as const,
        severity: "blocking" as const,
      };
    });
}
