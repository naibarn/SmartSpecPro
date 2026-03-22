/**
 * Media Library Panel Component
 * Displays generated videos and audio that can be added to timeline.
 * Supports file upload on web platform.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  videoEditorMediaLibrary,
  type MediaLibraryAsset
} from '../../services/videoEditorService';
import { showToast } from './Toast';
import { WebAssetResolver } from '../../services/webAssetResolver';
import { createMediaJobClient, type MediaJobClient } from '../../services/mediaJobClient';
import { trpc } from '../../lib/trpc';
import type { Asset } from '../../types/videoEditor';

const isDesktopPlatform = typeof window !== 'undefined' && !!(window as any).__TAURI__;
const webAssetResolver = new WebAssetResolver();

interface MediaLibraryPanelProps {
  onAddToTimeline?: (asset: MediaLibraryAsset, localPath: string) => void;
  projectAssets?: Record<string, Asset>;
}

type LibraryRecentDaysFilter = 'all' | 1 | 3 | 7 | 15 | 30;
type LibrarySourceMode = 'generated' | 'library' | 'shared_group';

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
  onAddToTimeline,
  projectAssets
}) => {
  const [videos, setVideos] = useState<MediaLibraryAsset[]>([]);
  const [audio, setAudio] = useState<MediaLibraryAsset[]>([]);
  const [images, setImages] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'videos' | 'audio' | 'images'>('videos');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [currentFileProgress, setCurrentFileProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const [currentUploadAbort, setCurrentUploadAbort] = useState<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaJobClientRef = useRef<MediaJobClient | null>(null);
  const [transcodingIds, setTranscodingIds] = useState<Map<string, number>>(new Map()); // assetId -> progress %

  // Mutation to register uploaded files in the library system
  const createLibraryItem = trpc.library.createItem.useMutation();

  // Initialize media job client
  useEffect(() => {
    createMediaJobClient().then(client => {
      mediaJobClientRef.current = client;
    });
  }, []);

  // Transcode uploaded video to H.264 for browser playback
  const transcodeToH264 = async (assetId: string, assetUri: string) => {
    const client = mediaJobClientRef.current;
    if (!client) return;

    setTranscodingIds(prev => new Map(prev).set(assetId, 0));

    try {
      const result = await client.transcodeH264(assetUri, (progress) => {
        const pct = Math.round(progress.progress * 100);
        setTranscodingIds(prev => new Map(prev).set(assetId, pct));
      });

      // If transcoded, update the asset URL to the new H.264 file
      const transcodedUri = result.artifacts?.[0]?.uri;
      const wasTranscoded = (result.derived as any)?.transcoded;

      if (transcodedUri && wasTranscoded) {
        setVideos(prev => prev.map(v =>
          v.id === assetId ? { ...v, url: transcodedUri, format: 'mp4' } : v
        ));
        showToast('Video transcoded to H.264 for browser playback', 'success', 3000);
      }
    } catch (err) {
      console.warn('Transcode failed (non-fatal):', err);
    } finally {
      setTranscodingIds(prev => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  // Library search state
  const [sourceMode, setSourceMode] = useState<LibrarySourceMode>('generated');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [libraryRecentDays, setLibraryRecentDays] = useState<LibraryRecentDaysFilter>('all');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(librarySearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [librarySearchQuery]);

  const isLibraryMode = sourceMode === 'library' || sourceMode === 'shared_group';
  const libraryScope = sourceMode === 'shared_group' ? 'shared_groups' : 'my_library';

  // Library search query via tRPC
  const libraryQuery = trpc.library.listDocuments.useQuery(
    {
      scope: libraryScope,
      limit: 50,
      offset: 0,
      filters: {
        itemType: libraryTypeFilter !== 'all' ? libraryTypeFilter : undefined,
        status: 'ready' as const,
        ...(libraryRecentDays === 'all' ? {} : { recentDays: libraryRecentDays }),
      },
    },
    { enabled: isLibraryMode && debouncedSearch.trim().length === 0 }
  );
  const librarySemanticQuery = trpc.library.search.useQuery(
    {
      scope: libraryScope,
      query: debouncedSearch || undefined,
      limit: 50,
      offset: 0,
      filters: {
        itemType: libraryTypeFilter !== 'all' ? libraryTypeFilter : undefined,
        status: 'ready' as const,
        ...(libraryRecentDays === 'all' ? {} : { recentDays: libraryRecentDays }),
      },
    },
    { enabled: isLibraryMode && debouncedSearch.trim().length > 0 }
  );
  const activeLibraryQuery = debouncedSearch.trim().length > 0 ? librarySemanticQuery : libraryQuery;

  // Map library items to MediaLibraryAsset format
  const MEDIA_TYPES = new Set(['video', 'audio', 'image']);
  const libraryMediaAssets = useMemo<MediaLibraryAsset[]>(() => {
    const results = (
      activeLibraryQuery.data?.results ?? []
    ).map((item: any) => ({
      ...item,
      id: item.id ?? item.item_id,
    }));
    if (!results.length) return [];
    return results
      .filter(item =>
        MEDIA_TYPES.has(item.item_type) && item.source_url
      )
      .map(item => {
        const ext = item.source_url
          ? item.source_url.split('.').pop()?.split('?')[0] || ''
          : (item.metadata?.extension as string) || '';
        return {
          id: `lib-${item.id}`,
          type: item.item_type as 'video' | 'audio' | 'image',
          title: item.title || 'Untitled',
          thumbnailUrl: item.thumbnail_url
            || (item.item_type === 'image' ? item.source_url || '' : ''),
          duration: (item.metadata?.duration as number) || 0,
          url: item.source_url || '',
          model: item.source || 'library',
          createdAt: new Date(item.created_at),
          format: ext,
        };
      });
  }, [activeLibraryQuery.data?.results]);

  // Convert project assets to MediaLibraryAsset format for display
  const projectMediaAssets = useMemo<MediaLibraryAsset[]>(() => {
    if (!projectAssets) return [];
    return Object.values(projectAssets).map(a => ({
      id: a.taskId || a.id,
      type: a.type,
      title: a.name || a.filename || 'Untitled',
      thumbnailUrl: a.type === 'image' ? (a.path || a.originalPath || '') : (a.thumbnailPath || ''),
      duration: a.duration || 0,
      url: a.path || a.originalPath || '',
      model: a.model || (a.source === 'imported' ? 'uploaded' : 'unknown'),
      createdAt: new Date(),
      format: a.format || 'mp4',
      localPath: a.path,
    }));
  }, [projectAssets]);

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

  // Handle file upload (web only) — parallel with progress
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setUploading(true);
    setUploadProgress({ done: 0, total: fileList.length });

    const uploadOne = async (file: File) => {
      // Show progress for this file
      setCurrentFileProgress({ fileName: file.name, percent: 0 });

      // Get upload promise and abort function
      const { promise, abort } = webAssetResolver.uploadAsset(
        file,
        (percent) => {
          // Update per-file progress
          setCurrentFileProgress({ fileName: file.name, percent });
        }
      );

      // Store abort function so user can cancel
      setCurrentUploadAbort(() => abort);

      const { assetId, uri } = await promise;

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

      // Register in library system so it appears in Library search
      try {
        await createLibraryItem.mutateAsync({
          itemType: newAsset.type,
          source: 'video_editor_upload',
          title: file.name,
          sourceUrl: uri,
          thumbnailUrl: isImage ? uri : undefined,
          metadata: {
            file_size_bytes: file.size,
            extension: newAsset.format,
            file_type: file.type,
          },
          sourceLink: {
            linkType: 'upload_key',
            linkId: assetId,
          },
        });
        // Invalidate library query so new item appears
        activeLibraryQuery.refetch();
      } catch (libErr) {
        // Non-fatal: file is uploaded, just not indexed in library
        console.warn('Failed to register in library (non-fatal):', libErr);
      }

      // Auto-transcode video uploads to H.264 for browser compatibility
      if (isVideo) {
        transcodeToH264(assetId, uri);
      }

      setUploadProgress(prev => ({ ...prev, done: prev.done + 1 }));
      return file.name;
    };

    // Upload files sequentially to avoid server overload
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const file of fileList) {
      try {
        await uploadOne(file);
        succeeded++;
      } catch (e: any) {
        failed++;
        const errorMsg = e.message || 'Unknown error';
        errors.push(`${file.name}: ${errorMsg}`);
        console.error(`Upload failed for ${file.name}:`, errorMsg);
        setUploadProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }

    // Clear current file progress and abort function
    setCurrentFileProgress(null);
    setCurrentUploadAbort(null);

    // Show detailed results
    if (failed === 0) {
      showToast(`✅ Uploaded ${succeeded} file${succeeded !== 1 ? 's' : ''}`, 'success', 3000);
    } else if (succeeded === 0) {
      // All failed - show first error in detail
      showToast(errors[0] || `❌ Upload failed for all ${failed} file(s)`, 'error', 8000);
    } else {
      // Some succeeded, some failed
      showToast(
        `⚠️ ${succeeded} succeeded, ${failed} failed\n${errors[0] || ''}`,
        'warning',
        6000
      );
    }

    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancelUpload = () => {
    if (currentUploadAbort) {
      currentUploadAbort();
      setCurrentFileProgress(null);
      setCurrentUploadAbort(null);
      showToast('⛔ Upload cancelled by user', 'info', 2000);
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

      // Build a small drag label.
      // CRITICAL: The element MUST be inside the viewport and painted for
      // setDragImage to capture it. Off-screen or z-index:-1 elements are
      // not painted by browsers, causing fallback to the default ghost.
      const icon = asset.type === 'video' ? '🎬' : asset.type === 'audio' ? '🎵' : '🖼️';
      const color = asset.type === 'video' ? '#0078d4' : asset.type === 'audio' ? '#00b294' : '#ff6b6b';
      const dragEl = document.createElement('div');
      dragEl.textContent = `${icon} ${asset.title}`;
      dragEl.style.cssText = `position:fixed;top:0;left:0;z-index:99999;padding:6px 12px;background:#2a2a2a;border:1px solid ${color};border-left:3px solid ${color};border-radius:4px;color:#e0e0e0;font-size:11px;font-weight:600;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;`;
      document.body.appendChild(dragEl);

      // setDragImage: cursor at (10,14) relative to the label
      e.dataTransfer.setDragImage(dragEl, 10, 14);

      // Double-rAF: guarantees the browser has painted the element before
      // we remove it. First rAF fires before the next paint, second rAF
      // fires after that paint is committed — safe to remove.
      requestAnimationFrame(() => requestAnimationFrame(() => dragEl.remove()));
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
      let localPath = await videoEditorMediaLibrary.downloadToWorkspace(asset);
      let needsTranscode = false;

      // Probe file to get actual metadata
      try {
        const fileInfo = await videoEditorMediaLibrary.probeMediaFile(localPath);
        asset.duration = fileInfo.duration;
        if (fileInfo.width && fileInfo.height) {
          asset.resolution = `${fileInfo.width}x${fileInfo.height}`;
        }
      } catch (probeErr) {
        // Browser probe failed — likely HEVC or other unsupported codec
        if (asset.type === 'video') {
          needsTranscode = true;
        } else {
          console.warn('Failed to probe file (non-fatal):', probeErr);
        }
      }

      // If browser can't read the video, use server-side probe + transcode
      if (needsTranscode && asset.type === 'video') {
        const client = mediaJobClientRef.current;
        if (client) {
          try {
            // Server-side probe to get metadata + check codec
            const probeResult = await client.probe(localPath);
            const streams = (probeResult.derived as any)?.streams || [];
            const videoStream = streams.find((s: any) => s.codec_type === 'video');
            const codec = videoStream?.codec_name?.toLowerCase() || '';
            const durationMs = (probeResult.derived as any)?.durationMs || 0;

            if (durationMs > 0) {
              asset.duration = durationMs / 1000;
            }
            if (videoStream?.width && videoStream?.height) {
              asset.resolution = `${videoStream.width}x${videoStream.height}`;
            }

            const browserCodecs = new Set(['h264', 'vp8', 'vp9', 'av1']);
            if (codec && !browserCodecs.has(codec)) {
              showToast(`Transcoding ${codec.toUpperCase()} to H.264 for browser playback...`, 'info', 8000);
              setTranscodingIds(prev => new Map(prev).set(asset.id, 0));

              const transcodeResult = await client.transcodeH264(localPath, (progress) => {
                const pct = Math.round(progress.progress * 100);
                setTranscodingIds(prev => new Map(prev).set(asset.id, pct));
              });

              setTranscodingIds(prev => {
                const next = new Map(prev);
                next.delete(asset.id);
                return next;
              });

              const transcodedUri = transcodeResult.artifacts?.[0]?.uri;
              if (transcodedUri && (transcodeResult.derived as any)?.transcoded) {
                asset = { ...asset, url: transcodedUri, format: 'mp4' };
                localPath = transcodedUri;
                // Update the media library list too
                setVideos(prev => prev.map(v =>
                  v.id === asset.id ? { ...v, url: transcodedUri, format: 'mp4' } : v
                ));
              }
            }
          } catch (transcodeErr) {
            console.error('Server-side probe/transcode failed:', transcodeErr);
            showToast('Video codec not supported and transcoding failed', 'error', 4000);
            return; // Don't add unsupported video to timeline
          }
        }
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

  // Filter project assets by current tab type
  const tabType = selectedTab === 'videos' ? 'video' : selectedTab === 'images' ? 'image' : 'audio';
  const currentProjectAssets = projectMediaAssets.filter(a => a.type === tabType);

  // File accept filter based on active tab
  const acceptFilter = useMemo(() => {
    switch (selectedTab) {
      case 'videos': return '.mp4,.mov,.webm,.avi,video/*';
      case 'images': return '.png,.jpg,.jpeg,.gif,.webp,image/*';
      case 'audio': return '.mp3,.wav,.ogg,.aac,audio/*';
      default: return 'video/*,audio/*,image/*';
    }
  }, [selectedTab]);

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

        .source-mode-toggle {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }

        .source-toggle-btn {
          flex: 1;
          padding: 5px 10px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          color: #e0e0e0;
          transition: all 0.2s;
        }

        .source-toggle-btn:hover {
          background: #333;
        }

        .source-toggle-btn.active {
          background: #0078d4;
          border-color: #0078d4;
          color: white;
        }

        .library-search-bar {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }

        .library-search-input {
          flex: 1;
          padding: 6px 10px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 12px;
          outline: none;
        }

        .library-search-input:focus {
          border-color: #0078d4;
        }

        .library-search-input::placeholder {
          color: #666;
        }

        .library-type-select {
          min-width: 70px;
          padding: 6px 8px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
          outline: none;
          cursor: pointer;
        }

        .library-days-select {
          min-width: 88px;
          padding: 6px 8px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
          outline: none;
          cursor: pointer;
        }

        .library-type-select:focus {
          border-color: #0078d4;
        }

        .library-days-select:focus {
          border-color: #0078d4;
        }

        .load-more-button {
          display: block;
          width: 100%;
          padding: 8px;
          margin-top: 12px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .load-more-button:hover {
          background: #333;
          border-color: #0078d4;
        }

        .library-result-count {
          font-size: 10px;
          color: #888;
          margin-bottom: 8px;
        }

        .transcode-badge {
          position: absolute;
          top: 4px;
          left: 4px;
          background: rgba(255, 152, 0, 0.9);
          color: white;
          font-size: 9px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 3px;
          z-index: 2;
          animation: transcode-pulse 2s ease-in-out infinite;
        }

        @keyframes transcode-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Hidden file input for web upload */}
      {!isDesktopPlatform && (
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptFilter}
          multiple
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      )}

      <div className="media-library-header">
        <div className="media-library-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📚 Media Library</span>
          {!isDesktopPlatform && sourceMode === 'generated' && (
            <button
              className="add-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              {uploading ? `⏳ ${uploadProgress.done}/${uploadProgress.total}` : '📤 Upload'}
            </button>
          )}
        </div>

        {/* Source mode toggle */}
        <div className="source-mode-toggle">
          <button
            className={`source-toggle-btn ${sourceMode === 'generated' ? 'active' : ''}`}
            onClick={() => setSourceMode('generated')}
          >
            Generated
          </button>
          <button
            className={`source-toggle-btn ${sourceMode === 'library' ? 'active' : ''}`}
            onClick={() => setSourceMode('library')}
          >
            Library
          </button>
          <button
            className={`source-toggle-btn ${sourceMode === 'shared_group' ? 'active' : ''}`}
            onClick={() => setSourceMode('shared_group')}
          >
            Shared Group
          </button>
        </div>

        {/* Generated mode: type tabs */}
        {sourceMode === 'generated' && (
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
        )}

        {/* Library mode: search bar + type filter */}
        {isLibraryMode && (
          <div className="library-search-bar">
            <input
              type="text"
              className="library-search-input"
              placeholder={sourceMode === 'shared_group' ? 'Search shared group...' : 'Search library...'}
              value={librarySearchQuery}
              onChange={(e) => setLibrarySearchQuery(e.target.value)}
            />
            <select
              className="library-type-select"
              value={libraryTypeFilter}
              onChange={(e) => setLibraryTypeFilter(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="image">Image</option>
            </select>
            <select
              className="library-days-select"
              value={String(libraryRecentDays)}
              onChange={(e) => {
                const next = e.target.value;
                if (next === 'all') {
                  setLibraryRecentDays('all');
                  return;
                }
                setLibraryRecentDays(Number(next) as Exclude<LibraryRecentDaysFilter, 'all'>);
              }}
            >
              <option value="1">1d</option>
              <option value="3">3d</option>
              <option value="7">7d</option>
              <option value="15">15d</option>
              <option value="30">1m</option>
              <option value="all">All</option>
            </select>
          </div>
        )}

        {/* Upload Progress Bar - shown for large files */}
        {currentFileProgress && (
          <div style={{
            padding: '8px 12px',
            background: '#2a2a2a',
            borderRadius: '4px',
            marginTop: '8px',
            border: '1px solid #444'
          }}>
            <div style={{ fontSize: '11px', color: '#e0e0e0', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span title={currentFileProgress.fileName} style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '60%'
              }}>
                📤 {currentFileProgress.fileName}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, color: currentFileProgress.percent === 100 ? '#4caf50' : '#0078d4' }}>
                  {currentFileProgress.percent}%
                </span>
                {currentFileProgress.percent < 100 && currentUploadAbort && (
                  <button
                    onClick={handleCancelUpload}
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      background: '#d32f2f',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#b71c1c'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#d32f2f'}
                  >
                    ✕ Cancel
                  </button>
                )}
              </div>
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: '#1a1a1a',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${currentFileProgress.percent}%`,
                height: '100%',
                background: currentFileProgress.percent === 100
                  ? 'linear-gradient(90deg, #4caf50, #66bb6a)'
                  : 'linear-gradient(90deg, #0078d4, #00b294)',
                transition: 'width 0.3s ease',
                borderRadius: '3px'
              }} />
            </div>
            {currentFileProgress.percent < 100 && (
              <div style={{ fontSize: '10px', color: '#888', marginTop: '4px', textAlign: 'center' }}>
                {currentFileProgress.percent < 30 && '⏳ Starting upload...'}
                {currentFileProgress.percent >= 30 && currentFileProgress.percent < 70 && '📡 Uploading... Please wait'}
                {currentFileProgress.percent >= 70 && currentFileProgress.percent < 100 && '⚡ Almost done...'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="media-library-content">
        {sourceMode === 'generated' ? (
          <>
            {/* Project Assets Section — always shown if project has assets for this tab */}
            {currentProjectAssets.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#0078d4', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                  Project Media ({currentProjectAssets.length})
                </div>
                <div className="media-grid">
                  {currentProjectAssets.map(asset => (
                    <div
                      key={`proj-${asset.id}`}
                      className={`media-item ${downloadingIds.has(asset.id) ? 'downloading' : ''}`}
                      draggable={!downloadingIds.has(asset.id)}
                      onDragStart={handleDragStart(asset)}
                      style={{ borderColor: '#0078d450' }}
                    >
                      <div className="media-thumbnail">
                        {asset.type === 'video' ? (
                          asset.url ? (
                            <video
                              src={asset.url}
                              preload="metadata"
                              muted
                              playsInline
                              draggable={false}
                              className="media-video-thumb"
                              onLoadedData={(e) => { e.currentTarget.currentTime = 1; }}
                              onMouseEnter={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                            />
                          ) : (
                            <div className="media-thumbnail-icon">🎬</div>
                          )
                        ) : asset.type === 'image' ? (
                          asset.url ? (
                            <img src={asset.url} alt={asset.title} draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
                        <div className="media-title" title={asset.title}>{asset.title}</div>
                        <div className="media-meta">
                          <span className="media-model">{asset.model}</span>
                        </div>
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
              </div>
            )}

            {/* Generated Media Section */}
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
            ) : currentAssets.length === 0 && currentProjectAssets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  {selectedTab === 'videos' ? '🎬' : '🎤'}
                </div>
                <div>No {selectedTab} generated yet</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
                  Generate {selectedTab} in the Media Studio first
                </div>
              </div>
            ) : currentAssets.length === 0 ? null : (
              <>
              {currentProjectAssets.length > 0 && (
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                  Generated ({currentAssets.length})
                </div>
              )}
              <div className="media-grid">
                {currentAssets.map(asset => (
                  <div
                    key={asset.id}
                    className={`media-item ${downloadingIds.has(asset.id) ? 'downloading' : ''}`}
                    draggable={!downloadingIds.has(asset.id) && !transcodingIds.has(asset.id)}
                    onDragStart={handleDragStart(asset)}
                  >
                    <div className="media-thumbnail">
                      {transcodingIds.has(asset.id) && (
                        <div className="transcode-badge">
                          Transcoding {transcodingIds.get(asset.id)}%
                        </div>
                      )}
                      {asset.type === 'video' ? (
                        asset.url ? (
                          <video
                            src={asset.url}
                            preload="metadata"
                            muted
                            playsInline
                            draggable={false}
                            className="media-video-thumb"
                            onLoadedData={(e) => { e.currentTarget.currentTime = 1; }}
                            onMouseEnter={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                          />
                        ) : asset.thumbnailUrl ? (
                          <img src={asset.thumbnailUrl} alt={asset.title} draggable={false} />
                        ) : (
                          <div className="media-thumbnail-icon">🎬</div>
                        )
                      ) : asset.type === 'image' ? (
                        asset.url ? (
                          <img src={asset.url} alt={asset.title} draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
                        disabled={downloadingIds.has(asset.id) || transcodingIds.has(asset.id)}
                      >
                        {downloadingIds.has(asset.id) ? '⏳ Loading...' : transcodingIds.has(asset.id) ? '⏳ Transcoding...' : '➕ Add'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </>
        ) : (
          /* Library Search Results */
          <>
            {activeLibraryQuery.isLoading ? (
              <div className="loading-state">
                <div>Searching library...</div>
              </div>
            ) : activeLibraryQuery.error ? (
              <div className="error-state">
                <div>❌ {activeLibraryQuery.error.message}</div>
                <button className="retry-button" onClick={() => activeLibraryQuery.refetch()}>
                  Retry
                </button>
              </div>
            ) : libraryMediaAssets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div>{sourceMode === 'shared_group' ? 'No media found in shared group' : 'No media found in library'}</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
                  {debouncedSearch
                    ? 'Try a different search term or filter'
                    : sourceMode === 'shared_group'
                      ? 'No shared media found in your group library'
                      : 'Upload media files via Document Management'}
                </div>
              </div>
            ) : (
              <>
                <div className="library-result-count">
                  {Math.min(activeLibraryQuery.data?.total ?? 0, 50)} / {activeLibraryQuery.data?.total ?? 0} results
                  {debouncedSearch && ` for "${debouncedSearch}"`}
                  {!debouncedSearch && sourceMode === 'shared_group' && ' from Shared Group'}
                </div>
                {activeLibraryQuery.data?.has_more && (
                  <div
                    style={{
                      marginBottom: '8px',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #a16207',
                      background: '#422006',
                      color: '#fcd34d',
                      fontSize: '11px',
                    }}
                  >
                    Showing up to 50 results. There may be more items. Add more filters or keywords.
                  </div>
                )}
                <div className="media-grid">
                  {libraryMediaAssets.map(asset => (
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
                              draggable={false}
                              className="media-video-thumb"
                              onLoadedData={(e) => { e.currentTarget.currentTime = 1; }}
                              onMouseEnter={(e) => { e.currentTarget.currentTime = 0; e.currentTarget.play().catch(() => {}); }}
                              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 1; }}
                            />
                          ) : asset.thumbnailUrl ? (
                            <img src={asset.thumbnailUrl} alt={asset.title} draggable={false} />
                          ) : (
                            <div className="media-thumbnail-icon">🎬</div>
                          )
                        ) : asset.type === 'image' ? (
                          asset.url ? (
                            <img src={asset.url} alt={asset.title} draggable={false} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MediaLibraryPanel;
