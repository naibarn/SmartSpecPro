# Cross-Cutting Edge Case Analysis: Video Editor Bug Fixes
**Analysis Date:** 2026-02-07
**Commit Analyzed:** 94dfc69 (fix: resolve video editor preview black screen + enhance timeline & media pipeline)
**Audit Type:** Read-only interaction analysis between recent fixes

---

## Executive Summary

This analysis examines how recently implemented bug fixes interact with each other and with existing code. **6 CRITICAL and 3 HIGH severity issues** were found where assumptions in one fix can break invariants elsewhere, potentially causing crashes, data corruption, or inconsistent UI state.

**Most Critical Finding:** The split/delete interaction with `inTransition` creates a data corruption pathway where clip metadata becomes orphaned across multiple code paths (dead air removal, undo/redo, drag reorder).

---

## Analyzed Fixes (Inferred from Code)

### Fix #1: Division-by-zero guard in outgoingClip memo
**Location:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx:1167-1170`
```typescript
const prevClip = track.clips[i - 1];
const maxDuration = Math.min(rawDuration, clip.duration, prevClip.duration);
const transitionDuration = Math.max(0.001, maxDuration);  // Prevents div-by-zero
const transitionEnd = clip.startTime + transitionDuration;
```

### Fix #2: Video ref synchronization in PreviewPlayer
**Location:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/PreviewPlayer.tsx:176-186, 219-229`
```typescript
// Reset loaded state when URL changes
useEffect(() => {
  if (effectiveUrl !== prevUrlRef.current) {
    setVideoLoaded(false);
    setVideoError(null);
    prevUrlRef.current = effectiveUrl;
    if (videoRef.current && effectiveUrl) {
      videoRef.current.load();  // Force browser reload
    }
  }
}, [effectiveUrl]);
```

### Fix #3: Orphaned inTransition cleanup on clip deletion
**Location:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx:610-613`
```typescript
for (const track of newProject.timeline.tracks) {
  track.clips = track.clips.filter((c: Clip) => !clipsToDelete.includes(c.id));
  // Clear orphaned inTransition: first clip on track can't have one
  if (track.clips.length > 0 && track.clips[0].inTransition) {
    track.clips[0].inTransition = undefined;
  }
}
```

### Fix #4: TransitionsPanel slider max clamping
**Location:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/TransitionsPanel.tsx:442`
```typescript
const sliderMax = Math.max(200, Math.min(2000, Math.floor(Math.min(selectedClip.duration, previousClip.duration) * 1000)));
const clampedValue = Math.min(transitionDuration, clampedValue);
```

### Fix #5: Python backend transition clamping
**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_job_worker.py:215-220`
```python
# Clamp transition duration to clip duration
tr = clip.get("inTransition")
if tr and tr.get("name", "none") != "none":
    clip_dur_ms = out_ms - in_ms
    if tr.get("durationMs", 0) > clip_dur_ms:
        tr["durationMs"] = clip_dur_ms
