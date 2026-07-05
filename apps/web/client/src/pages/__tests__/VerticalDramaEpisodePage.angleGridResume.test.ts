/**
 * Unit coverage for `shouldResumeAngleGridPoll` (2026-07-06 fix) — the pure
 * decision logic behind the "resume on load" recovery for orphaned 3x3
 * angle-variations grid tasks.
 *
 * Bug this fixes: the ONLY thing tracking an in-flight angle-grid task used
 * to be in-memory poll state in `VerticalDramaEpisodePage.tsx`
 * (`pollAngleVariationsTask`'s local loop) — if the page reloaded or
 * navigated away before that poll observed `status === "completed"`, the
 * grid was persisted nowhere and was lost forever, even though the task
 * completed successfully server-side (confirmed via DB: episode id=6 had 9
 * `startFramePlan` frames, none with an `angleGrid` key, despite a
 * completed grid task visible in media history).
 *
 * Fix: persist `angleGrid.pendingTaskId` at SUBMIT time (before the poll
 * even starts), then on every `getEpisodeDetail` load/refetch, resume
 * polling any frame with a `pendingTaskId` but no `imageUrl` yet. This test
 * covers the resume/no-resume branches of that decision in isolation.
 */
import { describe, expect, it } from "vitest";
import { shouldResumeAngleGridPoll } from "../VerticalDramaEpisodePage";

describe("shouldResumeAngleGridPoll", () => {
  it("resumes a frame with a pendingTaskId and no imageUrl (orphaned task)", () => {
    expect(
      shouldResumeAngleGridPoll(
        { pendingTaskId: "task-123" },
        7,
        new Set(),
        new Set()
      )
    ).toBe(true);
  });

  it("does NOT resume a frame with no angleGrid at all", () => {
    expect(shouldResumeAngleGridPoll(undefined, 7, new Set(), new Set())).toBe(false);
  });

  it("does NOT resume a frame with no pendingTaskId (never submitted / already cleared)", () => {
    expect(
      shouldResumeAngleGridPoll({ imageUrl: "https://cdn/x.png" }, 7, new Set(), new Set())
    ).toBe(false);
  });

  it("does NOT resume once the grid has resolved (imageUrl present) even if pendingTaskId lingers", () => {
    expect(
      shouldResumeAngleGridPoll(
        { pendingTaskId: "task-123", imageUrl: "https://cdn/x.png" },
        7,
        new Set(),
        new Set()
      )
    ).toBe(false);
  });

  it("does NOT resume a shot already resumed this session (avoids duplicate polls on refetch)", () => {
    expect(
      shouldResumeAngleGridPoll(
        { pendingTaskId: "task-123" },
        7,
        new Set([7]),
        new Set()
      )
    ).toBe(false);
  });

  it("does NOT resume a shot that is currently being polled (live or resumed) — double-poll guard", () => {
    expect(
      shouldResumeAngleGridPoll(
        { pendingTaskId: "task-123" },
        7,
        new Set(),
        new Set([7])
      )
    ).toBe(false);
  });

  it("resumes shot 7 independently of unrelated shots in the already-resumed/in-flight sets", () => {
    expect(
      shouldResumeAngleGridPoll(
        { pendingTaskId: "task-123" },
        7,
        new Set([1, 2, 3]),
        new Set([4, 5, 6])
      )
    ).toBe(true);
  });
});
