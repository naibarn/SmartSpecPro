/**
 * Media Library Panel Component
 * Displays generated videos and audio that can be added to timeline.
 * Supports file upload on web platform.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  videoEditorMediaLibrary,
  type MediaLibraryAsset
} from '../../services/videoEditorService';
import { showToast } from './Toast';
import { WebAssetResolver } from '../../services/webAssetResolver';

const isDesktopPlatform = typeof window !== 'undefined' && !!(window as any).__TAURI__;
const webAssetResolver = new WebAssetResolver();

interface MediaLibraryPanelProps {
  onAddToTimeline?: (asset: MediaLibraryAsset, localPath: string) => void;
}

// Type guards
const isValidAsset = (asset: unknown): asset is MediaLibraryAsset => {
  return (
    typeof asset === 'object' &&
    asset !== null &&
    'id' in asset &&
    'type' in asset &&
    'title' in asset &&
    typeof (asset as MediaLibraryAsset).id === 'string' &&
    ((asset as MediaLibraryAsset).type === 'video' || (asset as MediaLibraryAsset).type === 'audio' || (asset as MediaLibraryAsset).type === 'image')
  );
};

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({
  onAddToTimeline
}) => {
  const [videos, setVideos] = useState<MediaLibraryAsset[]>([]);
  const [audio, setAudio] = useState<MediaLibraryAsset[]>([]);
  const [images, setImages] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'videos' | 'audio' | 'images'>('videos');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMediaLibrary();
  }, []);

  const loadMediaLibrary = async () => {
    setLoading(true);
    setError(null);

    try {
      const { videos: videosData, audio: audioData, images: imagesData } =
        await videoEditorMediaLibrary.fetchAllGeneratedMedia(50, 50);

      setVideos(videosData);
      setAudio(audioData);
      setImages(imagesData || []);
    } catch (err) {
      console.error('Failed to load media library:', err);
      setError(err instanceof Error ? err.message : 'Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  // Handle file upload (web only)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { assetId, uri } = await webAssetResolver.uploadAsset(file);
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        const newAsset: MediaLibraryAsset = {
          id: assetId,
          type: isImage ? 'image' : isVideo ? 'video' : 'audio',
          title: file.name,
          thumbnailUrl: isImage ? uri : '',
          duration: 0,
          url: uri,
          model: 'uploaded',
          createdAt: new Date(),
          format: file.name.split('.').pop() || 'mp4',
        };

        if (isImage) {
          setImages(prev => [newAsset, ...prev]);
        } else if (isVideo) {
          setVideos(prev => [newAsset, ...prev]);
        } else {
          setAudio(prev => [newAsset, ...prev]);
        }
      }
      showToast('Upload complete', 'success', 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error', 4000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragStart = (asset: MediaLibraryAsset) => (e: React.DragEvent) => {
    try {
      if (!isValidAsset(asset)) {
        console.error('Invalid asset for drag operation', asset);
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('application/video-editor-asset', JSON.stringify(asset));
      e.dataTransfer.effectAllowed = 'copy';
    } catch (err) {
      console.error('Failed to start drag operation:', err);
      e.preventDefault();
      showToast('Failed to drag asset', 'error', 2000);
    }
  };

  const handleAddToTimeline = async (asset: MediaLibraryAsset) => {
    if (!onAddToTimeline) return;

    setDownloadingIds(prev => new Set(prev).add(asset.id));

    try {
      // Platform-aware: desktop downloads to workspace, web uses URL directly
      const localPath = await videoEditorMediaLibrary.downloadToWorkspace(asset);

      // Probe file to get actual metadata
      try {
        const fileInfo = await videoEditorMediaLibrary.probeMediaFile(localPath);
        asset.duration = fileInfo.duration;
        if (fileInfo.width && fileInfo.height) {
          asset.resolution = `${fileInfo.width}x${fileInfo.height}`;
        }
      } catch (probeErr) {
        console.warn('Failed to probe file (non-fatal):', probeErr);
      }

      // Generate thumbnail if video and not exists (desktop only)
      if (isDesktopPlatform && asset.type === 'video' && !asset.thumbnailUrl) {
        try {
          asset.thumbnailUrl = await videoEditorMediaLibrary.generateThumbnail(localPath);
        } catch (thumbError) {
          console.warn('Failed to generate thumbnail:', thumbError);
        }
      }

      // Add to timeline
      onAddToTimeline(asset, localPath);
      showToast(`Added "${asset.title}" to timeline`, 'success', 2000);
    } catch (err) {
      console.error('Failed to add to timeline:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      showToast(`Failed to add to timeline: ${errorMsg}`, 'error', 4000);
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

  const currentAssets = selectedTab === 'videos' ? videos : selectedTab === 'images' ? images : audio;

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
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          position: relative;
        }

        .media-item:hover {
          border-color: #0078d4;
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 8px 16px rgba(0, 120, 212, 0.3);
        }

        .media-item.downloading {
          opacity: 0.6;
          cursor: wait;
          animation: downloading-pulse 1.5s ease-in-out infinite;
        }

        @keyframes downloading-pulse {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.8;
          }
        }

        .media-item.downloading::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(0, 120, 212, 0.3), transparent);
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
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

        .media-thumbnail img,
        .media-video-thumb {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #000;
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
          transition: all 0.2s ease-in-out;
          position: relative;
          overflow: hidden;
        }

        .add-button::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: translate(-50%, -50%);
          transition: width 0.3s, height 0.3s;
        }

        .add-button:hover::before {
          width: 100%;
          height: 100%;
        }

        .add-button:hover {
          background: #005a9e;
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(0, 120, 212, 0.4);
        }

        .add-button:active {
          transform: scale(0.95);
        }

        .add-button:disabled {
          background: #555;
          cursor: not-allowed;
          transform: none;
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

      {/* Hidden file input for web upload */}
      {!isDesktopPlatform && (
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      )}

      <div className="media-library-header">
        <div className="media-library-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📚 Media Library</span>
          {!isDesktopPlatform && (
            <button
              className="add-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              {uploading ? '⏳ Uploading...' : '📤 Upload'}
            </button>
          )}
        </div>
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
          <button
            className={`tab-button ${selectedTab === 'images' ? 'active' : ''}`}
            onClick={() => setSelectedTab('images')}
          >
            🖼️ Images ({images.length})
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
                    asset.url ? (
                      <video
                        src={asset.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="media-video-thumb"
                        onLoadedData={(e) => { e.currentTarget.currentTime = 1; }}
                        onMouseEnter={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                      />
                    ) : asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt={asset.title} />
                    ) : (
                      <div className="media-thumbnail-icon">🎬</div>
                    )
                  ) : asset.type === 'image' ? (
                    asset.url ? (
                      <img src={asset.url} alt={asset.title} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="media-thumbnail-icon">🖼️</div>
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
