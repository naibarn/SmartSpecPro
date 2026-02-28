# TDD Plan — Feature 024: Import Presentations

*Companion to claude-plan.md. Defines test stubs to write BEFORE implementing each section.*

**Testing stack:** pytest + pytest-asyncio + unittest.mock (Python) | Vitest + vi.mock (TypeScript)
**Coverage target:** ≥ 80% for all new Python files; no explicit TS target but all critical paths covered
**Test commands:** `pytest python-backend/ --cov=app` | `cd apps/web && pnpm test`

---

## Section 01: DB Migration + Contracts Update

*Schema changes and type constants — test via migration verification, not unit tests.*

- Test: after running `pnpm db:push`, `presentationConversionRecords` table has columns `status`, `progress`, `userId`, `slidesUrl`
- Test: `sourceItemId`, `deckLibraryItemId`, `deckId` columns are nullable (INSERT with nulls succeeds)
- Test: default value for `status` is `"queued"`, default for `progress` is `0`
- Test: TypeScript compiles without error after `contracts.ts` includes `"google_slides"` in sourceFormat
- Test: unique partial index exists on `(tenantId, sourceItemId) WHERE sourceItemId IS NOT NULL`

*These are verified manually post-migration, not by automated unit tests.*

---

## Section 02: Python — PPTX Importer

*File: `python-backend/tests/test_pptx_importer.py`*
*Framework: pytest with @pytest.mark.unit and @pytest.mark.asyncio*
*Mock target: `R2StorageService.upload_bytes` (return fixed URL, no real S3)*

**Coordinate conversion (pure functions — write these tests first):**
- Test: `_emu_to_px(914400)` returns `96.0` (1 inch at 96 DPI)
- Test: `_emu_to_px(0)` returns `0.0`
- Test: `_scale_to_canvas(emu, slide_emu, canvas_px)` scales proportionally
- Test: `_pt_to_canvas_px(12.0)` returns `16` (12pt × 4/3)
- Test: `_pt_to_canvas_px(3.0)` returns `8` (clamp at minimum)
- Test: `_pt_to_canvas_px(400.0)` returns `512` (clamp at maximum)

**Canvas detection:**
- Test: 9,144,000 × 5,143,500 EMU (16:9) → preset `"16:9"`, width `1280`, height `720`
- Test: 9,144,000 × 6,858,000 EMU (4:3) → preset `"4:3"`, width `1024`, height `768`
- Test: unknown ratio → preset is `None`, width/height are natural px dimensions

**Text box parsing:**
- Test: TEXT_BOX shape produces element with type `"text"`
- Test: text from multiple paragraphs is joined with `\n`
- Test: text capped at 10,000 chars when source is longer
- Test: font color extracted when type is RGB (hex string `#RRGGBB`)
- Test: position (x, y) and size (width, height) scaled to canvas coordinates

**Image parsing:**
- Test: PICTURE shape calls `upload_bytes` with key matching `*/images/*.{ext}`
- Test: element type is `"image"`, `src` equals the mocked upload URL
- Test: LINKED_PICTURE (type 14) produces a fidelityWarning and is skipped (no element added)

**Rectangle and line parsing:**
- Test: AUTO_SHAPE RECTANGLE produces element type `"rect"` with `fill` extracted
- Test: AUTO_SHAPE OVAL produces element type `"rect"` AND a fidelityWarning
- Test: LINE shape produces element type `"line"` with `stroke` and `strokeWidth`

**Group parsing:**
- Test: GROUP shape — child element x,y include the group's left/top offset
- Test: nested GROUP (group within group) — child accumulates all ancestor offsets

**Unsupported shapes:**
- Test: TABLE shape produces fidelityWarning containing "Table" and is skipped
- Test: CHART shape produces fidelityWarning containing "Chart" and is skipped

**Error handling:**
- Test: corrupt file (non-zip bytes) causes `import_file` to raise `ImportError` with user-friendly message
- Test: empty file causes `ImportError`

**fidelityWarnings cap:**
- Test: when 30 warnings generated, result has exactly 25 items
- Test: last warning item contains "more warnings"

---

## Section 03: Python — Google Slides Importer

