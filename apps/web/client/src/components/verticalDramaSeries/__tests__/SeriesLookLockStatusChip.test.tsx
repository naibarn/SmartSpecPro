import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SeriesLookLockStatusChip } from "../SeriesLookLockStatusChip";
import { getSeriesLookLockGenreIdentity } from "@shared/verticalDramaSeries/seriesLookLock";

describe("SeriesLookLockStatusChip", () => {
  it("is absent while the rollout flag is off", () => {
    render(
      <SeriesLookLockStatusChip
        lang="th"
        bible={{}}
        lookLockEnabled={false}
        presetMixEnabled
      />
    );
    expect(screen.queryByText("ลุคภาพซีรีส์")).not.toBeInTheDocument();
  });

  it("shows the active genre look by default in the episode workspace", () => {
    const identity = getSeriesLookLockGenreIdentity("horror_thriller");
    render(
      <SeriesLookLockStatusChip
        lang="en"
        bible={{
          presetVisualIdentity: identity,
          lookLockControl: {
            mode: "genre",
            genreKey: "horror_thriller",
            revision: 2,
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        }}
        lookLockEnabled
        presetMixEnabled={false}
      />
    );
    expect(screen.getByText("Series look")).toBeInTheDocument();
    expect(screen.getByText("Controlled atmospheric thriller")).toBeInTheDocument();
  });
});
