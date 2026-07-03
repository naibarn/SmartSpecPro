import { describe, expect, it } from "vitest";
import {
  isVerticalDramaStoryboardReview,
  normalizeVerticalDramaStoryboardReviewMetadata,
  VERTICAL_DRAMA_REVIEW_SOURCE,
} from "./verticalDramaStoryboardReviewMetadata";

/** Minimal VD extraParams stamped onto a Storyboard Review task by the handoff. */
function vdExtraParams(overrides: Record<string, unknown> = {}) {
  return {
    source: VERTICAL_DRAMA_REVIEW_SOURCE,
    seriesId: "series-1",
    episodeId: "episode-7",
    episodeNumber: 7,
    shotNumber: 3,
    motionMode: "first_last_frame_bridge",
    characterReferenceAssetIds: ["char-a"],
    contactSheetIds: ["cs-1"],
    candidateFrameAssetIds: ["cand-1", "cand-2"],
    selectedStartFrameCandidateId: "cand-1",
    promptSetId: "pset-9",
    referenceFrameRoles: ["start", "stop"],
    continuityWarnings: ["watch the jacket color"],
    ...overrides,
  };
}

describe("normalizeVerticalDramaStoryboardReviewMetadata", () => {
  it("detects a vertical-drama source via task generationExtraParams", () => {
    const input = {
      reviewData: { seriesTitle: "My Drama" },
      tasks: [
        {
          id: "task-1",
          prompt: "dolly in on hero",
          durationSeconds: 4,
          status: "completed",
          generationExtraParams: vdExtraParams(),
        },
      ],
    };

    expect(isVerticalDramaStoryboardReview(input)).toBe(true);

    const metadata = normalizeVerticalDramaStoryboardReviewMetadata(input);
    expect(metadata).not.toBeNull();
    expect(metadata!.source).toBe(VERTICAL_DRAMA_REVIEW_SOURCE);
  });

  it("extracts episode identity, motion mode, lineage, and per-task fields", () => {
    const metadata = normalizeVerticalDramaStoryboardReviewMetadata({
      reviewData: {
        seriesTitle: "My Drama",
        audioStrategy: "native_dialogue",
        voiceCasting: { hero: "voice-42" },
        subtitleSafeArea: { bottomPct: 12 },
        imagePromptsByShot: [
          {
            shotNumber: 3,
            contactSheetPrompt: "9-cell contact sheet",
            cellPrompts: ["cell 1", "cell 2"],
            negativePrompt: "no text",
          },
        ],
        subShots: [
          {
            parentShotNumber: 3,
            subShotNumber: 1,
            durationSeconds: 2,
            transitionIn: "match_cut",
            cameraSetup: "wide",
            prompt: "establishing",
          },
          {
            parentShotNumber: 3,
            subShotNumber: 2,
            durationSeconds: 2,
            transitionIn: "cut",
            prompt: "close up",
          },
        ],
        qcRecommendedRepairs: [
          { action: "regenerate_frame", instruction: "hand artifact", shotNumber: 3 },
        ],
      },
      tasks: [
        {
          id: "task-1",
          prompt: "dolly in on hero",
          durationSeconds: 4,
          status: "completed",
          storyboardContext: {
            referenceImages: [{ url: "https://cdn/x/start.png" }, { url: "https://cdn/x/stop.png" }],
          },
          generationExtraParams: {
            ...vdExtraParams(),
            videoSegmentPromptStale: true,
            videoSegmentStaleReason: "prompt edited",
          },
          promptEditHistory: [{ editedByUserId: 5, editedAt: 111, original: "old prompt" }],
        },
      ],
    });

    expect(metadata).not.toBeNull();
    const m = metadata!;

    // Episode identity + motion mode.
    expect(m.seriesId).toBe("series-1");
    expect(m.episodeId).toBe("episode-7");
    expect(m.episodeNumber).toBe(7);
    expect(m.motionMode).toBe("first_last_frame_bridge");
    expect(m.seriesTitle).toBe("My Drama");
    expect(m.backlink).toEqual({ seriesId: "series-1", episodeId: "episode-7", episodeNumber: 7 });

    // Episode summary fields.
    expect(m.audioStrategy).toBe("native_dialogue");
    expect(m.voiceCasting).toEqual({ hero: "voice-42" });
    expect(m.subtitleSafeArea).toEqual({ bottomPct: 12 });
    expect(m.continuityWarnings).toContain("watch the jacket color");

    // Image lineage merges extraParams IDs with reviewData prompt text.
    expect(m.imagePromptsByShot).toHaveLength(1);
    const lineage = m.imagePromptsByShot[0];
    expect(lineage.shotNumber).toBe(3);
    expect(lineage.contactSheetPrompt).toBe("9-cell contact sheet");
    expect(lineage.cellPrompts).toEqual(["cell 1", "cell 2"]);
    expect(lineage.negativePrompt).toBe("no text");
    expect(lineage.contactSheetIds).toEqual(["cs-1"]);
    expect(lineage.candidateFrameAssetIds).toEqual(["cand-1", "cand-2"]);
    expect(lineage.selectedStartFrameCandidateId).toBe("cand-1");
    expect(lineage.promptSetId).toBe("pset-9");

    // Sub-shot breakdown grouped by parent shot.
    expect(m.subShotBreakdownByShot).toHaveLength(1);
    expect(m.subShotBreakdownByShot[0].parentShotNumber).toBe(3);
    expect(m.subShotBreakdownByShot[0].subShotCount).toBe(2);
    expect(m.subShotBreakdownByShot[0].subShots[0].transitionIn).toBe("match_cut");

    // Repair queue.
    expect(m.qcRecommendedRepairs).toEqual([
      { action: "regenerate_frame", instruction: "hand artifact", shotNumber: 3, clipNumber: undefined, artifactId: undefined },
    ]);

    // Per-task normalization: reference frames, stale state, prompt history.
    expect(m.tasks).toHaveLength(1);
    const task = m.tasks[0];
    expect(task.id).toBe("task-1");
    expect(task.status).toBe("completed");
    expect(task.storyboardContext.referenceFrameRoles).toEqual(["start", "stop"]);
    expect(task.storyboardContext.referenceImages).toHaveLength(2);
    expect(task.storyboardContext.referenceImages[0].role).toBe("start");
    expect(task.videoSegmentState?.staleTaskIds).toEqual(["task-1"]);
    expect(task.videoSegmentState?.staleReason).toBe("prompt edited");
    expect(task.extraParams.source).toBe(VERTICAL_DRAMA_REVIEW_SOURCE);
    expect(task.extraParams.shotNumber).toBe(3);
    expect(task.promptEditHistory).toEqual([{ editedByUserId: 5, editedAt: 111, original: "old prompt" }]);
  });

  it("detects VD via storyboardContext.extraParams shape too", () => {
    const metadata = normalizeVerticalDramaStoryboardReviewMetadata({
      tasks: [
        {
          id: "task-9",
          prompt: "pan",
          status: "queued",
          storyboardContext: { extraParams: vdExtraParams({ shotNumber: 1 }) },
        },
      ],
    });
    expect(metadata).not.toBeNull();
    expect(metadata!.tasks[0].extraParams.shotNumber).toBe(1);
  });

  it("returns null for a non-vertical-drama (article) review", () => {
    const input = {
      reviewData: { audioStrategy: "external_audio_workflow" },
      tasks: [
        {
          id: "article-1",
          prompt: "slide 1",
          status: "completed",
          generationExtraParams: { source: "article_storyboard", shotNumber: 1 },
        },
      ],
    };
    expect(isVerticalDramaStoryboardReview(input)).toBe(false);
    expect(normalizeVerticalDramaStoryboardReviewMetadata(input)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizeVerticalDramaStoryboardReviewMetadata({})).toBeNull();
    expect(normalizeVerticalDramaStoryboardReviewMetadata({ tasks: [] })).toBeNull();
  });
});
