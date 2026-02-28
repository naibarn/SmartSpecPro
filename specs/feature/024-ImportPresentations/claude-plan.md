# Implementation Plan — Feature 024: Import Presentations

*SmartSpecPro — Presentation import from Google Slides and PPTX*
*Revised after Opus review — see claude-integration-notes.md for change rationale*

---

## Overview

This plan describes how to implement one-way import of presentations from Google Slides and PowerPoint (.pptx) files into SmartSpecPro's Presentation Editor. The feature allows users to upload a .pptx file or paste a Google Slides URL and have it converted into an editable deck in their library.

The work spans five layers: a DB schema migration, a Python parsing layer (two importers + Celery task + FastAPI endpoint), a Node.js tRPC router and service layer with callback handler, and a React dialog component with toolbar integration.

---

## Section 01: DB Migration + Contracts Update

### What to Build

Add columns to the `presentationConversionRecords` table, make existing FK columns nullable, add a `slidesUrl` column, fix the broken unique index, and update the sourceFormat constant.

### Schema Changes Required

**New columns on `presentationConversionRecords`:**
- `status VARCHAR(16)` — default `"queued"`. Values: `queued`, `processing`, `done`, `failed`, `cancelled`.
- `progress INT` — default `0`. Values: 0–100.
- `userId INT` — NOT NULL, FK to `users.id`. Required so the callback handler can construct a `PresentationActor`.
- `slidesUrl VARCHAR(2048)` — nullable. Stores the Google Slides URL when `sourceType` is `"google_slides"`.

**Make existing FK columns nullable:**
The following columns are currently `notNull()` but must become nullable because they cannot be populated at queue time:
- `sourceItemId` — null for Google Slides imports (no source library item)
- `deckLibraryItemId` — null until deck creation completes (happens in the callback)
- `deckId` — null until deck creation completes

**Fix the unique index:**
The existing unique index on `(tenantId, sourceItemId)` will break when `sourceItemId` is NULL (PostgreSQL allows multiple NULL values in a unique index, but this changes uniqueness semantics). Drop this index and replace it with a partial unique index on `(tenantId, sourceItemId)` WHERE `sourceItemId IS NOT NULL`. This allows multiple in-flight Google Slides imports but prevents duplicate PPTX imports.

### Contracts Update

**`apps/web/shared/presentation/contracts.ts`** — Add `"google_slides"` to the `sourceFormat` union type/enum constant. Since `sourceFormat` is a `VARCHAR(16)` column (not a Postgres enum), this is a TypeScript-only change with no SQL required.

### Migration Procedure

Follow the Database Safety Protocol:
1. Back up the `presentationConversionRecords` table.
2. Edit `apps/web/drizzle/schema.ts`: apply all column changes described above.
3. Run `cd apps/web && pnpm db:push` to generate and apply the Drizzle migration.
4. Verify row counts unchanged. Verify all new/changed columns exist with correct defaults.
5. Run `pnpm check` to ensure no TypeScript regressions.

### Files to Modify

- `apps/web/drizzle/schema.ts`
- `apps/web/shared/presentation/contracts.ts`

---

## Section 02: Python — PPTX Importer

### What to Build

`python-backend/app/services/pptx_importer.py` — A class that accepts raw PPTX bytes and returns an `ImportResult` dataclass.

Also: add `python-pptx>=1.0.2` to `python-backend/requirements.txt`.

Also: add an `upload_bytes(key: str, data: bytes, content_type: str) -> str` convenience method to `python-backend/app/services/r2_storage_service.py`. This method wraps the existing `upload_file` interface but accepts a caller-specified S3 key directly, returning the public URL. The importers need explicit key control for the `{tenant_id}/presentations/imports/{conversion_id}/images/{uuid}.{ext}` path convention.

### Shared Data Types

Define in `python-backend/app/services/presentation_importer.py` (the unified interface module, imported by both importers):

```python
@dataclass
class ImportResult:
    slides: list[dict]          # list of PresentationSlideContent dicts
    fidelity_warnings: list[str]  # capped at 25 items
```

Both `PptxImporter` and `GSlidesImporter` return `ImportResult`.

### PptxImporter Class Design

Constructor signature: `PptxImporter(r2_service: R2StorageService)`. The r2_service should be the module-level singleton (not a new instance).

Single public async method: `async def import_file(self, pptx_bytes: bytes, s3_prefix: str) -> ImportResult`.

