import { describe, expect, it } from "vitest";

import {
  missingApprovedVideoPromptShots,
  canAutoResumeContinuation,
  nextAutomaticRecoveryAttempt,
  getCompletedContinuationRecoveryStage,
  canRebaseCompletedContinuationPlan,
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
      {
        kind: "image_result",
        shotId: 1,
        state: "approved",
        contentHash: "image-1",
      },
      {
        kind: "video_prompt",
        shotId: 1,
        state: "approved",
        contentHash: "video-1",
      },
      {
        kind: "image_result",
        shotId: 2,
        state: "approved",
        contentHash: "image-2",
      },
      {
        kind: "video_prompt",
        shotId: 2,
        state: "approved",
        contentHash: "previous-video",
      },
      {
        kind: "image_result",
        shotId: 3,
        state: "approved",
        contentHash: "image-3",
      },
    ];

    expect(
      missingApprovedVideoPromptShots(
        shots.map((shot, index) => ({
          ...shot,
          ...(index === 0
            ? { videoPrompt: "ready", videoPromptHash: "video-1" }
            : {}),
          ...(index === 1
            ? { videoPrompt: "stale", videoPromptHash: "stale-video" }
            : {}),
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

describe("completed continuation recovery", () => {
  it("reopens at speaker matching before repairing missing video prompts", () => {
    const shots = [
      {
        shotId: 1,
        dialogue: "เวลาสระผมให้เด็ก",
        imageArtifactHash: "image-1",
        imageArtifactUrl: "/1.png",
      },
    ];
    const checkpoints = [
      {
        kind: "image_result",
        shotId: 1,
        state: "approved",
        contentHash: "image-1",
      },
    ];

    expect(
      getCompletedContinuationRecoveryStage({
        shots,
        checkpoints,
        cast: [
          { castId: "lead", name: "ธีร์", role: "lead", depictsMinor: false },
          {
            castId: "child",
            name: "ภูมิ",
            role: "supporting",
            depictsMinor: true,
          },
        ],
      })
    ).toBe("speaker_matching");
  });

  it("does not reopen completed work when every approved image has a valid video prompt", () => {
    expect(
      getCompletedContinuationRecoveryStage({
        shots: [
          {
            shotId: 1,
            dialogue: "ธีร์: สวัสดี",
            imageArtifactHash: "image-1",
            imageArtifactUrl: "/1.png",
            speakerVisualBindings: { ธีร์: "person-1" },
            speakerVisualBindingsImageHash: "image-1",
            videoPrompt: "move",
            videoPromptHash: "video-1",
          },
        ],
        checkpoints: [
          {
            kind: "image_result",
            shotId: 1,
            state: "approved",
            contentHash: "image-1",
          },
          {
            kind: "video_prompt",
            shotId: 1,
            state: "approved",
            contentHash: "video-1",
          },
        ],
        cast: [
          { castId: "lead", name: "ธีร์", role: "lead", depictsMinor: false },
        ],
      })
    ).toBeNull();
  });
});

describe("completed continuation plan recovery", () => {
  it("allows one rebase only after the completed run was reopened and images are approved", () => {
    expect(
      canRebaseCompletedContinuationPlan({
        completedRecoveryAttempts: 1,
        planMismatchRecoveryAttempts: 0,
        allImagesApproved: true,
      })
    ).toBe(true);
    expect(
      canRebaseCompletedContinuationPlan({
        completedRecoveryAttempts: 0,
        planMismatchRecoveryAttempts: 0,
        allImagesApproved: true,
      })
    ).toBe(false);
    expect(
      canRebaseCompletedContinuationPlan({
        completedRecoveryAttempts: 1,
        planMismatchRecoveryAttempts: 1,
        allImagesApproved: true,
      })
    ).toBe(false);
    expect(
      canRebaseCompletedContinuationPlan({
        completedRecoveryAttempts: 1,
        planMismatchRecoveryAttempts: 0,
        allImagesApproved: false,
      })
    ).toBe(false);
  });
});
