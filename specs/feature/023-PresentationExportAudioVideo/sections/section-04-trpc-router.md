Now I have all the context needed to write the section. Let me compose the complete section content.

# Section 04: tRPC Router

## Overview

This section modifies `apps/web/server/routers/presentation.ts` to extend existing procedures and add three new procedures (`setSlideAudio`, `setDeckAudio`, `getPlayDeck`). It also requires corresponding additions to `apps/web/server/services/presentationService.ts` for the audio CRUD helpers.

**Implementation position:** Batch 4 (runs after section-02-shared-contracts and section-03-export-service are complete).

**Depends on:**
- Section 01 (database migration): `presentation_slides.audioTrack` and `presentation_decks.projectAudioTrack` columns must exist
- Section 02 (shared contracts): `audioTrackInputSchema`, `projectAudioTrackInputSchema`, `PresentationPlayDeckPayload`, and the updated `exportId: number` types must be defined in `apps/web/shared/presentation/contracts.ts`
- Section 03 (export service): `triggerPresentationExport` and `getPresentationExportStatus` must be updated to use DB-backed records with integer IDs

**Blocks:** Sections 08, 09, 11 (frontend components that call `setSlideAudio`, `setDeckAudio`, `getPlayDeck`).

---

## Tests First

Write these tests in `apps/web/server/routers/presentation.test.ts` (extend the existing file) **before** modifying the router.

The test file already mocks the service and playback modules using `vi.mock`. Extend those mock setups with the new service functions, then add the test cases below.

### New mock functions to add to `serviceMocks`

The `vi.hoisted` block for `serviceMocks` needs three additional mock functions:

```typescript
// Add to the serviceMocks vi.hoisted block:
updateSlideAudioTrack: vi.fn(),
updateDeckProjectAudioTrack: vi.fn(),
getPresentationDeckByLibraryItemWithAudio: vi.fn(),
```

Also extend the `vi.mock("../services/presentationService", ...)` block to export these new functions.

Add a new mock function `resolveAudioUrlsForPayload` to the `playbackMocks` block (or a new `audioMocks` block if preferred) for the `getPlayDeck` audio URL resolution step.

### Test cases to add

Add these to the `describe("presentationRouter")` block:

```typescript
// --- triggerExport input extension ---

it("triggerExport accepts format: 'jpg'", async () => {
  // Mock triggerPresentationExport to return a numeric exportId
  // Call triggerExport with { deckId: 88, format: "jpg", idempotencyKey: "key-1" }
  // Assert triggerPresentationExport was called with format "jpg"
});

it("triggerExport accepts format: 'pdf'", async () => {
  // Call triggerExport with { deckId: 88, format: "pdf", idempotencyKey: "key-2" }
  // Assert service was called with format "pdf"
});

it("triggerExport passes quality to service layer", async () => {
  // Call triggerExport with quality: "high"
  // Assert service received quality: "high"
});

it("triggerExport requires idempotencyKey", async () => {
  // Call triggerExport without idempotencyKey
  // This is a Zod validation test — input schema rejects missing idempotencyKey
  // In the router test pattern used in this file, the input schema is not automatically
  // enforced (the mock procedure bypasses it), so test this via Zod parse directly:
  // z.object({ deckId: z.number(), format: z.enum([...]), idempotencyKey: z.string().min(1).max(128) })
  //   .parse({ deckId: 88, format: "png" }) → should throw ZodError
});

// --- getExportStatus output extension ---

it("getExportStatus returns progressPct and stage fields", async () => {
  // Mock getPresentationExportStatus to return { exportId: 5, progressPct: 42, stage: "rendering", status: "processing" }
  // Call getExportStatus with { exportId: 5 }
  // Assert result.progressPct === 42 and result.stage === "rendering"
});

it("getExportStatus returns downloadUrl when status is done", async () => {
  // Mock to return { status: "done", downloadUrl: "https://cdn.example.com/out.mp4", exportId: 5 }
  // Assert result.downloadUrl is present
});

// --- setSlideAudio ---

it("setSlideAudio stores audio track on slide", async () => {
  // Mock updateSlideAudioTrack to resolve successfully
  // Call setSlideAudio with { deckId: 88, slideId: 10, expectedVersion: 3, audioTrack: { libraryItemId: 5, volume: 0.8, startAtMs: 0 } }
  // Assert updateSlideAudioTrack was called with correct params and actor
});

it("setSlideAudio with null removes existing audio track", async () => {
  // Call setSlideAudio with audioTrack: null
  // Assert updateSlideAudioTrack was called with null audioTrack
});

it("setSlideAudio requires expectedVersion", async () => {
  // Zod parse test: input schema without expectedVersion should fail
});

it("setSlideAudio requires authentication - missing tenant context throws", async () => {
  // Call with ctx: { tenantId: null, user: { id: 1 } }
  // Expect TRPCError with message containing "Tenant context is required"
});

// --- setDeckAudio ---

it("setDeckAudio stores project audio track on deck", async () => {
  // Mock updateDeckProjectAudioTrack to resolve successfully
  // Call setDeckAudio with { deckId: 88, expectedVersion: 3, projectAudioTrack: { libraryItemId: 7, volume: 0.5, loop: true } }
  // Assert service was called with correct params and actor
});

it("setDeckAudio with null removes project audio track", async () => {
  // Call with projectAudioTrack: null
  // Assert service was called with null
});

// --- getPlayDeck ---

it("getPlayDeck returns deck with resolved audio URLs in slides", async () => {
  // Mock getPresentationDeckDetail to return a deck with slides that have audioTrack with libraryItemId
  // Mock buildSlideshowPayload to return slideshow with audio fields
  // Mock the audio URL resolution helper to return slides with .url populated
  // Call getPlayDeck with { itemId: 42 }
  // Assert result.slides[0].audioTrack.url is defined (not libraryItemId)
});

it("getPlayDeck requires authentication - missing tenant throws", async () => {
  // Call with ctx: { tenantId: null, user: { id: 1 } }
  // Expect TRPCError "Tenant context is required"
});

it("getPlayDeck returns projectAudioTrack with resolved URL on deck", async () => {
  // Mock deck to have projectAudioTrack with libraryItemId
  // Assert result.projectAudioTrack.url is defined
});
```

