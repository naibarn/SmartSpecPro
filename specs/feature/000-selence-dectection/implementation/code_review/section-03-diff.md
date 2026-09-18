diff --git a/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
index 96dac81..d6135f6 100644
--- a/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
+++ b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
@@ -19,6 +19,12 @@ import type {
   SilenceDetectionConfig,
   AnalysisStage,
 } from '../../types/videoEditor';
+import {
+  generateId,
+  formatTime,
+  dbToPercent,
+  applyBufferToRegions,
+} from '../../types/videoEditor';
 import { createMediaJobClient } from '../../services/mediaJobClient';
 
 interface AssetWithWaveform {
@@ -40,18 +46,26 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
   onExportToTimeline,
   onClose,
 }) => {
-  // Detection config
-  const [config, setConfig] = useState<SilenceDetectionConfig>({
-    threshold: -40,
-    minDuration: 0.5,
-    softeningBuffer: 0.2,
-    enabled: true,
-    trackIds: [],
-  });
+  // Slider state
+  const [threshold, setThreshold] = useState(-40);
+  const [minDuration, setMinDuration] = useState(0.5);
+  const [softeningBuffer, setSofteningBuffer] = useState(0.2);
+
+  // Track selection
+  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
+
+  // Analysis state
   const [regions, setRegions] = useState<SilentRegion[]>([]);
+  const [rawRegions, setRawRegions] = useState<SilentRegion[]>([]); // Store raw regions for re-buffering
   const [analysisComplete, setAnalysisComplete] = useState(false);
   const [isAnalyzing, setIsAnalyzing] = useState(false);
   const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
+  const [totalSilence, setTotalSilence] = useState(0);
+  const [totalActive, setTotalActive] = useState(0);
+  const [analysisError, setAnalysisError] = useState<string | null>(null);
+  const abortControllerRef = useRef<AbortController | null>(null);
+
+  // UI state
   const [playbackTime, setPlaybackTime] = useState(0);
   const [timelineZoom, setTimelineZoom] = useState(100);
   const [skipSilencePreview, setSkipSilencePreview] = useState(false);
@@ -113,6 +127,150 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
     fetchWaveform();
   }, [project]);
 
