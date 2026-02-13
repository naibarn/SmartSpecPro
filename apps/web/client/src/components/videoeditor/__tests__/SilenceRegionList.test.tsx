/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SilenceRegionList } from "../SilenceRegionList";
import type { SilentRegion, Track } from "../../../types/videoEditor";

// Test helpers
function makeRegion(overrides?: Partial<SilentRegion>): SilentRegion {
  return {
    id: overrides?.id || "region-1",
    trackId: overrides?.trackId || "track-audio-1",
    startTime: overrides?.startTime ?? 5.0,
    endTime: overrides?.endTime ?? 10.0,
    duration: overrides?.duration ?? 5.0,
    adjustedStartTime: overrides?.adjustedStartTime ?? 5.2,
    adjustedEndTime: overrides?.adjustedEndTime ?? 9.8,
    adjustedDuration: overrides?.adjustedDuration ?? 4.6,
    selected: overrides?.selected ?? true,
    averageDb: overrides?.averageDb ?? -45,
    skipped: overrides?.skipped ?? false,
    ...overrides,
  };
}

function makeTrack(overrides?: Partial<Track>): Track {
  return {
    id: overrides?.id || "track-audio-1",
    type: overrides?.type || "audio",
    name: overrides?.name || "Audio Track 1",
    clips: overrides?.clips || [],
    muted: overrides?.muted ?? false,
    locked: overrides?.locked ?? false,
    visible: overrides?.visible ?? true,
    ...overrides,
  };
}

