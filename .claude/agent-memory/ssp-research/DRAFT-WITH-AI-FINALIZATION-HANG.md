---
name: Draft with AI Finalization Hang Issue
description: Root cause analysis of the "Finalizing output..." spinner getting stuck after successful slide addition
type: project
---

## Research Brief

### Findings

The "Finalizing output..." spinner gets stuck because of a mismatch between what the frontend expects to happen during finalization and what the backend actually does.

**What the user sees:**
1. Modal shows: "Successfully added 5 slides to your deck" (green checkmark) ✓
2. Modal shows: "Finalizing output..." (spinner) ⏳ [STUCK HERE]
3. Console shows: Multiple "image generation variant X returned no media (submit_only_no_poll)" messages
4. Console shows: Multiple "queued deferred image tasks for later fetch" messages
5. Close button is disabled while finalization state is true
6. No timeout — the spinner just keeps spinning indefinitely

**Root cause:** The frontend's `onComplete` callback at line 10956 in PresentationEditor.tsx is designed to be awaited while `isFinalizingCompletion=true`. However:
- The callback calls `await deckQuery.refetch()`
- Once the refetch completes, it calls `close()`
- But `setIsFinalizingCompletion(false)` is in a `.finally()` block
- The problem: Nothing is triggering `close()` to complete the finalization

### Current Architecture

#### Backend Flow (aiPresentationService.ts)

**Phase 4: Media Submission** (lines 10133-10287)
- Calls `mediaGenerationService.generateImageAsync()` or `generateVideoAsync()`
- **Intentionally does NOT poll** for image completion
- Returns immediately with `status: "pending"` and `reason: "submit_only_no_poll"`
- Creates `pendingMediaJob` records for deferred completion
- Allows Draft with AI to complete in seconds instead of minutes

**Phase 6: Layout Compilation** (lines 10456-10865)
- Uses placeholder SVG images where media is still generating
- Embeds `pendingMediaJobs` into slide content for later resolution

**Phase 7: Deck Insertion** (lines 10898-11022)
- Saves all slides to the database with placeholder media
- Marks task as `completed: true` at line 11012
- Returns result with `slidesAdded` count and `warnings` (including deferred media messages)

#### Frontend Flow (AIDraftModal.tsx)

**State:** `isFinalizingCompletion` (line 411)

**Set to `true`:** Line 1547 when `progress?.completed && progress.result` AND `onComplete` is defined
```typescript
useEffect(() => {
  if (!onComplete || !taskId || !progress?.completed || !progress.result) {
    return;
  }
  if (completionHandledRef.current === taskId) {
    return;
  }

  completionHandledRef.current = taskId;
  setIsFinalizingCompletion(true);  // ← Line 1547

  void Promise.resolve(
    onComplete({
      deckId,
      taskId,
      result: progress.result,
      close: handleClose,  // ← Callback to close modal
    }),
  )
    .catch((error) => {
      completionHandledRef.current = null;
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to finalize AI draft output.",
      );
    })
    .finally(() => {
      setIsFinalizingCompletion(false);  // ← Line 1566
    });
}, [deckId, handleClose, onComplete, progress?.completed, progress?.result, taskId]);
```

**Called `onComplete` from PresentationEditor.tsx (lines 10956-10959):**
```typescript
onComplete={async ({ close }) => {
  await deckQuery.refetch();
  close();
}}
```

**Display:** Shows spinner at lines 2734-2738 while `isFinalizingCompletion=true`
```typescript
{isFinalizingCompletion && (
  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
    Finalizing output...
  </div>
)}
```

### The Hang Mechanism

1. **Backend completes:** Sends `completed: true` + `reason: "submit_only_no_poll"` (line 11012)
2. **Frontend updates:** `progress.completed` becomes true
3. **useEffect triggers** (line 1538): Sets `isFinalizingCompletion = true` and calls `onComplete()`
4. **PresentationEditor.tsx runs:**
   ```typescript
   onComplete={async ({ close }) => {
     await deckQuery.refetch();    // ← Fetches updated deck from server
     close();                       // ← Should call handleClose()
   }}
   ```
5. **Expected behavior:** `close()` calls `handleClose()` which closes the dialog
6. **Actual behavior:** ??? The modal never closes

### The Hidden Problem

The issue is that **the `close` callback is never actually called**, or it's called but the modal doesn't respond. This could happen if:

1. **`deckQuery.refetch()` throws an error** that's silently swallowed
   - The error is caught in `.catch()` and shown as toast
   - But `.finally()` still runs and sets `isFinalizingCompletion=false`
   - The modal never closes because `close()` was never called

2. **`close()` is called but it's the wrong function**
   - `handleClose()` at line 1525 has logic: `if (isFinalizingCompletion) { return; }`
   - So if `close()` is called BEFORE `isFinalizingCompletion=false`, it exits early
   - There's a race condition: `close()` is called while still finalizing

3. **`deckQuery.refetch()` never completes**
   - The refetch hangs or times out
   - The promise never resolves, so `close()` is never called

### Evidence From Code

**Line 1525 in handleClose:**
```typescript
const handleClose = useCallback(() => {
  if (isFinalizingCompletion) {
    return;  // ← EXIT EARLY if finalizing!
  }
  if (completed && progress?.result) {
    utils.presentation.getDeck.invalidate({ deckId });
    // ... cache invalidations ...
  }
  onClose();
}, [completed, progress, utils, deckId, isFinalizingCompletion, onClose]);
```

