/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SilenceDetectionDialog from "../SilenceDetectionDialog";
import type { VideoEditorProject } from "../../../types/videoEditor";
import { createEmptyProject } from "../../../types/videoEditor";

// Hoist mock helpers so they can be referenced inside vi.mock
const mockGetWaveformPeaks = vi.fn(() =>
  Promise.resolve({ derived: { peaks: [0.1, 0.2, 0.3] } }),
);
const mockCreateMediaJobClient = vi.fn(() =>
  Promise.resolve({ getWaveformPeaks: mockGetWaveformPeaks }),
);

vi.mock("../../../services/mediaJobClient", () => ({
  createMediaJobClient: (...args: unknown[]) => mockCreateMediaJobClient(...args),
}));

function makeTestProject(): VideoEditorProject {
  const p = createEmptyProject("Test");
  return p;
}

function makeProjectWithAudioTrack(opts?: {
  waveformData?: number[];
}): VideoEditorProject {
  const p = createEmptyProject("AudioTest");
  const assetId = "audio-asset-1";
  (p.assets as Record<string, any>)[assetId] = {
    id: assetId,
    path: "/test/audio.wav",
    type: "audio",
    ...(opts?.waveformData ? { waveformData: opts.waveformData } : {}),
  };
  p.timeline.tracks.push({
    id: "track-audio-1",
    type: "audio",
    clips: [
      {
        id: "clip-1",
        assetId,
        startTime: 0,
        endTime: 10,
        duration: 10,
        offset: 0,
        trimStart: 0,
        trimEnd: 0,
      },
    ],
    muted: false,
    locked: false,
    visible: true,
  } as any);
  return p;
}

describe("SilenceDetectionDialog", () => {
  const mockOnClose = vi.fn();
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four structural zones", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByTestId("silence-dialog-header")).toBeDefined();
    expect(screen.getByTestId("silence-dialog-settings")).toBeDefined();
    expect(screen.getByTestId("silence-dialog-timeline")).toBeDefined();
    expect(screen.getByTestId("silence-dialog-footer")).toBeDefined();
  });

  it("renders the title 'Silence Detection'", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText("Silence Detection")).toBeDefined();
  });

  it("disables Export button when no analysis has been performed", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    const exportBtn = screen.getByTestId("export-to-timeline-btn");
    expect(exportBtn.hasAttribute("disabled")).toBe(true);
  });

  it("renders Export to Timeline button text", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText("Export to Timeline")).toBeDefined();
  });

  it("uses responsive layout classes for the main content area", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    // Verify the main container has the class that the responsive CSS targets
    const mainEl = document.querySelector(".silence-dialog-main");
    expect(mainEl).not.toBeNull();
  });

  it("calls onClose on ESC key press", () => {
    render(
      <SilenceDetectionDialog
        project={makeTestProject()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

describe("SilenceDetectionDialog — Waveform Data Availability", () => {
  const mockOnClose = vi.fn();
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("triggers waveform_peaks job when waveformData is missing", async () => {
    render(
      <SilenceDetectionDialog
        project={makeProjectWithAudioTrack()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    await waitFor(() => {
      expect(mockCreateMediaJobClient).toHaveBeenCalled();
    });
    expect(mockGetWaveformPeaks).toHaveBeenCalledWith("/test/audio.wav");
  });

  it("shows loading skeleton while fetching waveform data", () => {
    // Make the fetch never resolve
    mockCreateMediaJobClient.mockReturnValue(new Promise(() => {}));

    render(
      <SilenceDetectionDialog
        project={makeProjectWithAudioTrack()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByTestId("waveform-loading")).toBeDefined();
  });

  it("shows 'Waveform unavailable' on waveform fetch failure", async () => {
    mockCreateMediaJobClient.mockResolvedValue({
      getWaveformPeaks: vi.fn(() => Promise.reject(new Error("Network error"))),
    });

    render(
      <SilenceDetectionDialog
        project={makeProjectWithAudioTrack()}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("waveform-error")).toBeDefined();
    });
    expect(screen.getByText("Waveform unavailable")).toBeDefined();
  });

  it("does not fetch waveform when data already exists on asset", () => {
    render(
      <SilenceDetectionDialog
        project={makeProjectWithAudioTrack({ waveformData: [0.5, 0.6, 0.7] })}
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(mockCreateMediaJobClient).not.toHaveBeenCalled();
  });
});
