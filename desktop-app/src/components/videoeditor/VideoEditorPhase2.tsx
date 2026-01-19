/**
 * Video Editor Main Component - Phase 2
 * Complete editor with export and audio ducking
 */

import React, { useState, useEffect, useCallback } from 'react';
import MediaLibraryPanel from './MediaLibraryPanel';
import Timeline from './Timeline';
import PreviewPlayer from './PreviewPlayer';
import Toolbar from './Toolbar';
import ExportDialog from './ExportDialog';
import RenderProgressDialog from './RenderProgressDialog';
import AudioDuckingPanel from './AudioDuckingPanel';
import { projectManager } from '../../services/projectManager';
import { videoEditorRenderService } from '../../services/videoEditorService';
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

export const VideoEditorPhase2: React.FC = () => {
  // Project state
  const [project, setProject] = useState<VideoEditorProject>(() => createEmptyProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(50);

  // History
  const [history, setHistory] = useState<VideoEditorProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);

  // Dialogs
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showRenderProgress, setShowRenderProgress] = useState(false);
  const [currentRenderJob, setCurrentRenderJob] = useState<string | null>(null);

  // Sidebar view
  const [sidebarView, setSidebarView] = useState<'library' | 'ducking'>('library');

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
      console.error('Load failed:', error);
    }
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
    setProject(prevProject => {
      const newProject = JSON.parse(JSON.stringify(prevProject));

      for (const track of newProject.timeline.tracks) {
        const index = track.clips.findIndex((c: Clip) => c.id === clipId);
        if (index !== -1) {
          track.clips.splice(index, 1);
          break;
        }
      }

      newProject.settings.duration = calculateProjectDuration(newProject.timeline);
      newProject.modifiedAt = new Date().toISOString();

      addToHistory(newProject);
      setSelectedClipId(null);
      return newProject;
    });
  }, [addToHistory]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

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

  return (
    <div className="video-editor-phase2">
      <style>{`
        .video-editor-phase2 {
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
      `}</style>

      {/* Header */}
      <div className="editor-header">
        <div className="project-title">🎬 {project.name}</div>
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
        onExport={handleExportClick}
        isDirty={isDirty}
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
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${sidebarView === 'library' ? 'active' : ''}`}
              onClick={() => setSidebarView('library')}
            >
              📚 Media Library
            </button>
            <button
              className={`sidebar-tab ${sidebarView === 'ducking' ? 'active' : ''}`}
              onClick={() => setSidebarView('ducking')}
            >
              🎚️ Audio
            </button>
          </div>

          <div className="sidebar-content">
            {sidebarView === 'library' ? (
              <MediaLibraryPanel onAddToTimeline={handleAddToTimeline} />
            ) : (
              <div className="ducking-container">
                <AudioDuckingPanel
                  ducking={project.audioMixing.ducking}
                  tracks={project.timeline.tracks}
                  onDuckingChange={handleDuckingChange}
                />
              </div>
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
    </div>
  );
};

export default VideoEditorPhase2;
