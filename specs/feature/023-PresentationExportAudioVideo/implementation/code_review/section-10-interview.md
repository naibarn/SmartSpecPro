# Section-10 Code Review Interview Transcript

**Date:** 2026-02-24
**Section:** section-10-editor-modifications
**Verdict after fixes:** APPROVED

---

## Auto-Fixes Applied (No User Input Required)

### M3: Play Mode uses `docId` instead of `deck.libraryItemId` (auto-fix)

- The reviewer correctly identified that `deck.libraryItemId` is non-nullable when deck is defined, while `docId` (parsed from URL route param) is `number | null`.
- The Play Mode button has `disabled={!deck}` but NOT `disabled={!docId}`, so it was theoretically possible to navigate to `/presentation/null/play` if `deck` was loaded but `docId` was null (malformed route param edge case).
- Fixed: changed `setLocation(\`/presentation/${docId}/play\`)` to `setLocation(\`/presentation/${deck.libraryItemId}/play\`)`.
- The test fixture has `deck.libraryItemId = 42` and `routeParamsMock = { docId: "42" }`, so 47/47 tests still pass.

---

## Items Dismissed (False Positives or Acknowledged)

### H1: ExportDialog prop contract mismatch (dismissed — false positive)

- Reviewer flagged that the plan specified `onOpenChange` and `itemId` on ExportDialog, but the component uses `onClose`.
- The actual `ExportDialog` implementation (section-08) uses `{ deckId: number; open: boolean; onClose: () => void }`. Our usage of `onClose={() => setIsExportDialogOpen(false)}` is correct.
- `itemId` is not a prop on ExportDialog — idempotency keys are generated internally via `crypto.randomUUID()`. The plan's stated interface drifted from the actual implementation; no code change needed.

### H2: SlideAudioPanel "always instantiated" (dismissed — false positive)

- Reviewer claimed SlideAudioPanel's hooks run even when the Audio tab is inactive.
- `const audioPanel = deck ? <SlideAudioPanel ...> : <div>` creates a React element (virtual DOM descriptor), not a mounted component. The component's hooks only run when `audioPanel` is placed in the live DOM.
- `audioPanel` is only placed in the DOM when `desktopInspectorTab === "audio"` (the ternary in `desktopInspectorPanel` render). So SlideAudioPanel only mounts when the user clicks the Audio tab. No spurious network requests occur.

### H3: `as any` type bypass for audio fields (acknowledged, not fixing)

- `(selectedSlide as any)?.audioTrack` and `(deck as any)?.projectAudioTrack` are cast through `any` because the tRPC response types do not yet include these fields until section-04 is fully integrated.
- This is a deliberate interim bridge. When section-04's typed response propagates correctly, these casts can be replaced with proper types.

### M1: Dead test mocks for `setSlideAudio`/`setDeckAudio` (let go)

- These mutations belong to `SlideAudioPanel`, which is fully mocked in `PresentationEditor.test.tsx`. The editor itself does not call them.
- Adding the mocks is defensive — if the tRPC mock doesn't include them and some future code path calls them, the test will now handle it gracefully rather than throwing "trpc.presentation.setSlideAudio is not a function".

### M2: Old export polling running alongside ExportDialog (acknowledged, not fixing)

- `exportStatusQuery` (5-second polling) and `handleExport` + `triggerExportMutation` remain as dead code.
- This is explicitly acknowledged in the section-10 plan: "Removing it is a follow-up cleanup and not required in this section."
- ExportDialog manages its own polling independently. The old code path has no UI trigger so the polling only activates if `lastExportId` becomes non-null, which cannot happen without the old export buttons.

### L1: Mock drops `onClose` from ExportDialog (let go)

- The mock tests that `ExportDialog` opens when the Export button is clicked. The close path is tested in `ExportDialog.test.tsx` directly.

### L2: Two tests removed without replacement in this file (acknowledged)

- `"surfaces actionable export failure messaging"` and `"renders deterministic export warning codes"` tested `handleExport()` which is now dead code (no UI trigger).
- Export error/progress coverage is handled in `ExportDialog.test.tsx` (17 tests).

### L3: Loading fallback inconsistency in Audio tab (let go)

- The `"Loading..."` text shown when `!deck` does not use the `Loader2` spinner. This is a UX polish issue, not a functional bug. The Audio tab is not accessible until deck loads.

---

## Final Test Count

- **47 tests** in `apps/web/client/src/pages/PresentationEditor.test.tsx`
- **47/47 passing**
- New tests cover: Export button presence, ExportDialog opens on click, Audio tab presence, SlideAudioPanel renders with correct deckId, Play Mode button presence, Play Mode navigation to correct route
