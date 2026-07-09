/**
 * Ad Banner Overlay — per-episode banner selection section (F131W, task
 * #30-A2, plan.md §6 episode side) coverage for
 * `VerticalDramaEpisodeWorkspace.tsx`: flag/shot gating, ready-design
 * filtering, selection + timing editing, client-side validation mirroring
 * the server's codes, excluded-by-approval disabled rows, and the save
 * payload shape. Mirrors `VerticalDramaEpisodeWorkspace.productionWizard
 * .test.tsx`'s render/screen/fireEvent convention exactly.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VerticalDramaEpisodeWorkspace,
  type VerticalDramaAdBannerDesignSummaryView,
} from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";

const baseEpisode = {
  id: "ep-1",
  episodeNumber: 1,
  title: "Episode 1",
  status: "in_progress",
};

const storyboardPanelWithOneShot = {
  storyboard: {
    shots: [
      { shot_number: 1, visual_description: "s1", characters: [] as string[] },
    ],
  },
};

function readyDesign(
  overrides: Partial<VerticalDramaAdBannerDesignSummaryView> = {}
): VerticalDramaAdBannerDesignSummaryView {
  return {
    id: "banner-1",
    placementId: "bottom_band",
    status: "ready",
    imageUrl: "https://cdn.example.com/banner-1.png",
    label: "ลดพิเศษ 30%",
    defaultTiming: { mode: "entire" },
    excludedByApproval: false,
    ...overrides,
  };
}

describe("VerticalDramaEpisodeWorkspace — Ad Banner Overlay section (F131W, #30-A2)", () => {
  it("renders nothing when adBannerOverlayEnabled is false, even with a storyboard", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled={false}
        adBannerPlanPanel={{ designs: [readyDesign()] }}
      />
    );
    expect(
      screen.queryByTestId("vd-ad-banner-plan-section")
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no storyboard yet, even with the flag on", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        adBannerOverlayEnabled
        adBannerPlanPanel={{ designs: [readyDesign()] }}
      />
    );
    expect(
      screen.queryByTestId("vd-ad-banner-plan-section")
    ).not.toBeInTheDocument();
  });

  it("renders the section (collapsed toggle off) once both the flag is on and a storyboard exists", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{ designs: [] }}
      />
    );
    const section = screen.getByTestId("vd-ad-banner-plan-section");
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent("Ad banners in this video");
    expect(screen.getByTestId("vd-ad-banner-enabled-toggle")).toHaveAttribute(
      "data-state",
      "unchecked"
    );
  });

  it("renders in Thai locale", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        locale="th"
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{ designs: [] }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-plan-section")).toHaveTextContent(
      "แบนเนอร์ในวิดีโอนี้"
    );
  });

  it("pre-checks the toggle and shows the empty-designs hint when the plan is enabled but no ready design exists", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [],
          plan: { enabled: true, selections: [] },
        }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-enabled-toggle")).toHaveAttribute(
      "data-state",
      "checked"
    );
    expect(
      screen.getByText(/No ready ad banner designs yet/)
    ).toBeInTheDocument();
  });

  it("only lists READY designs with an imageUrl — draft/generating/no-image designs never render a row", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [
            readyDesign({ id: "ready-1" }),
            readyDesign({
              id: "draft-1",
              status: "draft",
              imageUrl: undefined,
            }),
            readyDesign({
              id: "no-image",
              status: "ready",
              imageUrl: undefined,
            }),
          ],
          plan: { enabled: true, selections: [] },
        }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-row-ready-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-ad-banner-row-draft-1")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-ad-banner-row-no-image")
    ).not.toBeInTheDocument();
  });

  it("shows an excluded-by-approval design as a disabled checkbox with the requires-approval badge", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign({ excludedByApproval: true })],
          plan: { enabled: true, selections: [] },
        }}
      />
    );
    const row = screen.getByTestId("vd-ad-banner-row-banner-1");
    expect(row).toHaveTextContent("Needs approval before use");
    expect(
      screen.getByTestId("vd-ad-banner-checkbox-banner-1")
    ).toHaveAttribute("data-disabled");
  });

  it("pre-checks a design's checkbox from the current plan's selections", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [{ bannerId: "banner-1" }] },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-checkbox-banner-1")
    ).toHaveAttribute("data-state", "checked");
  });

  it("selecting a design then saving calls onSave with the design in selections, entire-mode by default", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [] },
          onSave,
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-checkbox-banner-1"));
    fireEvent.click(screen.getByTestId("vd-ad-banner-save"));

    expect(onSave).toHaveBeenCalledWith({
      enabled: true,
      selections: [
        {
          bannerId: "banner-1",
          timing: { mode: "entire", startSec: 0, durationSec: 3 },
        },
      ],
    });
  });

  it("unchecking a previously-selected design removes it from the save payload", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [{ bannerId: "banner-1" }] },
          onSave,
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-checkbox-banner-1"));
    fireEvent.click(screen.getByTestId("vd-ad-banner-save"));
    expect(onSave).toHaveBeenCalledWith({ enabled: true, selections: [] });
  });

  it("switching a selection to window mode and editing start/duration is reflected in the save payload", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign({ placementId: "fullscreen" })],
          plan: { enabled: true, selections: [{ bannerId: "banner-1" }] },
          onSave,
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-mode-window-banner-1"));
    fireEvent.change(screen.getByTestId("vd-ad-banner-start-banner-1"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("vd-ad-banner-duration-banner-1"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByTestId("vd-ad-banner-save"));

    expect(onSave).toHaveBeenCalledWith({
      enabled: true,
      selections: [
        {
          bannerId: "banner-1",
          timing: { mode: "window", startSec: 5, durationSec: 4 },
        },
      ],
    });
  });

  it("toggling the whole-section switch off is reflected in the save payload", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [{ bannerId: "banner-1" }] },
          onSave,
        }}
      />
    );
    fireEvent.click(screen.getByTestId("vd-ad-banner-enabled-toggle"));
    fireEvent.click(screen.getByTestId("vd-ad-banner-save"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("shows a validation message and disables save when more than 5 designs are selected", () => {
    const designs = Array.from({ length: 6 }, (_, i) =>
      readyDesign({ id: `b${i}` })
    );
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs,
          plan: {
            enabled: true,
            selections: designs.map(d => ({ bannerId: d.id })),
          },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-validation-errors")
    ).toHaveTextContent("You can select at most 5 ad banners.");
    expect(screen.getByTestId("vd-ad-banner-save")).toBeDisabled();
  });

  it("shows a validation message and disables save when two fullscreen selections overlap in time", () => {
    const designs = [
      readyDesign({
        id: "fs-1",
        placementId: "fullscreen",
        defaultTiming: { mode: "window", startSec: 0, durationSec: 5 },
      }),
      readyDesign({
        id: "fs-2",
        placementId: "fullscreen",
        defaultTiming: { mode: "window", startSec: 2, durationSec: 5 },
      }),
    ];
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs,
          plan: {
            enabled: true,
            selections: [{ bannerId: "fs-1" }, { bannerId: "fs-2" }],
          },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-validation-errors")
    ).toHaveTextContent("Selected fullscreen ad banners overlap in time.");
    expect(screen.getByTestId("vd-ad-banner-save")).toBeDisabled();
  });

  it("does not flag a band + fullscreen combination as an overlap", () => {
    const designs = [
      readyDesign({
        id: "band-1",
        placementId: "bottom_band",
        defaultTiming: { mode: "entire" },
      }),
      readyDesign({
        id: "fs-1",
        placementId: "fullscreen",
        defaultTiming: { mode: "window", startSec: 0, durationSec: 3 },
      }),
    ];
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs,
          plan: {
            enabled: true,
            selections: [{ bannerId: "band-1" }, { bannerId: "fs-1" }],
          },
        }}
      />
    );
    expect(
      screen.queryByTestId("vd-ad-banner-validation-errors")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-ad-banner-save")).not.toBeDisabled();
  });

  it("shows the saving label and disables save while a save is in flight", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [] },
          saving: true,
        }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-save")).toHaveTextContent(
      "Saving…"
    );
    expect(screen.getByTestId("vd-ad-banner-save")).toBeDisabled();
  });

  it("shows a save error message when provided", () => {
    render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [] },
          error: "Something went wrong",
        }}
      />
    );
    expect(screen.getByTestId("vd-ad-banner-save-error")).toHaveTextContent(
      "Something went wrong"
    );
  });

  it("re-seeds local draft state when the plan prop changes (e.g. after a refetch)", () => {
    const { rerender } = render(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [] },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-checkbox-banner-1")
    ).toHaveAttribute("data-state", "unchecked");

    rerender(
      <VerticalDramaEpisodeWorkspace
        episode={baseEpisode}
        storyboardPanel={storyboardPanelWithOneShot}
        adBannerOverlayEnabled
        adBannerPlanPanel={{
          designs: [readyDesign()],
          plan: { enabled: true, selections: [{ bannerId: "banner-1" }] },
        }}
      />
    );
    expect(
      screen.getByTestId("vd-ad-banner-checkbox-banner-1")
    ).toHaveAttribute("data-state", "checked");
  });
});
