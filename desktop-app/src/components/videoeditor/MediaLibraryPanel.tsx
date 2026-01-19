/**
 * Media Library Panel Component
 * Displays generated videos and audio that can be added to timeline
 */

import React, { useState, useEffect } from 'react';
import {
  videoEditorMediaLibrary,
  type MediaLibraryAsset
} from '../../services/videoEditorService';

interface MediaLibraryPanelProps {
  onAddToTimeline?: (asset: MediaLibraryAsset, localPath: string) => void;
}

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({
  onAddToTimeline
}) => {
  const [videos, setVideos] = useState<MediaLibraryAsset[]>([]);
  const [audio, setAudio] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'videos' | 'audio'>('videos');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMediaLibrary();
  }, []);

  const loadMediaLibrary = async () => {
    setLoading(true);
    setError(null);

    try {
      const { videos: videosData, audio: audioData } =
        await videoEditorMediaLibrary.fetchAllGeneratedMedia(50, 50);

      setVideos(videosData);
      setAudio(audioData);
    } catch (err) {
      console.error('Failed to load media library:', err);
      setError(err instanceof Error ? err.message : 'Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (asset: MediaLibraryAsset) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/video-editor-asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAddToTimeline = async (asset: MediaLibraryAsset) => {
    if (!onAddToTimeline) return;

    setDownloadingIds(prev => new Set(prev).add(asset.id));

    try {
      // Download to workspace if not cached
      const localPath = await videoEditorMediaLibrary.downloadToWorkspace(asset);

      // Probe file to get actual metadata
      const fileInfo = await videoEditorMediaLibrary.probeMediaFile(localPath);

      // Update asset with probed info
      asset.duration = fileInfo.duration;
      if (fileInfo.width && fileInfo.height) {
        asset.resolution = `${fileInfo.width}x${fileInfo.height}`;
      }

      // Generate thumbnail if video and not exists
      if (asset.type === 'video' && !asset.thumbnailUrl) {
        try {
          asset.thumbnailUrl = await videoEditorMediaLibrary.generateThumbnail(localPath);
        } catch (thumbError) {
          console.warn('Failed to generate thumbnail:', thumbError);
        }
      }

      // Add to timeline
      onAddToTimeline(asset, localPath);
    } catch (err) {
      console.error('Failed to add to timeline:', err);
      alert(`Failed to add to timeline: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown';

    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${Math.round(bytes / 1024)}KB`;
    }
    return `${mb.toFixed(1)}MB`;
  };

  const currentAssets = selectedTab === 'videos' ? videos : audio;

  return (
    <div className="media-library-panel">
      <style>{`
        .media-library-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #e0e0e0;
        }

        .media-library-header {
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .media-library-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .media-library-tabs {
          display: flex;
          gap: 8px;
        }

        .tab-button {
          padding: 6px 12px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .tab-button:hover {
          background: #333;
        }

        .tab-button.active {
          background: #0078d4;
          border-color: #0078d4;
        }

        .media-library-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }

        .media-item {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 6px;
          cursor: move;
          transition: all 0.2s;
          overflow: hidden;
        }

        .media-item:hover {
          border-color: #0078d4;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .media-item.downloading {
          opacity: 0.6;
          cursor: wait;
        }

        .media-thumbnail {
          position: relative;
          width: 100%;
          padding-top: 56.25%; /* 16:9 aspect ratio */
          background: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .media-thumbnail img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .media-thumbnail-icon {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 48px;
        }

        .media-duration {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: rgba(0, 0, 0, 0.8);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
        }

        .media-info {
          padding: 8px;
        }

        .media-title {
          font-size: 12px;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .media-meta {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #888;
        }

        .media-model {
          color: #0078d4;
        }

        .media-actions {
          padding: 4px 8px;
          border-top: 1px solid #333;
          display: flex;
          justify-content: center;
        }

        .add-button {
          background: #0078d4;
          border: none;
          color: white;
          padding: 4px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
          transition: background 0.2s;
        }

        .add-button:hover {
          background: #005a9e;
        }

        .add-button:disabled {
          background: #555;
          cursor: not-allowed;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #888;
        }

        .error-state {
          padding: 20px;
          text-align: center;
          color: #ff6b6b;
        }

        .retry-button {
          margin-top: 12px;
          background: #0078d4;
          border: none;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }

        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: #888;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="media-library-header">
        <div className="media-library-title">📚 Media Library</div>
        <div className="media-library-tabs">
          <button
            className={`tab-button ${selectedTab === 'videos' ? 'active' : ''}`}
            onClick={() => setSelectedTab('videos')}
          >
            🎬 Videos ({videos.length})
          </button>
          <button
            className={`tab-button ${selectedTab === 'audio' ? 'active' : ''}`}
            onClick={() => setSelectedTab('audio')}
          >
            🎤 Audio ({audio.length})
          </button>
        </div>
      </div>

      <div className="media-library-content">
        {loading ? (
          <div className="loading-state">
            <div>Loading media library...</div>
          </div>
        ) : error ? (
          <div className="error-state">
            <div>❌ {error}</div>
            <button className="retry-button" onClick={loadMediaLibrary}>
              Retry
            </button>
          </div>
        ) : currentAssets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              {selectedTab === 'videos' ? '🎬' : '🎤'}
            </div>
            <div>No {selectedTab} generated yet</div>
            <div style={{ fontSize: '11px', marginTop: '8px' }}>
              Generate {selectedTab} in the Media Studio first
            </div>
          </div>
        ) : (
          <div className="media-grid">
            {currentAssets.map(asset => (
              <div
                key={asset.id}
                className={`media-item ${downloadingIds.has(asset.id) ? 'downloading' : ''}`}
                draggable={!downloadingIds.has(asset.id)}
                onDragStart={handleDragStart(asset)}
              >
                <div className="media-thumbnail">
                  {asset.type === 'video' ? (
                    asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.title} />
                    ) : (
                      <div className="media-thumbnail-icon">🎬</div>
                    )
                  ) : (
                    <div className="media-thumbnail-icon">🎵</div>
                  )}
                  {asset.duration > 0 && (
                    <div className="media-duration">
                      {formatDuration(asset.duration)}
                    </div>
                  )}
                </div>

                <div className="media-info">
                  <div className="media-title" title={asset.title}>
                    {asset.title}
                  </div>
                  <div className="media-meta">
                    <span className="media-model">{asset.model}</span>
                    <span>{formatDate(asset.createdAt)}</span>
                  </div>
                  {asset.fileSize && (
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                      {formatFileSize(asset.fileSize)}
                    </div>
                  )}
                </div>

                <div className="media-actions">
                  <button
                    className="add-button"
                    onClick={() => handleAddToTimeline(asset)}
                    disabled={downloadingIds.has(asset.id)}
                  >
                    {downloadingIds.has(asset.id) ? '⏳ Loading...' : '➕ Add'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibraryPanel;
