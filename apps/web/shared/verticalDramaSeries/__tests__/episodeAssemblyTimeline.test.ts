import { describe, expect, it } from "vitest";
import {
  resolveEpisodeAssemblySegments,
  validateEpisodeAssemblyTimeline,
  type EpisodeAssemblyTimeline,
} from "../episodeAssemblyTimeline";

const baseTimeline = (overrides: Partial<EpisodeAssemblyTimeline> = {}) =>
  ({
    version: 1,
    revision: 2,
    insertAtMs: 5_000,
    footage: [
      {
        blockId: "footage-1",
        mediaAssetId: 10,
        sourceInMs: 1_000,
        sourceOutMs: 11_000,
        fitMode: "cover" as const,
        audioPolicy: "keep" as const,
      },
    ],
    ...overrides,
  }) satisfies EpisodeAssemblyTimeline;

describe("episode assembly timeline", () => {
  it("splits footage around an insertion point", () => {
    expect(resolveEpisodeAssemblySegments(baseTimeline())).toEqual([
      expect.objectContaining({
        kind: "footage",
        blockId: "footage-1:before",
        sourceInSec: 1,
        sourceOutSec: 6,
      }),
      { kind: "nine_shot_compound" },
      expect.objectContaining({
        kind: "footage",
        blockId: "footage-1:after",
        sourceInSec: 6,
        sourceOutSec: 11,
      }),
    ]);
  });

  it("keeps compound at a boundary without zero-length footage", () => {
    expect(
      resolveEpisodeAssemblySegments(
        baseTimeline({ insertAtMs: 10_000 }),
      ).map(segment => segment.kind),
    ).toEqual(["footage", "nine_shot_compound"]);
  });

  it("rejects foreign assets and out-of-range trim/insertion values", () => {
    const validation = validateEpisodeAssemblyTimeline(
      baseTimeline({
        insertAtMs: 12_000,
        footage: [
          {
            blockId: "footage-1",
            mediaAssetId: 99,
            sourceInMs: 0,
            sourceOutMs: 20_000,
            fitMode: "cover",
            audioPolicy: "keep",
          },
        ],
      }),
      [{ mediaAssetId: 10, durationMs: 10_000 }],
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues.map(issue => issue.path)).toEqual([
      "footage[0].mediaAssetId",
      "insertAtMs",
    ]);
  });
});
