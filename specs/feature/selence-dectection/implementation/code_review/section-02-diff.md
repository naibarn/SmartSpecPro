diff --git a/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
new file mode 100644
index 0000000..5cb335b
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
@@ -0,0 +1,361 @@
+/**
+ * SilenceDetectionDialog - Full-screen modal for silence detection workflow.
+ * Contains: header, main content (preview + settings), timeline, footer.
+ * Uses Radix UI Dialog for focus trapping, ESC-to-close, and ARIA support.
+ */
+
+import React, { useState, useEffect } from 'react';
+import {
+  Dialog,
+  DialogPortal,
+  DialogOverlay,
+  DialogContent,
+  DialogTitle,
+  DialogClose,
+} from '@/components/ui/dialog';
+import type {
+  VideoEditorProject,
+  SilentRegion,
+  SilenceDetectionConfig,
+  AnalysisStage,
+} from '../../types/videoEditor';
+import { createMediaJobClient } from '../../services/mediaJobClient';
+
+interface SilenceDetectionDialogProps {
+  project: VideoEditorProject;
+  onExportToTimeline: (
+    selectedRegions: SilentRegion[],
+    applyToAllTracks: boolean,
+  ) => void;
+  onClose: () => void;
+}
+
+const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
+  project,
+  onExportToTimeline,
+  onClose,
+}) => {
+  // Detection config
+  const [config, setConfig] = useState<SilenceDetectionConfig>({
+    threshold: -40,
+    minDuration: 0.5,
+    softeningBuffer: 0.2,
+    enabled: true,
+    trackIds: [],
+  });
+  const [regions, setRegions] = useState<SilentRegion[]>([]);
+  const [analysisComplete, setAnalysisComplete] = useState(false);
+  const [isAnalyzing, setIsAnalyzing] = useState(false);
+  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
+  const [playbackTime, setPlaybackTime] = useState(0);
+  const [timelineZoom, setTimelineZoom] = useState(100);
+  const [skipSilencePreview, setSkipSilencePreview] = useState(false);
+  const [applyToAllTracks, setApplyToAllTracks] = useState(false);
+
+  // Waveform state
+  const [waveformData, setWaveformData] = useState<number[] | null>(null);
+  const [waveformLoading, setWaveformLoading] = useState(false);
+  const [waveformError, setWaveformError] = useState(false);
+
+  // Waveform data availability check on mount
+  useEffect(() => {
+    const audioTracks = project.timeline.tracks.filter(
+      (t) => t.type === 'audio' && t.clips.length > 0,
+    );
+    if (audioTracks.length === 0) return;
+
+    const firstClip = audioTracks[0].clips[0];
+    const asset = project.assets[firstClip.assetId];
+    if (!asset) return;
+
+    if ((asset as any).waveformData && (asset as any).waveformData.length > 0) {
+      setWaveformData((asset as any).waveformData);
+      return;
+    }
+
+    // Waveform data missing -- trigger generation
+    setWaveformLoading(true);
+    const fetchWaveform = async () => {
+      try {
+        const client = await createMediaJobClient();
+        const result = await client.getWaveformPeaks(asset.path);
+        const peaks = (result as any).derived?.peaks || [];
+        setWaveformData(peaks);
+      } catch (err) {
+        console.error('Waveform generation failed:', err);
+        setWaveformError(true);
+      } finally {
+        setWaveformLoading(false);
+      }
+    };
+    fetchWaveform();
+  }, []);
+
+  const selectedRegionCount = regions.filter((r) => r.selected && !r.skipped).length;
+  const exportDisabled = !analysisComplete || selectedRegionCount === 0;
+
+  const handleExport = () => {
+    const selectedRegions = regions.filter((r) => r.selected && !r.skipped);
+    onExportToTimeline(selectedRegions, applyToAllTracks);
+  };
+
+  return (
+    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
+      <DialogPortal>
+        <DialogOverlay className="silence-dialog-overlay" />
+        <DialogContent
+          className="silence-dialog-content"
+          showCloseButton={false}
+        >
+          <style>{`
+            .silence-dialog-overlay {
+              position: fixed;
+              inset: 0;
+              background: rgba(0, 0, 0, 0.9);
+              z-index: 2000;
+            }
+            .silence-dialog-content {
+              position: fixed;
+              inset: 0;
+              z-index: 2001;
+              display: flex;
+              flex-direction: column;
+              background: #1a1a1a;
+              color: #e0e0e0;
+              max-width: none;
+              width: 100vw;
+              height: 100vh;
+              border: none;
+              border-radius: 0;
+              padding: 0;
+              gap: 0;
+            }
+            .silence-dialog-header {
+              display: flex;
+              align-items: center;
+              justify-content: space-between;
+              padding: 12px 20px;
+              border-bottom: 1px solid #444;
+              background: #222;
+              min-height: 56px;
+            }
+            .silence-dialog-header-left {
+              display: flex;
+              align-items: center;
+              gap: 12px;
+            }
+            .silence-dialog-back-btn,
+            .silence-dialog-close-btn {
+              background: none;
+              border: 1px solid #555;
+              color: #e0e0e0;
+              cursor: pointer;
+              padding: 6px 12px;
+              border-radius: 4px;
+              font-size: 14px;
+            }
+            .silence-dialog-back-btn:hover,
+            .silence-dialog-close-btn:hover {
+              background: #333;
+            }
+            .silence-dialog-title {
+              font-size: 18px;
+              font-weight: 600;
+              color: #fff;
+            }
+            .silence-dialog-main {
+              display: flex;
+              flex: 1;
+              overflow: hidden;
+            }
+            .silence-dialog-preview {
+              flex: 0 0 60%;
+              display: flex;
+              align-items: center;
+              justify-content: center;
+              background: #111;
+              border-right: 1px solid #444;
+              color: #666;
+              font-size: 14px;
+            }
+            .silence-dialog-settings {
+              flex: 0 0 40%;
+              overflow-y: auto;
+              padding: 20px;
+              background: #2a2a2a;
+            }
+            .silence-dialog-timeline {
+              height: 200px;
+              border-top: 1px solid #444;
+              background: #1e1e1e;
+              display: flex;
+              align-items: center;
+              justify-content: center;
+              color: #666;
+              font-size: 14px;
+            }
+            .silence-dialog-footer {
+              display: flex;
+              align-items: center;
+              justify-content: space-between;
+              padding: 12px 20px;
+              border-top: 1px solid #444;
+              background: #222;
+              min-height: 56px;
+            }
+            .silence-dialog-footer-left {
+              display: flex;
+              align-items: center;
+              gap: 8px;
+            }
+            .silence-dialog-toggle {
+              display: flex;
+              align-items: center;
+              gap: 8px;
+              cursor: pointer;
+              font-size: 14px;
+            }
+            .silence-dialog-toggle input {
+              cursor: pointer;
+            }
+            .silence-dialog-export-btn {
+              background: #0078d4;
+              color: #fff;
+              border: none;
+              padding: 8px 20px;
+              border-radius: 4px;
+              font-size: 14px;
+              font-weight: 500;
+              cursor: pointer;
+            }
+            .silence-dialog-export-btn:hover:not(:disabled) {
+              background: #006cbd;
+            }
+            .silence-dialog-export-btn:disabled {
+              background: #444;
+              color: #888;
+              cursor: not-allowed;
+            }
+            .waveform-skeleton {
+              display: flex;
+              gap: 2px;
+              align-items: flex-end;
+              height: 80px;
+              padding: 0 20px;
+            }
+            .waveform-skeleton-bar {
+              width: 3px;
+              background: #333;
+              border-radius: 1px;
+              animation: pulse 1.5s ease-in-out infinite;
+            }
+            @keyframes pulse {
+              0%, 100% { opacity: 0.3; }
+              50% { opacity: 0.6; }
+            }
+            .waveform-error {
+              color: #888;
+              font-size: 13px;
+            }
+            @media (max-width: 1279px) {
+              .silence-dialog-main {
+                flex-direction: column;
+              }
+              .silence-dialog-preview,
+              .silence-dialog-settings {
+                flex: none;
+                width: 100%;
+                border-right: none;
+              }
+              .silence-dialog-preview {
+                height: 300px;
+                border-bottom: 1px solid #444;
+              }
+            }
+          `}</style>
+
+          {/* Header */}
+          <div className="silence-dialog-header" data-testid="silence-dialog-header">
+            <div className="silence-dialog-header-left">
+              <DialogClose asChild>
+                <button className="silence-dialog-back-btn" aria-label="Back">
+                  Back
+                </button>
+              </DialogClose>
+              <DialogTitle className="silence-dialog-title">
+                Silence Detection
+              </DialogTitle>
+            </div>
+            <DialogClose asChild>
+              <button className="silence-dialog-close-btn" aria-label="Close" data-testid="silence-dialog-close">
+                X
+              </button>
+            </DialogClose>
+          </div>
+
+          {/* Main Content: Preview (left) + Settings (right) */}
+          <div className="silence-dialog-main">
+            <div className="silence-dialog-preview" data-testid="silence-dialog-preview">
+              {/* PreviewPlayer placeholder (section 07) */}
+              Preview Player (Section 07)
+            </div>
+            <div className="silence-dialog-settings" data-testid="silence-dialog-settings">
+              {/* Settings panel placeholder (section 03) */}
+              Settings Panel (Section 03)
+            </div>
+          </div>
+
+          {/* Timeline Zone */}
+          <div className="silence-dialog-timeline" data-testid="silence-dialog-timeline">
+            {waveformLoading && (
+              <div className="waveform-skeleton" data-testid="waveform-loading">
+                {Array.from({ length: 40 }).map((_, i) => (
+                  <div
+                    key={i}
+                    className="waveform-skeleton-bar"
+                    style={{
+                      height: `${20 + Math.random() * 60}%`,
+                      animationDelay: `${i * 0.03}s`,
+                    }}
+                  />
+                ))}
+              </div>
+            )}
+            {waveformError && (
+              <div className="waveform-error" data-testid="waveform-error">
+                Waveform unavailable
+              </div>
+            )}
+            {!waveformLoading && !waveformError && (
+              <span>Timeline (Section 06)</span>
+            )}
+          </div>
+
+          {/* Footer */}
+          <div className="silence-dialog-footer" data-testid="silence-dialog-footer">
+            <div className="silence-dialog-footer-left">
+              <label className="silence-dialog-toggle">
+                <input
+                  type="checkbox"
+                  checked={applyToAllTracks}
+                  onChange={(e) => setApplyToAllTracks(e.target.checked)}
+                />
+                Apply to all tracks
+              </label>
+            </div>
+            <button
+              className="silence-dialog-export-btn"
+              disabled={exportDisabled}
+              onClick={handleExport}
+              data-testid="export-to-timeline-btn"
+            >
+              Export to Timeline
+            </button>
+          </div>
+        </DialogContent>
+      </DialogPortal>
+    </Dialog>
+  );
+};
+
+export default SilenceDetectionDialog;
diff --git a/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx b/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
index 75a17dd..a9e95e6 100644
--- a/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
+++ b/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
@@ -1,437 +1,35 @@
 /**
- * Silence Detection Panel - Dead Air Removal & Video Combine
- * Supports auto-detection and manual selection of silent regions.
- * Uses MediaJobClient for cross-platform silence detection.
+ * Silence Detection Panel - Trigger Button
+ * Opens the full-screen SilenceDetectionDialog.
+ * (Converted from full sidebar panel in section-02)
  */
 
