/**
 * Task #26 (data sanity — episode number beyond the planned season size,
 * e.g. episode 11 while the story bible's season plan only covers 10) —
 * `VerticalDramaEpisodeWorkspace`'s `breakdownStatus === "beyond_plan"`
 * warning banner: shown/absent per status, interpolated planned-episode
 * count, and the "go extend the plan" link href. Mirrors
 * `VerticalDramaEpisodeWorkspace.productionWizard.test.tsx`'s render/screen
 * convention exactly.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VerticalDramaEpisodeWorkspace } from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

const baseEpisode = {
  id: "ep-1",
  episodeNumber: 11,
  title: "Episode 11",
  status: "in_progress",
};

describe("VerticalDramaEpisodeWorkspace — episode-beyond-plan banner (task #26)", () => {
  it("renders nothing when breakdownStatus is undefined (query not loaded yet)", () => {
    render(<VerticalDramaEpisodeWorkspace episode={baseEpisode} />);
    expect(
      screen.queryByTestId("vd-episode-beyond-plan-banner")
    ).not.toBeInTheDocument();
  });

  it("renders nothing when breakdownStatus is matched (within plan)", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        breakdownStatus="matched"
        plannedEpisodeCount={10}
      />
    );
    expect(
      screen.queryByTestId("vd-episode-beyond-plan-banner")
    ).not.toBeInTheDocument();
  });

  it("renders nothing when breakdownStatus is no_plan (grandfathered legacy series)", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        breakdownStatus="no_plan"
        plannedEpisodeCount={0}
      />
    );
    expect(
      screen.queryByTestId("vd-episode-beyond-plan-banner")
    ).not.toBeInTheDocument();
  });

  it("renders the compact warning banner with the interpolated planned-episode count when breakdownStatus is beyond_plan", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        breakdownStatus="beyond_plan"
        plannedEpisodeCount={10}
        seasonPlanTabHref="/drama-series/10?tab=overview"
      />
    );
    const banner = screen.getByTestId("vd-episode-beyond-plan-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("10");
  });

  it("renders a link to the season-plan tab href when provided", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        breakdownStatus="beyond_plan"
        plannedEpisodeCount={10}
        seasonPlanTabHref="/drama-series/10?tab=overview"
      />
    );
    const link = screen.getByTestId("vd-episode-beyond-plan-link");
    expect(link).toHaveAttribute("href", "/drama-series/10?tab=overview");
  });

  it("omits the link when no seasonPlanTabHref is supplied, but still shows the banner text", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        breakdownStatus="beyond_plan"
        plannedEpisodeCount={10}
      />
    );
    expect(
      screen.getByTestId("vd-episode-beyond-plan-banner")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-episode-beyond-plan-link")
    ).not.toBeInTheDocument();
  });

  it("renders in Thai locale with the plan-count substituted into the Thai template", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        locale="th"
        breakdownStatus="beyond_plan"
        plannedEpisodeCount={7}
      />
    );
    expect(
      screen.getByTestId("vd-episode-beyond-plan-banner")
    ).toHaveTextContent("ตอนนี้อยู่นอกแผนซีซั่นปัจจุบัน (แผนมี 7 ตอน)");
  });
});
