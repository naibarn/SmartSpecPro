import { describe, expect, it } from "vitest";

import { shouldRenderEpisodePreviewPanel } from "../VerticalDramaEpisodePage";

describe("shouldRenderEpisodePreviewPanel", () => {
  it("keeps the cover and preview panel visible before any video is ready", () => {
    expect(
      shouldRenderEpisodePreviewPanel({
        episodeDetailLoaded: true,
        readyShotCount: 0,
      })
    ).toBe(true);
  });

  it("does not render before episode detail data is available", () => {
    expect(
      shouldRenderEpisodePreviewPanel({
        episodeDetailLoaded: false,
        readyShotCount: 0,
      })
    ).toBe(false);
  });
});
