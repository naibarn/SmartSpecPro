import { describe, expect, it } from "vitest";
import { assertAllShotImageCoverage, buildVerticalDramaBookSourceSnapshot, fingerprintBookSource } from "./verticalDramaBookSnapshot";

const checksum = "b".repeat(64);
const input = () => ({
  now: new Date("2026-11-06T00:00:00.000Z"),
  series: { id: 8, title: "Series", locale: "th", synopsis: "Synopsis" },
  episodes: [{
    id: 21, revisionId: 4, revisionFingerprint: "c".repeat(64), title: "Episode",
    episodeKind: "normal", episodeNumber: 1, specialSequence: null,
    script: { beats: ["one"] }, storyboard: { shotCount: 2 }, startFramePlan: { frames: [
      { shotNumber: 1, approvedMediaAssetId: "31" }, { shotNumber: 2, approvedMediaAssetId: "32" },
    ] }, dialogueAudioPlan: null, coverImage: null,
  }],
  assets: [
    { id: 31, checksumSha256: checksum, mimeType: "image/png", status: "ready" },
    { id: 32, checksumSha256: checksum, mimeType: "image/jpeg", status: "ready" },
  ],
});

describe("vertical drama Book source snapshot", () => {
  it("pins each approved image and reports complete all-shot coverage", () => {
    const result = buildVerticalDramaBookSourceSnapshot(input());
    expect(result.imageCoverage).toEqual({ totalShots: 2, usableShots: 2, missing: [] });
    expect(result.snapshot.episodes[0].shots.map(shot => shot.mediaAssetId)).toEqual([31, 32]);
    expect(() => assertAllShotImageCoverage(result)).not.toThrow();
  });

  it("fails closed when a selected shot has no owned, checksummed image", () => {
    const source = input();
    source.assets.pop();
    const result = buildVerticalDramaBookSourceSnapshot(source);
    expect(result.imageCoverage.missing).toEqual([{ episodeId: 21, shotNumber: 2 }]);
    expect(result.snapshot.episodes[0].shots[1].mediaAssetId).toBeNull();
    expect(() => assertAllShotImageCoverage(result)).toThrow("BOOK_ALL_SHOTS_IMAGE_COVERAGE_INCOMPLETE");
  });

  it("does not count pending assets as usable images", () => {
    const source = input();
    source.assets[0].status = "pending";
    const result = buildVerticalDramaBookSourceSnapshot(source);
    expect(result.imageCoverage.usableShots).toBe(1);
    expect(result.imageCoverage.missing).toEqual([{ episodeId: 21, shotNumber: 1 }]);
  });

  it("fingerprints source changes while ignoring object key order", () => {
    expect(fingerprintBookSource({ a: 1, b: { x: 2, y: 3 } })).toBe(fingerprintBookSource({ b: { y: 3, x: 2 }, a: 1 }));
    const first = buildVerticalDramaBookSourceSnapshot(input());
    const changed = input();
    changed.episodes[0].script = { beats: ["changed"] };
    expect(buildVerticalDramaBookSourceSnapshot(changed).fingerprint).not.toBe(first.fingerprint);
    const changedArtwork = input();
    changedArtwork.assets[0].checksumSha256 = "d".repeat(64);
    expect(buildVerticalDramaBookSourceSnapshot(changedArtwork).sourceContentFingerprint).not.toBe(first.sourceContentFingerprint);
  });
});