The `import_file` method:
1. Wraps `pptx_bytes` in `io.BytesIO` and loads a `Presentation` object. Catches `PackageNotFoundError` and `BadZipFile` (from `zipfile`) — raises a domain-level `ImportError("The uploaded file is not a valid .pptx file")`.
2. Detects canvas size by reading `prs.slide_width` and `prs.slide_height` (EMU values), computing `round(width / height, 3)` aspect ratio, and looking it up in the preset map. Unknown ratios → `PresentationCanvasSize(preset=None, width=round(_emu_to_px(w)), height=round(_emu_to_px(h)))`.
3. Iterates over slides, calling `await _parse_slide(slide, canvas, s3_prefix, slide_index)`.
4. Caps the warnings list at 25 items: if `len(all_warnings) > 25`, keep first 24 and append `f"... and {len(all_warnings) - 24} more warnings"`.
5. Returns `ImportResult(slides=slides, fidelity_warnings=capped_warnings)`.

### Preset Map

```python
PRESET_MAP = {
    1.778: ("16:9",  1280, 720),
    0.563: ("9:16",  720, 1280),
    1.333: ("4:3",   1024, 768),
    0.75:  ("3:4",   768, 1024),
    0.8:   ("4:5",   960, 1200),
    1.25:  ("5:4",   1250, 1000),
    1.0:   ("1:1",   1080, 1080),
}
```

### Coordinate Conversion (Pure Functions, Easily Unit-Tested)

`_emu_to_px(emu, dpi=96)` — `return emu * dpi / 914_400`

`_scale_to_canvas(emu, slide_emu, canvas_px)` — `return round(_emu_to_px(emu) * canvas_px / _emu_to_px(slide_emu))`

`_pt_to_canvas_px(pt)` — `return max(8, min(512, round(pt * 4/3)))`

### Shape Parsing Rules

`_parse_slide(slide, canvas, s3_prefix, slide_num)` iterates `slide.shapes` and dispatches by `shape.shape_type`:

**TEXT_BOX (17):** Scale position/size via `_scale_to_canvas`. Collect all paragraphs from `shape.text_frame.paragraphs`, joining with `\n`. Cap total text at 10,000 chars. Extract style from the first non-empty run's font: `color.rgb` → hex string (if `color.type == PP_COLOR_TYPE.RGB`, else omit), `size` (EMU → pt → `_pt_to_canvas_px`), `bold`, `italic`. Produce a `text` element dict.

**PICTURE (13):** Read `shape.image.blob` and `shape.image.content_type` (default `"image/png"`). Derive file extension from content type. Await `r2_service.upload_bytes(f"{s3_prefix}/images/{uuid4()}.{ext}", blob, content_type)`. Produce an `image` element with `src = returned_url`.

**LINKED_PICTURE (14):** Cannot access blob. Append `f"Slide {slide_num}: Linked image skipped (external link, blob not embedded)"`. Skip.

**AUTO_SHAPE (1):** Check `shape.auto_shape_type`. RECTANGLE (1) or ROUNDED_RECTANGLE (2) → `rect` element. OVAL (3) → `rect` + fidelityWarning `f"Slide {slide_num}: Oval approximated as rectangle"`. All others → `f"Slide {slide_num}: Shape type '{shape.auto_shape_type}' not supported"` + skip. Extract `fill` from `shape.fill.fore_color.rgb` (if type RGB, else `"#cccccc"`). Extract `stroke`/`strokeWidth` from `shape.line`. If `shape.has_text_frame`, also produce a `text` element at same position.

**LINE (9):** Extract `shape.line.color.rgb` → `stroke`. Extract `shape.line.width` (EMU → px) → `strokeWidth`. Produce `line` element.

**GROUP (6):** The group's own position (`shape.left or 0`, `shape.top or 0`) is the offset for all children. Recurse `_parse_shapes(shape.shapes, group_left + parent_offset_left, group_top + parent_offset_top, canvas, s3_prefix, slide_num)`. Thread the accumulated offset through all levels of nesting.

**TABLE (16):** Append `f"Slide {slide_num}: Table dropped (not supported)"`. Skip.

**CHART (3):** Append `f"Slide {slide_num}: Chart dropped (not supported)"`. Skip.

**All other shape types:** Append `f"Slide {slide_num}: Unknown shape type {shape.shape_type} skipped"`. Skip.

### S3 Path Convention

`{tenant_id}/presentations/imports/{conversion_id}/images/{uuid}.{ext}`

The `s3_prefix` received by the importer is `f"{tenant_id}/presentations/imports/{conversion_id}"`, pre-computed by the Celery task.

---

## Section 03: Python — Google Slides Importer

### What to Build

`python-backend/app/services/gslides_importer.py` — A class that accepts a Google Slides presentation ID and an OAuth access token, calls the Google Slides REST API, and returns an `ImportResult`.

Imports `ImportResult` from `python-backend/app/services/presentation_importer.py`.

