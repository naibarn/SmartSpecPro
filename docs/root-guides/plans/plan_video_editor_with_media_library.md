# แผนงานเชิงเทคนิค: Video Editor พร้อม Media Library Integration
## SmartSpecPro Desktop App - Professional Solution

> **เป้าหมาย**: สร้าง Video Editor แบบมืออาชีพใน Desktop App ที่รองรับ:
> - ✅ ตัดต่อคลิปหลายคลิป (FFmpeg-based local rendering)
> - ✅ ดึงวีดีโอและเสียงที่เจนจากระบบ (Media Library Integration)
> - ✅ Audio ducking อัตโนมัติ (เสียงชัด พูดชัด)
> - ✅ Timeline-based editing (มาตรฐานอุตสาหกรรม)
> - ✅ Real-time preview และ export คุณภาพสูง
> - ✅ 100% Local rendering (ไม่อัปโหลด)

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri + React)              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Video Editor UI (React Components)           │  │
│  │  • Timeline Component (drag & drop clips)            │  │
│  │  • Media Library Browser (generated videos/audio)    │  │
│  │  • Preview Player (real-time playback)               │  │
│  │  • Audio Mixer (ducking controls)                    │  │
│  │  • Export Settings                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      Video Editor Service (TypeScript/Rust)          │  │
│  │  • Project Management (save/load .videoproj)         │  │
│  │  • Media Asset Management                            │  │
│  │  • Timeline State Management                         │  │
│  │  • FFmpeg Command Generator                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │    Local Render Engine (Tauri Command - Rust)        │  │
│  │  • FFmpeg Binary Manager                             │  │
│  │  • Render Job Queue                                  │  │
│  │  • Progress Tracking                                 │  │
│  │  • Hardware Encoder Detection                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Media Library Integration                    │  │
│  │  • Fetch generated videos (via mediaService)         │  │
│  │  • Fetch generated audio (TTS/voiceover)             │  │
│  │  • Cache thumbnails locally                          │  │
│  │  • Download media to temp workspace                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Bundled FFmpeg Binary                   │  │
│  │  Windows: resources/ffmpeg/win/ffmpeg.exe            │  │
│  │  macOS: Resources/ffmpeg/mac/ffmpeg                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│              Python Backend (API Server)                     │
│  • GET /api/v1/media/tasks - List generated media           │
│  • GET /api/v1/media/download/{task_id} - Download file     │
│  • Media storage (local/S3)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 UI/UX Design: Professional Video Editor Interface

### 1. Main Layout (Timeline-based)

```
┌──────────────────────────────────────────────────────────────────┐
│  SmartSpecPro Video Editor                    [─] [□] [×]        │
├──────────────────────────────────────────────────────────────────┤
│ File  Edit  View  Insert  Effects  Window                        │
├────────────┬─────────────────────────────────────┬───────────────┤
│            │                                     │               │
│  Media     │       Video Preview                 │   Properties  │
│  Library   │     ┌─────────────────────────┐     │               │
│            │     │                         │     │  ▣ Selected   │
│ 📁 Videos  │     │    [Preview Window]     │     │    Clip       │
│ 🎬 Generated│     │     1920x1080           │     │               │
│   • Clip 1 │     │                         │     │  Duration:    │
│   • Clip 2 │     │     [Play] [Stop]       │     │  00:10.5      │
│ 🎤 Audio   │     └─────────────────────────┘     │               │
│   • VO 1   │                                     │  Trim:        │
│   • VO 2   │     Timeline: 00:12.5 / 01:30.0     │  In: 00:02    │
│            │     ════════════════════════         │  Out: 00:12   │
│ 📂 Imported│                                     │               │
│   • Local  │     ┌─────────────────────────────┐ │  Volume:      │
│     Files  │  V1 │▓▓▓▓▓▓│▓▓▓▓│▓▓▓▓▓▓▓▓│      │ │  ▭▬▬▬▬ 80%   │
│            │     └─────────────────────────────┘ │               │
│ [+ Import] │     ┌─────────────────────────────┐ │  [Apply]      │
│            │  A1 │░░░░░░░░░░░░░░░░░░░░░░░░░░░│ │               │
│            │     └─────────────────────────────┘ │               │
│            │     ┌─────────────────────────────┐ │  Audio Mixing │
│            │  A2 │      ♪♪♪♪♪♪♪♪              │ │               │
│            │     └─────────────────────────────┘ │  🔊 Ducking   │
│            │     00:00  00:30   01:00   01:30    │  [○ ON ] OFF  │
│            │                                     │               │
│            │ [◀◀] [▶] [■] [▶▶]  ⏱ 00:00:12.5   │  Threshold:   │
│            │                                     │  ▭▬▬▬▬▬ -20dB │
└────────────┴─────────────────────────────────────┴───────────────┘
│ [💾 Save Project] [📤 Export Video]  Status: Ready             │
└──────────────────────────────────────────────────────────────────┘
```