-import React, { useState, useEffect } from 'react';
-import {
-  type SilentRegion,
-  type SilenceDetectionConfig,
-  type VideoEditorProject,
-  type Track,
-  formatTime,
-  generateId
-} from '../../types/videoEditor';
-import { createMediaJobClient } from '../../services/mediaJobClient';
+import React from 'react';
 import './SilenceDetectionPanel.css';
 
 interface SilenceDetectionPanelProps {
-  project: VideoEditorProject;
-  onCutAndCombine: (selectedRegions: SilentRegion[]) => void;
-  onAnalyzeComplete?: (regions: SilentRegion[]) => void;
+  onOpenDialog: () => void;
 }
 
 const SilenceDetectionPanel: React.FC<SilenceDetectionPanelProps> = ({
-  project,
-  onCutAndCombine,
-  onAnalyzeComplete
+  onOpenDialog,
 }) => {
-  // Config state
-  const [threshold, setThreshold] = useState(-40); // dB
-  const [minDuration, setMinDuration] = useState(0.5); // seconds
-  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
-
-  // Detection state
-  const [isAnalyzing, setIsAnalyzing] = useState(false);
-  const [silentRegions, setSilentRegions] = useState<SilentRegion[]>([]);
-  const [analysisComplete, setAnalysisComplete] = useState(false);
-
-  // Stats
-  const [totalSilence, setTotalSilence] = useState(0);
-  const [totalActive, setTotalActive] = useState(0);
-
-  // UI state
-  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
-
-  // Initialize with audio tracks
-  useEffect(() => {
-    const audioTracks = project.timeline.tracks.filter(t => t.type === 'audio' && t.clips.length > 0);
-    if (audioTracks.length > 0 && selectedTrackIds.length === 0) {
-      setSelectedTrackIds([audioTracks[0].id]);
-    }
-  }, [project.timeline.tracks]);
-
-  // Handle track selection
-  const handleTrackToggle = (trackId: string) => {
-    setSelectedTrackIds(prev => {
-      if (prev.includes(trackId)) {
-        return prev.filter(id => id !== trackId);
-      } else {
-        return [...prev, trackId];
-      }
-    });
-  };
-
-  // Auto-detect silent regions via MediaJobClient
-  const handleAutoDetect = async () => {
-    if (selectedTrackIds.length === 0) {
-      alert('Please select at least one track to analyze');
-      return;
-    }
-
-    setIsAnalyzing(true);
-    setAnalysisComplete(false);
-    setSilentRegions([]);
-
-    try {
-      // Find the first selected track's first clip asset URI
-      const selectedTracks = project.timeline.tracks.filter(
-        t => selectedTrackIds.includes(t.id) && t.clips.length > 0
-      );
-
-      if (selectedTracks.length === 0) {
-        throw new Error('No clips found in selected tracks');
-      }
-
-      // Get the asset URI from the first clip of the first selected track
-      const firstClip = selectedTracks[0].clips[0];
-      const asset = project.assets[firstClip.assetId];
-      const assetUri = asset?.path || '';
-
-      if (!assetUri) {
-        throw new Error('No asset URI found for silence detection');
-      }
-
-      // Use MediaJobClient for cross-platform silence detection
-      const client = await createMediaJobClient();
-      const result = await client.detectDeadAir(assetUri, {
-        thresholdDb: threshold,
-        minSilenceMs: minDuration * 1000,
-      });
-
-      // Map result to SilentRegion format
-      const derived = (result as any).derived || {};
-      const silenceSegments = derived.silenceSegments || [];
-      const keepSegments = derived.keepSegments || [];
-
-      const regions: SilentRegion[] = silenceSegments.map((seg: any, i: number) => {
-        const startTime = (seg.startMs || 0) / 1000;
-        const endTime = (seg.endMs || 0) / 1000;
-        const duration = endTime - startTime;
-        return {
-          id: generateId(),
-          startTime,
-          endTime,
-          duration,
-          adjustedStartTime: startTime,
-          adjustedEndTime: endTime,
-          adjustedDuration: duration,
-          averageDb: seg.averageDb || threshold,
-          trackId: selectedTracks[0].id,
-          selected: true,
-          skipped: false,
-        };
-      });
-
-      const totalSilenceDuration = regions.reduce((sum: number, r: SilentRegion) => sum + r.duration, 0);
-      const projectDuration = project.settings.duration || 0;
-      const totalActiveDuration = Math.max(0, projectDuration - totalSilenceDuration);
-
-      setSilentRegions(regions);
-      setTotalSilence(totalSilenceDuration);
-      setTotalActive(totalActiveDuration);
-      setAnalysisComplete(true);
-
-      if (onAnalyzeComplete) {
-        onAnalyzeComplete(regions);
-      }
-    } catch (error) {
-      console.error('Error analyzing silence:', error);
-      alert('Failed to analyze silence. Please try again.');
-    } finally {
-      setIsAnalyzing(false);
-    }
-  };
-
-  // Toggle region selection
-  const handleToggleRegion = (regionId: string) => {
-    setSilentRegions(prev =>
-      prev.map(r => r.id === regionId ? { ...r, selected: !r.selected } : r)
-    );
-  };
-
-  // Select/deselect all regions
-  const handleSelectAll = () => {
-    setSilentRegions(prev => prev.map(r => ({ ...r, selected: true })));
-  };
-
-  const handleDeselectAll = () => {
-    setSilentRegions(prev => prev.map(r => ({ ...r, selected: false })));
-  };
-
-  // Toggle region expanded state
-  const handleToggleExpanded = (regionId: string) => {
-    setExpandedRegions(prev => {
-      const next = new Set(prev);
-      if (next.has(regionId)) {
-        next.delete(regionId);
-      } else {
-        next.add(regionId);
-      }
-      return next;
-    });
-  };
-
-  // Cut and combine video
-  const handleCutAndCombine = () => {
-    const selectedRegions = silentRegions.filter(r => r.selected);
-
-    if (selectedRegions.length === 0) {
-      alert('No silent regions selected. Please select regions to remove.');
-      return;
-    }
-
-    const totalRemoved = selectedRegions.reduce((sum, r) => sum + r.duration, 0);
-    const confirmed = confirm(
-      `Remove ${selectedRegions.length} silent region(s) totaling ${formatTime(totalRemoved)}?\n\n` +
-      `This will cut out the selected regions and combine the remaining segments into a continuous video.`
-    );
-
-    if (confirmed) {
-      onCutAndCombine(selectedRegions);
-    }
-  };
-
-  // Get audio tracks for selection
-  const audioTracks = project.timeline.tracks.filter(t => t.type === 'audio' && t.clips.length > 0);
-  const selectedCount = silentRegions.filter(r => r.selected).length;
-  const selectedDuration = silentRegions.filter(r => r.selected).reduce((sum, r) => sum + r.duration, 0);
-
   return (
     <div className="silence-detection-panel">
       <div className="panel-header">
-        <h3>🔇 Dead Air Detection</h3>
+        <h3>Silence Detection</h3>
         <p className="panel-description">
           Automatically detect and remove silent regions from your video
         </p>
       </div>
 
-      {/* Configuration Section */}
-      <div className="config-section">
-        <h4>Detection Settings</h4>
-
-        {/* Threshold Slider */}
-        <div className="control-group">
-          <label>
-            Silence Threshold: <strong>{threshold} dB</strong>
-            <span className="help-text">Lower = more sensitive</span>
-          </label>
-          <input
-            type="range"
-            min="-60"
-            max="-20"
-            step="1"
-            value={threshold}
-            onChange={(e) => setThreshold(Number(e.target.value))}
-            className="slider"
-            disabled={isAnalyzing}
-          />
-          <div className="slider-labels">
-            <span>-60 dB (Quiet)</span>
-            <span>-20 dB (Loud)</span>
-          </div>
-        </div>
-
-        {/* Min Duration Slider */}
-        <div className="control-group">
-          <label>
-            Minimum Duration: <strong>{minDuration.toFixed(1)}s</strong>
-            <span className="help-text">Ignore shorter silences</span>
-          </label>
-          <input
-            type="range"
-            min="0.1"
-            max="5.0"
-            step="0.1"
-            value={minDuration}
-            onChange={(e) => setMinDuration(Number(e.target.value))}
-            className="slider"
-            disabled={isAnalyzing}
-          />
-          <div className="slider-labels">
-            <span>0.1s</span>
-            <span>5.0s</span>
-          </div>
-        </div>
-
-        {/* Track Selection */}
-        <div className="control-group">
-          <label>Analyze Tracks:</label>
-          <div className="track-checkboxes">
-            {audioTracks.map(track => (
-              <label key={track.id} className="track-checkbox">
-                <input
-                  type="checkbox"
-                  checked={selectedTrackIds.includes(track.id)}
-                  onChange={() => handleTrackToggle(track.id)}
-                  disabled={isAnalyzing}
-                />
-                <span>{track.name}</span>
-                <span className="clip-count">({track.clips.length} clips)</span>
-              </label>
-            ))}
-          </div>
-          {audioTracks.length === 0 && (
-            <p className="warning-text">No audio tracks with clips found</p>
-          )}
-        </div>
-
-        {/* Analyze Button */}
-        <button
-          className="analyze-button"
-          onClick={handleAutoDetect}
-          disabled={isAnalyzing || selectedTrackIds.length === 0 || audioTracks.length === 0}
-        >
-          {isAnalyzing ? (
-            <>
-              <span className="spinner">⏳</span> Analyzing...
-            </>
-          ) : (
-            <>🔍 Auto-Detect Silent Regions</>
-          )}
-        </button>
-      </div>
-
-      {/* Results Section */}
-      {analysisComplete && (
-        <div className="results-section">
-          <div className="results-header">
-            <h4>Detected Regions ({silentRegions.length})</h4>
-            <div className="results-actions">
-              <button onClick={handleSelectAll} className="btn-text">Select All</button>
-              <button onClick={handleDeselectAll} className="btn-text">Deselect All</button>
-            </div>
-          </div>
-
-          {/* Stats */}
-          <div className="stats-grid">
-            <div className="stat-card">
-              <div className="stat-label">Silent</div>
-              <div className="stat-value">{formatTime(totalSilence)}</div>
-            </div>
-            <div className="stat-card">
-              <div className="stat-label">Active</div>
-              <div className="stat-value">{formatTime(totalActive)}</div>
-            </div>
-            <div className="stat-card">
-              <div className="stat-label">Selected</div>
-              <div className="stat-value">
-                {selectedCount} ({formatTime(selectedDuration)})
-              </div>
-            </div>
-          </div>
-
-          {/* Region List */}
-          <div className="regions-list">
-            {silentRegions.length === 0 ? (
-              <div className="empty-state">
-                <p>✨ No silent regions detected!</p>
-                <p className="help-text">Try adjusting the threshold or minimum duration</p>
-              </div>
-            ) : (
-              silentRegions.map((region, index) => (
-                <div
-                  key={region.id}
-                  className={`region-item ${region.selected ? 'selected' : ''} ${
-                    expandedRegions.has(region.id) ? 'expanded' : ''
-                  }`}
-                >
-                  <div className="region-header" onClick={() => handleToggleExpanded(region.id)}>
-                    <input
-                      type="checkbox"
-                      checked={region.selected}
-                      onChange={(e) => {
-                        e.stopPropagation();
-                        handleToggleRegion(region.id);
-                      }}
-                      className="region-checkbox"
-                    />
-                    <div className="region-info">
-                      <div className="region-title">
-                        Region #{index + 1}
-                        {region.selected && <span className="badge-selected">✓ Selected</span>}
-                      </div>
-                      <div className="region-time">
-                        {formatTime(region.startTime)} → {formatTime(region.endTime)}
-                        <span className="duration">({formatTime(region.duration)})</span>
-                      </div>
-                    </div>
-                    <button
-                      className="expand-btn"
-                      onClick={(e) => {
-                        e.stopPropagation();
-                        handleToggleExpanded(region.id);
-                      }}
-                    >
-                      {expandedRegions.has(region.id) ? '▼' : '▶'}
-                    </button>
-                  </div>
-
-                  {expandedRegions.has(region.id) && (
-                    <div className="region-details">
-                      <div className="detail-row">
-                        <span className="detail-label">Start:</span>
-                        <span className="detail-value">{formatTime(region.startTime)}</span>
-                      </div>
-                      <div className="detail-row">
-                        <span className="detail-label">End:</span>
-                        <span className="detail-value">{formatTime(region.endTime)}</span>
-                      </div>
-                      <div className="detail-row">
-                        <span className="detail-label">Duration:</span>
-                        <span className="detail-value">{formatTime(region.duration)}</span>
-                      </div>
-                      <div className="detail-row">
-                        <span className="detail-label">Avg Level:</span>
-                        <span className="detail-value">{region.averageDb.toFixed(1)} dB</span>
-                      </div>
-                      <div className="detail-row">
-                        <span className="detail-label">Track:</span>
-                        <span className="detail-value">
-                          {project.timeline.tracks.find(t => t.id === region.trackId)?.name || 'Unknown'}
-                        </span>
-                      </div>
-                    </div>
-                  )}
-                </div>
-              ))
-            )}
-          </div>
-
-          {/* Cut & Combine Button */}
-          {silentRegions.length > 0 && (
-            <button
-              className="cut-combine-button"
-              onClick={handleCutAndCombine}
-              disabled={selectedCount === 0}
-            >
-              ✂️ Cut & Combine ({selectedCount} region{selectedCount !== 1 ? 's' : ''})
-            </button>
-          )}
-        </div>
-      )}
-
-      {/* Help Section */}
-      <div className="help-section">
-        <details>
-          <summary>💡 How to use</summary>
-          <div className="help-content">
-            <ol>
-              <li>Adjust the <strong>Silence Threshold</strong> (lower = more sensitive)</li>
-              <li>Set the <strong>Minimum Duration</strong> (ignore very short pauses)</li>
-              <li>Select which <strong>Audio Tracks</strong> to analyze</li>
-              <li>Click <strong>Auto-Detect</strong> to find silent regions</li>
-              <li>Review detected regions and <strong>toggle selection</strong> as needed</li>
-              <li>Click <strong>Cut & Combine</strong> to remove selected regions</li>
-            </ol>
-            <p className="help-note">
-              <strong>Note:</strong> The cut operation will remove all selected silent regions
-              and automatically combine the remaining segments into a continuous video.
-            </p>
-          </div>
-        </details>
-      </div>
+      <button
+        className="analyze-button"
+        onClick={onOpenDialog}
+        data-testid="open-silence-dialog"
+      >
+        Open Silence Detection
+      </button>
     </div>
   );
 };
