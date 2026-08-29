import type { VerticalDramaInteractiveJobPayload } from "./verticalDramaInteractiveJobs";

/**
 * Worker-only dispatcher.  Domain routers expose worker functions, but the
 * browser-facing procedures never call this module. Keeping the dispatch
 * lazy avoids importing all Drama Series router graphs during normal queue
 * setup and makes the worker boundary explicit in code review.
 */
export async function runVerticalDramaInteractiveJobExecutor(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  switch (payload.kind) {
    case "prompt_expansion": {
      const { runPromptExpansionInteractiveJob } =
        await import("../routers/verticalDramaSeries");
      return runPromptExpansionInteractiveJob(payload, execution);
    }
    case "preset_synthesis": {
      const { runPresetSynthesisInteractiveJob } =
        await import("../routers/verticalDramaSeries");
      return runPresetSynthesisInteractiveJob(payload, execution);
    }
    case "lineage_carry_over": {
      const { runSeasonCarryOverInteractiveJob } =
        await import("../routers/verticalDramaSeries");
      return runSeasonCarryOverInteractiveJob(payload, execution);
    }
    case "special_edition_brief": {
      const { runSpecialEditionBriefInteractiveJob } =
        await import("../routers/verticalDramaSeries");
      return runSpecialEditionBriefInteractiveJob(payload, execution);
    }
    case "source_analysis": {
      const { runQueuedSourceAnalysis } =
        await import("./verticalDramaSourceIngestionService");
      return runQueuedSourceAnalysis(payload);
    }
    case "location_detection": {
      const { runLocationDetectionInteractiveJob } =
        await import("../routers/verticalDramaLocations");
      return runLocationDetectionInteractiveJob(payload, execution);
    }
    case "character_variants":
    case "character_duplicates": {
      const { runCharacterAnalysisInteractiveJob } =
        await import("../routers/verticalDramaCharacters");
      return runCharacterAnalysisInteractiveJob(payload, execution);
    }
    case "reference_frame_prompt": {
      const { runReferenceFramePromptInteractiveJob } =
        await import("../routers/verticalDramaEpisodes");
      return runReferenceFramePromptInteractiveJob(payload, execution);
    }
    case "special_tie_in_prompt": {
      const { runSpecialTieInPromptJob } =
        await import("./verticalDramaSpecialEpisodes");
      return runSpecialTieInPromptJob(payload, execution);
    }
    default: {
      const exhaustive: never = payload.kind;
      throw new Error(
        `Unsupported Vertical Drama interactive job: ${exhaustive}`
      );
    }
  }
}