### 2. Key UI Components

#### A. Media Library Panel
```typescript
// Features:
• Tree view: Videos / Generated / Audio / Imported
• Thumbnail previews (auto-generated)
• Search & filter (by date, model, duration)
• Drag-to-timeline support
• Quick preview on hover
• Context menu: Preview / Add to Timeline / Properties
```

#### B. Timeline Component
```typescript
// Features:
• Multi-track support (V1, V2, A1, A2, A3)
• Snap to grid / Snap to clips
• Zoom in/out (Ctrl + Mouse Wheel)
• Ripple edit / Roll edit / Slip edit
• Visual waveform for audio tracks
• Markers & keyframes
• Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
```

#### C. Preview Player
```typescript
// Features:
• Real-time playback (using Web Video API)
• Scrubbing (drag timeline cursor)
• Play/Pause (Space bar)
• Frame stepping (← / → arrows)
• Full-screen preview
• Quality selector (draft/full)
```

#### D. Properties Panel
```typescript
// Features:
• Clip properties (duration, trim points)
• Transform (scale, position, rotation)
• Audio controls (volume, pan)
• Effects (fade in/out, transitions)
• Speed control (0.5x - 2x)
```

---

## 🔗 Media Library Integration

### 1. Fetching Generated Media

```typescript
// desktop-app/src/services/videoEditorService.ts

interface MediaLibraryAsset {
  id: string;              // task_id from backend
  type: 'video' | 'audio';
  title: string;           // from prompt or custom
  thumbnailUrl: string;    // generated thumbnail
  duration: number;        // in seconds
  url: string;             // download URL
  model: string;           // veo-3-1, sora-2, etc.
  createdAt: Date;
  resolution?: string;     // for videos
  format: string;          // mp4, mp3, wav
  localPath?: string;      // cached local path
}

export class VideoEditorMediaLibrary {

  /**
   * Fetch all generated videos from backend
   */
  async fetchGeneratedVideos(): Promise<MediaLibraryAsset[]> {
    const response = await mediaService.listTasks(
      'video',      // media_type
      'completed',  // status
      100,          // limit
      0             // offset
    );

    return response.tasks
      .filter(task => task.result_url)
      .map(task => ({
        id: task.id,
        type: 'video',
        title: this.extractTitle(task.prompt),
        thumbnailUrl: this.generateThumbnailUrl(task.id),
        duration: this.extractDuration(task.parameters),
        url: task.result_url,
        model: task.model,
        createdAt: new Date(task.completed_at),
        resolution: task.parameters?.resolution || '1080p',
        format: this.extractFormat(task.result_url),
        localPath: undefined // will be set after download
      }));
  }

  /**
   * Fetch all generated audio (TTS/voiceovers)
   */
  async fetchGeneratedAudio(): Promise<MediaLibraryAsset[]> {
    const response = await mediaService.listTasks(
      'audio',
      'completed',
      100,
      0
    );

    return response.tasks
      .filter(task => task.result_url)
      .map(task => ({
        id: task.id,
        type: 'audio',
        title: this.extractTitle(task.prompt || task.parameters?.text),
        thumbnailUrl: '/assets/audio-icon.svg',
        duration: 0, // will probe after download
        url: task.result_url,
        model: task.model,
        createdAt: new Date(task.completed_at),
        format: task.parameters?.output_format || 'mp3',
        localPath: undefined
      }));
  }

  /**
   * Download media file to local workspace for editing
   */
  async downloadToWorkspace(asset: MediaLibraryAsset): Promise<string> {
    // Check if already cached
    if (asset.localPath && await this.fileExists(asset.localPath)) {
      return asset.localPath;
    }

    // Download from backend
    const blob = await mediaService.downloadMedia(asset.id);

    // Save to workspace directory
    const workspacePath = await this.getWorkspacePath();
    const filename = `${asset.id}.${asset.format}`;
    const localPath = `${workspacePath}/${filename}`;

    await invoke('save_blob_to_file', {
      blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
      path: localPath
    });

    // Update asset
    asset.localPath = localPath;

    return localPath;
  }

  /**
   * Generate thumbnail for video (using FFmpeg)
   */
  async generateThumbnail(videoPath: string): Promise<string> {
    const thumbnailPath = videoPath.replace(/\.[^.]+$/, '_thumb.jpg');

    await invoke('ffmpeg_generate_thumbnail', {
      inputPath: videoPath,
      outputPath: thumbnailPath,
      timeSeconds: 1.0 // capture at 1 second
    });

    return thumbnailPath;
  }

  /**
   * Probe media file metadata (duration, codec, etc.)
   */
  async probeMediaFile(filePath: string): Promise<MediaFileInfo> {
    return await invoke('ffmpeg_probe_file', { path: filePath });
  }

  private extractTitle(prompt: string): string {
    // Extract meaningful title from prompt (first 50 chars)
    return prompt.length > 50
      ? prompt.substring(0, 50) + '...'
      : prompt;
  }

  private extractDuration(parameters: any): number {
    return parameters?.duration || 10; // default 10 seconds
  }

  private extractFormat(url: string): string {
    const match = url.match(/\.(\w+)$/);
    return match ? match[1] : 'mp4';
  }

  private generateThumbnailUrl(taskId: string): string {
    // Placeholder - will be replaced after actual thumbnail generation
    return `/api/v1/media/thumbnail/${taskId}`;
  }

  private async fileExists(path: string): Promise<boolean> {
    return await invoke('file_exists', { path });
  }

  private async getWorkspacePath(): Promise<string> {
    return await invoke('get_video_editor_workspace_path');
  }
}
```

