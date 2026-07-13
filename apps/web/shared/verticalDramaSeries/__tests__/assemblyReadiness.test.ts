import { describe, expect, it } from "vitest";

import {
  resolveCanonicalShotAssembly,
  resolveCanonicalShotNumber,
} from "../assemblyReadiness";

function completedClip(clipNumber: number, shotNumber = clipNumber) {
  return {
    clipNumber,
    sourceShotNumbers: [shotNumber],
    videoTask: { videoUrl: `/${clipNumber}.mp4` },
  };
}

describe("resolveCanonicalShotNumber", () => {
  it("prefers explicit parent and source identities and decodes a metadata-only legacy sub-shot", () => {
    expect(
      resolveCanonicalShotNumber({
        clipNumber: 302,
        parentShotNumber: 3,
        sourceShotNumbers: [8],
      }),
    ).toBe(3);
    expect(
      resolveCanonicalShotNumber({ clipNumber: 302, sourceShotNumbers: [3] }),
    ).toBe(3);
    expect(
      resolveCanonicalShotNumber({ clipNumber: 302, subShotNumber: 2 }),
    ).toBe(3);
    expect(resolveCanonicalShotNumber({ clipNumber: 302 })).toBe(302);
  });

  it("rejects invalid identities", () => {
    expect(resolveCanonicalShotNumber({ clipNumber: 0 })).toBeUndefined();
    expect(
      resolveCanonicalShotNumber({
        clipNumber: 4,
        parentShotNumber: -1,
        sourceShotNumbers: [Number.NaN],
      }),
    ).toBe(4);
  });
});

describe("resolveCanonicalShotAssembly", () => {
  it("resolves a normal nine-shot episode as 9/9", () => {
    const clips = Array.from({ length: 9 }, (_, index) =>
      completedClip(index + 1),
    );

    const result = resolveCanonicalShotAssembly({
      clips,
      storyboardShotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    expect(result.expectedShotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.readyShotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.missingShotNumbers).toEqual([]);
    expect(result.selectedClips).toHaveLength(9);
  });

  it("collapses ten persisted records into nine canonical ready shots", () => {
    const clips = [
      completedClip(1),
      completedClip(2),
      {
        clipNumber: 301,
        parentShotNumber: 3,
        subShotNumber: 1,
        sourceShotNumbers: [3],
      },
      {
        clipNumber: 302,
        parentShotNumber: 3,
        subShotNumber: 2,
        sourceShotNumbers: [3],
        videoTask: { videoUrl: "/302.mp4" },
      },
      ...[4, 5, 6, 7, 8, 9].map(number => completedClip(number)),
    ];

    const result = resolveCanonicalShotAssembly({
      clips,
      storyboardShotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    expect(result.readyShotNumbers).toHaveLength(9);
    expect(result.missingShotNumbers).toEqual([]);
    expect(result.selectedClips.map(clip => clip.clipNumber)).toEqual([
      1, 2, 302, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("reports a genuinely missing canonical shot and ignores orphan clips", () => {
    const clips = [
      ...[1, 2, 4, 5, 6, 7, 8, 9].map(number => completedClip(number)),
      completedClip(99),
    ];

    const result = resolveCanonicalShotAssembly({
      clips,
      storyboardShotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });

    expect(result.readyShotNumbers).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
    expect(result.missingShotNumbers).toEqual([3]);
    expect(result.selectedClips.some(clip => clip.clipNumber === 99)).toBe(false);
  });

  it("prefers a completed canonical clip, then the lowest completed legacy sub-shot", () => {
    const canonical = completedClip(3);
    const legacyOne = {
      clipNumber: 301,
      parentShotNumber: 3,
      subShotNumber: 1,
      sourceShotNumbers: [3],
      videoUrl: "/301.mp4",
    };
    const legacyTwo = {
      clipNumber: 302,
      parentShotNumber: 3,
      subShotNumber: 2,
      sourceShotNumbers: [3],
      videoUrl: "/302.mp4",
    };

    expect(
      resolveCanonicalShotAssembly({
        clips: [legacyOne, legacyTwo, canonical],
        storyboardShotNumbers: [3],
      }).selectedClips,
    ).toEqual([canonical]);
    expect(
      resolveCanonicalShotAssembly({
        clips: [legacyTwo, legacyOne],
        storyboardShotNumbers: [3],
      }).selectedClips,
    ).toEqual([legacyOne]);
  });

  it("falls back from storyboard to start frames, then to clip-derived shots", () => {
    const clips = [completedClip(2), completedClip(4), completedClip(6)];

    expect(
      resolveCanonicalShotAssembly({
        clips,
        storyboardShotNumbers: [null, -1],
        startFrameShotNumbers: [6, 2, 4, 4],
      }).expectedShotNumbers,
    ).toEqual([2, 4, 6]);
    expect(
      resolveCanonicalShotAssembly({ clips }).expectedShotNumbers,
    ).toEqual([2, 4, 6]);
  });

  it("supports variable shot counts without a fixed nine-shot assumption", () => {
    const result = resolveCanonicalShotAssembly({
      clips: [completedClip(1), completedClip(2), completedClip(3)],
      storyboardShotNumbers: [1, 2, 3],
    });

    expect(result.expectedShotNumbers).toHaveLength(3);
    expect(result.readyShotNumbers).toHaveLength(3);
  });
});