*File: `python-backend/tests/test_gslides_importer.py`*
*Framework: pytest-asyncio + unittest.mock*
*Mock targets: `googleapiclient.discovery.build` (canned fixture JSON), `httpx.AsyncClient` (fake image bytes)*

**Canvas detection:**
- Test: `pageSize` with 16:9 EMU dimensions → preset `"16:9"`, 1280×720
- Test: unknown ratio → natural px dimensions, no preset

**Text extraction:**
- Test: TEXT_BOX shape with `textElements` → correct concatenated text string
- Test: `textRun.style.fontSize.magnitude` in PT converted to px via `_pt_to_canvas_px`
- Test: `rgbColor` float values converted to correct hex string
- Test: themeColor (absent `rgbColor`) → element color is `"#000000"` + fidelityWarning emitted

**Shape types:**
- Test: RECTANGLE shape → element type `"rect"`, solidFill color extracted
- Test: ELLIPSE shape → element type `"rect"` + fidelityWarning about approximation
- Test: TRIANGLE shape → element type `"rect"` + fidelityWarning

**Image element:**
- Test: `_download_image` called with `contentUrl` and `access_token` in Authorization header
- Test: downloaded bytes passed to `r2_service.upload_bytes`
- Test: element `src` equals upload result URL
- Test: failed image download (httpx error) → fidelityWarning emitted, element skipped

**Line element:**
- Test: `line.lineProperties.lineFill.solidFill.color.rgbColor` → hex stroke color
- Test: `line.lineProperties.weight.magnitude` (EMU) → px strokeWidth

**Group:**
- Test: child element positions include group transform translateX/Y offset

**Non-uniform transform:**
- Test: element with non-zero shearX emits fidelityWarning about skew

**Unsupported types:**
- Test: table element → fidelityWarning + skipped
- Test: sheetsChart element → fidelityWarning + skipped

**fidelityWarnings cap:**
- Test: 30 warnings → exactly 25 items in result, last is "more warnings"

---

## Section 04: Python — Celery Task + FastAPI Endpoint

*File: extend existing test files or create `python-backend/tests/test_presentation_import_api.py`*

**FastAPI endpoint `POST /api/v1/presentation-import/start`:**
- Test: missing `source_library_item_id` for `source_type="pptx"` → 422 validation error
- Test: missing `slides_url` for `source_type="google_slides"` → 422 validation error
- Test: invalid `source_type` → 422 validation error
- Test: valid PPTX request → Celery task enqueued, response has `task_id`
- Test: unauthenticated request → 401

**FastAPI endpoint `GET /api/v1/presentation-import/status/{conversion_id}`:**
- Test: valid `conversion_id` for current tenant → returns status and progress
- Test: `conversion_id` belonging to different tenant → 404 (tenant isolation)
- Test: non-existent `conversion_id` → 404

**Celery task (unit, not integration):**
- Test: PPTX path — calls `PptxImporter.import_file` with correct arguments (mock importer)
- Test: GSlides path — calls `GoogleTokenService.get_valid_access_token(user_id)` to get token (not passed from outside)
- Test: GSlides path — calls `GSlidesImporter.import_presentation` with the retrieved token
- Test: progress updates: DB row updated at 5%, mid-slide, 90%, 100%
- Test: `_notify_nodejs` called with `status="done"` and slides on success
- Test: `_notify_nodejs` called with `status="failed"` and error message on exception
- Test: slides JSON >8MB → truncated + fidelityWarning added

---

## Section 05: Node.js — tRPC Router

*File: Vitest tests adjacent to or in `apps/web/server/routers/`*
*Mock: Drizzle DB queries, Python HTTP client*

**`startImport`:**
- Test: `sourceType="pptx"` without `sourceLibraryItemId` → tRPC error thrown
- Test: `sourceType="google_slides"` without `slidesUrl` → tRPC error thrown
- Test: Google Slides when OAuth not connected → `PRECONDITION_FAILED` error
- Test: valid PPTX input → `presentationConversionRecords` insert called with correct fields
- Test: valid PPTX input → Python API call made with `conversionId`, `userId`, `tenantId`
- Test: valid PPTX input → returns `{ conversionId }`

