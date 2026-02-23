<!-- IMPLEMENTATION NOTES (added after implementation)
Status: COMPLETE — committed in section-02 commit
Tests: 19 passing (contracts.test.ts) + 11 passing (presentationPlaybackExport.test.ts)

Deviations from plan:
- All 4 audio schemas use .strict() (both input schemas AND resolved schemas) — user-approved
- fps field capped at .max(120) — code review finding
- downloadUrl requires https:// scheme — security hardening from code review
- resolvedAudioTrackSchema test split into two tests (missing url + strict rejection)
- PresentationEditor.test.tsx stale string exportIds updated to numbers (1, 2)
- TODO(section-03) comment added to counter-based exportId stub
- ExportDialog.tsx breaking change deferred to section-08 (file doesn't exist yet)
- TriggerPresentationExportInput.format stays "png" | "mp4" — deferred to section-04

Files actually modified:
- apps/web/shared/presentation/contracts.ts (73 lines added)
- apps/web/shared/presentation/contracts.test.ts (133 lines added, 19 total tests)
- apps/web/server/services/presentationPlaybackExport.ts (exportId: string→number, counter stub, registry types)
- apps/web/server/routers/presentation.ts (getExportStatus input: z.string()→z.number())
- apps/web/client/src/pages/PresentationEditor.tsx (lastExportId state: string|null→number|null)
- apps/web/client/src/pages/PresentationEditor.test.tsx (exportId fixtures: "exp-1"→1, "exp-warning-1"→2)
END IMPLEMENTATION NOTES -->


# Section 02: Shared Contracts Extension

## Overview

This section extends `apps/web/shared/presentation/contracts.ts` — the single source of truth for types shared between the Node.js tRPC layer and the React frontend. It adds audio track schemas, extends the render spec and slideshow payload with audio fields, adds new export formats, and migrates `exportId` from `string` to `number`.

**Dependency:** Requires section-01-database-migration to be complete (the new DB columns correspond to these types).

**Blocks:** sections 03, 04, 05, 08, 09, and 11 all import from this file.

---

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts` — primary change target
- `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.test.ts` — extend with new tests

---

## Tests First

Write these tests in `apps/web/shared/presentation/contracts.test.ts` before changing `contracts.ts`. They will fail until the implementation is done, which is the expected TDD red-green cycle.

Add a new `describe` block alongside the existing `"presentation canvas v2 contracts"` block:

```typescript
describe("audio track schemas", () => {
  it("audioTrackInputSchema parses valid input with libraryItemId", () => { ... });
  it("audioTrackInputSchema rejects volume > 1.0", () => { ... });
  it("audioTrackInputSchema rejects negative libraryItemId", () => { ... });
  it("audioTrackInputSchema accepts null endAtMs (play to end)", () => { ... });
  it("projectAudioTrackInputSchema parses with loop and null fadeOutMs", () => { ... });
  it("resolvedAudioTrackSchema has url field not libraryItemId", () => { ... });
  it("resolvedAudioTrackSchema rejects input with libraryItemId present", () => { ... });
  it("presentationExportStatusResultSchema parses exportId as number", () => { ... });
  it("presentationExportStatusResultSchema rejects exportId as string", () => { ... });
  it("presentationRenderSpecSchema accepts format jpg", () => { ... });
  it("presentationRenderSpecSchema accepts format pdf", () => { ... });
  it("presentationRenderSpecSchema rejects unknown format", () => { ... });
});
```

Concrete test stubs (import names must match the new exports you will add):

```typescript
import {
  audioTrackInputSchema,
  projectAudioTrackInputSchema,
  resolvedAudioTrackSchema,
  resolvedProjectAudioTrackSchema,
  presentationExportStatusResultSchema,
  presentationRenderSpecSchema,
  presentationSlideshowSlideSchema,
  presentationSlideshowPayloadSchema,
} from "./contracts";
```

Validate that:

- `audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.8, startAtMs: 0 }).success === true`
- `audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 1.5, startAtMs: 0 }).success === false`
- `audioTrackInputSchema.safeParse({ libraryItemId: -1, volume: 0.5, startAtMs: 0 }).success === false`
- `audioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, startAtMs: 0, endAtMs: null }).success === true`
- `projectAudioTrackInputSchema.safeParse({ libraryItemId: 1, volume: 0.5, loop: true, fadeOutMs: null }).success === true`
- `resolvedAudioTrackSchema.safeParse({ url: "https://example.com/audio.mp3", volume: 0.8, startAtMs: 0 }).success === true`
- `resolvedAudioTrackSchema.safeParse({ libraryItemId: 1, volume: 0.8, startAtMs: 0 }).success === false` (no `url`)
- `presentationExportStatusResultSchema.safeParse({ ..., exportId: 42, ... }).success === true`
- `presentationExportStatusResultSchema.safeParse({ ..., exportId: "abc", ... }).success === false`
- `presentationRenderSpecSchema.safeParse({ ..., format: "jpg", ... }).success === true`
- `presentationRenderSpecSchema.safeParse({ ..., format: "pdf", ... }).success === true`
- `presentationRenderSpecSchema.safeParse({ ..., format: "docx", ... }).success === false`

Run the tests first to confirm they fail, then implement.

---

## Implementation

### 2.1 Audio Track Schemas

Add four Zod schemas to `contracts.ts`. Place them after the existing `presentationLineElementSchema` block and before `presentationSlideElementSchema`, or in a clearly labelled `// === Audio Track Schemas ===` section near the top of the export group.

