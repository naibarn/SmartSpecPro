# User Acceptance Testing - Silence Detection Feature

## Overview

This document provides a comprehensive checklist for verifying that the silence detection feature meets all requirements and works correctly in production-like conditions.

## Test Environment

- **Backend**: Python 3.11+ with FFmpeg installed
- **Frontend**: Node.js with React
- **Browser**: Chrome, Firefox, Safari (test on all)
- **Test Files**: Sample videos with known silence patterns

## Acceptance Criteria

### 1. Silence Detection (Frontend)

#### 1.1 Settings Panel
- [ ] **AC-1.1.1**: User can adjust threshold from -40dB to -20dB
- [ ] **AC-1.1.2**: User can set min silence duration from 100ms to 2000ms
- [ ] **AC-1.1.3**: Settings are persisted between sessions
- [ ] **AC-1.1.4**: "Detect Silence" button triggers analysis
- [ ] **AC-1.1.5**: Loading indicator shows during detection

#### 1.2 Detection Accuracy
- [ ] **AC-1.2.1**: Silent regions are correctly identified with default settings (-40dB, 500ms)
- [ ] **AC-1.2.2**: Adjusting threshold changes detected regions appropriately
- [ ] **AC-1.2.3**: Very short silence (<100ms) is ignored
- [ ] **AC-1.2.4**: Detection completes within 5 seconds for 30-minute video

#### 1.3 Region List
- [ ] **AC-1.3.1**: All detected silence regions appear in list
- [ ] **AC-1.3.2**: Start time, duration, and status (keep/remove) are displayed
- [ ] **AC-1.3.3**: Clicking a region seeks video to that timestamp
- [ ] **AC-1.3.4**: List is paginated for >50 regions
- [ ] **AC-1.3.5**: User can toggle individual regions between keep/remove

### 2. Visual Representation

#### 2.1 Waveform Overlay
- [ ] **AC-2.1.1**: Silence regions show as semi-transparent overlays on waveform
- [ ] **AC-2.1.2**: Overlays sync with video playback position
- [ ] **AC-2.1.3**: Color coding distinguishes silence (red) vs keep (default)
- [ ] **AC-2.1.4**: Clicking overlay seeks to that position

#### 2.2 Mini Timeline
- [ ] **AC-2.2.1**: Timeline shows distribution of keep/remove segments
- [ ] **AC-2.2.2**: User can zoom in/out
- [ ] **AC-2.2.3**: Panning works for zoomed-in view
- [ ] **AC-2.2.4**: Segment count and duration stats are accurate
- [ ] **AC-2.2.5**: Virtualized rendering handles 1000+ segments smoothly

### 3. Preview Mode (Client-Side)

#### 3.1 Skip-Silence Playback
- [ ] **AC-3.1.1**: Toggle skip-silence mode on/off
- [ ] **AC-3.1.2**: Playback skips over marked silence regions
- [ ] **AC-3.1.3**: No processing delay - preview is instant
- [ ] **AC-3.1.4**: Pause/resume works correctly in skip mode
- [ ] **AC-3.1.5**: Seeking works correctly in skip mode

#### 3.2 Preview Limitations
- [ ] **AC-3.2.1**: Preview mode does NOT modify exported video
- [ ] **AC-3.2.2**: UI clearly indicates preview is temporary

### 4. Server-Side Export

#### 4.1 Export Dialog
- [ ] **AC-4.1.1**: "Export to Timeline" button is visible
- [ ] **AC-4.1.2**: User can configure softening buffer (0-5000ms)
- [ ] **AC-4.1.3**: User can toggle crossfade on/off
- [ ] **AC-4.1.4**: Export shows progress bar
- [ ] **AC-4.1.5**: Cancel button stops processing

#### 4.2 Basic Silence Removal
- [ ] **AC-4.2.1**: Export removes marked silence segments
- [ ] **AC-4.2.2**: Output video duration is reduced by removed time
- [ ] **AC-4.2.3**: Keep segments are concatenated correctly
- [ ] **AC-4.2.4**: Output video is playable
- [ ] **AC-4.2.5**: Audio and video stay in sync

#### 4.3 Softening Buffer
- [ ] **AC-4.3.1**: Buffer expands keep regions (shrinks silence)
- [ ] **AC-4.3.2**: 200ms buffer leaves 200ms on each side of keep regions
- [ ] **AC-4.3.3**: Buffer prevents abrupt cuts
- [ ] **AC-4.3.4**: Overlapping buffer regions merge correctly

#### 4.4 Audio Crossfade
- [ ] **AC-4.4.1**: Crossfade creates smooth transitions between segments
- [ ] **AC-4.4.2**: Crossfade duration is limited to shortest adjacent segment
- [ ] **AC-4.4.3**: No audio pops or clicks at transitions
- [ ] **AC-4.4.4**: Crossfade works with buffer option

#### 4.5 Output Quality
- [ ] **AC-4.5.1**: Output video uses H.264 codec
- [ ] **AC-4.5.2**: Output audio uses AAC codec
- [ ] **AC-4.5.3**: Video quality matches input (no visible degradation)
- [ ] **AC-4.5.4**: File size is appropriate for output duration

### 5. Error Handling