---

## Implementation Details

### File to modify: `apps/web/server/routers/presentation.ts`

#### 4.1 Extend `triggerExport` input schema

The current input schema is:
```typescript
z.object({
  deckId: z.number().int().positive(),
  format: z.enum(["png", "mp4"]),
  idempotencyKey: z.string().min(1).max(128).optional(),
})
```

Change to:
```typescript
z.object({
  deckId: z.number().int().positive(),
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  quality: z.enum(["draft", "standard", "high"]).optional().default("standard"),
  idempotencyKey: z.string().min(1).max(128),  // required (was optional)
})
```

The mutation handler body stays the same — it already delegates fully to `triggerPresentationExport(input, toPresentationActor(ctx))`.

#### 4.2 Extend `getExportStatus` input and output

The current input uses `exportId: z.string()`. Change to `exportId: z.number().int().positive()` (the DB row ID is an integer).

The procedure handler stays the same — it delegates to `getPresentationExportStatus(input.exportId, toPresentationActor(ctx))`. The updated return shape (with `progressPct`, `stage`, `downloadUrl`, `errorMessage`) is defined by the updated `presentationExportStatusResultSchema` from Section 02.

#### 4.3 New procedure: `setSlideAudio`

Add to the `presentationRouter` object:

```typescript
setSlideAudio: protectedProcedure
  .input(z.object({
    deckId: z.number().int().positive(),
    slideId: z.number().int().positive(),
    expectedVersion: z.number().int().nonnegative(),
    audioTrack: audioTrackInputSchema.nullable(),
  }))
  .mutation(async ({ input, ctx }) => {
    try {
      ensureFeatureEnabled();
      return await updateSlideAudioTrack(input, toPresentationActor(ctx));
    } catch (error) {
      if (error instanceof PresentationServiceError) {
        throw mapPresentationServiceError(error);
      }
      throw error;
    }
  }),
```

Import `audioTrackInputSchema` from `@shared/presentation/contracts` (added in Section 02).
Import `updateSlideAudioTrack` from `../services/presentationService` (added below).

#### 4.4 New procedure: `setDeckAudio`

```typescript
setDeckAudio: protectedProcedure
  .input(z.object({
    deckId: z.number().int().positive(),
    expectedVersion: z.number().int().nonnegative(),
    projectAudioTrack: projectAudioTrackInputSchema.nullable(),
  }))
  .mutation(async ({ input, ctx }) => {
    try {
      ensureFeatureEnabled();
      return await updateDeckProjectAudioTrack(input, toPresentationActor(ctx));
    } catch (error) {
      if (error instanceof PresentationServiceError) {
        throw mapPresentationServiceError(error);
      }
      throw error;
    }
  }),
```

Import `projectAudioTrackInputSchema` from `@shared/presentation/contracts`.
Import `updateDeckProjectAudioTrack` from `../services/presentationService`.

#### 4.5 New procedure: `getPlayDeck`

This is a query (read-only). It accepts a `libraryItemId` (the URL param used in the play mode route `/presentation/:itemId/play`), resolves the deck, builds the slideshow payload, then resolves audio URLs.

