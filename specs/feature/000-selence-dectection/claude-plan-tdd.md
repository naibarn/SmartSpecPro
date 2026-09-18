# Silence Detection (Dead Air Removal) — TDD Plan

This document mirrors `claude-plan.md` and defines what tests to write BEFORE implementing each section.

**Frontend:** Vitest (no existing video editor tests — we establish the pattern here)
**Backend:** pytest (80% coverage enforced, async support, existing `test_media_task_service.py` as reference)

---

## 3. Section 1: Type Extensions and Shared Logic

### Tests for `applyBufferToRegions()`

```typescript
// Test: returns adjusted times when buffer is applied (start + buffer, end - buffer)
// Test: marks region as skipped when buffer makes adjustedEnd <= adjustedStart
// Test: sets adjustedDuration to 0 for skipped regions
// Test: handles buffer of 0 (no change to original times)
// Test: handles buffer larger than half the region duration → region is skipped
// Test: processes multiple regions independently
// Test: preserves original startTime/endTime/duration fields
// Test: handles empty regions array → returns empty array
```

### Tests for `dbToPercent()`

```typescript
// Test: -60dB maps to 0%
// Test: -20dB maps to 100%
// Test: -40dB maps to 50%
// Test: values outside range still compute (no clamping) — returns negative or >100
```

---

## 4. Section 2: Dialog Component and Layout

### Tests for SilenceDetectionDialog

```typescript
// Test: dialog renders with header, settings zone, timeline zone, and footer
// Test: dialog calls onClose when X button clicked
// Test: dialog calls onClose when ESC key pressed (Radix Dialog)
// Test: "Export to Timeline" button is disabled when no analysis has been performed
// Test: "Export to Timeline" button is disabled when no regions are selected
// Test: responsive layout switches from side-by-side to stacked at 1280px breakpoint
```

### Tests for Sidebar Trigger (SilenceDetectionPanel)

```typescript
// Test: renders a trigger button with "Open Silence Detection" text
// Test: calls onOpenDialog callback when button clicked
```

### Tests for Waveform Data Availability

```typescript
// Test: triggers waveform_peaks job when asset.waveformData is undefined on dialog open
// Test: shows loading skeleton while waveform data is being fetched
// Test: shows "Waveform unavailable" message when waveform generation fails
// Test: does not trigger job when waveformData already exists
```

---

## 5. Section 3: Settings Panel and Detection Flow

### Tests for Settings UI

```typescript
// Test: threshold slider range is -60 to -20, default -40
// Test: threshold slider shows both dB and percentage values
// Test: minimum duration slider range is 0.1 to 5.0, default 0.5
// Test: softening buffer slider range is 0.0 to 2.0, default 0.2
// Test: all sliders are disabled while isAnalyzing is true
```

### Tests for Analyze Flow

```typescript
// Test: clicking Analyze sets isAnalyzing to true and disables Analyze button
// Test: Analyze calls detectDeadAir with correct thresholdDb and minSilenceMs
// Test: on successful result, maps silenceSegments to SilentRegion[] with correct fields
// Test: after detection, applies softening buffer via applyBufferToRegions
// Test: calculates and displays correct stats (total silence, active time, region count)
// Test: sets analysisComplete to true after successful analysis
// Test: sets analysisStage to 'error' on failure
```

### Tests for Analysis Cancellation

```typescript
// Test: AbortController.abort() is called when dialog unmounts during analysis
// Test: error message is shown when analysis times out
// Test: sliders are re-enabled after analysis error
```

### Tests for Buffer Change Re-analysis

```typescript
// Test: changing softening buffer after analysis re-runs applyBufferToRegions with new value
// Test: stats update after buffer change (skipped regions affect counts)
// Test: no backend call made when buffer changes (client-side only)
```

---

## 6. Section 4: Silence Region List Component

### Tests for SilenceRegionList

```typescript
// Test: renders one row per region
// Test: checkbox toggles selection via onToggleRegion
// Test: "Select All" calls onSelectAll
// Test: "Deselect All" calls onDeselectAll
// Test: skipped regions show "Skipped" badge and disabled checkbox
// Test: clicking a region row calls onScrollToRegion with regionId
// Test: expandable details show start, end, duration, dB, track name
```

---

## 7. Section 5: Waveform Overlay Component

### Tests for SilenceWaveformOverlay

```typescript
// Test: renders canvas element with correct dimensions
// Test: draws red rectangles for silent regions at correct positions (time → px conversion)
// Test: selected regions have different opacity (0.3) vs deselected (0.15)
// Test: selected regions have dashed cyan border
// Test: skipped regions show hatched pattern
// Test: playhead vertical line is drawn at correct position for currentTime
// Test: clicking on a region triggers onRegionClick with correct regionId
// Test: clicking outside regions triggers onSeek with correct time
// Test: canvas uses same sizing strategy as WaveformCanvas (width * dpr internal resolution)
```

---

## 8. Section 6: Mini-Timeline Component

### Tests for SilenceTimeline

