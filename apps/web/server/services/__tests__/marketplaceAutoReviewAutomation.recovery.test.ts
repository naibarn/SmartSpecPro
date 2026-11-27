import { describe, expect, it } from "vitest";

import {
  missingApprovedVideoPromptShots,
  canAutoResumeContinuation,
  nextAutomaticRecoveryAttempt,
} from "../marketplaceAutoReviewAutomation";

describe("missingApprovedVideoPromptShots", () => {
  it("returns only approved-image shots whose video prompt checkpoint is missing or stale", () => {
    const shots = [
      { shotId: 1, imageArtifactHash: "image-1", imageArtifactUrl: "/1.png" },
      { shotId: 2, imageArtifactHash: "image-2", imageArtifactUrl: "/2.png" },
      { shotId: 3, imageArtifactHash: "image-3", imageArtifactUrl: "/3.png" },
      { shotId: 4, imageArtifactHash: "", imageArtifactUrl: "" },
    ];
    const checkpoints = [
      { kind: "image_result", shotId: 1, state: "approved", contentHash: "image-1" },
      { kind: "video_prompt", shotId: 1, state: "approved", contentHash: "video-1" },
      { kind: "image_result", shotId: 2, state: "approved", contentHash: "image-2" },
      { kind: "video_prompt", shotId: 2, state: "approved", contentHash: "previous-video" },
      { kind: "image_result", shotId: 3, state: "approved", contentHash: "image-3" },
    ];

    expect(
      missingApprovedVideoPromptShots(
        shots.map((shot, index) => ({
          ...shot,
          ...(index === 0 ? { videoPrompt: "ready", videoPromptHash: "video-1" } : {}),
          ...(index === 1 ? { videoPrompt: "stale", videoPromptHash: "stale-video" } : {}),
        })),
        checkpoints
      ).map(shot => shot.shotId)
    ).toEqual([2, 3]);
  });
});

describe("nextAutomaticRecoveryAttempt", () => {
  it("allows at most two replacement jobs after the initial worker job", () => {
    expect(nextAutomaticRecoveryAttempt(0)).toBe(1);
    expect(nextAutomaticRecoveryAttempt(1)).toBe(2);
    expect(nextAutomaticRecoveryAttempt(2)).toBeNull();
    expect(nextAutomaticRecoveryAttempt(-1)).toBe(1);
  });
});

describe("canAutoResumeContinuation", () => {
  it("resumes one paused automatic-step failure but leaves other and exhausted failures paused", () => {
    expect(
      canAutoResumeContinuation({
        status: "paused_error",
        errorCode: "automatic_step_failed",
        workerJobIds: { automaticRecoveryAttempts: 0 },
      })
    ).toBe(true);
    expect(
      canAutoResumeContinuation({
        status: "paused_error",
        errorCode: "automatic_step_failed",
        workerJobIds: { automaticRecoveryAttempts: 1 },
      })
    ).toBe(false);
    expect(
      canAutoResumeContinuation({
        status: "paused_error",
        errorCode: "speaker_matching_failed",
        workerJobIds: { automaticRecoveryAttempts: 0 },
      })
    ).toBe(false);
  });
});
