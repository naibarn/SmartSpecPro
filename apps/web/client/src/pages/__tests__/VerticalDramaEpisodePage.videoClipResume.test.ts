/**
 * Unit coverage for `shouldResumeVideoClipPoll` (2026-07-06 fix) — the pure
 * decision logic behind the "resume on load" recovery for orphaned video-clip
 * render tasks.
 *
 * Bug this fixes: a completed `generateVideoClip` render used to be surfaced
 * ONLY as a transient toast (`pollVideoClipTask`'s in-memory poll loop) —
 * nothing persisted the `taskId` or the resolved `resultUrl` anywhere, and
 * the storyboard panel had no UI slot to render a completed clip video at
 * all. Confirmed via DB: two `mcp_media_tasks` video rows completed with a
 * `resultUrl`, but the episode's `motionPromptPack.clips[]` had no
 * `videoTask` field at all.
 *
 * Fix: persist `videoTask.pendingTaskId` at SUBMIT time (before the poll even
 * starts), then on every `getEpisodeDetail` load/refetch, resume polling any
 * clip with a `pendingTaskId` but no `videoUrl` yet. This test covers the
 * resume/no-resume branches of that decision in isolation — same shape as
 * `shouldResumeAngleGridPoll`'s coverage.
 */
import { describe, expect, it } from "vitest";
import { shouldResumeVideoClipPoll } from "../VerticalDramaEpisodePage";

describe("shouldResumeVideoClipPoll", () => {
  it("resumes a clip with a pendingTaskId and no videoUrl (orphaned task)", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123" },
        1,
        new Set(),
        new Set()
      )
    ).toBe(true);
  });

  it("does NOT resume a clip with no videoTask at all", () => {
    expect(shouldResumeVideoClipPoll(undefined, 1, new Set(), new Set())).toBe(
      false
    );
  });

  it("does NOT resume a clip with no pendingTaskId (never submitted / already cleared)", () => {
    expect(
      shouldResumeVideoClipPoll(
        { videoUrl: "https://cdn/clip.mp4" },
        1,
        new Set(),
        new Set()
      )
    ).toBe(false);
  });

  it("does NOT resume once the clip has resolved (videoUrl present) even if pendingTaskId lingers", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123", videoUrl: "https://cdn/clip.mp4" },
        1,
        new Set(),
        new Set()
      )
    ).toBe(false);
  });

  it("does not treat a whitespace-only URL as a completed render", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123", videoUrl: "   " },
        1,
        new Set(),
        new Set()
      )
    ).toBe(true);
  });

  it("does NOT resume a clip already resumed this session (avoids duplicate polls on refetch)", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123" },
        1,
        new Set([1]),
        new Set()
      )
    ).toBe(false);
  });

  it("does NOT resume a clip that is currently being polled (live or resumed) — double-poll guard", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123" },
        1,
        new Set(),
        new Set([1])
      )
    ).toBe(false);
  });

  it("resumes clip 1 independently of unrelated clips in the already-resumed/in-flight sets", () => {
    expect(
      shouldResumeVideoClipPoll(
        { pendingTaskId: "task-123" },
        1,
        new Set([2, 3, 4]),
        new Set([5, 6, 7])
      )
    ).toBe(true);
  });
});