describe("SilenceRegionList", () => {
  const defaultProps = {
    regions: [],
    onToggleRegion: vi.fn(),
    onSelectAll: vi.fn(),
    onDeselectAll: vi.fn(),
    tracks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render one row per region", () => {
    const regions = [
      makeRegion({ id: "region-1" }),
      makeRegion({ id: "region-2" }),
      makeRegion({ id: "region-3" }),
    ];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    expect(screen.getByText("Region #1")).toBeTruthy();
    expect(screen.getByText("Region #2")).toBeTruthy();
    expect(screen.getByText("Region #3")).toBeTruthy();
  });

  it("should render checked checkbox for selected region", () => {
    const regions = [makeRegion({ id: "region-1", selected: true })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("should render unchecked checkbox for unselected region", () => {
    const regions = [makeRegion({ id: "region-1", selected: false })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("should call onToggleRegion when checkbox is clicked", () => {
    const onToggleRegion = vi.fn();
    const regions = [makeRegion({ id: "region-1" })];

    render(
      <SilenceRegionList
        {...defaultProps}
        regions={regions}
        onToggleRegion={onToggleRegion}
      />
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(onToggleRegion).toHaveBeenCalledWith("region-1");
  });

  it("should render Select All button", () => {
    render(<SilenceRegionList {...defaultProps} />);

    const selectAllBtn = screen.getByText("Select All");
    expect(selectAllBtn).toBeTruthy();
  });

  it("should call onSelectAll when Select All is clicked", () => {
    const onSelectAll = vi.fn();

    render(<SilenceRegionList {...defaultProps} onSelectAll={onSelectAll} />);

    const selectAllBtn = screen.getByText("Select All");
    fireEvent.click(selectAllBtn);

    expect(onSelectAll).toHaveBeenCalled();
  });

  it("should render Deselect All button", () => {
    render(<SilenceRegionList {...defaultProps} />);

    const deselectAllBtn = screen.getByText("Deselect All");
    expect(deselectAllBtn).toBeTruthy();
  });

  it("should call onDeselectAll when Deselect All is clicked", () => {
    const onDeselectAll = vi.fn();

    render(
      <SilenceRegionList {...defaultProps} onDeselectAll={onDeselectAll} />
    );

    const deselectAllBtn = screen.getByText("Deselect All");
    fireEvent.click(deselectAllBtn);

    expect(onDeselectAll).toHaveBeenCalled();
  });

  it("should show Skipped badge for skipped regions", () => {
    const regions = [makeRegion({ id: "region-1", skipped: true })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    const skippedBadge = screen.getByText("Skipped");
    expect(skippedBadge).toBeTruthy();
  });

  it("should disable checkbox for skipped regions", () => {
    const regions = [makeRegion({ id: "region-1", skipped: true })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it("should call onScrollToRegion when region row is clicked", () => {
    const onScrollToRegion = vi.fn();
    const regions = [makeRegion({ id: "region-1" })];

    render(
      <SilenceRegionList
        {...defaultProps}
        regions={regions}
        onScrollToRegion={onScrollToRegion}
      />
    );

    // Click the region header (not the checkbox)
    const regionHeader = screen.getByTestId("region-header-region-1");
    fireEvent.click(regionHeader);

    expect(onScrollToRegion).toHaveBeenCalledWith("region-1");
  });

  it("should not call onScrollToRegion if prop is not provided", () => {
    const regions = [makeRegion({ id: "region-1" })];

    // Should not throw when onScrollToRegion is undefined
    expect(() => {
      render(<SilenceRegionList {...defaultProps} regions={regions} />);
      const regionHeader = screen.getByTestId("region-header-region-1");
      fireEvent.click(regionHeader);
    }).not.toThrow();
  });

  it("should expand and show details when expand button is clicked", () => {
    const regions = [makeRegion({ id: "region-1", startTime: 5.0, endTime: 10.0 })];
    const tracks = [makeTrack({ id: "track-audio-1", name: "Audio 1" })];

    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);

    // Details should not be visible initially
    expect(screen.queryByText("Start")).toBeNull();

    // Click expand button
    const expandBtn = screen.getByTestId("expand-btn-region-1");
    fireEvent.click(expandBtn);

    // Details should now be visible
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("End")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Avg Level")).toBeTruthy();
    expect(screen.getByText("Track")).toBeTruthy();
    expect(screen.getByText("Audio 1")).toBeTruthy();
  });

  it("should show empty state when no regions", () => {
    render(<SilenceRegionList {...defaultProps} regions={[]} />);

    expect(screen.getByText("No silent regions detected")).toBeTruthy();
    expect(screen.getByText("Try adjusting the threshold or minimum duration")).toBeTruthy();
  });

  it("should display region count in header", () => {
    const regions = [
      makeRegion({ id: "region-1" }),
      makeRegion({ id: "region-2" }),
    ];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    expect(screen.getByText("Detected Regions (2)")).toBeTruthy();
  });

  it("should show Selected badge for selected non-skipped regions", () => {
    const regions = [makeRegion({ id: "region-1", selected: true, skipped: false })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    const selectedBadge = screen.getByText("Selected");
    expect(selectedBadge).toBeTruthy();
  });

  it("should not show Selected badge for unselected regions", () => {
    const regions = [makeRegion({ id: "region-1", selected: false })];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    expect(screen.queryByText("Selected")).toBeNull();
  });

  it("should show adjusted times in details when different from original", () => {
    const regions = [
      makeRegion({
        id: "region-1",
        startTime: 5.0,
        endTime: 10.0,
        adjustedStartTime: 5.2,
        adjustedEndTime: 9.8,
        adjustedDuration: 4.6,
      }),
    ];

    render(<SilenceRegionList {...defaultProps} regions={regions} />);

    // Expand details
    const expandBtn = screen.getByTestId("expand-btn-region-1");
    fireEvent.click(expandBtn);

    // Should show adjusted times
    expect(screen.getByText("Adj. Start")).toBeTruthy();
    expect(screen.getByText("Adj. End")).toBeTruthy();
    expect(screen.getByText("Adj. Duration")).toBeTruthy();
  });

  it("should resolve track name from tracks prop", () => {
    const regions = [makeRegion({ id: "region-1", trackId: "track-custom" })];
    const tracks = [makeTrack({ id: "track-custom", name: "Custom Track Name" })];

    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);

    // Expand details
    const expandBtn = screen.getByTestId("expand-btn-region-1");
    fireEvent.click(expandBtn);

    expect(screen.getByText("Custom Track Name")).toBeTruthy();
  });

  it("should show Unknown for unresolved track", () => {
    const regions = [makeRegion({ id: "region-1", trackId: "nonexistent" })];
    const tracks = [makeTrack({ id: "track-other", name: "Other Track" })];

    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);

    // Expand details
    const expandBtn = screen.getByTestId("expand-btn-region-1");
    fireEvent.click(expandBtn);

    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
