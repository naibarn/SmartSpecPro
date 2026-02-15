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
import WaveformCanvas from './WaveformCanvas';

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
  type?: 'video' | 'audio' | 'image';
  path?: string;
  originalPath?: string;
  url?: string;
  uri?: string;
  waveformData?: number[];
}

function resolveAssetUri(asset?: AssetWithWaveform | null): string {
  if (!asset) return '';
  const candidate = asset.path || asset.originalPath || asset.url || asset.uri || '';
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function toSeconds(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function toSafeTime(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function toSecondsFromMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value / 1000;
  }
  return null;
}

function getClipStartSeconds(clip: any): number {
  return toSeconds(clip?.startTime, toSecondsFromMs(clip?.startMs) ?? 0);
}

function getClipDurationSeconds(clip: any): number {
  return toSeconds(clip?.duration, toSecondsFromMs(clip?.durationMs) ?? 0);
}

function getClipTrimInSeconds(clip: any): number {
  return toSeconds(clip?.trimIn, toSecondsFromMs(clip?.inMs) ?? 0);
}

function getProjectDurationSeconds(project: VideoEditorProject): number {
  const duration = project.settings?.duration;
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return duration;
  }
  const durationMs = (project.settings as any)?.durationMs;
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs / 1000;
  }
  return 0;
}

function toMs(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProgressPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value <= 1) return clampPercent(value * 100);
  return clampPercent(value);
}

function mapMediaStageToAnalysisStage(stage?: string): AnalysisStage | null {
  const normalized = (stage || '').toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('start') ||
    normalized.includes('prepare') ||
    normalized.includes('queue')
  ) {
    return 'preparing';
  }
  if (
    normalized.includes('scan') ||
    normalized.includes('probe') ||
    normalized.includes('download')
  ) {
    return 'scanning';
  }
  if (normalized.includes('detect')) {
    return 'detecting';
  }
  if (
    normalized.includes('apply') ||
    normalized.includes('buffer') ||
    normalized.includes('finaliz') ||
    normalized === 'done'
  ) {
    return 'applying_buffer';
  }
  return null;
}

function getAnalysisStageLabel(stage: AnalysisStage): string {
  switch (stage) {
    case 'preparing':
      return 'Preparing analysis...';
    case 'scanning':
      return 'Scanning audio...';
    case 'detecting':
      return 'Detecting silence...';
    case 'applying_buffer':
      return 'Applying buffer...';
    case 'done':
      return 'Analysis complete';
    case 'error':
      return 'Analysis failed';
    default:
      return 'Analyzing...';
  }
}

function humanizeStageText(stage?: string): string {
  if (!stage) return '';
  return stage
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function normalizeWaveformPeaks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return Math.max(0, Math.min(1, Math.abs(v)));
    })
    .filter((v): v is number => v !== null);
}

interface SilenceDetectionDialogProps {
  project: VideoEditorProject;
  selectedClipId?: string | null;
  selectedClipIds?: string[];
  onExportToTimeline: (
    selectedRegions: SilentRegion[],
    applyToAllTracks: boolean,
  ) => void;
  onClose: () => void;
}