diff --git a/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx b/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx
index 92bc8e9..9c895b5 100644
--- a/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx
+++ b/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx
@@ -19,6 +19,7 @@ import HistoryPanel from './HistoryPanel';
 import TransitionsPanel from './TransitionsPanel';
 import OverlayPanel from './OverlayPanel';
 import SilenceDetectionPanel from './SilenceDetectionPanel';
+import SilenceDetectionDialog from './SilenceDetectionDialog';
 import TextClipEditor from './TextClipEditor';
 import { projectManager } from '../../services/projectManager';
 import { videoEditorRenderService, videoEditorMediaLibrary } from '../../services/videoEditorService';
@@ -69,6 +70,7 @@ export const VideoEditorPhase3: React.FC = () => {
 
   // Dialogs
   const [showExportDialog, setShowExportDialog] = useState(false);
+  const [showSilenceDialog, setShowSilenceDialog] = useState(false);
   const [showRenderProgress, setShowRenderProgress] = useState(false);
   const [currentRenderJob, setCurrentRenderJob] = useState<string | null>(null);
   const [confirmDialog, setConfirmDialog] = useState<Omit<ConfirmDialogProps, 'onConfirm' | 'onCancel'> | null>(null);
@@ -756,6 +758,16 @@ export const VideoEditorPhase3: React.FC = () => {
   // Silence Detection & Dead Air Removal
   // ========================================
 
+  const handleSilenceExportToTimeline = useCallback(
+    (selectedRegions: SilentRegion[], applyToAllTracks: boolean) => {
+      // Section 08 implements the full clip splitting + ripple delete logic.
+      // For now, close the dialog and log.
+      console.log('Export to timeline:', selectedRegions.length, 'regions');
+      setShowSilenceDialog(false);
+    },
+    [],
+  );
+
   const handleCutAndCombine = useCallback((selectedRegions: SilentRegion[]) => {
     if (selectedRegions.length === 0) return;
 
@@ -2036,8 +2048,7 @@ export const VideoEditorPhase3: React.FC = () => {
               )}
               {sidebarView === 'silence' && (
                 <SilenceDetectionPanel
-                  project={project}
-                  onCutAndCombine={handleCutAndCombine}
+                  onOpenDialog={() => setShowSilenceDialog(true)}
                 />
               )}
               {sidebarView === 'text' && (
@@ -2068,6 +2079,15 @@ export const VideoEditorPhase3: React.FC = () => {
           />
         )}
 
+        {/* Silence Detection Dialog */}
+        {showSilenceDialog && (
+          <SilenceDetectionDialog
+            project={project}
+            onExportToTimeline={handleSilenceExportToTimeline}
+            onClose={() => setShowSilenceDialog(false)}
+          />
+        )}
+
         {/* Confirm Dialog */}
         {confirmDialog && (
           <ConfirmDialog
diff --git a/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionDialog.test.tsx b/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionDialog.test.tsx
new file mode 100644
index 0000000..d64133a
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionDialog.test.tsx
@@ -0,0 +1,100 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import SilenceDetectionDialog from "../SilenceDetectionDialog";
+import type { VideoEditorProject } from "../../../types/videoEditor";
+import { createEmptyProject } from "../../../types/videoEditor";
+
+// Mock the mediaJobClient to prevent real API calls
+vi.mock("../../../services/mediaJobClient", () => ({
+  createMediaJobClient: vi.fn(() =>
+    Promise.resolve({
+      getWaveformPeaks: vi.fn(() =>
+        Promise.resolve({ derived: { peaks: [0.1, 0.2, 0.3] } }),
+      ),
+    }),
+  ),
+}));
+
+function makeTestProject(): VideoEditorProject {
+  const p = createEmptyProject("Test");
+  return p;
+}
+
+describe("SilenceDetectionDialog", () => {
+  const mockOnClose = vi.fn();
+  const mockOnExport = vi.fn();
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("renders all four structural zones", () => {
+    render(
+      <SilenceDetectionDialog
+        project={makeTestProject()}
+        onExportToTimeline={mockOnExport}
+        onClose={mockOnClose}
+      />,
+    );
+
+    expect(screen.getByTestId("silence-dialog-header")).toBeDefined();
+    expect(screen.getByTestId("silence-dialog-settings")).toBeDefined();
+    expect(screen.getByTestId("silence-dialog-timeline")).toBeDefined();
+    expect(screen.getByTestId("silence-dialog-footer")).toBeDefined();
+  });
+
+  it("renders the title 'Silence Detection'", () => {
+    render(
+      <SilenceDetectionDialog
+        project={makeTestProject()}
+        onExportToTimeline={mockOnExport}
+        onClose={mockOnClose}
+      />,
+    );
+
+    expect(screen.getByText("Silence Detection")).toBeDefined();
+  });
+
+  it("disables Export button when no analysis has been performed", () => {
+    render(
+      <SilenceDetectionDialog
+        project={makeTestProject()}
+        onExportToTimeline={mockOnExport}
+        onClose={mockOnClose}
+      />,
+    );
+
+    const exportBtn = screen.getByTestId("export-to-timeline-btn");
+    expect(exportBtn.hasAttribute("disabled")).toBe(true);
+  });
+
+  it("renders Export to Timeline button text", () => {
+    render(
+      <SilenceDetectionDialog
+        project={makeTestProject()}
+        onExportToTimeline={mockOnExport}
+        onClose={mockOnClose}
+      />,
+    );
+
+    expect(screen.getByText("Export to Timeline")).toBeDefined();
+  });
+
+  it("uses responsive layout classes for the main content area", () => {
+    render(
+      <SilenceDetectionDialog
+        project={makeTestProject()}
+        onExportToTimeline={mockOnExport}
+        onClose={mockOnClose}
+      />,
+    );
+
+    // Verify the main container has the class that the responsive CSS targets
+    const mainEl = document.querySelector(".silence-dialog-main");
+    expect(mainEl).not.toBeNull();
+  });
+});
diff --git a/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionPanelTrigger.test.tsx b/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionPanelTrigger.test.tsx
new file mode 100644
index 0000000..4f9175e
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/SilenceDetectionPanelTrigger.test.tsx
@@ -0,0 +1,31 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import SilenceDetectionPanel from "../SilenceDetectionPanel";
+
+describe("SilenceDetectionPanel (trigger mode)", () => {
+  it('renders trigger button with "Open Silence Detection" text', () => {
+    render(<SilenceDetectionPanel onOpenDialog={() => {}} />);
+
+    expect(screen.getByText("Open Silence Detection")).toBeDefined();
+  });
+
+  it("calls onOpenDialog when button is clicked", () => {
+    const mockOnOpen = vi.fn();
+    render(<SilenceDetectionPanel onOpenDialog={mockOnOpen} />);
+
+    const btn = screen.getByTestId("open-silence-dialog");
+    fireEvent.click(btn);
+
+    expect(mockOnOpen).toHaveBeenCalledTimes(1);
+  });
+
+  it("renders the title text", () => {
+    render(<SilenceDetectionPanel onOpenDialog={() => {}} />);
+
+    expect(screen.getByText("Silence Detection")).toBeDefined();
+  });
+});
diff --git a/apps/web/client/src/test-setup.ts b/apps/web/client/src/test-setup.ts
new file mode 100644
index 0000000..43c30a9
--- /dev/null
+++ b/apps/web/client/src/test-setup.ts
@@ -0,0 +1,77 @@
+// Fix monorepo React version mismatch — MUST run before any React imports.
+// Root node_modules has React 18 (from reactflow), apps/web has React 19.
+// @testing-library/react is hoisted to root and resolves react-dom v18.
+// This hook forces all react/react-dom imports to resolve from apps/web.
+import Module from "node:module";
+import path from "node:path";
+
+const webNodeModules = path.resolve(
+  import.meta.dirname,
+  "..",
+  "..",
+  "node_modules",
+);
+
+const overrides: Record<string, string> = {
+  react: path.join(webNodeModules, "react"),
+  "react-dom": path.join(webNodeModules, "react-dom"),
+  "react-dom/client": path.join(webNodeModules, "react-dom", "client.js"),
+  "react-dom/test-utils": path.join(
+    webNodeModules,
+    "react-dom",
+    "test-utils.js",
+  ),
+};
+
+const originalResolveFilename = (Module as any)._resolveFilename;
+(Module as any)._resolveFilename = function (
+  request: string,
+  parent: any,
+  isMain: boolean,
+  options: any,
+) {
+  if (overrides[request]) {
+    return originalResolveFilename.call(
+      this,
+      overrides[request],
+      parent,
+      isMain,
+      options,
+    );
+  }
+  if (request.startsWith("react-dom/") && !overrides[request]) {
+    const subPath = request.slice("react-dom/".length);
+    const redirected = path.join(webNodeModules, "react-dom", subPath);
+    return originalResolveFilename.call(
+      this,
+      redirected,
+      parent,
+      isMain,
+      options,
+    );
+  }
+  if (request.startsWith("react/")) {
+    const subPath = request.slice("react/".length);
+    const redirected = path.join(webNodeModules, "react", subPath);
+    return originalResolveFilename.call(
+      this,
+      redirected,
+      parent,
+      isMain,
+      options,
+    );
+  }
+  return originalResolveFilename.call(this, request, parent, isMain, options);
+};
+
+// React 19 testing environment setup
+(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
+
+// RTL auto-cleanup may not trigger with custom module resolution,
+// so register it explicitly. Dynamic import ensures the hook is active first.
+import { afterEach } from "vitest";
+
+afterEach(async () => {
+  const { cleanup } = await import("@testing-library/react");
+  cleanup();
+});
diff --git a/apps/web/package.json b/apps/web/package.json
index e7db08d..b4f8d95 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -125,6 +125,9 @@
     "@builder.io/vite-plugin-jsx-loc": "^0.1.1",
     "@tailwindcss/typography": "^0.5.15",
     "@tailwindcss/vite": "^4.1.3",
+    "@testing-library/jest-dom": "^6.9.1",
+    "@testing-library/react": "^16.3.2",
+    "@testing-library/user-event": "^14.6.1",
     "@types/adm-zip": "^0.5.7",
     "@types/dockerode": "^3.3.31",
     "@types/express": "4.17.21",
@@ -132,8 +135,8 @@
     "@types/js-yaml": "^4.0.9",
     "@types/jsonwebtoken": "^9.0.6",
     "@types/node": "^24.7.0",
-    "@types/pg": "^8.15.5",
     "@types/papaparse": "^5.5.2",
+    "@types/pg": "^8.15.5",
     "@types/react": "^19.2.1",
     "@types/react-dom": "^19.2.1",
     "@types/react-syntax-highlighter": "^15.5.13",
@@ -144,6 +147,8 @@
     "autoprefixer": "^10.4.20",
     "drizzle-kit": "^0.31.4",
     "esbuild": "^0.25.0",
+    "happy-dom": "^20.6.1",
+    "jsdom": "^28.0.0",
     "nodemon": "^3.1.11",
     "pnpm": "^10.15.1",
     "postcss": "^8.4.47",
diff --git a/apps/web/vitest.config.ts b/apps/web/vitest.config.ts
index c8c7cab..74bc246 100644
--- a/apps/web/vitest.config.ts
+++ b/apps/web/vitest.config.ts
@@ -1,12 +1,17 @@
 import { defineConfig } from "vitest/config";
+import react from "@vitejs/plugin-react";
 import path from "path";
 
 const templateRoot = path.resolve(import.meta.dirname);
 
 export default defineConfig({
+  plugins: [react()],
   root: templateRoot,
   resolve: {
+    dedupe: ["react", "react-dom"],
     alias: {
+      "react": path.resolve(templateRoot, "node_modules", "react"),
+      "react-dom": path.resolve(templateRoot, "node_modules", "react-dom"),
       "@": path.resolve(templateRoot, "client", "src"),
       "@shared": path.resolve(templateRoot, "shared"),
       "@assets": path.resolve(templateRoot, "attached_assets"),
@@ -15,7 +20,13 @@ export default defineConfig({
   },
   test: {
     environment: "node",
-    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "shared/**/*.test.ts"],
+    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx", "shared/**/*.test.ts"],
+    setupFiles: ["client/src/test-setup.ts"],
+    server: {
+      deps: {
+        inline: [/react/, /react-dom/, /@testing-library/],
+      },
+    },
     coverage: {
       provider: "v8",
       reportsDirectory: "coverage",
diff --git a/package-lock.json b/package-lock.json
index 9fa047f..050de28 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -172,6 +172,7 @@
         "sanitize-html": "^2.17.0",
         "sonner": "^2.0.7",
         "streamdown": "^1.4.0",
+        "stripe": "^18.5.0",
         "superjson": "^1.13.3",
         "tailwind-merge": "^3.3.1",
         "tailwindcss-animate": "^1.0.7",
@@ -184,6 +185,9 @@
         "@builder.io/vite-plugin-jsx-loc": "^0.1.1",
         "@tailwindcss/typography": "^0.5.15",
         "@tailwindcss/vite": "^4.1.3",
+        "@testing-library/jest-dom": "^6.9.1",
+        "@testing-library/react": "^16.3.2",
+        "@testing-library/user-event": "^14.6.1",
         "@types/adm-zip": "^0.5.7",
         "@types/dockerode": "^3.3.31",
         "@types/express": "4.17.21",
@@ -192,6 +196,7 @@
         "@types/jsonwebtoken": "^9.0.6",
         "@types/node": "^24.7.0",
         "@types/papaparse": "^5.5.2",
+        "@types/pg": "^8.15.5",
         "@types/react": "^19.2.1",
         "@types/react-dom": "^19.2.1",
         "@types/react-syntax-highlighter": "^15.5.13",
@@ -202,6 +207,8 @@
         "autoprefixer": "^10.4.20",
         "drizzle-kit": "^0.31.4",
         "esbuild": "^0.25.0",
+        "happy-dom": "^20.6.1",
+        "jsdom": "^28.0.0",
         "nodemon": "^3.1.11",
         "pnpm": "^10.15.1",
         "postcss": "^8.4.47",
@@ -3068,20 +3075,6 @@
         "node": ">=8"
       }
     },
-    "apps/web/node_modules/call-bound": {
-      "version": "1.0.4",
-      "license": "MIT",
-      "dependencies": {
-        "call-bind-apply-helpers": "^1.0.2",
-        "get-intrinsic": "^1.3.0"
-      },
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
     "apps/web/node_modules/chai": {
       "version": "5.3.3",
       "dev": true,
@@ -5378,16 +5371,6 @@
         "node": ">=6.0.0"
       }
     },
-    "apps/web/node_modules/object-inspect": {
-      "version": "1.13.4",
-      "license": "MIT",
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
     "apps/web/node_modules/on-finished": {
       "version": "2.4.1",
       "license": "MIT",
@@ -5588,19 +5571,6 @@
         "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
       }
     },
-    "apps/web/node_modules/qs": {
-      "version": "6.14.1",
-      "license": "BSD-3-Clause",
-      "dependencies": {
-        "side-channel": "^1.1.0"
-      },
-      "engines": {
-        "node": ">=0.6"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
     "apps/web/node_modules/range-parser": {
       "version": "1.2.1",
       "license": "MIT",
@@ -5940,70 +5910,6 @@
         "@types/hast": "^3.0.4"
       }
     },
-    "apps/web/node_modules/side-channel": {
-      "version": "1.1.0",
-      "license": "MIT",
-      "dependencies": {
-        "es-errors": "^1.3.0",
-        "object-inspect": "^1.13.3",
-        "side-channel-list": "^1.0.0",
-        "side-channel-map": "^1.0.1",
-        "side-channel-weakmap": "^1.0.2"
-      },
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
-    "apps/web/node_modules/side-channel-list": {
-      "version": "1.0.0",
-      "license": "MIT",
-      "dependencies": {
-        "es-errors": "^1.3.0",
-        "object-inspect": "^1.13.3"
-      },
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
-    "apps/web/node_modules/side-channel-map": {
-      "version": "1.0.1",
-      "license": "MIT",
-      "dependencies": {
-        "call-bound": "^1.0.2",
-        "es-errors": "^1.3.0",
-        "get-intrinsic": "^1.2.5",
-        "object-inspect": "^1.13.3"
-      },
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
-    "apps/web/node_modules/side-channel-weakmap": {
-      "version": "1.0.2",
-      "license": "MIT",
-      "dependencies": {
-        "call-bound": "^1.0.2",
-        "es-errors": "^1.3.0",
-        "get-intrinsic": "^1.2.5",
-        "object-inspect": "^1.13.3",
-        "side-channel-map": "^1.0.1"
-      },
-      "engines": {
-        "node": ">= 0.4"
-      },
-      "funding": {
-        "url": "https://github.com/sponsors/ljharb"
-      }
-    },
     "apps/web/node_modules/signal-exit": {
       "version": "4.1.0",
       "dev": true,
@@ -7715,6 +7621,51 @@
         "node": ">=8"
       }
     },
+    "node_modules/@acemir/cssom": {
+      "version": "0.9.31",
+      "resolved": "https://registry.npmjs.org/@acemir/cssom/-/cssom-0.9.31.tgz",
+      "integrity": "sha512-ZnR3GSaH+/vJ0YlHau21FjfLYjMpYVIzTD8M8vIEQvIGxeOXyXdzCI140rrCY862p/C/BbzWsjc1dgnM9mkoTA==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@adobe/css-tools": {
+      "version": "4.4.4",
+      "resolved": "https://registry.npmjs.org/@adobe/css-tools/-/css-tools-4.4.4.tgz",
+      "integrity": "sha512-Elp+iwUx5rN5+Y8xLt5/GRoG20WGoDCQ/1Fb+1LiGtvwbDavuSk0jhD/eZdckHAuzcDzccnkv+rEjyWfRx18gg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@asamuzakjp/dom-selector": {
+      "version": "6.7.8",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/dom-selector/-/dom-selector-6.7.8.tgz",
+      "integrity": "sha512-stisC1nULNc9oH5lakAj8MH88ZxeGxzyWNDfbdCxvJSJIvDsHNZqYvscGTgy/ysgXWLJPt6K/4t0/GjvtKcFJQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@asamuzakjp/nwsapi": "^2.3.9",
+        "bidi-js": "^1.0.3",
+        "css-tree": "^3.1.0",
+        "is-potential-custom-element-name": "^1.0.1",
+        "lru-cache": "^11.2.5"
+      }
+    },
+    "node_modules/@asamuzakjp/dom-selector/node_modules/lru-cache": {
+      "version": "11.2.6",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-11.2.6.tgz",
+      "integrity": "sha512-ESL2CrkS/2wTPfuend7Zhkzo2u0daGJ/A2VucJOgQ/C48S/zB8MMeMHSGKYpXhIjbPxfuezITkaBH1wqv00DDQ==",
+      "dev": true,
+      "license": "BlueOak-1.0.0",
+      "engines": {
+        "node": "20 || >=22"
+      }
+    },
+    "node_modules/@asamuzakjp/nwsapi": {
+      "version": "2.3.9",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/nwsapi/-/nwsapi-2.3.9.tgz",
+      "integrity": "sha512-n8GuYSrI9bF7FFZ/SjhwevlHc8xaVlb/7HmHelnc/PZXBD2ZR49NnN9sMMuDdEGPeeRQ5d0hqlSlEpgCX3Wl0Q==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@babel/code-frame": {
       "version": "7.29.0",
       "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz",
@@ -8008,6 +7959,23 @@
         "node": ">=6.9.0"
       }
     },
+    "node_modules/@csstools/css-syntax-patches-for-csstree": {
+      "version": "1.0.27",
+      "resolved": "https://registry.npmjs.org/@csstools/css-syntax-patches-for-csstree/-/css-syntax-patches-for-csstree-1.0.27.tgz",
+      "integrity": "sha512-sxP33Jwg1bviSUXAV43cVYdmjt2TLnLXNqCWl9xmxHawWVjGz/kEbdkr7F9pxJNBN2Mh+dq0crgItbW6tQvyow==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT-0"
+    },
     "node_modules/@date-fns/tz": {
       "version": "1.4.1",
       "resolved": "https://registry.npmjs.org/@date-fns/tz/-/tz-1.4.1.tgz",
@@ -8462,6 +8430,24 @@
         "node": ">=18"
       }
     },
+    "node_modules/@exodus/bytes": {
+      "version": "1.14.1",
+      "resolved": "https://registry.npmjs.org/@exodus/bytes/-/bytes-1.14.1.tgz",
+      "integrity": "sha512-OhkBFWI6GcRMUroChZiopRiSp2iAMvEBK47NhJooDqz1RERO4QuZIZnjP63TXX8GAiLABkYmX+fuQsdJ1dd2QQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      },
+      "peerDependencies": {
+        "@noble/hashes": "^1.8.0 || ^2.0.0"
+      },
+      "peerDependenciesMeta": {
+        "@noble/hashes": {
+          "optional": true
+        }
+      }
+    },
     "node_modules/@floating-ui/core": {
       "version": "1.7.4",
       "resolved": "https://registry.npmjs.org/@floating-ui/core/-/core-1.7.4.tgz",
@@ -11261,6 +11247,103 @@
         "@tauri-apps/api": "^2.8.0"
       }
     },
+    "node_modules/@testing-library/dom": {
+      "version": "10.4.1",
+      "resolved": "https://registry.npmjs.org/@testing-library/dom/-/dom-10.4.1.tgz",
+      "integrity": "sha512-o4PXJQidqJl82ckFaXUeoAW+XysPLauYI43Abki5hABd853iMhitooc6znOnczgbTYmEP6U6/y1ZyKAIsvMKGg==",
+      "dev": true,
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "@babel/code-frame": "^7.10.4",
+        "@babel/runtime": "^7.12.5",
+        "@types/aria-query": "^5.0.1",
+        "aria-query": "5.3.0",
+        "dom-accessibility-api": "^0.5.9",
+        "lz-string": "^1.5.0",
+        "picocolors": "1.1.1",
+        "pretty-format": "^27.0.2"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/@testing-library/jest-dom": {
+      "version": "6.9.1",
+      "resolved": "https://registry.npmjs.org/@testing-library/jest-dom/-/jest-dom-6.9.1.tgz",
+      "integrity": "sha512-zIcONa+hVtVSSep9UT3jZ5rizo2BsxgyDYU7WFD5eICBE7no3881HGeb/QkGfsJs6JTkY1aQhT7rIPC7e+0nnA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@adobe/css-tools": "^4.4.0",
+        "aria-query": "^5.0.0",
+        "css.escape": "^1.5.1",
+        "dom-accessibility-api": "^0.6.3",
+        "picocolors": "^1.1.1",
+        "redent": "^3.0.0"
+      },
+      "engines": {
+        "node": ">=14",
+        "npm": ">=6",
+        "yarn": ">=1"
+      }
+    },
+    "node_modules/@testing-library/jest-dom/node_modules/dom-accessibility-api": {
+      "version": "0.6.3",
+      "resolved": "https://registry.npmjs.org/dom-accessibility-api/-/dom-accessibility-api-0.6.3.tgz",
+      "integrity": "sha512-7ZgogeTnjuHbo+ct10G9Ffp0mif17idi0IyWNVA/wcwcm7NPOD/WEHVP3n7n3MhXqxoIYm8d6MuZohYWIZ4T3w==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@testing-library/react": {
+      "version": "16.3.2",
+      "resolved": "https://registry.npmjs.org/@testing-library/react/-/react-16.3.2.tgz",
+      "integrity": "sha512-XU5/SytQM+ykqMnAnvB2umaJNIOsLF3PVv//1Ew4CTcpz0/BRyy/af40qqrt7SjKpDdT1saBMc42CUok5gaw+g==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@babel/runtime": "^7.12.5"
+      },
+      "engines": {
+        "node": ">=18"
+      },
+      "peerDependencies": {
+        "@testing-library/dom": "^10.0.0",
+        "@types/react": "^18.0.0 || ^19.0.0",
+        "@types/react-dom": "^18.0.0 || ^19.0.0",
+        "react": "^18.0.0 || ^19.0.0",
+        "react-dom": "^18.0.0 || ^19.0.0"
+      },
+      "peerDependenciesMeta": {
+        "@types/react": {
+          "optional": true
+        },
+        "@types/react-dom": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/@testing-library/user-event": {
+      "version": "14.6.1",
+      "resolved": "https://registry.npmjs.org/@testing-library/user-event/-/user-event-14.6.1.tgz",
+      "integrity": "sha512-vq7fv0rnt+QTXgPxr5Hjc210p6YKq2kmdziLgnsZGgLJ9e6VAShx1pACLuRjd/AS/sr7phAR58OIIpf0LlmQNw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=12",
+        "npm": ">=6"
+      },
+      "peerDependencies": {
+        "@testing-library/dom": ">=7.21.4"
+      }
+    },
+    "node_modules/@types/aria-query": {
+      "version": "5.0.4",
+      "resolved": "https://registry.npmjs.org/@types/aria-query/-/aria-query-5.0.4.tgz",
+      "integrity": "sha512-rfT93uj5s0PRL7EzccGMs3brplhcrghnDoV26NqKhCAS1hVo+WdNsPvE/yb6ilfr5hi2MEk6d5EWJTKdxg8jVw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@types/babel__core": {
       "version": "7.20.5",
       "resolved": "https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz",
@@ -11696,6 +11779,19 @@
         "@types/node": "*"
       }
     },
+    "node_modules/@types/pg": {
+      "version": "8.16.0",
+      "resolved": "https://registry.npmjs.org/@types/pg/-/pg-8.16.0.tgz",
+      "integrity": "sha512-RmhMd/wD+CF8Dfo+cVIy3RR5cl8CyfXQ0tGgW6XBL8L4LM/UTEbNXYRbLwU6w+CgrKBNbrQWt4FUtTfaU5jSYQ==",
+      "devOptional": true,
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "@types/node": "*",
+        "pg-protocol": "*",
+        "pg-types": "^2.2.0"
+      }
+    },
     "node_modules/@types/prismjs": {
       "version": "1.26.6",
       "resolved": "https://registry.npmjs.org/@types/prismjs/-/prismjs-1.26.6.tgz",
@@ -11760,6 +11856,23 @@
       "integrity": "sha512-ko/gIFJRv177XgZsZcBwnqJN5x/Gien8qNOn0D5bQU/zAzVf9Zt3BlcUiLqhV9y4ARk0GbT3tnUiPNgnTXzc/Q==",
       "license": "MIT"
     },
+    "node_modules/@types/whatwg-mimetype": {
+      "version": "3.0.2",
+      "resolved": "https://registry.npmjs.org/@types/whatwg-mimetype/-/whatwg-mimetype-3.0.2.tgz",
+      "integrity": "sha512-c2AKvDT8ToxLIOUlN51gTiHXflsfIFisS4pO7pDPoKouJCESkhZnEy623gwP9laCy5lnLDAw1vAzu2vM2YLOrA==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/@types/ws": {
+      "version": "8.18.1",
+      "resolved": "https://registry.npmjs.org/@types/ws/-/ws-8.18.1.tgz",
+      "integrity": "sha512-ThVF6DCVhA8kUGy+aazFQ4kXQ7E1Ty7A3ypFOe0IcJV8O/M511G99AW24irKrW56Wt44yG9+ij8FaqoBGkuBXg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/node": "*"
+      }
+    },
     "node_modules/@types/xlsx": {
       "version": "0.0.35",
       "resolved": "https://registry.npmjs.org/@types/xlsx/-/xlsx-0.0.35.tgz",
@@ -11843,6 +11956,39 @@
         "node": ">=0.8"
       }
     },
+    "node_modules/agent-base": {
+      "version": "7.1.4",
+      "resolved": "https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz",
+      "integrity": "sha512-MnA+YT8fwfJPgBx3m60MNqakm30XOkyIoH1y6huTQvC0PwZG7ki8NacLBcrPbNoo8vEZy7Jpuk7+jMO+CUovTQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/ansi-regex": {
+      "version": "5.0.1",
+      "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
+      "integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/ansi-styles": {
+      "version": "5.2.0",
+      "resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-5.2.0.tgz",
+      "integrity": "sha512-Cxwpt2SfTzTtXcfOlzGEee8O+c+MmUgGrNiBcXnuWxuFJHe6a5Hz7qwhwe5OgaSYI0IJvkLqWX1ASG+cJOkEiA==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/chalk/ansi-styles?sponsor=1"
+      }
+    },
     "node_modules/anymatch": {
       "version": "3.1.3",
       "resolved": "https://registry.npmjs.org/anymatch/-/anymatch-3.1.3.tgz",
@@ -11910,6 +12056,16 @@
         "node": ">=10"
       }
     },
+    "node_modules/aria-query": {
+      "version": "5.3.0",
+      "resolved": "https://registry.npmjs.org/aria-query/-/aria-query-5.3.0.tgz",
+      "integrity": "sha512-b0P0sZPKtyu8HkeRAfCq0IfURZK+SuwMjY1UXGBU27wpAiTwQAIlq56IbIO+ytk/JjS1fMR14ee5WBBfKi5J6A==",
+      "dev": true,
+      "license": "Apache-2.0",
+      "dependencies": {
+        "dequal": "^2.0.3"
+      }
+    },
     "node_modules/assertion-error": {
       "version": "2.0.1",
       "resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz",
@@ -12004,6 +12160,16 @@
         "node": ">= 18"
       }
     },
+    "node_modules/bidi-js": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/bidi-js/-/bidi-js-1.0.3.tgz",
+      "integrity": "sha512-RKshQI1R3YQ+n9YJz2QQ147P66ELpa1FQEg20Dk8oW9t2KgLbpDLLp9aGZ7y8WHSshDknG0bknqGw5/tyCs5tw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "require-from-string": "^2.0.2"
+      }
+    },
     "node_modules/binary-extensions": {
       "version": "2.3.0",
       "resolved": "https://registry.npmjs.org/binary-extensions/-/binary-extensions-2.3.0.tgz",
@@ -12139,6 +12305,22 @@
         "node": ">= 0.4"
       }
     },
+    "node_modules/call-bound": {
+      "version": "1.0.4",
+      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
+      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bind-apply-helpers": "^1.0.2",
+        "get-intrinsic": "^1.3.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/caniuse-lite": {
       "version": "1.0.30001766",
       "resolved": "https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001766.tgz",
@@ -12415,14 +12597,35 @@
         "node": ">= 8"
       }
     },
-    "node_modules/cssesc": {
-      "version": "3.0.0",
-      "resolved": "https://registry.npmjs.org/cssesc/-/cssesc-3.0.0.tgz",
-      "integrity": "sha512-/Tb/JcjK111nNScGob5MNtsntNM1aCNUDipB/TkwZFhyDrrE47SOx/18wF2bbjgc3ZzCSKW1T5nt5EbFoAz/Vg==",
+    "node_modules/css-tree": {
+      "version": "3.1.0",
+      "resolved": "https://registry.npmjs.org/css-tree/-/css-tree-3.1.0.tgz",
+      "integrity": "sha512-0eW44TGN5SQXU1mWSkKwFstI/22X2bG1nYzZTYMAWjylYURhse752YgbE4Cx46AC+bAvI+/dYTPRk1LqSUnu6w==",
       "dev": true,
       "license": "MIT",
-      "bin": {
-        "cssesc": "bin/cssesc"
+      "dependencies": {
+        "mdn-data": "2.12.2",
+        "source-map-js": "^1.0.1"
+      },
+      "engines": {
+        "node": "^10 || ^12.20.0 || ^14.13.0 || >=15.0.0"
+      }
+    },
+    "node_modules/css.escape": {
+      "version": "1.5.1",
+      "resolved": "https://registry.npmjs.org/css.escape/-/css.escape-1.5.1.tgz",
+      "integrity": "sha512-YUifsXXuknHlUsmlgyY0PKzgPOr7/FjCePfHNt0jxm83wHZi44VDMQ7/fGNkjY3/jV1MC+1CmZbaHzugyeRtpg==",
+      "dev": true,
+      "license": "MIT"
+    },
+    "node_modules/cssesc": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/cssesc/-/cssesc-3.0.0.tgz",
+      "integrity": "sha512-/Tb/JcjK111nNScGob5MNtsntNM1aCNUDipB/TkwZFhyDrrE47SOx/18wF2bbjgc3ZzCSKW1T5nt5EbFoAz/Vg==",
+      "dev": true,
+      "license": "MIT",
+      "bin": {
+        "cssesc": "bin/cssesc"
       },
       "engines": {
         "node": ">=4"
@@ -12655,6 +12858,13 @@
         }
       }
     },
+    "node_modules/decimal.js": {
+      "version": "10.6.0",
+      "resolved": "https://registry.npmjs.org/decimal.js/-/decimal.js-10.6.0.tgz",
+      "integrity": "sha512-YpgQiITW3JXGntzdUmyUR1V812Hn8T1YVXhCu+wO3OpS4eU9l4YdD3qjyiKdV6mvV29zapkMeD390UVEf2lkUg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/decimal.js-light": {
       "version": "2.5.1",
       "resolved": "https://registry.npmjs.org/decimal.js-light/-/decimal.js-light-2.5.1.tgz",
@@ -12730,6 +12940,13 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/dom-accessibility-api": {
+      "version": "0.5.16",
+      "resolved": "https://registry.npmjs.org/dom-accessibility-api/-/dom-accessibility-api-0.5.16.tgz",
+      "integrity": "sha512-X7BJ2yElsnOJ30pZF4uIIDfBEVgF4XEBxL9Bxhy6dnrm5hkzqmsWHGTiHqRiITNhMyFLyAiWndIJP7Z1NTteDg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/dom-helpers": {
       "version": "5.2.1",
       "resolved": "https://registry.npmjs.org/dom-helpers/-/dom-helpers-5.2.1.tgz",
@@ -13202,6 +13419,25 @@
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/happy-dom": {
+      "version": "20.6.1",
+      "resolved": "https://registry.npmjs.org/happy-dom/-/happy-dom-20.6.1.tgz",
+      "integrity": "sha512-+0vhESXXhFwkdjZnJ5DlmJIfUYGgIEEjzIjB+aKJbFuqlvvKyOi+XkI1fYbgYR9QCxG5T08koxsQ6HrQfa5gCQ==",
+      "dev": true,
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "@types/node": ">=20.0.0",
+        "@types/whatwg-mimetype": "^3.0.2",
+        "@types/ws": "^8.18.1",
+        "entities": "^6.0.1",
+        "whatwg-mimetype": "^3.0.0",
+        "ws": "^8.18.3"
+      },
+      "engines": {
+        "node": ">=20.0.0"
+      }
+    },
     "node_modules/has-flag": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
@@ -13382,6 +13618,34 @@
         "url": "https://opencollective.com/unified"
       }
     },
+    "node_modules/http-proxy-agent": {
+      "version": "7.0.2",
+      "resolved": "https://registry.npmjs.org/http-proxy-agent/-/http-proxy-agent-7.0.2.tgz",
+      "integrity": "sha512-T1gkAiYYDWYx3V5Bmyu7HcfcvL7mUrTWiM6yOfa3PIphViJ/gFPbvidQ+veqSOHci/PxBcDabeUNCzpOODJZig==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "agent-base": "^7.1.0",
+        "debug": "^4.3.4"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
+    },
+    "node_modules/https-proxy-agent": {
+      "version": "7.0.6",
+      "resolved": "https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz",
+      "integrity": "sha512-vK9P5/iUfdl95AI+JVyUuIcVtd4ofvtrOr3HNtM2yxC9bnMbEdp3x01OhQNnjb8IJYi38VlTE3mBXwcfvywuSw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "agent-base": "^7.1.2",
+        "debug": "4"
+      },
+      "engines": {
+        "node": ">= 14"
+      }
+    },
     "node_modules/ignore-by-default": {
       "version": "1.0.1",
       "resolved": "https://registry.npmjs.org/ignore-by-default/-/ignore-by-default-1.0.1.tgz",
@@ -13389,6 +13653,16 @@
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/indent-string": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/indent-string/-/indent-string-4.0.0.tgz",
+      "integrity": "sha512-EdDDZu4A2OyIK7Lr/2zG+w5jmbuk1DVBnEwREQvBzspBJkCEbRa8GxU1lghYcaGJCnRWibjDXlq779X1/y5xwg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/inherits": {
       "version": "2.0.4",
       "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
@@ -13546,6 +13820,13 @@
         "url": "https://github.com/sponsors/sindresorhus"
       }
     },
+    "node_modules/is-potential-custom-element-name": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/is-potential-custom-element-name/-/is-potential-custom-element-name-1.0.1.tgz",
+      "integrity": "sha512-bCYeRA2rVibKZd+s2625gGnGF/t7DSqDs4dP7CrLA1m7jKWz6pps0LpYLJN8Q64HtmPKJ1hrN3nzPNKFEKOUiQ==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/isexe": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
@@ -13619,6 +13900,304 @@
         "js-yaml": "bin/js-yaml.js"
       }
     },
+    "node_modules/jsdom": {
+      "version": "28.0.0",
+      "resolved": "https://registry.npmjs.org/jsdom/-/jsdom-28.0.0.tgz",
+      "integrity": "sha512-KDYJgZ6T2TKdU8yBfYueq5EPG/EylMsBvCaenWMJb2OXmjgczzwveRCoJ+Hgj1lXPDyasvrgneSn4GBuR1hYyA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@acemir/cssom": "^0.9.31",
+        "@asamuzakjp/dom-selector": "^6.7.6",
+        "@exodus/bytes": "^1.11.0",
+        "cssstyle": "^5.3.7",
+        "data-urls": "^7.0.0",
+        "decimal.js": "^10.6.0",
+        "html-encoding-sniffer": "^6.0.0",
+        "http-proxy-agent": "^7.0.2",
+        "https-proxy-agent": "^7.0.6",
+        "is-potential-custom-element-name": "^1.0.1",
+        "parse5": "^8.0.0",
+        "saxes": "^6.0.0",
+        "symbol-tree": "^3.2.4",
+        "tough-cookie": "^6.0.0",
+        "undici": "^7.20.0",
+        "w3c-xmlserializer": "^5.0.0",
+        "webidl-conversions": "^8.0.1",
+        "whatwg-mimetype": "^5.0.0",
+        "whatwg-url": "^16.0.0",
+        "xml-name-validator": "^5.0.0"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      },
+      "peerDependencies": {
+        "canvas": "^3.0.0"
+      },
+      "peerDependenciesMeta": {
+        "canvas": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/jsdom/node_modules/@asamuzakjp/css-color": {
+      "version": "4.1.2",
+      "resolved": "https://registry.npmjs.org/@asamuzakjp/css-color/-/css-color-4.1.2.tgz",
+      "integrity": "sha512-NfBUvBaYgKIuq6E/RBLY1m0IohzNHAYyaJGuTK79Z23uNwmz2jl1mPsC5ZxCCxylinKhT1Amn5oNTlx1wN8cQg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@csstools/css-calc": "^3.0.0",
+        "@csstools/css-color-parser": "^4.0.1",
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0",
+        "lru-cache": "^11.2.5"
+      }
+    },
+    "node_modules/jsdom/node_modules/@csstools/color-helpers": {
+      "version": "6.0.1",
+      "resolved": "https://registry.npmjs.org/@csstools/color-helpers/-/color-helpers-6.0.1.tgz",
+      "integrity": "sha512-NmXRccUJMk2AWA5A7e5a//3bCIMyOu2hAtdRYrhPPHjDxINuCwX1w6rnIZ4xjLcp0ayv6h8Pc3X0eJUGiAAXHQ==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT-0",
+      "engines": {
+        "node": ">=20.19.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/@csstools/css-calc": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/@csstools/css-calc/-/css-calc-3.1.1.tgz",
+      "integrity": "sha512-HJ26Z/vmsZQqs/o3a6bgKslXGFAungXGbinULZO3eMsOyNJHeBBZfup5FiZInOghgoM4Hwnmw+OgbJCNg1wwUQ==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/@csstools/css-color-parser": {
+      "version": "4.0.1",
+      "resolved": "https://registry.npmjs.org/@csstools/css-color-parser/-/css-color-parser-4.0.1.tgz",
+      "integrity": "sha512-vYwO15eRBEkeF6xjAno/KQ61HacNhfQuuU/eGwH67DplL0zD5ZixUa563phQvUelA07yDczIXdtmYojCphKJcw==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@csstools/color-helpers": "^6.0.1",
+        "@csstools/css-calc": "^3.0.0"
+      },
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-parser-algorithms": "^4.0.0",
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/@csstools/css-parser-algorithms": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/@csstools/css-parser-algorithms/-/css-parser-algorithms-4.0.0.tgz",
+      "integrity": "sha512-+B87qS7fIG3L5h3qwJ/IFbjoVoOe/bpOdh9hAjXbvx0o8ImEmUsGXN0inFOnk2ChCFgqkkGFQ+TpM5rbhkKe4w==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "peer": true,
+      "engines": {
+        "node": ">=20.19.0"
+      },
+      "peerDependencies": {
+        "@csstools/css-tokenizer": "^4.0.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/@csstools/css-tokenizer": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/@csstools/css-tokenizer/-/css-tokenizer-4.0.0.tgz",
+      "integrity": "sha512-QxULHAm7cNu72w97JUNCBFODFaXpbDg+dP8b/oWFAZ2MTRppA3U00Y2L1HqaS4J6yBqxwa/Y3nMBaxVKbB/NsA==",
+      "dev": true,
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/csstools"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/csstools"
+        }
+      ],
+      "license": "MIT",
+      "peer": true,
+      "engines": {
+        "node": ">=20.19.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/cssstyle": {
+      "version": "5.3.7",
+      "resolved": "https://registry.npmjs.org/cssstyle/-/cssstyle-5.3.7.tgz",
+      "integrity": "sha512-7D2EPVltRrsTkhpQmksIu+LxeWAIEk6wRDMJ1qljlv+CKHJM+cJLlfhWIzNA44eAsHXSNe3+vO6DW1yCYx8SuQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@asamuzakjp/css-color": "^4.1.1",
+        "@csstools/css-syntax-patches-for-csstree": "^1.0.21",
+        "css-tree": "^3.1.0",
+        "lru-cache": "^11.2.4"
+      },
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/jsdom/node_modules/data-urls": {
+      "version": "7.0.0",
+      "resolved": "https://registry.npmjs.org/data-urls/-/data-urls-7.0.0.tgz",
+      "integrity": "sha512-23XHcCF+coGYevirZceTVD7NdJOqVn+49IHyxgszm+JIiHLoB2TkmPtsYkNWT1pvRSGkc35L6NHs0yHkN2SumA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "whatwg-mimetype": "^5.0.0",
+        "whatwg-url": "^16.0.0"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/html-encoding-sniffer": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/html-encoding-sniffer/-/html-encoding-sniffer-6.0.0.tgz",
+      "integrity": "sha512-CV9TW3Y3f8/wT0BRFc1/KAVQ3TUHiXmaAb6VW9vtiMFf7SLoMd1PdAc4W3KFOFETBJUb90KatHqlsZMWV+R9Gg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@exodus/bytes": "^1.6.0"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
+    "node_modules/jsdom/node_modules/lru-cache": {
+      "version": "11.2.6",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-11.2.6.tgz",
+      "integrity": "sha512-ESL2CrkS/2wTPfuend7Zhkzo2u0daGJ/A2VucJOgQ/C48S/zB8MMeMHSGKYpXhIjbPxfuezITkaBH1wqv00DDQ==",
+      "dev": true,
+      "license": "BlueOak-1.0.0",
+      "engines": {
+        "node": "20 || >=22"
+      }
+    },
+    "node_modules/jsdom/node_modules/parse5": {
+      "version": "8.0.0",
+      "resolved": "https://registry.npmjs.org/parse5/-/parse5-8.0.0.tgz",
+      "integrity": "sha512-9m4m5GSgXjL4AjumKzq1Fgfp3Z8rsvjRNbnkVwfu2ImRqE5D0LnY2QfDen18FSY9C573YU5XxSapdHZTZ2WolA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "entities": "^6.0.0"
+      },
+      "funding": {
+        "url": "https://github.com/inikulin/parse5?sponsor=1"
+      }
+    },
+    "node_modules/jsdom/node_modules/tough-cookie": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/tough-cookie/-/tough-cookie-6.0.0.tgz",
+      "integrity": "sha512-kXuRi1mtaKMrsLUxz3sQYvVl37B0Ns6MzfrtV5DvJceE9bPyspOqk9xxv7XbZWcfLWbFmm997vl83qUWVJA64w==",
+      "dev": true,
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "tldts": "^7.0.5"
+      },
+      "engines": {
+        "node": ">=16"
+      }
+    },
+    "node_modules/jsdom/node_modules/tr46": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/tr46/-/tr46-6.0.0.tgz",
+      "integrity": "sha512-bLVMLPtstlZ4iMQHpFHTR7GAGj2jxi8Dg0s2h2MafAE4uSWF98FC/3MomU51iQAMf8/qDUbKWf5GxuvvVcXEhw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "punycode": "^2.3.1"
+      },
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/jsdom/node_modules/webidl-conversions": {
+      "version": "8.0.1",
+      "resolved": "https://registry.npmjs.org/webidl-conversions/-/webidl-conversions-8.0.1.tgz",
+      "integrity": "sha512-BMhLD/Sw+GbJC21C/UgyaZX41nPt8bUTg+jWyDeg7e7YN4xOM05YPSIXceACnXVtqyEw/LMClUQMtMZ+PGGpqQ==",
+      "dev": true,
+      "license": "BSD-2-Clause",
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/jsdom/node_modules/whatwg-mimetype": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-5.0.0.tgz",
+      "integrity": "sha512-sXcNcHOC51uPGF0P/D4NVtrkjSU2fNsm9iog4ZvZJsL3rjoDAzXZhkm2MWt1y+PUdggKAYVoMAIYcs78wJ51Cw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/jsdom/node_modules/whatwg-url": {
+      "version": "16.0.0",
+      "resolved": "https://registry.npmjs.org/whatwg-url/-/whatwg-url-16.0.0.tgz",
+      "integrity": "sha512-9CcxtEKsf53UFwkSUZjG+9vydAsFO4lFHBpJUtjBcoJOCJpKnSJNwCw813zrYJHpCJ7sgfbtOe0V5Ku7Pa1XMQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@exodus/bytes": "^1.11.0",
+        "tr46": "^6.0.0",
+        "webidl-conversions": "^8.0.1"
+      },
+      "engines": {
+        "node": "^20.19.0 || ^22.12.0 || >=24.0.0"
+      }
+    },
     "node_modules/jsesc": {
       "version": "3.1.0",
       "resolved": "https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz",
@@ -13979,6 +14558,16 @@
         "node": ">=12"
       }
     },