### 2. React Components

```typescript
// desktop-app/src/components/VideoEditor/MediaLibraryPanel.tsx

import React, { useState, useEffect } from 'react';
import { VideoEditorMediaLibrary } from '@/services/videoEditorService';

export const MediaLibraryPanel: React.FC = () => {
  const [videos, setVideos] = useState<MediaLibraryAsset[]>([]);
  const [audio, setAudio] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'videos' | 'audio'>('videos');

  const library = new VideoEditorMediaLibrary();

  useEffect(() => {
    loadMediaLibrary();
  }, []);

  const loadMediaLibrary = async () => {
    setLoading(true);
    try {
      const [videosData, audioData] = await Promise.all([
        library.fetchGeneratedVideos(),
        library.fetchGeneratedAudio()
      ]);
      setVideos(videosData);
      setAudio(audioData);
    } catch (error) {
      console.error('Failed to load media library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (asset: MediaLibraryAsset) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/video-editor-asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleAddToTimeline = async (asset: MediaLibraryAsset) => {
    try {
      // Download to workspace if not cached
      const localPath = await library.downloadToWorkspace(asset);

      // Add to timeline
      // This will be handled by TimelineComponent
      window.dispatchEvent(new CustomEvent('add-clip-to-timeline', {
        detail: { asset, localPath }
      }));
    } catch (error) {
      console.error('Failed to add to timeline:', error);
    }
  };

  return (
    <div className="media-library-panel">
      <div className="tabs">
        <button
          className={selectedTab === 'videos' ? 'active' : ''}
          onClick={() => setSelectedTab('videos')}
        >
          🎬 Videos ({videos.length})
        </button>
        <button
          className={selectedTab === 'audio' ? 'active' : ''}
          onClick={() => setSelectedTab('audio')}
        >
          🎤 Audio ({audio.length})
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading media library...</div>
      ) : (
        <div className="media-grid">
          {(selectedTab === 'videos' ? videos : audio).map(asset => (
            <div
              key={asset.id}
              className="media-item"
              draggable
              onDragStart={handleDragStart(asset)}
            >
              <div className="thumbnail">
                {asset.type === 'video' ? (
                  <img src={asset.thumbnailUrl} alt={asset.title} />
                ) : (
                  <div className="audio-icon">🎵</div>
                )}
                <div className="duration">{formatDuration(asset.duration)}</div>
              </div>
              <div className="info">
                <div className="title" title={asset.title}>
                  {asset.title}
                </div>
                <div className="meta">
                  <span className="model">{asset.model}</span>
                  <span className="date">{formatDate(asset.createdAt)}</span>
                </div>
              </div>
              <div className="actions">
                <button
                  onClick={() => handleAddToTimeline(asset)}
                  title="Add to Timeline"
                >
                  ➕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}
```

---

## 🎬 Timeline & Project Data Structure

### 1. Project File Format (.videoproj)

