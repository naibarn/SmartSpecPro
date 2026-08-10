import { describe, expect, it } from "vitest";
import { shouldResumeStartFramePoll } from "../VerticalDramaEpisodePage";

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