### GSlidesImporter Class Design

Constructor: `GSlidesImporter(access_token: str, r2_service: R2StorageService)`. Use the module-level singleton for `r2_service`.

Internally builds the Slides service: `googleapiclient.discovery.build("slides", "v1", credentials=google.oauth2.credentials.Credentials(token=access_token))`.

Single public async method: `async def import_presentation(self, presentation_id: str, s3_prefix: str) -> ImportResult`.

This method:
1. Calls `slides_service.presentations().get(presentationId=presentation_id).execute()` to fetch the full presentation JSON.
2. **Immediately downloads all images** before any other processing. Collect all `contentUrl` values from all slides, then download all concurrently via `asyncio.gather`. This is required because `contentUrl` values are short-lived (minutes to hours) and need the current access token. Storing download results in a dict keyed by element objectId.
3. Detects canvas size from `presentation["pageSize"]` (EMU values) using the same preset map as PPTX.
4. Computes `canvas_scale_x = canvas_px_width / _emu_to_px(page_width_emu)` and `canvas_scale_y` similarly.
5. Iterates `presentation["slides"]`, calling `_parse_page(page, canvas, downloaded_images, s3_prefix, page_index)` for each.
6. Caps warnings at 25 (same truncation rule as PPTX importer).
7. Returns `ImportResult`.

### Units — Critical Detail

All `Dimension` values in the API response use EMU (`unit: "EMU"`), **except** `textRun.style.fontSize` which uses points (`unit: "PT"`). The importer must use the `unit` field and apply the appropriate conversion:
- EMU → px: `emu / (914400 / 96)` (same as PPTX)
- PT → px (font size): `max(8, min(512, round(pt * 4/3)))`

### Position/Size Extraction

For every `pageElement`, extract position and size from `transform` (AffineTransform) and `size`:

```python
@dataclass
class ElementBounds:
    x: int        # canvas px
    y: int        # canvas px
    width: int    # canvas px
    height: int   # canvas px
    rotation: float | None  # degrees, None if < 0.01
```

`translateX` and `translateY` from the AffineTransform are in EMU. Multiply by `canvas_scale_x/y` to get canvas coordinates.

Rotation: `math.degrees(math.atan2(transform["shearY"], transform["scaleX"]))`.

Non-uniform transform detection: if `abs(transform.get("shearX", 0)) > 0.01` (skew present), append fidelityWarning `f"Slide {n}: Element has skew transform — rendered as bounding box"`. Still render using bounding box.

### pageElement Dispatch

`_parse_page(page, canvas, downloaded_images, s3_prefix, page_num)` iterates `page["pageElements"]` and dispatches on which sub-key is present:

**`"shape"` with shapeType TEXT_BOX:** Extract text from `shape.text.textElements`. Iterate elements: collect `textRun.content` until `paragraphMarker`, join paragraphs with `\n`. Use first textRun's style for element-level style. Color: `textRun.style.foregroundColor.opaqueColor.rgbColor` → `rgb_float_to_hex()`. If `rgbColor` absent (themeColor): use `"#000000"` + fidelityWarning. Font size: `fontSize.magnitude` (PT) → `_pt_to_canvas_px()`. Produce `text` element.

**`"shape"` with shapeType RECTANGLE:** Map to `rect`. Extract `solidFill.color.rgbColor` from `shape.shapeProperties.shapeBackgroundFill`. themeColor fallback → `"#cccccc"` + fidelityWarning.

**`"shape"` with other shapeTypes (ELLIPSE, TRIANGLE, ROUND_RECTANGLE, etc.):** Map to `rect` (bounding box). Append fidelityWarning `f"Slide {n}: {shapeType} approximated as rectangle"`.

**`"image"`:** The downloaded bytes (fetched concurrently in step 2) are keyed by element objectId. Upload to S3 via `r2_service.upload_bytes(f"{s3_prefix}/images/{uuid4()}.jpg", image_bytes, "image/jpeg")`. Produce `image` element with returned URL as `src`. If download failed earlier, emit fidelityWarning and skip.

**`"line"`:** Map to `line` element. Stroke color from `line.lineProperties.lineFill.solidFill.color.rgbColor`. Stroke width from `line.lineProperties.weight.magnitude` (EMU → px).

**`"table"`:** fidelityWarning + skip.

**`"sheetsChart"`:** fidelityWarning + skip.

**`"wordArt"`:** Extract `wordArt.renderedText`. Map to `text` element. fidelityWarning about decoration loss.

**`"video"`:** Extract source URL. Produce `video` element. Add fidelityWarning that video playback may not work.