```typescript
// VideoEditorProject.ts

interface VideoEditorProject {
  version: string;           // "1.0"
  name: string;
  createdAt: string;
  modifiedAt: string;

  settings: {
    width: number;           // 1920
    height: number;          // 1080
    fps: number;             // 30
    sampleRate: number;      // 48000
    duration: number;        // total project duration in seconds
  };

  timeline: {
    tracks: Track[];
  };

  assets: {
    [assetId: string]: Asset;
  };

  audioMixing: {
    ducking: DuckingConfig;
    masterVolume: number;
  };

  export: {
    codec: string;           // h264_videotoolbox, h264_mf
    bitrate: number;         // 6000
    audioCodec: string;      // aac
    audioBitrate: number;    // 192
  };
}

interface Track {
  id: string;
  type: 'video' | 'audio';
  name: string;              // "V1", "A1", etc.
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

interface Clip {
  id: string;
  assetId: string;           // references assets object
  trackId: string;
  startTime: number;         // position in timeline (seconds)
  duration: number;          // visible duration (seconds)
  trimIn: number;            // trim from start (seconds)
  trimOut: number;           // trim from end (seconds)
  volume: number;            // 0.0 - 1.0
  speed: number;             // 0.5 - 2.0
  effects: Effect[];
}

interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  source: 'generated' | 'imported';

  // For generated media
  taskId?: string;           // backend task_id
  model?: string;

  // File info
  path: string;              // local path in workspace
  originalPath?: string;     // original URL if generated
  filename: string;
  format: string;

  // Metadata
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;

  // Cache
  thumbnailPath?: string;
  waveformData?: number[];   // for audio visualization
}

interface DuckingConfig {
  enabled: boolean;
  voiceoverTrackId: string;  // which track triggers ducking
  threshold: number;         // 0.03
  ratio: number;             // 6.0
  attack: number;            // 10ms
  release: number;           // 300ms
  makeupGain: number;        // 0dB
  backgroundGain: number;    // -1dB
}

interface Effect {
  type: 'fadeIn' | 'fadeOut' | 'transition' | 'speed';
  parameters: Record<string, any>;
}
```

### 2. Example Project JSON

```json
{
  "version": "1.0",
  "name": "My Video Project",
  "createdAt": "2026-01-20T10:00:00Z",
  "modifiedAt": "2026-01-20T11:30:00Z",
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "sampleRate": 48000,
    "duration": 45.0
  },
  "timeline": {
    "tracks": [
      {
        "id": "track-v1",
        "type": "video",
        "name": "V1",
        "clips": [
          {
            "id": "clip-1",
            "assetId": "asset-video-1",
            "trackId": "track-v1",
            "startTime": 0.0,
            "duration": 12.4,
            "trimIn": 0.0,
            "trimOut": 12.4,
            "volume": 0.8,
            "speed": 1.0,
            "effects": []
          },
          {
            "id": "clip-2",
            "assetId": "asset-video-2",
            "trackId": "track-v1",
            "startTime": 12.4,
            "duration": 17.0,
            "trimIn": 3.0,
            "trimOut": 20.0,
            "volume": 0.8,
            "speed": 1.0,
            "effects": []
          }
        ],
        "muted": false,
        "locked": false
      },
      {
        "id": "track-a1",
        "type": "audio",
        "name": "A1 (Voiceover)",
        "clips": [
          {
            "id": "clip-vo-1",
            "assetId": "asset-audio-1",
            "trackId": "track-a1",
            "startTime": 1.2,
            "duration": 25.0,
            "trimIn": 0.0,
            "trimOut": 25.0,
            "volume": 1.0,
            "speed": 1.0,
            "effects": []
          }
        ],
        "muted": false,
        "locked": false
      }
    ]
  },
  "assets": {
    "asset-video-1": {
      "id": "asset-video-1",
      "type": "video",
      "source": "generated",
      "taskId": "abc123-task-id",
      "model": "veo-3-1",
      "path": "C:/Users/user/SmartSpecPro/workspace/video-editor/abc123.mp4",
      "originalPath": "https://s3.../abc123.mp4",
      "filename": "abc123.mp4",
      "format": "mp4",
      "duration": 15.0,
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "thumbnailPath": "C:/.../abc123_thumb.jpg"
    },
    "asset-video-2": {
      "id": "asset-video-2",
      "type": "video",
      "source": "generated",
      "taskId": "def456-task-id",
      "model": "sora-2",
      "path": "C:/.../def456.mp4",
      "originalPath": "https://s3.../def456.mp4",
      "filename": "def456.mp4",
      "format": "mp4",
      "duration": 20.0,
      "width": 1920,
      "height": 1080,
      "fps": 30
    },
    "asset-audio-1": {
      "id": "asset-audio-1",
      "type": "audio",
      "source": "generated",
      "taskId": "ghi789-task-id",
      "model": "elevenlabs-tts",
      "path": "C:/.../ghi789.mp3",
      "originalPath": "https://s3.../ghi789.mp3",
      "filename": "ghi789.mp3",
      "format": "mp3",
      "duration": 25.0,
      "sampleRate": 48000,
      "waveformData": [0.1, 0.3, 0.5, ...]
    }
  },
  "audioMixing": {
    "ducking": {
      "enabled": true,
      "voiceoverTrackId": "track-a1",
      "threshold": 0.03,
      "ratio": 6.0,
      "attack": 10,
      "release": 300,
      "makeupGain": 0.0,
      "backgroundGain": -1.0
    },
    "masterVolume": 1.0
  },
  "export": {
    "codec": "h264_videotoolbox",
    "bitrate": 6000,
    "audioCodec": "aac",
    "audioBitrate": 192
  }
}
```