+    "node_modules/lz-string": {
+      "version": "1.5.0",
+      "resolved": "https://registry.npmjs.org/lz-string/-/lz-string-1.5.0.tgz",
+      "integrity": "sha512-h5bgJWpxJNswbU7qCrV0tIKQCaS3blPDrqKWx+QxzuzL1zGUzij9XCWLrSLsJPu5t+eWA/ycetzYAO5IOMcWAQ==",
+      "dev": true,
+      "license": "MIT",
+      "bin": {
+        "lz-string": "bin/bin.js"
+      }
+    },
     "node_modules/magic-string": {
       "version": "0.30.21",
       "resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz",
@@ -14307,6 +14896,13 @@
         "url": "https://opencollective.com/unified"
       }
     },
+    "node_modules/mdn-data": {
+      "version": "2.12.2",
+      "resolved": "https://registry.npmjs.org/mdn-data/-/mdn-data-2.12.2.tgz",
+      "integrity": "sha512-IEn+pegP1aManZuckezWCO+XZQDplx1366JoVhTpMpBB1sPey/SbveZQUosKiKiGYjg1wH4pMlNgXbCiYgihQA==",
+      "dev": true,
+      "license": "CC0-1.0"
+    },
     "node_modules/media-typer": {
       "version": "0.3.0",
       "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz",
@@ -14902,6 +15498,16 @@
         "node": ">= 0.6"
       }
     },