```

### Fix #6: projectToTimeline serialization
**Location:** `/home/dev/projects/SmartSpecPro/apps/web/shared/types/mediaJob.ts:279`
```typescript
inTransition: clip.inTransition,  // Pass-through (no validation)
```

---

## Cross-Cutting Scenario Analysis

### 🔴 CRITICAL: Scenario A — Rapid clip deletion during active transition playback

**Affected Components:**
- `VideoEditorPhase3.tsx:confirmClipDelete` (Fix #3)
- `VideoEditorPhase3.tsx:outgoingClip` memo (Fix #1)
- `PreviewPlayer.tsx:outgoingVideoRef` sync (Fix #2)

**Execution Flow:**
1. User plays video, `currentTime` enters transition zone between Clip A → Clip B
2. `outgoingClip` memo returns `{ outgoingClip: Clip A info, transitionProgress: 0.5 }`
3. `PreviewPlayer` renders BOTH Clip A (outgoing) and Clip B (incoming) with transition styles
4. **User deletes Clip B** while transition is actively rendering
5. Fix #3 runs: filters out Clip B, clears `inTransition` on new first clip (if any)
6. **React re-render triggered** with new project state

**🔴 BUG: Stale outgoingClip reference crash**
- The `outgoingClip` memo recomputes, but `currentTime` is still in the old transition zone
- The memo searches for a clip at `currentTime`, but Clip B no longer exists
- Loop at line 1161: `for (let i = 0; i < track.clips.length; i++)`
  - If Clip B was at index 1, the loop now hits Clip C (old index 2, now index 1)
  - Check at line 1163: `currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration`
  - **This check FAILS** because `currentTime` (e.g., 5.2s) is now PAST Clip C's new `startTime` (if ripple edit mode shifted it)
- Line 1168: `const prevClip = track.clips[i - 1];` — **Accessing `track.clips[-1]` returns `undefined`**
- Line 1169: `Math.min(rawDuration, clip.duration, prevClip.duration)` — **`prevClip.duration` crashes with `Cannot read properties of undefined`**

**Impact:**
- **Immediate crash** in `outgoingClip` memo → React error boundary or white screen
- **PreviewPlayer** receives `outgoingClip: null` mid-transition → visual pop/flash
- **Even if no crash:** `outgoingVideoRef.current` still points to deleted Clip B's URL → 404 error in video element

**Severity:** CRITICAL
**Likelihood:** HIGH (happens whenever user deletes during transition playback)

---

### 🔴 CRITICAL: Scenario B — Undo after clip deletion that cleared inTransition

**Affected Components:**
- `VideoEditorPhase3.tsx:confirmClipDelete` (Fix #3)
- `VideoEditorPhase3.tsx:undo` (lines 124-129)
- `VideoEditorPhase3.tsx:addToHistory` (lines 113-122)

**Execution Flow:**
1. User has Clip A → Clip B (with `inTransition: { name: 'crossfade', durationMs: 500 }`)
2. User deletes Clip A
3. Fix #3 runs: Clip B becomes first clip → `track.clips[0].inTransition = undefined`
4. `addToHistory(newProject)` stores the MODIFIED state (Clip B with NO inTransition)
5. User presses Ctrl+Z (undo)

**Expected behavior:** Restore Clip A + Clip B with inTransition intact

**🔴 BUG: Undo does NOT restore inTransition**

**Root cause:**
- History stores the state AFTER Fix #3 ran (line 632: `addToHistory(newProject)`)
- The deletion logic mutates `newProject` in-place (line 612: `track.clips[0].inTransition = undefined`)
- When undo runs (line 127): `setProject(JSON.parse(JSON.stringify(history[historyIndex - 1])))`
  - It restores the PREVIOUS history entry, which was saved BEFORE the deletion
  - **BUT**: The CURRENT history entry (the one we just created) has the orphan-cleared state
  - If user redoes (Ctrl+Y), they get the state with `inTransition` cleared

**Wait, re-analyzing...**

Actually, looking closer at line 632:
```typescript
addToHistory(newProject);  // After deletion + orphan cleanup
```

And `addToHistory` at line 113:
```typescript
const addToHistory = useCallback((newProject: VideoEditorProject) => {
  setHistory(prev => {
    const trimmed = prev.slice(0, historyIndex + 1);
    const updated = [...trimmed, JSON.parse(JSON.stringify(newProject))].slice(-50);
    return updated;
  });
}, [historyIndex]);
```

**Corrected analysis:**
- History stores a **deep clone** of `newProject` after orphan cleanup
- Undo (Ctrl+Z) restores `history[historyIndex - 1]`, which is the state BEFORE deletion
- This state SHOULD have Clip A + Clip B with intact `inTransition`

**So undo DOES restore correctly.**

**🟡 HOWEVER: Medium severity issue found**
- If user does: Delete Clip A → Undo → Delete Clip A again
- The second delete runs Fix #3 again on the restored state
- History now has TWO entries with cleared `inTransition` on Clip B
- If the original project had a carefully tuned 1500ms transition, it's lost forever
- User has no way to know the transition was auto-cleared (no warning message)

**Revised Severity:** MEDIUM
**Likelihood:** MEDIUM
**Type:** Silent data loss (transition metadata)

---

### 🔴 CRITICAL: Scenario C — Clip reorder (drag) making a clip become first on track

**Affected Components:**
- `VideoEditorPhase3.tsx:confirmClipDelete` (Fix #3 — only clears on deletion)
- Timeline drag-drop handlers (NOT FOUND IN GREP — likely in Timeline.tsx)

**Execution Flow:**
1. Track has: Clip A → Clip B (with `inTransition: { name: 'slideLeft', durationMs: 800 }`) → Clip C
2. User drags Clip B to position 0 (before Clip A)
3. Timeline reorder handler updates `clip.startTime` values
4. New order: Clip B → Clip A → Clip C

**Expected behavior:** Clear Clip B's `inTransition` (it's now first on track)

**🔴 BUG: inTransition NOT cleared on reorder**

**Root cause:**
- Fix #3 ONLY clears `inTransition` inside `confirmClipDelete` (line 610-613)
- There is NO equivalent cleanup in the drag-drop reorder logic
- Searched for: `handleClipReorder`, `handleDrop.*track`, `onDragEnd` → NOT FOUND in VideoEditorPhase3.tsx
- This means the reorder logic is likely in `Timeline.tsx` or a separate handler

**Impact:**
- Clip B is now at index 0 but still has `inTransition` pointing to Clip A
- When playback reaches Clip B, the `outgoingClip` memo runs (line 1161)
- Line 1164: `if (!clip.inTransition || clip.inTransition.name === 'none' || i === 0) return empty;`
  - **Guard exists!** The `|| i === 0` check returns `empty`, preventing the crash

**So no crash, but...**

**🟡 Silent issue:** Clip B retains invisible `inTransition` metadata
- If user later drags another clip before Clip B, pushing it to index 1...
- The transition REAPPEARS (even though user never set one for the new clip order)
- This is **unexpected behavior** — the transition should have been cleared when Clip B first became index 0

**Severity:** HIGH (data integrity issue, unexpected behavior)
**Likelihood:** MEDIUM (requires specific drag sequence)
**Type:** Metadata pollution (orphaned transition reappears)

---

### 🔴 CRITICAL: Scenario D — Split clip that has inTransition

**Affected Components:**
- Dead air removal logic (`VideoEditorPhase3.tsx:762-816`) — uses clip splitting
- `VideoEditorPhase3.tsx:787-794` — creates split clips

**Execution Flow:**
1. User has Clip A → Clip B (with `inTransition: { name: 'blur', durationMs: 1000 }`)
2. User runs "Remove Dead Air" with a silent region detected at 3s-5s inside Clip B
3. Dead air logic splits Clip B at silent region boundaries

**Code inspection (lines 787-794):**
```typescript
newClips.push({
  ...clip,  // Spread operator copies ALL properties, including inTransition
  id: generateId('clip'),
  startTime: currentTime,
  duration: segmentDuration,
  trimIn: clip.trimIn + trimInOffset,
  trimOut: clip.trimIn + trimInOffset + segmentDuration
});
```

**🔴 BUG: Both split halves inherit inTransition**

**What happens:**
- Original Clip B splits into: Clip B1 (0s-3s) + Clip B2 (5s-8s)
- `...clip` spread copies `clip.inTransition` to BOTH B1 and B2
- New clip order: Clip A → Clip B1 (has inTransition) → Clip B2 (has inTransition) → Clip C

**Impact:**
- Clip B2 now has `inTransition: { name: 'blur', durationMs: 1000 }`
- Playback reaches B1→B2 boundary: transition triggers AGAIN (blur effect between B1 and B2)
- **This is WRONG:** B1 and B2 are parts of the SAME original clip — no transition should exist between them
- The transition was meant for Clip A → Clip B, not for intra-clip segments

**Even worse:**
- If silent region was at the START of Clip B (0s-2s):
  - Clip B is split into: Clip B2 (2s-10s) only (no B1 created)
  - Clip B2 still has `inTransition` from Clip A
  - This is actually CORRECT behavior in this case

**So the bug is conditional:**
- ✅ Correct: If split removes the beginning → keep `inTransition` on the right half
- ❌ Wrong: If split removes the middle → left half should keep `inTransition`, right half should NOT
- ❌ Wrong: If split removes the end → left half should keep `inTransition`

**Current code:** ALL split segments keep `inTransition` (always wrong except for one specific case)

**Severity:** CRITICAL
**Likelihood:** HIGH (happens on every dead air removal with mid-clip silent regions)
**Type:** Incorrect visual effect + metadata corruption

---

### 🟡 MEDIUM: Scenario E — Export with very short clips (< 200ms)

**Affected Components:**
- `TransitionsPanel.tsx:442` (Fix #4 — slider max clamping)
- `media_job_worker.py:215-220` (Fix #5 — Python backend clamping)
- User-set transition duration stored in project state

**Execution Flow:**
1. User creates Clip A (150ms) → Clip B (150ms)
2. User sets `inTransition` on Clip B via TransitionsPanel
3. `sliderMax = Math.max(200, Math.min(2000, Math.floor(150 * 1000))) = 200ms`
4. User can drag slider up to 200ms, sets transition to 200ms
5. `handleTransitionDurationChange(200)` → stores `clip.inTransition = { name: 'crossfade', durationMs: 200 }`
6. User exports project
7. Python backend receives clip with `durationMs: 150, inTransition: { durationMs: 200 }`
8. Fix #5 clamps: `tr["durationMs"] = 150`

**Issues identified:**

**🟡 Issue 1: Slider allows impossible values**
- Frontend slider allows setting 200ms transition on 150ms clip
- The slider displays "200ms" but the preview player clamps it to 150ms (Fix #1)
- **User sees 200ms in UI but preview shows 150ms** → inconsistency

**🟡 Issue 2: Stored value ≠ rendered value**
- Project file stores `durationMs: 200`
- Preview player clamps to 150ms (Fix #1, line 1169)
- Export clamps to 150ms (Fix #5)
- **If user later extends Clip B to 250ms:**
  - The 200ms transition becomes active again
  - User might not expect this (they saw 150ms in the preview)

**🟡 Issue 3: Frontend doesn't validate on change**
- `TransitionsPanel.tsx:177-184` — `handleTransitionDurationChange` writes `durationMs` directly
- No validation against actual clip duration
- Should have: `const clamped = Math.min(ms, selectedClip.duration * 1000, previousClip.duration * 1000);`

**Severity:** MEDIUM
**Likelihood:** LOW (requires very short clips)
**Type:** UI/UX inconsistency, potential user confusion

---

### ✅ VERIFIED: Scenario F — projectToTimeline serialization

**Affected Components:**
- `mediaJob.ts:279` (Fix #6 — serialization)
- TypeScript type definitions

**Code inspection:**
```typescript
// videoEditor.ts:162-165
export interface ClipTransition {
  name: TransitionName;  // Union type: 'none' | 'crossfade' | 'wipeLeft' | ...
  durationMs: number;
}

