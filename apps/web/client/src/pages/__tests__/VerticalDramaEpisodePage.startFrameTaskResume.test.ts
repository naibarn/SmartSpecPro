import { describe, expect, it } from "vitest";
import {
  shouldAutoRepairFrameSync,
  shouldRefetchEpisodeDetailForPendingFrameTasks,
  shouldResumeStartFramePoll,
} from "../VerticalDramaEpisodePage";

describe("shouldResumeStartFramePoll", () => {
  it("resumes a submitted image task after reload", () => {
    expect(
      shouldResumeStartFramePoll(
        { pendingTaskId: "kie-task-1", status: "submitted" },
        7,
        new Set(),
        new Set()
      )
    ).toBe(true);
  });

  it("auto-repairs a submitted task when the browser missed the completion callback", () => {
    expect(
      shouldAutoRepairFrameSync(
        { pendingTaskId: "kie-task-1", status: "submitted" },
        undefined
      )
    ).toBe(true);
  });

  it("keeps the episode detail query alive while a frame task is pending", () => {
    expect(
      shouldRefetchEpisodeDetailForPendingFrameTasks({
        frames: [{ shotNumber: 8, imageTask: { pendingTaskId: "task-1" } }],
      })
    ).toBe(true);
    expect(
      shouldRefetchEpisodeDetailForPendingFrameTasks({
        frames: [{ shotNumber: 8, approvedMediaAssetId: "7024" }],
      })
    ).toBe(false);
  });

  it("does not resume a frame without a durable pending task", () => {
    expect(shouldResumeStartFramePoll(undefined, 7, new Set(), new Set())).toBe(
      false
    );
    expect(
      shouldResumeStartFramePoll(
        { status: "failed" },
        7,
        new Set(),
        new Set()
      )
    ).toBe(false);
  });

  it("does not start duplicate polling for the same shot", () => {
    expect(
      shouldResumeStartFramePoll(
        { pendingTaskId: "kie-task-1" },
        7,
        new Set([7]),
        new Set()
      )
    ).toBe(false);
    expect(
      shouldResumeStartFramePoll(
        { pendingTaskId: "kie-task-1" },
        7,
        new Set(),
        new Set([7])
      )
    ).toBe(false);
  });
});