```typescript
getPlayDeck: protectedProcedure
  .input(z.object({
    itemId: z.number().int().positive(),
  }))
  .query(async ({ input, ctx }) => {
    try {
      ensureFeatureEnabled();
      const actor = toPresentationActor(ctx);
      const deck = await getPresentationDeckByLibraryItem(input.itemId, actor);
      if (!deck) {
        throw new PresentationServiceError(
          PRESENTATION_ERROR_CODE.NOT_FOUND,
          `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck for library item ${input.itemId}`,
        );
      }
      const detail = await getPresentationDeckDetail(deck.id, actor);
      const slideshowPayload = buildSlideshowPayload(detail.slides, { deckId: detail.deck.id });
      // Resolve audio URLs for play mode (same helper used by export service)
      return await buildPlayDeckPayload(detail, slideshowPayload);
    } catch (error) {
      if (error instanceof PresentationServiceError) {
        throw mapPresentationServiceError(error);
      }
      throw error;
    }
  }),
```

Import `buildPlayDeckPayload` from `../services/presentationPlaybackExport` (added in Section 03 — it resolves `libraryItemId` references in audio tracks to presigned URLs and attaches them to the slideshow payload).

Import `getPresentationDeckByLibraryItem` — this function already exists in `presentationService.ts` and is already used by `getDeckByLibraryItem` procedure.

#### Updated imports at the top of the router

Add to the existing import from `@shared/presentation/contracts`:
```typescript
import {
  // ... existing imports ...
  audioTrackInputSchema,
  projectAudioTrackInputSchema,
} from "@shared/presentation/contracts";
```

Add to the existing import from `../services/presentationService`:
```typescript
import {
  // ... existing imports ...
  updateSlideAudioTrack,
  updateDeckProjectAudioTrack,
} from "../services/presentationService";
```

Add to the existing import from `../services/presentationPlaybackExport`:
```typescript
import {
  buildSlideshowPayload,
  getPresentationExportStatus,
  triggerPresentationExport,
  buildPlayDeckPayload,   // NEW
} from "../services/presentationPlaybackExport";
```

---

## Service Layer Additions

### File to modify: `apps/web/server/services/presentationService.ts`

Add two new exported functions. Follow the same patterns as `updatePresentationDeckMetadata` (optimistic locking via `expectedVersion`) and `updateSlideInDeck`.

#### `updateSlideAudioTrack`

Signature and docstring stub:

```typescript
export interface UpdateSlideAudioTrackInput {
  deckId: number;
  slideId: number;
  expectedVersion: number;
  audioTrack: AudioTrackInput | null;  // AudioTrackInput = z.infer<typeof audioTrackInputSchema>
}

/**
 * Updates or clears the per-slide audio track configuration.
 * Uses optimistic locking: throws VERSION_CONFLICT if expectedVersion mismatches.
 * Returns the updated deck version number.
 */
export async function updateSlideAudioTrack(
  input: UpdateSlideAudioTrackInput,
  actor: PresentationActor,
): Promise<{ deckVersion: number; slideVersion: number }> { ... }
```

Implementation notes:
- Verify the deck exists and belongs to `actor.tenantId` (same guard as `updateSlideInDeck`)
- Check `actor` has write permission on the library item (call `getUserEffectivePermission`)
- Load the slide to verify it belongs to the deck
- Check `deck.version === input.expectedVersion` — if not, throw `PresentationServiceError(PRESENTATION_ERROR_CODE.VERSION_CONFLICT, ...)`
- Update `presentation_slides` row: set `audioTrack = input.audioTrack` (JSON column, null clears it)
- Increment `presentation_decks.version` and `presentation_slides.version`
- Return `{ deckVersion, slideVersion }`

#### `updateDeckProjectAudioTrack`

```typescript
export interface UpdateDeckProjectAudioTrackInput {
  deckId: number;
  expectedVersion: number;
  projectAudioTrack: ProjectAudioTrackInput | null;  // z.infer<typeof projectAudioTrackInputSchema>
}

/**
 * Updates or clears the deck-level project audio track.
 * Uses optimistic locking: throws VERSION_CONFLICT if expectedVersion mismatches.
 * Returns the updated deck version number.
 */
export async function updateDeckProjectAudioTrack(
  input: UpdateDeckProjectAudioTrackInput,
  actor: PresentationActor,
): Promise<{ deckVersion: number }> { ... }
```

Implementation notes:
- Same guards as `updateSlideAudioTrack` but operates on the deck's `projectAudioTrack` JSON column
- Update `presentation_decks` row: set `projectAudioTrack = input.projectAudioTrack`
- Increment `presentation_decks.version`

#### Types to import in `presentationService.ts`

```typescript
import {
  // ... existing imports ...
  audioTrackInputSchema,
  projectAudioTrackInputSchema,
  type AudioTrackInput,       // z.infer<typeof audioTrackInputSchema> — defined in Section 02
  type ProjectAudioTrackInput, // z.infer<typeof projectAudioTrackInputSchema> — defined in Section 02
} from "@shared/presentation/contracts";
```