+  // Abort controller cleanup
+  useEffect(() => {
+    return () => {
+      abortControllerRef.current?.abort();
+    };
+  }, []);
+
+  // Auto-select first audio track
+  useEffect(() => {
+    const audioTracks = project.timeline.tracks.filter(
+      (t) => t.type === 'audio' && t.clips.length > 0
+    );
+    if (audioTracks.length > 0 && selectedTrackIds.length === 0) {
+      setSelectedTrackIds([audioTracks[0].id]);
+    }
+  }, [project, selectedTrackIds.length]);
+
+  // Re-apply buffer when it changes after analysis
+  useEffect(() => {
+    if (analysisComplete && rawRegions.length > 0) {
+      const reBuffered = applyBufferToRegions(rawRegions, softeningBuffer);
+      setRegions(reBuffered);
+
+      // Recalculate stats
+      const silenceDuration = reBuffered
+        .filter((r) => !r.skipped)
+        .reduce((sum, r) => sum + r.adjustedDuration, 0);
+      setTotalSilence(silenceDuration);
+      setTotalActive(Math.max(0, (project.settings.duration || 0) - silenceDuration));
+    }
+  }, [softeningBuffer, analysisComplete, rawRegions.length, project.settings.duration]);
+
+  // Get audio tracks for UI
+  const audioTracks = useMemo(() =>
+    project.timeline.tracks.filter((t) => t.type === 'audio' && t.clips.length > 0),
+    [project]
+  );
+
+  // Handle analyze button
+  const handleAutoDetect = async () => {
+    if (selectedTrackIds.length === 0) return;
+
+    // Create abort controller
+    const abortController = new AbortController();
+    abortControllerRef.current = abortController;
+
+    // Reset state
+    setIsAnalyzing(true);
+    setAnalysisStage('preparing');
+    setAnalysisComplete(false);
+    setAnalysisError(null);
+    setRegions([]);
+    setRawRegions([]);
+
+    // Stage timers for visual feedback
+    const stageTimers: ReturnType<typeof setTimeout>[] = [];
+    stageTimers.push(setTimeout(() => setAnalysisStage('scanning'), 1000));
+    stageTimers.push(setTimeout(() => setAnalysisStage('detecting'), 3000));
+
+    try {
+      // Find asset URI
+      const firstTrack = project.timeline.tracks.find((t) => t.id === selectedTrackIds[0]);
+      if (!firstTrack || firstTrack.clips.length === 0) {
+        throw new Error('No clips found in selected track');
+      }
+
+      const firstClip = firstTrack.clips[0];
+      const asset = project.assets[firstClip.assetId];
+      if (!asset || !asset.path) {
+        throw new Error('Asset not found');
+      }
+
+      setAnalysisStage('detecting');
+
+      // Call backend
+      const client = await createMediaJobClient();
+      const result = await client.detectDeadAir(asset.path, {
+        thresholdDb: threshold,
+        minSilenceMs: minDuration * 1000,
+      });
+
+      // Check if aborted
+      if (abortController.signal.aborted) {
+        return;
+      }
+
+      setAnalysisStage('applying_buffer');
+
+      // Map segments to regions
+      const silenceSegments = result.derived?.silenceSegments || [];
+      const rawRegions: SilentRegion[] = silenceSegments.map((seg: any) => ({
+        id: generateId('region'),
+        startTime: seg.startMs / 1000,
+        endTime: seg.endMs / 1000,
+        duration: (seg.endMs - seg.startMs) / 1000,
+        adjustedStartTime: 0,
+        adjustedEndTime: 0,
+        adjustedDuration: 0,
+        averageDb: seg.averageDb || threshold,
+        trackId: firstTrack.id,
+        selected: true,
+        skipped: false,
+      }));
+
+      // Store raw regions for re-buffering
+      setRawRegions(rawRegions);
+
+      // Apply buffer
+      const bufferedRegions = applyBufferToRegions(rawRegions, softeningBuffer);
+
+      // Calculate stats
+      const silenceDuration = bufferedRegions
+        .filter((r) => !r.skipped)
+        .reduce((sum, r) => sum + r.adjustedDuration, 0);
+      const activeDuration = Math.max(0, (project.settings.duration || 0) - silenceDuration);
+
+      setRegions(bufferedRegions);
+      setTotalSilence(silenceDuration);
+      setTotalActive(activeDuration);
+      setAnalysisComplete(true);
+      setAnalysisStage('done');
+    } catch (err) {
+      if (abortController.signal.aborted) {
+        // Silently ignore if aborted
+        return;
+      }
+      console.error('Analysis failed:', err);
+      setAnalysisStage('error');
+      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed - try again or adjust settings');
+    } finally {
+      stageTimers.forEach(clearTimeout);
+      setIsAnalyzing(false);
+    }
+  };
+
+  // Track toggle handler
+  const handleTrackToggle = (trackId: string) => {
+    setSelectedTrackIds((prev) =>
+      prev.includes(trackId)
+        ? prev.filter((id) => id !== trackId)
+        : [...prev, trackId]
+    );
+  };
+
   const selectedRegionCount = regions.filter((r) => r.selected && !r.skipped).length;
   const exportDisabled = !analysisComplete || selectedRegionCount === 0;
 
@@ -279,6 +437,175 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
               color: #888;
               font-size: 13px;
             }