**`getImportStatus`:**
- Test: returns status + progress for own tenant's record
- Test: `conversionId` from different tenant → NOT_FOUND error (tenant isolation)
- Test: non-existent record → NOT_FOUND

**`cancelImport`:**
- Test: already-done record → returns early without DB update
- Test: in-progress record → updates status to `"cancelled"`, calls Python cancel endpoint

---

## Section 06: Node.js — Service Layer + Callback Handler

*File: Vitest tests for `presentationImportService.ts` and callback route*
*Mock: `createPresentationDeckForLibraryItem`, `addSlideToDeck`, Drizzle inserts*

**`createDeckFromImportResult`:**
- Test: creates `libraryItem` Drizzle insert with `itemType="presentation"`, `status="active"`
- Test: calls `createPresentationDeckForLibraryItem` with the new `libraryItemId`
- Test: calls `addSlideToDeck` for each slide with incrementing `expectedVersion`
- Test: inserts `presentationSourceAttachments` row linking deck to source
- Test: updates `presentationConversionRecords` with `deckId`, `deckLibraryItemId`, `status="done"`
- Test: slides >200 → truncated to 200

**Callback route:**
- Test: missing `Authorization` header → 401 with no body
- Test: wrong token value → 401
- Test: `status="done"` + already-done record (idempotency) → 200 without calling `createDeckFromImportResult`
- Test: `status="done"` + new record → `createDeckFromImportResult` called, 200 returned
- Test: `status="failed"` → conversion record updated to `"failed"`, 200 returned
- Test: malformed body (Zod validation) → 400

---

## Section 07: Frontend — ImportPresentationDialog

*File: `ImportPresentationDialog.test.tsx`*
*Framework: Vitest + React Testing Library*
*Mock: tRPC mutations/queries, XHR upload function*

**File validation (before upload):**
- Test: file with size > 50MB → inline error shown, step remains `"select"`
- Test: file with size ≤ 50MB → no error, step ready to advance

**PPTX flow:**
- Test: clicking Import with valid file → step changes to `"uploading"`
- Test: upload progress callback → progress bar value updates
- Test: upload success → `startImport` called with `sourceType="pptx"` + `sourceLibraryItemId`
- Test: upload success + `startImport` success → step changes to `"processing"`, conversionId set
- Test: upload failure → step changes to `"error"`, error message displayed
- Test: Cancel during upload → `AbortController.abort()` called, step resets to `"select"`

**Google Slides flow:**
- Test: invalid URL (not Google Slides) → validation error shown
- Test: valid URL → `startImport` called with `sourceType="google_slides"` + `slidesUrl`
- Test: OAuth not connected → "Connect Google Drive" button rendered instead of URL input

**Processing step:**
- Test: status `"done"` → step changes to `"result"`
- Test: status `"failed"` → step changes to `"error"`, error message shown
- Test: Cancel during processing → `cancelImport` called, step resets to `"select"`

**Result step:**
- Test: slide count displayed
- Test: fidelityWarnings rendered as list items
- Test: "Open Deck" button triggers navigation to correct `deckLibraryItemId` route

**Error step:**
- Test: "Try Again" button → step resets to `"select"`, error cleared

---

## Section 08: Frontend — PresentationEditor Integration

*Add to existing PresentationEditor tests or create `PresentationEditor.import.test.tsx`*

- Test: "Import" button renders in toolbar
- Test: clicking "Import" button → `isImportDialogOpen` becomes `true` (dialog renders)
- Test: dialog `onClose` called → dialog no longer renders

---

## Section 09: Tests

*No additional stubs needed — Section 09 IS the test section. The stubs above cover the implementation.*

---

## Section 10: Security + QA

*Security validation — no automated unit tests for most items; manual checklist.*

**Automated tests to add (if not covered above):**
- Test: `_download_image` with non-HTTPS URL → returns `None` without making HTTP request
- Test: `_download_image` with a URL that redirects to HTTP → not followed (rejected)
- Test: PPTX FastAPI endpoint with Content-Length > 50MB → returns 413
- Test: callback route with valid token but body >10MB → graceful rejection (not crash)