**`"group"`:** Recurse into `group.children`. Apply group's `transform.translateX/Y` (converted to canvas px) as offset for each child's position.

### Color Conversion

`rgb_float_to_hex(color: dict) -> str`: multiply each float component by 255, round, format as hex. Guard against missing keys with `.get()` defaulting to `0.0`.

### Image Download

```python
async def _download_image(url: str, access_token: str) -> bytes | None:
    """Download a GSlides contentUrl. Returns None on failure."""
```

Validate `url.startswith("https://")` before downloading. Use `httpx.AsyncClient` with `Authorization: Bearer {access_token}` header, `follow_redirects=True`, `timeout=30.0`. Return `None` on `httpx.HTTPError`.

---

## Section 04: Python — Celery Task + FastAPI Endpoint

### What to Build

- `python-backend/app/tasks/presentation_import_tasks.py` — Celery task
- `python-backend/app/api/v1/presentation_import.py` — FastAPI router
- Modify `python-backend/app/main.py` to register the new router

### Celery Task

`import_presentation_task` follows the `_run_async()` pattern established in `media_tasks.py` (outer sync function delegating to inner async function). Decorator:

```python
@celery_app.task(
    name="tasks.import_presentation",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
    reject_on_worker_lost=True,
    time_limit=600,
    soft_time_limit=540,
)
def import_presentation_task(self, conversion_id: int, source_type: str, user_id: int, tenant_id: int, source_item_id: int | None = None, slides_url: str | None = None):
    return _run_async(_import_async(self, conversion_id, source_type, user_id, tenant_id, source_item_id, slides_url))
```

The async inner `_import_async` function:

1. Opens DB session, updates `presentationConversionRecords` status → `"processing"`, progress → `5`.
2. Retrieves `R2StorageService` singleton. Computes `s3_prefix = f"{tenant_id}/presentations/imports/{conversion_id}"`.
3. **PPTX path (source_type == "pptx"):**
   - Reads the library item's S3 URL from DB using `source_item_id`.
   - Downloads PPTX bytes via `httpx.AsyncClient.get(s3_url, timeout=120.0)`.
   - Instantiates `PptxImporter(r2_service)`, calls `await importer.import_file(pptx_bytes, s3_prefix)`.
4. **Google Slides path (source_type == "google_slides"):**
   - Calls `await GoogleTokenService.get_valid_access_token(user_id)` to get a fresh, valid access token (handles refresh automatically).
   - Extracts `presentation_id` from `slides_url` using anchored regex: `re.search(r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)", slides_url)`. If no match, raise `ValueError("Invalid Google Slides URL")`.
   - Instantiates `GSlidesImporter(access_token, r2_service)`, calls `await importer.import_presentation(presentation_id, s3_prefix)`.
5. After successful parsing: updates progress → `90`.
6. Serializes slides JSON. If `len(json.dumps(slides))` > 8MB, truncates to first N slides that fit and appends fidelityWarning `"Import truncated: presentation too large to import fully"`.
7. Calls `await _notify_nodejs(conversion_id, "done", slides, fidelity_warnings)`.
8. Updates `presentationConversionRecords`: status → `"done"`, progress → `100`.
9. **On any exception:** updates status → `"failed"`, stores error message (user-friendly for known error types like `ImportError`, `ValueError`). Calls `await _notify_nodejs(conversion_id, "failed", error=str(exc))`. Re-raises.

**Progress granularity during slide parsing:** Each importer receives a progress callback. Progress formula during parsing: `5 + int(slide_index / total_slides * 75)`. Update DB every 5 slides to avoid excessive writes.

### Node.js Callback

```python
NODE_INTERNAL_URL = os.environ.get("NODE_INTERNAL_URL", "http://localhost:3000")
WEB_GATEWAY_TOKEN = os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", "")

async def _notify_nodejs(conversion_id: int, status: str, slides=None, fidelity_warnings=None, error=None):
```

POSTs to `{NODE_INTERNAL_URL}/api/internal/presentation-import/callback` with `Authorization: Bearer {WEB_GATEWAY_TOKEN}`. Does not raise on HTTP error (notification failure should not fail the Celery task). Logs the error.

### FastAPI Endpoints

**POST `/api/v1/presentation-import/start`**

Pydantic request model with `@field_validator` for `source_type` (must be `"pptx"` or `"google_slides"`) and `@model_validator` cross-field check (PPTX requires `source_library_item_id`, GSlides requires `slides_url`). Note: does NOT accept `access_token` — Python retrieves the token itself.

Fields: `conversion_id: int`, `source_type: str`, `source_library_item_id: int | None`, `slides_url: str | None`, `user_id: int`, `tenant_id: int`.