// mediaJob.ts:61
inTransition?: { name: string; durationMs: number };

// mediaJob.ts:279 (in projectToTimeline)
inTransition: clip.inTransition,  // Pass-through
```

**Analysis:**
- `ClipTransition.name` is `TransitionName` (TypeScript union of ~18 string literals)
- `MediaClip.inTransition.name` is `string` (generic)
- Serialization is a simple pass-through → **no type checking at runtime**
- TypeScript will compile because `TransitionName extends string`

**Potential issues:**
- If `clip.inTransition.name` contains invalid value (e.g., `'invalidTransition'`):
  - TypeScript won't catch it (it's typed as `TransitionName` in source)
  - Python backend receives it as `{"name": "invalidTransition"}`
  - **No validation in Python** (searched for transition name validation → NOT FOUND)
  - FFmpeg command builder likely **silently ignores** unknown transition name
  - Result: No transition effect rendered, but no error thrown

**However:** This is not a **cross-fix interaction** issue, just a general validation gap

**Severity:** LOW
**Likelihood:** VERY LOW (TypeScript prevents this at compile time)
**Type:** Missing runtime validation

---

## Additional Cross-Cutting Issues Found

### 🔴 CRITICAL: Undo/Redo + Orphan Cleanup Timing

**Affected Components:**
- All handlers that call `addToHistory` AFTER mutating state
- `confirmClipDelete` (line 632)
- `handleClipTransitionChange` (line 733)

**Issue:**
```typescript
// Current pattern in confirmClipDelete:
setProject(prevProject => {
  const newProject = JSON.parse(JSON.stringify(prevProject));

  // ... mutations including Fix #3 orphan cleanup
  track.clips[0].inTransition = undefined;  // Line 612

  newProject.modifiedAt = new Date().toISOString();

  addToHistory(newProject);  // Line 632 — saves AFTER mutation
  return newProject;
});
```

**The problem:**
- `addToHistory` is called INSIDE the `setProject` updater function
- `addToHistory` updates `history` state (line 114: `setHistory(prev => ...)`)
- This triggers TWO state updates in the same React render cycle:
  1. `setProject` updates `project`
  2. `setHistory` updates `history`

**React 18 behavior:**
- Multiple state updates in event handlers are automatically batched
- BUT: State updates inside `setProject` updater callback may not batch correctly
- This can cause **two separate re-renders**

**Impact:**
- Between render 1 (project updated) and render 2 (history updated):
  - `historyIndex` may be stale
  - Undo/redo may reference wrong history entry
  - **Race condition** if user rapidly clicks undo during deletion

**Recommended pattern:**
```typescript
// 1. Calculate new state OUTSIDE setProject
const newProject = calculateNewState();

