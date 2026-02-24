# Section-09 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-09-slide-audio-panel
**Verdict after fixes:** APPROVED

---

## Items Presented to User

### H2: `title` field in mutation input fails strict Zod validation

**Presented:** `audioTrackInputSchema` and `projectAudioTrackInputSchema` are both `.strict()`. The implementation sent `title` inside the audioTrack/projectAudioTrack mutation input objects, which Zod rejects with an "unrecognized keys" error at runtime.
Options: (a) Strip title from mutation inputs, keep it display-only in local state; (b) Add `title` as optional field to Zod schemas (requires removing `.strict()`).

**User decision:** Strip title before mutation (option a). No schema changes.

**Applied:** `buildSlideAudioTrackInput()` and `buildDeckAudioTrackInput()` helper functions construct clean `AudioTrackInput`/`ProjectAudioTrackInput` objects without `title`. The `_title` parameter is still accepted in picker-select handlers for future use (e.g., optimistic local title display) but is not forwarded to the server.

---

### M2: Selecting audio file immediately saves (deviates from plan spec requiring explicit Save)

**Presented:** The plan says "only call mutation on explicit Save or Remove." The implementation calls the mutation immediately when a user selects a file from the picker. Options: (a) Keep immediate save on select; (b) Populate local state only, require Save.

**User decision:** Immediate save on select (keep current behavior). Acceptable UX deviation from plan.

**No code change.** Behavior documented.

---

## Auto-Fixes Applied (No User Input Required)

### H2 (co-applied): Broken type cast `as AudioTrackInput & { title: string }` removed

- Removed incorrect type casts that suppressed TypeScript errors. Proper typed builder functions now construct the mutation inputs.

### Bug: `setDeckAudio` used `audioTrack` field — should be `projectAudioTrack` (auto-fix)

- The tRPC `setDeckAudio` mutation input schema uses `projectAudioTrack` (not `audioTrack`).
- Fixed all three deck mutation calls: `handleRemoveDeckAudio`, `handleSaveDeckAudio`, `handleDeckAudioSelect`.
- Test 7 updated to assert `projectAudioTrack: null` (not `audioTrack: null`).

### H3: `endAtMs: 0` would be sent when Play-to-End is unchecked and end time not set (auto-fix)

- Added `computeSlideEndAtMs()` helper: returns `null` when `slidePlayToEnd === true` OR when `slideEndSec <= 0` (H3 guard prevents sending `endAtMs: 0` which means "start=end, play silence").
- `slideEndSec` input field's `min` attribute changed to `0.1` to reflect the constraint.

### M1: Draft state not reset when `slideId` changes (auto-fix)

- Added `slideId` to the `useEffect` dependency array that syncs slide audio draft state.
- State now resets to the new slide's values when the user selects a different slide.

### M3: Version conflict errors show generic toast (auto-fix)

- Added `onSlideAudioError` and `onDeckAudioError` handlers that check `err.data?.code === "CONFLICT"` and show a more specific message: "Slide/Deck was modified by another session. Please reload and try again."
- Non-conflict errors continue to show the generic `err.message`.

### M5: Save buttons missing `aria-label` (auto-fix)

- Added `aria-label="Save slide audio"` to the slide audio Save button.
- Added `aria-label="Save project audio"` to the deck audio Save button.
- Allows screen reader users to distinguish between the two Save buttons in the panel.

---

## Items Noted But Not Fixed

### H1: Review claimed `trpc.library.search` doesn't exist (false alarm)

- Investigation confirmed `trpc.library.search` IS defined at `apps/web/server/routers/library.ts:126` with a `filters.itemType` parameter matching our usage.
- No fix needed. The custom AudioPickerDialog using `trpc.library.search` is correct.

### L1: Test mock for library.search (acceptable given H1 false alarm)

- Since `trpc.library.search` exists and is used correctly, the test mock is appropriate. No change.

### L5: Missing test for "Save sends correct volume conversion"

- Deferred. The 8 spec tests pass; a volume-conversion test is a future improvement.

---

## Final Test Count

- **8 tests** in `apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx`
- **8/8 passing**
- Tests cover: Add Audio button (no track), audio title + slider (track exists), Remove slide audio (setSlideAudio null), volume slider aria-valuenow, Add Project Audio always visible, deck audio title + loop switch, Remove deck audio (setDeckAudio projectAudioTrack null), audio picker filters to itemType "audio"