Validates file size limit is not the responsibility of this endpoint (enforced at library upload time). Enqueues `import_presentation_task.apply_async(...)` and returns `{"task_id": result.id}`.

**GET `/api/v1/presentation-import/status/{conversion_id}`**

Requires auth. Reads `presentationConversionRecords` by `conversion_id` filtered by `tenant_id` from auth context. Returns `{"status", "progress", "fidelity_warnings", "deck_library_item_id", "error"}`.

---

## Section 05: Node.js — tRPC Router

### What to Build

`apps/web/server/routers/presentationImport.ts` — new tRPC router. Register in `apps/web/server/routers/index.ts`.

### Procedures

**`startImport` (mutation, protectedProcedure)**

Input schema (Zod):
```typescript
z.object({
  sourceType: z.enum(["pptx", "google_slides"]),
  sourceLibraryItemId: z.number().int().positive().optional(),
  slidesUrl: z.string().url().optional(),
  title: z.string().max(500).optional(),
}).refine(
  (d) => d.sourceType === "pptx" ? !!d.sourceLibraryItemId : !!d.slidesUrl,
  { message: "sourceLibraryItemId required for pptx; slidesUrl required for google_slides" }
)
```

Logic:
1. `ensureFeatureEnabled()`.
2. Extract actor via `toPresentationActor(ctx)`.
3. If `sourceType === "google_slides"`: verify the user has Google OAuth connected by checking whether the Python backend's `oauth_connections` table has a valid record for this user. This check can be a lightweight HTTP GET to a Python endpoint, or query an existing session flag. If not connected → throw tRPC `PRECONDITION_FAILED("Google Drive not connected")`.
4. Create `presentationConversionRecords` row via Drizzle: `{ tenantId, userId, sourceItemId: sourceLibraryItemId ?? null, slideUrl: slidesUrl ?? null, sourceFormat: sourceType, idempotencyKey: crypto.randomUUID(), status: "queued", progress: 0, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }`.
5. POST to Python `http://localhost:8000/api/v1/presentation-import/start` with `{ conversionId: record.id, sourceType, sourceLibraryItemId, slidesUrl, userId: actor.userId, tenantId: actor.tenantId }`.
6. Return `{ conversionId: record.id }`.

**`getImportStatus` (query, protectedProcedure)**

Input: `z.object({ conversionId: z.number().int().positive() })`

Reads `presentationConversionRecords` by `conversionId` AND `tenantId` (tenant isolation — never allow cross-tenant reads). Throws `NOT_FOUND` if record doesn't exist. Returns `{ status, progress, fidelityWarnings, deckLibraryItemId, error }`.

**`cancelImport` (mutation, protectedProcedure)**

Input: `z.object({ conversionId: z.number().int().positive() })`

Reads the conversion record (tenant-scoped). If status is already `"done"` or `"failed"`, returns early. Sets status to `"cancelled"` in DB. POSTs a best-effort cancel request to Python `DELETE /api/v1/presentation-import/{conversionId}` (Python calls Celery `revoke(terminate=True, signal="SIGTERM")`). Returns `{ cancelled: true }`.

---

## Section 06: Node.js — Service Layer + Callback Handler

### What to Build

- `apps/web/server/services/presentationImportService.ts` — deck creation logic
- Internal Express route in the appropriate internal routes file (wherever `SMARTSPEC_WEB_GATEWAY_TOKEN` is already used for internal auth)

### presentationImportService.ts

Exports: `createDeckFromImportResult(params): Promise<{ deckLibraryItemId: number }>`.

Parameters:
```typescript
{
  conversionId: number;
  tenantId: number;
  userId: number;
  slides: PresentationSlideContent[];
  title: string;
  fidelityWarnings: string[];
  sourceFormat: string;
  sourceLibraryItemId?: number;
}
```

Implementation:
1. Build `actor: PresentationActor` manually: `{ userId, tenantId, role: "user" }`.
2. Create `libraryItem` via direct Drizzle insert: `{ itemType: "presentation", title, tenantId, ownerUserId: userId, status: "active", createdAt: now, updatedAt: now }`. Returns `{ id: libraryItemId }`.
3. Call `createPresentationDeckForLibraryItem({ libraryItemId, title }, actor)` → returns `{ deckId }`.
4. Enforce limits: if `slides.length > 200`, truncate to first 200 and log a warning.
5. Track `expectedVersion = 0`. For each slide, call `addSlideToDeck({ deckId, expectedVersion, slideContent: slide }, actor)`. Increment `expectedVersion` after each successful call.
6. Insert `presentationSourceAttachments`: `{ deckId, sourceLibraryItemId: sourceLibraryItemId ?? null, sourceFormat, conversionStatus: "done", fidelityWarnings }`.
7. Update `presentationConversionRecords` via Drizzle: `{ deckId, deckLibraryItemId: libraryItemId, status: "done", fidelityWarnings, progress: 100 }`.
8. Return `{ deckLibraryItemId }`.