+    "node_modules/min-indent": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/min-indent/-/min-indent-1.0.1.tgz",
+      "integrity": "sha512-I9jwMn07Sy/IwOj3zVkVik2JTvgpaykDZEigL6Rx6N9LbMywwUSMtxET+7lVoDLLd3O3IXwJwvuuns8UB/HeAg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=4"
+      }
+    },
     "node_modules/minimatch": {
       "version": "3.1.2",
       "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.2.tgz",
@@ -15166,6 +15772,18 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/object-inspect": {
+      "version": "1.13.4",
+      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
+      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/papaparse": {
       "version": "5.5.3",
       "resolved": "https://registry.npmjs.org/papaparse/-/papaparse-5.5.3.tgz",
@@ -15423,6 +16041,28 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/pretty-format": {
+      "version": "27.5.1",
+      "resolved": "https://registry.npmjs.org/pretty-format/-/pretty-format-27.5.1.tgz",
+      "integrity": "sha512-Qb1gy5OrP5+zDf2Bvnzdl3jsTf1qXVMazbvCoKhtKqVs4/YK4ozX4gKQJJVyNe+cajNPn0KoC0MC3FUmaHWEmQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "ansi-regex": "^5.0.1",
+        "ansi-styles": "^5.0.0",
+        "react-is": "^17.0.1"
+      },
+      "engines": {
+        "node": "^10.13.0 || ^12.13.0 || ^14.15.0 || >=15.0.0"
+      }
+    },
+    "node_modules/pretty-format/node_modules/react-is": {
+      "version": "17.0.2",
+      "resolved": "https://registry.npmjs.org/react-is/-/react-is-17.0.2.tgz",
+      "integrity": "sha512-w2GsyukL62IJnlaff/nRegPQR94C/XXamvMWmSHRJ4y7Ts/4ocGRmTHvOs8PSE6pB3dWOrD/nueuU5sduBsQ4w==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/prismjs": {
       "version": "1.30.0",
       "resolved": "https://registry.npmjs.org/prismjs/-/prismjs-1.30.0.tgz",
@@ -15466,6 +16106,31 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/punycode": {
+      "version": "2.3.1",
+      "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
+      "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=6"
+      }
+    },
+    "node_modules/qs": {
+      "version": "6.14.2",
+      "resolved": "https://registry.npmjs.org/qs/-/qs-6.14.2.tgz",
+      "integrity": "sha512-V/yCWTTF7VJ9hIh18Ugr2zhJMP01MY7c5kh4J870L7imm6/DIzBsNLTXzMwUA3yZ5b/KBqLx8Kp3uRvd7xSe3Q==",
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "side-channel": "^1.1.0"
+      },
+      "engines": {
+        "node": ">=0.6"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/react": {
       "version": "18.3.1",
       "resolved": "https://registry.npmjs.org/react/-/react-18.3.1.tgz",
@@ -15757,6 +16422,20 @@
         "decimal.js-light": "^2.4.1"
       }
     },
