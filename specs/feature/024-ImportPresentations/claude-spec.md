# Synthesized Specification — Feature 024: Import Presentations

*Combines initial spec + codebase research + web research + stakeholder interview*

---

## 1. Problem Statement

Users with existing presentations in Google Slides or PowerPoint (.pptx) must currently recreate them manually in SmartSpecPro's Presentation Editor. This is a significant adoption barrier. Feature 024 adds one-way import: convert external presentations into SmartSpecPro's internal `PresentationSlideContent` schema, creating an editable deck in the user's library.

---

## 2. Scope (MVP)

### In Scope
- Upload a `.pptx` file (up to 50MB) and convert it to an editable deck
- Import a Google Slides presentation via URL using the user's existing Google OAuth session
- Map: text boxes, images, rectangles, lines, grouped shapes
- Log unsupported elements (table, chart, SmartArt, gradient fill, animation) as `fidelityWarnings`
- Display a fidelity summary after import
- Persist the source attachment in `presentationSourceAttachments` for audit
- After import, navigate directly to the PresentationEditor for the new deck

### Out of Scope (Deferred)
- Round-trip export back to PPTX or Google Slides
- Rich text with mixed inline styles within a single text box (Phase 6)
- Slide thumbnail preview before confirming import (Phase 5)
- `.ppt` legacy binary format (user must convert to `.pptx`)
- LibreOffice headless dependency
- Presenter notes (stored in `presentationSlides.notes` but not displayed)

---

## 3. Refined Architecture

### 3.1 PPTX Upload Flow

1. Frontend uses the **existing library file upload flow** to upload the PPTX file. This creates a `libraryItem` record and stores the file in S3/R2. The frontend receives a `libraryItemId`.
2. Frontend calls `presentationImport.startImport` tRPC with `{ sourceType: "pptx", sourceLibraryItemId }`.
3. Node.js creates a `presentationConversionRecords` row (status: `queued`) and calls the Python FastAPI endpoint to enqueue the Celery task.
4. The Celery task downloads the PPTX from S3 using the library item's URL, parses it, and POSTs the result back to Node.js via an internal Express callback route.
5. Node.js callback handler creates the deck (libraryItem + presentationDeck + slides) and updates `presentationSourceAttachments`.

### 3.2 Google Slides Flow

1. Frontend shows a URL text input. User pastes the Google Slides URL.
2. Frontend checks if the user has Google OAuth connected; if not, shows "Connect Google Drive" prompt.
3. Frontend calls `presentationImport.startImport` with `{ sourceType: "google_slides", slidesUrl }`.
4. Node.js reads the user's decrypted Google access token from the database and forwards it to Python in the API call body.
5. The Celery task calls `presentations.get(presentationId)` on the Google Slides API using the access token, parses the result, downloads images (with Bearer auth), uploads to S3, and POSTs results back to Node.js.
6. Same callback handler creates the deck.

### 3.3 Google Slides URL → Presentation ID

Extract from URL format: `https://docs.google.com/presentation/d/{presentationId}/edit` or `/view`.
Validate that the URL is a Google Slides URL before submitting.

### 3.4 Python → Node.js Callback

Python POSTs to `http://localhost:3000/api/internal/presentation-import/callback` with:
- `conversionId` — the `presentationConversionRecords.id`
- `slides` — array of `PresentationSlideContent` objects (JSON)
- `fidelityWarnings` — array of strings
- `status` — `"done"` | `"failed"`
- `error` — error message string (if failed)

Authenticated via `Authorization: Bearer {INTERNAL_SERVICE_SECRET}`.

### 3.5 Deck Creation in Node.js Callback Handler

When Python callback arrives with `status: "done"`:
1. Create a new `libraryItem` with `itemType: "presentation"`, `title: <import title>`
2. Call `createPresentationDeckForLibraryItem(libraryItemId, title)` → returns `{ deckId }`
3. For each slide: call `addSlideToDeck(deckId, expectedVersion, slideContent)` — track `expectedVersion` after each insert
4. Insert `presentationSourceAttachments` row linking deck to original source
5. Update `presentationConversionRecords` with `status: "done"`, `deckId`, `deckLibraryItemId`, `fidelityWarnings`

When status is `"failed"`:
1. Update `presentationConversionRecords` with `status: "failed"`, error details

---

## 4. Database Changes

### Migration Required
Add to `presentationConversionRecords`:
- `status VARCHAR(16)` — values: `queued`, `processing`, `done`, `failed` (default: `queued`)
- `progress INT` — values: 0–100 (default: 0)

No migration needed for `presentationSourceAttachments` (existing `conversionStatus` field suffices there).

The `sourceFormat` field is `VARCHAR(16)` (not a pg enum), so adding `"google_slides"` requires only a contracts.ts constants update, no DB migration.

### Contracts Update
Add `"google_slides"` to the `sourceFormat` enum in `apps/web/shared/presentation/contracts.ts`.

---

## 5. Python New Dependency

Add to `python-backend/requirements.txt`:
```
python-pptx>=1.0.2
```

---

## 6. Element Parsing Rules

### PPTX (python-pptx)

**Text boxes (shape_type = TEXT_BOX = 17):**
Collapse all text runs in all paragraphs to the first run's style. Join paragraphs with `\n`. Cap at 10,000 chars. Extract: `x`, `y`, `width`, `height` (all EMU→px), `text`, `color` (from `run.font.color.rgb`), `fontSize` (pt → px via `round(pt * 4/3)`), `fontWeight` (`"700"` if bold else `"normal"`), `fontStyle` (`"italic"` if italic else `"normal"`), `textAlign`.

