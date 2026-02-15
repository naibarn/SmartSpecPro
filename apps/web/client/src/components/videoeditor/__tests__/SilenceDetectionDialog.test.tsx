/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

function makeProjectWithInvalidFirstVideoClip(): VideoEditorProject {
  const p = createEmptyProject("VideoClipFallback");
  const missingAssetId = "video-missing";
  const validAssetId = "video-valid";

  (p.assets as Record<string, any>)[missingAssetId] = {
    id: missingAssetId,
    path: "",
    type: "video",
    waveformData: [0.1, 0.2, 0.3],
  };

  (p.assets as Record<string, any>)[validAssetId] = {
    id: validAssetId,
    path: "/test/video-valid.mp4",
    type: "video",
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-missing",
      assetId: missingAssetId,
      startTime: 0,
      duration: 5,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
    {
      id: "clip-valid",
      assetId: validAssetId,
      startTime: 5,
      duration: 5,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];

  return p;
}

function makeProjectWithVideoTrack(): VideoEditorProject {
  const p = createEmptyProject("VideoTrack");
  const assetId = "video-asset-1";
  (p.assets as Record<string, any>)[assetId] = {
    id: assetId,
    path: "/test/video.mp4",
    type: "video",
    waveformData: [0.1, 0.2, 0.3],
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-video-1",
      assetId,
      startTime: 0,
      duration: 10,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];

  return p;
}

function makeProjectWithSelectedVideoStartingLater(): VideoEditorProject {
  const p = createEmptyProject("VideoStartLater");
  const assetId = "video-later-asset";
  (p.assets as Record<string, any>)[assetId] = {
    id: assetId,
    path: "/test/video-later.mp4",
    type: "video",
    waveformData: [0.2, 0.3, 0.4],
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-later",
      assetId,
      startTime: 12,
      duration: 8,
      trimIn: 2,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];
  p.settings.duration = 25;
  return p;
}

function makeProjectWithOriginalPathOnlyVideo(): VideoEditorProject {
  const p = createEmptyProject("OriginalPathOnly");
  const assetId = "video-original-path";
  (p.assets as Record<string, any>)[assetId] = {
    id: assetId,
    path: "",
    originalPath: "/test/video-original.mp4",
    type: "video",
    waveformData: [0.1, 0.2, 0.3],
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-original-path",
      assetId,
      startTime: 0,
      duration: 6,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];
  p.settings.duration = 6;
  return p;
}

function makeProjectWithV2MsFieldsOnly(): VideoEditorProject {
  const p = createEmptyProject("V2MsOnly");
  const assetId = "video-ms-asset";
  (p.assets as Record<string, any>)[assetId] = {
    id: assetId,
    path: "/test/video-ms.mp4",
    type: "video",
    waveformData: [0.1, 0.2, 0.3],
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-ms-only",
      assetId,
      startMs: 12000,
      durationMs: 8000,
      inMs: 2000,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];
  (p.settings as any).duration = undefined;
  (p.settings as any).durationMs = 25000;
  return p;
}

function makeProjectWithDifferentSelectedAndAnalyzedClips(): VideoEditorProject {
  const p = createEmptyProject("SelectedVsAnalyzed");
  const analyzedAssetId = "video-analyzed-asset";
  const selectedAssetId = "video-selected-asset";
  (p.assets as Record<string, any>)[analyzedAssetId] = {
    id: analyzedAssetId,
    path: "/test/video-analyzed.mp4",
    type: "video",
    waveformData: [0.1, 0.2, 0.3],
  };
  (p.assets as Record<string, any>)[selectedAssetId] = {
    id: selectedAssetId,
    path: "/test/video-selected.mp4",
    type: "video",
    waveformData: [0.2, 0.3, 0.4],
  };

  const v1 = p.timeline.tracks.find((t) => t.type === "video");
  if (!v1) return p;

  v1.clips = [
    {
      id: "clip-analyzed-first",
      assetId: analyzedAssetId,
      startTime: 0,
      duration: 8,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
    {
      id: "clip-selected-second",
      assetId: selectedAssetId,
      startTime: 10,
      duration: 8,
      trimIn: 0,
      trimOut: 0,
      trackId: v1.id,
      volume: 1,
      speed: 1,
      effects: [],
    } as any,
  ];
  p.settings.duration = 20;
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

  it("auto-enables Skip Silence Preview after successful analysis", async () => {
    const mockDetectDeadAir = vi.fn(() =>
      Promise.resolve({
        derived: {
          silenceSegments: [{ startMs: 1000, endMs: 2000, averageDb: -42 }],
        },
      }),
    );

    mockCreateMediaJobClient.mockResolvedValue({
      getWaveformPeaks: mockGetWaveformPeaks,
      detectDeadAir: mockDetectDeadAir,
    });

    const project = makeProjectWithVideoTrack();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-video-1"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByTestId("stats-section")).toBeDefined();
    });

    const skipToggle = screen.getByLabelText("Skip Silence Preview") as HTMLInputElement;
    expect(skipToggle.checked).toBe(true);
  });

  it("shows progress bar and percent while analyzing", async () => {
    let resolveDetect: ((value: any) => void) | null = null;

    const mockDetectDeadAir = vi.fn(
      (_assetUri: string, _params: unknown, onProgress?: (progress: any) => void) => {
        onProgress?.({
          jobId: "job-1",
          status: "running",
          progress: 0.42,
          stage: "detecting_silence",
          message: "Detecting silence...",
        });
        return new Promise((resolve) => {
          resolveDetect = resolve;
        });
      },
    );

    mockCreateMediaJobClient.mockResolvedValue({
      getWaveformPeaks: mockGetWaveformPeaks,
      detectDeadAir: mockDetectDeadAir,
    });

    render(
      <SilenceDetectionDialog
        project={makeProjectWithVideoTrack()}
        selectedClipId="clip-video-1"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    fireEvent.click(screen.getByTestId("analyze-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("analysis-progress")).toBeDefined();
    });

    const progress = screen.getByTestId("analysis-progress");
    expect(within(progress).getByText("42%")).toBeDefined();
    expect(within(progress).getByText("Detecting silence...")).toBeDefined();

    resolveDetect?.({
      derived: {
        silenceSegments: [],
      },
    });

    await waitFor(() => {
      expect(screen.queryByTestId("analysis-progress")).toBeNull();
    });
  });

  it("shows preview from selected clip even if first clip in track has invalid path", () => {
    const project = makeProjectWithInvalidFirstVideoClip();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-valid"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.queryByText("Select a track with clips to preview")).toBeNull();
    expect(screen.getByLabelText("Skip Silence Preview")).toBeDefined();
  });

  it("seeds preview timeline time to selected clip start", () => {
    const project = makeProjectWithSelectedVideoStartingLater();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-later"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    const seekBar = screen.getByLabelText("Seek video position") as HTMLInputElement;
    expect(Number(seekBar.value)).toBeCloseTo(12, 2);
  });

  it("uses originalPath as preview URI when path is empty", () => {
    const project = makeProjectWithOriginalPathOnlyVideo();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-original-path"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    expect(screen.queryByText("Select a track with clips to preview")).toBeNull();
    expect(screen.getByLabelText("Seek video position")).toBeDefined();
  });

  it("supports v2 clip fields (startMs/durationMs/inMs) for preview timing", () => {
    const project = makeProjectWithV2MsFieldsOnly();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-ms-only"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    const seekBar = screen.getByLabelText("Seek video position") as HTMLInputElement;
    expect(Number(seekBar.value)).toBeCloseTo(12, 2);
  });

  it("uses analyzed clip source as preview source after analysis", async () => {
    const mockDetectDeadAir = vi.fn(() =>
      Promise.resolve({
        derived: {
          silenceSegments: [{ startMs: 1000, endMs: 2000, averageDb: -42 }],
        },
      }),
    );

    mockCreateMediaJobClient.mockResolvedValue({
      getWaveformPeaks: mockGetWaveformPeaks,
      detectDeadAir: mockDetectDeadAir,
    });

    const project = makeProjectWithDifferentSelectedAndAnalyzedClips();

    render(
      <SilenceDetectionDialog
        project={project}
        selectedClipId="clip-selected-second"
        onExportToTimeline={mockOnExport}
        onClose={mockOnClose}
      />,
    );

    const initialPreviewVideo = document.querySelector(".preview-video") as HTMLVideoElement | null;
    expect(initialPreviewVideo?.getAttribute("src")).toContain("/test/video-selected.mp4");

    fireEvent.click(screen.getByTestId("analyze-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("stats-section")).toBeDefined();
    });

    await waitFor(() => {
      const updatedPreviewVideo = document.querySelector(".preview-video") as HTMLVideoElement | null;
      expect(updatedPreviewVideo?.getAttribute("src")).toContain("/test/video-analyzed.mp4");
    });
  });
});