+    "node_modules/redent": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/redent/-/redent-3.0.0.tgz",
+      "integrity": "sha512-6tDA8g98We0zd0GvVeMT9arEOnTw9qM03L9cJXaCjrip1OO764RDBLBfrB4cwzNGDj5OA5ioymC9GkizgWJDUg==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "indent-string": "^4.0.0",
+        "strip-indent": "^3.0.0"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/redis-errors": {
       "version": "1.2.0",
       "resolved": "https://registry.npmjs.org/redis-errors/-/redis-errors-1.2.0.tgz",
@@ -15860,6 +16539,16 @@
         "url": "https://opencollective.com/unified"
       }
     },
+    "node_modules/require-from-string": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz",
+      "integrity": "sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/rg": {
       "version": "0.0.2",
       "resolved": "https://registry.npmjs.org/rg/-/rg-0.0.2.tgz",
@@ -15940,6 +16629,19 @@
       "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
       "license": "MIT"
     },
+    "node_modules/saxes": {
+      "version": "6.0.0",
+      "resolved": "https://registry.npmjs.org/saxes/-/saxes-6.0.0.tgz",
+      "integrity": "sha512-xAg7SOnEhrm5zI3puOOKyy1OMcMlIJZYNJY7xLBwSze0UjhPLnWfj2GF2EpT0jmzaJKIWKHLsaSSajf35bcYnA==",
+      "dev": true,
+      "license": "ISC",
+      "dependencies": {
+        "xmlchars": "^2.2.0"
+      },
+      "engines": {
+        "node": ">=v12.22.7"
+      }
+    },
     "node_modules/scheduler": {
       "version": "0.23.2",
       "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.23.2.tgz",
@@ -15980,6 +16682,78 @@
         "node": ">=8"
       }
     },
