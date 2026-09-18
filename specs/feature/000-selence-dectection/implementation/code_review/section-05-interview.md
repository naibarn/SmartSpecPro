# Code Review Interview Transcript: Section 05

## Interview Decisions

### Issue #1: RAF Loop Performance (CRITICAL)
**Question:** The playhead animation runs continuously at 60fps even when video is paused, wasting CPU/battery. Should we add an `isPlaying` prop to only animate during playback?

**User Decision:** ✅ Yes, add isPlaying prop

**Action:** Add optional `isPlaying?: boolean` prop (defaults to `true` for backward compatibility). Only run RAF loop when `isPlaying === true`. When paused, draw playhead once in useEffect.

---

### Issue #4: Hit Testing Performance (IMPORTANT)
**Question:** Hit testing on mousemove iterates all regions (O(n), up to 500). Should we add throttling/optimization now?

**User Decision:** ✅ Add throttling (16ms)

**Action:** Wrap `handleMouseMove` with a throttle mechanism (using RAF-based throttling to avoid lodash dependency). Only perform hit testing at most once per 16ms (~60fps).

---

## Auto-Fix Items (Applied Without Interview)

### Issue #5: Hatch Pattern Created on Every Redraw (IMPORTANT)
**Action:** Memoize hatch pattern using `useMemo(() => createHatchPattern(ctx), [])` since it doesn't depend on any props.

---

### Issue #6: Redundant Canvas Style Assignments (IMPORTANT)
**Action:** Remove lines 203-204 and 256-257 (`canvas.style.width/height` assignments) since the JSX inline styles already set `width: '100%', height: '100%'`.

---

### Issue #7: RAF Cleanup Edge Case (IMPORTANT)
**Action:** Store RAF ID in a local variable inside the effect and cancel that specific ID in cleanup to prevent potential race condition:
```typescript
let rafId: number | null = null;
const drawPlayhead = () => {
  // ... draw logic ...
  rafId = requestAnimationFrame(drawPlayhead);
};
rafId = requestAnimationFrame(drawPlayhead);
return () => {
  if (rafId !== null) cancelAnimationFrame(rafId);
};
```

---

### Issue #9: Magic Numbers (MINOR)
**Action:** Extract magic numbers to named constants at top of file:
```typescript
const HATCH_PATTERN_SIZE = 10;
const SELECTED_BORDER_DASH = [4, 4];
const PLAYHEAD_LINE_WIDTH = 2;
```

---

### Issue #12: Missing Fallback for Hatch Pattern (MINOR)
**Action:** Add fallback fill style if pattern creation fails:
```typescript
if (hatchPattern) {
  ctx.fillStyle = hatchPattern;
} else {
  ctx.fillStyle = 'rgba(128, 128, 128, 0.2)';
}
ctx.fillRect(x, 0, regionWidth, height);
```

---

## Items Skipped (Let Go)

### Issue #8: Documentation Comment
**Rationale:** Minor improvement, doesn't affect functionality. Can be added in future documentation pass.

### Issue #10: Test Coverage Gap for Rendering Logic
**Rationale:** Canvas rendering tests are acknowledged in spec as difficult in node environment. The pure function tests provide adequate coverage for the business logic.

### Issue #11: Configurable Playhead Width
**Rationale:** Premature optimization. Current 2px width works well across tested sizes. Can be made configurable if users report visual issues.

---

## Summary

**Total Fixes:** 7
- **Interview-based:** 2 (isPlaying prop, hit testing throttle)
- **Auto-fixes:** 5 (memoize pattern, remove redundant styles, RAF cleanup, constants, fallback)
- **Skipped:** 3 (documentation, test coverage gap, configurable width)

**Next Step:** Apply all fixes to the implementation file and re-run tests.