---

## ⚙️ Tauri Commands (Rust Backend)

### 1. FFmpeg Integration

```rust
// desktop-app/src-tauri/src/video_editor/ffmpeg.rs

use std::process::{Command, Stdio};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct MediaFileInfo {
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    sample_rate: Option<u32>,
    codec_video: Option<String>,
    codec_audio: Option<String>,
}

/// Get bundled FFmpeg path based on platform
fn get_ffmpeg_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let exe_dir = std::env::current_exe()
            .expect("Failed to get exe path")
            .parent()
            .expect("Failed to get exe dir")
            .to_path_buf();
        exe_dir.join("resources/ffmpeg/win/ffmpeg.exe")
    }

    #[cfg(target_os = "macos")]
    {
        let exe_dir = std::env::current_exe()
            .expect("Failed to get exe path")
            .parent()
            .expect("Failed to get exe dir")
            .to_path_buf();
        exe_dir.join("../Resources/ffmpeg/mac/ffmpeg")
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        panic!("Unsupported platform");
    }
}

/// Probe media file with ffprobe
#[tauri::command]
pub async fn ffmpeg_probe_file(path: String) -> Result<MediaFileInfo, String> {
    let ffprobe_path = get_ffmpeg_path()
        .parent()
        .unwrap()
        .join("ffprobe")
        .with_extension(std::env::consts::EXE_EXTENSION);

    let output = Command::new(ffprobe_path)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!("ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Extract info from JSON
    let format = &json["format"];
    let streams = json["streams"].as_array().unwrap_or(&vec![]);

    let video_stream = streams.iter()
        .find(|s| s["codec_type"] == "video");
    let audio_stream = streams.iter()
        .find(|s| s["codec_type"] == "audio");

    Ok(MediaFileInfo {
        duration: format["duration"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        width: video_stream
            .and_then(|s| s["width"].as_u64())
            .map(|v| v as u32),
        height: video_stream
            .and_then(|s| s["height"].as_u64())
            .map(|v| v as u32),
        fps: video_stream
            .and_then(|s| s["r_frame_rate"].as_str())
            .and_then(|s| parse_fps(s)),
        sample_rate: audio_stream
            .and_then(|s| s["sample_rate"].as_str())
            .and_then(|s| s.parse().ok()),
        codec_video: video_stream
            .and_then(|s| s["codec_name"].as_str())
            .map(|s| s.to_string()),
        codec_audio: audio_stream
            .and_then(|s| s["codec_name"].as_str())
            .map(|s| s.to_string()),
    })
}

/// Generate thumbnail from video
#[tauri::command]
pub async fn ffmpeg_generate_thumbnail(
    input_path: String,
    output_path: String,
    time_seconds: f64
) -> Result<(), String> {
    let ffmpeg_path = get_ffmpeg_path();

    let status = Command::new(ffmpeg_path)
        .args(&[
            "-ss", &time_seconds.to_string(),
            "-i", &input_path,
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            &output_path
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("Thumbnail generation failed".to_string());
    }

    Ok(())
}

/// Detect available H.264 encoders
#[tauri::command]
pub async fn ffmpeg_detect_encoders() -> Result<Vec<String>, String> {
    let ffmpeg_path = get_ffmpeg_path();

    let output = Command::new(ffmpeg_path)
        .args(&["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut encoders = Vec::new();

    // Check for hardware encoders first (preferred)
    if stdout.contains("h264_videotoolbox") {
        encoders.push("h264_videotoolbox".to_string());
    }
    if stdout.contains("h264_mf") {
        encoders.push("h264_mf".to_string());
    }
    if stdout.contains("h264_qsv") {
        encoders.push("h264_qsv".to_string());
    }
    if stdout.contains("h264_nvenc") {
        encoders.push("h264_nvenc".to_string());
    }
    if stdout.contains("libopenh264") {
        encoders.push("libopenh264".to_string());
    }

    if encoders.is_empty() {
        return Err("No suitable H.264 encoder found".to_string());
    }

    Ok(encoders)
}

fn parse_fps(fps_str: &str) -> Option<f64> {
    let parts: Vec<&str> = fps_str.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        Some(num / den)
    } else {
        fps_str.parse().ok()
    }
}
```

