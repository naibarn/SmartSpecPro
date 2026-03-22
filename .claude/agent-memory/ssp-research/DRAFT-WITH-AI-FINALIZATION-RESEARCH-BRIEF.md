---
name: Draft with AI Finalization Hang — Research Brief
description: Complete technical research brief with findings, architecture, risks, options, recommendation
type: project
---

# Research Brief: Draft with AI Finalization Hang

## Findings

The "Finalizing output..." spinner gets stuck indefinitely after the backend successfully completes the generation task. The root cause is a **race condition in the state machine** that synchronizes the finalization callback with the modal close.

### Problem Statement

User reports:
1. Modal shows "Successfully added 5 slides to your deck" (green checkmark)
2. Modal shows "Finalizing output..." with spinner
3. Modal never closes — spinner spins indefinitely
4. Modal can only be closed by pressing Escape or clicking outside

### Root Cause (VERIFIED)

**Race Condition in Finalization State:**

```typescript
// Line 1547: Set finalization flag TRUE
setIsFinalizingCompletion(true);

// Line 1549-1556: Call onComplete callback with close function
void Promise.resolve(
  onComplete({
    deckId,
    taskId,
    result: progress.result,
    close: handleClose,  // ← This is the close callback
  }),
)
  .catch(...)
  .finally(() => {
    // Line 1566: Set finalization flag FALSE (but too late!)
    setIsFinalizingCompletion(false);
  });
```

**The Problem:**
1. `isFinalizingCompletion` is set to `true` first
2. The `close` callback is `handleClose` function
3. `handleClose` has this guard (line 1525):
   ```typescript
   const handleClose = useCallback(() => {
     if (isFinalizingCompletion) {
       return;  // ← EXIT EARLY!
     }
     // ... actual close logic ...
   }, [isFinalizingCompletion, ...]);
   ```
4. When `onComplete` calls `close()`, it's calling `handleClose()`
5. But `isFinalizingCompletion` is STILL `true`, so `handleClose()` exits immediately
6. The modal never closes
7. The `.finally()` block then sets `isFinalizingCompletion=false`, but it's too late

---

## Current Architecture

### Backend: aiPresentationService.ts

**Design Intent (Correct):**
- Phase 4 (Media Submission, lines 10133-10287): Submit images to providers WITHOUT waiting for results
- Use `submit_only_no_poll` pattern to return immediately
- Creates `pendingMediaJob` records in database
- Allows Draft with AI to complete in seconds instead of 5-30 minutes
- The frontend polls later to resolve actual image URLs

**Phase 7 (Deck Insertion, lines 11008-11022):**
- Saves all slides to database with placeholder media
- Returns `completed: true` with result object

```typescript
await updateProgress({
  phase: 7,
  phaseLabel: "Complete",
  completed: true,
  slidesCompleted: compiledSlides.length,
  totalSlides: compiledSlides.length,
  result: {
    slidesAdded: compiledSlides.length,
    newDeckVersion: finalDeckVersion || (insertionBaseVersion + compiledSlides.length),
    articlePreview: (articleText || sanitizedPrompt).slice(0, 200),
    warnings,
  },
});
```

### Frontend: AIDraftModal.tsx

**State Machine (Incorrect Implementation):**

State variable: `isFinalizingCompletion` (line 411)

**Sequence of events:**
1. Backend sends `completed: true` via SSE/polling
2. `progress?.completed` becomes true
3. `useEffect` at line 1538 triggers:
   - Checks: `!onComplete || !taskId || !progress?.completed || !progress.result` → all false, continue
   - Checks: `completionHandledRef.current === taskId` → false (first time), continue
   - Sets: `completionHandledRef.current = taskId`
   - **Sets: `isFinalizingCompletion = true`** (line 1547)
   - Calls: `onComplete({deckId, taskId, result, close: handleClose})`
   - `.finally()` sets: `isFinalizingCompletion = false` (line 1566)

