# Silence Detection & Removal Feature

## Overview

Automatic silence detection and removal for video/audio editing with client-side preview and server-side processing capabilities.

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Release Date**: February 2026

## Quick Start

### Frontend Usage

```typescript
import { useSilenceDetection } from '@/contexts/SilenceDetectionContext';
import { useVideoPlayback } from '@/contexts/VideoPlaybackContext';

// Detect silence
const { detectSilence, silentRegions } = useSilenceDetection();
await detectSilence({ thresholdDb: -40, minSilenceMs: 500 });

// Preview with skip-silence mode
const { setSkipSilenceMode } = useVideoPlayback();
setSkipSilenceMode(true);

// Export to server for processing
await exportToTimeline({
  mode: 'remove',
  softeningBufferMs: 200,
  crossfade: true
});
```

### Backend API

```typescript
import { createMediaJobClient } from '@/services/mediaJobClient';

const client = await createMediaJobClient();
const result = await client.cutDeadAir(
  videoUri,
  [
    { startMs: 5000, endMs: 10000 },  // Silence segments to remove
    { startMs: 20000, endMs: 25000 }
  ],
  'remove',
  {
    softeningBufferMs: 200,  // Expand keep regions
    crossfade: true          // Smooth audio transitions
  }
);

console.log(`Removed ${result.derived.removedMs}ms of silence`);
```

## Features

### Client-Side Detection
- **Web Audio API** based analysis (no server round-trip)
- Configurable threshold (-40dB to -20dB)
- Minimum silence duration (100ms to 2000ms)
- Processes 30-minute video in <5 seconds

### Visual Tools
- **Waveform Overlay** - Semi-transparent silence indicators
- **Mini Timeline** - Virtualized view of 1000+ segments
- **Region List** - Sortable, filterable silence segments

### Preview Mode
- **Skip-Silence Playback** - Test removal without processing
- Instant preview (no encoding)
- Synchronized with waveform display

### Server-Side Export
- **FFmpeg Processing** - High-quality H.264 + AAC output
- **Softening Buffer** - Preserve context around speech (0-5000ms)
- **Audio Crossfade** - Smooth transitions between segments
- **VFR Detection** - Automatic handling of variable frame rate sources

## Architecture

```
┌─────────────────┐
│ Video Editor UI │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ SilenceDetectionContext │ ← State management
│  - detectSilence()      │
│  - silentRegions[]      │
│  - exportToTimeline()   │
└─────────┬───────────────┘
          │
          ├──► VideoPlaybackContext (skip-silence preview)
          │
          └──► MediaJobClient.cutDeadAir()
                      │
                      ▼
               ┌─────────────────────┐
               │ Python Backend      │
               │ handle_dead_air_cut │
               │  - FFmpeg commands  │
               │  - Progress reports │
               └─────────────────────┘
```

## API Reference

### Frontend

#### `useSilenceDetection()`

```typescript
interface SilenceDetectionHook {
  detectSilence: (options?: {
    thresholdDb?: number;    // -40 to -20, default: -40
    minSilenceMs?: number;   // 100 to 2000, default: 500
  }) => Promise<void>;

  silentRegions: SilenceRegion[];

  toggleRegion: (index: number) => void;

  exportToTimeline: (options: {
    mode: 'remove';
    softeningBufferMs?: number;  // 0 to 5000, default: 0
    crossfade?: boolean;         // default: false
  }) => Promise<void>;
}
```

### Backend

#### `MediaJobClient.cutDeadAir()`

```typescript
async cutDeadAir(
  assetUri: string,
  segments: Array<{ startMs: number; endMs: number }>,
  mode: "remove" | "compress" = "remove",
  options?: {
    softeningBufferMs?: number;  // Clamped to [0, 5000]
    crossfade?: boolean;
  }
): Promise<MediaJobResult>
```

#### `handle_dead_air_cut()` (Python)

```python
def handle_dead_air_cut(
    spec: MediaJobSpec,
    tmp_dir: str,
    report_progress: Optional[Callable[[float, str], None]] = None
) -> MediaJobResult:
    """
    Remove silence segments from video/audio file.

    Args:
        spec: Job specification with segments to remove
        tmp_dir: Working directory for temp files
        report_progress: Progress callback (progress, stage)

    Returns:
        MediaJobResult with artifacts and metadata
    """
```

