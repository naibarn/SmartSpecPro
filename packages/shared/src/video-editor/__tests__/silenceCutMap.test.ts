import { describe, expect, it } from "vitest";
import {
  buildSilenceCutMap,
  editedToSourceTime,
  normalizeSilenceRanges,
  sourceToEditedTime,
} from "../silenceCutMap";

describe("silence cut map", () => {
  it("normalizes, merges, and maps source and edited time", () => {
    expect(
      normalizeSilenceRanges(
        [
          { startMs: 100, endMs: 300 },
          { startMs: 250, endMs: 500 },
        ],
        1000,
      ),
    ).toEqual([{ startMs: 100, endMs: 500 }]);
    const map = buildSilenceCutMap({
      sourceDurationMs: 1000,
      ranges: [{ startMs: 100, endMs: 300 }],
      sourceFingerprint: "src",
      revisionId: "r1",
      audioStreamIndex: 0,
      detectionFingerprint: "d",
    });
    expect(map.editedDurationMs).toBe(800);
    expect(sourceToEditedTime(map, 50)).toBe(50);
    expect(sourceToEditedTime(map, 200)).toBeNull();
    expect(sourceToEditedTime(map, 400)).toBe(200);
    expect(editedToSourceTime(map, 200)).toBe(400);
  });

  it("uses the same 50ms merge tolerance as Worker playback", () => {
    expect(
      normalizeSilenceRanges(
        [
          { startMs: 100, endMs: 300 },
          { startMs: 320, endMs: 500 },
        ],
        1000,
      ),
    ).toEqual([{ startMs: 100, endMs: 500 }]);
  });
});