**PresentationEditor.tsx Callback (lines 10956-10959):**
```typescript
onComplete={async ({ close }) => {
  await deckQuery.refetch();    // ← Fetch updated deck
  close();                       // ← Call handleClose()
}}
```

**handleClose Function (lines 1525-1536):**
```typescript
const handleClose = useCallback(() => {
  if (isFinalizingCompletion) {   // ← Guard check
    return;                        // ← EXIT EARLY IF TRUE!
  }
  if (completed && progress?.result) {
    utils.presentation.getDeck.invalidate({ deckId });
    utils.presentation.getDeckByLibraryItem.invalidate();
    utils.presentation.listVersions.invalidate({ deckId });
    utils.presentation.getSlideshow.invalidate({ deckId });
  }
  onClose();                       // ← This is NEVER called due to guard
}, [completed, progress, utils, deckId, isFinalizingCompletion, onClose]);
```

**Display (lines 2734-2738):**
```typescript
{isFinalizingCompletion && (
  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
    Finalizing output...
  </div>
)}
```

### The Timeline

```
Time  Component              State                      Action
────────────────────────────────────────────────────────────────────
T0    Backend               completed: false           Generating...
T1    Backend               completed: false           Generating... (phase 7)
T2    Backend               completed: true            Send progress update
T3    Frontend (Modal)      completed: true            useEffect triggers
T4    Frontend (Modal)      isFinalizingCompletion:true Set state → render spinner
T5    Frontend (Modal)      isFinalizingCompletion:true Call onComplete({ close: handleClose })
T6    Frontend (Editor)     isFinalizingCompletion:true await deckQuery.refetch()
T7    Frontend (Editor)     isFinalizingCompletion:true close() → handleClose()
T8    Frontend (Modal)      isFinalizingCompletion:true handleClose checks: if (isFinalizingCompletion) return ← GUARD BLOCKS!
T9    Frontend (Modal)      isFinalizingCompletion:true onClose() NEVER CALLED
T10   Frontend (Modal)      isFinalizingCompletion:false .finally() runs, set to false
T11   Frontend (Modal)      isFinalizingCompletion:false Spinner still visible but flag is false now
────────────────────────────────────────────────────────────────────
User sees: Spinner forever (unless user manually closes with Escape)
```

---

## Risks

### User Experience Risks
- Modal cannot be closed via "Close" button while finalization active
- "Close" button text changes to "Finalizing..." suggesting operation is ongoing
- "Finalizing output..." message suggests work is happening, but it's already complete
- Only escape routes: Press Escape or click outside modal (onOpenChange fires)
- Confusing UX: All signs point to completion, but modal won't close

### Product Risks
- User may think generation failed or is stuck
- User may try Cancel button (disabled while finalizing)
- May lead to duplicate submissions if user thinks first one failed
- Deck is already saved to database — closing modal is purely UI cleanup

### Data Risks
- None — the deck is already fully saved at this point
- Deferred media jobs are correctly queued for later resolution
- All state is persisted

---

## Options

### Option A: Remove Finalization State Entirely ✓ RECOMMENDED

**What changes:**
- Delete `isFinalizingCompletion` state variable (line 411)
- Delete the `useEffect` block that manages finalization (lines 1538-1568)
- Move the refetch logic directly into the progress monitor
- Close the modal immediately when `completed: true` is received

**Pros:**
- Eliminates the race condition entirely
- Simplifies component logic significantly
- Modal closes immediately after deck is saved (better UX)
- Removes the "Finalizing..." message (which is misleading anyway)

**Cons:**
- Changes component contract — removes `onComplete` callback
- May break if other callers use different completion logic (unlikely)
- Loses the explicit "finalization" state (was it important?)

**Implementation effort:** 1 hour
- Remove state variable
- Remove useEffect
- Remove display logic
- Remove guard from handleClose
- Test that modal closes properly

**Risk:** Low — the finalization state appears to serve no real purpose

---

### Option B: Fix the Race Condition

**What changes:**
- Keep the finalization state
- But change the order: set `isFinalizingCompletion=false` BEFORE calling `close()`