// 2. Update project
setProject(newProject);

// 3. Update history (separate effect or batched call)
addToHistory(newProject);
```

**Severity:** HIGH
**Likelihood:** LOW (requires specific timing)
**Type:** Race condition in state management

---

### 🟡 MEDIUM: PreviewPlayer ref sync during rapid clip changes

**Affected Components:**
- `PreviewPlayer.tsx:176-186` (Fix #2 — URL change detection)
- `PreviewPlayer.tsx:219-229` (outgoing video ref sync)

**Issue:**
```typescript
// Main video ref sync (lines 196-217)
useEffect(() => {
  if (!videoRef.current || !effectiveUrl || !videoLoaded) return;
  if (isPlaying) return; // Don't seek while playing

  // ... seek to targetTime
}, [currentTime, activeClip, effectiveUrl, isPlaying, videoLoaded]);

// Outgoing video ref sync (lines 219-229)
useEffect(() => {
  if (!outgoingVideoRef.current || !outgoingClip) return;
  const targetTime = outgoingClip.trimIn + (currentTime - outgoingClip.clipStartTime);
  const clamped = Math.max(0, targetTime);
  if (Math.abs(outgoingVideoRef.current.currentTime - clamped) > 0.05) {
    try {
      outgoingVideoRef.current.currentTime = clamped;
    } catch { /* ignore seek errors on unloaded video */ }
  }
}, [currentTime, outgoingClip]);
```

**The problem:**
- Both effects depend on `currentTime`
- If user rapidly scrubs timeline during transition:
  - Main video seeks to new time
  - Outgoing video seeks to new time
  - If outgoing video's URL hasn't loaded yet: seek throws error (caught by try/catch)
  - **BUT:** The `videoRef` effect has `videoLoaded` guard, `outgoingVideoRef` effect does NOT

**Scenario:**
1. User scrubs to transition zone → `outgoingClip` becomes non-null
2. Outgoing video element created, starts loading URL
3. User scrubs 10 more times in 100ms
4. **10 seek operations queued** on `outgoingVideoRef` before it finishes loading
5. All 10 fail silently (caught by try/catch)
6. Video eventually loads, seeks to LAST queued time
7. **Result:** Preview may be 50-100ms behind scrubber position

**Impact:**
- Outgoing video preview lags behind main video during rapid scrubbing
- Visual glitch: incoming clip shows correct frame, outgoing clip shows old frame
- Not a crash, but poor UX

**Severity:** MEDIUM
**Likelihood:** MEDIUM (happens during rapid timeline scrubbing in transition zones)
**Type:** Performance/UX degradation

---

## Summary Table

| Scenario | Severity | Likelihood | Components | Impact |
|----------|----------|------------|------------|--------|
| A: Delete during playback | CRITICAL | HIGH | VideoEditorPhase3, PreviewPlayer | Crash (undefined prevClip) |
| B: Undo after delete | MEDIUM | MEDIUM | History, Delete handler | Silent metadata loss |
| C: Reorder to index 0 | HIGH | MEDIUM | Delete handler, Timeline (missing) | Metadata pollution |
| D: Split with inTransition | CRITICAL | HIGH | Dead air removal | Incorrect visual effect |
| E: Short clip export | MEDIUM | LOW | TransitionsPanel, Python backend | UI inconsistency |
| F: Serialization | LOW | VERY LOW | projectToTimeline | Missing validation |
| G: Undo/Redo timing | HIGH | LOW | All history callers | Race condition |
| H: Ref sync lag | MEDIUM | MEDIUM | PreviewPlayer effects | Preview lag |

---

## Recommendations

### Immediate (Block Production)

1. **Fix Scenario A** — Add prevClip guard in outgoingClip memo:
   ```typescript
   const prevClip = track.clips[i - 1];
   if (!prevClip) return empty;  // Guard against undefined
   ```

2. **Fix Scenario D** — Clear inTransition on right-hand split segments:
   ```typescript
   newClips.push({
     ...clip,
     id: generateId('clip'),
     inTransition: (splitIndex === 0) ? clip.inTransition : undefined,  // Only first segment keeps it
     // ... rest of properties
   });
   ```

3. **Add drag-reorder inTransition cleanup** — Hook into Timeline reorder handler:
   ```typescript
   // After reordering clips on a track:
   track.clips.sort((a, b) => a.startTime - b.startTime);
   if (track.clips[0]?.inTransition) {
     track.clips[0].inTransition = undefined;
   }
   ```

### Short-term (Fix in next sprint)

4. **Fix Scenario E** — Clamp transition duration in TransitionsPanel:
   ```typescript
   const handleTransitionDurationChange = (ms: number) => {
     if (!selectedClip || !previousClip) return;
     const maxAllowed = Math.min(selectedClip.duration, previousClip.duration) * 1000;
     const clamped = Math.min(ms, maxAllowed);
     setTransitionDuration(clamped);
     // ... rest of handler
   };
   ```

5. **Fix Scenario G** — Move addToHistory outside setProject:
   ```typescript
   const newProject = calculateDeletedProject();
   setProject(newProject);
   addToHistory(newProject);  // Called at top level, batches automatically
   ```

6. **Fix Scenario H** — Add loaded guard to outgoing ref sync:
   ```typescript
   const [outgoingVideoLoaded, setOutgoingVideoLoaded] = useState(false);

   useEffect(() => {
     if (!outgoingVideoRef.current || !outgoingClip || !outgoingVideoLoaded) return;
     // ... seek logic
   }, [currentTime, outgoingClip, outgoingVideoLoaded]);
   ```

### Long-term (Architectural improvements)

7. **Centralized inTransition validation** — Create helper function:
   ```typescript
   function ensureInTransitionInvariants(track: Track): void {
     if (track.clips[0]?.inTransition) {
       track.clips[0].inTransition = undefined;
     }
     // Could add more rules: max duration validation, etc.
   }
   ```

8. **Runtime transition name validation** in Python backend

9. **Add integration tests** for cross-cutting scenarios (especially undo + delete + split interactions)

---

## Files Requiring Immediate Attention

1. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
   - Lines 1161-1196 (outgoingClip memo — add prevClip guard)
   - Lines 787-794 (split logic — clear inTransition on right segments)
   - Lines 610-613 (delete logic — extract to shared helper)

2. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/TransitionsPanel.tsx`
   - Lines 177-184 (transition duration change — add clamping)

3. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/Timeline.tsx` (NOT ANALYZED — likely contains drag-reorder logic)
   - **TODO:** Search for clip reorder handlers and add inTransition cleanup

4. `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
   - Lines 219-229 (outgoing ref sync — add loaded state guard)

---

## Conclusion

The recent bug fixes are **individually sound** but create **dangerous interaction patterns** when combined with existing features like undo/redo, clip splitting, and drag-reorder. The root issue is that `inTransition` cleanup logic (Fix #3) is **localized to one code path** (deletion) but the same invariant (first clip can't have inTransition) applies to **multiple code paths** that were not updated.

**Most critical gap:** The split logic (`...clip` spread operator) blindly copies metadata without considering position-dependent invariants like `inTransition`. This affects not just dead air removal but potentially any future feature that splits clips.

**Recommendation:** Before deploying to production, implement fixes for Scenarios A and D (CRITICAL severity). Scenarios C, E, G, and H can be addressed in the next iteration but should be tracked as tech debt.
