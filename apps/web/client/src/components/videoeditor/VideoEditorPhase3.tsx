/**
 * Video Editor Main Component - Phase 3
 * Complete editor with UX improvements and aspect ratio selector
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MediaLibraryPanel from './MediaLibraryPanel';
import Timeline from './Timeline';
import PreviewPlayer, { type ActiveClipInfo } from './PreviewPlayer';
import Toolbar from './Toolbar';
import ExportDialog from './ExportDialog';
import RenderProgressDialog from './RenderProgressDialog';
import AudioDuckingPanel from './AudioDuckingPanel';
import AspectRatioSelector from './AspectRatioSelector';
import ErrorBoundary from './ErrorBoundary';
import ConfirmDialog, { type ConfirmDialogProps } from './ConfirmDialog';
import KeyboardShortcutsOverlay from './KeyboardShortcutsOverlay';
import HistoryPanel from './HistoryPanel';
import TransitionsPanel from './TransitionsPanel';
import OverlayPanel from './OverlayPanel';
import SilenceDetectionPanel from './SilenceDetectionPanel';
import TextClipEditor from './TextClipEditor';
import { projectManager } from '../../services/projectManager';
import { videoEditorRenderService, videoEditorMediaLibrary } from '../../services/videoEditorService';
import ToastContainer from './Toast';
import { useLocation } from 'wouter';
import { sanitizeProjectName } from '@smartspec/shared';
import { trpc } from '../../lib/trpc';
import {
  type VideoEditorProject,
  type MediaLibraryAsset,
  type Clip,
  type ExportSettings,
  type DuckingConfig,
  type ClipTransform,
  type TextConfig,
  type SilentRegion,
  createEmptyProject,
  generateId,
  addAssetToProject,
  addClipToTrack,
  findTrackByType,
  calculateProjectDuration,
  validateProject
} from '../../types/videoEditor';

export const VideoEditorPhase3: React.FC = () => {
  const [, setLocation] = useLocation();

  // Project state
  const [project, setProject] = useState<VideoEditorProject>(() => createEmptyProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]); // Multi-select
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);
  const [rippleEditMode, setRippleEditMode] = useState(false);

  // History
  const [history, setHistory] = useState<VideoEditorProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);

  // Dialogs
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showRenderProgress, setShowRenderProgress] = useState(false);
  const [currentRenderJob, setCurrentRenderJob] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<Omit<ConfirmDialogProps, 'onConfirm' | 'onCancel'> | null>(null);
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null);

  // Sidebar view
  const [sidebarView, setSidebarView] = useState<'library' | 'ducking' | 'aspectRatio' | 'history' | 'transitions' | 'overlay' | 'silence' | 'text'>('library');

  // DB project persistence
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [showProjectList, setShowProjectList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const trpcUtils = trpc.useUtils();
  const projectListQuery = trpc.videoEditorProjects.list.useQuery(
    { limit: 50, offset: 0 },
    { enabled: showProjectList }
  );
  const saveMutation = trpc.videoEditorProjects.save.useMutation();
  const autoSaveMutation = trpc.videoEditorProjects.autoSave.useMutation();
  const deleteMutation = trpc.videoEditorProjects.delete.useMutation();

  // Save project to sessionStorage for error recovery
  useEffect(() => {
    sessionStorage.setItem('currentProject', JSON.stringify(project));
  }, [project]);

  // ========================================
  // History Management
  // ========================================

  const addToHistory = useCallback((newProject: VideoEditorProject) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const updated = [...trimmed, JSON.parse(JSON.stringify(newProject))].slice(-50);
      // Adjust historyIndex to match actual new length
      setHistoryIndex(updated.length - 1);
      return updated;
    });
    setIsDirty(true);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setProject(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setProject(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [history, historyIndex]);

  const jumpToHistory = useCallback((index: number) => {
    if (index >= 0 && index < history.length) {
      setHistoryIndex(index);
      setProject(JSON.parse(JSON.stringify(history[index])));
    }
  }, [history]);

  // ========================================
  // Project Management
  // ========================================

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const clipCount = project.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);
      const result = await saveMutation.mutateAsync({
        id: currentProjectId ?? undefined,
        name: project.name,
        projectData: project,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`,
        trackCount: project.timeline.tracks.length,
        clipCount,
      });
      setCurrentProjectId(result.id);
      setIsDirty(false);
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save to DB every 30s when dirty and project is saved
  useEffect(() => {
    if (!currentProjectId || !isDirty) return;
    const timer = setTimeout(() => {
      const clipCount = project.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);
      autoSaveMutation.mutate({
        id: currentProjectId,
        projectData: project,
        clipCount,
        duration: project.settings.duration,
      });
    }, 30000);
    return () => clearTimeout(timer);
  }, [currentProjectId, isDirty, project]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenProject = async (projectId: number) => {
    try {
      const loaded = await trpcUtils.videoEditorProjects.get.fetch({ id: projectId });
      if (!loaded) {
        alert('Project not found');
        return;
      }
      setProject(loaded.projectData as VideoEditorProject);
      setCurrentProjectId(loaded.id);
      setHistory([loaded.projectData as VideoEditorProject]);
      setHistoryIndex(0);
      setIsDirty(false);
      setCurrentTime(0);
      setSelectedClipId(null);
      setShowProjectList(false);
    } catch (error) {
      alert(`Failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm('Delete this project permanently?')) return;
    try {
      await deleteMutation.mutateAsync({ id: projectId });
      projectListQuery.refetch();
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }
    } catch (error) {
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleLoad = async () => {
    try {
      if (isDirty) {
        setConfirmDialog({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes. Loading a project will discard them. Continue?',
          confirmText: 'Load Anyway',
          cancelText: 'Cancel',
          type: 'warning',
          showUndoHint: false
        });
        setConfirmCallback(() => () => {
          setConfirmDialog(null);
          setConfirmCallback(null);
          loadProject();
        });
        return;
      }

      await loadProject();
    } catch (error) {
      console.error('Load failed:', error);
    }
  };

  const loadProject = async () => {
    try {
      const { project: loadedProject } = await projectManager.loadProject();
      setProject(loadedProject);
      setHistory([loadedProject]);
      setHistoryIndex(0);
      setIsDirty(false);
      setCurrentTime(0);
      setSelectedClipId(null);
      setCurrentProjectId(null);
      setConfirmDialog(null);
    } catch (error) {
      if (error instanceof Error && error.message === 'Load cancelled') return;
      console.error('Load failed:', error);
      alert(`Failed to load project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleBackToDashboard = () => {
    if (isDirty) {
      setConfirmDialog({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Leave without saving?',
        confirmText: 'Leave',
        cancelText: 'Stay',
        type: 'warning',
        showUndoHint: false
      });
      setConfirmCallback(() => () => {
        setConfirmDialog(null);
        setConfirmCallback(null);
        setLocation('/dashboard');
      });
      return;
    }
    setLocation('/dashboard');
  };

  const handleExportClick = () => {
    // Validate project first
    const validation = validateProject(project);
    if (!validation.valid) {
      alert(`Cannot export:\n${validation.errors.join('\n')}`);
      return;
    }

    setShowExportDialog(true);
  };

  const handleExport = async (outputPath: string, settings: ExportSettings) => {
    try {
      setShowExportDialog(false);

      // Update project export settings
      project.export = settings;

      // Create a copy excluding clips from hidden tracks for render
      const renderProject = JSON.parse(JSON.stringify(project));
      renderProject.timeline.tracks = renderProject.timeline.tracks.map((track: any) => ({
        ...track,
        clips: track.visible === false ? [] : track.clips,
      }));

      // Convert project to JSON for render
      const projectJson = JSON.stringify(renderProject);

      // Start render job
      const jobId = await videoEditorRenderService.startRender(projectJson, outputPath);

      setCurrentRenderJob(jobId);
      setShowRenderProgress(true);
      showToast('Render job submitted. Track progress here or in Task Queue.', 'info', 4000);
    } catch (error) {
      alert(`Failed to start export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRenderComplete = (outputPath: string) => {
    setShowRenderProgress(false);
    setCurrentRenderJob(null);
    showToast('Export complete! Video is ready to download.', 'success', 5000);

    // Trigger media library refresh
    if (sidebarView === 'library') {
      setSidebarView('history');
      setTimeout(() => setSidebarView('library'), 100);
    }
  };

  const handleRenderCancel = () => {
    setShowRenderProgress(false);
    setCurrentRenderJob(null);
  };

  // ========================================
  // Timeline Interactions
  // ========================================

  const handleAddToTimeline = (asset: MediaLibraryAsset, localPath: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      const newAsset = addAssetToProject(newProject, asset, localPath);
      const track = findTrackByType(newProject.timeline, asset.type);

      if (!track) {
        alert(`No available ${asset.type} track found`);
        return prevProject;
      }

      const lastClip = track.clips[track.clips.length - 1];
      const startTime = lastClip ? lastClip.startTime + lastClip.duration : 0;

      addClipToTrack(track, newAsset, startTime);

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  };

  const handleDropAsset = useCallback(async (asset: MediaLibraryAsset, trackId: string, startTime: number) => {
    try {
      // Validate track type before downloading
      const targetTrack = project.timeline.tracks.find(t => t.id === trackId);
      if (!targetTrack) return;

      // Type restrictions: video/image assets -> video/overlay tracks, audio -> audio track
      if (asset.type === 'video' && targetTrack.type === 'audio') return;
      if (asset.type === 'video' && targetTrack.type === 'text') return;
      if (asset.type === 'image' && (targetTrack.type === 'audio' || targetTrack.type === 'text')) return;
      if (asset.type === 'audio' && (targetTrack.type === 'video' || targetTrack.type === 'overlay' || targetTrack.type === 'text')) return;

      const localPath = await videoEditorMediaLibrary.downloadToWorkspace(asset);
      try {
        const fileInfo = await videoEditorMediaLibrary.probeMediaFile(localPath);
        asset.duration = fileInfo.duration;
        if (fileInfo.width && fileInfo.height) {
          asset.resolution = `${fileInfo.width}x${fileInfo.height}`;
        }
      } catch { /* non-fatal */ }

      setProject(prevProject => {
        const newProject = JSON.parse(JSON.stringify(prevProject));
        const newAsset = addAssetToProject(newProject, asset, localPath);
        const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
        if (!track) return prevProject;
        addClipToTrack(track, newAsset, startTime);
        newProject.settings.duration = calculateProjectDuration(newProject.timeline);
        newProject.modifiedAt = new Date().toISOString();
        addToHistory(newProject);
        return newProject;
      });
    } catch (err) {
      console.error('Drop failed:', err);
    }
  }, [addToHistory, project.timeline.tracks]);

  const handleClipMove = useCallback((clipId: string, newStartTime: number, newTrackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find the clip and its source track type
      let clip: Clip | null = null;
      let sourceTrackType: string = '';
      for (const track of newProject.timeline.tracks) {
        const index = track.clips.findIndex((c: Clip) => c.id === clipId);
        if (index !== -1) {
          clip = track.clips.splice(index, 1)[0];
          sourceTrackType = track.type;
          break;
        }
      }

      if (!clip) return prevProject;

      const newTrack = newProject.timeline.tracks.find((t: any) => t.id === newTrackId);
      if (!newTrack) return prevProject;

      // Track type restrictions:
      // - Text clips can only go on text tracks
      // - Video/image clips cannot go on audio tracks
      // - Audio clips cannot go on video/overlay/text tracks
      const isTextClip = !!clip.textConfig;
      const clipMediaType = isTextClip ? 'text' : sourceTrackType;

      if (isTextClip && newTrack.type !== 'text') {
        // Text clips can only go to T1
        newTrack.clips.length; // no-op, put clip back
        const origTrack = newProject.timeline.tracks.find((t: any) => t.type === 'text');
        if (origTrack) {
          clip.trackId = origTrack.id;
          origTrack.clips.push(clip);
          origTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
        }
        return prevProject;
      }
      if ((clipMediaType === 'video' || clipMediaType === 'overlay') && newTrack.type === 'audio') {
        // Video clips can't go on audio track — revert
        const origTrack = newProject.timeline.tracks.find((t: any) => t.type === sourceTrackType);
        if (origTrack) {
          origTrack.clips.push(clip);
          origTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
        }
        return prevProject;
      }
      if (clipMediaType === 'audio' && (newTrack.type === 'video' || newTrack.type === 'overlay' || newTrack.type === 'text')) {
        // Audio clips can't go on video/overlay/text tracks — revert
        const origTrack = newProject.timeline.tracks.find((t: any) => t.type === 'audio');
        if (origTrack) {
          origTrack.clips.push(clip);
          origTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
        }
        return prevProject;
      }

      // Auto-snap on all tracks: snap to end/start of nearest clip
      const otherClips = newTrack.clips.filter((c: Clip) => c.id !== clip!.id);
      otherClips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

      let snapped = newStartTime;
      const SNAP_SECONDS = 0.3;

      // Snap to end of each existing clip
      for (const other of otherClips) {
        const otherEnd = other.startTime + other.duration;
        if (Math.abs(newStartTime - otherEnd) < SNAP_SECONDS) {
          snapped = otherEnd;
          break;
        }
        if (Math.abs(newStartTime - other.startTime) < SNAP_SECONDS) {
          snapped = other.startTime;
          break;
        }
      }
      // Snap to timeline start
      if (newStartTime < SNAP_SECONDS) {
        snapped = 0;
      }

      // Overlap prevention: check if placing clip at snapped position would overlap
      const clipEnd = snapped + clip.duration;
      const hasOverlap = otherClips.some((other: Clip) => {
        const otherEnd = other.startTime + other.duration;
        return snapped < otherEnd && clipEnd > other.startTime;
      });

      if (hasOverlap) {
        // Find the nearest non-overlapping position
        // Try inserting after each clip
        let bestPos = snapped;
        let found = false;

        // Try placing at end of each clip
        for (const other of otherClips) {
          const candidateStart = other.startTime + other.duration;
          const candidateEnd = candidateStart + clip.duration;
          const wouldOverlap = otherClips.some((o: Clip) => {
            if (o.id === other.id) return false;
            const oEnd = o.startTime + o.duration;
            return candidateStart < oEnd && candidateEnd > o.startTime;
          });
          if (!wouldOverlap) {
            // Pick the closest available slot
            if (!found || Math.abs(candidateStart - newStartTime) < Math.abs(bestPos - newStartTime)) {
              bestPos = candidateStart;
              found = true;
            }
          }
        }

        // Also try placing at 0
        if (otherClips.length === 0 || otherClips[0].startTime >= clip.duration) {
          if (!found || Math.abs(0 - newStartTime) < Math.abs(bestPos - newStartTime)) {
            bestPos = 0;
            found = true;
          }
        }

        snapped = found ? bestPos : snapped;
      }

      clip.startTime = Math.max(0, snapped);
      clip.trackId = newTrackId;
      newTrack.clips.push(clip);
      newTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  const handleClipResize = useCallback((clipId: string, newDuration: number, newTrimIn: number) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      for (const track of newProject.timeline.tracks) {
        const clip = track.clips.find((c: Clip) => c.id === clipId);
        if (clip) {
          // If trimIn changed, adjust startTime to keep the clip anchored visually
          const trimDelta = newTrimIn - clip.trimIn;
          if (Math.abs(trimDelta) > 0.001) {
            clip.startTime = Math.max(0, clip.startTime + trimDelta);
          }
          clip.duration = newDuration;
          clip.trimIn = newTrimIn;
          clip.trimOut = newTrimIn + newDuration;
          break;
        }
      }

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      // Don't add to history on every resize frame — just update the project
      return newProject;
    });
  }, []);

  const handleClipDelete = useCallback((clipId: string) => {
    const clipCount = selectedClipIds.length > 0 ? selectedClipIds.length : 1;
    setConfirmDialog({
      title: 'Delete Clip',
      message: `Are you sure you want to delete ${clipCount} clip${clipCount > 1 ? 's' : ''}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      showUndoHint: true
    });
  }, [selectedClipIds.length]);

  const confirmClipDelete = (clipId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Delete all selected clips or single clip
      const clipsToDelete = selectedClipIds.length > 0 ? selectedClipIds : [clipId];

      for (const track of newProject.timeline.tracks) {
        track.clips = track.clips.filter((c: Clip) => !clipsToDelete.includes(c.id));
      }

      // Handle ripple edit mode - close gaps after deletion
      if (rippleEditMode) {
        for (const track of newProject.timeline.tracks) {
          let currentTime = 0;
          track.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

          track.clips.forEach((clip: Clip) => {
            clip.startTime = currentTime;
            currentTime += clip.duration;
          });
        }
      }

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      setSelectedClipId(null);
      setSelectedClipIds([]);
      return newProject;
    });
    setConfirmDialog(null);
  };

  // ========================================
  // Audio Ducking
  // ========================================

  const handleDuckingChange = (ducking: DuckingConfig) => {
    setProject(prevProject => {
      const newProject = { ...prevProject };
      newProject.audioMixing.ducking = ducking;
      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  };

  // ========================================
  // Clip Transitions
  // ========================================

  const handleTransitionsChange = useCallback((clipId: string, transitions: { fadeIn?: number; fadeOut?: number }) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find and update the clip
      for (const track of newProject.timeline.tracks) {
        const clip = track.clips.find((c: Clip) => c.id === clipId);
        if (clip) {
          clip.transitions = transitions;
          break;
        }
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  // ========================================
  // Overlay Transform
  // ========================================

  const handleTransformChange = useCallback((clipId: string, transform: ClipTransform) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find and update the clip
      for (const track of newProject.timeline.tracks) {
        const clip = track.clips.find((c: Clip) => c.id === clipId);
        if (clip) {
          clip.transform = transform;
          break;
        }
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  // ========================================
  // Silence Detection & Dead Air Removal
  // ========================================

  const handleCutAndCombine = useCallback((selectedRegions: SilentRegion[]) => {
    if (selectedRegions.length === 0) return;

    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Sort regions by start time (ascending)
      const sortedRegions = [...selectedRegions].sort((a, b) => a.startTime - b.startTime);

      // Process each affected track
      const affectedTrackIds = Array.from(new Set(sortedRegions.map(r => r.trackId)));

      for (const trackId of affectedTrackIds) {
        const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
        if (!track) continue;

        // Get silent regions for this track
        const trackRegions = sortedRegions.filter(r => r.trackId === trackId);

        // Split clips at region boundaries
        const newClips: Clip[] = [];

        for (const clip of track.clips) {
          const clipStart = clip.startTime;
          const clipEnd = clip.startTime + clip.duration;

          // Find overlapping silent regions
          const overlapping = trackRegions.filter(
            r => r.startTime < clipEnd && r.endTime > clipStart
          );

          if (overlapping.length === 0) {
            // No overlap, keep clip as is
            newClips.push(clip);
            continue;
          }

          // Split clip around silent regions
          let currentTime = clipStart;
          let trimInOffset = 0;

          for (const region of overlapping) {
            // Keep part before silent region
            if (currentTime < region.startTime) {
              const segmentDuration = region.startTime - currentTime;
              newClips.push({
                ...clip,
                id: generateId('clip'),
                startTime: currentTime,
                duration: segmentDuration,
                trimIn: clip.trimIn + trimInOffset,
                trimOut: clip.trimIn + trimInOffset + segmentDuration
              });
              trimInOffset += segmentDuration;
            }

            // Skip silent region
            const silentDuration = Math.min(region.endTime, clipEnd) - Math.max(region.startTime, clipStart);
            trimInOffset += silentDuration;
            currentTime = Math.min(region.endTime, clipEnd);
          }

          // Keep remaining part after last silent region
          if (currentTime < clipEnd) {
            const segmentDuration = clipEnd - currentTime;
            newClips.push({
              ...clip,
              id: generateId('clip'),
              startTime: currentTime,
              duration: segmentDuration,
              trimIn: clip.trimIn + trimInOffset,
              trimOut: clip.trimIn + trimInOffset + segmentDuration
            });
          }
        }

        track.clips = newClips;
      }

      // Now combine clips by removing gaps (ripple delete)
      for (const trackId of affectedTrackIds) {
        const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
        if (!track) continue;

        // Calculate total duration to remove
        const trackRegions = sortedRegions.filter(r => r.trackId === trackId);

        // Sort clips by start time
        track.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

        // Shift clips to close gaps
        let cumulativeOffset = 0;
        let currentTime = 0;

        for (let i = 0; i < track.clips.length; i++) {
          const clip = track.clips[i];

          // Calculate how much silence was removed before this clip
          const removedBefore = trackRegions
            .filter(r => r.endTime <= clip.startTime)
            .reduce((sum, r) => sum + r.duration, 0);

          // Update clip start time
          clip.startTime = currentTime;
          currentTime += clip.duration;
        }
      }

      // Update project duration
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);

      // Deselect clips
      setSelectedClipId(null);
      setSelectedClipIds([]);

      return newProject;
    });

    alert('Dead air removed and video combined successfully!');
  }, [addToHistory]);

  // ========================================
  // Text Clip Management
  // ========================================

  const handleAddTextClip = useCallback((textConfig: TextConfig, duration: number) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Create a virtual text asset
      const textAssetId = generateId('text-asset');
      newProject.assets[textAssetId] = {
        id: textAssetId,
        type: 'image',
        source: 'generated',
        path: '',
        filename: textConfig.text.slice(0, 20) || 'Text',
        format: 'text',
        duration,
      };

      // Find the T1 text track
      const textTrack = newProject.timeline.tracks.find((t: any) => t.type === 'text');
      if (!textTrack) return prevProject;

      // Place after last clip on T1
      const lastClip = textTrack.clips[textTrack.clips.length - 1];
      const startTime = lastClip ? lastClip.startTime + lastClip.duration : currentTime;

      const newClip: Clip = {
        id: generateId('clip'),
        assetId: textAssetId,
        trackId: textTrack.id,
        startTime,
        duration,
        trimIn: 0,
        trimOut: duration,
        volume: 0,
        speed: 1.0,
        effects: [],
        textConfig,
      };

      textTrack.clips.push(newClip);
      textTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });

    setSidebarView('library');
  }, [addToHistory, currentTime]);

  // ========================================
  // Compound Clips (Group/Ungroup)
  // ========================================

  const handleGroupClips = useCallback(() => {
    if (selectedClipIds.length < 2) return;

    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));
      const groupId = generateId('group');

      for (const track of newProject.timeline.tracks) {
        for (const clip of track.clips) {
          if (selectedClipIds.includes(clip.id)) {
            clip.groupId = groupId;
          }
        }
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [selectedClipIds, addToHistory]);

  const handleUngroupClips = useCallback(() => {
    if (selectedClipIds.length === 0) return;

    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find groupIds of selected clips
      const groupIds = new Set<string>();
      for (const track of newProject.timeline.tracks) {
        for (const clip of track.clips) {
          if (selectedClipIds.includes(clip.id) && clip.groupId) {
            groupIds.add(clip.groupId);
          }
        }
      }

      // Remove groupId from all clips in those groups
      for (const track of newProject.timeline.tracks) {
        for (const clip of track.clips) {
          if (clip.groupId && groupIds.has(clip.groupId)) {
            delete clip.groupId;
          }
        }
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [selectedClipIds, addToHistory]);

  // When selecting a clip that has a groupId, select all clips in the group
  const handleClipSelectWithGroup = useCallback((clipId: string, isMultiSelect: boolean) => {
    // Find if this clip belongs to a group
    let groupId: string | undefined;
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip?.groupId) {
        groupId = clip.groupId;
        break;
      }
    }

    if (groupId && !isMultiSelect) {
      // Select all clips in the group
      const groupClipIds: string[] = [];
      for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
          if (clip.groupId === groupId) {
            groupClipIds.push(clip.id);
          }
        }
      }
      setSelectedClipId(clipId);
      setSelectedClipIds(groupClipIds);
    } else if (isMultiSelect) {
      setSelectedClipIds(prev => prev.includes(clipId) ? prev.filter(id => id !== clipId) : [...prev, clipId]);
    } else {
      setSelectedClipId(clipId);
      setSelectedClipIds([]);
    }
  }, [project.timeline.tracks]);

  // ========================================
  // Track Controls
  // ========================================

  const handleTrackToggleLock = useCallback((trackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
      if (track) {
        track.locked = !track.locked;
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  const handleTrackToggleMute = useCallback((trackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
      if (track) {
        track.muted = !track.muted;
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  const handleTrackToggleVisible = useCallback((trackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      const track = newProject.timeline.tracks.find((t: any) => t.id === trackId);
      if (track) {
        track.visible = track.visible === false ? true : false;
      }

      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  // ========================================
  // Aspect Ratio
  // ========================================

  const handleResolutionChange = (width: number, height: number) => {
    setConfirmDialog({
      title: 'Change Resolution',
      message: `Change project resolution to ${width}×${height}? Existing clips will be scaled to fit.`,
      confirmText: 'Change Resolution',
      cancelText: 'Cancel',
      type: 'warning',
      showUndoHint: true
    });
  };

  const confirmResolutionChange = (width: number, height: number) => {
    setProject(prevProject => {
      const newProject = { ...prevProject };
      newProject.settings.width = width;
      newProject.settings.height = height;
      newProject.modifiedAt = new Date().toISOString();
      addToHistory(newProject);
      return newProject;
    });
    setConfirmDialog(null);
  };

  // ========================================
  // Active Clip for Preview
  // ========================================

  const activeClip = useMemo((): ActiveClipInfo | null => {
    // Search all visible video-capable tracks for a clip at currentTime
    // Priority: video > overlay (V1 first, then V2)
    const videoTracks = project.timeline.tracks.filter(
      t => (t.type === 'video' || t.type === 'overlay') && t.visible !== false
    );

    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          const asset = project.assets[clip.assetId];
          if (!asset || !asset.path) continue;
          return {
            videoUrl: asset.path,
            clipStartTime: clip.startTime,
            trimIn: clip.trimIn,
            clipDuration: clip.duration,
            isImage: asset.type === 'image',
          };
        }
      }
    }
    return null;
  }, [project.timeline.tracks, project.assets, currentTime]);

  // ========================================
  // Playback Controls
  // ========================================

  const handlePlayPause = () => setIsPlaying(!isPlaying);
  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };
  const handleTimeChange = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, project.settings.duration)));
  };

  // Timer-driven playback fallback: only ticks when no active video clip
  // (video clips drive time via PreviewPlayer's onTimeUpdate)
  useEffect(() => {
    if (!isPlaying) return;
    if (activeClip && !activeClip.isImage) return; // Video element is driving time (images use timer)

    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 1/30;
        if (next >= project.settings.duration) {
          setIsPlaying(false);
          return project.settings.duration;
        }
        return next;
      });
    }, 1000/30);

    return () => clearInterval(interval);
  }, [isPlaying, project.settings.duration, activeClip]);

  // ========================================
  // Keyboard Shortcuts
  // ========================================

  // Handle new project
  const handleNewProject = useCallback(() => {
    const createNew = () => {
      const newProject = createEmptyProject();
      setProject(newProject);
      setHistory([newProject]);
      setHistoryIndex(0);
      setIsDirty(false);
      setCurrentTime(0);
      setSelectedClipId(null);
      setCurrentProjectId(null);
      setConfirmDialog(null);
      setConfirmCallback(null);
    };

    if (isDirty) {
      setConfirmDialog({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Creating a new project will discard them. Continue?',
        confirmText: 'Create New',
        cancelText: 'Cancel',
        type: 'warning',
        showUndoHint: false
      });
      setConfirmCallback(() => createNew);
      return;
    }

    createNew();
  }, [isDirty]);

  // Handle duplicate clip
  const handleDuplicateClip = useCallback(() => {
    if (!selectedClipId) return;

    setProject(prevProject => {
      const newProject = { ...prevProject };

      // Find the selected clip
      for (const track of newProject.timeline.tracks) {
        const clipIndex = track.clips.findIndex(c => c.id === selectedClipId);
        if (clipIndex !== -1) {
          const originalClip = track.clips[clipIndex];

          // Create duplicate with new ID
          const duplicatedClip: Clip = {
            ...originalClip,
            id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            startTime: originalClip.startTime + originalClip.duration
          };

          // Insert after original
          track.clips.splice(clipIndex + 1, 0, duplicatedClip);

          // Select the new clip
          setSelectedClipId(duplicatedClip.id);

          // Update project duration
          newProject.settings.duration = calculateProjectDuration(newProject.timeline);
          newProject.modifiedAt = new Date().toISOString();

          addToHistory(newProject);
          break;
        }
      }

      return newProject;
    });
  }, [selectedClipId, addToHistory]);

  // Handle split clip at playhead
  const handleSplitClip = useCallback(() => {
    if (!selectedClipId) return;

    setProject(prevProject => {
      const newProject = { ...prevProject };

      // Find the selected clip
      for (const track of newProject.timeline.tracks) {
        const clipIndex = track.clips.findIndex(c => c.id === selectedClipId);
        if (clipIndex !== -1) {
          const originalClip = track.clips[clipIndex];

          // Check if playhead is within the clip
          const clipEndTime = originalClip.startTime + originalClip.duration;
          if (currentTime <= originalClip.startTime || currentTime >= clipEndTime) {
            alert('Playhead must be within the selected clip to split');
            return prevProject;
          }

          // Calculate split position relative to clip start
          const splitOffset = currentTime - originalClip.startTime;

          // Create first part (before split)
          const firstClip: Clip = {
            ...originalClip,
            duration: splitOffset,
            trimOut: originalClip.trimOut + (originalClip.duration - splitOffset)
          };

          // Create second part (after split)
          const secondClip: Clip = {
            ...originalClip,
            id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            startTime: currentTime,
            duration: originalClip.duration - splitOffset,
            trimIn: originalClip.trimIn + splitOffset,
            trimOut: originalClip.trimOut
          };

          // Replace original clip with the two new clips
          track.clips.splice(clipIndex, 1, firstClip, secondClip);

          // Select the second clip
          setSelectedClipId(secondClip.id);

          // Update project
          newProject.modifiedAt = new Date().toISOString();
          addToHistory(newProject);
          break;
        }
      }

      return newProject;
    });
  }, [selectedClipId, currentTime, addToHistory]);

  // Handle copy clip
  const handleCopyClip = useCallback(() => {
    if (!selectedClipId) return;

    // Find the selected clip
    for (const track of project.timeline.tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip) {
        // Store a deep copy in clipboard
        setClipboardClip(JSON.parse(JSON.stringify(clip)));
        console.log('Copied clip:', clip.id);
        break;
      }
    }
  }, [selectedClipId, project.timeline.tracks]);

  // Handle paste clip
  const handlePasteClip = useCallback(() => {
    if (!clipboardClip) return;

    setProject(prevProject => {
      const newProject = { ...prevProject };

      // Find the track that matches the clipboard clip's type
      const targetTrack = newProject.timeline.tracks.find(t => t.id === clipboardClip.trackId);
      if (!targetTrack) {
        alert('Cannot paste: target track not found');
        return prevProject;
      }

      // Create new clip at playhead position
      const pastedClip: Clip = {
        ...clipboardClip,
        id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startTime: currentTime
      };

      // Add to track and sort by start time
      targetTrack.clips.push(pastedClip);
      targetTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);

      // Select the new clip
      setSelectedClipId(pastedClip.id);

      // Update project
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      console.log('Pasted clip at:', currentTime);

      return newProject;
    });
  }, [clipboardClip, currentTime, addToHistory]);

  // Handle zoom in/out
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.2, 200)); // Max zoom: 200px per second
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.2, 10)); // Min zoom: 10px per second
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(50); // Default zoom
  }, []);

  // Handle multi-clip selection
  const handleClipSelect = useCallback((clipId: string, isMultiSelect: boolean) => {
    if (isMultiSelect) {
      // Toggle selection with Shift/Ctrl
      setSelectedClipIds(prev => {
        if (prev.includes(clipId)) {
          return prev.filter(id => id !== clipId);
        } else {
          return [...prev, clipId];
        }
      });
    } else {
      // Single selection
      setSelectedClipId(clipId);
      setSelectedClipIds([]);
    }
  }, []);

  // Select all clips
  const handleSelectAll = useCallback(() => {
    const allClipIds = project.timeline.tracks.flatMap(track => track.clips.map(clip => clip.id));
    setSelectedClipIds(allClipIds);
    setSelectedClipId(null);
  }, [project.timeline.tracks]);

  // Deselect all
  const handleDeselectAll = useCallback(() => {
    setSelectedClipIds([]);
    setSelectedClipId(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+N: New Project
      else if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleNewProject();
      }
      // Ctrl+A: Select All
      else if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
      // Escape: Deselect All
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleDeselectAll();
      }
      // Ctrl+D: Duplicate Clip
      else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        handleDuplicateClip();
      }
      // Ctrl+B: Split Clip
      else if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        handleSplitClip();
      }
      // Ctrl+C: Copy Clip
      else if (e.ctrlKey && e.key === 'c' && selectedClipId) {
        e.preventDefault();
        handleCopyClip();
      }
      // Ctrl+V: Paste Clip
      else if (e.ctrlKey && e.key === 'v' && clipboardClip) {
        e.preventDefault();
        handlePasteClip();
      }
      // Ctrl+= or Ctrl+Plus: Zoom In
      else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      }
      // Ctrl+- or Ctrl+Minus: Zoom Out
      else if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
      }
      // Ctrl+0: Reset Zoom
      else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
      // Ctrl+Z: Undo
      else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z: Redo
      else if (e.ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
    };

    // Handle wheel zoom (Ctrl+Scroll)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [undo, redo, handleNewProject, handleDuplicateClip, handleSplitClip, handleCopyClip, handlePasteClip, handleZoomIn, handleZoomOut, handleResetZoom, handleSelectAll, handleDeselectAll, selectedClipId, clipboardClip]);

  // Auto-save
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      projectManager.autoSave(project);
    }, 30000);

    return () => clearTimeout(timer);
  }, [project, isDirty]);

  // Initialize history
  useEffect(() => {
    if (history.length === 0) {
      setHistory([project]);
      setHistoryIndex(0);
    }
  }, []);

  // Handle confirm dialog actions
  const handleConfirmDialogConfirm = () => {
    if (confirmCallback) {
      confirmCallback();
    } else if (confirmDialog?.title === 'Unsaved Changes') {
      loadProject();
    } else if (confirmDialog?.title === 'Delete Clip' && selectedClipId) {
      confirmClipDelete(selectedClipId);
    } else if (confirmDialog?.title === 'Change Resolution') {
      // Extract width/height from message
      const match = confirmDialog.message.match(/(\d+)×(\d+)/);
      if (match) {
        confirmResolutionChange(parseInt(match[1]), parseInt(match[2]));
      }
    }
  };

  const handleConfirmDialogCancel = () => {
    setConfirmDialog(null);
    setConfirmCallback(null);
  };

  return (
    <ErrorBoundary onReset={() => window.location.reload()}>
      <div className="video-editor-phase3">
        <style>{`
          .video-editor-phase3 {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: #1a1a1a;
            color: #e0e0e0;
          }

          .editor-header {
            padding: 8px 16px;
            background: #2a2a2a;
            border-bottom: 1px solid #444;
            display: flex;
            align-items: center;
            gap: 16px;
          }

          .project-title {
            font-size: 14px;
            font-weight: 600;
          }

          .header-spacer {
            flex: 1;
          }

          .header-button {
            padding: 6px 12px;
            background: #444;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
          }

          .header-button:hover {
            background: #555;
          }

          .editor-layout {
            flex: 1;
            display: flex;
            overflow: hidden;
          }

          .editor-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
          }

          .preview-container {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
          }

          .timeline-section {
            height: 300px;
            border-top: 1px solid #333;
            overflow: hidden;
          }

          .sidebar {
            width: 320px;
            border-left: 1px solid #333;
            display: flex;
            flex-direction: column;
          }

          .sidebar-tabs {
            display: flex;
            background: #2a2a2a;
            border-bottom: 1px solid #444;
          }

          .sidebar-tab {
            flex: 1;
            padding: 10px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: #888;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .sidebar-tab:hover {
            color: #e0e0e0;
          }

          .sidebar-tab.active {
            color: #0078d4;
            border-bottom-color: #0078d4;
          }

          .sidebar-content {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            flex-direction: column;
          }

          .ducking-container {
            padding: 12px;
            overflow-y: auto;
          }

          .aspect-ratio-container {
            padding: 12px;
            overflow-y: auto;
          }
        `}</style>

        {/* Header */}
        <div className="editor-header">
          <button className="header-button" onClick={handleBackToDashboard} title="Back to Dashboard">
            &#8592; Dashboard
          </button>
          <div className="project-title">&#127916; {sanitizeProjectName(project.name)}</div>
          {currentProjectId && <span style={{ fontSize: '10px', color: '#666', marginLeft: '4px' }}>#{currentProjectId}</span>}
          {isDirty && <span style={{ fontSize: '10px', color: '#ffa500', marginLeft: '4px' }}>unsaved</span>}
          <div className="header-spacer" />
          <button className="header-button" onClick={handleSave} disabled={isSaving} title="Save to cloud">
            {isSaving ? '...' : '\uD83D\uDCBE'} Save
          </button>
          <button className="header-button" onClick={() => { setShowProjectList(true); projectListQuery.refetch(); }} title="Open saved project">
            &#128194; Projects
          </button>
          <button className="header-button" onClick={handleLoad} title="Open from file">
            &#128196; File
          </button>
        </div>

        {/* Main Layout */}
        <div className="editor-layout">
          {/* Editor Main */}
          <div className="editor-main">
            <div className="preview-container">
              <PreviewPlayer
                currentTime={currentTime}
                duration={project.settings.duration}
                isPlaying={isPlaying}
                onTimeChange={handleTimeChange}
                onPlayPause={handlePlayPause}
                onStop={handleStop}
                activeClip={activeClip}
              />
            </div>

            {/* Toolbar — above timeline */}
            <Toolbar
              zoom={zoom}
              onZoomChange={setZoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleResetZoom}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={undo}
              onRedo={redo}
              onSave={handleSave}
              onExport={handleExportClick}
              isDirty={isDirty}
              rippleEditMode={rippleEditMode}
              onToggleRippleEdit={() => setRippleEditMode(prev => !prev)}
              selectedCount={selectedClipIds.length}
              onGroupClips={handleGroupClips}
              onUngroupClips={handleUngroupClips}
              onAddText={() => setSidebarView('text')}
            />

            {/* Active render banner */}
            {currentRenderJob && !showRenderProgress && (
              <div
                style={{
                  padding: '6px 16px',
                  background: 'linear-gradient(90deg, #0078d420, #00b29420)',
                  borderBottom: '1px solid #0078d4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#e0e0e0',
                }}
              >
                <span>Render in progress...</span>
                <span style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowRenderProgress(true)}
                    style={{ background: '#0078d4', border: 'none', color: 'white', padding: '2px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                  >
                    View Progress
                  </button>
                  <a
                    href="/tasks"
                    style={{ color: '#0078d4', textDecoration: 'underline', fontSize: '11px', lineHeight: '24px' }}
                  >
                    Task Queue
                  </a>
                </span>
              </div>
            )}

            <div className="timeline-section">
              <Timeline
                timeline={project.timeline}
                assets={project.assets}
                currentTime={currentTime}
                duration={project.settings.duration}
                zoom={zoom}
                onTimeChange={handleTimeChange}
                onClipSelect={handleClipSelectWithGroup}
                onClipMove={handleClipMove}
                onClipResize={handleClipResize}
                onClipDelete={handleClipDelete}
                selectedClipId={selectedClipId}
                selectedClipIds={selectedClipIds}
                onTrackToggleLock={handleTrackToggleLock}
                onTrackToggleMute={handleTrackToggleMute}
                onTrackToggleVisible={handleTrackToggleVisible}
                onDropAsset={handleDropAsset}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${sidebarView === 'library' ? 'active' : ''}`}
                onClick={() => setSidebarView('library')}
              >
                📚 Library
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'ducking' ? 'active' : ''}`}
                onClick={() => setSidebarView('ducking')}
              >
                🎚️ Audio
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'aspectRatio' ? 'active' : ''}`}
                onClick={() => setSidebarView('aspectRatio')}
              >
                📐 Ratio
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'history' ? 'active' : ''}`}
                onClick={() => setSidebarView('history')}
              >
                📜 History
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'transitions' ? 'active' : ''}`}
                onClick={() => setSidebarView('transitions')}
              >
                ✨ FX
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'overlay' ? 'active' : ''}`}
                onClick={() => setSidebarView('overlay')}
              >
                🎨 Overlay
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'silence' ? 'active' : ''}`}
                onClick={() => setSidebarView('silence')}
              >
                🔇 Silence
              </button>
              <button
                className={`sidebar-tab ${sidebarView === 'text' ? 'active' : ''}`}
                onClick={() => setSidebarView('text')}
              >
                🅃 Text
              </button>
            </div>

            <div className="sidebar-content">
              {sidebarView === 'library' && (
                <MediaLibraryPanel onAddToTimeline={handleAddToTimeline} />
              )}
              {sidebarView === 'ducking' && (
                <div className="ducking-container">
                  <AudioDuckingPanel
                    ducking={project.audioMixing.ducking}
                    tracks={project.timeline.tracks}
                    onDuckingChange={handleDuckingChange}
                  />
                </div>
              )}
              {sidebarView === 'aspectRatio' && (
                <div className="aspect-ratio-container">
                  <AspectRatioSelector
                    currentSettings={project.settings}
                    onResolutionChange={handleResolutionChange}
                  />
                </div>
              )}
              {sidebarView === 'history' && (
                <HistoryPanel
                  history={history}
                  currentIndex={historyIndex}
                  onJumpTo={jumpToHistory}
                  canUndo={historyIndex > 0}
                  canRedo={historyIndex < history.length - 1}
                  onUndo={undo}
                  onRedo={redo}
                />
              )}
              {sidebarView === 'transitions' && (
                <TransitionsPanel
                  selectedClip={selectedClipId ?
                    project.timeline.tracks
                      .flatMap(t => t.clips)
                      .find(c => c.id === selectedClipId) || null
                    : null
                  }
                  onTransitionsChange={handleTransitionsChange}
                />
              )}
              {sidebarView === 'overlay' && (
                <OverlayPanel
                  selectedClip={selectedClipId ?
                    project.timeline.tracks
                      .flatMap(t => t.clips)
                      .find(c => c.id === selectedClipId) || null
                    : null
                  }
                  onTransformChange={handleTransformChange}
                />
              )}
              {sidebarView === 'silence' && (
                <SilenceDetectionPanel
                  project={project}
                  onCutAndCombine={handleCutAndCombine}
                />
              )}
              {sidebarView === 'text' && (
                <TextClipEditor
                  onSave={handleAddTextClip}
                  onCancel={() => setSidebarView('library')}
                />
              )}
            </div>
          </div>
        </div>

        {/* Export Dialog */}
        {showExportDialog && (
          <ExportDialog
            project={project}
            onExport={handleExport}
            onCancel={() => setShowExportDialog(false)}
          />
        )}

        {/* Render Progress */}
        {showRenderProgress && currentRenderJob && (
          <RenderProgressDialog
            jobId={currentRenderJob}
            onComplete={handleRenderComplete}
            onCancel={handleRenderCancel}
          />
        )}

        {/* Confirm Dialog */}
        {confirmDialog && (
          <ConfirmDialog
            {...confirmDialog}
            onConfirm={handleConfirmDialogConfirm}
            onCancel={handleConfirmDialogCancel}
          />
        )}

        {/* Project List Modal */}
        {showProjectList && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }} onClick={() => setShowProjectList(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: '#2a2a2a', border: '1px solid #444', borderRadius: '8px',
              width: '600px', maxWidth: '90vw', maxHeight: '80vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #444',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#e0e0e0' }}>Saved Projects</span>
                <button onClick={() => setShowProjectList(false)} style={{
                  background: 'transparent', border: 'none', color: '#888',
                  fontSize: '20px', cursor: 'pointer',
                }}>&times;</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {projectListQuery.isLoading ? (
                  <div style={{ textAlign: 'center', color: '#888', padding: '24px' }}>Loading...</div>
                ) : !projectListQuery.data?.projects.length ? (
                  <div style={{ textAlign: 'center', color: '#888', padding: '24px' }}>
                    No saved projects yet. Click Save to store your first project.
                  </div>
                ) : (
                  projectListQuery.data.projects.map((p: any) => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: '6px', marginBottom: '4px',
                      background: currentProjectId === p.id ? '#0078d420' : '#1e1e1e',
                      border: `1px solid ${currentProjectId === p.id ? '#0078d4' : '#333'}`,
                      cursor: 'pointer',
                    }} onClick={() => handleOpenProject(p.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                          {p.isAutoSave && <span style={{ fontSize: '9px', color: '#ffa500', marginLeft: '6px' }}>auto-saved</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {p.clipCount || 0} clips &bull; {p.resolution || 'N/A'} &bull; {new Date(p.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }} style={{
                        background: 'transparent', border: '1px solid #444', borderRadius: '4px',
                        color: '#888', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', flexShrink: 0,
                      }} title="Delete project">
                        &#128465;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Overlay */}
        <KeyboardShortcutsOverlay />

        {/* Toast notifications */}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
};

export default VideoEditorPhase3;
