# Code Review — Section 04: tRPC Router

**Date:** 2026-02-23
**Section:** section-04-trpc-router
**Reviewer:** deep-implement:code-reviewer subagent

**Overall Verdict: PASS WITH FIXES**

The three new procedures (`setSlideAudio`, `setDeckAudio`, `getPlayDeck`) are broadly correct and follow existing router conventions. However there are two HIGH-severity issues (data integrity + type safety) plus several MEDIUM issues around test coverage and spec deviations.

---

## HIGH Severity

### H-1: Non-atomic slide+deck version increment in `updateSlideAudioTrack`

**File:** `apps/web/server/services/presentationService.ts`

The slide UPDATE and deck version bump are two separate, non-transactional DB calls. If the process crashes between them, the slide version increments but the deck version does not, leaving inconsistent state. Every other write that modifies both tables (e.g., `addSlideToDeck`, `deleteSlideFromDeck`) wraps multi-step operations in `db.transaction(...)`. Additionally, the WHERE clause on the slide update omits `eq(presentationSlides.version, currentSlide.version)` — an atomic compare-and-swap guard used by `updateSlideInDeck` to prevent lost updates from concurrent writes.

**Recommended fix (auto-fix):** Wrap both UPDATE statements in `db.transaction(async (tx) => { ... })` and add `eq(presentationSlides.version, currentSlide.version)` to the slide WHERE clause.

---

### H-2: `as any` casts on `audioTrack` and `projectAudioTrack` in Drizzle `.set()` calls

**File:** `apps/web/server/services/presentationService.ts`

```typescript
audioTrack: input.audioTrack as any,          // updateSlideAudioTrack
projectAudioTrack: input.projectAudioTrack as any,  // updateDeckProjectAudioTrack
```

These bypass Drizzle's column-type checking. The type mismatch exists because `AudioTrackInput.endAtMs` is `number | undefined` (optional) while `SlideAudioTrackJson.endAtMs` is `number | null`. The cast is structurally safe at runtime but defeats static analysis.

**Recommended fix (auto-fix):** Add a comment at each cast site explaining why the cast is necessary, so future maintainers understand the structural equivalence.

---

## MEDIUM Severity

### M-1: `presentationPlayDeckPayloadSchema` aliased to `presentationSlideshowPayloadSchema` (design debt)

**File:** `apps/web/shared/presentation/contracts.ts`

The alias `export const presentationPlayDeckPayloadSchema = presentationSlideshowPayloadSchema` means `PresentationPlayDeckPayload` and `PresentationSlideshowPayload` are exactly the same TypeScript type. When play-mode-only fields need to be added, this becomes a breaking change.

**Requires user decision:** Keep alias with a `// TODO` comment, or create a proper `presentationSlideshowPayloadSchema.extend({})` now?

---

### M-2: N+1 DB queries + presign calls per slide in `buildPlayDeckPayload`

**File:** `apps/web/server/services/presentationPlaybackExport.ts`

`Promise.all` fires one DB query per slide with an audio track plus one presign call. For a 50-slide deck, this is 50 concurrent DB reads and up to 50 presign HTTP calls.

**Recommended fix (auto-fix):** Collect all distinct `libraryItemId` values, do one `db.select().from(libraryItems).where(inArray(libraryItems.id, ids))` query, build a Map, then enrich slides from the map.

---

### M-3: `setDeckAudio` missing tenant isolation test

**File:** `apps/web/server/routers/presentation.test.ts`

`setSlideAudio` has a `requires tenant context` test but `setDeckAudio` does not.

**Recommended fix (auto-fix):** Add equivalent test for `setDeckAudio`.

---

### M-4: `setDeckAudio` missing `VERSION_CONFLICT → CONFLICT` error mapping test

**File:** `apps/web/server/routers/presentation.test.ts`

`setSlideAudio` has a VERSION_CONFLICT test but `setDeckAudio` does not.

**Recommended fix (auto-fix):** Mirror the test for `setDeckAudio`.

---

### M-5: `getPlayDeck` missing `projectAudioTrack` resolution test

**File:** `apps/web/server/routers/presentation.test.ts`

The spec explicitly lists `getPlayDeck returns projectAudioTrack with resolved URL on deck` as a required test case. It is absent from the diff.

**Recommended fix (auto-fix):** Add the test, mocking `buildPlayDeckPayload` to return `projectAudioTrack: { url: '...', volume: 0.5, loop: true }`.

---

### M-6: Missing `triggerExport idempotencyKey` required-field Zod parse test

**File:** `apps/web/server/routers/presentation.test.ts`

The spec notes this test must use direct Zod parse (since the mock procedure bypasses schema enforcement). Test is not in the diff.

**Recommended fix (auto-fix):** Add Zod parse test asserting omitting `idempotencyKey` fails validation.

---

### M-7: `quality` missing `.default("standard")` (spec deviation)

**File:** `apps/web/server/routers/presentation.ts`, line ~279

Spec says `.optional().default("standard")`, implementation has `.optional()` only. Without the default, `quality` is `undefined` when not provided.

**Requires user decision:** Confirm whether Python export task treats missing `quality` identically to `"standard"`. If yes, add `.default("standard")` to match spec.

---

## LOW Severity

### L-1: Double deck fetch in `getPlayDeck`

`getPresentationDeckByLibraryItem` + `getPresentationDeckDetail` both query the deck row. Minor latency, pre-existing pattern issue.

**Assessment:** Low priority. No action needed now.

---

### L-2: Mock name `getPresentationDeckByLibraryItem` differs from stale spec draft name

The implementation uses the correct actual function name. Spec naming was stale draft. No action needed; note in doc update.

---

### L-3: `buildPlayDeckPayload` assertion too loose

```typescript
expect(playbackMocks.buildPlayDeckPayload).toHaveBeenCalled();
```

Should assert the arguments, not just that it was called.

**Recommended fix (auto-fix):** Strengthen to `toHaveBeenCalledWith(expect.objectContaining({ deck: { id: 88, libraryItemId: 42 } }), expect.any(Object))`.

---

### L-4: Silent DB-unavailable fallback in `buildPlayDeckPayload`

When `getDb()` returns null, the function returns the unmodified slideshow payload (no audio resolution), silently playing without audio. No log, no client warning.

**Requires user decision:** Fail fast (throw error) or add `warnings` array to response?

---

## Summary

| # | Severity | Description | Disposition |
|---|----------|-------------|-------------|
| H-1 | HIGH | Non-atomic slide+deck update — no transaction | Auto-fix |
| H-2 | HIGH | `as any` casts — add explanatory comments | Auto-fix |
| M-1 | MEDIUM | Schema alias for PlayDeckPayload | **User decision** |
| M-2 | MEDIUM | N+1 DB queries in `buildPlayDeckPayload` | Auto-fix |
| M-3 | MEDIUM | `setDeckAudio` missing tenant context test | Auto-fix |
| M-4 | MEDIUM | `setDeckAudio` missing VERSION_CONFLICT test | Auto-fix |
| M-5 | MEDIUM | `getPlayDeck` missing projectAudioTrack test | Auto-fix |
| M-6 | MEDIUM | `triggerExport` missing idempotencyKey Zod test | Auto-fix |
| M-7 | MEDIUM | `quality` missing `.default("standard")` | **User decision** |
| L-1 | LOW | Double deck fetch | No action |
| L-2 | LOW | Mock naming (no-op) | No action |
| L-3 | LOW | Loose `toHaveBeenCalled` assertion | Auto-fix |
| L-4 | LOW | Silent DB-unavailable fallback | **User decision** |
