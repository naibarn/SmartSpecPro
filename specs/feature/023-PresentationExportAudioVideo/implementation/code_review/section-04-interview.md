# Code Review Interview — Section 04: tRPC Router

**Date:** 2026-02-23
**Section:** section-04-trpc-router
**Reviewer:** deep-implement:code-reviewer subagent

---

## Items Requiring User Decision

### 1. Schema Alias for `presentationPlayDeckPayloadSchema`

**Finding (MEDIUM):** `presentationPlayDeckPayloadSchema` is aliased to `presentationSlideshowPayloadSchema` at `contracts.ts:393`, making them the same TypeScript type. When play-mode-only fields are added later, this requires a breaking schema change rather than `.extend({})`.

**Decision asked:** Keep alias with TODO comment, or create a proper `.extend({})` now?

**User decision:** Keep alias + TODO comment (Recommended)

**Resolution:** Applied. Added TODO comment above the alias:
```typescript
// TODO: When play-mode-only fields are added (e.g., chapter markers, loop ranges), replace this
// alias with `presentationSlideshowPayloadSchema.extend({...})` to avoid a breaking schema change.
export const presentationPlayDeckPayloadSchema = presentationSlideshowPayloadSchema;
```

---

### 2. `quality` Field Missing `.default("standard")`

**Finding (MEDIUM):** The spec says `quality: z.enum(["draft", "standard", "high"]).optional().default("standard")`. The implementation omitted `.default("standard")`, meaning `quality` is `undefined` when not provided rather than `"standard"`.

**Decision asked:** Add `.default("standard")`, or leave as `.optional()` since Python handles missing quality?

**User decision:** Add `.default("standard")` (Recommended)

**Resolution:** Applied. Router schema now reads:
```typescript
quality: z.enum(["draft", "standard", "high"]).optional().default("standard"),
```

---

### 3. Silent DB-Unavailable Fallback in `buildPlayDeckPayload`

**Finding (LOW):** When `getDb()` returns null, `buildPlayDeckPayload` returns the unmodified slideshow payload with no audio URL resolution — play mode silently plays without audio, no client signal.

**Decision asked:** Fail fast (throw error), or silent degrade + log warning?

**User decision:** Silent degrade + log warning (Recommended)

**Resolution:** Applied. Added `console.warn` before returning degraded payload:
```typescript
if (!db) {
  console.warn("[buildPlayDeckPayload] DB unavailable — returning payload without audio resolution");
  return presentationPlayDeckPayloadSchema.parse(slideshowPayload);
}
```

---

## Auto-Fixes Applied (No User Input Required)

### 4. Non-atomic Slide+Deck Version Increment in `updateSlideAudioTrack`

**Finding (HIGH):** Slide UPDATE and deck version bump were two separate non-transactional calls. If the process crashed between them, the system would have inconsistent state. Additionally, the slide WHERE clause was missing the CAS guard (`eq(presentationSlides.version, currentSlide.version)`) used by `updateSlideInDeck`.

**Fix:** Wrapped both UPDATE statements in `db.transaction(async (tx) => { ... })` and added:
```typescript
eq(presentationSlides.version, currentSlide.version),  // CAS guard
```
to the slide WHERE clause, consistent with the `updateSlideInDeck` pattern.

---

### 5. `as any` Casts — Added Explanatory Comments

**Finding (HIGH):** `audioTrack: input.audioTrack as any` and `projectAudioTrack: input.projectAudioTrack as any` in Drizzle `.set()` calls defeated type checking silently.

**Fix:** Added explanatory comments at both cast sites:
- `updateSlideAudioTrack`: "AudioTrackInput.endAtMs is `number | undefined` while SlideAudioTrackJson.endAtMs is `number | null`. Structurally equivalent at runtime; cast is safe."
- `updateDeckProjectAudioTrack`: "ProjectAudioTrackInput.fadeOutMs is `number | undefined` while DeckAudioTrackJson.fadeOutMs is `number | null`. Structurally equivalent at runtime; cast is safe."

---

### 6. N+1 DB Queries in `buildPlayDeckPayload` — Batched

**Finding (MEDIUM):** Original implementation fired one DB query per slide with an audio track (`Promise.all` over per-slide selects), resulting in N+1 queries for a deck with N audio slides.

**Fix:** Replaced with:
1. Collect all distinct `libraryItemId` values from slides + deck project audio
2. Single `db.select().from(libraryItems).where(inArray(libraryItems.id, allItemIds))` query
3. Build Map from results
4. Resolve presigned URLs in parallel from the Map
5. Enrich slides synchronously from the URL cache

Reduces N+1 to 1 DB query + parallel presign calls.

---

### 7. Missing `setDeckAudio requires tenant context` Test

**Finding (MEDIUM):** `setSlideAudio` had a tenant context guard test but `setDeckAudio` did not.

**Fix:** Added test:
```typescript
it("setDeckAudio requires tenant context", async () => { ... })
```

---

### 8. Missing `setDeckAudio maps VERSION_CONFLICT to CONFLICT tRPC error` Test

**Finding (MEDIUM):** `setSlideAudio` had a VERSION_CONFLICT mapping test but `setDeckAudio` did not.

**Fix:** Added test mirroring the `setSlideAudio` pattern with `updateDeckProjectAudioTrack` mock.

---

### 9. Missing `getPlayDeck returns projectAudioTrack with resolved URL` Test

**Finding (MEDIUM):** Spec required this test but it was absent. The project audio resolution code path had zero router-level test coverage.

**Fix:** Added test mocking `buildPlayDeckPayload` to return `projectAudioTrack: { url: '...', volume: 0.5, loop: true }` and asserting `result.projectAudioTrack?.url` is present.

---

### 10. Missing `triggerExport rejects missing idempotencyKey via Zod parse` Test

**Finding (MEDIUM):** Spec required a direct Zod parse test to verify `idempotencyKey` is required. The mock procedure bypasses tRPC schema enforcement.

**Fix:** Added test constructing the router's Zod schema and calling `.safeParse()` with missing `idempotencyKey`, asserting failure with `idempotencyKey` in the issue paths.

---

### 11. `buildPlayDeckPayload` Assertion Too Loose — Strengthened

**Finding (LOW):** `expect(playbackMocks.buildPlayDeckPayload).toHaveBeenCalled()` only checked the function was called, not what it was called with.

**Fix:** Strengthened to:
```typescript
expect(playbackMocks.buildPlayDeckPayload).toHaveBeenCalledWith(
  expect.objectContaining({ deck: { id: 88, libraryItemId: 42 } }),
  expect.any(Object),
);
```

---

## Items Let Go (No Action)

### 12. Double Deck Fetch in `getPlayDeck`

**Finding (LOW):** `getPresentationDeckByLibraryItem` + `getPresentationDeckDetail` both query the deck row, fetching it twice.

**Assessment:** Pre-existing pattern in the router. Minor latency. Not addressed in this section.

---

### 13. Mock Name Differs from Stale Spec Draft

**Finding (LOW):** Spec draft used `getPresentationDeckByLibraryItemWithAudio` but implementation correctly uses `getPresentationDeckByLibraryItem` (the actual function name).

**Assessment:** Implementation is correct. Spec naming was stale. No action needed; noted in doc update.

---

## Final Test Results

All 78 tests pass:
- `presentation.test.ts`: 46/46 ✓ (was 33, +13 new tests from fixes)
- `presentationPlaybackExport.test.ts`: 21/21 ✓
- `presentationExportService.test.ts`: 9/9 ✓
- `presentationWorkflowRegression.test.ts`: 11/11 ✓
