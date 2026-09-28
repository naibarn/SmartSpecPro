import { describe, expect, it } from "vitest";
import {
  parseShotBrollBinding,
  projectBrollPlacements,
  validateBrollBinding,
} from "../verticalDramaBrollService";
import { parseShotBrollTransform } from "@shared/verticalDramaSeries/visualSource";

describe("projectBrollPlacements", () => {
  const still = (bindingId: string, shotNumber: number, order = 0, duration = 2) => ({
    bindingId,
    shotNumber,
    order,
    mediaType: "image" as const,
    displayDurationSeconds: duration,
  });

  it("projects each binding onto the real assembled shot window", () => {
    const result = projectBrollPlacements(
      [still("shot-2", 2, 0, 2)],
      [
        { clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] },
        { clipNumber: 2, durationSeconds: 4, sourceShotNumbers: [2] },
      ],
    );
    expect(result.errors).toEqual([]);
    expect(result.items[0]).toMatchObject({ startSeconds: 8, endSeconds: 10 });
  });

  it("serializes multiple B-roll items within one shot instead of overlapping them", () => {
    const result = projectBrollPlacements(
      [still("a", 1, 0, 2), still("b", 1, 1, 3)],
      [{ clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] }],
    );
    expect(result.items.map(item => [item.startSeconds, item.endSeconds])).toEqual([
      [0, 2],
      [2, 5],
    ]);
    expect(result.errors).toEqual([]);
  });

  it("fails closed when a B-roll window exceeds its shot", () => {
    const result = projectBrollPlacements(
      [still("too-long", 1, 0, 9)],
      [{ clipNumber: 1, durationSeconds: 8, sourceShotNumbers: [1] }],
    );
    expect(result.errors).toContain("broll_shot_overflow:too-long:9s>8s");
  });

  it("accepts direct episode footage without a source-pack segment", () => {
    const binding = parseShotBrollBinding({
      bindingId: "episode-footage-1",
      episodeId: 12,
      shotNumber: 1,
      usage: {
        usageId: "episode-footage-1",
        slotId: "episode-footage-99",
        semanticRole: "b_roll_footage",
        mediaType: "video",
        sourceAssetId: null,
        mediaAssetId: 99,
        segmentId: null,
        segmentRevision: null,
        inSeconds: 0,
        outSeconds: 2.5,
        displayDurationSeconds: null,
        audioPolicy: "mute",
        labelMode: "source",
        snapshotRevision: 1,
        snapshotFingerprint: "a".repeat(64),
      },
      order: 0,
      transform: { x: 12, y: 8, width: 50, height: 40, rotationDeg: 3, opacity: 0.8 },
      active: true,
      status: "ready",
    });
    const validated = validateBrollBinding(binding, {
      snapshotRevision: 1,
      snapshotFingerprint: "a".repeat(64),
      segment: null,
    });
    expect(validated.usage.segmentId).toBeNull();
    expect(validated.transform).toMatchObject({ x: 12, width: 50, opacity: 0.8 });
  });

  it("does not accept an image as direct footage", () => {
    const binding = parseShotBrollBinding({
      bindingId: "invalid-direct-image",
      episodeId: 12,
      shotNumber: 1,
      usage: {
        usageId: "invalid-direct-image",
        slotId: "episode-footage-99",
        semanticRole: "b_roll_footage",
        mediaType: "image",
        sourceAssetId: null,
        mediaAssetId: 99,
        segmentId: null,
        segmentRevision: null,
        inSeconds: 0,
        outSeconds: 2,
        displayDurationSeconds: null,
        snapshotRevision: 1,
        snapshotFingerprint: "b".repeat(64),
      },
      order: 0,
      active: true,
      status: "ready",
    });
    expect(() => validateBrollBinding(binding, {
      snapshotRevision: 1,
      snapshotFingerprint: "b".repeat(64),
      segment: null,
    })).toThrow("Footage B-roll requires one video segment with in/out bounds");
  });
});

describe("parseShotBrollTransform", () => {
  it("falls back to the full-frame transform for missing or malformed legacy data", () => {
    expect(parseShotBrollTransform(undefined)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
    });
    expect(parseShotBrollTransform({ width: "100" })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
    });
  });
});