#### 5.1 Input Validation
- [ ] **AC-5.1.1**: Rejects segments with start > end
- [ ] **AC-5.1.2**: Rejects negative timestamps
- [ ] **AC-5.1.3**: Rejects overlapping segments
- [ ] **AC-5.1.4**: Rejects >500 segments with clear error message
- [ ] **AC-5.1.5**: Error messages are user-friendly

#### 5.2 Processing Errors
- [ ] **AC-5.2.1**: Handles FFmpeg errors gracefully
- [ ] **AC-5.2.2**: Handles missing input files
- [ ] **AC-5.2.3**: Handles corrupted video files
- [ ] **AC-5.2.4**: Handles timeout for very large files
- [ ] **AC-5.2.5**: Shows meaningful error messages to user

### 6. Performance

#### 6.1 Detection Speed
- [ ] **AC-6.1.1**: 30-minute video analyzed in <5 seconds
- [ ] **AC-6.1.2**: UI remains responsive during detection
- [ ] **AC-6.1.3**: Can cancel detection mid-process

#### 6.2 Export Speed
- [ ] **AC-6.2.1**: Processing runs at 1-2x realtime speed
- [ ] **AC-6.2.2**: 100 segments process within 30 seconds
- [ ] **AC-6.2.3**: Progress updates at least every 2 seconds
- [ ] **AC-6.2.4**: Stage labels show current operation

#### 6.3 Resource Usage
- [ ] **AC-6.3.1**: Memory usage stays below 1GB for typical videos
- [ ] **AC-6.3.2**: FFmpeg processes are cleaned up after completion
- [ ] **AC-6.3.3**: No memory leaks during multiple exports

### 7. Edge Cases

#### 7.1 Boundary Conditions
- [ ] **AC-7.1.1**: Video with NO silence detected returns original
- [ ] **AC-7.1.2**: Video with ALL silence is handled gracefully
- [ ] **AC-7.1.3**: Empty segments list returns original video
- [ ] **AC-7.1.4**: Single segment covering entire video works

#### 7.2 Special Formats
- [ ] **AC-7.2.1**: Variable frame rate (VFR) videos are detected and handled
- [ ] **AC-7.2.2**: Audio-only files are processed correctly
- [ ] **AC-7.2.3**: Videos with multiple audio tracks use first track
- [ ] **AC-7.2.4**: Videos without audio show appropriate error

### 8. Integration

#### 8.1 Frontend-Backend Communication
- [ ] **AC-8.1.1**: MediaJobClient sends correct params
- [ ] **AC-8.1.2**: Progress updates flow from backend to frontend
- [ ] **AC-8.1.3**: Job completion triggers UI update
- [ ] **AC-8.1.4**: Errors are propagated to frontend

#### 8.2 Data Flow
- [ ] **AC-8.2.1**: Silence regions from detection match export input
- [ ] **AC-8.2.2**: softening_buffer_ms is clamped to [0, 5000]
- [ ] **AC-8.2.3**: Crossfade flag is boolean
- [ ] **AC-8.2.4**: Result metadata (removedMs, outputDurationMs) is accurate

## Test Scenarios

### Scenario 1: Podcast with 3-minute intro music
1. Load podcast episode with long intro
2. Detect silence with default settings
3. Verify intro is NOT detected (music isn't silence)
4. Manually mark intro as removal segment
5. Export with 200ms buffer
6. Verify intro is removed, main content starts immediately

### Scenario 2: Interview with long pauses
1. Load interview video
2. Detect silence with -35dB, 1000ms min
3. Verify pauses >1s are detected
4. Toggle preview mode
5. Verify playback skips pauses
6. Export with crossfade enabled
7. Verify smooth transitions between speech segments

### Scenario 3: Webinar with many small gaps
1. Load webinar with frequent short silences
2. Detect silence with -40dB, 300ms min
3. Verify 50+ silence regions detected
4. Export with 100ms buffer
5. Verify processing completes within 30 seconds
6. Verify output is smooth without abrupt cuts

### Scenario 4: Screen recording with dead air at start/end
1. Load screen recording
2. Detect silence
3. Verify start and end dead air are detected
4. Export with no buffer, no crossfade
5. Verify video starts and ends without dead air

## Success Criteria

**All tests must PASS** for the feature to be considered production-ready.

### Critical (Must Pass)
- All AC-1.2.x (detection accuracy)
- All AC-4.2.x (basic removal)
- All AC-5.x (error handling)
- AC-6.1.1, AC-6.2.1 (performance)

### High Priority (Should Pass)
- All AC-2.x (visual representation)
- All AC-4.3.x, AC-4.4.x (buffer & crossfade)
- All AC-7.x (edge cases)

### Medium Priority (Nice to Have)
- All AC-3.x (preview mode)
- AC-6.2.2, AC-6.3.x (optimization)

## Sign-Off

- [ ] **Product Owner**: Feature meets requirements _______________
- [ ] **QA Lead**: All tests passed _______________
- [ ] **Tech Lead**: Implementation is sound _______________
- [ ] **User**: Feature works as expected _______________

## Notes

Record any issues, edge cases, or observations during testing:

```
[Date] [Tester] -
```