### 2. Render Engine

```rust
// desktop-app/src-tauri/src/video_editor/render.rs

use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderJob {
    pub id: String,
    pub project: VideoEditorProject,
    pub output_path: String,
    pub status: RenderStatus,
    pub progress: f64,  // 0.0 - 1.0
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderStatus {
    Pending,
    Rendering,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VideoEditorProject {
    pub settings: ProjectSettings,
    pub timeline: Timeline,
    pub assets: HashMap<String, Asset>,
    pub audio_mixing: AudioMixing,
    pub export: ExportSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub sample_rate: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Timeline {
    pub tracks: Vec<Track>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub r#type: String,  // "video" or "audio"
    pub clips: Vec<Clip>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub asset_id: String,
    pub start_time: f64,
    pub duration: f64,
    pub trim_in: f64,
    pub trim_out: f64,
    pub volume: f64,
    pub speed: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    pub path: String,
    pub r#type: String,  // "video", "audio"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioMixing {
    pub ducking: DuckingConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DuckingConfig {
    pub enabled: bool,
    pub voiceover_track_id: String,
    pub threshold: f64,
    pub ratio: f64,
    pub attack: f64,
    pub release: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportSettings {
    pub codec: String,
    pub bitrate: u32,
    pub audio_codec: String,
    pub audio_bitrate: u32,
}

pub struct RenderEngine {
    jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
}

impl RenderEngine {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start a render job
    #[tauri::command]
    pub async fn start_render(
        state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
        project_json: String,
        output_path: String
    ) -> Result<String, String> {
        let project: VideoEditorProject = serde_json::from_str(&project_json)
            .map_err(|e| format!("Invalid project JSON: {}", e))?;

        let job_id = Uuid::new_v4().to_string();

        let job = RenderJob {
            id: job_id.clone(),
            project,
            output_path: output_path.clone(),
            status: RenderStatus::Pending,
            progress: 0.0,
            error: None,
        };

        // Store job
        let engine = state.lock().unwrap();
        engine.jobs.lock().unwrap().insert(job_id.clone(), job.clone());

        // Spawn render task
        let jobs = Arc::clone(&engine.jobs);
        tokio::spawn(async move {
            Self::execute_render(jobs, job_id, job).await;
        });

        Ok(job_id)
    }

    /// Get render job status
    #[tauri::command]
    pub fn get_render_status(
        state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
        job_id: String
    ) -> Result<RenderJob, String> {
        let engine = state.lock().unwrap();
        let jobs = engine.jobs.lock().unwrap();

        jobs.get(&job_id)
            .cloned()
            .ok_or_else(|| "Job not found".to_string())
    }

    /// Cancel render job
    #[tauri::command]
    pub fn cancel_render(
        state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
        job_id: String
    ) -> Result<(), String> {
        let engine = state.lock().unwrap();
        let mut jobs = engine.jobs.lock().unwrap();

        if let Some(job) = jobs.get_mut(&job_id) {
            job.status = RenderStatus::Cancelled;
            Ok(())
        } else {
            Err("Job not found".to_string())
        }
    }

    async fn execute_render(
        jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
        job_id: String,
        mut job: RenderJob
    ) {
        // Update status to rendering
        job.status = RenderStatus::Rendering;
        jobs.lock().unwrap().insert(job_id.clone(), job.clone());

        // Generate FFmpeg command
        let ffmpeg_cmd = match Self::generate_ffmpeg_command(&job.project, &job.output_path) {
            Ok(cmd) => cmd,
            Err(e) => {
                job.status = RenderStatus::Failed;
                job.error = Some(e);
                jobs.lock().unwrap().insert(job_id, job);
                return;
            }
        };

        // Execute FFmpeg
        let ffmpeg_path = super::ffmpeg::get_ffmpeg_path();

        let mut child = match Command::new(ffmpeg_path)
            .args(&ffmpeg_cmd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                job.status = RenderStatus::Failed;
                job.error = Some(format!("Failed to spawn ffmpeg: {}", e));
                jobs.lock().unwrap().insert(job_id, job);
                return;
            }
        };

        // TODO: Parse progress from stderr
        // For now, wait for completion
        match child.wait() {
            Ok(status) if status.success() => {
                job.status = RenderStatus::Completed;
                job.progress = 1.0;
            }
            Ok(_) => {
                job.status = RenderStatus::Failed;
                job.error = Some("FFmpeg process failed".to_string());
            }
            Err(e) => {
                job.status = RenderStatus::Failed;
                job.error = Some(format!("Process error: {}", e));
            }
        }

        jobs.lock().unwrap().insert(job_id, job);
    }

    fn generate_ffmpeg_command(
        project: &VideoEditorProject,
        output_path: &str
    ) -> Result<Vec<String>, String> {
        let mut args = Vec::new();

        // Collect all input files
        let mut inputs = Vec::new();
        for track in &project.timeline.tracks {
            for clip in &track.clips {
                let asset = project.assets.get(&clip.asset_id)
                    .ok_or_else(|| format!("Asset not found: {}", clip.asset_id))?;

                if !inputs.contains(&asset.path) {
                    inputs.push(asset.path.clone());
                }
            }
        }

        // Add inputs
        for input in &inputs {
            args.push("-i".to_string());
            args.push(input.clone());
        }

        // Build filter_complex
        let filter = Self::build_filter_complex(project, &inputs)?;
        args.push("-filter_complex".to_string());
        args.push(filter);

        // Map outputs
        args.push("-map".to_string());
        args.push("[vout]".to_string());
        args.push("-map".to_string());
        args.push("[aout]".to_string());

        // Video codec
        args.push("-c:v".to_string());
        args.push(project.export.codec.clone());
        args.push("-b:v".to_string());
        args.push(format!("{}k", project.export.bitrate));
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());

        // Audio codec
        args.push("-c:a".to_string());
        args.push(project.export.audio_codec.clone());
        args.push("-b:a".to_string());
        args.push(format!("{}k", project.export.audio_bitrate));
        args.push("-ar".to_string());
        args.push(project.settings.sample_rate.to_string());

        // Output
        args.push("-y".to_string());  // Overwrite
        args.push(output_path.to_string());

        Ok(args)
    }

    fn build_filter_complex(
        project: &VideoEditorProject,
        inputs: &[String]
    ) -> Result<String, String> {
        // This is a simplified version - real implementation needs to:
        // 1. Process each clip (trim, scale, fps)
        // 2. Concat clips per track
        // 3. Apply ducking if enabled
        // 4. Mix audio tracks

        // For now, return a basic filter
        Ok(format!(
            "[0:v]scale={}:{}[vout];[0:a]aresample={}[aout]",
            project.settings.width,
            project.settings.height,
            project.settings.sample_rate
        ))
    }
}
```