### Internal Express Callback Route

Route: `POST /api/internal/presentation-import/callback`

Authentication: validate `req.headers.authorization === "Bearer " + ENV.webGatewayToken`. Return 401 without body on mismatch.

Body validation (Zod):
```typescript
z.object({
  conversionId: z.number(),
  status: z.enum(["done", "failed"]),
  slides: z.array(z.record(z.unknown())).optional(),
  fidelityWarnings: z.array(z.string()).max(25).optional(),
  error: z.string().optional(),
})
```

**Idempotency check:** Before doing any work, read the conversion record. If `record.status === "done"`, respond 200 immediately (duplicate callback from Celery retry).

**On `status === "done"`:**
1. Read conversion record to get `tenantId`, `userId`, `sourceFormat`, `sourceLibraryItemId`.
2. Derive title from the conversion record or use a default `"Imported Presentation"`.
3. Call `createDeckFromImportResult(...)`.
4. Respond 200 `{ ok: true, deckLibraryItemId }`.

**On `status === "failed"`:**
1. Update `presentationConversionRecords`: `{ status: "failed", error }`.
2. Respond 200 `{ ok: true }`.

Always respond 200 (so Python doesn't retry on 500). Log errors internally.

---

## Section 07: Frontend — ImportPresentationDialog

### What to Build

`apps/web/client/src/components/presentation/ImportPresentationDialog.tsx` — Radix `Dialog` with a 5-step state machine.

### State Machine

```
"select" → "uploading"   (PPTX file selected + Import clicked)
         → "processing"  (Google Slides: startImport submitted)
"uploading" → "processing"  (XHR upload complete + startImport succeeds)
            → "error"       (upload failure or startImport failure)
"processing" → "result"  (status polling returns "done")
             → "error"   (status polling returns "failed")
"error" → "select"       (Try Again clicked)
```

State held by the component:
- `step: "select" | "uploading" | "processing" | "result" | "error"`
- `uploadProgress: number` (0–100)
- `conversionId: number | null`
- `errorMessage: string | null`
- `abortControllerRef: React.MutableRefObject<AbortController | null>`

### Step: Select

Two tabs via Radix `Tabs` component: "Upload PPTX" | "Google Slides".

**PPTX tab:** Hidden `<input type="file" accept=".pptx" />`. Visible drag-and-drop zone with label and "Max 50 MB" badge. On file select: validate `file.size <= 52_428_800` (50MB); if over limit, show inline error without advancing. "Import" button (disabled until file selected) triggers the upload flow.

**Google Slides tab:** URL text input. On blur, validate URL matches `^https://docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)`. Display Google OAuth connection status (query via existing user settings). If not connected: show "Connect Google Drive" button. If connected: show URL input and "Import" button. On submit: call `startImport` directly (no file upload needed) and advance to "processing".

### Step: Uploading

Uses XHR (not `fetch`) because the `fetch` API lacks upload progress events:

```typescript
function uploadPptxFile(file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<{ libraryItemId: number }>
```

POST to the existing library file upload endpoint (whatever the codebase already uses for library uploads). On progress: call `onProgress(Math.round(loaded/total*100))`. On abort: reject with `DOMException("Aborted", "AbortError")`.

After successful upload: call `trpc.presentationImport.startImport.mutate({ sourceType: "pptx", sourceLibraryItemId, title })`. On success: set `conversionId` and advance to "processing".

Cancel button: call `abortRef.current?.abort()`, reset to "select".

### Step: Processing

Show spinner and progress bar. The progress value comes from `trpc.presentationImport.getImportStatus` polling.

Polling hook using TanStack Query v5 API:
```typescript
const { data } = useQuery({
  queryKey: ["import-status", conversionId],
  queryFn: () => trpc.presentationImport.getImportStatus.query({ conversionId: conversionId! }),
  enabled: conversionId !== null,
  refetchInterval: (query) => {
    const s = query.state.data?.status;
    return (s === "done" || s === "failed" || s === "cancelled") ? false : 2000;
  },
  staleTime: 0,
})
```

In a `useEffect`, watch `data?.status`: when `"done"` → advance to "result"; when `"failed"` → set errorMessage, advance to "error".

Cancel button: call `trpc.presentationImport.cancelImport.mutate({ conversionId })` (best-effort), then reset to "select".

### Step: Result

"Import complete! N slides imported." (where N = `data.slides?.length`). Below: fidelity warnings list as `<ul>` — each `<li>` is a string from `data.fidelityWarnings`. "Open Deck" button: navigate to the PresentationEditor route for `data.deckLibraryItemId`. "Close" button.

### Step: Error

Display `errorMessage`. "Try Again" button: reset `step` to "select", clear `conversionId`, clear `errorMessage`.

---

## Section 08: Frontend — PresentationEditor Integration

### What to Build

Modify `apps/web/client/src/pages/PresentationEditor.tsx`.

### Changes

Add `const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)` to the component.

Add "Import" button in the header toolbar, next to the existing Export button:
```tsx
<Button onClick={() => setIsImportDialogOpen(true)} variant="secondary" size="sm">
  <Upload className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Import</span>
</Button>
```

Render the dialog conditionally:
```tsx
{isImportDialogOpen && (
  <ImportPresentationDialog onClose={() => setIsImportDialogOpen(false)} />
)}
```

No other changes to PresentationEditor.

---

## Section 09: Tests

### Python Tests

**`python-backend/tests/test_pptx_importer.py`**

Test pure coordinate conversion functions independently. Create minimal PPTX test fixtures programmatically using `python-pptx` itself (build a `Presentation()` with known shapes). Mock `R2StorageService.upload_bytes` to return `"https://cdn.example.com/test.png"` without real S3 calls.

Required test cases:
- `emu_to_px`, `scale_to_canvas`, `pt_to_canvas_px`: parameter sweep covering edge cases
- 16:9 PPTX: canvas preset detected as `("16:9", 1280, 720)`
- Unknown aspect ratio: canvas uses natural px dimensions
- Text box: position scaled correctly, text joined from paragraphs, style extracted from first run
- Picture (PICTURE): `upload_bytes` called with path matching `*/images/*.png`, element type = `"image"`, src = mock URL
- Linked picture: fidelityWarning emitted, element skipped (element count unchanged)
- Group shape: child element positions include group offset coordinates
- Table shape: fidelityWarning emitted, element skipped
- Chart shape: fidelityWarning emitted, element skipped
- Corrupt file: `import_file` raises `ImportError` with user-friendly message
- fidelityWarnings cap: 30 warnings → result has exactly 25 items, last is "... and N more"

**`python-backend/tests/test_gslides_importer.py`**

Mock `googleapiclient.discovery.build` to return a `MagicMock` service with canned fixture JSON. Mock `httpx.AsyncClient` to return fake image bytes. Use `@pytest.mark.asyncio`.

Required test cases:
- Canvas size: `pageSize` with 16:9 EMU dimensions → preset `("16:9", 1280, 720)`
- TEXT_BOX shape: text assembled from `textElements`, fontSize PT→px conversion, color float→hex
- RECTANGLE shape: solidFill float→hex, no fidelityWarning
- Non-rect shape (ELLIPSE): rect element produced, fidelityWarning emitted
- Image element: `_download_image` called with `contentUrl` + access_token, upload called, src = upload result
- themeColor: element receives `"#cccccc"`, fidelityWarning emitted
- Line element: stroke color and width extracted
- Table element: fidelityWarning emitted, skipped
- Group element: children's x/y include group transform offset
- Skew detection: element with non-zero shearX emits fidelityWarning
- fidelityWarnings cap at 25

Coverage target: ≥ 80% for both files (`pytest --cov=app --cov-fail-under=80`).

### TypeScript Tests (Vitest)

**`ImportPresentationDialog.test.tsx`**

Mock `trpc.presentationImport.startImport`, `trpc.presentationImport.getImportStatus`, `trpc.presentationImport.cancelImport`. Mock the XHR upload function.

Required test cases:
- File too large: inline error shown, step remains `"select"`
- File within limit: step advances to `"uploading"`
- Upload + startImport success: step advances to `"processing"`, conversionId set
- Polling — status `"done"`: step advances to `"result"`, slide count shown, fidelityWarnings rendered
- Polling — status `"failed"`: step advances to `"error"`, error message rendered
- "Open Deck" button: router navigation called with correct `deckLibraryItemId`
- "Try Again" button: step resets to `"select"`, errorMessage cleared
- Google Slides tab: URL validation rejects non-GSlides URLs; valid URL calls `startImport` with `slidesUrl`
- Google OAuth not connected: shows "Connect Google Drive" instead of URL input
- Cancel during upload: `AbortController.abort()` called, step resets to `"select"`

---

## Section 10: Security + QA

### Security Checklist

**File upload (PPTX):**
- Client-side: validate `file.size <= 52_428_800` before XHR starts. Show error immediately.
- FastAPI: validate Content-Length; reject >50MB with 413.
- MIME: FastAPI checks Content-Type is `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
- python-pptx does not execute VBA macros.
- Catch `PackageNotFoundError` / `BadZipFile` at task level; return user-friendly error.

**SSRF prevention (Google Slides images):**
- Validate `content_url.startswith("https://")` before downloading.
- Use `httpx` with `timeout=30.0`, no redirects to non-Google domains.
- Do NOT log `contentUrl` — it contains embedded auth credentials.

**Google OAuth:**
- Verify existing `DRIVE_SCOPES` includes `drive.readonly` (this is the operative scope; `presentations.readonly` is NOT needed separately).
- The access token is retrieved and used entirely within Python — never forwarded through HTTP request bodies from Node.js.
- Access token must NOT be logged at any level.

**Callback route security:**
- Route `POST /api/internal/presentation-import/callback` validates `Authorization: Bearer {ENV.webGatewayToken}` before processing any body.
- Return 401 on auth failure — do not expose the expected token value.
- Body parsed and validated with Zod after auth passes.
- Idempotency check prevents duplicate deck creation from Celery retries.

**Tenant isolation:**
- `getImportStatus` and `cancelImport` filter by both `conversionId` AND `tenantId`.
- `createDeckFromImportResult` uses actor constructed from the DB-stored `userId` and `tenantId`, not from the callback body.
- S3 paths: `{tenant_id}/presentations/imports/{conversion_id}/...`.

**SQL injection:**
- All queries use Drizzle ORM (parameterized). No string concatenation in SQL.
- `fidelityWarnings` stored as JSON array (parameterized).

**Input validation:**
- `source_type` validated to enum via Pydantic `@field_validator`.
- `slides_url` validated by Zod `z.string().url()`.
- Presentation ID extracted from URL via anchored regex `r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)"`.