## Performance

### Detection (Client-Side)
- **5min video**: <2 seconds
- **30min video**: <5 seconds
- **60min video**: <10 seconds
- **Memory**: <100MB

### Export (Server-Side)
- **Processing speed**: 1-2x realtime
- **10 segments**: ~10 seconds
- **100 segments**: ~60 seconds
- **Max segments**: 500 (enforced limit)
- **Memory**: <500MB typical, <1GB max

## Testing

### Unit Tests
```bash
# Frontend (28 tests)
cd apps/web
npm test -- mediaJobClient.test.ts

# Backend (23 tests)
cd python-backend
pytest tests/test_dead_air_cut.py -v
```

### Integration Tests
```bash
cd python-backend
pytest tests/test_dead_air_cut_integration.py -v

# Includes:
# - Basic silence removal
# - Softening buffer
# - Audio crossfade
# - Empty segments
# - Error handling
# - Performance (100 segments)
```

## Configuration

### Environment Variables

None required - uses existing FFmpeg installation.

### Limits

| Parameter | Min | Max | Default |
|-----------|-----|-----|---------|
| Threshold | -40dB | -20dB | -40dB |
| Min Silence Duration | 100ms | 2000ms | 500ms |
| Softening Buffer | 0ms | 5000ms | 0ms |
| Max Segments | 1 | 500 | - |
| Processing Timeout | - | 30 min | - |

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Too many segments` | >500 segments | Adjust threshold or min duration |
| `Segment bounds invalid` | start > end | Check detection logic |
| `Overlapping segments` | Segments overlap | Validate before export |
| `FFmpeg error` | Codec/format issue | Check input file |

### Error Codes

- `INVALID_SEGMENT_BOUNDS` - Segment validation failed
- `OVERLAPPING_SEGMENTS` - Segments conflict
- `TOO_MANY_SEGMENTS` - Exceeded 500 limit
- `FFMPEG_ERROR` - Processing failed

## Known Limitations

1. **Preview mode** doesn't apply to exports (client-side only)
2. **Export mode** only supports `remove` (no `compress` yet)
3. **Segment limit** capped at 500 per export
4. **Crossfade curve** always triangular (no custom curves)
5. **Output codecs** fixed to H.264 + AAC
6. **VFR sources** processed correctly but slower

## Troubleshooting

### No silence detected
- Lower threshold (try -45dB)
- Reduce min duration (try 300ms)
- Check audio track exists

### Export fails
- Verify segment count <500
- Check source video is valid
- Review backend logs: `python-backend/logs/`

### Crossfade sounds strange
- Reduce softening buffer
- Disable crossfade for hard cuts
- Verify segment boundaries are accurate

## Documentation

- **Usage Guide**: `specs/feature/selence-dectection/implementation/usage.md`
- **User Acceptance**: `specs/feature/selence-dectection/implementation/user_acceptance.md`
- **Performance**: `specs/feature/selence-dectection/implementation/performance_testing.md`
- **Section Plans**: `specs/feature/selence-dectection/sections/`

## Related Components

### Frontend
- `SilenceDetectionContext.tsx` - State management
- `SilenceDetectionDialog.tsx` - Main UI
- `SilentRegionList.tsx` - Region list component
- `SilenceWaveformOverlay.tsx` - Waveform visualization
- `SilenceMiniTimeline.tsx` - Timeline component
- `mediaJobClient.ts` - Backend integration

### Backend
- `media_job_worker.py` - Main handler
- `test_dead_air_cut.py` - Unit tests (23 tests)
- `test_dead_air_cut_integration.py` - Integration tests (7 tests)

## Support

- **Bug Reports**: GitHub Issues
- **Feature Requests**: GitHub Discussions
- **Documentation**: This file + usage guide

## Changelog

### v1.0.0 (February 2026)
- Initial release
- Client-side detection with Web Audio API
- Server-side FFmpeg processing
- Skip-silence preview mode
- Softening buffer support
- Audio crossfade support
- VFR source handling
- 51 total tests (28 frontend + 23 backend)
