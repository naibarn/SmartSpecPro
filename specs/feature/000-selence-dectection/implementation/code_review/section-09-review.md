# Code Review: Section 09 - Backend `dead_air_cut` Handler

## Critical Issues

### 1. FFmpeg Filter Injection Vulnerability (HIGH SEVERITY)
**Location:** `_build_select_aselect_cmd` (lines 132-133) and `_build_trim_concat_cmd` (lines 169, 183, 186)

**Problem:** Float values from user input are directly interpolated into FFmpeg filter strings using f-strings without validation. While `_to_int()` is used on the initial `startMs`/`endMs` values, the converted segments are used in float arithmetic and could still contain malicious values through buffer manipulation or edge cases.

**Example Attack Vector:**
```python
# Buffer calculation could produce:
buffered_start = start + buffer_seconds  # If manipulated, could inject
f"trim=start={start:.6f}:end={end:.6f}"  # Directly interpolated
```

**Missing:** The plan requires checking for `SHELL_METACHAR_RE` on all values before FFmpeg interpolation (Section 5 step 1), but this is never done after int-to-float conversion.

### 2. Audio-Only Crossfade Logic Broken (MEDIUM SEVERITY)
**Location:** `_build_trim_concat_cmd` lines 196-218

**Problem:** The crossfade chaining logic has several bugs:
- Line 198: `filter_parts.append(f"{audio_labels[0]}acopy[aout]")` — `acopy` is not a valid FFmpeg filter (should be `acopy` as a codec, not a filter)
- Line 212: Tries to use `acrossfade` then falls back to `concat`, but the output label management is broken — `current_label` becomes `[afade{i}]` but subsequent iterations expect the previous output
- The logic doesn't handle the final segment correctly when chaining multiple crossfades

### 3. Missing Test Coverage (MEDIUM SEVERITY)
**Plan Requirement:** Section 2 specifies tests for:
- "no crossfade at file start/end boundaries" — NOT TESTED
- "very short keep segments skip crossfade (hard cut fallback)" — NOT TESTED
- "audio-only files skip video filters" — NOT TESTED
- "single keep segment produces just a trim, no concat" — NOT TESTED (only VFR case partially tests trim_concat)

**Impact:** Core crossfade edge cases and audio-only handling are untested, yet the implementation has bugs in exactly these areas.

### 4. Incorrect Empty Segments Handling (LOW-MEDIUM SEVERITY)
**Location:** `handle_dead_air_cut` lines 292-305

**Problem:** When segments=[], the function returns the input file unchanged without running FFmpeg. However, the plan (Section 5 step 3) says to return the file "as-is (no encoding needed)", but then calculates `outputDurationMs` and `segmentCount` as if processing occurred.

**Issue:** The returned `segmentCount: 1` is semantically incorrect — there are zero silence segments and zero keep segments created. The entire file is one implicit keep segment, but this wasn't calculated via `_calculate_keep_segments`.

### 5. Duration Validation Off-By-100ms (LOW SEVERITY)
**Location:** Line 314 `if end_ms > duration_ms + 100:`

**Problem:** Plan says "100ms tolerance for rounding" but doesn't explain why 100ms is acceptable. An attacker could craft segments that are 99ms beyond the file duration, potentially causing FFmpeg to read past EOF or produce corrupt output.

**Better approach:** Clamp `end_ms` to `duration_ms` instead of rejecting, or reduce tolerance to 10ms.

## Missing Features from Plan

### 6. No VFR Detection Fallback Test
**Plan Requirement:** Section 2 - "VFR source falls back to trim+concat approach" with detection via "r_frame_rate differs from avg_frame_rate significantly"

**Implementation:** VFR detection is implemented (lines 94-107) BUT the 5% threshold is arbitrary and untested. No test verifies that a file with `r_frame_rate=30/1` and `avg_frame_rate=25/1` triggers VFR mode.

### 7. Missing Progress Reporting After FFmpeg
**Plan Requirement:** Section 5 step 12 - "Report progress at 0.9 after encoding"

**Implementation:** Line 371 calls `report_progress(job_id, 0.9, "finalizing", "Finalizing output")` AFTER checking if output exists. If FFmpeg succeeds but output doesn't exist, the progress is still reported at 0.9 before the RuntimeError. This is misleading — should report 0.9 only after confirming output exists.

