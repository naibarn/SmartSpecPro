# Code Review: Section 01 - Types & Shared Logic

**Date:** 2026-02-13

## Interview Items

### 1. Buffer input validation (MEDIUM)
**Issue:** `applyBufferToRegions()` accepts negative buffer values and can produce negative timestamps.
**Decision:** User chose to add defensive clamping (bufferSeconds >= 0, adjustedStartTime >= 0).
**Action:** FIX - Add `Math.max(0, bufferSeconds)` at function entry and `Math.max(0, adjustedStartTime)` for each region.

## Auto-Fixes

### 2. Add immutability test (LOW)
Verify `regions[0] !== result[0]` to ensure new object references.
**Action:** FIX - Add test case.

### 3. Add exact boundary edge case test (LOW)
Test where adjustedEnd === adjustedStart exactly (buffer = half duration).
**Action:** FIX - Add test case.

## Let Go

### 4. SilentRegionV2 inheritance (LOW-MEDIUM)
SilentRegionV2 inherits new fields. Verified: no code constructs SilentRegionV2 objects anywhere outside the type definition file. Non-issue.

### 5. SilenceDetectionConfig.softeningBuffer (MEDIUM)
Verified: no code constructs SilenceDetectionConfig literals in the codebase. The field will be used when Section 2 builds the dialog. Non-issue.

### 6. Functions in types file (LOW)
Plan-compliant. Existing pattern in the codebase (formatTime, generateId already there).

### 7. dbToPercent magic numbers (LOW)
Trivial one-liner. Constants would add noise for no gain.