This is the critical issue: **`handleClose` refuses to execute while `isFinalizingCompletion=true`.** But the `close` callback passed to `onComplete()` is `handleClose`. So there's a race condition where:

1. `setIsFinalizingCompletion(true)` happens first
2. `onComplete({ close: handleClose })` calls the callback
3. Callback calls `await deckQuery.refetch()`
4. Callback calls `close()` → calls `handleClose()`
5. `handleClose()` checks `if (isFinalizingCompletion) { return; }`
6. Since `isFinalizingCompletion` is still true, `handleClose()` exits without closing
7. The `.finally()` at line 1566 sets `isFinalizingCompletion=false`
8. But by then, the modal was never closed!

### Risks

- **Modal stays open indefinitely** until user manually closes via Escape key or clicking outside
- **User experience is confusing:** Green checkmark + "Finalizing..." suggests the task is nearly done, but it's already done
- **State confusion:** The deck was already saved to the database, but the UI isn't showing it
- **If `refetch()` fails:** Error toast appears, but modal still won't close because `close()` was never called

### Options

**Option A: Remove the finalization state entirely** (RECOMMENDED)
- Delete `isFinalizingCompletion` state
- Inline the refetch logic directly into the main progress monitor
- Don't require an `onComplete` callback at all — just refetch on completion
- Pros: Simplest, eliminates the race condition entirely
- Cons: Changes the component contract for callers

**Option B: Fix the race condition**
- Change `handleClose` to not check `isFinalizingCompletion`
- Or use a separate internal close function that bypasses the check
- Ensure `setIsFinalizingCompletion(false)` happens BEFORE calling `close()`
- Pros: Minimal changes to existing code
- Cons: Still fragile if logic changes in the future

**Option C: Add explicit timeout**
- Add a 30-second timeout to the finalization promise
- If `onComplete` doesn't finish, force-close the modal
- Show warning if timeout occurs
- Pros: Prevents indefinite hang
- Cons: Hides the underlying bug, user sees "timeout" instead of real error

### Recommendation

**Use Option B with explicit sequencing:**

1. Set `isFinalizingCompletion = true`
2. Call `onComplete()` and await result
3. **Set `isFinalizingCompletion = false`** (move before `close()`)
4. **Then call `close()`**

This ensures `isFinalizingCompletion` is false before `handleClose()` is invoked, eliminating the race condition.

Alternatively, add the refetch logic directly to AIDraftModal without requiring an `onComplete` callback, since the completion handler is always the same: "refetch the deck".

### Open Questions

1. Why was `onComplete` callback introduced in the first place? What was the intent?
2. Are there other callers of AIDraftModal that provide different `onComplete` implementations?
3. Does `deckQuery.refetch()` ever fail? What does the error look like?
4. Why not inline the refetch directly in AIDraftModal without the callback?

### Key Files

- **Frontend Modal:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx`
  - State: Line 411 (`isFinalizingCompletion`)
  - Set true: Line 1547
  - Set false: Line 1566
  - Display: Lines 2734-2738
  - handleClose: Lines 1525-1536

- **Backend Service:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`
  - Phase 4 media submission: Lines 10133-10287 (submit_only_no_poll)
  - Phase 7 completion: Lines 11008-11022 (sends completed: true)

- **Caller:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx`
  - onComplete callback: Lines 10956-10959
  - Uses `deckQuery.refetch()` + `close()`

### Data Flow During Hang

```
Backend              Frontend (Modal)           Frontend (Editor)         Browser
─────────────────────────────────────────────────────────────────────────────────
                                                ┌─ AIDraftModal
                                                │  isFinalizingCompletion=false
                                                │
generateAIDraft()                               │  onOpen={true}
completes                                       │
(phase 7, line 11012)                          │
  ↓                                            │
sends progress:                                │
  completed: true                              │
  reason: "submit_only_no_poll"                │
  result: { slidesAdded: 5, ... }              │
  ↓                                            │
progress stream                                 ↓
updated (SSE/polling)                     useEffect (line 1538)
                                          triggered: progress.completed=true
                                               ↓
                                          setIsFinalizingCompletion(true)
                                          onComplete({ close: handleClose })
                                               ↓
                                                ┌─ PresentationEditor.tsx
                                                │
                                                ├→ deckQuery.refetch()
                                                │   (async, may fail)
                                                │
                                                └→ close() = handleClose()
                                                      ↓
                                                   checkIfFinalizing()
                                                   if (isFinalizingCompletion)
                                                     return  ← EXITS!
                                                      ↓
                                                   onClose() NEVER CALLED
                                                      ↓
                                          .finally() runs
                                          setIsFinalizingCompletion(false)
                                               ↓
                                          BUT MODAL ALREADY NOT CLOSED!
                                          Spinner still visible
```

### Why "submit_only_no_poll" Appears

This is intentional design: The backend submits images to the provider (e.g., Kie.ai) without waiting for results. The frontend then:
1. Shows placeholder images in slides
2. Saves `pendingMediaJob` records to the database
3. Later polls to resolve real image URLs when they're ready

This is why the `warnings` include messages like `"image generation variant 1 returned no media (submit_only_no_poll) [task=xxx]"` — it's not an error, it's the expected flow. The hang isn't caused by missing media, it's the race condition in the finalization state machine.