const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
  project,
  selectedClipId,
  selectedClipIds = [],
  onExportToTimeline,
  onClose,
}) => {
  // Slider state
  const [threshold, setThreshold] = useState(-30);
  const [minDuration, setMinDuration] = useState(0.3);
  const [softeningBuffer, setSofteningBuffer] = useState(0.2);

  // Track selection
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  // Analysis state
  const [regions, setRegions] = useState<SilentRegion[]>([]);
  const [rawRegions, setRawRegions] = useState<SilentRegion[]>([]); // Store raw regions for re-buffering
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
  const [analysisProgressPct, setAnalysisProgressPct] = useState(0);
  const [analysisProgressLabel, setAnalysisProgressLabel] = useState('');
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
  const [analyzedPreviewClip, setAnalyzedPreviewClip] = useState<ActiveClipInfo | null>(null);

  // Waveform state
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] = useState(false);
  const [timelineViewportNode, setTimelineViewportNode] = useState<HTMLDivElement | null>(null);
  const [timelineViewportSize, setTimelineViewportSize] = useState({ width: 0, height: 0 });
  const previewSeededRef = useRef(false);

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

  const timelineViewportRef = useCallback((node: HTMLDivElement | null) => {
    setTimelineViewportNode(node);
  }, []);

  // Waveform data availability check
  useEffect(() => {
    let cancelled = false;

    const findWaveformSource = (): { assetUri: string; peaks: number[] | null } => {
      if (analyzedPreviewClip?.videoUrl) {
        return { assetUri: analyzedPreviewClip.videoUrl, peaks: null };
      }

      const pickFromTrack = (trackId: string): { assetUri: string; peaks: number[] | null } | null => {
        const track = project.timeline.tracks.find((t) => t.id === trackId);
        if (!track) return null;
        for (const clip of track.clips) {
          const asset = project.assets[clip.assetId] as AssetWithWaveform | undefined;
          if (!asset || asset.type === 'image') continue;
          const assetUri = resolveAssetUri(asset);
          if (!assetUri) continue;
          const peaks = normalizeWaveformPeaks(asset.waveformData);
          return { assetUri, peaks: peaks.length > 0 ? peaks : null };
        }
        return null;
      };

      for (const trackId of selectedTrackIds) {
        const selected = pickFromTrack(trackId);
        if (selected) return selected;
      }

      for (const track of project.timeline.tracks) {
        if ((track.type !== 'audio' && track.type !== 'video') || track.clips.length === 0) {
          continue;
        }
        const fallback = pickFromTrack(track.id);
        if (fallback) return fallback;
      }

      return { assetUri: '', peaks: null };
    };

    const source = findWaveformSource();
    setWaveformError(false);

    if (source.peaks && source.peaks.length > 0) {
      setWaveformLoading(false);
      setWaveformData(source.peaks);
      return () => {
        cancelled = true;
      };
    }

    if (!source.assetUri) {
      setWaveformLoading(false);
      setWaveformData(null);
      return () => {
        cancelled = true;
      };
    }

    // Waveform data missing -- trigger generation from backend
    setWaveformLoading(true);
    setWaveformData(null);
    const fetchWaveform = async () => {
      try {
        const client = await createMediaJobClient();
        const result = await client.getWaveformPeaks(source.assetUri);
        if (!mountedRef.current || cancelled) return;
        const peaks = normalizeWaveformPeaks((result as { derived?: { peaks?: unknown } }).derived?.peaks);
        setWaveformData(peaks.length > 0 ? peaks : null);
      } catch (err) {
        if (!mountedRef.current || cancelled) return;
        console.error('Waveform generation failed:', err);
        setWaveformError(true);
      } finally {
        if (mountedRef.current && !cancelled) {
          setWaveformLoading(false);
        }
      }
    };
    fetchWaveform();

    return () => {
      cancelled = true;
    };
  }, [project, selectedTrackIds, analyzedPreviewClip?.videoUrl]);

  // Abort controller and stage timers cleanup
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      // Clear stage timers to prevent setState on unmounted component
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
    };
  }, []);

  // Auto-select first track with audio (audio or video tracks)
  useEffect(() => {
    const audioTracks = project.timeline.tracks.filter(
      (t) => (t.type === 'audio' || t.type === 'video') && t.clips.length > 0
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

  // Get tracks with audio content (audio tracks + video tracks which contain audio)
  const audioTracks = useMemo(() =>
    project.timeline.tracks.filter((t) => (t.type === 'audio' || t.type === 'video') && t.clips.length > 0),
    [project]
  );

  // Resolve preview asset with priority:
  // 1) currently selected timeline clip, 2) selected analysis tracks, 3) any visual clip in project.
  const { previewUrl, activeClip, duration } = useMemo(() => {
    type ClipCandidate = { clip: any; asset: any };
    const timelineDuration = getProjectDurationSeconds(project);
    const selectedIds = selectedClipId
      ? [selectedClipId, ...selectedClipIds.filter((id) => id !== selectedClipId)]
      : selectedClipIds;

    const findSelectedClipCandidate = (): ClipCandidate | null => {
      if (selectedIds.length === 0) return null;
      for (const selectedId of selectedIds) {
        for (const track of project.timeline.tracks) {
          const clip = track.clips.find((c) => c.id === selectedId);
          if (!clip) continue;
          const asset = project.assets[clip.assetId] as AssetWithWaveform | undefined;
          if (!asset) continue;
          const assetUri = resolveAssetUri(asset);
          if (!assetUri) continue;
          return { clip, asset: { ...asset, path: assetUri } };
        }
      }
      return null;
    };

    const findFirstVisualClipInTracks = (trackIds: string[]): ClipCandidate | null => {
      for (const trackId of trackIds) {
        const track = project.timeline.tracks.find((t) => t.id === trackId);
        if (!track) continue;
        for (const clip of track.clips) {
          const asset = project.assets[clip.assetId] as AssetWithWaveform | undefined;
          if (!asset) continue;
          const assetUri = resolveAssetUri(asset);
          if (!assetUri) continue;
          // Selected track can be legacy/migrated where asset.type may be missing.
          // If it's on a visual track, prefer it as preview source.
          if (track.type === 'video' || track.type === 'overlay' || asset.type === 'video' || asset.type === 'image' || !asset.type) {
            return { clip, asset: { ...asset, path: assetUri } };
          }
        }
      }
      return null;
    };

    const findFirstVisualClipInProject = (): ClipCandidate | null => {
      for (const track of project.timeline.tracks) {
        if (track.type !== 'video' && track.type !== 'overlay') continue;
        for (const clip of track.clips) {
          const asset = project.assets[clip.assetId] as AssetWithWaveform | undefined;
          if (!asset) continue;
          const assetUri = resolveAssetUri(asset);
          if (!assetUri) continue;
          return { clip, asset: { ...asset, path: assetUri } };
        }
      }
      return null;
    };

    // After analysis, always preview the exact clip source that was analyzed.
    // This avoids edge-cases where selection/project scan points at a non-playable clip.
    if (analysisComplete && analyzedPreviewClip?.videoUrl) {
      const clipStart = toSeconds(analyzedPreviewClip.clipStartTime, 0);
      const clipDuration = Math.max(0, toSeconds(analyzedPreviewClip.clipDuration, 0));
      const trimIn = Math.max(0, toSeconds(analyzedPreviewClip.trimIn, 0));
      const normalizedUrl = analyzedPreviewClip.videoUrl.trim();
      const fallbackDuration = clipStart + clipDuration;
      return {
        previewUrl: normalizedUrl,
        activeClip: {
          ...analyzedPreviewClip,
          videoUrl: normalizedUrl,
          clipStartTime: clipStart,
          clipDuration,
          trimIn,
        },
        duration: Math.max(timelineDuration, fallbackDuration),
      };
    }

    const selectedClipCandidate = findSelectedClipCandidate();
    const preferred =
      (selectedClipCandidate && (selectedClipCandidate.asset.type === 'video' || selectedClipCandidate.asset.type === 'image')
        ? selectedClipCandidate
        : null) ||
      findFirstVisualClipInTracks(selectedTrackIds) ||
      findFirstVisualClipInProject() ||
      selectedClipCandidate;

    if (!preferred) {
      if (analyzedPreviewClip) {
        const fallbackDuration = analyzedPreviewClip.clipStartTime + analyzedPreviewClip.clipDuration;
        return {
          previewUrl: analyzedPreviewClip.videoUrl,
          activeClip: analyzedPreviewClip,
          duration: Math.max(timelineDuration, fallbackDuration),
        };
      }
      return { previewUrl: '', activeClip: null, duration: 0 };
    }

    const { clip, asset } = preferred;
    const clipStart = getClipStartSeconds(clip);
    const clipDuration = getClipDurationSeconds(clip);
    const trimIn = getClipTrimInSeconds(clip);
    const clipInfo: ActiveClipInfo = {
      videoUrl: asset.path,
      clipStartTime: clipStart,
      trimIn,
      clipDuration,
      isImage: asset.type === 'image',
    };

    const fallbackDuration = clipStart + clipDuration;

    return {
      previewUrl: asset.path,
      activeClip: clipInfo,
      duration: Math.max(timelineDuration, fallbackDuration),
    };
  }, [project, selectedTrackIds, selectedClipId, selectedClipIds, analyzedPreviewClip, analysisComplete]);

  useEffect(() => {
    if (!timelineViewportNode) return;

    const measure = () => {
      const width = Math.max(0, Math.floor(timelineViewportNode.clientWidth));
      const height = Math.max(0, Math.floor(timelineViewportNode.clientHeight));
      setTimelineViewportSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(timelineViewportNode);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [timelineViewportNode]);

  // Seed preview at the selected clip's timeline start so users don't land on source-time 0.
  useEffect(() => {
    if (!activeClip) return;
    if (previewSeededRef.current) return;
    setPlaybackTime(Math.max(0, toSafeTime(activeClip.clipStartTime, 0)));
    previewSeededRef.current = true;
  }, [activeClip?.videoUrl, activeClip?.clipStartTime]);

  // Re-seed when selection changes.
  useEffect(() => {
    previewSeededRef.current = false;
  }, [selectedClipId, selectedClipIds.join('|')]);

  // Playback handlers
  const handleTimeChange = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;
    const maxTime = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    setPlaybackTime(Math.max(0, Math.min(maxTime, time)));
  }, [duration]);

  const handleWaveformSeek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;
    const maxTime = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    setPlaybackTime(Math.max(0, Math.min(maxTime, time)));
  }, [duration]);

  const applyRegionSelectionUpdate = useCallback(
    (updater: (region: SilentRegion) => SilentRegion) => {
      setRawRegions((prev) => prev.map(updater));
      setRegions((prev) => prev.map(updater));
    },
    [],
  );

  const handleRegionToggle = useCallback((regionId: string) => {
    applyRegionSelectionUpdate((region) =>
      region.id === regionId && !region.skipped
        ? { ...region, selected: !region.selected }
        : region
    );
  }, [applyRegionSelectionUpdate]);

  const handleSelectAllCut = useCallback(() => {
    applyRegionSelectionUpdate((region) =>
      !region.skipped ? { ...region, selected: true } : region
    );
  }, [applyRegionSelectionUpdate]);

  const handleSelectAllKeep = useCallback(() => {
    applyRegionSelectionUpdate((region) =>
      !region.skipped ? { ...region, selected: false } : region
    );
  }, [applyRegionSelectionUpdate]);

  const handleInvertSelection = useCallback(() => {
    applyRegionSelectionUpdate((region) =>
      !region.skipped ? { ...region, selected: !region.selected } : region
    );
  }, [applyRegionSelectionUpdate]);

  const handleManualRangeCreate = useCallback((startTime: number, endTime: number) => {
    if (!analysisComplete) return;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return;

    const start = Math.max(0, Math.min(startTime, endTime));
    const end = Math.max(start, Math.max(startTime, endTime));
    if (end - start < 0.05) return;

    const fallbackTrackId = selectedTrackIds[0] || audioTracks[0]?.id || 'manual-track';
    const region: SilentRegion = {
      id: generateId('region'),
      startTime: start,
      endTime: end,
      duration: end - start,
      adjustedStartTime: 0,
      adjustedEndTime: 0,
      adjustedDuration: 0,
      averageDb: threshold,
      trackId: fallbackTrackId,
      selected: true,
      skipped: false,
    };

    setRawRegions((prev) => {
      const next = [...prev, region].sort((a, b) => a.startTime - b.startTime);
      return next;
    });
    setSkipSilenceEnabled(true);
  }, [analysisComplete, selectedTrackIds, audioTracks, threshold]);

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
    setAnalysisProgressPct(0);
    setAnalysisProgressLabel(getAnalysisStageLabel('preparing'));
    setAnalysisComplete(false);
    setAnalysisError(null);
    setRegions([]);
    setRawRegions([]);

    // Stage timers for visual feedback
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    stageTimersRef.current.push(setTimeout(() => {
      setAnalysisStage('scanning');
      setAnalysisProgressLabel(getAnalysisStageLabel('scanning'));
      setAnalysisProgressPct((prev) => Math.max(prev, 12));
    }, 1000));
    stageTimersRef.current.push(setTimeout(() => {
      setAnalysisStage('detecting');
      setAnalysisProgressLabel(getAnalysisStageLabel('detecting'));
      setAnalysisProgressPct((prev) => Math.max(prev, 25));
    }, 3000));

    try {
      // Find asset URI
      const firstTrack = project.timeline.tracks.find((t) => t.id === validTrackIds[0]);
      if (!firstTrack || firstTrack.clips.length === 0) {
        throw new Error('No clips found in selected track');
      }

      const firstClip = firstTrack.clips[0];
      const asset = project.assets[firstClip.assetId] as AssetWithWaveform | undefined;
      const assetUri = resolveAssetUri(asset);
      if (!asset || !assetUri) {
        throw new Error('Asset not found');
      }

      setAnalyzedPreviewClip({
        videoUrl: assetUri,
        clipStartTime: getClipStartSeconds(firstClip),
        trimIn: getClipTrimInSeconds(firstClip),
        clipDuration: getClipDurationSeconds(firstClip),
        isImage: asset.type === 'image',
      });

      setAnalysisStage('detecting');
      setAnalysisProgressLabel(getAnalysisStageLabel('detecting'));

      // Call backend
      const client = await createMediaJobClient();
      const result = await client.detectDeadAir(assetUri, {
        thresholdDb: threshold,
        minSilenceMs: minDuration * 1000,
      }, (progress) => {
        if (abortController.signal.aborted || !mountedRef.current) return;

        const mappedStage = mapMediaStageToAnalysisStage(progress.stage);
        if (mappedStage) {
          setAnalysisStage((prev) => (
            prev === 'applying_buffer' || prev === 'done' || prev === 'error'
              ? prev
              : mappedStage
          ));
        }

        const progressPct = normalizeProgressPercent(progress.progress);
        setAnalysisProgressPct((prev) => Math.max(prev, progressPct));

        if (typeof progress.message === 'string' && progress.message.trim()) {
          setAnalysisProgressLabel(progress.message.trim());
          return;
        }

        if (mappedStage) {
          setAnalysisProgressLabel(getAnalysisStageLabel(mappedStage));
          return;
        }

        if (progress.stage) {
          setAnalysisProgressLabel(humanizeStageText(progress.stage));
        }
      });

      // Check if aborted
      if (abortController.signal.aborted) {
        return;
      }

      setAnalysisStage('applying_buffer');
      setAnalysisProgressLabel(getAnalysisStageLabel('applying_buffer'));
      setAnalysisProgressPct((prev) => Math.max(prev, 92));

      // Map segments to regions
      const silenceSegments = result.derived?.silenceSegments || [];
      const clipStart = getClipStartSeconds(firstClip);
      const clipTrimIn = getClipTrimInSeconds(firstClip);
      const clipDuration = getClipDurationSeconds(firstClip);
      const clipSourceEnd = clipDuration > 0
        ? clipTrimIn + clipDuration
        : Number.POSITIVE_INFINITY;

      const rawRegions: SilentRegion[] = silenceSegments
        .map((seg: any): SilentRegion | null => {
          const startMs = toMs(seg?.startMs, toMs(seg?.start, 0) * 1000);
          const endMs = toMs(seg?.endMs, toMs(seg?.end, 0) * 1000);
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return null;
          }

          const sourceStart = Math.max(0, startMs / 1000);
          const sourceEnd = Math.max(sourceStart, endMs / 1000);

          const visibleSourceStart = Math.max(sourceStart, clipTrimIn);
          const visibleSourceEnd = Math.min(sourceEnd, clipSourceEnd);
          if (!Number.isFinite(visibleSourceStart) || !Number.isFinite(visibleSourceEnd) || visibleSourceEnd <= visibleSourceStart) {
            return null;
          }

          const timelineStart = clipStart + (visibleSourceStart - clipTrimIn);
          const timelineEnd = clipStart + (visibleSourceEnd - clipTrimIn);
          const regionDuration = timelineEnd - timelineStart;
          if (!Number.isFinite(timelineStart) || !Number.isFinite(timelineEnd) || regionDuration <= 0) {
            return null;
          }

          return {
            id: generateId('region'),
            startTime: timelineStart,
            endTime: timelineEnd,
            duration: regionDuration,
            adjustedStartTime: 0,
            adjustedEndTime: 0,
            adjustedDuration: 0,
            averageDb: toSeconds(seg?.averageDb, threshold),
            trackId: firstTrack.id,
            selected: true,
            skipped: false,
          };
        })
        .filter((region): region is SilentRegion => region !== null);

      // Store raw regions for re-buffering
      setRawRegions(rawRegions);

      // Apply buffer
      const bufferedRegions = applyBufferToRegions(rawRegions, softeningBuffer);

      // Calculate stats
      const silenceDuration = bufferedRegions
        .filter((r) => !r.skipped)
        .reduce((sum, r) => sum + r.adjustedDuration, 0);
      const duration = getProjectDurationSeconds(project);
      const activeDuration = duration > 0 ? Math.max(0, duration - silenceDuration) : 0;

      setRegions(bufferedRegions);
      setTotalSilence(silenceDuration);
      setTotalActive(activeDuration);
      setProjectDuration(duration); // Store for later re-calculations
      setSkipSilenceEnabled(bufferedRegions.some((r) => r.selected && !r.skipped));
      setAnalysisComplete(true);
      setAnalysisStage('done');
      setAnalysisProgressLabel(getAnalysisStageLabel('done'));
      setAnalysisProgressPct(100);
    } catch (err) {
      // Check abort signal even in catch block to handle race condition:
      // If network error occurs and then user closes dialog, ignore the error
      if (abortController.signal.aborted) {
        return;
      }
      console.error('Analysis failed:', err);
      setAnalysisStage('error');
      setAnalysisProgressLabel(getAnalysisStageLabel('error'));
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

  const editableRegions = useMemo(() => (
    regions
      .filter((r) => !r.skipped)
      .sort((a, b) => a.adjustedStartTime - b.adjustedStartTime)
  ), [regions]);
  const selectedRegionCount = editableRegions.filter((r) => r.selected).length;
  const keepRegionCount = Math.max(0, editableRegions.length - selectedRegionCount);
  const activeRegionAtPlayhead = useMemo(
    () => findRegionAtTime(editableRegions, playbackTime),
    [editableRegions, playbackTime],
  );
  const activeRegionId = activeRegionAtPlayhead?.id ?? null;
  const exportDisabled = !analysisComplete || selectedRegionCount === 0;
  const hasWaveform = Array.isArray(waveformData) && waveformData.length > 0;
  const effectiveTimelineDuration = useMemo(() => {
    if (Number.isFinite(duration) && duration > 0) return duration;
    const maxRegionEnd = regions.reduce((max, region) => (
      Math.max(max, region.endTime, region.adjustedEndTime)
    ), 0);
    return Math.max(1, projectDuration, maxRegionEnd);
  }, [duration, regions, projectDuration]);
  const timelineReady = timelineViewportSize.width > 0 && timelineViewportSize.height > 0;
  const timelineContentWidth = timelineReady
    ? Math.max(
      timelineViewportSize.width,
      Math.floor(timelineViewportSize.width * (timelineZoom / 100)),
    )
    : 0;
  const timelineSkipRanges = useMemo(
    () => skipRegions.map((region) => ({
      start: region.adjustedStartTime,
      end: region.adjustedEndTime,
    })),
    [skipRegions],
  );

  const handleExport = () => {
    const selectedRegions = regions.filter((r) => r.selected && !r.skipped);
    onExportToTimeline(selectedRegions, applyToAllTracks);
  };

  const handleToggleCurrentRegion = useCallback(() => {
    if (!activeRegionAtPlayhead) return;
    handleRegionToggle(activeRegionAtPlayhead.id);
  }, [activeRegionAtPlayhead, handleRegionToggle]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!analysisComplete) return;
      if (event.key !== 'x' && event.key !== 'X') return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (!activeRegionAtPlayhead) return;
      event.preventDefault();
      handleRegionToggle(activeRegionAtPlayhead.id);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [analysisComplete, activeRegionAtPlayhead, handleRegionToggle]);

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
              position: relative;
              padding: 8px 12px 10px 12px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .silence-timeline-toolbar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              min-height: 28px;
            }
            .silence-timeline-zoom {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .silence-timeline-zoom-btn {
              background: #2f2f2f;
              border: 1px solid #4b4b4b;
              color: #ddd;
              min-width: 28px;
              height: 24px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
              line-height: 1;
            }
            .silence-timeline-zoom-btn:hover {
              background: #3a3a3a;
            }
            .silence-timeline-zoom-range {
              width: 140px;
            }
            .silence-timeline-zoom-text {
              color: #b7c6d5;
              font-size: 12px;
              min-width: 44px;
            }
            .silence-timeline-legend {
              display: flex;
              align-items: center;
              gap: 10px;
              color: #b7c6d5;
              font-size: 11px;
            }
            .legend-item {
              display: flex;
              align-items: center;
              gap: 5px;
              white-space: nowrap;
            }
            .legend-swatch {
              width: 14px;
              height: 8px;
              border-radius: 2px;
              border: 1px solid rgba(255, 255, 255, 0.35);
            }
            .legend-swatch.cut {
              background: rgba(255, 59, 59, 0.45);
              border-color: #ff6b6b;
            }
            .legend-swatch.keep {
              background: rgba(56, 211, 110, 0.32);
              border-color: #4ade80;
            }
            .legend-swatch.too-short {
              background:
                repeating-linear-gradient(
                  135deg,
                  rgba(150, 150, 150, 0.35) 0px,
                  rgba(150, 150, 150, 0.35) 2px,
                  rgba(90, 90, 90, 0.35) 2px,
                  rgba(90, 90, 90, 0.35) 4px
                );
              border-color: #9a9a9a;
            }
            .silence-timeline-scroll {
              flex: 1;
              min-height: 0;
              overflow-x: auto;
              overflow-y: hidden;
            }
            .silence-waveform-stack {
              position: relative;
              width: 100px;
              height: 100%;
            }
            .waveform-fallback-bg {
              width: 100%;
              height: 100%;
              background:
                linear-gradient(180deg, rgba(76, 194, 255, 0.18), rgba(76, 194, 255, 0.05)),
                repeating-linear-gradient(
                  90deg,
                  rgba(255, 255, 255, 0.07) 0px,
                  rgba(255, 255, 255, 0.07) 1px,
                  transparent 1px,
                  transparent 12px
                );
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .waveform-fallback-label {
              font-size: 13px;
              color: #b6c7d4;
              background: rgba(0, 0, 0, 0.45);
              border: 1px solid #3b4d5a;
              border-radius: 6px;
              padding: 6px 10px;
            }
            .waveform-pending {
              color: #8ea1af;
              font-size: 13px;
            }
            .silence-waveform-help {
              position: absolute;
              right: 10px;
              top: 8px;
              z-index: 3;
              font-size: 11px;
              color: #aaa;
              background: rgba(0, 0, 0, 0.45);
              border: 1px solid #3a3a3a;
              border-radius: 4px;
              padding: 3px 6px;
              pointer-events: none;
            }
            .timeline-empty-state {
              width: 100%;
              height: 100%;
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
            .analysis-progress {
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px 12px;
              border: 1px solid #3f3f3f;
              border-radius: 6px;
              background: #232323;
            }
            .analysis-progress-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              font-size: 13px;
              color: #d0d0d0;
            }
            .analysis-progress-track {
              width: 100%;
              height: 8px;
              background: #111;
              border: 1px solid #3a3a3a;
              border-radius: 999px;
              overflow: hidden;
            }
            .analysis-progress-fill {
              height: 100%;
              width: 0%;
              background: linear-gradient(90deg, #1f9bff, #46c2ff);
              transition: width 180ms ease-out;
            }
            .analysis-progress-note {
              font-size: 12px;
              color: #9a9a9a;
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
            .selection-actions {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .selection-action-btn {
              background: #252525;
              border: 1px solid #4a4a4a;
              color: #ddd;
              border-radius: 4px;
              padding: 7px 10px;
              font-size: 12px;
              cursor: pointer;
            }
            .selection-action-btn:hover:not(:disabled) {
              background: #2f2f2f;
            }
            .selection-action-btn:disabled {
              opacity: 0.55;
              cursor: not-allowed;
            }
            .selection-summary {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              gap: 10px;
              color: #aeb8c2;
              font-size: 12px;
            }
            .region-list {
              border: 1px solid #3f3f3f;
              border-radius: 6px;
              max-height: 230px;
              overflow-y: auto;
              background: #1f1f1f;
            }
            .region-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              padding: 8px 10px;
              border-bottom: 1px solid #2f2f2f;
              cursor: pointer;
            }
            .region-row:last-child {
              border-bottom: none;
            }
            .region-row.active {
              outline: 1px solid #5aa4ff;
              outline-offset: -1px;
            }
            .region-row.cut {
              background: rgba(255, 59, 59, 0.1);
            }
            .region-row.keep {
              background: rgba(56, 211, 110, 0.08);
            }
            .region-row-main {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              gap: 8px;
              min-width: 0;
            }
            .region-row-index {
              color: #9fb0bf;
              font-size: 12px;
              min-width: 30px;
            }
            .region-row-times {
              color: #f0f4f8;
              font-size: 12px;
              font-weight: 600;
              white-space: nowrap;
            }
            .region-row-meta {
              color: #9fb0bf;
              font-size: 11px;
              white-space: nowrap;
            }
            .region-toggle-btn {
              border: 1px solid #4a4a4a;
              border-radius: 999px;
              padding: 5px 10px;
              font-size: 11px;
              line-height: 1;
              cursor: pointer;
            }
            .region-toggle-btn.cut {
              background: rgba(255, 59, 59, 0.22);
              border-color: #ff6b6b;
              color: #ffd5d5;
            }
            .region-toggle-btn.keep {
              background: rgba(56, 211, 110, 0.22);
              border-color: #4ade80;
              color: #d8ffe3;
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
              .selection-summary {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
              }
            }
          `}</style>

          {/* Header */}
          <div className="silence-dialog-header" data-testid="silence-dialog-header">
            <div className="silence-dialog-header-left">
              <button className="silence-dialog-back-btn" aria-label="Back" onClick={onClose}>
                Back
              </button>
              <DialogTitle className="silence-dialog-title">
                Silence Detection
              </DialogTitle>
            </div>
            <button className="silence-dialog-close-btn" aria-label="Close" data-testid="silence-dialog-close" onClick={onClose}>
              X
            </button>
          </div>

          {/* Main Content: Preview (left) + Settings (right) */}
          <div className="silence-dialog-main">
            <div className="silence-dialog-preview" data-testid="silence-dialog-preview">
              <div className="preview-container">
                {previewUrl ? (
                  <>
                    <PreviewPlayer
                      currentTime={toSafeTime(playbackTime, 0)}
                      duration={duration}
                      isPlaying={isPlaying}
                      onTimeChange={handleTimeChange}
                      onPlayPause={handlePlayPause}
                      onStop={handleStop}
                      previewVideoUrl={previewUrl}
                      activeClip={activeClip}
                      allowSeekingWhilePlaying={true}
                      skipSilencePreview={skipSilenceEnabled}
                      skipRanges={timelineSkipRanges}
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
                  <div className="preview-placeholder" data-testid="preview-placeholder">
                    {analysisComplete
                      ? 'No playable preview source was found for the analyzed track'
                      : 'Select a track with clips to preview'}
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
                      max="-10"
                      step="1"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      disabled={isAnalyzing}
                      className="slider"
                      data-testid="threshold-slider"
                    />
                    <span className="slider-endpoint">-10</span>
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
                  <h4 className="track-selection-heading">Tracks</h4>
                  {audioTracks.length === 0 ? (
                    <div className="track-empty-state">
                      No tracks with audio clips found
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
                    ? getAnalysisStageLabel(analysisStage)
                    : 'Analyze'}
                </button>

                {isAnalyzing && (
                  <div className="analysis-progress" data-testid="analysis-progress">
                    <div className="analysis-progress-header">
                      <span>{analysisProgressLabel || getAnalysisStageLabel(analysisStage)}</span>
                      <span>{analysisProgressPct}%</span>
                    </div>
                    <div
                      className="analysis-progress-track"
                      role="progressbar"
                      aria-label="Analysis progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={analysisProgressPct}
                    >
                      <div
                        className="analysis-progress-fill"
                        style={{ width: `${analysisProgressPct}%` }}
                      />
                    </div>
                    <div className="analysis-progress-note">
                      Processing may take a while for longer videos.
                    </div>
                  </div>
                )}

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
                    <div className="selection-actions" data-testid="selection-actions">
                      <button type="button" className="selection-action-btn" onClick={handleSelectAllCut}>
                        Cut All
                      </button>
                      <button type="button" className="selection-action-btn" onClick={handleSelectAllKeep}>
                        Keep All
                      </button>
                      <button type="button" className="selection-action-btn" onClick={handleInvertSelection}>
                        Invert
                      </button>
                      <button
                        type="button"
                        className="selection-action-btn"
                        onClick={handleToggleCurrentRegion}
                        disabled={!activeRegionAtPlayhead}
                        title={activeRegionAtPlayhead ? 'Toggle region at playhead (shortcut: X)' : 'Move playhead into a region first'}
                      >
                        Toggle at Playhead (X)
                      </button>
                    </div>
                    <div className="selection-summary">
                      <span>Cut: {selectedRegionCount}</span>
                      <span>Keep: {keepRegionCount}</span>
                      <span>
                        Playhead:{' '}
                        {activeRegionAtPlayhead
                          ? `${formatTime(activeRegionAtPlayhead.adjustedStartTime)}-${formatTime(activeRegionAtPlayhead.adjustedEndTime)}`
                          : 'Outside silence region'}
                      </span>
                    </div>
                    {editableRegions.length > 0 && (
                      <div className="region-list" data-testid="region-list">
                        {editableRegions.map((region, index) => {
                          const isActive = activeRegionId === region.id;
                          return (
                            <div
                              key={region.id}
                              className={`region-row ${region.selected ? 'cut' : 'keep'} ${isActive ? 'active' : ''}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleWaveformSeek(region.adjustedStartTime)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleWaveformSeek(region.adjustedStartTime);
                                }
                              }}
                              title="Click row to seek to this range"
                            >
                              <div className="region-row-main">
                                <div className="region-row-index">#{index + 1}</div>
                                <div className="region-row-times">
                                  {formatTime(region.adjustedStartTime)} - {formatTime(region.adjustedEndTime)}
                                </div>
                                <div className="region-row-meta">
                                  {formatTime(region.adjustedDuration)} | {region.averageDb.toFixed(1)} dB
                                </div>
                              </div>
                              <button
                                type="button"
                                className={`region-toggle-btn ${region.selected ? 'cut' : 'keep'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRegionToggle(region.id);
                                }}
                              >
                                {region.selected ? 'Cut' : 'Keep'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
          <div
            className="silence-dialog-timeline"
            data-testid="silence-dialog-timeline"
          >
            <div className="silence-timeline-toolbar">
              <div className="silence-timeline-zoom">
                <button
                  className="silence-timeline-zoom-btn"
                  type="button"
                  aria-label="Zoom out waveform"
                  onClick={() => setTimelineZoom((prev) => Math.max(100, prev - 25))}
                >
                  -
                </button>
                <input
                  className="silence-timeline-zoom-range"
                  type="range"
                  min="100"
                  max="600"
                  step="25"
                  value={timelineZoom}
                  onChange={(e) => setTimelineZoom(Number(e.target.value))}
                  aria-label="Waveform zoom"
                />
                <button
                  className="silence-timeline-zoom-btn"
                  type="button"
                  aria-label="Zoom in waveform"
                  onClick={() => setTimelineZoom((prev) => Math.min(600, prev + 25))}
                >
                  +
                </button>
                <span className="silence-timeline-zoom-text">{timelineZoom}%</span>
              </div>
              <div className="silence-timeline-legend">
                <div className="legend-item">
                  <span className="legend-swatch cut" />
                  <span>Cut/Skip</span>
                </div>
                <div className="legend-item">
                  <span className="legend-swatch keep" />
                  <span>Keep</span>
                </div>
                <div className="legend-item">
                  <span className="legend-swatch too-short" />
                  <span>Too Short</span>
                </div>
                <div className="legend-item">
                  <span>Drag to add cut range</span>
                </div>
              </div>
            </div>
            <div className="silence-timeline-scroll" ref={timelineViewportRef}>
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
              <div className="timeline-empty-state waveform-error" data-testid="waveform-error">
                Waveform unavailable
              </div>
            )}
            {!waveformLoading && !waveformError && !timelineReady && (
              <div className="timeline-empty-state waveform-pending" data-testid="waveform-pending">
                Preparing waveform viewport...
              </div>
            )}
            {!waveformLoading && !waveformError && timelineReady ? (
              <div
                className="silence-waveform-stack"
                style={{ width: `${timelineContentWidth}px` }}
              >
                {hasWaveform ? (
                  <WaveformCanvas
                    waveformData={waveformData}
                    width={timelineContentWidth}
                    height={timelineViewportSize.height}
                    color="#4cc2ff"
                  />
                ) : (
                  <div className="waveform-fallback-bg">
                    <div className="waveform-fallback-label">No waveform data from source</div>
                  </div>
                )}
                <SilenceWaveformOverlay
                  currentTime={playbackTime}
                  onSeek={handleWaveformSeek}
                  onRegionClick={handleRegionToggle}
                  onRangeCreate={handleManualRangeCreate}
                  enableRangeSelection={true}
                  regions={regions}
                  duration={effectiveTimelineDuration}
                  width={timelineContentWidth}
                  height={timelineViewportSize.height}
                  isPlaying={isPlaying}
                />
                <div className="silence-waveform-help">
                  {hasWaveform
                    ? 'Click segment = toggle Cut/Keep, drag = add manual cut range'
                    : 'Waveform unavailable: showing silence map only'}
                </div>
              </div>
            ) : null}
            </div>
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
                Also apply to overlay &amp; text tracks
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