**`audioTrackInputSchema`** — validates tRPC input when a user attaches audio to a slide. Has `libraryItemId` (not a URL — URL resolution happens server-side):

```typescript
export const audioTrackInputSchema = z.object({
  /** Reference to a media library item of audio type */
  libraryItemId: z.number().int().positive(),
  /** Playback volume, 0.0 (silent) to 1.0 (full) */
  volume: z.number().finite().min(0).max(1),
  /** Start offset within the audio file, in milliseconds */
  startAtMs: z.number().int().min(0),
  /** End offset in milliseconds, or null to play to end of file */
  endAtMs: z.number().int().min(0).nullable().optional(),
});
```

**`resolvedAudioTrackSchema`** — the shape sent to Python in the render spec. `libraryItemId` is replaced by `url` (a presigned S3/R2 URL resolved by Node.js before calling Python):

```typescript
export const resolvedAudioTrackSchema = z.object({
  /** Presigned URL for the audio file, valid for at least 1 hour */
  url: z.string().url(),
  volume: z.number().finite().min(0).max(1),
  startAtMs: z.number().int().min(0),
  endAtMs: z.number().int().min(0).nullable().optional(),
});
```

**`projectAudioTrackInputSchema`** — deck-level audio (background music) with loop and fade-out fields:

```typescript
export const projectAudioTrackInputSchema = z.object({
  libraryItemId: z.number().int().positive(),
  volume: z.number().finite().min(0).max(1),
  loop: z.boolean(),
  /** Duration of fade-out at end of presentation, in milliseconds. null = no fade */
  fadeOutMs: z.number().int().min(0).nullable().optional(),
});
```

**`resolvedProjectAudioTrackSchema`** — resolved version of deck-level audio for Python:

```typescript
export const resolvedProjectAudioTrackSchema = z.object({
  url: z.string().url(),
  volume: z.number().finite().min(0).max(1),
  loop: z.boolean(),
  fadeOutMs: z.number().int().min(0).nullable().optional(),
});
```

### 2.2 Extend `presentationSlideshowSlideSchema`

The existing schema covers `slideId`, `orderIndex`, `title`, `durationMs`, and `transition`. Add optional audio fields for the play mode payload:

```typescript
export const presentationSlideshowSlideSchema = z.object({
  slideId: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
  durationMs: z.number().int().min(250).max(120_000),
  transition: presentationTransitionSchema,
  /** Resolved audio track for this slide. Only present in getPlayDeck response, not in export flows. */
  audioTrack: resolvedAudioTrackSchema.nullable().optional(),
});
```

Note: `audioTrack` is optional so that existing code constructing `presentationSlideshowSlideSchema` objects (editor, slideshow polling) does not need to be updated — absent `audioTrack` is valid.

### 2.3 Extend `presentationSlideshowPayloadSchema`

Add the deck-level resolved audio to the slideshow payload:

```typescript
export const presentationSlideshowPayloadSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_SLIDESHOW_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  generatedAt: z.coerce.date(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
  /** Resolved deck-level audio. Only present in getPlayDeck response. */
  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
});
```

### 2.4 Extend `presentationRenderSpecSchema`

Three changes:

1. Extend `format` to include `"jpg"` and `"pdf"`.
2. Add optional `quality` enum.
3. Add optional audio fields to the slide entries and to the spec root.

The slide entries in the render spec reuse `presentationSlideshowSlideSchema` (which now optionally carries `audioTrack`), so no separate schema is needed for the render spec slides.

```typescript
export const presentationRenderSpecSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_RENDER_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  /** Export format — png and jpg produce zip archives of per-slide images */
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  /** Quality preset — only meaningful for mp4 and jpg formats */
  quality: z.enum(["draft", "standard", "high"]).optional(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
  /** Resolved deck-level audio for mixing into the exported video */
  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
  warnings: presentationExportWarningsSchema.default([]),
});
```

