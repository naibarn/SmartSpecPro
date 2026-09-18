# Silence Detection Feature - Usage Guide

## Overview

This feature adds comprehensive silence detection and removal capabilities to the video editor, with both client-side preview and server-side processing options.

## What Was Built

### Frontend Components (Sections 01-08)

1. **Settings Panel** - Configure silence detection parameters
2. **Silent Region List** - Browse and manage detected silence segments
3. **Waveform Overlay** - Visual representation of silence on audio waveform
4. **Mini Timeline** - Interactive timeline showing keep/remove segments
5. **Preview Player** - Test silence removal with skip-silence playback mode
6. **Export Integration** - Apply silence removal to final renders

### Backend Processing (Sections 09-10)

1. **`dead_air_cut` Handler** - FFmpeg-based silence removal with crossfade support
2. **MediaJobClient Updates** - Client interface for server-side processing

## Feature Capabilities

### Silence Detection
- **Threshold**: -40dB to -20dB (configurable)
- **Min Duration**: 100ms to 2000ms minimum silence length
- **Auto-detection**: Analyze audio tracks to find silence segments
- **Manual editing**: Add, remove, or adjust silence boundaries

### Silence Removal

#### Preview Mode (Client-Side)
- **Skip-Silence Playback**: Play video with silence skipped in real-time
- **No Processing**: Instant preview without re-encoding
- **Limitations**: Preview only, not applied to exports

#### Server-Side Export
- **Permanent Removal**: Actually cuts silence from video file
- **Softening Buffer**: 0-5000ms buffer to expand keep regions
- **Audio Crossfade**: Smooth transitions between keep segments
- **FFmpeg Processing**: High-quality re-encoding with libx264 + AAC

### Visual Tools

**Waveform Overlay**
- Displays detected silence as semi-transparent overlays
- Color-coded: silence regions vs keep regions
- Synchronized with video playback
- Interactive: click to seek to specific times

**Mini Timeline**
- Virtualized rendering for 1000+ segments
- Zooming and panning
- Visual representation of keep/remove distribution
- Segment count and duration stats

**Region List**
- Sortable table of all silence segments
- Show start time, duration, and keep/remove status
- Pagination for large lists
- Quick navigation by clicking rows

## Usage Examples

### Basic Silence Detection

```typescript
import { useSilenceDetection } from '@/contexts/SilenceDetectionContext';

const { detectSilence, silentRegions } = useSilenceDetection();

// Detect silence with default settings
await detectSilence();

// Use custom settings
await detectSilence({
  thresholdDb: -35,
  minSilenceMs: 500
});

console.log(`Found ${silentRegions.length} silence segments`);
```

### Preview with Skip-Silence

```typescript
import { useVideoPlayback } from '@/contexts/VideoPlaybackContext';

const { setSkipSilenceMode, play } = useVideoPlayback();

// Enable skip-silence mode
setSkipSilenceMode(true);

// Play will automatically skip over detected silence
play();
```

### Export to Timeline (Server-Side Processing)

```typescript
import { exportToTimeline } from '@/components/videoeditor/SilenceDetectionDialog';

// Export with basic settings
await exportToTimeline({
  mode: 'remove', // Remove detected silence
  softeningBufferMs: 0,
  crossfade: false
});

// Export with smoothing
await exportToTimeline({
  mode: 'remove',
  softeningBufferMs: 200, // 200ms buffer to preserve more audio
  crossfade: true // Smooth audio transitions
});
```

### Backend API Usage

```typescript
import { createMediaJobClient } from '@/services/mediaJobClient';

const client = await createMediaJobClient();

// Cut silence from video
const result = await client.cutDeadAir(
  'https://example.com/video.mp4',
  [
    { startMs: 5000, endMs: 10000 },
    { startMs: 20000, endMs: 25000 }
  ],
  'remove',
  {
    softeningBufferMs: 200,
    crossfade: true
  }
);

console.log(`Removed ${result.derived.removedMs}ms of silence`);
console.log(`Output: ${result.derived.outputDurationMs}ms`);
```