---

## `buildPlayDeckPayload` in `presentationPlaybackExport.ts`

This function is implemented as part of Section 03 but is called from the `getPlayDeck` procedure in this section. For reference:

```typescript
/**
 * Builds a PresentationPlayDeckPayload from a deck detail.
 * Resolves libraryItemId references in audio tracks to presigned S3/R2 URLs.
 * Called by the getPlayDeck tRPC procedure for play mode.
 */
export async function buildPlayDeckPayload(
  detail: PresentationDeckDetail,
  slideshowPayload: PresentationSlideshowPayload,
): Promise<PresentationPlayDeckPayload> { ... }
```

The `PresentationPlayDeckPayload` type is defined in Section 02. It extends `PresentationSlideshowPayload` by adding `slides[].audioTrack?: ResolvedAudioTrack` and `projectAudioTrack?: ResolvedProjectAudioTrack`.

---

## Breaking Change: `exportId` type change

The existing `getExportStatus` input uses `exportId: z.string()`. After Section 02 changes the export contracts to use `exportId: number`, this procedure input must be updated simultaneously. The test file's mock `getPresentationExportStatus` setup in `beforeEach` must also be updated to return a numeric `exportId`.

**Files that must change together (coordinate with Section 02 implementer):**
- `apps/web/shared/presentation/contracts.ts` — `presentationExportStatusResultSchema.exportId`
- `apps/web/server/routers/presentation.ts` — `getExportStatus` input `z.string()` → `z.number().int().positive()`
- `apps/web/server/services/presentationPlaybackExport.ts` — return type of `getPresentationExportStatus`
- `apps/web/server/routers/presentation.test.ts` — mock return value `exportId: "exp-1"` → `exportId: 1`

---

## File Summary

| File | Action | Notes |
|------|--------|-------|
| `apps/web/server/routers/presentation.ts` | Modify | Extend `triggerExport` input; change `getExportStatus` input type; add `setSlideAudio`, `setDeckAudio`, `getPlayDeck` procedures |
| `apps/web/server/services/presentationService.ts` | Modify | Add `updateSlideAudioTrack` and `updateDeckProjectAudioTrack` functions |
| `apps/web/server/routers/presentation.test.ts` | Modify | Extend mock setup; add test cases for all new/changed procedures |
| `apps/web/shared/presentation/contracts.ts` | Modify (minor) | Added TODO comment on `presentationPlayDeckPayloadSchema` alias |
| `apps/web/server/services/presentationPlaybackExport.ts` | Modify | Added `buildPlayDeckPayload` (described in section 03); batched N+1 queries; added DB-unavailable warning |

---

## Implementation Notes (Actual Build — 2026-02-23)

### Deviations from Plan

1. **`updateSlideAudioTrack` uses a transaction** (not in spec): The spec said to follow the `updateSlideInDeck` pattern. On review, that pattern has a race condition (two non-transactional DB calls). The implementation wraps both UPDATE statements in `db.transaction(async (tx) => { ... })` and adds a CAS guard (`eq(presentationSlides.version, currentSlide.version)`) to the slide WHERE clause.

2. **`buildPlayDeckPayload` uses batched DB query** (improved over spec): The spec implied per-slide DB queries in `Promise.all`. The implementation collects all distinct `libraryItemId` values, does one `inArray(...)` batch query, then enriches slides synchronously. Reduces N+1 to 1 DB query.

3. **`quality` field has `.default("standard")`** (spec-aligned): The spec listed this but the implementation initially missed it. Applied during code review.

4. **Mock name differs from spec draft**: Spec draft used `getPresentationDeckByLibraryItemWithAudio` but the actual service function is `getPresentationDeckByLibraryItem`. The mock uses the correct name.

5. **`as any` casts in service layer**: `AudioTrackInput.endAtMs` is `number | undefined` while `SlideAudioTrackJson.endAtMs` is `number | null`. Structurally equivalent at runtime; comments added to explain.

6. **Additional tests added during code review**: M-3 (`setDeckAudio tenant context`), M-4 (`setDeckAudio VERSION_CONFLICT`), M-5 (`getPlayDeck projectAudioTrack`), M-6 (`triggerExport idempotencyKey Zod parse`), L-3 (strengthened `buildPlayDeckPayload` assertion).

### Final Test Count

- `presentation.test.ts`: 46 tests (33 planned + 13 from code review fixes)
- `presentationPlaybackExport.test.ts`: 21 tests (unchanged)
- `presentationExportService.test.ts`: 9 tests (unchanged)
- `presentationWorkflowRegression.test.ts`: 11 tests (unchanged)
- **Total: 78/78 passing**