+            /* Settings Panel Styles */
+            .settings-panel {
+              display: flex;
+              flex-direction: column;
+              gap: 24px;
+            }
+            .settings-heading {
+              font-size: 16px;
+              font-weight: 600;
+              color: #fff;
+              margin: 0;
+            }
+            .control-group {
+              display: flex;
+              flex-direction: column;
+              gap: 8px;
+            }
+            .control-label {
+              display: flex;
+              justify-content: space-between;
+              font-size: 14px;
+              color: #ccc;
+            }
+            .control-value {
+              color: #fff;
+              font-weight: 500;
+            }
+            .slider-container {
+              display: flex;
+              align-items: center;
+              gap: 8px;
+            }
+            .slider-endpoint {
+              font-size: 12px;
+              color: #888;
+              min-width: 30px;
+              text-align: center;
+            }
+            .slider {
+              flex: 1;
+              height: 4px;
+              border-radius: 2px;
+              background: #444;
+              outline: none;
+              -webkit-appearance: none;
+              cursor: pointer;
+            }
+            .slider::-webkit-slider-thumb {
+              -webkit-appearance: none;
+              width: 14px;
+              height: 14px;
+              border-radius: 50%;
+              background: #0078d4;
+              cursor: pointer;
+            }
+            .slider::-moz-range-thumb {
+              width: 14px;
+              height: 14px;
+              border-radius: 50%;
+              background: #0078d4;
+              cursor: pointer;
+              border: none;
+            }
+            .slider:disabled {
+              opacity: 0.5;
+              cursor: not-allowed;
+            }
+            .slider:disabled::-webkit-slider-thumb {
+              cursor: not-allowed;
+            }
+            .slider:disabled::-moz-range-thumb {
+              cursor: not-allowed;
+            }
+            .control-help {
+              font-size: 12px;
+              color: #888;
+              font-style: italic;
+            }
+            .track-selection {
+              display: flex;
+              flex-direction: column;
+              gap: 8px;
+            }
+            .track-selection-heading {
+              font-size: 14px;
+              font-weight: 600;
+              color: #fff;
+              margin: 0;
+            }
+            .track-checkbox-label {
+              display: flex;
+              align-items: center;
+              gap: 8px;
+              font-size: 14px;
+              color: #ccc;
+              cursor: pointer;
+            }
+            .track-checkbox-label input {
+              cursor: pointer;
+            }
+            .track-checkbox-label input:disabled {
+              cursor: not-allowed;
+            }
+            .track-empty-state {
+              font-size: 14px;
+              color: #888;
+              font-style: italic;
+            }
+            .analyze-btn {
+              width: 100%;
+              padding: 12px 20px;
+              background: #0078d4;
+              color: #fff;
+              border: none;
+              border-radius: 4px;
+              font-size: 14px;
+              font-weight: 500;
+              cursor: pointer;
+            }
+            .analyze-btn:hover:not(:disabled) {
+              background: #006cbd;
+            }
+            .analyze-btn:disabled {
+              background: #444;
+              color: #888;
+              cursor: not-allowed;
+            }
+            .stats-section {
+              display: flex;
+              flex-direction: column;
+              gap: 12px;
+            }
+            .stats-heading {
+              font-size: 14px;
+              font-weight: 600;
+              color: #fff;
+              margin: 0;
+            }
+            .stats-grid {
+              display: grid;
+              grid-template-columns: repeat(3, 1fr);
+              gap: 8px;
+            }
+            .stat-card {
+              background: #1e1e1e;
+              border: 1px solid #444;
+              border-radius: 4px;
+              padding: 12px;
+              display: flex;
+              flex-direction: column;
+              gap: 4px;
+            }
+            .stat-label {
+              font-size: 12px;
+              color: #888;
+            }
+            .stat-value {
+              font-size: 16px;
+              font-weight: 600;
+              color: #fff;
+            }
+            .analysis-error {
+              padding: 12px;
+              background: rgba(255, 0, 0, 0.1);
+              border: 1px solid rgba(255, 0, 0, 0.3);
+              border-radius: 4px;
+              color: #ff6b6b;
+              font-size: 14px;
+            }
             @media (max-width: 1279px) {
               .silence-dialog-main {
                 flex-direction: column;
@@ -293,6 +620,9 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
                 height: 300px;
                 border-bottom: 1px solid #444;
               }
+              .stats-grid {
+                grid-template-columns: 1fr;
+              }
             }
           `}</style>
 
@@ -322,8 +652,170 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
               Preview Player (Section 07)
             </div>
             <div className="silence-dialog-settings" data-testid="silence-dialog-settings">
-              {/* Settings panel placeholder (section 03) */}
-              Settings Panel (Section 03)
+              <div className="settings-panel">
+                <h3 className="settings-heading">Detection Settings</h3>
+
+                {/* Volume Threshold Slider */}
+                <div className="control-group">
+                  <label className="control-label">
+                    <span>Volume Threshold</span>
+                    <span
+                      className="control-value"
+                      data-testid="threshold-label"
+                    >
+                      {threshold} dB ({Math.round(dbToPercent(threshold))}%)
+                    </span>
+                  </label>
+                  <div className="slider-container">
+                    <span className="slider-endpoint">-60</span>
+                    <input
+                      type="range"
+                      min="-60"
+                      max="-20"
+                      step="1"
+                      value={threshold}
+                      onChange={(e) => setThreshold(Number(e.target.value))}
+                      disabled={isAnalyzing}
+                      className="slider"
+                      data-testid="threshold-slider"
+                    />
+                    <span className="slider-endpoint">-20</span>
+                  </div>
+                </div>
+
+                {/* Minimum Duration Slider */}
+                <div className="control-group">
+                  <label className="control-label">
+                    <span>Minimum Duration</span>
+                    <span className="control-value" data-testid="minDuration-label">
+                      {minDuration.toFixed(1)}s
+                    </span>
+                  </label>
+                  <div className="slider-container">
+                    <span className="slider-endpoint">0.1</span>
+                    <input
+                      type="range"
+                      min="0.1"
+                      max="5.0"
+                      step="0.1"
+                      value={minDuration}
+                      onChange={(e) => setMinDuration(Number(e.target.value))}
+                      disabled={isAnalyzing}
+                      className="slider"
+                      data-testid="minDuration-slider"
+                    />
+                    <span className="slider-endpoint">5.0</span>
+                  </div>
+                </div>
+
+                {/* Softening Buffer Slider */}
+                <div className="control-group">
+                  <label className="control-label">
+                    <span>Softening Buffer</span>
+                    <span className="control-value" data-testid="softeningBuffer-label">
+                      {softeningBuffer.toFixed(2)}s
+                    </span>
+                  </label>
+                  <div className="slider-container">
+                    <span className="slider-endpoint">0.0</span>
+                    <input
+                      type="range"
+                      min="0.0"
+                      max="2.0"
+                      step="0.05"
+                      value={softeningBuffer}
+                      onChange={(e) => setSofteningBuffer(Number(e.target.value))}
+                      disabled={isAnalyzing}
+                      className="slider"
+                      data-testid="softeningBuffer-slider"
+                    />
+                    <span className="slider-endpoint">2.0</span>
+                  </div>
+                  <div className="control-help">
+                    Adds padding around cuts for smoother transitions
+                  </div>
+                </div>
+
+                {/* Track Selection */}
+                <div className="track-selection">
+                  <h4 className="track-selection-heading">Audio Tracks</h4>
+                  {audioTracks.length === 0 ? (
+                    <div className="track-empty-state">
+                      No audio tracks with clips found
+                    </div>
+                  ) : (
+                    audioTracks.map((track) => (
+                      <label key={track.id} className="track-checkbox-label">
+                        <input
+                          type="checkbox"
+                          checked={selectedTrackIds.includes(track.id)}
+                          onChange={() => handleTrackToggle(track.id)}
+                          disabled={isAnalyzing}
+                        />
+                        <span>{track.name || track.id}</span>
+                      </label>
+                    ))
+                  )}
+                </div>
+
+                {/* Analyze Button */}
+                <button
+                  className="analyze-btn"
+                  onClick={handleAutoDetect}
+                  disabled={isAnalyzing || selectedTrackIds.length === 0 || audioTracks.length === 0}
+                  data-testid="analyze-btn"
+                >
+                  {isAnalyzing
+                    ? analysisStage === 'preparing'
+                      ? 'Preparing...'
+                      : analysisStage === 'scanning'
+                      ? 'Scanning audio...'
+                      : analysisStage === 'detecting'
+                      ? 'Detecting silence...'
+                      : analysisStage === 'applying_buffer'
+                      ? 'Applying buffer...'
+                      : 'Analyzing...'
+                    : 'Analyze'}
+                </button>
+
+                {/* Stats Display */}
+                {analysisComplete && !analysisError && (
+                  <div className="stats-section" data-testid="stats-section">
+                    <h4 className="stats-heading">Analysis Results</h4>
+                    <div className="stats-grid">
+                      <div className="stat-card">
+                        <div className="stat-label">Total Silence</div>
+                        <div className="stat-value" data-testid="total-silence">
+                          {formatTime(totalSilence)}
+                        </div>
+                      </div>
+                      <div className="stat-card">
+                        <div className="stat-label">Active Audio</div>
+                        <div className="stat-value" data-testid="active-audio">
+                          {formatTime(totalActive)}
+                        </div>
+                      </div>
+                      <div className="stat-card">
+                        <div className="stat-label">Selected</div>
+                        <div className="stat-value" data-testid="selected-count">
+                          {selectedRegionCount} ({formatTime(
+                            regions
+                              .filter((r) => r.selected && !r.skipped)
+                              .reduce((sum, r) => sum + r.adjustedDuration, 0)
+                          )})
+                        </div>
+                      </div>
+                    </div>
+                  </div>
+                )}
+
+                {/* Error Display */}
+                {analysisError && (
+                  <div className="analysis-error" data-testid="analysis-error">
+                    {analysisError}
+                  </div>
+                )}
+              </div>
             </div>
           </div>
 
diff --git a/apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.tsx b/apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.tsx
new file mode 100644
index 0000000..4483642
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/settingsDetection.test.tsx
@@ -0,0 +1,658 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import SilenceDetectionDialog from "../SilenceDetectionDialog";
+import type { VideoEditorProject } from "../../../types/videoEditor";
+import { createMediaJobClient } from "../../../services/mediaJobClient";
+
+// Mock the media job client with getWaveformPeaks
+const mockGetWaveformPeaks = vi.fn(() =>
+  Promise.resolve({ derived: { peaks: [0.1, 0.2, 0.3] } })
+);
+
+vi.mock("../../../services/mediaJobClient", () => ({
+  createMediaJobClient: vi.fn(),
+}));
+
+// Helper to create a minimal test project
+function createTestProject(): VideoEditorProject {
+  return {
+    id: "test-project",
+    name: "Test Project",
+    settings: {
+      width: 1920,
+      height: 1080,
+      frameRate: 30,
+      duration: 30, // 30 seconds
+    },
+    timeline: {
+      tracks: [
+        {
+          id: "audio-1",
+          type: "audio",
+          clips: [
+            {
+              id: "clip-1",
+              assetId: "asset-1",
+              startTime: 0,
+              duration: 30,
+              trimStart: 0,
+              trimEnd: 30,
+            },
+          ],
+        },
+      ],
+    },
+    assets: {
+      "asset-1": {
+        id: "asset-1",
+        path: "/test/audio.mp3",
+        type: "audio",
+        duration: 30,
+      },
+    },
+  } as VideoEditorProject;
+}
+
+// ========================================
+// Settings UI Tests
+// ========================================
+
+describe("Settings Panel: Slider Configuration", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    // Provide default mock for waveform generation
+    (createMediaJobClient as any).mockResolvedValue({
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+  });
+
+  it("should render threshold slider with range -60 to -20 and default -40", () => {
+    const project = createTestProject();
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
+    expect(thresholdSlider).toBeTruthy();
+    expect(thresholdSlider.getAttribute("min")).toBe("-60");
+    expect(thresholdSlider.getAttribute("max")).toBe("-20");
+    expect(thresholdSlider.getAttribute("step")).toBe("1");
+    expect(thresholdSlider.value).toBe("-40");
+  });
+
+  it("should show both dB and percentage values for threshold", () => {
+    const project = createTestProject();
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    // At default -40 dB, percentage should be 50%
+    const thresholdLabel = screen.getByTestId("threshold-label");
+    expect(thresholdLabel.textContent).toContain("-40");
+    expect(thresholdLabel.textContent).toContain("50%");
+  });
+
+  it("should render minimum duration slider with range 0.1 to 5.0 and default 0.5", () => {
+    const project = createTestProject();
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
+    expect(durationSlider).toBeTruthy();
+    expect(durationSlider.getAttribute("min")).toBe("0.1");
+    expect(durationSlider.getAttribute("max")).toBe("5.0");
+    expect(durationSlider.getAttribute("step")).toBe("0.1");
+    expect(durationSlider.value).toBe("0.5");
+  });
+
+  it("should render softening buffer slider with range 0.0 to 2.0 and default 0.2", () => {
+    const project = createTestProject();
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+    expect(bufferSlider).toBeTruthy();
+    expect(bufferSlider.getAttribute("min")).toBe("0.0");
+    expect(bufferSlider.getAttribute("max")).toBe("2.0");
+    expect(bufferSlider.getAttribute("step")).toBe("0.05");
+    expect(bufferSlider.value).toBe("0.2");
+  });
+
+  it("should disable all sliders while isAnalyzing is true", async () => {
+    const project = createTestProject();
+
+    // Mock detectDeadAir to hang indefinitely
+    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    // Click analyze to start analysis
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
+      const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
+      const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+
+      expect(thresholdSlider.disabled).toBe(true);
+      expect(durationSlider.disabled).toBe(true);
+      expect(bufferSlider.disabled).toBe(true);
+    });
+  });
+});
+
+// ========================================
+// Analyze Flow Tests
+// ========================================
+
+describe("Settings Panel: Analyze Flow", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
+  });
+
+  it("should disable Analyze button during analysis", async () => {
+    const project = createTestProject();
+
+    // Mock detectDeadAir to hang
+    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn") as HTMLButtonElement;
+    expect(analyzeBtn.disabled).toBe(false);
+
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      expect(analyzeBtn.disabled).toBe(true);
+    });
+  });
+
+  it("should call detectDeadAir with correct thresholdDb and minSilenceMs", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      expect(mockDetectDeadAir).toHaveBeenCalledWith(
+        "/test/audio.mp3",
+        expect.objectContaining({
+          thresholdDb: -40,
+          minSilenceMs: 500,
+        })
+      );
+    });
+  });
+
+  it("should map silenceSegments to SilentRegion[] with correct fields", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+          { startMs: 20000, endMs: 25000, durationMs: 5000 },
+        ],
+        keepSegments: [
+          { startMs: 0, endMs: 5000 },
+          { startMs: 10000, endMs: 20000 },
+          { startMs: 25000, endMs: 30000 },
+        ],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      // Check that regions are displayed in the stats
+      const regionCount = screen.getByTestId("selected-count");
+      expect(regionCount.textContent).toContain("2");
+    });
+  });
+
+  it("should apply softening buffer via applyBufferToRegions", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      // Region 5.0-10.0s with 0.2s buffer should show adjusted duration of 4.6s
+      const totalSilence = screen.getByTestId("total-silence");
+      expect(totalSilence.textContent).toContain("4.6");
+    });
+  });
+
+  it("should calculate and display correct stats", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+          { startMs: 20000, endMs: 25000, durationMs: 5000 },
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const totalSilence = screen.getByTestId("total-silence");
+      const activeAudio = screen.getByTestId("active-audio");
+      const selectedCount = screen.getByTestId("selected-count");
+
+      expect(totalSilence).toBeTruthy();
+      expect(activeAudio).toBeTruthy();
+      expect(selectedCount.textContent).toContain("2");
+    });
+  });
+
+  it("should set analysisComplete to true after successful analysis", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const statsSection = screen.getByTestId("stats-section");
+      expect(statsSection).toBeTruthy();
+    });
+  });
+
+  it("should set analysisStage to error on failure", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockRejectedValue(new Error("Analysis failed"));
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const errorMsg = screen.getByTestId("analysis-error");
+      expect(errorMsg).toBeTruthy();
+      expect(errorMsg.textContent).toContain("failed");
+    });
+  });
+});
+
+// ========================================
+// Analysis Cancellation Tests
+// ========================================
+
+describe("Settings Panel: Analysis Cancellation", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
+  });
+
+  it("should handle unmount during analysis gracefully", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn(() => new Promise(() => {}));
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    const { unmount } = render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      expect(mockDetectDeadAir).toHaveBeenCalled();
+    });
+
+    // Should not throw when unmounting during analysis
+    expect(() => unmount()).not.toThrow();
+  });
+
+  it("should re-enable sliders after analysis error", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockRejectedValue(new Error("Timeout"));
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const thresholdSlider = screen.getByTestId("threshold-slider") as HTMLInputElement;
+      const durationSlider = screen.getByTestId("minDuration-slider") as HTMLInputElement;
+      const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+
+      expect(thresholdSlider.disabled).toBe(false);
+      expect(durationSlider.disabled).toBe(false);
+      expect(bufferSlider.disabled).toBe(false);
+    });
+  });
+});
+
+// ========================================
+// Buffer Change Re-analysis Tests
+// ========================================
+
+describe("Settings Panel: Buffer Change Re-analysis", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetWaveformPeaks.mockResolvedValue({ derived: { peaks: [0.1, 0.2, 0.3] } });
+  });
+
+  it("should recalculate adjusted bounds when buffer changes after analysis", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const totalSilence = screen.getByTestId("total-silence");
+      // With 0.2s buffer: 5.0-10.0s => 5.2-9.8s = 4.6s
+      expect(totalSilence.textContent).toContain("4.6");
+    });
+
+    // Change buffer to 0.5
+    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+    fireEvent.change(bufferSlider, { target: { value: "0.5" } });
+
+    await waitFor(() => {
+      const totalSilence = screen.getByTestId("total-silence");
+      // With 0.5s buffer: 5.0-10.0s => 5.5-9.5s = 4.0s
+      expect(totalSilence.textContent).toContain("4.0");
+    });
+  });
+
+  it("should update stats after buffer change (skipped regions affect counts)", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 5300, durationMs: 300 }, // 0.3s region
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    // First set buffer to 0.1s so the 0.3s region is NOT skipped (0.3 - 2*0.1 = 0.1 > 0)
+    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+    fireEvent.change(bufferSlider, { target: { value: "0.1" } });
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      const selectedCount = screen.getByTestId("selected-count");
+      expect(selectedCount.textContent).toContain("1");
+    });
+
+    // Change buffer to 0.2s (2*0.2 = 0.4s > 0.3s duration, should skip)
+    fireEvent.change(bufferSlider, { target: { value: "0.2" } });
+
+    await waitFor(() => {
+      const selectedCount = screen.getByTestId("selected-count");
+      // Region should be skipped now
+      expect(selectedCount.textContent).toContain("0");
+    });
+  });
+
+  it("should not call detectDeadAir again when buffer changes", async () => {
+    const project = createTestProject();
+
+    const mockDetectDeadAir = vi.fn().mockResolvedValue({
+      jobId: "test-job",
+      status: "done",
+      artifacts: [],
+      derived: {
+        silenceSegments: [
+          { startMs: 5000, endMs: 10000, durationMs: 5000 },
+        ],
+        keepSegments: [],
+      },
+    });
+    (createMediaJobClient as any).mockResolvedValue({
+      detectDeadAir: mockDetectDeadAir,
+      getWaveformPeaks: mockGetWaveformPeaks,
+    });
+
+    render(
+      <SilenceDetectionDialog
+        project={project}
+        onExportToTimeline={vi.fn()}
+        onClose={vi.fn()}
+      />
+    );
+
+    const analyzeBtn = screen.getByTestId("analyze-btn");
+    fireEvent.click(analyzeBtn);
+
+    await waitFor(() => {
+      expect(mockDetectDeadAir).toHaveBeenCalledTimes(1);
+    });
+
+    // Change buffer slider
+    const bufferSlider = screen.getByTestId("softeningBuffer-slider") as HTMLInputElement;
+    fireEvent.change(bufferSlider, { target: { value: "0.5" } });
+
+    await waitFor(() => {
+      // Should still only be called once
+      expect(mockDetectDeadAir).toHaveBeenCalledTimes(1);
+    });
+  });
+});