**Before:**
```typescript
setIsFinalizingCompletion(true);
Promise.resolve(onComplete(...))
  .finally(() => {
    setIsFinalizingCompletion(false);  // TOO LATE
  });
```

**After:**
```typescript
setIsFinalizingCompletion(true);
Promise.resolve(onComplete(...))
  .then((result) => {
    setIsFinalizingCompletion(false);  // BEFORE close
    return result;
  })
  .catch((error) => {
    completionHandledRef.current = null;
    toast.error(...);
    setIsFinalizingCompletion(false);  // Also before finally
    throw error;
  })
  .finally(() => {
    // cleanup only
  });
```

**Pros:**
- Preserves the finalization state (if it's important for some reason)
- Minimal code changes
- Still allows `onComplete` callback

**Cons:**
- Doesn't address why the guard on `handleClose` exists
- Fragile — future maintainers may not understand the order dependency
- Still shows misleading "Finalizing..." spinner

**Implementation effort:** 30 minutes
- Refactor the promise chain
- Move state update before calling close

**Risk:** Medium — the guard on `handleClose` might catch other issues

---

### Option C: Add Explicit Timeout

**What changes:**
- Keep the finalization state
- Add a 30-second timeout
- If finalization doesn't complete, force-close the modal
- Show warning to user

**Pros:**
- Prevents indefinite hang
- Visible to user that something went wrong
- Non-breaking change

**Cons:**
- Hides the root cause — user just sees "finalization timeout"
- Doesn't fix the underlying state machine bug
- 30-second wait is bad UX for normal case

**Implementation effort:** 2 hours
- Add timeout logic
- Add error handling
- Add UI message
- Test edge cases

**Risk:** High — masks a design flaw

---

## Recommendation

**Use Option A: Remove Finalization State Entirely**

### Rationale

1. **The `isFinalizingCompletion` state serves no real purpose**
   - The modal should close as soon as the deck is saved
   - Refetching the deck is purely a cache invalidation operation
   - It takes <100ms on a modern connection

2. **The callback architecture is over-engineered**
   - All callers do the same thing: refetch and close
   - Why allow different implementations if there's only one use case?
   - Simpler code is better code

3. **The "Finalizing..." message is misleading**
   - The deck is already saved and returned from the backend
   - "Finalizing" implies something is still happening
   - Users understand "Finalized" ✓ but not "Finalizing..."

4. **Option A is the safest**
   - No state machine complexity
   - No race conditions possible
   - No callback contracts to maintain

### Implementation Steps

1. **Remove state variable** (line 411):
   ```typescript
   - const [isFinalizingCompletion, setIsFinalizingCompletion] = useState(false);
   ```

2. **Remove finalization useEffect** (lines 1538-1568):
   ```typescript
   - useEffect(() => {
   -   if (!onComplete || !taskId || !progress?.completed || !progress.result) {
   -     return;
   -   }
   -   if (completionHandledRef.current === taskId) {
   -     return;
   -   }
   -   completionHandledRef.current = taskId;
   -   setIsFinalizingCompletion(true);
   -   void Promise.resolve(onComplete(...))
   -     .catch(...)
   -     .finally(() => {
   -       setIsFinalizingCompletion(false);
   -     });
   - }, [...]);
   ```

3. **Add new auto-close useEffect**:
   ```typescript
   // Auto-close modal and refetch when generation completes
   useEffect(() => {
     if (!taskId || !progress?.completed || !progress.result) {
       return;
     }
     if (completionHandledRef.current === taskId) {
       return;
     }
     completionHandledRef.current = taskId;

     // Refetch deck in background, then close
     deckQuery.refetch().finally(() => {
       utils.presentation.getDeck.invalidate({ deckId });
       utils.presentation.getDeckByLibraryItem.invalidate();
       utils.presentation.listVersions.invalidate({ deckId });
       utils.presentation.getSlideshow.invalidate({ deckId });
       onClose();  // Close modal
     });
   }, [taskId, progress?.completed, progress?.result, deckId, utils, onClose, deckQuery]);
   ```

4. **Remove guard from handleClose** (line 1525):
   ```typescript
   const handleClose = useCallback(() => {
     // Remove: if (isFinalizingCompletion) { return; }
     if (completed && progress?.result) {
       utils.presentation.getDeck.invalidate({ deckId });
       // ...
     }
     onClose();
   }, [completed, progress, utils, deckId, onClose]);
   ```

5. **Remove finalization display** (lines 2734-2738):
   ```typescript
   - {isFinalizingCompletion && (
   -   <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
   -     <Loader2 className="h-3.5 w-3.5 animate-spin" />
   -     Finalizing output...
   -   </div>
   - )}
   ```

6. **Remove from disabled checks**:
   - Line 2797: `disabled={!canGenerate || isFinalizingCompletion}`
   - Line 2843: `disabled={cancelDraft.isPending || isFinalizingCompletion}`
   - Line 2854: `disabled={isFinalizingCompletion}`

7. **Update the callback type** (remove if unused):
   ```typescript
   - onComplete?: (context: {...}) => Promise<void> | void;
   ```

8. **Remove from PresentationEditor.tsx** (lines 10948-10960):
   ```typescript
   - onComplete={async ({ close }) => {
   -   await deckQuery.refetch();
   -   close();
   - }}
   ```

### Testing

- [ ] Generate a 5-slide presentation and verify modal closes immediately after completion
- [ ] Verify "Finalizing output..." message is gone
- [ ] Verify deck is updated with new slides when modal closes
- [ ] Verify cache is properly invalidated (navigate away and back)
- [ ] Test with slow network (simulate 2-3 second refetch delay)
- [ ] Test error scenarios (refetch fails, then user retries)

### Rollback Plan

If Option A causes issues:
1. Revert to Option B (fix race condition)
2. Keep the finalization state but properly ordered

---

## Open Questions

1. **Was `onComplete` callback used anywhere else?**
   - Search codebase for other AIDraftModal usages
   - Check if any other components provide custom onComplete logic

2. **Does `deckQuery.refetch()` ever actually fail?**
   - What error would be returned?
   - Is the error being swallowed or shown to user?

3. **Why was the finalization state introduced in the first place?**
   - Was there a specific bug it was meant to solve?
   - Has the pattern been reviewed since implementation?

4. **Is there a difference between "completed" and "finalized"?**
   - Should the modal stay open while cache is being invalidated?
   - Or is that operation transparent to the user?

---

## Key Code Locations

| File | Lines | Function | Issue |
|------|-------|----------|-------|
| AIDraftModal.tsx | 411 | State init | `isFinalizingCompletion` state |
| AIDraftModal.tsx | 1525-1536 | handleClose | Guard exits if finalization active |
| AIDraftModal.tsx | 1538-1568 | useEffect | Sets finalization before calling close |
| AIDraftModal.tsx | 1547 | Line | `setIsFinalizingCompletion(true)` |
| AIDraftModal.tsx | 1566 | Line | `setIsFinalizingCompletion(false)` in .finally() |
| AIDraftModal.tsx | 2734-2738 | Display | "Finalizing output..." spinner |
| AIDraftModal.tsx | 2797, 2843, 2854 | Buttons | Disabled while finalizing |
| PresentationEditor.tsx | 10956-10959 | onComplete | Callback implementation |
| aiPresentationService.ts | 11008-11022 | Phase 7 | Returns completed: true |

---

## Summary

The "Finalizing output..." hang is caused by a **synchronization bug in the state machine** where `isFinalizingCompletion=true` prevents `handleClose()` from executing, but the flag doesn't change until after the close should have happened.

**Recommended fix:** Remove the finalization state entirely and auto-close the modal directly when generation completes. The modal is serving no purpose in "finalizing" — the deck is already saved.

**Effort:** 1 hour implementation + 30 minutes testing
**Risk:** Low — the finalization state appears to serve no purpose
**Impact:** Much better UX — modal closes immediately after completion