```typescript
// Test: renders zoom controls, time ruler, thumbnail strip, and waveform area
// Test: zoom slider changes pixelsPerSecond (default 100, range 50-500)
// Test: time ruler tick intervals adjust based on zoom level (10s at 50px/s, 5s at 100px/s, 1s at 200+px/s)
// Test: virtualized rendering — canvas width does not exceed 16,384px regardless of duration * pixelsPerSecond
// Test: scroll position updates when playhead moves during playback
// Test: clicking timeline seeks to correct time position
```

---

## 9. Section 7: Preview Player Integration and Skip-Silence Mode

### Tests for Skip-Silence Logic

```typescript
// Test: when skip-silence is enabled and currentTime is inside a silent region, seeks to adjustedEndTime
// Test: when skip-silence is disabled, no seeking occurs even if currentTime is in a silent region
// Test: does not skip to regions that are deselected
// Test: does not skip to regions that are marked as skipped
// Test: cooldown prevents infinite loop — does not re-skip within 100ms of last skip
// Test: does not skip when currentTime is within 50ms of a region's adjustedEndTime (guard)
// Test: binary search finds correct region for given currentTime
// Test: binary search returns null for time outside all regions
```

### Tests for Bidirectional Sync

```typescript
// Test: clicking waveform updates playbackTime (waveform → preview direction)
// Test: playbackTime changes update playhead position on waveform (preview → waveform direction)
```

---

## 10. Section 8: Export to Timeline Logic

### Tests for Clip Split Logic

```typescript
// Test: splitting a clip at its midpoint creates two clips with correct trimIn/trimOut
//   Input: { startTime: 2.0, duration: 8.0, trimIn: 1.0, trimOut: 9.0 }
//   Split at 6.0 → Left: { trimIn: 1.0, trimOut: 5.0 }, Right: { trimIn: 5.0, trimOut: 9.0 }
// Test: splitting at clip start returns original clip unchanged
// Test: splitting at clip end returns original clip unchanged
// Test: both split clips reference the same assetId
// Test: split clip durations sum to original duration
// Test: split clip trimIn/trimOut values are absolute positions in source (not deltas)
```

### Tests for Region Removal (Reverse-Order Processing)

```typescript
// Test: single region removed from single clip → clip is split, silent portion removed
// Test: multiple non-overlapping regions processed in reverse order → correct splits
// Test: region that spans entire clip → clip is removed entirely
// Test: region that starts before clip → only overlapping portion is removed
// Test: region that ends after clip → only overlapping portion is removed
// Test: no regions selected → project unchanged
```

### Tests for Ripple Delete

```typescript
// Test: after removal, remaining clips are repositioned sequentially (no gaps)
// Test: ripple delete preserves clip order
// Test: ripple delete works with multiple tracks
```

### Tests for Track-Type-Specific Behavior

```typescript
// Test: audio/video clips use trimIn/trimOut split logic
// Test: text/overlay clips split by adjusting startTime/duration only (no trimIn/trimOut changes)
// Test: muted tracks are excluded from "apply to all tracks"
// Test: locked tracks are excluded from "apply to all tracks"
```

### Tests for Undo Integration

```typescript
// Test: export to timeline adds exactly one entry to history
// Test: undo after export restores entire pre-export project state
```

---

## 11. Section 9: Backend `dead_air_cut` Handler

### Tests for Input Validation

```python
# Test: rejects segments with startMs > endMs
# Test: rejects segments with negative startMs
# Test: rejects segments with endMs exceeding file duration
# Test: rejects overlapping segments
# Test: rejects more than 500 segments
# Test: clamps softeningBufferMs to [0, 5000]
# Test: rejects unknown mode (only "remove" allowed)
# Test: all timestamp values are cast to int/float (no string injection)
```

### Tests for Keep Segment Calculation

```python
# Test: inverts silence segments to produce keep segments
#   Input: duration=30s, silence=[(5, 10), (20, 25)]
#   Output: keep=[(0, 5), (10, 20), (25, 30)]
# Test: handles silence at start of file (keep starts after silence)
# Test: handles silence at end of file (keep ends before silence)
# Test: handles single silence segment
# Test: handles no silence segments → entire file is one keep segment
# Test: applies softening buffer to keep segment boundaries
```

### Tests for FFmpeg Command Building

```python
# Test: select/aselect approach builds correct between() expressions for keep segments
# Test: probed frame rate is used in setpts filter (not hardcoded)
# Test: trim/concat approach builds correct filter_complex for crossfade mode
# Test: crossfade duration is min(softeningBufferMs * 2, shortest_keep_segment) / 1000
# Test: no crossfade at file start/end boundaries
# Test: very short keep segments skip crossfade (hard cut fallback)
# Test: audio-only files skip video filters
```

### Tests for Edge Cases

```python
# Test: empty segments list → returns input file as-is
# Test: single keep segment → just trim, no concat
# Test: VFR source → falls back to trim+concat approach
```

### Tests for Output

```python
# Test: returns artifact with correct path, kind, and mime
# Test: derived metadata has correct originalDurationMs, outputDurationMs, removedMs, segmentCount
```

---

## 12. Section 10: MediaJobClient Updates

### Tests for cutDeadAir

```typescript
// Test: cutDeadAir includes softeningBufferMs in job spec params
// Test: cutDeadAir includes crossfade flag in job spec params
// Test: cutDeadAir defaults softeningBufferMs to 0 when not provided
// Test: cutDeadAir defaults crossfade to false when not provided
```
