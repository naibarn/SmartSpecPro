/**
 * SilenceDetectionDialog - Full-screen modal for silence detection workflow.
 * Contains: header, main content (preview + settings), timeline, footer.
 * Uses Radix UI Dialog for focus trapping, ESC-to-close, and ARIA support.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type {
  VideoEditorProject,
  SilentRegion,
  SilenceDetectionConfig,
  AnalysisStage,
} from '../../types/videoEditor';
import {
  generateId,
  formatTime,
  dbToPercent,
  applyBufferToRegions,
} from '../../types/videoEditor';
import { createMediaJobClient } from '../../services/mediaJobClient';
import PreviewPlayer, { type ActiveClipInfo } from './PreviewPlayer';
import SilenceWaveformOverlay from './SilenceWaveformOverlay';

/**
 * Pure functions for skip-silence logic (exported for testing)
 */

/**
 * Binary search to find a region containing currentTime.
 * Expects regions to be pre-filtered (selected && !skipped) and sorted by adjustedStartTime.
 */
export function findRegionAtTime(
  regions: SilentRegion[],
  currentTime: number,
): SilentRegion | null {
  if (regions.length === 0) return null;

  // Binary search
  let lo = 0;
  let hi = regions.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const region = regions[mid];

    if (
      currentTime >= region.adjustedStartTime &&
      currentTime <= region.adjustedEndTime
    ) {
      return region;
    }

    if (currentTime < region.adjustedStartTime) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return null;
}

/**
 * Determines if playback should skip silence at the current time.
 * Returns the target seek time (adjustedEndTime) or null if no skip should occur.
 */
export function shouldSkipSilence(params: {
  enabled: boolean;
  currentTime: number;
  regions: SilentRegion[];
  lastSkipTimestamp: number;
  cooldownMs: number;
  boundaryGuardMs: number;
}): number | null {
  const {
    enabled,
    currentTime,
    regions,
    lastSkipTimestamp,
    cooldownMs,
    boundaryGuardMs,
  } = params;

  // Check if skip-silence is enabled
  if (!enabled) return null;

  // Check cooldown
  if (performance.now() - lastSkipTimestamp < cooldownMs) {
    return null;
  }

  // Find region at current time
  const region = findRegionAtTime(regions, currentTime);
  if (!region) return null;

  // Check boundary guard
  if (Math.abs(currentTime - region.adjustedEndTime) < boundaryGuardMs) {
    return null;
  }

  // Return target seek time
  return region.adjustedEndTime;
}

interface AssetWithWaveform {
  path: string;
  waveformData?: number[];
}

interface SilenceDetectionDialogProps {
  project: VideoEditorProject;
  onExportToTimeline: (
    selectedRegions: SilentRegion[],
    applyToAllTracks: boolean,
  ) => void;
  onClose: () => void;
}

