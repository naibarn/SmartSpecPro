diff --git a/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx b/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx
new file mode 100644
index 0000000..4a10623
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/SilenceRegionList.tsx
@@ -0,0 +1,347 @@
+/**
+ * SilenceRegionList - Displays a scrollable list of detected silent regions
+ * with per-region checkboxes, bulk selection controls, and expandable details.
+ */
+
+import React, { useState } from 'react';
+import {
+  type SilentRegion,
+  type Track,
+  formatTime,
+} from '../../types/videoEditor';
+
+export interface SilenceRegionListProps {
+  regions: SilentRegion[];
+  onToggleRegion: (regionId: string) => void;
+  onSelectAll: () => void;
+  onDeselectAll: () => void;
+  onScrollToRegion?: (regionId: string) => void;
+  tracks: Track[];
+}
+
+export const SilenceRegionList: React.FC<SilenceRegionListProps> = ({
+  regions,
+  onToggleRegion,
+  onSelectAll,
+  onDeselectAll,
+  onScrollToRegion,
+  tracks,
+}) => {
+  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
+
+  const toggleExpanded = (regionId: string) => {
+    setExpandedRegions((prev) => {
+      const next = new Set(prev);
+      if (next.has(regionId)) {
+        next.delete(regionId);
+      } else {
+        next.add(regionId);
+      }
+      return next;
+    });
+  };
+
+  const resolveTrackName = (trackId: string): string => {
+    return tracks.find((t) => t.id === trackId)?.name || 'Unknown';
+  };
+
+  const handleRegionClick = (regionId: string) => {
+    onScrollToRegion?.(regionId);
+  };
+
+  const handleCheckboxClick = (e: React.MouseEvent) => {
+    e.stopPropagation();
+  };
+
+  return (
+    <div className="silence-region-list">
+      <style>{`
+        .silence-region-list {
+          display: flex;
+          flex-direction: column;
+          height: 100%;
+        }
+        .region-list-header {
+          display: flex;
+          justify-content: space-between;
+          align-items: center;
+          padding: 12px 16px;
+          border-bottom: 1px solid #444;
+          background: #2a2a2a;
+        }
+        .region-list-header > span {
+          font-size: 14px;
+          font-weight: 600;
+          color: #fff;
+        }
+        .region-list-actions {
+          display: flex;
+          gap: 8px;
+        }
+        .region-list-actions button {
+          padding: 6px 12px;
+          background: #333;
+          color: #e0e0e0;
+          border: 1px solid #555;
+          border-radius: 4px;
+          font-size: 12px;
+          cursor: pointer;
+        }
+        .region-list-actions button:hover {
+          background: #444;
+        }
+        .regions-list {
+          flex: 1;
+          overflow-y: auto;
+          padding: 8px;
+        }
+        .region-item {
+          background: #1e1e1e;
+          border: 1px solid #333;
+          border-radius: 6px;
+          margin-bottom: 8px;
+          transition: all 0.2s;
+        }
+        .region-item:hover {
+          border-color: #555;
+        }
+        .region-item.selected {
+          border-color: #0078d4;
+          background: #1a2332;
+        }
+        .region-item.skipped {
+          opacity: 0.6;
+        }
+        .region-header {
+          display: flex;
+          align-items: center;
+          padding: 12px;
+          cursor: pointer;
+          gap: 12px;
+        }
+        .region-checkbox {
+          width: 16px;
+          height: 16px;
+          cursor: pointer;
+        }
+        .region-checkbox:disabled {
+          cursor: not-allowed;
+        }
+        .region-info {
+          flex: 1;
+          display: flex;
+          flex-direction: column;
+          gap: 4px;
+        }
+        .region-title {
+          display: flex;
+          align-items: center;
+          gap: 8px;
+          font-size: 13px;
+          font-weight: 500;
+          color: #e0e0e0;
+        }
+        .badge-selected {
+          background: #0078d4;
+          color: #fff;
+          font-size: 10px;
+          padding: 2px 6px;
+          border-radius: 3px;
+          font-weight: 500;
+        }
+        .badge-skipped {
+          background: #ff9800;
+          color: #1e1e1e;
+          font-size: 10px;
+          padding: 2px 6px;
+          border-radius: 3px;
+          font-weight: 500;
+        }
+        .region-time {
+          font-size: 12px;
+          color: #999;
+        }
+        .expand-btn {
+          padding: 4px 8px;
+          background: none;
+          border: 1px solid #555;
+          border-radius: 3px;
+          color: #999;
+          cursor: pointer;
+          font-size: 11px;
+        }
+        .expand-btn:hover {
+          background: #333;
+          color: #fff;
+        }
+        .region-details {
+          padding: 12px;
+          padding-top: 0;
+          border-top: 1px solid #333;
+        }
+        .detail-row {
+          display: flex;
+          justify-content: space-between;
+          padding: 6px 0;
+          font-size: 12px;
+        }
+        .detail-label {
+          color: #999;
+        }
+        .detail-value {
+          color: #e0e0e0;
+          font-weight: 500;
+        }
+        .empty-state {
+          text-align: center;
+          padding: 40px 20px;
+          color: #999;
+        }
+        .empty-state p {
+          margin: 0;
+          margin-bottom: 8px;
+        }
+        .empty-state .help-text {
+          font-size: 12px;
+          color: #666;
+        }
+      `}</style>
+
+      {/* Header with bulk actions */}
+      <div className="region-list-header">
+        <span>Detected Regions ({regions.length})</span>
+        <div className="region-list-actions">
+          <button onClick={onSelectAll}>Select All</button>
+          <button onClick={onDeselectAll}>Deselect All</button>
+        </div>
+      </div>
+
+      {/* Scrollable region list */}
+      <div className="regions-list">
+        {regions.length === 0 ? (
+          <div className="empty-state">
+            <p>No silent regions detected</p>
+            <p className="help-text">
+              Try adjusting the threshold or minimum duration
+            </p>
+          </div>
+        ) : (
+          regions.map((region, index) => {
+            const isExpanded = expandedRegions.has(region.id);
+            const trackName = resolveTrackName(region.trackId);
+
+            return (
+              <div
+                key={region.id}
+                className={`region-item ${region.selected && !region.skipped ? 'selected' : ''} ${region.skipped ? 'skipped' : ''}`}
+              >
+                <div
+                  className="region-header"
+                  data-testid={`region-header-${region.id}`}
+                  onClick={() => handleRegionClick(region.id)}
+                >
+                  {/* Checkbox */}
+                  <input
+                    type="checkbox"
+                    className="region-checkbox"
+                    checked={region.selected}
+                    disabled={region.skipped}
+                    onChange={() => onToggleRegion(region.id)}
+                    onClick={handleCheckboxClick}
+                  />
+
+                  {/* Region info */}
+                  <div className="region-info">
+                    <div className="region-title">
+                      <span>Region #{index + 1}</span>
+                      {region.selected && !region.skipped && (
+                        <span className="badge-selected">Selected</span>
+                      )}
+                      {region.skipped && (
+                        <span className="badge-skipped">Skipped</span>
+                      )}
+                    </div>
+                    <div className="region-time">
+                      {formatTime(region.startTime)} → {formatTime(region.endTime)}{' '}
+                      ({formatTime(region.duration)})
+                    </div>
+                  </div>
+
+                  {/* Expand button */}
+                  <button
+                    className="expand-btn"
+                    data-testid={`expand-btn-${region.id}`}
+                    onClick={(e) => {
+                      e.stopPropagation();
+                      toggleExpanded(region.id);
+                    }}
+                  >
+                    {isExpanded ? '▲' : '▼'}
+                  </button>
+                </div>
+
+                {/* Expanded details */}
+                {isExpanded && (
+                  <div className="region-details">
+                    <div className="detail-row">
+                      <span className="detail-label">Start</span>
+                      <span className="detail-value">
+                        {formatTime(region.startTime)}
+                      </span>
+                    </div>
+                    <div className="detail-row">
+                      <span className="detail-label">End</span>
+                      <span className="detail-value">
+                        {formatTime(region.endTime)}
+                      </span>
+                    </div>
+                    <div className="detail-row">
+                      <span className="detail-label">Duration</span>
+                      <span className="detail-value">
+                        {formatTime(region.duration)}
+                      </span>
+                    </div>
+                    {region.adjustedStartTime !== region.startTime && (
+                      <div className="detail-row">
+                        <span className="detail-label">Adj. Start</span>
+                        <span className="detail-value">
+                          {formatTime(region.adjustedStartTime)}
+                        </span>
+                      </div>
+                    )}
+                    {region.adjustedEndTime !== region.endTime && (
+                      <div className="detail-row">
+                        <span className="detail-label">Adj. End</span>
+                        <span className="detail-value">
+                          {formatTime(region.adjustedEndTime)}
+                        </span>
+                      </div>
+                    )}
+                    <div className="detail-row">
+                      <span className="detail-label">Adj. Duration</span>
+                      <span className="detail-value">
+                        {region.skipped
+                          ? 'Skipped'
+                          : formatTime(region.adjustedDuration)}
+                      </span>
+                    </div>
+                    <div className="detail-row">
+                      <span className="detail-label">Avg Level</span>
+                      <span className="detail-value">
+                        {region.averageDb.toFixed(1)} dB
+                      </span>
+                    </div>
+                    <div className="detail-row">
+                      <span className="detail-label">Track</span>
+                      <span className="detail-value">{trackName}</span>
+                    </div>
+                  </div>
+                )}
+              </div>
+            );
+          })
+        )}
+      </div>
+    </div>
+  );
+};
diff --git a/apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx b/apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx
new file mode 100644
index 0000000..d2afaa4
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/SilenceRegionList.test.tsx
@@ -0,0 +1,296 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import { SilenceRegionList } from "../SilenceRegionList";
+import type { SilentRegion, Track } from "../../../types/videoEditor";
+
+// Test helpers
+function makeRegion(overrides?: Partial<SilentRegion>): SilentRegion {
+  return {
+    id: overrides?.id || "region-1",
+    trackId: overrides?.trackId || "track-audio-1",
+    startTime: overrides?.startTime ?? 5.0,
+    endTime: overrides?.endTime ?? 10.0,
+    duration: overrides?.duration ?? 5.0,
+    adjustedStartTime: overrides?.adjustedStartTime ?? 5.2,
+    adjustedEndTime: overrides?.adjustedEndTime ?? 9.8,
+    adjustedDuration: overrides?.adjustedDuration ?? 4.6,
+    selected: overrides?.selected ?? true,
+    averageDb: overrides?.averageDb ?? -45,
+    skipped: overrides?.skipped ?? false,
+    ...overrides,
+  };
+}
+
+function makeTrack(overrides?: Partial<Track>): Track {
+  return {
+    id: overrides?.id || "track-audio-1",
+    type: overrides?.type || "audio",
+    name: overrides?.name || "Audio Track 1",
+    clips: overrides?.clips || [],
+    muted: overrides?.muted ?? false,
+    locked: overrides?.locked ?? false,
+    visible: overrides?.visible ?? true,
+    ...overrides,
+  };
+}
+
+describe("SilenceRegionList", () => {
+  const defaultProps = {
+    regions: [],
+    onToggleRegion: vi.fn(),
+    onSelectAll: vi.fn(),
+    onDeselectAll: vi.fn(),
+    tracks: [],
+  };
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("should render one row per region", () => {
+    const regions = [
+      makeRegion({ id: "region-1" }),
+      makeRegion({ id: "region-2" }),
+      makeRegion({ id: "region-3" }),
+    ];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    expect(screen.getByText("Region #1")).toBeTruthy();
+    expect(screen.getByText("Region #2")).toBeTruthy();
+    expect(screen.getByText("Region #3")).toBeTruthy();
+  });
+
+  it("should render checked checkbox for selected region", () => {
+    const regions = [makeRegion({ id: "region-1", selected: true })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
+    expect(checkbox.checked).toBe(true);
+  });
+
+  it("should render unchecked checkbox for unselected region", () => {
+    const regions = [makeRegion({ id: "region-1", selected: false })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
+    expect(checkbox.checked).toBe(false);
+  });
+
+  it("should call onToggleRegion when checkbox is clicked", () => {
+    const onToggleRegion = vi.fn();
+    const regions = [makeRegion({ id: "region-1" })];
+
+    render(
+      <SilenceRegionList
+        {...defaultProps}
+        regions={regions}
+        onToggleRegion={onToggleRegion}
+      />
+    );
+
+    const checkbox = screen.getByRole("checkbox");
+    fireEvent.click(checkbox);
+
+    expect(onToggleRegion).toHaveBeenCalledWith("region-1");
+  });
+
+  it("should render Select All button", () => {
+    render(<SilenceRegionList {...defaultProps} />);
+
+    const selectAllBtn = screen.getByText("Select All");
+    expect(selectAllBtn).toBeTruthy();
+  });
+
+  it("should call onSelectAll when Select All is clicked", () => {
+    const onSelectAll = vi.fn();
+
+    render(<SilenceRegionList {...defaultProps} onSelectAll={onSelectAll} />);
+
+    const selectAllBtn = screen.getByText("Select All");
+    fireEvent.click(selectAllBtn);
+
+    expect(onSelectAll).toHaveBeenCalled();
+  });
+
+  it("should render Deselect All button", () => {
+    render(<SilenceRegionList {...defaultProps} />);
+
+    const deselectAllBtn = screen.getByText("Deselect All");
+    expect(deselectAllBtn).toBeTruthy();
+  });
+
+  it("should call onDeselectAll when Deselect All is clicked", () => {
+    const onDeselectAll = vi.fn();
+
+    render(
+      <SilenceRegionList {...defaultProps} onDeselectAll={onDeselectAll} />
+    );
+
+    const deselectAllBtn = screen.getByText("Deselect All");
+    fireEvent.click(deselectAllBtn);
+
+    expect(onDeselectAll).toHaveBeenCalled();
+  });
+
+  it("should show Skipped badge for skipped regions", () => {
+    const regions = [makeRegion({ id: "region-1", skipped: true })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    const skippedBadge = screen.getByText("Skipped");
+    expect(skippedBadge).toBeTruthy();
+  });
+
+  it("should disable checkbox for skipped regions", () => {
+    const regions = [makeRegion({ id: "region-1", skipped: true })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
+    expect(checkbox.disabled).toBe(true);
+  });
+
+  it("should call onScrollToRegion when region row is clicked", () => {
+    const onScrollToRegion = vi.fn();
+    const regions = [makeRegion({ id: "region-1" })];
+
+    render(
+      <SilenceRegionList
+        {...defaultProps}
+        regions={regions}
+        onScrollToRegion={onScrollToRegion}
+      />
+    );
+
+    // Click the region header (not the checkbox)
+    const regionHeader = screen.getByTestId("region-header-region-1");
+    fireEvent.click(regionHeader);
+
+    expect(onScrollToRegion).toHaveBeenCalledWith("region-1");
+  });
+
+  it("should not call onScrollToRegion if prop is not provided", () => {
+    const regions = [makeRegion({ id: "region-1" })];
+
+    // Should not throw when onScrollToRegion is undefined
+    expect(() => {
+      render(<SilenceRegionList {...defaultProps} regions={regions} />);
+      const regionHeader = screen.getByTestId("region-header-region-1");
+      fireEvent.click(regionHeader);
+    }).not.toThrow();
+  });
+
+  it("should expand and show details when expand button is clicked", () => {
+    const regions = [makeRegion({ id: "region-1", startTime: 5.0, endTime: 10.0 })];
+    const tracks = [makeTrack({ id: "track-audio-1", name: "Audio 1" })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);
+
+    // Details should not be visible initially
+    expect(screen.queryByText("Start")).toBeNull();
+
+    // Click expand button
+    const expandBtn = screen.getByTestId("expand-btn-region-1");
+    fireEvent.click(expandBtn);
+
+    // Details should now be visible
+    expect(screen.getByText("Start")).toBeTruthy();
+    expect(screen.getByText("End")).toBeTruthy();
+    expect(screen.getByText("Duration")).toBeTruthy();
+    expect(screen.getByText("Avg Level")).toBeTruthy();
+    expect(screen.getByText("Track")).toBeTruthy();
+    expect(screen.getByText("Audio 1")).toBeTruthy();
+  });
+
+  it("should show empty state when no regions", () => {
+    render(<SilenceRegionList {...defaultProps} regions={[]} />);
+
+    expect(screen.getByText("No silent regions detected")).toBeTruthy();
+    expect(screen.getByText("Try adjusting the threshold or minimum duration")).toBeTruthy();
+  });
+
+  it("should display region count in header", () => {
+    const regions = [
+      makeRegion({ id: "region-1" }),
+      makeRegion({ id: "region-2" }),
+    ];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    expect(screen.getByText("Detected Regions (2)")).toBeTruthy();
+  });
+
+  it("should show Selected badge for selected non-skipped regions", () => {
+    const regions = [makeRegion({ id: "region-1", selected: true, skipped: false })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    const selectedBadge = screen.getByText("Selected");
+    expect(selectedBadge).toBeTruthy();
+  });
+
+  it("should not show Selected badge for unselected regions", () => {
+    const regions = [makeRegion({ id: "region-1", selected: false })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    expect(screen.queryByText("Selected")).toBeNull();
+  });
+
+  it("should show adjusted times in details when different from original", () => {
+    const regions = [
+      makeRegion({
+        id: "region-1",
+        startTime: 5.0,
+        endTime: 10.0,
+        adjustedStartTime: 5.2,
+        adjustedEndTime: 9.8,
+        adjustedDuration: 4.6,
+      }),
+    ];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} />);
+
+    // Expand details
+    const expandBtn = screen.getByTestId("expand-btn-region-1");
+    fireEvent.click(expandBtn);
+
+    // Should show adjusted times
+    expect(screen.getByText("Adj. Start")).toBeTruthy();
+    expect(screen.getByText("Adj. End")).toBeTruthy();
+    expect(screen.getByText("Adj. Duration")).toBeTruthy();
+  });
+
+  it("should resolve track name from tracks prop", () => {
+    const regions = [makeRegion({ id: "region-1", trackId: "track-custom" })];
+    const tracks = [makeTrack({ id: "track-custom", name: "Custom Track Name" })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);
+
+    // Expand details
+    const expandBtn = screen.getByTestId("expand-btn-region-1");
+    fireEvent.click(expandBtn);
+
+    expect(screen.getByText("Custom Track Name")).toBeTruthy();
+  });
+
+  it("should show Unknown for unresolved track", () => {
+    const regions = [makeRegion({ id: "region-1", trackId: "nonexistent" })];
+    const tracks = [makeTrack({ id: "track-other", name: "Other Track" })];
+
+    render(<SilenceRegionList {...defaultProps} regions={regions} tracks={tracks} />);
+
+    // Expand details
+    const expandBtn = screen.getByTestId("expand-btn-region-1");
+    fireEvent.click(expandBtn);
+
+    expect(screen.getByText("Unknown")).toBeTruthy();
+  });
+});