**Known limitation — S3 orphan images:**
If the Celery task uploads images then fails before completing, those S3 objects become orphans. Mitigation: configure an S3 lifecycle rule with 7-day expiry on the `{tenant_id}/presentations/imports/` prefix.

### QA Checklist

- `pytest python-backend/ --cov=app --cov-fail-under=80` passes
- `cd apps/web && pnpm check` passes
- `cd apps/web && pnpm test` passes
- Manual: upload 16:9 PPTX with text + images → correct slide count, elements ±5px, images HTTPS
- Manual: PPTX >50MB → client-side rejection with error message
- Manual: PPTX with table + chart → fidelityWarnings appear in result UI
- Manual: Google Slides import → deck created, images in S3
- Manual: "Open Deck" → navigates to PresentationEditor for new deck
- Manual: cancel during upload → step resets to "select"
- Manual: cancel during processing → conversion record status = "cancelled"
- Manual: same import submitted twice (idempotency) → second callback does not create duplicate deck

---

## Implementation Order and Dependencies

| Section | Depends On | Can Parallelize With |
|---------|-----------|---------------------|
| 01 — DB Migration | none | — |
| 02 — PPTX Importer | 01 (requirements.txt) | 03 |
| 03 — GSlides Importer | 01 | 02 |
| 04 — Celery + FastAPI | 02, 03 | 05 |
| 05 — tRPC Router | 01 | 06 (partially) |
| 06 — Service + Callback | 01, 05 | — |
| 07 — Dialog | 05 | 08 |
| 08 — Editor Integration | 07 | — |
| 09 — Tests | respective section | — |
| 10 — Security + QA | all sections | — |

---

## New Files Summary

```
python-backend/
  requirements.txt                              (modify: add python-pptx)
  app/services/presentation_importer.py        (new: ImportResult dataclass)
  app/services/pptx_importer.py                (new)
  app/services/gslides_importer.py             (new)
  app/services/r2_storage_service.py           (modify: add upload_bytes method)
  app/tasks/presentation_import_tasks.py       (new)
  app/api/v1/presentation_import.py            (new)
  app/main.py                                  (modify: register new router)
  tests/test_pptx_importer.py                 (new)
  tests/test_gslides_importer.py              (new)

apps/web/
  drizzle/schema.ts                            (modify: schema changes per Section 01)
  server/routers/presentationImport.ts         (new)
  server/routers/index.ts                      (modify: register new router)
  server/services/presentationImportService.ts (new)
  [internal routes file]                       (modify: add callback route)
  client/src/components/presentation/
    ImportPresentationDialog.tsx               (new)
  client/src/pages/PresentationEditor.tsx      (modify: Import button + dialog)
  shared/presentation/contracts.ts            (modify: add google_slides)

Total: ~19 files (13 new, 6+ modified)
```
