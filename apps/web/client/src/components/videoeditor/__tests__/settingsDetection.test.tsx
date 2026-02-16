/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SilenceDetectionDialog from "../SilenceDetectionDialog";
import type { VideoEditorProject } from "../../../types/videoEditor";
import { createEmptyProject } from "../../../types/videoEditor";
import { createMediaJobClient } from "../../../services/mediaJobClient";

// Mock the media job client with getWaveformPeaks
const mockGetWaveformPeaks = vi.fn(() =>
  Promise.resolve({ derived: { peaks: [0.1, 0.2, 0.3] } })
);

vi.mock("../../../services/mediaJobClient", () => ({
  createMediaJobClient: vi.fn(),
}));

// Helper to create a minimal test project
function createTestProject(): VideoEditorProject {
  const project = createEmptyProject("Test Project");
  project.settings.duration = 30;
  project.timeline.tracks = [
    {
      id: "audio-1",
      type: "audio",
      name: "A1",
      clips: [
        {
          id: "clip-1",
          assetId: "asset-1",
          trackId: "audio-1",
          startTime: 0,
          duration: 30,
          trimIn: 0,
          trimOut: 0,
          volume: 1,
          speed: 1,
          effects: [],
        },
      ],
      muted: false,
      locked: false,
      visible: true,
    },
  ];
  project.assets["asset-1"] = {
    id: "asset-1",
    path: "/test/audio.mp3",
    type: "audio",
    source: "imported",
    filename: "audio.mp3",
    format: "mp3",
    duration: 30,
  };
  return project;
}

// ========================================
// Settings UI Tests
// ========================================

describe("Settings Panel: Slider Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide default mock for waveform generation
    (createMediaJobClient as any).mockResolvedValue({
      getWaveformPeaks: mockGetWaveformPeaks,
    });
  });

  it("should render threshold slider with range -60 to -10 and default -30", () => {
    const project = createTestProject();
    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
    expect(thresholdSlider).toBeTruthy();
    expect(thresholdSlider.getAttribute("min")).toBe("-60");
    expect(thresholdSlider.getAttribute("max")).toBe("-10");
    expect(thresholdSlider.getAttribute("step")).toBe("1");
    expect(thresholdSlider.value).toBe("-30");
  });

  it("should show both dB and percentage values for threshold", () => {
    const project = createTestProject();
    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // At default -30 dB, percentage should be 60%
    const thresholdLabel = screen.getByTestId("threshold-label");
    expect(thresholdLabel.textContent).toContain("-30");
    expect(thresholdLabel.textContent).toContain("60%");
  });

  it("should update percentage when threshold slider changes", () => {
    const project = createTestProject();
    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
    const thresholdLabel = screen.getByTestId("threshold-label");

    // Change to -60 dB => 0%
    fireEvent.change(thresholdSlider, { target: { value: "-60" } });
    expect(thresholdLabel.textContent).toContain("-60");
    expect(thresholdLabel.textContent).toContain("0%");

    // Change to -20 dB => 80%
    fireEvent.change(thresholdSlider, { target: { value: "-20" } });
    expect(thresholdLabel.textContent).toContain("-20");
    expect(thresholdLabel.textContent).toContain("80%");

    // Change to -50 dB => 20%
    fireEvent.change(thresholdSlider, { target: { value: "-50" } });
    expect(thresholdLabel.textContent).toContain("-50");
    expect(thresholdLabel.textContent).toContain("20%");
  });

  it("should render minimum duration slider with range 0.1 to 5.0 and default 0.3", () => {
    const project = createTestProject();
    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
    expect(durationSlider).toBeTruthy();
    expect(durationSlider.getAttribute("min")).toBe("0.1");
    expect(durationSlider.getAttribute("max")).toBe("5.0");
    expect(durationSlider.getAttribute("step")).toBe("0.1");
    expect(durationSlider.value).toBe("0.3");
  });

  it("should render softening buffer slider with range 0.0 to 2.0 and default 0.2", () => {
    const project = createTestProject();
    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
    expect(bufferSlider).toBeTruthy();
    expect(bufferSlider.getAttribute("min")).toBe("0.0");
    expect(bufferSlider.getAttribute("max")).toBe("2.0");
    expect(bufferSlider.getAttribute("step")).toBe("0.05");
    expect(bufferSlider.value).toBe("0.2");
  });

  it("should disable all sliders while isAnalyzing is true", async () => {
    const project = createTestProject();

    // Mock detectDeadAir to hang indefinitely
    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Click analyze to start analysis
    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
      const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
      const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;

      expect(thresholdSlider.disabled).toBe(true);
      expect(durationSlider.disabled).toBe(true);
      expect(bufferSlider.disabled).toBe(true);
    });
  });
});

// ========================================
// Analyze Flow Tests
// ========================================

