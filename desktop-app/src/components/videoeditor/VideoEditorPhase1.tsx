/**
 * Video Editor Main Component - Phase 1
 * Complete interactive timeline editor with all Phase 1 features
 */

import React, { useState, useEffect, useCallback } from 'react';
import MediaLibraryPanel from './MediaLibraryPanel';
import Timeline from './Timeline';
import PreviewPlayer from './PreviewPlayer';
import Toolbar from './Toolbar';
import { projectManager } from '../../services/projectManager';
import { sanitizeProjectName } from '../../utils/security';
import {
  type VideoEditorProject,
  type MediaLibraryAsset,
  type Clip,
  createEmptyProject,
  addAssetToProject,
  addClipToTrack,
  findTrackByType,
  calculateProjectDuration,
  generateId
} from '../../types/videoEditor';

export const VideoEditorPhase1: React.FC = () => {
  // Project state
  const [project, setProject] = useState<VideoEditorProject>(() => createEmptyProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50); // pixels per second

  // History for undo/redo
  const [history, setHistory] = useState<VideoEditorProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);

  // ========================================
  // History Management
  // ========================================

  const addToHistory = useCallback((newProject: VideoEditorProject) => {
    setHistory(prev => {
      // Remove any redo history
      const trimmed = prev.slice(0, historyIndex + 1);
      // Add new state
      const updated = [...trimmed, JSON.parse(JSON.stringify(newProject))];
      // Keep only last 50 states
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
        const confirm = window.confirm('You have unsaved changes. Load anyway?');
        if (!confirm) return;
      }

      const { project: loadedProject } = await projectManager.loadProject();
      setProject(loadedProject);
      setHistory([loadedProject]);
      setHistoryIndex(0);
      setIsDirty(false);
      setCurrentTime(0);
      setSelectedClipId(null);
    } catch (error) {
      // User cancelled or error
      console.error('Load failed:', error);
    }
  };

  const handleExport = async () => {
    alert('Export functionality will be implemented in Phase 2!');
  };

  // ========================================
  // Timeline Interactions
  // ========================================

  const handleAddToTimeline = (asset: MediaLibraryAsset, localPath: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Add asset to project
      const newAsset = addAssetToProject(newProject, asset, localPath);

      // Find appropriate track
      const track = findTrackByType(newProject.timeline, asset.type);

      if (!track) {
        alert(`No available ${asset.type} track found`);
        return prevProject;
      }

      // Calculate start time (at the end of existing clips)
      const lastClip = track.clips[track.clips.length - 1];
      const startTime = lastClip
        ? lastClip.startTime + lastClip.duration
        : 0;

      // Add clip to track
      addClipToTrack(track, newAsset, startTime);

      // Update project duration
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  };

  const handleClipMove = useCallback((clipId: string, newStartTime: number, newTrackId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find clip and remove from old track
      let clip: Clip | null = null;
      for (const track of newProject.timeline.tracks) {
        const index = track.clips.findIndex((c: Clip) => c.id === clipId);
        if (index !== -1) {
          clip = track.clips.splice(index, 1)[0];
          break;
        }
      }

      if (!clip) return prevProject;

      // Update clip
      clip.startTime = newStartTime;
      clip.trackId = newTrackId;

      // Add to new track
      const newTrack = newProject.timeline.tracks.find((t: any) => t.id === newTrackId);
      if (newTrack) {
        newTrack.clips.push(clip);
        newTrack.clips.sort((a: Clip, b: Clip) => a.startTime - b.startTime);
      }

      // Update duration
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  const handleClipResize = useCallback((clipId: string, newDuration: number, newTrimIn: number) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find and update clip
      for (const track of newProject.timeline.tracks) {
        const clip = track.clips.find((c: Clip) => c.id === clipId);
        if (clip) {
          clip.duration = newDuration;
          clip.trimIn = newTrimIn;
          clip.trimOut = newTrimIn + newDuration;
          break;
        }
      }

      // Update duration
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      return newProject;
    });
  }, [addToHistory]);

  const handleClipDelete = useCallback((clipId: string) => {
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      // Find and remove clip
      for (const track of newProject.timeline.tracks) {
        const index = track.clips.findIndex((c: Clip) => c.id === clipId);
        if (index !== -1) {
          track.clips.splice(index, 1);
          break;
        }
      }

      // Update duration
      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      setSelectedClipId(null);
      return newProject;
    });
  }, [addToHistory]);

  // ========================================
  // Playback Controls
  // ========================================

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleTimeChange = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, project.settings.duration)));
  };

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 1/30; // 30fps
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S = Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+Z = Undo
      else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z = Redo
      else if (e.ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
      // Space = Play/Pause (handled in PreviewPlayer)
      // Delete = handled in Timeline
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // ========================================
  // Auto-save
  // ========================================

  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      projectManager.autoSave(project);
    }, 30000); // Auto-save every 30 seconds

    return () => clearTimeout(timer);
  }, [project, isDirty]);

  // Initialize history
  useEffect(() => {
    if (history.length === 0) {
      setHistory([project]);
      setHistoryIndex(0);
    }
  }, []);

  return (
    <div className="video-editor-phase1">
      <style>{`
        .video-editor-phase1 {
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

        .project-info {
          padding: 12px;
          background: #2a2a2a;
          border-bottom: 1px solid #333;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 4px;
          color: #888;
        }

        .info-value {
          color: #e0e0e0;
          font-weight: 600;
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
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onSave={handleSave}
        onExport={handleExport}
        isDirty={isDirty}
      />

      {/* Main Layout */}
      <div className="editor-layout">
        {/* Editor Main */}
        <div className="editor-main">
          {/* Preview Player */}
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

          {/* Timeline */}
          <div className="timeline-container">
            <Timeline
              timeline={project.timeline}
              assets={project.assets}
              currentTime={currentTime}
              duration={project.settings.duration}
              zoom={zoom}
              onTimeChange={handleTimeChange}
              onClipSelect={setSelectedClipId}
              onClipMove={handleClipMove}
              onClipResize={handleClipResize}
              onClipDelete={handleClipDelete}
              selectedClipId={selectedClipId}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="project-info">
            <div className="info-row">
              <span>Resolution:</span>
              <span className="info-value">{project.settings.width}×{project.settings.height}</span>
            </div>
            <div className="info-row">
              <span>FPS:</span>
              <span className="info-value">{project.settings.fps}</span>
            </div>
            <div className="info-row">
              <span>Duration:</span>
              <span className="info-value">{project.settings.duration.toFixed(1)}s</span>
            </div>
            <div className="info-row">
              <span>Clips:</span>
              <span className="info-value">
                {project.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0)}
              </span>
            </div>
            <div className="info-row">
              <span>Status:</span>
              <span className="info-value" style={{ color: isDirty ? '#ffa500' : '#4caf50' }}>
                {isDirty ? '● Modified' : '✓ Saved'}
              </span>
            </div>
          </div>

          <MediaLibraryPanel onAddToTimeline={handleAddToTimeline} />
        </div>
      </div>
    </div>
  );
};

export default VideoEditorPhase1;