### 2.5 Update `presentationExportResultSchema` and `presentationExportStatusResultSchema`

**Breaking change:** `exportId` and `jobId` change from `z.string()` to `z.number().int().positive()`. The `exportId` is now the integer primary key of the `presentation_exports` DB row. The separate `jobId` (which was a duplicate string concept) is removed — the `celeryTaskId` is an internal concern and should not be surfaced in the status result.

Updated `presentationExportResultSchema`:

```typescript
export const presentationExportResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  /** DB primary key of the presentation_exports row */
  exportId: z.number().int().positive(),
  deckId: z.number().int().positive(),
  /** Requested format */
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  deduped: z.boolean(),
  status: presentationExportStatusSchema,
  message: z.string().min(1).max(400).optional(),
  renderSpec: presentationRenderSpecSchema,
  warnings: presentationExportWarningsSchema.default([]),
});
```

Updated `presentationExportStatusResultSchema`:

```typescript
export const presentationExportStatusResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  exportId: z.number().int().positive(),
  status: presentationExportStatusSchema,
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  /** Progress percentage 0–100 */
  progressPct: z.number().int().min(0).max(100).default(0),
  /** Human-readable current stage, e.g. "Rendering slide 3 of 10" */
  stage: z.string().max(120).nullable().optional(),
  /** Presigned download URL. Only present when status is "done". */
  downloadUrl: z.string().url().nullable().optional(),
  /** Error description. Only present when status is "error". */
  errorMessage: z.string().max(1000).nullable().optional(),
  updatedAt: z.coerce.date(),
  warnings: presentationExportWarningsSchema.default([]),
});
```

Also extend `presentationExportStatusSchema` to include `"cancelled"` (reserved for future use, no code path sets it in this feature):

```typescript
export const presentationExportStatusSchema = z.enum([
  "queued",
  "processing",
  "done",
  "error",
  "cancelled",
]);
```

### 2.6 New Type: `PresentationPlayDeckPayload`

The play mode page uses the slideshow payload extended with audio. Alias the existing schema:

```typescript
export const presentationPlayDeckPayloadSchema = presentationSlideshowPayloadSchema;
export type PresentationPlayDeckPayload = z.infer<typeof presentationPlayDeckPayloadSchema>;
```

This is intentionally an alias — the play deck payload is structurally identical to the slideshow payload with resolved audio fields, just used in a different context.

### 2.7 Export New TypeScript Types

Add to the bottom of the `export type` block:

```typescript
export type AudioTrackInput = z.infer<typeof audioTrackInputSchema>;
export type ResolvedAudioTrack = z.infer<typeof resolvedAudioTrackSchema>;
export type ProjectAudioTrackInput = z.infer<typeof projectAudioTrackInputSchema>;
export type ResolvedProjectAudioTrack = z.infer<typeof resolvedProjectAudioTrackSchema>;
export type PresentationPlayDeckPayload = z.infer<typeof presentationPlayDeckPayloadSchema>;
// Update existing types (they are derived from the updated schemas — no action needed beyond keeping the infer lines)
export type PresentationRenderSpec = z.infer<typeof presentationRenderSpecSchema>;
export type PresentationExportResult = z.infer<typeof presentationExportResultSchema>;
export type PresentationExportStatusResult = z.infer<typeof presentationExportStatusResultSchema>;
```

The last three lines already exist. Keep them — the inferred types will automatically reflect the schema changes.

---

## Breaking Change Checklist

Because `exportId` changes from `string` to `number` and `jobId` is removed, you MUST update ALL of these locations simultaneously (they will produce TypeScript compiler errors if left stale):

| File | What to change |
|------|----------------|
| `apps/web/server/routers/presentation.ts` | `getExportStatus` input schema: change `exportId: z.string()` to `z.number().int().positive()` |
| `apps/web/server/services/presentationPlaybackExport.ts` | `triggerPresentationExport` return type: `exportId` becomes `number`; remove `jobId` from the return object |
| `apps/web/client/src/components/presentation/ExportDialog.tsx` | `exportId` state variable: change `useState<string \| null>` to `useState<number \| null>` |
| All test files that construct `presentationExportResultSchema` or `presentationExportStatusResultSchema` fixtures | Update numeric `exportId` |

Run `cd apps/web && pnpm check` after all changes are made to confirm zero TypeScript errors.

---

## Ordering Note

This section must be implemented before sections 03, 04, 05, 08, 09, and 11. All those sections import schemas and types from `contracts.ts`. Write the tests, implement the schema changes, verify `pnpm check` passes, then proceed to the next section.