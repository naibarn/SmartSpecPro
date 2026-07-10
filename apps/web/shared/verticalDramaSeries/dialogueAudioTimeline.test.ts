/**
 * `resolveDialogueLineAbsoluteTimings` — task #21 / W12.5 "Final Render
 * Suite" phase B. See `dialogueAudioTimeline.ts`'s own header doc comment
 * for the shot-local -> absolute-timeline problem this solves.
 */
import { describe, expect, it } from "vitest";
import {
  resolveDialogueLineAbsoluteTimings,
  type VdDialogueTimelineClip,
} from "./dialogueAudioTimeline";
import type { VerticalDramaDialogueLine } from "./audio";

function line(over: Partial<VerticalDramaDialogueLine> = {}): VerticalDramaDialogueLine {
  return {
    lineId: "line-1",
    shotNumber: 1,
    speakerName: "Aria",
    isNarration: false,
    text: "We are not done here.",
    start: 0,
    end: 2,
    targetDurationSeconds: 2,
    ...over,
  };
}

const clip1: VdDialogueTimelineClip = {
  clipNumber: 1,
  sourceShotNumbers: [1],
  durationSeconds: 8,
};
const clip2: VdDialogueTimelineClip = {
  clipNumber: 2,
  sourceShotNumbers: [2],
  durationSeconds: 8,
};
const clip3: VdDialogueTimelineClip = {
  clipNumber: 3,
  sourceShotNumbers: [3],
  durationSeconds: 4,
};

describe("resolveDialogueLineAbsoluteTimings", () => {
  it("places a line at its clip's own offset when clipNumber resolves directly (first clip -> offset 0)", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 1, start: 1, end: 3 })],
      [clip1, clip2],
      [1, 2],
    );
    expect(result).toMatchObject({
      absoluteStartSec: 1,
      absoluteEndSec: 3,
      timingSource: "clip_timeline",
      resolvedClipNumber: 1,
    });
  });

  it("adds the cumulative duration of all PRECEDING included clips for a later clip", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 3, start: 1, end: 2 })],
      [clip1, clip2, clip3],
      [1, 2, 3],
    );
    // clip1 (8s) + clip2 (8s) = 16s offset before clip3 starts.
    expect(result).toMatchObject({
      absoluteStartSec: 17,
      absoluteEndSec: 18,
      timingSource: "clip_timeline",
    });
  });

  it("falls back to matching shotNumber against sourceShotNumbers when clipNumber is absent", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: undefined, shotNumber: 2, start: 0, end: 1 })],
      [clip1, clip2],
      [1, 2],
    );
    expect(result).toMatchObject({
      resolvedClipNumber: 2,
      absoluteStartSec: 8, // clip1's duration
      absoluteEndSec: 9,
      timingSource: "clip_timeline",
    });
  });

  it("excludes clips NOT in includedClipNumbers from the offset calculation (timeline compresses)", () => {
    // clip2 is skipped (e.g. allowPartial) — clip3 should sit right after clip1.
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 3, start: 0, end: 1 })],
      [clip1, clip2, clip3],
      [1, 3],
    );
    expect(result).toMatchObject({
      absoluteStartSec: 8, // only clip1's 8s counted, clip2 excluded
      absoluteEndSec: 9,
    });
  });

  it("uses the sequential speech-seconds estimate when the line's clip is not included in this render", () => {
    // shotNumber 2 -> clip2, but clip2 was skipped (allowPartial) — only clip1 included.
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: undefined, shotNumber: 2, text: "สวัสดีครับ", start: 0, end: 1 })],
      [clip1, clip2],
      [1],
    );
    expect(result!.timingSource).toBe("sequential_estimate");
    expect(result!.absoluteStartSec).toBe(0); // cursor starts at 0
    expect(result!.absoluteEndSec).toBeGreaterThan(0);
  });

  it("continues the estimate fallback from the previous line's end, not from 0, keeping lines ordered", () => {
    const results = resolveDialogueLineAbsoluteTimings(
      [
        line({ lineId: "a", clipNumber: undefined, shotNumber: 99, text: "First line here." }),
        line({ lineId: "b", clipNumber: undefined, shotNumber: 99, text: "Second line here." }),
      ],
      [clip1],
      [1],
    );
    expect(results[0]!.timingSource).toBe("sequential_estimate");
    expect(results[1]!.timingSource).toBe("sequential_estimate");
    expect(results[0]!.absoluteStartSec).toBe(0);
    expect(results[1]!.absoluteStartSec).toBe(results[0]!.absoluteEndSec);
    expect(results[1]!.absoluteEndSec).toBeGreaterThan(results[1]!.absoluteStartSec);
  });

  it("clamps a stale start/end that exceeds the clip's real duration and falls back to the estimate instead of a zero/negative window", () => {
    // clip1 is only 8s; a stale line claiming start=9,end=10 has no valid
    // window on that clip once clamped ([8,8) has zero length) — must fall
    // back to the sequential estimate rather than emit a degenerate cue.
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 1, start: 9, end: 10, text: "stale timing line" })],
      [clip1],
      [1],
    );
    expect(result!.timingSource).toBe("sequential_estimate");
    expect(result!.absoluteEndSec).toBeGreaterThan(result!.absoluteStartSec);
  });

  it("keeps the resolved clip number as informational metadata even when the timing source is the estimate fallback", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 1, start: 9, end: 10 })],
      [clip1],
      [1],
    );
    expect(result!.resolvedClipNumber).toBe(1);
    expect(result!.timingSource).toBe("sequential_estimate");
  });

  it("sorts included clips by clipNumber regardless of input array order", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ clipNumber: 2, start: 0, end: 1 })],
      [clip2, clip1], // deliberately out of order
      [1, 2],
    );
    // clip1 (8s) must still be counted as "preceding" clip2 despite array order.
    expect(result).toMatchObject({ absoluteStartSec: 8, absoluteEndSec: 9 });
  });

  it("carries speakerName/isNarration/text through unchanged", () => {
    const [result] = resolveDialogueLineAbsoluteTimings(
      [line({ speakerName: "Narrator", isNarration: true, text: "Once upon a time." })],
      [clip1],
      [1],
    );
    expect(result).toMatchObject({
      speakerName: "Narrator",
      isNarration: true,
      text: "Once upon a time.",
    });
  });

  it("returns an empty array for an empty lines input", () => {
    expect(resolveDialogueLineAbsoluteTimings([], [clip1], [1])).toEqual([]);
  });
});