describe("Settings Panel: Analyze Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
  });

  it("should disable Analyze button during analysis", async () => {
    const project = createTestProject();

    // Mock detectDeadAir to hang
    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn") as HTMLButtonElement;
    expect(analyzeBtn.disabled).toBe(false);

    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(analyzeBtn.disabled).toBe(true);
    });
  });

  it("should call detectDeadAir with correct thresholdDb and minSilenceMs", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(mockDetectDeadAir).toHaveBeenCalledWith(
        "/test/audio.mp3",
        expect.objectContaining({
          thresholdDb: -30,
          minSilenceMs: 300,
        })
        ,
        expect.any(Function)
      );
    });
  });

  it("should map silenceSegments to SilentRegion[] with correct fields", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
          { startMs: 20000, endMs: 25000, durationMs: 5000 },
        ],
        keepSegments: [
          { startMs: 0, endMs: 5000 },
          { startMs: 10000, endMs: 20000 },
          { startMs: 25000, endMs: 30000 },
        ],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      // Check that regions are displayed in the stats
      const regionCount = screen.getByTestId("selected-count");
      expect(regionCount.textContent).toContain("2");
    });
  });

  it("should apply softening buffer via applyBufferToRegions", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      // Region 5.0-10.0s with 0.2s buffer should show adjusted duration of 4.6s
      const totalSilence = screen.getByTestId("total-silence");
      expect(totalSilence.textContent).toContain("4.6");
    });
  });

  it("should calculate and display correct stats", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
          { startMs: 20000, endMs: 25000, durationMs: 5000 },
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const totalSilence = screen.getByTestId("total-silence");
      const activeAudio = screen.getByTestId("active-audio");
      const selectedCount = screen.getByTestId("selected-count");

      expect(totalSilence).toBeTruthy();
      expect(activeAudio).toBeTruthy();
      expect(selectedCount.textContent).toContain("2");
    });
  });

  it("should set analysisComplete to true after successful analysis", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const statsSection = screen.getByTestId("stats-section");
      expect(statsSection).toBeTruthy();
    });
  });

  it("should set analysisStage to error on failure", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockRejectedValue(new Error("Analysis failed"));
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const errorMsg = screen.getByTestId("analysis-error");
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.textContent).toContain("failed");
    });
  });
});

// ========================================
// Analysis Cancellation Tests
// ========================================

describe("Settings Panel: Analysis Cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
  });

  it("should handle unmount during analysis gracefully", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    const { unmount } = render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(mockDetectDeadAir).toHaveBeenCalled();
    });

    // Should not throw when unmounting during analysis
    expect(() => unmount()).not.toThrow();
  });

  it("should re-enable sliders after analysis error", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockRejectedValue(new Error("Timeout"));
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
      const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
      const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;

      expect(thresholdSlider.disabled).toBe(false);
      expect(durationSlider.disabled).toBe(false);
      expect(bufferSlider.disabled).toBe(false);
    });
  });
});

// ========================================
// Buffer Change Re-analysis Tests
// ========================================

describe("Settings Panel: Buffer Change Re-analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
  });

  it("should recalculate adjusted bounds when buffer changes after analysis", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const totalSilence = screen.getByTestId("total-silence");
      // With 0.2s buffer: 5.0-10.0s => 5.2-9.8s = 4.6s
      expect(totalSilence.textContent).toContain("4.6");
    });

    // Change buffer to 0.5
    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
    fireEvent.change(bufferSlider, { target: { value: "0.5" } });

    await waitFor(() => {
      const totalSilence = screen.getByTestId("total-silence");
      // With 0.5s buffer: 5.0-10.0s => 5.5-9.5s = 4.0s
      expect(totalSilence.textContent).toContain("4.0");
    });
  });

  it("should update stats after buffer change (skipped regions affect counts)", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 5300, durationMs: 300 }, // 0.3s region
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // First set buffer to 0.1s so the 0.3s region is NOT skipped (0.3 - 2*0.1 = 0.1 > 0)
    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
    fireEvent.change(bufferSlider, { target: { value: "0.1" } });

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      const selectedCount = screen.getByTestId("selected-count");
      expect(selectedCount.textContent).toContain("1");
    });

    // Change buffer to 0.2s (2*0.2 = 0.4s > 0.3s duration, should skip)
    fireEvent.change(bufferSlider, { target: { value: "0.2" } });

    await waitFor(() => {
      const selectedCount = screen.getByTestId("selected-count");
      // Region should be skipped now
      expect(selectedCount.textContent).toContain("0");
    });
  });

  it("should not call detectDeadAir again when buffer changes", async () => {
    const project = createTestProject();

    const mockDetectDeadAir = vi.fn().mockResolvedValue({
      jobId: "test-job",
      status: "done",
      artifacts: [],
      derived: {
        silenceSegments: [
          { startMs: 5000, endMs: 10000, durationMs: 5000 },
        ],
        keepSegments: [],
      },
    });
    (createMediaJobClient as any).mockResolvedValue({
      detectDeadAir: mockDetectDeadAir,
      getWaveformPeaks: mockGetWaveformPeaks,
    });

    render(
      <SilenceDetectionDialog
        project={project}
        onExportToTimeline={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const analyzeBtn = screen.getByTestId("analyze-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(mockDetectDeadAir).toHaveBeenCalledTimes(1);
    });

    // Change buffer slider
    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
    fireEvent.change(bufferSlider, { target: { value: "0.5" } });

    await waitFor(() => {
      // Should still only be called once
      expect(mockDetectDeadAir).toHaveBeenCalledTimes(1);
    });
  });
});