+    "node_modules/side-channel": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.0.tgz",
+      "integrity": "sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0",
+        "object-inspect": "^1.13.3",
+        "side-channel-list": "^1.0.0",
+        "side-channel-map": "^1.0.1",
+        "side-channel-weakmap": "^1.0.2"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-list": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.0.tgz",
+      "integrity": "sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0",
+        "object-inspect": "^1.13.3"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-map": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
+      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bound": "^1.0.2",
+        "es-errors": "^1.3.0",
+        "get-intrinsic": "^1.2.5",
+        "object-inspect": "^1.13.3"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-weakmap": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
+      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bound": "^1.0.2",
+        "es-errors": "^1.3.0",
+        "get-intrinsic": "^1.2.5",
+        "object-inspect": "^1.13.3",
+        "side-channel-map": "^1.0.1"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/siginfo": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
@@ -16114,6 +16888,39 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/strip-indent": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/strip-indent/-/strip-indent-3.0.0.tgz",
+      "integrity": "sha512-laJTa3Jb+VQpaC6DseHhF7dXVqHTfJPCRDaEbid/drOhgitgYku/letMUqOXFoWV0zIIUbjpdH2t+tYj4bQMRQ==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "min-indent": "^1.0.0"
+      },
+      "engines": {
+        "node": ">=8"
+      }
+    },
+    "node_modules/stripe": {
+      "version": "18.5.0",
+      "resolved": "https://registry.npmjs.org/stripe/-/stripe-18.5.0.tgz",
+      "integrity": "sha512-Hp+wFiEQtCB0LlNgcFh5uVyKznpDjzyUZ+CNVEf+I3fhlYvh7rZruIg+jOwzJRCpy0ZTPMjlzm7J2/M2N6d+DA==",
+      "license": "MIT",
+      "dependencies": {
+        "qs": "^6.11.0"
+      },
+      "engines": {
+        "node": ">=12.*"
+      },
+      "peerDependencies": {
+        "@types/node": ">=12.x.x"
+      },
+      "peerDependenciesMeta": {
+        "@types/node": {
+          "optional": true
+        }
+      }
+    },
     "node_modules/style-to-js": {
       "version": "1.1.21",
       "resolved": "https://registry.npmjs.org/style-to-js/-/style-to-js-1.1.21.tgz",
@@ -16145,6 +16952,13 @@
         "node": ">=8"
       }
     },