## Configuration

### Detection Settings

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `thresholdDb` | -40 to -20 | -40 | Audio level below which is considered silence |
| `minSilenceMs` | 100 to 2000 | 500 | Minimum duration for a segment to be considered silence |

### Export Settings

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `mode` | `remove` | `remove` | Operation mode (currently only `remove` supported) |
| `softeningBufferMs` | 0 to 5000 | 0 | Buffer to expand keep regions (shrink silence) |
| `crossfade` | `true`/`false` | `false` | Enable audio crossfade between segments |

## Performance Characteristics

### Detection
- **Speed**: ~1-2 seconds for 30-minute video
- **Memory**: Minimal (processes audio stream)
- **Accuracy**: Depends on threshold and min duration settings

### Preview Mode
- **Latency**: Instant (no processing)
- **Overhead**: Negligible (calculation only during playback)
- **Limitations**: Cannot export with skip-silence preview

### Server-Side Processing
- **Speed**: Real-time to 2x (depends on segment count)
- **Max Segments**: 500 (enforced by backend)
- **Timeout**: 30 minutes
- **Memory**: Scales with video resolution

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ SilenceDetectionDialog (UI Container)              │
│  ├── SettingsPanel                                 │
│  ├── SilentRegionList                              │
│  ├── SilenceWaveformOverlay                        │
│  ├── SilenceMiniTimeline                           │
│  └── PreviewPlayer                                 │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ SilenceDetectionContext (State Management)         │
│  - Silence detection logic                         │
│  - Region management (add/remove/toggle)           │
│  - Settings storage                                │
│  - Export coordination                             │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ VideoPlaybackContext (Preview Mode)                │
│  - Skip-silence playback                           │
│  - Real-time segment skipping                      │
│  - Synchronized with waveform                      │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ MediaJobClient (Backend Integration)               │
│  - cutDeadAir() method                             │
│  - Progress tracking                               │
│  - Result handling                                 │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ Python Backend (FFmpeg Processing)                 │
│  - handle_dead_air_cut() handler                   │
│  - FFmpeg command generation                       │
│  - Crossfade logic                                 │
│  - Progress reporting                              │
└─────────────────────────────────────────────────────┘
```

## Testing

### Frontend Tests
```bash
cd apps/web
npm test -- SilenceDetectionDialog.test
npm test -- settingsDetection.test
```

### Backend Tests
```bash
cd python-backend
source .venv/bin/activate
pytest tests/test_dead_air_cut.py -v
```

## Known Limitations

1. **Preview Mode**: Skip-silence preview doesn't apply to exports
2. **Export Mode**: Only `remove` mode supported (no `compress` yet)
3. **Segment Limit**: Maximum 500 silence segments per export
4. **Crossfade**: Always uses triangular curve (no other curves)
5. **Codecs**: Always outputs H.264 + AAC (no codec options)
6. **VFR Sources**: Automatically detected and handled, but may be slower

## Future Enhancements

- Compress mode (reduce silence duration instead of removing)
- Custom crossfade curves (exponential, logarithmic)
- Codec selection for exports
- Batch processing for multiple videos
- Machine learning-based silence detection
- Voice activity detection (VAD) integration

## Troubleshooting

### "No silence detected"
- Try lowering `thresholdDb` (e.g., -45dB)
- Reduce `minSilenceMs` (e.g., 300ms)
- Check audio track exists and has content

### "Export fails with FFmpeg error"
- Check segment count (max 500)
- Verify source video is valid
- Check backend logs for details

### "Crossfade sounds strange"
- Reduce `softeningBufferMs` (try 100ms)
- Disable crossfade for hard cuts
- Check segment boundaries are accurate

## Support

- **Bug Reports**: See project issue tracker
- **Feature Requests**: Submit via GitHub
- **Documentation**: This file and inline JSDoc comments