### 3. Workspace Management

```rust
// desktop-app/src-tauri/src/video_editor/workspace.rs

use std::path::PathBuf;
use std::fs;

#[tauri::command]
pub fn get_video_editor_workspace_path() -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?;

    let workspace = home_dir
        .join("SmartSpecPro")
        .join("VideoEditor")
        .join("workspace");

    // Create if not exists
    fs::create_dir_all(&workspace)
        .map_err(|e| format!("Failed to create workspace: {}", e))?;

    Ok(workspace.to_string_lossy().to_string())
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

#[tauri::command]
pub async fn save_blob_to_file(blob: Vec<u8>, path: String) -> Result<(), String> {
    fs::write(&path, blob)
        .map_err(|e| format!("Failed to write file: {}", e))
}
```

---

## 🎯 Implementation Phases

### Phase 0: Foundation (1 week)
- [ ] Setup project structure (TypeScript services + Rust commands)
- [ ] Implement basic FFmpeg integration (probe, thumbnail generation)
- [ ] Create Media Library browser UI (list videos/audio)
- [ ] Implement download to workspace functionality
- [ ] Basic project data structure

### Phase 1: Timeline Editor (2 weeks)
- [ ] Timeline component with multi-track support
- [ ] Drag & drop from Media Library to Timeline
- [ ] Clip manipulation (move, resize, trim)
- [ ] Preview player with playback controls
- [ ] Project save/load (.videoproj format)

### Phase 2: Render Engine (1 week)
- [ ] FFmpeg command generator from project JSON
- [ ] Render job queue (Rust backend)
- [ ] Progress tracking and cancellation
- [ ] Hardware encoder detection
- [ ] Export dialog with settings

### Phase 3: Audio Mixing (1 week)
- [ ] Waveform visualization for audio tracks
- [ ] Volume controls per clip
- [ ] Audio ducking configuration UI
- [ ] Voiceover track designation
- [ ] Master volume control

