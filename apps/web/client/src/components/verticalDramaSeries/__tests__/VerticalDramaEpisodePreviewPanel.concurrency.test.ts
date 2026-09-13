import { describe, expect, it } from "vitest";

import { isVerticalDramaEpisodePreviewSlotLocked } from "../VerticalDramaEpisodePreviewPanel";

describe("Vertical Drama episode preview slot concurrency", () => {
  const ready = {
    selectedShotCount: 2,
    submitting: false,
    hasReadyCover: true,
  };

  it("does not lock a different slot just because another slot is queued", () => {
    expect(
      isVerticalDramaEpisodePreviewSlotLocked({
        ...ready,
        status: undefined,
      })
    ).toBe(false);
  });

  it("keeps the same slot locked while its preview is pending", () => {
    expect(
      isVerticalDramaEpisodePreviewSlotLocked({
        ...ready,
        status: "pending",
      })
    ).toBe(true);
  });

  it("keeps the slot locked while its request is being submitted", () => {
    expect(
      isVerticalDramaEpisodePreviewSlotLocked({
        ...ready,
        submitting: true,
      })
    ).toBe(true);
  });
});
