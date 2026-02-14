diff --git a/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx b/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
index 6879e39..75a17dd 100644
--- a/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
+++ b/apps/web/client/src/components/videoeditor/SilenceDetectionPanel.tsx
@@ -105,15 +105,24 @@ const SilenceDetectionPanel: React.FC<SilenceDetectionPanelProps> = ({
       const silenceSegments = derived.silenceSegments || [];
       const keepSegments = derived.keepSegments || [];
 
-      const regions: SilentRegion[] = silenceSegments.map((seg: any, i: number) => ({
-        id: generateId(),
-        startTime: (seg.startMs || 0) / 1000,
-        endTime: (seg.endMs || 0) / 1000,
-        duration: ((seg.endMs || 0) - (seg.startMs || 0)) / 1000,
-        averageDb: seg.averageDb || threshold,
-        trackId: selectedTracks[0].id,
-        selected: true,
-      }));
+      const regions: SilentRegion[] = silenceSegments.map((seg: any, i: number) => {
+        const startTime = (seg.startMs || 0) / 1000;
+        const endTime = (seg.endMs || 0) / 1000;
+        const duration = endTime - startTime;
+        return {
+          id: generateId(),
+          startTime,
+          endTime,
+          duration,
+          adjustedStartTime: startTime,
+          adjustedEndTime: endTime,
+          adjustedDuration: duration,
+          averageDb: seg.averageDb || threshold,
+          trackId: selectedTracks[0].id,
+          selected: true,
+          skipped: false,
+        };
+      });
 
       const totalSilenceDuration = regions.reduce((sum: number, r: SilentRegion) => sum + r.duration, 0);
       const projectDuration = project.settings.duration || 0;
diff --git a/apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts b/apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts
new file mode 100644
index 0000000..f60a626
--- /dev/null
+++ b/apps/web/client/src/types/__tests__/silenceDetectionUtils.test.ts
@@ -0,0 +1,136 @@
+/**
+ * Tests for silence detection utility functions:
+ * - applyBufferToRegions()
+ * - dbToPercent()
+ */
+import { describe, it, expect } from "vitest";
+import {
+  applyBufferToRegions,
+  dbToPercent,
+  type SilentRegion,
+} from "../videoEditor";
+
+function makeRegion(overrides: Partial<SilentRegion> = {}): SilentRegion {
+  return {
+    id: "r1",
+    trackId: "track-a1",
+    startTime: 2.0,
+    endTime: 8.0,
+    duration: 6.0,
+    adjustedStartTime: 2.0,
+    adjustedEndTime: 8.0,
+    adjustedDuration: 6.0,
+    selected: true,
+    averageDb: -45,
+    skipped: false,
+    ...overrides,
+  };
+}
+
+describe("applyBufferToRegions", () => {
+  it("returns adjusted times when buffer is applied (start + buffer, end - buffer)", () => {
+    const regions = [makeRegion()];
+    const result = applyBufferToRegions(regions, 0.5);
+
+    expect(result[0].adjustedStartTime).toBe(2.5);
+    expect(result[0].adjustedEndTime).toBe(7.5);
+    expect(result[0].adjustedDuration).toBe(5.0);
+    expect(result[0].skipped).toBe(false);
+  });
+
+  it("marks region as skipped when buffer makes adjustedEnd <= adjustedStart", () => {
+    const regions = [
+      makeRegion({ startTime: 5.0, endTime: 5.4, duration: 0.4 }),
+    ];
+    const result = applyBufferToRegions(regions, 0.3);
+
+    expect(result[0].skipped).toBe(true);
+  });
+
+  it("sets adjustedDuration to 0 for skipped regions", () => {
+    const regions = [
+      makeRegion({ startTime: 5.0, endTime: 5.4, duration: 0.4 }),
+    ];
+    const result = applyBufferToRegions(regions, 0.3);
+
+    expect(result[0].adjustedDuration).toBe(0);
+  });
+
+  it("handles buffer of 0 (no change to original times)", () => {
+    const regions = [
+      makeRegion({ startTime: 3.0, endTime: 7.0, duration: 4.0 }),
+    ];
+    const result = applyBufferToRegions(regions, 0);
+
+    expect(result[0].adjustedStartTime).toBe(3.0);
+    expect(result[0].adjustedEndTime).toBe(7.0);
+    expect(result[0].adjustedDuration).toBe(4.0);
+    expect(result[0].skipped).toBe(false);
+  });
+
+  it("handles buffer larger than half the region duration - region is skipped", () => {
+    const regions = [
+      makeRegion({ startTime: 10.0, endTime: 12.0, duration: 2.0 }),
+    ];
+    const result = applyBufferToRegions(regions, 1.5);
+
+    expect(result[0].skipped).toBe(true);
+    expect(result[0].adjustedDuration).toBe(0);
+  });
+
+  it("processes multiple regions independently", () => {
+    const regions = [
+      makeRegion({
+        id: "r1",
+        startTime: 2.0,
+        endTime: 8.0,
+        duration: 6.0,
+      }),
+      makeRegion({
+        id: "r2",
+        startTime: 10.0,
+        endTime: 10.4,
+        duration: 0.4,
+      }),
+    ];
+    const result = applyBufferToRegions(regions, 0.5);
+
+    expect(result[0].skipped).toBe(false);
+    expect(result[0].adjustedDuration).toBe(5.0);
+    expect(result[1].skipped).toBe(true);
+    expect(result[1].adjustedDuration).toBe(0);
+  });
+
+  it("preserves original startTime/endTime/duration fields", () => {
+    const regions = [makeRegion()];
+    const result = applyBufferToRegions(regions, 0.5);
+
+    expect(result[0].startTime).toBe(2.0);
+    expect(result[0].endTime).toBe(8.0);
+    expect(result[0].duration).toBe(6.0);
+  });
+
+  it("handles empty regions array - returns empty array", () => {
+    const result = applyBufferToRegions([], 0.5);
+    expect(result).toEqual([]);
+  });
+});
+
+describe("dbToPercent", () => {
+  it("-60dB maps to 0%", () => {
+    expect(dbToPercent(-60)).toBe(0);
+  });
+
+  it("-20dB maps to 100%", () => {
+    expect(dbToPercent(-20)).toBe(100);
+  });
+
+  it("-40dB maps to 50%", () => {
+    expect(dbToPercent(-40)).toBe(50);
+  });
+
+  it("values outside range still compute (no clamping)", () => {
+    expect(dbToPercent(-70)).toBeLessThan(0);
+    expect(dbToPercent(-10)).toBeGreaterThan(100);
+  });
+});
diff --git a/apps/web/client/src/types/videoEditor.ts b/apps/web/client/src/types/videoEditor.ts
index 0e977cc..acb22dc 100644
--- a/apps/web/client/src/types/videoEditor.ts
+++ b/apps/web/client/src/types/videoEditor.ts
@@ -211,13 +211,18 @@ export interface SilentRegion {
   startTime: number;         // Start time in seconds
   endTime: number;           // End time in seconds
   duration: number;          // Duration in seconds
+  adjustedStartTime: number; // start + softeningBuffer
+  adjustedEndTime: number;   // end - softeningBuffer
+  adjustedDuration: number;  // may be 0 if skipped
   selected: boolean;         // User can toggle selection to remove
   averageDb: number;         // Average dB level in this region
+  skipped: boolean;          // true if too short after buffer
 }
 
 export interface SilenceDetectionConfig {
   threshold: number;         // dB threshold for silence (e.g., -40)
   minDuration: number;       // Minimum silence duration to detect (seconds, e.g., 0.5)
+  softeningBuffer: number;   // Buffer in seconds to add/subtract at region edges (default 0.2)
   enabled: boolean;          // Whether silence detection is active
   trackIds: string[];        // Which tracks to analyze
 }
@@ -229,6 +234,34 @@ export interface SilenceDetectionResult {
   analysisComplete: boolean;
 }
 
+export type AnalysisStage =
+  | 'idle'
+  | 'preparing'
+  | 'scanning'
+  | 'detecting'
+  | 'applying_buffer'
+  | 'done'
+  | 'error';
+
+/**
+ * Reference interface for the Silence Detection Dialog's local state.
+ * NOT used as a single useState<SilenceDetectionDialogState>() -- each
+ * field is managed by its own useState hook. This exists as a type
+ * contract / documentation for what state the dialog manages.
+ */
+export interface SilenceDetectionDialogState {
+  isOpen: boolean;
+  config: SilenceDetectionConfig;
+  regions: SilentRegion[];
+  analysisComplete: boolean;
+  isAnalyzing: boolean;
+  analysisStage: AnalysisStage;
+  playbackTime: number;
+  timelineZoom: number;
+  skipSilencePreview: boolean;
+  applyToAllTracks: boolean;
+}
+
 // ========================================
 // UI State
 // ========================================
@@ -506,6 +539,39 @@ export function validateProject(project: VideoEditorProject): { valid: boolean;
   };
 }
 
+/**
+ * Apply a softening buffer to silence regions.
+ * For each region: adjustedStart = start + buffer, adjustedEnd = end - buffer.
+ * If the buffer makes the region too short (adjustedEnd <= adjustedStart),
+ * the region is marked as skipped with adjustedDuration = 0.
+ */
+export function applyBufferToRegions(
+  regions: SilentRegion[],
+  bufferSeconds: number
+): SilentRegion[] {
+  return regions.map((region) => {
+    const adjustedStartTime = region.startTime + bufferSeconds;
+    const adjustedEndTime = region.endTime - bufferSeconds;
+    const skipped = adjustedEndTime <= adjustedStartTime;
+    return {
+      ...region,
+      adjustedStartTime,
+      adjustedEndTime,
+      adjustedDuration: skipped ? 0 : adjustedEndTime - adjustedStartTime,
+      skipped,
+    };
+  });
+}
+
+/**
+ * Convert a dB value to a percentage for display purposes.
+ * Maps the range [-60dB, -20dB] to [0%, 100%].
+ * Values outside this range are NOT clamped.
+ */
+export function dbToPercent(db: number): number {
+  return ((db + 60) / 40) * 100;
+}
+
 // ========================================
 // V2 Migration (Seconds -> Milliseconds)
 // ========================================