### Phase 4: Polish & Testing (1 week)
- [ ] Keyboard shortcuts (Space, Ctrl+Z, etc.)
- [ ] Error handling and validation
- [ ] Performance optimization (thumbnail caching)
- [ ] Cross-platform testing (Windows/macOS)
- [ ] Documentation and tutorials

---

## 📦 Dependencies

### Frontend (package.json)
```json
{
  "dependencies": {
    "wavesurfer.js": "^7.0.0",          // Audio waveform
    "react-dnd": "^16.0.0",              // Drag & drop
    "react-dnd-html5-backend": "^16.0.0",
    "fabric": "^5.3.0",                  // Canvas manipulation
    "uuid": "^9.0.0"
  }
}
```

### Backend (Cargo.toml)
```toml
[dependencies]
tauri = "1.5"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1.0", features = ["v4"] }
dirs = "5.0"
```

---

## 🔐 Security Considerations

1. **File Access**
   - Whitelist workspace directory only
   - Validate all file paths (prevent directory traversal)
   - Sanitize user input

2. **FFmpeg Execution**
   - Use bundled binary only (not system ffmpeg)
   - Validate all command arguments
   - Timeout long-running processes

3. **Project Files**
   - Validate JSON schema before loading
   - Sandbox file paths within workspace
   - Limit file sizes

---

## 🎨 UI/UX Best Practices

1. **Responsive Design**
   - Minimum window size: 1280x720
   - Resizable panels with splitters
   - Remember layout preferences

2. **Keyboard Shortcuts**
   - Space: Play/Pause
   - Ctrl+Z: Undo
   - Ctrl+S: Save Project
   - Ctrl+E: Export
   - Delete: Remove selected clip
   - Arrow keys: Frame stepping

3. **Visual Feedback**
   - Loading spinners for async operations
   - Progress bars for downloads/renders
   - Toast notifications for success/errors
   - Drag preview for clips

4. **Performance**
   - Lazy load thumbnails
   - Virtual scrolling for long media lists
   - Debounce timeline updates
   - Cache waveform data

---

## 📊 Success Metrics

1. **Functionality**
   - ✅ Can import generated videos/audio
   - ✅ Can arrange clips on timeline
   - ✅ Can trim and adjust clips
   - ✅ Audio ducking works correctly
   - ✅ Export produces valid MP4 files

2. **Performance**
   - Timeline operations < 100ms
   - Preview playback smooth (30fps)
   - Export speed ~1-2x realtime
   - UI remains responsive during render

3. **Usability**
   - < 5 clicks to add clip from library
   - < 3 clicks to start export
   - Intuitive drag & drop
   - Clear visual feedback

---

## 🚀 Future Enhancements (Post-MVP)

1. **Effects & Transitions**
   - Cross-dissolve transitions
   - Ken Burns effect (zoom/pan)
   - Color grading
   - Speed ramping

2. **Advanced Audio**
   - Multi-track audio mixing
   - EQ and compression
   - Noise reduction
   - Audio effects (reverb, echo)

3. **Collaboration**
   - Cloud project sync
   - Share projects (JSON only, no media)
   - Version history

4. **Templates**
   - Pre-built project templates
   - Preset audio ducking profiles
   - Export presets (YouTube, Instagram, etc.)

---

## 📝 Documentation Deliverables

1. **User Guide**
   - Getting started tutorial
   - Feature documentation
   - Keyboard shortcuts reference

2. **Developer Guide**
   - Architecture overview
   - API documentation
   - Contributing guidelines

3. **Video Tutorials**
   - Basic editing workflow
   - Using Media Library
   - Audio ducking setup
   - Export settings

---

## ✅ Conclusion

แผนงานนี้ครอบคลุม:

1. ✅ **FFmpeg-only rendering** (ตามแผนเดิม)
2. ✅ **Media Library Integration** (ดึงวีดีโอ/เสียงที่เจนแล้ว)
3. ✅ **Professional Timeline Editor** (มาตรฐานอุตสาหกรรม)
4. ✅ **Audio Ducking** (เสียงชัด พูดชัด)
5. ✅ **100% Local** (ไม่อัปโหลด)
6. ✅ **Cross-platform** (Windows/macOS)

**ความเป็นไปได้: สูงมาก** - ใช้เทคโนโลยีที่พิสูจน์แล้ว (FFmpeg, Tauri, React) และมี Media Generation System ที่พร้อมใช้งานอยู่แล้ว

**ระยะเวลา: 6-8 สัปดาห์** สำหรับ MVP ที่ใช้งานได้จริง