const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
  project,
  onExportToTimeline,
  onClose,
}) => {
  // Slider state
  const [threshold, setThreshold] = useState(-40);
  const [minDuration, setMinDuration] = useState(0.5);
  const [softeningBuffer, setSofteningBuffer] = useState(0.2);

  // Track selection
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  // Analysis state
  const [regions, setRegions] = useState<SilentRegion[]>([]);
  const [rawRegions, setRawRegions] = useState<SilentRegion[]>([]); // Store raw regions for re-buffering
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
  const [totalSilence, setTotalSilence] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [projectDuration, setProjectDuration] = useState(0); // Store at analysis time to prevent re-renders
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // UI state
  const [playbackTime, setPlaybackTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [applyToAllTracks, setApplyToAllTracks] = useState(false);

  // Preview player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [skipSilenceEnabled, setSkipSilenceEnabled] = useState(false);
  const lastSkipRef = useRef(0);
  const playbackTimeRef = useRef(playbackTime);
  playbackTimeRef.current = playbackTime;

  // Waveform state
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] = useState(false);

  // Pre-compute skeleton bar heights to avoid Math.random() in render
  const skeletonHeights = useMemo(
    () => Array.from({ length: 40 }, () => 20 + Math.random() * 60),
    [],
  );

  // Mounted guard for async cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Waveform data availability check
  useEffect(() => {
    const audioTracks = project.timeline.tracks.filter(
      (t) => t.type === 'audio' && t.clips.length > 0,
    );
    if (audioTracks.length === 0) return;

    const firstClip = audioTracks[0].clips[0];
    const asset = project.assets[firstClip.assetId] as AssetWithWaveform | undefined;
    if (!asset) return;

    if (asset.waveformData && asset.waveformData.length > 0) {
      setWaveformData(asset.waveformData);
      return;
    }

    // Waveform data missing -- trigger generation
    setWaveformLoading(true);
    const fetchWaveform = async () => {
      try {
        const client = await createMediaJobClient();
        const result = await client.getWaveformPeaks(asset.path);
        if (!mountedRef.current) return;
        const peaks = (result as { derived?: { peaks?: number[] } }).derived?.peaks || [];
        setWaveformData(peaks);
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('Waveform generation failed:', err);
        setWaveformError(true);
      } finally {
        if (mountedRef.current) {
          setWaveformLoading(false);
        }
      }
    };
    fetchWaveform();
  }, [project]);

  // Abort controller and stage timers cleanup
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      // Clear stage timers to prevent setState on unmounted component
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
    };
  }, []);

  // Auto-select first audio track
  useEffect(() => {
    const audioTracks = project.timeline.tracks.filter(
      (t) => t.type === 'audio' && t.clips.length > 0
    );
    if (audioTracks.length > 0 && selectedTrackIds.length === 0) {
      setSelectedTrackIds([audioTracks[0].id]);
    }
  }, [project, selectedTrackIds.length]);

  // Re-apply buffer when it changes after analysis
  // NOTE: Uses rawRegions.length (not regions.length) in dependency array to avoid infinite loop.
  // We update 'regions' inside this effect, so depending on 'regions' would retrigger the effect.
  // rawRegions only changes when a new analysis completes, which is the correct trigger.
  useEffect(() => {
    if (analysisComplete && rawRegions.length > 0) {
      const reBuffered = applyBufferToRegions(rawRegions, softeningBuffer);
      setRegions(reBuffered);

      // Recalculate stats
      const silenceDuration = reBuffered
        .filter((r) => !r.skipped)
        .reduce((sum, r) => sum + r.adjustedDuration, 0);
      setTotalSilence(silenceDuration);
      setTotalActive(Math.max(0, projectDuration - silenceDuration));
    }
  }, [softeningBuffer, analysisComplete, rawRegions.length, projectDuration]);

  // Pre-filter and sort regions for skip-silence
  const skipRegions = useMemo(() => {
    return regions
      .filter((r) => r.selected && !r.skipped && r.adjustedDuration > 0)
      .sort((a, b) => a.adjustedStartTime - b.adjustedStartTime);
  }, [regions]);

  // Skip-silence effect during playback
  useEffect(() => {
    if (!isPlaying || !skipSilenceEnabled || skipRegions.length === 0) {
      return;
    }

    let rafId: number;

    const tick = () => {
      const target = shouldSkipSilence({
        enabled: true,
        currentTime: playbackTimeRef.current,
        regions: skipRegions,
        lastSkipTimestamp: lastSkipRef.current,
        cooldownMs: 100,
        boundaryGuardMs: 0.05,
      });

      if (target !== null) {
        setPlaybackTime(target);
        lastSkipRef.current = performance.now();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, skipSilenceEnabled, skipRegions, setPlaybackTime]);

  // Get audio tracks for UI
  const audioTracks = useMemo(() =>
    project.timeline.tracks.filter((t) => t.type === 'audio' && t.clips.length > 0),
    [project]
  );

  // Resolve preview asset from first selected track
  const { previewUrl, activeClip, duration } = useMemo(() => {
    if (selectedTrackIds.length === 0) {
      return { previewUrl: '', activeClip: null, duration: 0 };
    }

    const firstTrack = project.timeline.tracks.find(
      (t) => t.id === selectedTrackIds[0],
    );
    if (!firstTrack || firstTrack.clips.length === 0) {
      return { previewUrl: '', activeClip: null, duration: 0 };
    }

    const firstClip = firstTrack.clips[0];
    const asset = project.assets[firstClip.assetId];
    if (!asset || !asset.path) {
      return { previewUrl: '', activeClip: null, duration: 0 };
    }

    // Build ActiveClipInfo if clip has trim points
    let clipInfo: ActiveClipInfo | null = null;
    if (firstClip.trimIn != null || firstClip.trimOut != null) {
      clipInfo = {
        videoUrl: asset.path,
        clipStartTime: firstClip.startTime,
        trimIn: firstClip.trimIn ?? 0,
        clipDuration: firstClip.duration || 0,
      };
    }

    return {
      previewUrl: asset.path,
      activeClip: clipInfo,
      duration: project.settings.duration || firstClip.duration || 0,
    };
  }, [project, selectedTrackIds]);

  // Playback handlers
  const handleTimeChange = useCallback((time: number) => {
    setPlaybackTime(time);
  }, []);

  const handleWaveformSeek = useCallback((time: number) => {
    setPlaybackTime(time);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  // Handle analyze button
  const handleAutoDetect = async () => {
    if (selectedTrackIds.length === 0) return;

    // Filter out invalid track IDs (tracks that no longer exist)
    const validTrackIds = selectedTrackIds.filter((id) =>
      audioTracks.some((track) => track.id === id)
    );
    if (validTrackIds.length === 0) {
      setAnalysisError('Selected tracks no longer exist. Please select a valid track.');
      return;
    }

    // Create abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Reset state
    setIsAnalyzing(true);
    setAnalysisStage('preparing');
    setAnalysisComplete(false);
    setAnalysisError(null);
    setRegions([]);
    setRawRegions([]);

    // Stage timers for visual feedback
    stageTimersRef.current = [];
    stageTimersRef.current.push(setTimeout(() => setAnalysisStage('scanning'), 1000));
    stageTimersRef.current.push(setTimeout(() => setAnalysisStage('detecting'), 3000));

    try {
      // Find asset URI
      const firstTrack = project.timeline.tracks.find((t) => t.id === validTrackIds[0]);
      if (!firstTrack || firstTrack.clips.length === 0) {
        throw new Error('No clips found in selected track');
      }

      const firstClip = firstTrack.clips[0];
      const asset = project.assets[firstClip.assetId];
      if (!asset || !asset.path) {
        throw new Error('Asset not found');
      }

      setAnalysisStage('detecting');

      // Call backend
      const client = await createMediaJobClient();
      const result = await client.detectDeadAir(asset.path, {
        thresholdDb: threshold,
        minSilenceMs: minDuration * 1000,
      });

      // Check if aborted
      if (abortController.signal.aborted) {
        return;
      }

      setAnalysisStage('applying_buffer');

      // Map segments to regions
      const silenceSegments = result.derived?.silenceSegments || [];
      const rawRegions: SilentRegion[] = silenceSegments.map((seg: any) => ({
        id: generateId('region'),
        startTime: seg.startMs / 1000,
        endTime: seg.endMs / 1000,
        duration: (seg.endMs - seg.startMs) / 1000,
        adjustedStartTime: 0,
        adjustedEndTime: 0,
        adjustedDuration: 0,
        averageDb: seg.averageDb || threshold,
        trackId: firstTrack.id,
        selected: true,
        skipped: false,
      }));

      // Store raw regions for re-buffering
      setRawRegions(rawRegions);

      // Apply buffer
      const bufferedRegions = applyBufferToRegions(rawRegions, softeningBuffer);

      // Calculate stats
      const silenceDuration = bufferedRegions
        .filter((r) => !r.skipped)
        .reduce((sum, r) => sum + r.adjustedDuration, 0);
      const duration = project.settings.duration || 0;
      const activeDuration = duration > 0 ? Math.max(0, duration - silenceDuration) : 0;

      setRegions(bufferedRegions);
      setTotalSilence(silenceDuration);
      setTotalActive(activeDuration);
      setProjectDuration(duration); // Store for later re-calculations
      setAnalysisComplete(true);
      setAnalysisStage('done');
    } catch (err) {
      // Check abort signal even in catch block to handle race condition:
      // If network error occurs and then user closes dialog, ignore the error
      if (abortController.signal.aborted) {
        return;
      }
      console.error('Analysis failed:', err);
      setAnalysisStage('error');
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed - try again or adjust settings');
    } finally {
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
      setIsAnalyzing(false);
    }
  };

  // Track toggle handler
  const handleTrackToggle = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId]
    );
  };

  const selectedRegionCount = regions.filter((r) => r.selected && !r.skipped).length;
  const exportDisabled = !analysisComplete || selectedRegionCount === 0;

  const handleExport = () => {
    const selectedRegions = regions.filter((r) => r.selected && !r.skipped);
    onExportToTimeline(selectedRegions, applyToAllTracks);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="silence-dialog-overlay" />
        <DialogPrimitive.Content
          className="silence-dialog-content"
          aria-describedby={undefined}
        >
          <style>{`
            .silence-dialog-overlay {
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.9);
              z-index: 2000;
            }
            .silence-dialog-content {
              position: fixed;
              inset: 0;
              z-index: 2001;
              display: flex;
              flex-direction: column;
              background: #1a1a1a;
              color: #e0e0e0;
              max-width: none;
              width: 100vw;
              height: 100vh;
              border: none;
              border-radius: 0;
              padding: 0;
              gap: 0;
            }
            .silence-dialog-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 20px;
              border-bottom: 1px solid #444;
              background: #222;
              min-height: 56px;
            }
            .silence-dialog-header-left {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .silence-dialog-back-btn,
            .silence-dialog-close-btn {
              background: none;
              border: 1px solid #555;
              color: #e0e0e0;
              cursor: pointer;
              padding: 6px 12px;
              border-radius: 4px;
              font-size: 14px;
            }
            .silence-dialog-back-btn:hover,
            .silence-dialog-close-btn:hover {
              background: #333;
            }
            .silence-dialog-title {
              font-size: 18px;
              font-weight: 600;
              color: #fff;
            }
            .silence-dialog-main {
              display: flex;
              flex: 1;
              overflow: hidden;
            }
            .silence-dialog-preview {
              flex: 0 0 60%;
              display: flex;
              flex-direction: column;
              background: #111;
              border-right: 1px solid #444;
              overflow: hidden;
            }
            .preview-container {
              display: flex;
              flex-direction: column;
              flex: 1;
              overflow: hidden;
            }
            .preview-placeholder {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #666;
              font-size: 14px;
            }
            .skip-silence-toggle {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 16px;
              font-size: 13px;
              color: #e0e0e0;
              cursor: pointer;
              user-select: none;
              background: #1a1a1a;
              border-top: 1px solid #333;
            }
            .skip-silence-toggle input[type="checkbox"] {
              accent-color: #0078d4;
              width: 16px;
              height: 16px;
              cursor: pointer;
            }
            .silence-dialog-settings {
              flex: 0 0 40%;
              overflow-y: auto;
              padding: 20px;
              background: #2a2a2a;
            }
            .silence-dialog-timeline {
              height: 200px;
              border-top: 1px solid #444;
              background: #1e1e1e;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #666;
              font-size: 14px;
            }
            .silence-dialog-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 20px;
              border-top: 1px solid #444;
              background: #222;
              min-height: 56px;
            }
            .silence-dialog-footer-left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .silence-dialog-toggle {
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              font-size: 14px;
            }
            .silence-dialog-toggle input {
              cursor: pointer;
            }
            .silence-dialog-export-btn {
              background: #0078d4;
              color: #fff;
              border: none;
              padding: 8px 20px;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
            }
            .silence-dialog-export-btn:hover:not(:disabled) {
              background: #006cbd;
            }
            .silence-dialog-export-btn:disabled {
              background: #444;
              color: #888;
              cursor: not-allowed;
            }
            .waveform-skeleton {
              display: flex;
              gap: 2px;
              align-items: flex-end;
              height: 80px;
              padding: 0 20px;
            }
            .waveform-skeleton-bar {
              width: 3px;
              background: #333;
              border-radius: 1px;
              animation: silence-pulse 1.5s ease-in-out infinite;
            }
            @keyframes silence-pulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.6; }
            }
            .waveform-error {
              color: #888;
              font-size: 13px;
            }
            /* Settings Panel Styles */
            .settings-panel {
              display: flex;
              flex-direction: column;
              gap: 24px;
            }
            .settings-heading {
              font-size: 16px;
              font-weight: 600;
              color: #fff;
              margin: 0;
            }
            .control-group {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .control-label {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              color: #ccc;
            }
            .control-value {
              color: #fff;
              font-weight: 500;
            }
            .slider-container {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .slider-endpoint {
              font-size: 12px;
              color: #888;
              min-width: 30px;
              text-align: center;
            }
            .slider {
              flex: 1;
              height: 4px;
              border-radius: 2px;
              background: #444;
              outline: none;
              -webkit-appearance: none;
              cursor: pointer;
            }
            .slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: #0078d4;
              cursor: pointer;
            }
            .slider::-moz-range-thumb {
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: #0078d4;
              cursor: pointer;
              border: none;
            }
            .slider:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }
            .slider:disabled::-webkit-slider-thumb {
              cursor: not-allowed;
            }
            .slider:disabled::-moz-range-thumb {
              cursor: not-allowed;
            }
            .control-help {
              font-size: 12px;
              color: #888;
              font-style: italic;
            }
            .track-selection {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .track-selection-heading {
              font-size: 14px;
              font-weight: 600;
              color: #fff;
              margin: 0;
            }
            .track-checkbox-label {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 14px;
              color: #ccc;
              cursor: pointer;
            }
            .track-checkbox-label input {
              cursor: pointer;
            }
            .track-checkbox-label input:disabled {
              cursor: not-allowed;
            }
            .track-empty-state {
              font-size: 14px;
              color: #888;
              font-style: italic;
            }
            .analyze-btn {
              width: 100%;
              padding: 12px 20px;
              background: #0078d4;
              color: #fff;
              border: none;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
            }
            .analyze-btn:hover:not(:disabled) {
              background: #006cbd;
            }
            .analyze-btn:disabled {
              background: #444;
              color: #888;
              cursor: not-allowed;
            }
            .stats-section {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .stats-heading {
              font-size: 14px;
              font-weight: 600;
              color: #fff;
              margin: 0;
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
            }
            .stat-card {
              background: #1e1e1e;
              border: 1px solid #444;
              border-radius: 4px;
              padding: 12px;
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .stat-label {
              font-size: 12px;
              color: #888;
            }
            .stat-value {
              font-size: 16px;
              font-weight: 600;
              color: #fff;
            }
            .analysis-error {
              padding: 12px;
              background: rgba(255, 0, 0, 0.1);
              border: 1px solid rgba(255, 0, 0, 0.3);
              border-radius: 4px;
              color: #ff6b6b;
              font-size: 14px;
            }
            @media (max-width: 1279px) {
              .silence-dialog-main {
                flex-direction: column;
              }
              .silence-dialog-preview,
              .silence-dialog-settings {
                flex: none;
                width: 100%;
                border-right: none;
              }
              .silence-dialog-preview {
                height: 300px;
                border-bottom: 1px solid #444;
              }
              .stats-grid {
                grid-template-columns: 1fr;
              }
            }
          `}</style>

          {/* Header */}
          <div className="silence-dialog-header" data-testid="silence-dialog-header">
            <div className="silence-dialog-header-left">
              <DialogClose asChild>
                <button className="silence-dialog-back-btn" aria-label="Back">
                  Back
                </button>
              </DialogClose>
              <DialogTitle className="silence-dialog-title">
                Silence Detection
              </DialogTitle>
            </div>
            <DialogClose asChild>
              <button className="silence-dialog-close-btn" aria-label="Close" data-testid="silence-dialog-close">
                X
              </button>
            </DialogClose>
          </div>

          {/* Main Content: Preview (left) + Settings (right) */}
          <div className="silence-dialog-main">
            <div className="silence-dialog-preview" data-testid="silence-dialog-preview">
              <div className="preview-container">
                {previewUrl ? (
                  <>
                    <PreviewPlayer
                      currentTime={playbackTime}
                      duration={duration}
                      isPlaying={isPlaying}
                      onTimeChange={handleTimeChange}
                      onPlayPause={handlePlayPause}
                      onStop={handleStop}
                      previewVideoUrl={previewUrl}
                      activeClip={activeClip}
                    />
                    <label htmlFor="skip-silence-toggle" className="skip-silence-toggle">
                      <input
                        id="skip-silence-toggle"
                        type="checkbox"
                        checked={skipSilenceEnabled}
                        onChange={(e) => setSkipSilenceEnabled(e.target.checked)}
                      />
                      Skip Silence Preview
                    </label>
                  </>
                ) : (
                  <div className="preview-placeholder">
                    Select a track with clips to preview
                  </div>
                )}
              </div>
            </div>
            <div className="silence-dialog-settings" data-testid="silence-dialog-settings">
              <div className="settings-panel">
                <h3 className="settings-heading">Detection Settings</h3>

                {/* Volume Threshold Slider */}
                <div className="control-group">
                  <label className="control-label">
                    <span>Volume Threshold</span>
                    <span
                      className="control-value"
                      data-testid="threshold-label"
                    >
                      {threshold} dB ({Math.round(dbToPercent(threshold))}%)
                    </span>
                  </label>
                  <div className="slider-container">
                    <span className="slider-endpoint">-60</span>
                    <input
                      type="range"
                      min="-60"
                      max="-20"
                      step="1"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      disabled={isAnalyzing}
                      className="slider"
                      data-testid="threshold-slider"
                    />
                    <span className="slider-endpoint">-20</span>
                  </div>
                </div>

                {/* Minimum Duration Slider */}
                <div className="control-group">
                  <label className="control-label">
                    <span>Minimum Duration</span>
                    <span className="control-value" data-testid="minDuration-label">
                      {minDuration.toFixed(1)}s
                    </span>
                  </label>
                  <div className="slider-container">
                    <span className="slider-endpoint">0.1</span>
                    <input
                      type="range"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={minDuration}
                      onChange={(e) => setMinDuration(Number(e.target.value))}
                      disabled={isAnalyzing}
                      className="slider"
                      data-testid="minDuration-slider"
                    />
                    <span className="slider-endpoint">5.0</span>
                  </div>
                </div>

                {/* Softening Buffer Slider */}
                <div className="control-group">
                  <label className="control-label">
                    <span>Softening Buffer</span>
                    <span className="control-value" data-testid="softeningBuffer-label">
                      {softeningBuffer.toFixed(2)}s
                    </span>
                  </label>
                  <div className="slider-container">
                    <span className="slider-endpoint">0.0</span>
                    <input
                      type="range"
                      min="0.0"
                      max="2.0"
                      step="0.05"
                      value={softeningBuffer}
                      onChange={(e) => setSofteningBuffer(Number(e.target.value))}
                      disabled={isAnalyzing}
                      className="slider"
                      data-testid="softeningBuffer-slider"
                    />
                    <span className="slider-endpoint">2.0</span>
                  </div>
                  <div className="control-help">
                    Adds padding around cuts for smoother transitions
                  </div>
                </div>

                {/* Track Selection */}
                <div className="track-selection">
                  <h4 className="track-selection-heading">Audio Tracks</h4>
                  {audioTracks.length === 0 ? (
                    <div className="track-empty-state">
                      No audio tracks with clips found
                    </div>
                  ) : (
                    audioTracks.map((track) => (
                      <label key={track.id} className="track-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedTrackIds.includes(track.id)}
                          onChange={() => handleTrackToggle(track.id)}
                          disabled={isAnalyzing}
                        />
                        <span>{track.name || track.id}</span>
                      </label>
                    ))
                  )}
                </div>

                {/* Analyze Button */}
                <button
                  className="analyze-btn"
                  onClick={handleAutoDetect}
                  disabled={isAnalyzing || selectedTrackIds.length === 0 || audioTracks.length === 0}
                  data-testid="analyze-btn"
                >
                  {isAnalyzing
                    ? analysisStage === 'preparing'
                      ? 'Preparing...'
                      : analysisStage === 'scanning'
                      ? 'Scanning audio...'
                      : analysisStage === 'detecting'
                      ? 'Detecting silence...'
                      : analysisStage === 'applying_buffer'
                      ? 'Applying buffer...'
                      : 'Analyzing...'
                    : 'Analyze'}
                </button>

                {/* Stats Display */}
                {analysisComplete && !analysisError && (
                  <div className="stats-section" data-testid="stats-section">
                    <h4 className="stats-heading">Analysis Results</h4>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-label">Total Silence</div>
                        <div className="stat-value" data-testid="total-silence">
                          {formatTime(totalSilence)}
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Active Audio</div>
                        <div className="stat-value" data-testid="active-audio">
                          {formatTime(totalActive)}
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Selected</div>
                        <div className="stat-value" data-testid="selected-count">
                          {selectedRegionCount} ({formatTime(
                            regions
                              .filter((r) => r.selected && !r.skipped)
                              .reduce((sum, r) => sum + r.adjustedDuration, 0)
                          )})
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {analysisError && (
                  <div className="analysis-error" data-testid="analysis-error">
                    {analysisError}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeline Zone */}
          <div className="silence-dialog-timeline" data-testid="silence-dialog-timeline">
            {waveformLoading && (
              <div className="waveform-skeleton" data-testid="waveform-loading">
                {skeletonHeights.map((h, i) => (
                  <div
                    key={i}
                    className="waveform-skeleton-bar"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 0.03}s`,
                    }}
                  />
                ))}
              </div>
            )}
            {waveformError && (
              <div className="waveform-error" data-testid="waveform-error">
                Waveform unavailable
              </div>
            )}
            {!waveformLoading && !waveformError && waveformData && (
              <SilenceWaveformOverlay
                currentTime={playbackTime}
                onSeek={handleWaveformSeek}
                regions={regions}
                duration={duration}
                waveformData={waveformData}
              />
            )}
            {!waveformLoading && !waveformError && !waveformData && (
              <span>No waveform data available</span>
            )}
          </div>

          {/* Footer */}
          <div className="silence-dialog-footer" data-testid="silence-dialog-footer">
            <div className="silence-dialog-footer-left">
              <label className="silence-dialog-toggle">
                <input
                  type="checkbox"
                  checked={applyToAllTracks}
                  onChange={(e) => setApplyToAllTracks(e.target.checked)}
                />
                Apply to all tracks
              </label>
            </div>
            <button
              className="silence-dialog-export-btn"
              disabled={exportDisabled}
              onClick={handleExport}
              data-testid="export-to-timeline-btn"
            >
              Export to Timeline
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default SilenceDetectionDialog;