+    "node_modules/symbol-tree": {
+      "version": "3.2.4",
+      "resolved": "https://registry.npmjs.org/symbol-tree/-/symbol-tree-3.2.4.tgz",
+      "integrity": "sha512-9QNk5KwDF+Bvz+PyObkmSYjI5ksVUYtjW7AU22r2NKcfLJcXp96hkDWU3+XndOsUb+AQ9QhfzfCT2O+CNWT5Tw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/tailwind-merge": {
       "version": "3.4.0",
       "resolved": "https://registry.npmjs.org/tailwind-merge/-/tailwind-merge-3.4.0.tgz",
@@ -16215,6 +17029,26 @@
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/tldts": {
+      "version": "7.0.23",
+      "resolved": "https://registry.npmjs.org/tldts/-/tldts-7.0.23.tgz",
+      "integrity": "sha512-ASdhgQIBSay0R/eXggAkQ53G4nTJqTXqC2kbaBbdDwM7SkjyZyO0OaaN1/FH7U/yCeqOHDwFO5j8+Os/IS1dXw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "tldts-core": "^7.0.23"
+      },
+      "bin": {
+        "tldts": "bin/cli.js"
+      }
+    },
+    "node_modules/tldts-core": {
+      "version": "7.0.23",
+      "resolved": "https://registry.npmjs.org/tldts-core/-/tldts-core-7.0.23.tgz",
+      "integrity": "sha512-0g9vrtDQLrNIiCj22HSe9d4mLVG3g5ph5DZ8zCKBr4OtrspmNB6ss7hVyzArAeE88ceZocIEGkyW1Ime7fxPtQ==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/to-regex-range": {
       "version": "5.0.1",
       "resolved": "https://registry.npmjs.org/to-regex-range/-/to-regex-range-5.0.1.tgz",
@@ -16416,6 +17250,16 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/undici": {
+      "version": "7.21.0",
+      "resolved": "https://registry.npmjs.org/undici/-/undici-7.21.0.tgz",
+      "integrity": "sha512-Hn2tCQpoDt1wv23a68Ctc8Cr/BHpUSfaPYrkajTXOS9IKpxVRx/X5m1K2YkbK2ipgZgxXSgsUinl3x+2YdSSfg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=20.18.1"
+      }
+    },
     "node_modules/undici-types": {
       "version": "7.16.0",
       "resolved": "https://registry.npmjs.org/undici-types/-/undici-types-7.16.0.tgz",
@@ -16765,6 +17609,29 @@
         }
       }
     },
+    "node_modules/w3c-xmlserializer": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/w3c-xmlserializer/-/w3c-xmlserializer-5.0.0.tgz",
+      "integrity": "sha512-o8qghlI8NZHU1lLPrpi2+Uq7abh4GGPpYANlalzWxyWteJOCsr/P+oPBA49TOLu5FTZO4d3F9MnWJfiMo4BkmA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "xml-name-validator": "^5.0.0"
+      },
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/whatwg-mimetype": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/whatwg-mimetype/-/whatwg-mimetype-3.0.0.tgz",
+      "integrity": "sha512-nt+N2dzIutVRxARx1nghPKGv1xHikU7HKdfafKkLNLindmPU/ch3U31NOCGGA/dmPcmb1VlofO0vnKAcsm0o/Q==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=12"
+      }
+    },
     "node_modules/which": {
       "version": "2.0.2",
       "resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
@@ -16815,6 +17682,28 @@
         "node": ">=0.8"
       }
     },
+    "node_modules/ws": {
+      "version": "8.19.0",
+      "resolved": "https://registry.npmjs.org/ws/-/ws-8.19.0.tgz",
+      "integrity": "sha512-blAT2mjOEIi0ZzruJfIhb3nps74PRWTCz1IjglWEEpQl5XS/UNama6u2/rjFkDDouqr4L67ry+1aGIALViWjDg==",
+      "dev": true,
+      "license": "MIT",
+      "engines": {
+        "node": ">=10.0.0"
+      },
+      "peerDependencies": {
+        "bufferutil": "^4.0.1",
+        "utf-8-validate": ">=5.0.2"
+      },
+      "peerDependenciesMeta": {
+        "bufferutil": {
+          "optional": true
+        },
+        "utf-8-validate": {
+          "optional": true
+        }
+      }
+    },
     "node_modules/xlsx": {
       "version": "0.18.5",
       "resolved": "https://registry.npmjs.org/xlsx/-/xlsx-0.18.5.tgz",
@@ -16836,6 +17725,23 @@
         "node": ">=0.8"
       }
     },
+    "node_modules/xml-name-validator": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/xml-name-validator/-/xml-name-validator-5.0.0.tgz",
+      "integrity": "sha512-EvGK8EJ3DhaHfbRlETOWAS5pO9MZITeauHKJyb8wyajUfQUenkIg2MvLDTZ4T/TgIcm3HU0TFBgWWboAZ30UHg==",
+      "dev": true,
+      "license": "Apache-2.0",
+      "engines": {
+        "node": ">=18"
+      }
+    },
+    "node_modules/xmlchars": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/xmlchars/-/xmlchars-2.2.0.tgz",
+      "integrity": "sha512-JZnDKK8B0RCDw84FNdDAIpZK+JuJw+s7Lz8nksI7SIuU3UXJJslUthsi+uWBUYOwPFwW7W7PRLRfUKpxjtjFCw==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/xtend": {
       "version": "4.0.2",
       "resolved": "https://registry.npmjs.org/xtend/-/xtend-4.0.2.tgz",
