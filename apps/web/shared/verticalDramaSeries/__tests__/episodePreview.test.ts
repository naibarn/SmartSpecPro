import { describe, expect, it } from "vitest";

import {
  readVerticalDramaEpisodePreviews,
  upsertVerticalDramaEpisodePreview,
  verticalDramaEpisodePreviewSelectedShotsSchema,
} from "../episodePreview";

describe("vertical drama episode preview contract", () => {
  it("requires exactly two different shots in the 1-9 range", () => {
    expect(
      verticalDramaEpisodePreviewSelectedShotsSchema.safeParse([2, 7]).success
    ).toBe(true);
    expect(
      verticalDramaEpisodePreviewSelectedShotsSchema.safeParse([2]).success
    ).toBe(false);
    expect(
      verticalDramaEpisodePreviewSelectedShotsSchema.safeParse([2, 2]).success
    ).toBe(false);
    expect(
      verticalDramaEpisodePreviewSelectedShotsSchema.safeParse([0, 7]).success
    ).toBe(false);
  });

  it("reads valid slots and replaces a slot without creating duplicates", () => {
    const first = {
      slotId: 1 as const,
      selectedShotNumbers: [1, 4] as [number, number],
      status: "completed" as const,
      videoUrl: "https://cdn.example.com/one.mp4",
    };
    const second = {
      slotId: 2 as const,
      selectedShotNumbers: [2, 8] as [number, number],
      status: "pending" as const,
      pendingJobId: "job-2",
    };
    const replacement = {
      ...first,
      selectedShotNumbers: [3, 9] as [number, number],
      status: "pending" as const,
      pendingJobId: "job-3",
    };

    expect(
      readVerticalDramaEpisodePreviews([first, second, { slotId: 5 }])
    ).toEqual([first, second]);
    expect(
      upsertVerticalDramaEpisodePreview([first, second], replacement)
    ).toEqual([replacement, second]);
  });
});
