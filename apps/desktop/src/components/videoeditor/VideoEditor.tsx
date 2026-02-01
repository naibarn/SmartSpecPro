/**
 * Video Editor Main Component
 * Phase 0: Foundation - Media Library Integration
 */

import React, { useState, useEffect } from 'react';
import MediaLibraryPanel from './MediaLibraryPanel';
import {
  type VideoEditorProject,
  type MediaLibraryAsset,
  createEmptyProject,
  addAssetToProject,
  addClipToTrack,
  findTrackByType,
  calculateProjectDuration
} from '../../types/videoEditor';

export const VideoEditor: React.FC = () => {
  const [project, setProject] = useState<VideoEditorProject>(() => createEmptyProject());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Handle adding asset from Media Library to timeline
  const handleAddToTimeline = (asset: MediaLibraryAsset, localPath: string) => {
    setProject(prevProject => {
      const newProject = { ...prevProject };

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

      return newProject;
    });
  };

  return (
    <div className="video-editor">
      <style>{`
        .video-editor {
          display: flex;
          height: 100vh;
          background: #1a1a1a;
          color: #e0e0e0;
        }

        .video-editor-main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .video-editor-header {
          padding: 12px 16px;
          background: #2a2a2a;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .project-title {
          font-size: 16px;
          font-weight: 600;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .header-button {
          padding: 6px 12px;
          background: #0078d4;
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .header-button:hover {
          background: #005a9e;
        }

        .header-button.secondary {
          background: #444;
        }

        .header-button.secondary:hover {
          background: #555;
        }

        .video-editor-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .preview-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0a;
          border-bottom: 1px solid #333;
          min-height: 300px;
        }

        .preview-placeholder {
          text-align: center;
          color: #666;
        }

        .preview-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .timeline-section {
          height: 250px;
          background: #1e1e1e;
          border-top: 1px solid #333;
          padding: 12px;
          overflow-y: auto;
        }

        .timeline-header {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .track-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .track {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          min-height: 60px;
        }

        .track-header {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 4px;
          color: #888;
        }

        .track-clips {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .clip {
          background: #0078d4;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .clip:hover {
          background: #005a9e;
        }

        .clip.selected {
          outline: 2px solid #fff;
          outline-offset: 2px;
        }

        .track-empty {
          font-size: 11px;
          color: #666;
          font-style: italic;
        }

        .sidebar {
          width: 300px;
          border-left: 1px solid #333;
          display: flex;
          flex-direction: column;
        }

        .project-stats {
          padding: 12px;
          background: #2a2a2a;
          border-bottom: 1px solid #333;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
        }

        .stat-label {
          color: #888;
        }

        .stat-value {
          color: #e0e0e0;
          font-weight: 600;
        }

        .empty-timeline {
          text-align: center;
          padding: 40px 20px;
          color: #666;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="video-editor-main">
        <div className="video-editor-header">
          <div className="project-title">🎬 {project.name}</div>
          <div className="header-actions">
            <button className="header-button secondary">💾 Save</button>
            <button className="header-button secondary">📂 Open</button>
            <button className="header-button">📤 Export</button>
          </div>
        </div>

        <div className="video-editor-content">
          <div className="preview-section">
            <div className="preview-placeholder">
              <div className="preview-icon">▶️</div>
              <div>Preview Window</div>
              <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
                Add clips to timeline to preview
              </div>
            </div>
          </div>

          <div className="timeline-section">
            <div className="timeline-header">Timeline</div>

            {project.timeline.tracks.every(t => t.clips.length === 0) ? (
              <div className="empty-timeline">
                <div className="empty-icon">🎞️</div>
                <div>Timeline is empty</div>
                <div style={{ fontSize: '12px', marginTop: '8px' }}>
                  Drag media from the library to start editing
                </div>
              </div>
            ) : (
              <div className="track-list">
                {project.timeline.tracks.map(track => (
                  <div key={track.id} className="track">
                    <div className="track-header">
                      {track.type === 'video' ? '🎬' : '🎤'} {track.name} ({track.clips.length} clips)
                    </div>
                    <div className="track-clips">
                      {track.clips.length === 0 ? (
                        <div className="track-empty">Empty track</div>
                      ) : (
                        track.clips.map(clip => {
                          const asset = project.assets[clip.assetId];
                          return (
                            <div
                              key={clip.id}
                              className={`clip ${selectedClipId === clip.id ? 'selected' : ''}`}
                              onClick={() => setSelectedClipId(clip.id)}
                            >
                              {asset?.filename || 'Unknown'} ({clip.duration.toFixed(1)}s)
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar">
        <div className="project-stats">
          <div className="stat-row">
            <span className="stat-label">Resolution:</span>
            <span className="stat-value">{project.settings.width}×{project.settings.height}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">FPS:</span>
            <span className="stat-value">{project.settings.fps}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Duration:</span>
            <span className="stat-value">{project.settings.duration.toFixed(1)}s</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Assets:</span>
            <span className="stat-value">{Object.keys(project.assets).length}</span>
          </div>
        </div>

        <MediaLibraryPanel onAddToTimeline={handleAddToTimeline} />
      </div>
    </div>
  );
};

export default VideoEditor;
