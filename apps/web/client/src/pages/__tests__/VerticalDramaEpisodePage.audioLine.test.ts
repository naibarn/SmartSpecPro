import { describe, expect, it } from "vitest";

import {
  buildUpdatedItemsForAudioTask,
  countPendingDialogueAudioLines,
  resolveDialogueAudioLineStatus,
  shouldResumeAudioLinePoll,
  type MinimalAudioTaskItem,
} from "../VerticalDramaEpisodePage";

/**
 * Unit coverage for the W12-B voice chain wave's dialogue-audio-line pure
 * helpers — mirrors `VerticalDramaEpisodePage.videoClipResume.test.ts` /
 * `VerticalDramaEpisodePage.uploadVideoMinimalClip.test.ts`'s own convention
 * for `shouldResumeVideoClipPoll` / `buildUpdatedClipsForVideoTask`.
 */
describe("shouldResumeAudioLinePoll", () => {
  it("resumes when a pendingTaskId exists with no audioUrl and no other tracking", () => {
    expect(
      shouldResumeAudioLinePoll({ pendingTaskId: "t1" }, "line-1", new Set(), new Set())
    ).toBe(true);
  });

  it("does not resume when audioTask is undefined", () => {
    expect(shouldResumeAudioLinePoll(undefined, "line-1", new Set(), new Set())).toBe(false);
  });

  it("does not resume when there is no pendingTaskId", () => {
    expect(shouldResumeAudioLinePoll({}, "line-1", new Set(), new Set())).toBe(false);
  });

  it("does not resume once audioUrl is already resolved", () => {
    expect(
      shouldResumeAudioLinePoll(
        { pendingTaskId: "t1", audioUrl: "https://x/1.mp3" },
        "line-1",
        new Set(),
        new Set()
      )
    ).toBe(false);
  });

  it("does not resume a line already resumed this session", () => {
    expect(
      shouldResumeAudioLinePoll({ pendingTaskId: "t1" }, "line-1", new Set(["line-1"]), new Set())
    ).toBe(false);
  });

  it("does not resume a line currently being polled", () => {
    expect(
      shouldResumeAudioLinePoll({ pendingTaskId: "t1" }, "line-1", new Set(), new Set(["line-1"]))
    ).toBe(false);
  });
});

describe("buildUpdatedItemsForAudioTask", () => {
  const items: MinimalAudioTaskItem[] = [
    { lineId: "line-1", speakerName: "นางเอก" },
    { lineId: "line-2", speakerName: "พระเอก", audioTask: { pendingTaskId: "t-old" } },
  ];

  it("sets audioTask on the matching item, leaving others untouched", () => {
    const updated = buildUpdatedItemsForAudioTask(items, "line-1", { pendingTaskId: "t-new" });
    expect(updated[0].audioTask).toEqual({ pendingTaskId: "t-new" });
    expect(updated[1]).toBe(items[1]);
  });

  it("replaces an existing audioTask with a completed one", () => {
    const updated = buildUpdatedItemsForAudioTask(items, "line-2", {
      audioUrl: "https://x/2.mp3",
      mediaTaskId: "media-1",
    });
    expect(updated[1].audioTask).toEqual({ audioUrl: "https://x/2.mp3", mediaTaskId: "media-1" });
  });

  it("clears audioTask entirely when passed null (poll failure)", () => {
    const updated = buildUpdatedItemsForAudioTask(items, "line-2", null);
    expect(updated[1]).not.toHaveProperty("audioTask");
  });

  it("is a no-op for an unknown lineId", () => {
    const updated = buildUpdatedItemsForAudioTask(items, "line-99", { pendingTaskId: "t-x" });
    expect(updated).toEqual(items);
  });
});

describe("resolveDialogueAudioLineStatus", () => {
  it("returns 'ready' when audioUrl is present, regardless of other fields", () => {
    expect(
      resolveDialogueAudioLineStatus(
        { blocked: true, audioTask: { audioUrl: "https://x/1.mp3", pendingTaskId: "t1" } },
        "line-1",
        new Set()
      )
    ).toBe("ready");
  });

  it("returns 'blocked' when blocked and not yet ready", () => {
    expect(resolveDialogueAudioLineStatus({ blocked: true }, "line-1", new Set())).toBe("blocked");
  });

  it("returns 'generating' when a pendingTaskId is present", () => {
    expect(
      resolveDialogueAudioLineStatus({ blocked: false, audioTask: { pendingTaskId: "t1" } }, "line-1", new Set())
    ).toBe("generating");
  });

  it("'generating' wins over a stale failedLineIds entry (resubmitted line)", () => {
    expect(
      resolveDialogueAudioLineStatus(
        { blocked: false, audioTask: { pendingTaskId: "t1" } },
        "line-1",
        new Set(["line-1"])
      )
    ).toBe("generating");
  });

  it("returns 'failed' when in failedLineIds and not otherwise ready/blocked/generating", () => {
    expect(resolveDialogueAudioLineStatus({ blocked: false }, "line-1", new Set(["line-1"]))).toBe(
      "failed"
    );
  });

  it("returns 'queued' as the default (never submitted, not blocked/failed)", () => {
    expect(resolveDialogueAudioLineStatus({ blocked: false }, "line-1", new Set())).toBe("queued");
  });
});

describe("countPendingDialogueAudioLines", () => {
  it("counts only lines that are not blocked, not pending, and not ready", () => {
    const plan = {
      separateTtsPlan: {
        items: [
          { lineId: "l1", blocked: false },
          { lineId: "l2", blocked: true },
          { lineId: "l3", blocked: false, audioTask: { pendingTaskId: "t3" } },
          { lineId: "l4", blocked: false, audioTask: { audioUrl: "https://x/4.mp3" } },
          { lineId: "l5", blocked: false },
        ],
      },
    } as Parameters<typeof countPendingDialogueAudioLines>[0];
    expect(countPendingDialogueAudioLines(plan)).toBe(2);
  });

  it("returns 0 when there is no separateTtsPlan", () => {
    expect(countPendingDialogueAudioLines(null)).toBe(0);
    expect(countPendingDialogueAudioLines(undefined)).toBe(0);
    expect(countPendingDialogueAudioLines({ separateTtsPlan: undefined })).toBe(0);
  });
});
