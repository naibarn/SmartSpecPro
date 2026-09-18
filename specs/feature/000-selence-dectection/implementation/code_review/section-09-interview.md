# Code Review Interview Transcript: Section 09

## User Decisions

### 1. FFmpeg Filter Injection Security Issue
**User Decision:** ✅ **Yes, add validation (Recommended)**

**Action:** Add `_safe_float_for_ffmpeg()` helper function to validate all float values before FFmpeg interpolation to prevent filter injection attacks.

### 2. Audio-Only Crossfade Logic
**User Decision:** ✅ **Fix crossfade logic (Recommended)**

**Action:** Properly rewrite the crossfade chaining logic (lines 196-218 in `_build_trim_concat_cmd`) to correctly chain `acrossfade` filters with proper output label management.

### 3. Missing Test Coverage
**User Decision:** ✅ **Yes, add missing tests (Recommended)**

**Action:** Add the following missing tests:
- Audio-only files skip video filters
- No crossfade at start/end boundaries
- Very short segments skip crossfade (hard cut fallback)
- Single keep segment produces trim only (no concat)

## Auto-Fixes (Low-Risk Improvements)

### 4. Add Codecs to Single-Segment Trim
**Rationale:** The single-segment trim path in `_build_trim_concat_cmd` (line 165-173) doesn't specify codecs, causing FFmpeg to re-encode. This is inconsistent with the multi-segment path.

**Auto-Fix:** Add `-c:v libx264 -c:a aac` to the single-segment command.

### 5. Fix Progress Reporting Order
**Rationale:** Progress is reported at 0.9 before verifying output exists. If FFmpeg succeeds but output doesn't exist, the 0.9 progress is misleading.

**Auto-Fix:** Move `report_progress(0.9, ...)` to after the output file existence check (after line 373).

### 6. Dynamic MIME Type
**Rationale:** The function hardcodes `mime: "video/mp4"` even for audio-only files.

**Auto-Fix:** Return dynamic MIME type based on `has_video` and `has_audio`:
- `video/mp4` if has_video
- `audio/mp4` if audio-only
- `video/mp4` as fallback

### 7. Crossfade Duration Calculation Fix
**Rationale:** Current implementation only checks previous segment duration, not next segment duration. This could produce crossfade longer than the next segment, causing FFmpeg failure.

**Auto-Fix:** Change line 206 from:
```python
seg_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]
fade_dur = min(crossfade_seconds, seg_duration, 0.5)
```

To:
```python
prev_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]
next_duration = keep_segments[i][1] - keep_segments[i][0]
fade_dur = min(crossfade_seconds, prev_duration, next_duration)
```

Also remove the arbitrary 0.5s cap.

## Implementation Plan

1. Add `_safe_float_for_ffmpeg()` helper after `_to_int()`
2. Rewrite `_build_trim_concat_cmd` audio crossfade logic
3. Apply auto-fixes (codecs, progress, MIME, crossfade duration)
4. Add 4 missing tests
5. Re-run full test suite
6. Re-stage changes

## Expected Test Count After Fixes
- **Before:** 20 tests
- **After:** 24 tests (added 4)