## Code Quality Issues

### 8. Single Segment Trim Logic Doesn't Use Codecs
**Location:** `_build_trim_concat_cmd` lines 165-173

**Problem:** When `len(keep_segments) == 1`, the function uses `-vf` and `-af` for trim filters, but doesn't specify codecs (`-c:v`, `-c:a`). This defaults to re-encoding, which is inconsistent with the multi-segment path that explicitly uses `libx264` and `aac`.

**Better:** Always specify codecs, even for single-segment case.

### 9. Crossfade Duration Calculation Ignores Next Segment
**Location:** Line 206 `seg_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]`

**Problem:** Crossfade duration is capped by the PREVIOUS segment only, not the next segment. If segment N is 10s and segment N+1 is 0.1s, the crossfade could be 0.5s, which is 5x longer than the next segment — this would fail in FFmpeg.

**Plan Says:** "min(crossfade_seconds, duration_of_segment_i, duration_of_segment_i+1)" but implementation only checks segment i-1.

### 10. Hardcoded 0.5s Max Crossfade
**Location:** Line 206 `fade_dur = min(crossfade_seconds, seg_duration, 0.5)`

**Problem:** The 0.5s max is not in the plan and is arbitrary. Plan says crossfade duration should be `min(softeningBufferMs * 2, shortest_keep_segment_duration_ms) / 1000` (Section 5 step 9). The 0.5s cap prevents user-specified longer crossfades.

### 11. Incorrect MIME Type for Audio-Only Files
**Location:** Lines 379, 298 — hardcoded `"mime": "video/mp4"`

**Problem:** If `has_video=False`, the output is an audio file (likely `.m4a` or `.aac`), not `video/mp4`. The MIME type should be dynamically determined based on the media info.

## Security Concerns Summary

| Issue | Severity | Exploitable? |
|-------|----------|-------------|
| FFmpeg filter injection (float interpolation) | HIGH | Potentially — requires crafted buffer/duration values |
| No shell metachar check after float conversion | HIGH | Yes — plan explicitly requires this check |
| Segment count limit (500) | Compliant | No — correctly implemented |
| Buffer clamping [0, 5000] | Compliant | No — correctly implemented |
| Stderr sanitization | Compliant | No — correctly uses `_sanitize_stderr()` |
| No shell=True | Compliant | No — uses list form correctly |

## Test Coverage Gap Analysis

**Plan Specified 23 Tests Across 5 Classes**

**Implemented: 17 tests** (missing 6 critical tests)

| Missing Test | Impact |
|--------------|--------|
| Audio-only files skip video filters | Audio-only files may fail or encode incorrectly |
| No crossfade at start/end boundaries | Crossfade may be applied where it shouldn't |
| Very short segments skip crossfade | May crash FFmpeg with invalid filter |
| Single keep segment (trim only) | Untested code path — concat may run unnecessarily |
| Crossfade duration calculation | Wrong duration may cause FFmpeg error |
| VFR frame rate difference threshold | VFR detection may not trigger when needed |

## Recommendations

### Immediate Fixes Required (Before Merge)

1. **Add float value validation** before FFmpeg interpolation:
   ```python
   def _safe_float_for_ffmpeg(val: float) -> str:
       s = f"{val:.6f}"
       if SHELL_METACHAR_RE.search(s):
           raise ValueError(f"Invalid FFmpeg value: {s}")
       return s
   ```

2. **Fix audio-only crossfade logic** — rewrite lines 196-218 to properly chain `acrossfade` outputs.

3. **Add missing tests** — at minimum, add tests for audio-only, crossfade boundary conditions, and single-segment trim.

4. **Fix crossfade duration calculation** to check both adjacent segments:
   ```python
   seg_duration = keep_segments[i - 1][1] - keep_segments[i - 1][0]
   next_seg_duration = keep_segments[i][1] - keep_segments[i][0]
   fade_dur = min(crossfade_seconds, seg_duration, next_seg_duration)
   ```

5. **Dynamic MIME type** based on `has_video` and `has_audio`.

6. **Add codecs to single-segment trim path** (line 172).

### Future Improvements

- Add integration tests with real FFmpeg and sample media files
- Add performance benchmark for 500-segment file
- Consider streaming output for very long files to reduce memory usage
- Add support for `mode="keep"` (invert behavior) if needed in future
