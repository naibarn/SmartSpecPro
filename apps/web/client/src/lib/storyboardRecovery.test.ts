import { describe, expect, it } from "vitest";
import {
  filterRecoverableStoryboardRuns,
  isRecoverableStoryboardRun,
} from "./storyboardRecovery";

describe("storyboard recovery projection", () => {
  it("does not offer cancelled storyboard runs for repair", () => {
    expect(
      isRecoverableStoryboardRun({
        status: "cancelled",
        job: { status: "queued" },
      })
    ).toBe(false);
  });

  it("does not resurrect a stale domain row when its canonical job is terminal", () => {
    expect(
      filterRecoverableStoryboardRuns([
        { status: "running", job: { status: "cancelled" } },
        { status: "running", job: { status: "expired" } },
        { status: "partial", job: { status: "failed" } },
      ])
    ).toEqual([{ status: "partial", job: { status: "failed" } }]);
  });

  it("keeps an active job available for an explicit load choice", () => {
    expect(
      isRecoverableStoryboardRun({
        status: "running",
        job: { status: "running" },
      })
    ).toBe(true);
    expect(
      isRecoverableStoryboardRun({ status: "awaiting_confirmation", job: null })
    ).toBe(true);
  });
});