**Images (shape_type = PICTURE = 13):**
`shape.image.blob` → upload to S3 via `R2StorageService.upload_bytes()`. Store URL in element `src`. LINKED_PICTURE (14) has no blob; emit fidelityWarning and skip.

**Auto-shapes (shape_type = AUTO_SHAPE = 1):**
Check `shape.auto_shape_type`. RECTANGLE → `rect` with `fill` and `stroke`. ROUNDED_RECTANGLE, OVAL → `rect` with warning. All others → skip with fidelityWarning. If shape has `text_frame`, also extract text overlay.

**Lines (shape_type = LINE = 9):**
Extract `line.color.rgb` → `stroke`. Extract `line.width` (EMU → px) → `strokeWidth`.

**Groups (shape_type = GROUP = 6):**
Recurse into children. Children's `.left`/`.top` are relative to group origin — add group offset (`shape.left or 0`, `shape.top or 0`) to each child's position.

**Tables (16), Charts (3), SmartArt:** Skip, emit fidelityWarning.

### Google Slides API

**All units in API response are EMU** (except font size which uses "PT"). Always check `Dimension.unit`.

**Shapes (shape.shapeType = TEXT_BOX):** Map to `text`. Extract text by iterating `textElements`, collecting `textRun.content` until `paragraphMarker`, joining with `\n`. Use first run's style for the element style. Font size comes from `textRun.style.fontSize.magnitude` (PT) → px via `round(pt * 4/3)`.

**Shapes (RECTANGLE):** Map to `rect`. solidFill color: `rgbColor` floats × 255 → hex. If `themeColor` key present instead of `rgbColor`, fall back to `"#cccccc"` + fidelityWarning.

**Non-rectangular shapes (ELLIPSE, TRIANGLE, ROUND_RECTANGLE, etc.):** Map to `rect` (bounding box) with fidelityWarning.

**Images:** Download `image.contentUrl` immediately after `presentations.get` (URL is short-lived). Use `httpx.AsyncClient` with `Authorization: Bearer {access_token}`. Upload to S3. Store URL in element `src`.

**Lines:** `line.lineProperties.lineFill.solidFill` → `stroke`. `line.lineProperties.weight.magnitude` (EMU → px) → `strokeWidth`.

**Tables, sheetsChart:** Skip + fidelityWarning.

**Groups:** Recurse, apply group transform (AffineTransform translateX/Y) to each child.

---

## 7. Coordinate Conversion

### PPTX
```
px = emu * 96 / 914400
canvas_px = round(px * canvas_target_px / slide_natural_px)
```
Detect canvas size from slide dimensions using ratio → preset map (16:9→1280×720, 4:3→1024×768, etc.).

### Google Slides
All dimensions in the API response are EMU. Convert same as PPTX:
```
px = emu / (914400 / 96)
```
Font sizes use PT units: `px = round(pt * 4/3)`.

---

## 8. File Size & Security

- **Client-side:** Check `file.size <= 50 * 1024 * 1024` before XHR starts. Show error immediately.
- **Server-side:** FastAPI endpoint validates Content-Length / reads body size; rejects >50MB with 413.
- **MIME check:** Accept only `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- **SSRF (GSlides images):** Only download HTTPS URLs. Validate `contentUrl` starts with `https://`.
- **Macro safety:** python-pptx does not execute macros.
- **Memory:** Process one slide at a time; release image blob references after upload.

---

## 9. Frontend Behavior

### ImportPresentationDialog — Steps

1. **Source selection:** Tab bar — "Upload PPTX" | "Google Slides"
2. **PPTX tab:** File input (accept=".pptx"), 50MB limit badge, "Import" button (disabled until file selected)
3. **Google Slides tab:** URL text input, Google OAuth connected indicator. If not connected → "Connect Google Drive" button linking to OAuth flow.
4. **Uploading step (PPTX only):** XHR upload progress bar (0–100%). Cancel button aborts upload.
5. **Processing step:** Spinner + progress % from polling `getImportStatus`. Cancel button updates DB status to "cancelled" (best-effort).
6. **Result step:** "Import complete! N slides imported." Fidelity warning list (strings). "Open Deck" button → navigate to PresentationEditor.
7. **Error step:** Error message. "Try Again" button.

### PresentationEditor — Import Button

Add an "Import" button in the header toolbar (secondary variant, next to Export button). Opens `ImportPresentationDialog`.

---

## 10. Polling Contract

`presentationImport.getImportStatus` returns:
```typescript
{
  status: "queued" | "processing" | "done" | "failed";
  progress: number;          // 0–100
  fidelityWarnings?: string[];
  deckLibraryItemId?: number;
  error?: string;
}
```
Frontend polls every 2 seconds. Stops when status is `"done"` or `"failed"`.

---

## 11. Acceptance Criteria

- Upload a 16:9 PPTX with text and images; resulting deck has correct slide count, elements positioned within ±5px, all images accessible via HTTPS S3 URLs.
- Import a Google Slides presentation via URL; text and images correctly extracted.
- Unsupported elements produce fidelityWarnings logged to `presentationConversionRecords`.
- 10-slide PPTX with 5 images per slide completes in under 60 seconds.
- PPTX >50MB rejected before upload (client-side) and at server (FastAPI 413).
- Imported deck respects 200-slide and 100MB limits.
- After import, "Open Deck" navigates to PresentationEditor for the new deck.
- `pytest` coverage ≥ 80% for `pptx_importer.py` and `gslides_importer.py`.
- TypeScript check passes (`pnpm check`).
