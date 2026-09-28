// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VerticalDramaEpisodeCoverSurface } from "../VerticalDramaEpisodeCoverSurface";

describe("VerticalDramaEpisodeCoverSurface", () => {
  it("fills the responsive preview slot when requested", () => {
    render(
      <VerticalDramaEpisodeCoverSurface
        lang="th"
        episodeNumber={1}
        coverSlotId={1}
        fillContainer
        imageUrl={null}
        fallbackUrl={null}
        readOnly
      />
    );

    expect(
      screen.getByTestId("vd-episode-cover-surface-1-1").parentElement
    ).toHaveClass("w-full", "min-w-0");
  });

  it("keeps the compact width used by episode cards by default", () => {
    render(
      <VerticalDramaEpisodeCoverSurface
        lang="th"
        episodeNumber={2}
        coverSlotId={1}
        imageUrl={null}
        fallbackUrl={null}
        readOnly
      />
    );

    expect(
      screen.getByTestId("vd-episode-cover-surface-2-1").parentElement
    ).toHaveClass("w-36", "shrink-0");
  });
});
