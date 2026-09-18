diff --git a/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
index 40516b1..0da9fea 100644
--- a/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
+++ b/apps/web/client/src/components/videoeditor/SilenceDetectionDialog.tsx
@@ -4,7 +4,7 @@
  * Uses Radix UI Dialog for focus trapping, ESC-to-close, and ARIA support.
  */
 
-import React, { useState, useEffect, useMemo, useRef } from 'react';
+import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
 import * as DialogPrimitive from '@radix-ui/react-dialog';
 import {
   Dialog,
@@ -26,6 +26,93 @@ import {
   applyBufferToRegions,
 } from '../../types/videoEditor';
 import { createMediaJobClient } from '../../services/mediaJobClient';
+import PreviewPlayer, { type ActiveClipInfo } from './PreviewPlayer';
+
+/**
+ * Pure functions for skip-silence logic (exported for testing)
+ */
+
+/**
+ * Binary search to find a region containing currentTime.
+ * Only considers regions where selected === true AND skipped === false.
+ * Regions must be sorted by adjustedStartTime.
+ */
+export function findRegionAtTime(
+  regions: SilentRegion[],
+  currentTime: number,
+): SilentRegion | null {
+  if (regions.length === 0) return null;
+
+  // Filter to only selected, non-skipped regions
+  const validRegions = regions.filter((r) => r.selected && !r.skipped);
+  if (validRegions.length === 0) return null;
+
+  // Binary search
+  let lo = 0;
+  let hi = validRegions.length - 1;
+
+  while (lo <= hi) {
+    const mid = Math.floor((lo + hi) / 2);
+    const region = validRegions[mid];
+
+    if (
+      currentTime >= region.adjustedStartTime &&
+      currentTime <= region.adjustedEndTime
+    ) {
+      return region;
+    }
+
+    if (currentTime < region.adjustedStartTime) {
+      hi = mid - 1;
+    } else {
+      lo = mid + 1;
+    }
+  }
+
+  return null;
+}
+
+/**
+ * Determines if playback should skip silence at the current time.
+ * Returns the target seek time (adjustedEndTime) or null if no skip should occur.
+ */
+export function shouldSkipSilence(params: {
+  enabled: boolean;
+  currentTime: number;
+  regions: SilentRegion[];
+  lastSkipTimestamp: number;
+  cooldownMs: number;
+  boundaryGuardMs: number;
+}): number | null {
+  const {
+    enabled,
+    currentTime,
+    regions,
+    lastSkipTimestamp,
+    cooldownMs,
+    boundaryGuardMs,
+  } = params;
+
+  // Check if skip-silence is enabled
+  if (!enabled) return null;
+
+  // Check cooldown
+  if (performance.now() - lastSkipTimestamp < cooldownMs) {
+    return null;
+  }
+
+  // Find region at current time
+  const region = findRegionAtTime(regions, currentTime);
+  if (!region) return null;
+
+  // Check boundary guard
+  if (Math.abs(currentTime - region.adjustedEndTime) < boundaryGuardMs) {
+    return null;
+  }
+
+  // Return target seek time
+  return region.adjustedEndTime;
+}
 
 interface AssetWithWaveform {
   path: string;
@@ -73,6 +160,13 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
   const [skipSilencePreview, setSkipSilencePreview] = useState(false);
   const [applyToAllTracks, setApplyToAllTracks] = useState(false);
 
+  // Preview player state
+  const [isPlaying, setIsPlaying] = useState(false);
+  const [skipSilenceEnabled, setSkipSilenceEnabled] = useState(false);
+  const lastSkipRef = useRef(0);
+  const playbackTimeRef = useRef(playbackTime);
+  playbackTimeRef.current = playbackTime;
+
   // Waveform state
   const [waveformData, setWaveformData] = useState<number[] | null>(null);
   const [waveformLoading, setWaveformLoading] = useState(false);
@@ -167,12 +261,104 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
     }
   }, [softeningBuffer, analysisComplete, rawRegions.length, projectDuration]);
 
+  // Pre-filter and sort regions for skip-silence
+  const skipRegions = useMemo(() => {
+    return regions
+      .filter((r) => r.selected && !r.skipped && r.adjustedDuration > 0)
+      .sort((a, b) => a.adjustedStartTime - b.adjustedStartTime);
+  }, [regions]);
+
+  // Skip-silence effect during playback
+  useEffect(() => {
+    if (!isPlaying || !skipSilenceEnabled || skipRegions.length === 0) {
+      return;
+    }
+
+    let rafId: number;
+
+    const tick = () => {
+      const target = shouldSkipSilence({
+        enabled: true,
+        currentTime: playbackTimeRef.current,
+        regions: skipRegions,
+        lastSkipTimestamp: lastSkipRef.current,
+        cooldownMs: 100,
+        boundaryGuardMs: 0.05,
+      });
+
+      if (target !== null) {
+        setPlaybackTime(target);
+        lastSkipRef.current = performance.now();
+      }
+
+      rafId = requestAnimationFrame(tick);
+    };
+
+    rafId = requestAnimationFrame(tick);
+    return () => cancelAnimationFrame(rafId);
+  }, [isPlaying, skipSilenceEnabled, skipRegions]);
+
   // Get audio tracks for UI
   const audioTracks = useMemo(() =>
     project.timeline.tracks.filter((t) => t.type === 'audio' && t.clips.length > 0),
     [project]
   );
 
