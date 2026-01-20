/**
 * Video Editor Main Component - Phase 3
 * Complete editor with UX improvements and aspect ratio selector
 */

import React, { useState, useEffect, useCallback } from 'react';
import MediaLibraryPanel from './MediaLibraryPanel';
import Timeline from './Timeline';
import PreviewPlayer from './PreviewPlayer';
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
import { projectManager } from '../../services/projectManager';
import { videoEditorRenderService } from '../../services/videoEditorService';
import { sanitizeProjectName } from '../../utils/security';
import {
  type VideoEditorProject,
  type MediaLibraryAsset,
  type Clip,
  type ExportSettings,
  type DuckingConfig,
  createEmptyProject,
  addAssetToProject,
  addClipToTrack,
  findTrackByType,
  calculateProjectDuration,
  validateProject
} from '../../types/videoEditor';

export const VideoEditorPhase3: React.FC = () => {
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
  const [sidebarView, setSidebarView] = useState<'library' | 'ducking' | 'aspectRatio' | 'history' | 'transitions'>('library');

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
      const updated = [...trimmed, JSON.parse(JSON.stringify(newProject))];
      return updated.slice(-50);
    });
    setHistoryIndex(prev => prev + 1);
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
    try {
      await projectManager.saveProject(project);
      setIsDirty(false);
      alert('Project saved successfully!');
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        return;
      }

      await loadProject();
    } catch (error) {
      console.error('Load failed:', error);
    }
  };

  const loadProject = async () => {
    const { project: loadedProject } = await projectManager.loadProject();
    setProject(loadedProject);
    setHistory([loadedProject]);
    setHistoryIndex(0);
    setIsDirty(false);
    setCurrentTime(0);
    setSelectedClipId(null);
    setConfirmDialog(null);
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

      // Convert project to JSON for render
      const projectJson = JSON.stringify(project);

      // Start render job
      const jobId = await videoEditorRenderService.startRender(projectJson, outputPath);

      setCurrentRenderJob(jobId);
      setShowRenderProgress(true);
    } catch (error) {
      alert(`Failed to start export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRenderComplete = (outputPath: string) => {
    setShowRenderProgress(false);
    setCurrentRenderJob(null);
    alert(`✅ Export complete!\n\nSaved to: ${outputPath}`);
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

  const handleClipMove = useCallback((clipId: string, newStartTime: number, newTrackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      let clip: Clip | null = null;
      for (const track of newProject.timeline.tracks) {
        const index = track.clips.findIndex((c: Clip) => c.id === clipId);
        if (index !== -1) {
          clip = track.clips.splice(index, 1)[0];
          break;
        }
      }

      if (!clip) return prevProject;

      clip.startTime = newStartTime;
      clip.trackId = newTrackId;

      const newTrack = newProject.timeline.tracks.find((t: any) => t.id === newTrackId);
      if (newTrack) {
        newTrack.clips.push(clip);
        newTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
      }

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
          clip.duration = newDuration;
          clip.trimIn = newTrimIn;
          clip.trimOut = newTrimIn + newDuration;
          break;
        }
      }

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

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

  useEffect(() => {
    if (!isPlaying) return;

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
  }, [isPlaying, project.settings.duration]);

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
          }

          .preview-container {
            flex: 1;
            min-height: 300px;
          }

          .timeline-container {
            height: 300px;
            border-top: 1px solid #333;
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
            overflow: hidden;
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
          <div className="project-title">🎬 {sanitizeProjectName(project.name)}</div>
          <div className="header-spacer" />
          <button className="header-button" onClick={handleLoad}>
            📂 Open
          </button>
        </div>

        {/* Toolbar */}
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
        />

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
              />
            </div>

            <div className="timeline-container">
              <Timeline
                timeline={project.timeline}
                assets={project.assets}
                currentTime={currentTime}
                duration={project.settings.duration}
                zoom={zoom}
                onTimeChange={handleTimeChange}
                onClipSelect={handleClipSelect}
                onClipMove={handleClipMove}
                onClipResize={handleClipResize}
                onClipDelete={handleClipDelete}
                selectedClipId={selectedClipId}
                selectedClipIds={selectedClipIds}
                onTrackToggleLock={handleTrackToggleLock}
                onTrackToggleMute={handleTrackToggleMute}
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

        {/* Keyboard Shortcuts Overlay */}
        <KeyboardShortcutsOverlay />
      </div>
    </ErrorBoundary>
  );
};

export default VideoEditorPhase3;