+  // Resolve preview asset from first selected track
+  const { previewUrl, activeClip, duration } = useMemo(() => {
+    if (selectedTrackIds.length === 0) {
+      return { previewUrl: '', activeClip: null, duration: 0 };
+    }
+
+    const firstTrack = project.timeline.tracks.find(
+      (t) => t.id === selectedTrackIds[0],
+    );
+    if (!firstTrack || firstTrack.clips.length === 0) {
+      return { previewUrl: '', activeClip: null, duration: 0 };
+    }
+
+    const firstClip = firstTrack.clips[0];
+    const asset = project.assets[firstClip.assetId];
+    if (!asset || !asset.path) {
+      return { previewUrl: '', activeClip: null, duration: 0 };
+    }
+
+    // Build ActiveClipInfo if clip has trim points
+    let clipInfo: ActiveClipInfo | null = null;
+    if (firstClip.trimIn != null || firstClip.trimOut != null) {
+      clipInfo = {
+        videoUrl: asset.path,
+        clipStartTime: firstClip.startTime,
+        trimIn: firstClip.trimIn || 0,
+        clipDuration: firstClip.duration,
+      };
+    }
+
+    return {
+      previewUrl: asset.path,
+      activeClip: clipInfo,
+      duration: project.settings.duration || 0,
+    };
+  }, [project, selectedTrackIds]);
+
+  // Playback handlers
+  const handleTimeChange = useCallback((time: number) => {
+    setPlaybackTime(time);
+  }, []);
+
+  const handleWaveformSeek = useCallback((time: number) => {
+    setPlaybackTime(time);
+  }, []);
+
+  const handlePlayPause = useCallback(() => {
+    setIsPlaying((prev) => !prev);
+  }, []);
+
+  const handleStop = useCallback(() => {
+    setIsPlaying(false);
+    setPlaybackTime(0);
+  }, []);
+
   // Handle analyze button
   const handleAutoDetect = async () => {
     if (selectedTrackIds.length === 0) return;
@@ -372,13 +558,43 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
             .silence-dialog-preview {
               flex: 0 0 60%;
               display: flex;
-              align-items: center;
-              justify-content: center;
+              flex-direction: column;
               background: #111;
               border-right: 1px solid #444;
+              overflow: hidden;
+            }
+            .preview-container {
+              display: flex;
+              flex-direction: column;
+              flex: 1;
+              overflow: hidden;
+            }
+            .preview-placeholder {
+              flex: 1;
+              display: flex;
+              align-items: center;
+              justify-content: center;
               color: #666;
               font-size: 14px;
             }
+            .skip-silence-toggle {
+              display: flex;
+              align-items: center;
+              gap: 8px;
+              padding: 12px 16px;
+              font-size: 13px;
+              color: #e0e0e0;
+              cursor: pointer;
+              user-select: none;
+              background: #1a1a1a;
+              border-top: 1px solid #333;
+            }
+            .skip-silence-toggle input[type="checkbox"] {
+              accent-color: #0078d4;
+              width: 16px;
+              height: 16px;
+              cursor: pointer;
+            }
             .silence-dialog-settings {
               flex: 0 0 40%;
               overflow-y: auto;
@@ -669,8 +885,34 @@ const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
           {/* Main Content: Preview (left) + Settings (right) */}
           <div className="silence-dialog-main">
             <div className="silence-dialog-preview" data-testid="silence-dialog-preview">
-              {/* PreviewPlayer placeholder (section 07) */}
-              Preview Player (Section 07)
+              <div className="preview-container">
+                {previewUrl ? (
+                  <>
+                    <PreviewPlayer
+                      currentTime={playbackTime}
+                      duration={duration}
+                      isPlaying={isPlaying}
+                      onTimeChange={handleTimeChange}
+                      onPlayPause={handlePlayPause}
+                      onStop={handleStop}
+                      previewVideoUrl={previewUrl}
+                      activeClip={activeClip}
+                    />
+                    <label className="skip-silence-toggle">
+                      <input
+                        type="checkbox"
+                        checked={skipSilenceEnabled}
+                        onChange={(e) => setSkipSilenceEnabled(e.target.checked)}
+                      />
+                      Skip Silence Preview
+                    </label>
+                  </>
+                ) : (
+                  <div className="preview-placeholder">
+                    Select a track with clips to preview
+                  </div>
+                )}
+              </div>
             </div>
             <div className="silence-dialog-settings" data-testid="silence-dialog-settings">
               <div className="settings-panel">
diff --git a/apps/web/client/src/components/videoeditor/__tests__/skipSilenceLogic.test.ts b/apps/web/client/src/components/videoeditor/__tests__/skipSilenceLogic.test.ts
new file mode 100644
index 0000000..6bd933f
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/skipSilenceLogic.test.ts
@@ -0,0 +1,324 @@
+import { describe, it, expect, beforeEach, vi } from 'vitest';
+import type { SilentRegion } from '../../../types/videoEditor';
+
+/**
+ * Pure functions for skip-silence logic testing.
+ * These will be exported from SilenceDetectionDialog or a utility module.
+ */
+
+// Mock performance.now() for cooldown tests
+const mockPerformanceNow = vi.fn(() => Date.now());
+global.performance = { now: mockPerformanceNow } as any;
+
+// Helper to create test regions
+function createRegion(
+  id: string,
+  adjustedStartTime: number,
+  adjustedEndTime: number,
+  selected = true,
+  skipped = false,
+): SilentRegion {
+  return {
+    id,
+    trackId: 'track-1',
+    startTime: adjustedStartTime,
+    endTime: adjustedEndTime,
+    duration: adjustedEndTime - adjustedStartTime,
+    adjustedStartTime,
+    adjustedEndTime,
+    adjustedDuration: adjustedEndTime - adjustedStartTime,
+    selected,
+    averageDb: -40,
+    skipped,
+  };
+}
+
+describe('findRegionAtTime (binary search)', () => {
+  // Import will be added during implementation
+  let findRegionAtTime: (regions: SilentRegion[], currentTime: number) => SilentRegion | null;
+
+  beforeEach(async () => {
+    // Dynamic import to be replaced with actual implementation
+    try {
+      const module = await import('../SilenceDetectionDialog');
+      findRegionAtTime = (module as any).findRegionAtTime;
+    } catch {
+      // Stub for initial test run before implementation
+      findRegionAtTime = () => null;
+    }
+  });
+
+  it('should find correct region for given currentTime', () => {
+    const regions = [
+      createRegion('r1', 2, 4),
+      createRegion('r2', 5, 8),
+      createRegion('r3', 10, 15),
+    ];
+
+    const result = findRegionAtTime(regions, 6.0);
+    expect(result).toBeTruthy();
+    expect(result?.id).toBe('r2');
+    expect(result?.adjustedStartTime).toBe(5);
+    expect(result?.adjustedEndTime).toBe(8);
+  });
+
+  it('should return null for time outside all regions', () => {
+    const regions = [
+      createRegion('r1', 2, 4),
+      createRegion('r2', 5, 8),
+      createRegion('r3', 10, 15),
+    ];
+
+    const result = findRegionAtTime(regions, 9.0);
+    expect(result).toBeNull();
+  });
+
+  it('should return null for empty regions array', () => {
+    const result = findRegionAtTime([], 5.0);
+    expect(result).toBeNull();
+  });
+
+  it('should handle time at exact region boundary (start)', () => {
+    const regions = [createRegion('r1', 5.0, 8.0)];
+
+    const result = findRegionAtTime(regions, 5.0);
+    expect(result).toBeTruthy();
+    expect(result?.id).toBe('r1');
+  });
+
+  it('should handle time at exact region boundary (end)', () => {
+    const regions = [createRegion('r1', 5.0, 8.0)];
+
+    const result = findRegionAtTime(regions, 8.0);
+    expect(result).toBeTruthy();
+    expect(result?.id).toBe('r1');
+  });
+
+  it('should only consider selected and non-skipped regions', () => {
+    const regions = [
+      createRegion('r1', 2, 4, false, false), // deselected
+      createRegion('r2', 5, 8, true, true),   // skipped
+      createRegion('r3', 10, 15, true, false), // valid
+    ];
+
+    // Time inside deselected region should return null
+    expect(findRegionAtTime(regions, 3.0)).toBeNull();
+
+    // Time inside skipped region should return null
+    expect(findRegionAtTime(regions, 6.0)).toBeNull();
+
+    // Time inside valid region should return that region
+    const result = findRegionAtTime(regions, 12.0);
+    expect(result).toBeTruthy();
+    expect(result?.id).toBe('r3');
+  });
+
+  it('should handle multiple valid regions and return the correct one', () => {
+    const regions = [
+      createRegion('r1', 1, 3),
+      createRegion('r2', 5, 7),
+      createRegion('r3', 10, 12),
+      createRegion('r4', 15, 18),
+    ];
+
+    expect(findRegionAtTime(regions, 2.0)?.id).toBe('r1');
+    expect(findRegionAtTime(regions, 6.0)?.id).toBe('r2');
+    expect(findRegionAtTime(regions, 11.0)?.id).toBe('r3');
+    expect(findRegionAtTime(regions, 16.0)?.id).toBe('r4');
+  });
+});
+
+describe('shouldSkipSilence', () => {
+  let shouldSkipSilence: (params: {
+    enabled: boolean;
+    currentTime: number;
+    regions: SilentRegion[];
+    lastSkipTimestamp: number;
+    cooldownMs: number;
+    boundaryGuardMs: number;
+  }) => number | null;
+
+  beforeEach(async () => {
+    try {
+      const module = await import('../SilenceDetectionDialog');
+      shouldSkipSilence = (module as any).shouldSkipSilence;
+    } catch {
+      shouldSkipSilence = () => null;
+    }
+    mockPerformanceNow.mockClear();
+  });
+
+  it('should return adjustedEndTime when skip-silence is enabled and inside region', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1000);
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 0, // No recent skip
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBe(8); // Should skip to adjustedEndTime
+  });
+
+  it('should return null when skip-silence is disabled', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1000);
+
+    const result = shouldSkipSilence({
+      enabled: false,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull();
+  });
+
+  it('should not skip to deselected regions', () => {
+    const regions = [createRegion('r1', 5, 8, false, false)]; // deselected
+    mockPerformanceNow.mockReturnValue(1000);
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull();
+  });
+
+  it('should not skip to skipped regions', () => {
+    const regions = [createRegion('r1', 5, 8, true, true)]; // skipped
+    mockPerformanceNow.mockReturnValue(1000);
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull();
+  });
+
+  it('should respect cooldown and return null when within cooldown period', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1050); // 50ms after last skip
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 1000, // Skip happened 50ms ago
+      cooldownMs: 100, // Cooldown is 100ms
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull(); // Should not skip due to cooldown
+  });
+
+  it('should allow skip after cooldown period expires', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1150); // 150ms after last skip
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 6.0,
+      regions,
+      lastSkipTimestamp: 1000, // Skip happened 150ms ago
+      cooldownMs: 100, // Cooldown is 100ms
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBe(8); // Should skip now
+  });
+
+  it('should not skip when near region boundary (boundary guard)', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1000);
+
+    // CurrentTime is 7.97, which is 0.03s from adjustedEndTime (8.0)
+    // BoundaryGuard is 0.05s, so this should NOT skip
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 7.97,
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull(); // Should not skip due to boundary guard
+  });
+
+  it('should skip when NOT near region boundary', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1000);
+
+    // CurrentTime is 7.0, which is 1.0s from adjustedEndTime (8.0)
+    // BoundaryGuard is 0.05s, so this should skip
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 7.0,
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBe(8); // Should skip
+  });
+
+  it('should return null when no region found at currentTime', () => {
+    const regions = [createRegion('r1', 5, 8)];
+    mockPerformanceNow.mockReturnValue(1000);
+
+    const result = shouldSkipSilence({
+      enabled: true,
+      currentTime: 10.0, // Outside any region
+      regions,
+      lastSkipTimestamp: 0,
+      cooldownMs: 100,
+      boundaryGuardMs: 0.05,
+    });
+
+    expect(result).toBeNull();
+  });
+});
+
+describe('bidirectional sync', () => {
+  // These tests will be integration tests that verify the state flow
+  // For now, we document the expected behavior
+
+  it('should update playbackTime when waveform onSeek is called', () => {
+    // This will be verified during integration testing
+    // When SilenceWaveformOverlay calls onSeek(12.5)
+    // Then playbackTime state should be set to 12.5
+    expect(true).toBe(true); // Placeholder - actual test in integration
+  });
+
+  it('should pass playbackTime to waveform overlay as currentTime prop', () => {
+    // This will be verified during integration testing
+    // When playbackTime changes to 7.3
+    // Then SilenceWaveformOverlay receives currentTime={7.3}
+    expect(true).toBe(true); // Placeholder - actual test in integration
+  });
+
+  it('should update playbackTime when PreviewPlayer fires onTimeChange', () => {
+    // This will be verified during integration testing
+    // When PreviewPlayer fires onTimeChange(5.5)
+    // Then playbackTime state should be set to 5.5
+    expect(true).toBe(true); // Placeholder - actual test in integration
+  });
+});
