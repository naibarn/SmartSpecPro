# Feature 024: Import Presentations from Google Slides & PowerPoint

**Status:** Ready for deep-plan
**Scope:** large
**Risk:** high
**Estimated effort:** 10–15 working days (Phase 1–4 MVP)

---

## 1. Problem Statement

Users who have existing presentations in Google Slides or PowerPoint (.pptx) must currently recreate them manually inside the SmartSpecPro Presentation Editor. This is a significant barrier to adoption. The feature adds one-way import: convert external presentations into SmartSpecPro's internal `PresentationSlideContent` schema, placing the result in the user's library as an editable deck.

---

## 2. Goals

1. Allow users to **upload a `.pptx` file** and have it converted to an editable presentation deck.
2. Allow users to **paste a Google Slides URL** and have it imported via the Google Slides API.
3. Map all supported element types (text, image, rectangle, line) faithfully.
4. Log unsupported elements (table, chart, SmartArt, gradient, animation) as `fidelityWarnings` so users understand what was lost.
5. Present a **pre-import fidelity summary** so users can decide whether to proceed.
6. Store the source attachment in `presentationSourceAttachments` for audit and re-import.

## 3. Non-Goals

- Round-trip export back to PPTX or Google Slides.
- Rich text splitting (mixed inline styles within a single text box) — Phase 6, deferred.
- Slide thumbnail preview before import confirmation — Phase 5, deferred.
- `.ppt` (legacy binary format) — not supported; user must convert to `.pptx` first.
- LibreOffice headless — not added as a dependency.
- Import of presenter notes into the deck (they will be stored in `presentationSlides.notes`).

---

## 4. User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a user, I can click "Import" in the Presentation Editor toolbar and choose between "Upload PPTX" and "From Google Slides". | P0 |
| US-2 | As a user uploading a PPTX, I select a file from disk and see a progress indicator while the import runs. | P0 |
| US-3 | As a user importing from Google Slides, I paste a Google Slides URL and the system uses my existing Google OAuth session to read it. | P0 |
| US-4 | As a user, after import I see a fidelity report listing how many elements were imported vs. dropped, with reasons. | P1 |
| US-5 | As a user, the imported deck opens immediately in the Presentation Editor. | P0 |
| US-6 | As a user, if my Google OAuth token is not connected, I am prompted to connect Google Drive before proceeding. | P0 |
| US-7 | As a user, I can see the import source (filename or Google Slides URL) on the deck's detail page via `presentationSourceAttachments`. | P2 |

---

## 5. Technical Architecture

### 5.1 High-Level Flow

```
Frontend (React)
  └─ ImportPresentationDialog
       ├─ PPTX: file input → upload to library (base64) → tRPC startImport
       └─ GSlides: URL input → tRPC startImport

Node.js (tRPC — presentationImport.ts)
  └─ startImport(sourceType, sourceLibraryItemId?, slidesUrl?, title?)
       → enqueue Celery task via Python /api/v1/presentation-import/start
       → create presentationConversionRecords row (status: queued)
       → return { conversionId }

Python (Celery — presentation_import_tasks.py)
  PPTX path:
    → download PPTX blob from S3 (via sourceLibraryItemId)
    → pptx_importer.py: parse slides → PresentationSlideContent[]
    → upload embedded images to S3/R2 → replace blob with URL
    → return { slides: PresentationSlideContent[], fidelityWarnings: string[] }

  GSlides path:
    → gslides_importer.py: call presentations.get(presentationId)
    → parse pageElements → PresentationSlideContent[]
    → download contentUrl images → upload to S3/R2 → replace with URL
    → return { slides: PresentationSlideContent[], fidelityWarnings: string[] }

  Both paths:
    → update presentationConversionRecords (status: done | failed, fidelityWarnings)
    → POST result back to Node.js callback endpoint

Node.js (callback / polling)
  → createDeck(title)
  → addSlide × N (with PresentationSlideContent JSON)
  → attachAsset × M (for each uploaded image)
  → update presentationSourceAttachments (sourceFormat, conversionStatus)
  → return { deckLibraryItemId }
```

### 5.2 Internal Data Model (Existing — No Migration Needed for MVP)

The following tables already exist in `drizzle/schema.ts` and are sufficient for MVP:

```typescript
// Already in schema — use as-is
presentationSourceAttachments {
  id, deckId, sourceLibraryItemId, sourceFormat,
  conversionStatus, partialFidelity, fidelityWarnings
}

presentationConversionRecords {
  id, tenantId, sourceItemId, sourceFormat,
  idempotencyKey, deckLibraryItemId, deckId,
  partialFidelity, fidelityWarnings, expiresAt
}
```

**`sourceFormat` values to add:** `"pptx"` (already defined), `"google_slides"` (add to enum).

### 5.3 Python Parser Services

#### `python-backend/app/services/pptx_importer.py`

```python
from pptx import Presentation
from pptx.util import Emu
from pptx.enum.shapes import MSO_SHAPE_TYPE
import base64, uuid, math

class PptxImporter:
    def __init__(self, s3_uploader):
        self.s3 = s3_uploader

    async def import_file(self, pptx_bytes: bytes) -> ImportResult:
        prs = Presentation(io.BytesIO(pptx_bytes))
        canvas = self._detect_canvas(prs)
        slides = []
        warnings = []
        for slide in prs.slides:
            elements, slide_warnings = await self._parse_slide(slide, canvas, prs)
            slides.append(PresentationSlideContent(elements=elements, canvas=canvas))
            warnings.extend(slide_warnings)
        return ImportResult(slides=slides, fidelityWarnings=warnings)

    def _detect_canvas(self, prs) -> PresentationCanvasSize:
        # Map standard EMU sizes to presets
        w = prs.slide_width   # EMUs
        h = prs.slide_height  # EMUs
        ratio = round(w / h, 3)
        PRESET_MAP = {
            1.778: ("16:9",  1280, 720),
            0.563: ("9:16",  720, 1280),
            1.333: ("4:3",   1024, 768),
            0.75:  ("3:4",   768, 1024),
            0.8:   ("4:5",   960, 1200),
            1.25:  ("5:4",   1250, 1000),
            1.0:   ("1:1",   1080, 1080),
        }
        preset, cw, ch = PRESET_MAP.get(ratio, (None, round(self._emu_to_px(w)), round(self._emu_to_px(h))))
        return PresentationCanvasSize(preset=preset, width=cw, height=ch)

    @staticmethod
    def _emu_to_px(emu: int, dpi: int = 96) -> float:
        return emu * dpi / 914_400

    @staticmethod
    def _pt_font_to_canvas_px(pt: float) -> int:
        return max(8, min(512, round(pt * 4 / 3)))

    @staticmethod
    def _map_font_weight(bold: bool | None) -> str:
        if bold is True:
            return "700"
        return "normal"
```

Key parsing rules:
- **Text boxes:** Collapse all runs to first run's style. Join paragraphs with `\n`. Cap at 10,000 chars.
- **Images (shape_type == PICTURE):** `shape.image.blob` → upload to S3 → use URL as `src`.
- **Rectangles:** Extract `fill.fore_color.rgb` → `fill`. Extract `line.color.rgb` → `stroke`.
- **Lines:** Extract `line.color.rgb` → `stroke`. Extract `line.width` (EMU → px) → `strokeWidth`.
- **Groups:** Recurse into children, applying group transform (left/top offset) to each child's position.
- **Unsupported (table, chart, SmartArt):** Append to fidelityWarnings, skip.

#### `python-backend/app/services/gslides_importer.py`

Extends `GoogleContentExtractor` to extract structured elements:

```python
import math, httpx
from app.services.google_content_extractor import GoogleContentExtractor

class GSlidesImporter:
    PT_TO_PX = 96.0 / 72.0

    def __init__(self, access_token: str, s3_uploader):
        self.extractor = GoogleContentExtractor(access_token=access_token)
        self.s3 = s3_uploader

    async def import_presentation(self, presentation_id: str) -> ImportResult:
        presentation = self.extractor.slides_service.presentations().get(
            presentationId=presentation_id
        ).execute()
        canvas = self._detect_canvas(presentation["pageSize"])
        slides, warnings = [], []
        for page in presentation.get("slides", []):
            elements, page_warnings = await self._parse_page(page, canvas)
            slides.append({"elements": elements, "canvas": canvas.__dict__})
            warnings.extend(page_warnings)
        return ImportResult(slides=slides, fidelityWarnings=warnings)

    def _detect_canvas(self, page_size: dict) -> PresentationCanvasSize:
        w_pt = page_size["width"]["magnitude"]
        h_pt = page_size["height"]["magnitude"]
        ratio = round(w_pt / h_pt, 3)
        # Same ratio → preset mapping as pptx_importer
        ...

    @staticmethod
    def _element_transform(transform: dict, size: dict, canvas_scale_x: float, canvas_scale_y: float):
        """Extract position, size, rotation from a GSlides AffineTransform."""
        tx = transform.get("translateX", 0.0)
        ty = transform.get("translateY", 0.0)
        sx = transform.get("scaleX", 1.0)
        sy_shear = transform.get("shearY", 0.0)
        w_pt = size["width"]["magnitude"] * sx
        h_pt = size["height"]["magnitude"] * transform.get("scaleY", 1.0)
        rotation_deg = math.degrees(math.atan2(sy_shear, sx))
        return {
            "x": round(tx * GSlidesImporter.PT_TO_PX * canvas_scale_x),
            "y": round(ty * GSlidesImporter.PT_TO_PX * canvas_scale_y),
            "width": round(w_pt * GSlidesImporter.PT_TO_PX * canvas_scale_x),
            "height": round(h_pt * GSlidesImporter.PT_TO_PX * canvas_scale_y),
            "rotation": round(rotation_deg, 2) if abs(rotation_deg) > 0.01 else None,
        }
```

RGB float conversion: `"#{:02x}{:02x}{:02x}".format(round(r*255), round(g*255), round(b*255))`

#### `python-backend/app/services/presentation_importer.py`

Unified interface:

```python
class PresentationImporter:
    async def import_pptx(self, pptx_bytes: bytes, s3_uploader) -> ImportResult: ...
    async def import_google_slides(self, presentation_id: str, access_token: str, s3_uploader) -> ImportResult: ...
```

#### `python-backend/app/tasks/presentation_import_tasks.py`

```python
@celery_app.task(name="tasks.import_presentation", bind=True, max_retries=2)
async def import_presentation_task(self, conversion_id: int, source_type: str, ...):
    ...
```

#### `python-backend/app/api/v1/presentation_import.py`

```
POST /api/v1/presentation-import/start
  body: { conversionId, sourceType, sourceLibraryItemId?, slidesUrl?, accessToken? }
  returns: { taskId }

GET /api/v1/presentation-import/status/{conversionId}
  returns: { status, progress, fidelityWarnings?, error? }
```

### 5.4 Node.js Layer

#### `apps/web/server/routers/presentationImport.ts`

```typescript
// New tRPC router
presentationImport.startImport({
  input: z.object({
    sourceType: z.enum(["pptx", "google_slides"]),
    sourceLibraryItemId: z.number().optional(),  // for PPTX (already uploaded to library)
    slidesUrl: z.string().url().optional(),       // for Google Slides
    title: z.string().optional(),
  }),
  // → calls Python /api/v1/presentation-import/start
  // → returns { conversionId }
})

presentationImport.getImportStatus({
  input: z.object({ conversionId: z.number() }),
  // → polls Python status endpoint
  // → when done: creates deck + slides (internal)
  // → returns { status, deckLibraryItemId?, fidelityWarnings?, progress }
})
```

#### `apps/web/server/services/presentationImportService.ts`

- Receives canvas JSON from Python
- Calls `presentationService.createDeck()`
- Loops: `presentationService.addSlide(deckId, content)` for each slide
- Calls `presentationService.attachAsset()` for each image
- Updates `presentationSourceAttachments` via Drizzle

### 5.5 Frontend

#### `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx`

Two-step dialog:
1. **Source selection:** Tab bar — "Upload PPTX" | "Google Slides"
2. **PPTX tab:** File input (accept=".pptx"), size limit display (max 50MB), Upload button
3. **Google Slides tab:** URL input + check Google OAuth connected; if not → "Connect Google Drive" button
4. **Progress step:** Spinner with progress %, estimated time
5. **Result step:** Fidelity summary (N slides imported, N elements dropped) + "Open Deck" button

#### `apps/web/client/src/pages/PresentationEditor.tsx`

Add "Import" button in the header toolbar (next to Export button):
```tsx
<Button onClick={() => setIsImportDialogOpen(true)} variant="secondary" size="sm">
  <Upload className="h-3.5 w-3.5" />
  <span className="hidden sm:inline">Import</span>
</Button>
```

---

## 6. Element Type Mapping (Full Reference)

### 6.1 PPTX (python-pptx)

| python-pptx shape_type | Canvas type | Properties extracted | Lost |
|------------------------|-------------|---------------------|------|
| TEXT_BOX (17) | `text` | x, y, w, h, text, color, fontSize, fontWeight, fontStyle, textAlign | Rich inline styles |
| PICTURE (13) | `image` | x, y, w, h, src (S3 URL) | crop, brightness |
| AUTO_SHAPE → RECTANGLE | `rect` | x, y, w, h, fill, stroke, strokeWidth | corner radius |
| AUTO_SHAPE → ROUNDED_RECTANGLE | `rect` | x, y, w, h, fill | corner radius |
| AUTO_SHAPE → OVAL | `rect` | x, y, w, h, fill | shape (warns) |
| LINE (9) | `line` | x, y, w, h, stroke, strokeWidth | arrowheads |
| TABLE (19) | Skip | — | fidelityWarning: "Table not supported" |
| CHART (3) | Skip | — | fidelityWarning: "Chart not supported" |
| GROUP (6) | Recurse | Apply group offset | group semantics |
| All with text_frame | `text` overlay | Same as TEXT_BOX | — |

### 6.2 Google Slides API

| elementKind / shapeType | Canvas type | Notes |
|------------------------|-------------|-------|
| shape / TEXT_BOX | `text` | GSlides resolves theme colors automatically |
| shape / RECTANGLE | `rect` | solidFill → fill |
| shape / ROUND_RECTANGLE, ELLIPSE, TRIANGLE, etc. | `rect` | fidelityWarning for non-rect shapes |
| image | `image` | contentUrl download → S3 upload |
| line | `line` | lineFill.solidFill → stroke |
| table | Skip | fidelityWarning |
| video / YouTube | `video` | YouTube URL as src (may not play) |
| video / Drive | `video` | Drive export URL |
| wordArt | `text` | Text content extracted; decoration lost |
| sheetsChart | Skip | fidelityWarning |
| group | Recurse | Apply group transform |

---

## 7. Coordinate Conversion

### PPTX (EMU)

```python
def emu_to_px(emu: int, dpi: int = 96) -> float:
    return emu * dpi / 914_400

def scale_to_canvas(emu: int, slide_emu: int, canvas_px: int) -> int:
    return round(emu_to_px(emu) * canvas_px / emu_to_px(slide_emu))
```

Standard PPTX 16:9: slide_width = 9,144,000 EMU → 960 px @96dpi → scale to 1280px (×1.3333)

### Google Slides (points)

```python
PT_TO_PX = 96.0 / 72.0  # 1.33333

def pt_to_canvas_px(pt: float, slide_pt: float, canvas_px: int) -> int:
    return round(pt * PT_TO_PX * canvas_px / (slide_pt * PT_TO_PX))
```

### Font size

```python
def pt_font_to_canvas_px(pt: float) -> int:
    """Convert font size in points to canvas px (clamped 8–512)."""
    return max(8, min(512, round(pt * 4 / 3)))
```

---

## 8. Fidelity Warning Schema

The Python task returns (and the DB stores):

```python
fidelityWarnings: list[str] = [
    "Slide 2: Table dropped (not supported)",
    "Slide 3: Chart dropped (not supported)",
    "Slide 4: SmartArt dropped (not supported)",
    "Slide 5: Text box uses mixed inline styles — collapsed to dominant style",
    "Slide 6: Ellipse shape approximated as rectangle",
    "Slide 6: Gradient fill converted to solid fill",
]
```

These are stored in `presentationConversionRecords.fidelityWarnings` (text[]) and displayed in the frontend after import.

---

## 9. Security Considerations

| Risk | Mitigation |
|------|-----------|
| Malicious PPTX with zip bombs | Enforce max file size (50MB) before upload; use `python-pptx` which uses zipfile with size checks |
| PPTX with embedded macros (VBA) | python-pptx does not execute macros; safe |
| SSRF via image contentUrl (Google Slides) | Download via httpx with timeout + URL validation; reject non-HTTPS |
| Google OAuth scope overpayment | Request only `presentations.readonly` + `drive.readonly` |
| Cross-tenant image URL exposure | All images re-uploaded to tenant's S3 prefix; original URLs discarded |
| PPTX parser memory exhaustion | Celery worker process isolation; max 50MB input enforced |
| Large decks exceeding 100MB deck limit | Check total asset bytes during import; reject or truncate |
| SQL injection via fidelityWarnings | Stored as parameterized text[]; safe |

---

## 10. Dependencies

### Python Backend

Add to `python-backend/requirements.txt`:
```
python-pptx>=1.0.2
```

### No new Node.js dependencies required

All required Node.js packages (`zod`, `drizzle-orm`, `@trpc/server`, `@aws-sdk/client-s3`) are already installed.

---

## 11. New Files

### Python Backend
```
python-backend/app/services/pptx_importer.py          (new)
python-backend/app/services/gslides_importer.py       (new)
python-backend/app/services/presentation_importer.py  (new, unified interface)
python-backend/app/tasks/presentation_import_tasks.py (new)
python-backend/app/api/v1/presentation_import.py      (new)
python-backend/tests/test_pptx_importer.py            (new)
python-backend/tests/test_gslides_importer.py         (new)
python-backend/requirements.txt                       (modify: add python-pptx)
```

### Node.js Backend
```
apps/web/server/routers/presentationImport.ts         (new)
apps/web/server/services/presentationImportService.ts (new)
apps/web/server/routers/index.ts                      (modify: add import router)
```

### Frontend
```
apps/web/client/src/components/presentation/ImportPresentationDialog.tsx  (new)
apps/web/client/src/pages/PresentationEditor.tsx                          (modify: add Import button)
```

### Shared (optional)
```
apps/web/shared/presentation/contracts.ts             (modify: add google_slides to sourceFormat enum)
```

**Total: ~18 files (12 new, 6 modified)**

---

## 12. Implementation Phases (for deep-plan)

| Phase | Sections | Description |
|-------|---------|-------------|
| **Section 01** | DB + schema | Add `google_slides` to sourceFormat enum in contracts.ts; verify existing tables are sufficient |
| **Section 02** | Python: python-pptx importer | `pptx_importer.py` — text, rect, line, image (S3 upload), coordinate conversion |
| **Section 03** | Python: GSlides importer | `gslides_importer.py` — extends GoogleContentExtractor, same canvas mapping |
| **Section 04** | Python: Celery task + FastAPI endpoint | `presentation_import_tasks.py` + `presentation_import.py` |
| **Section 05** | Node.js tRPC router | `presentationImport.ts` — startImport, getImportStatus |
| **Section 06** | Node.js service layer | `presentationImportService.ts` — createDeck + addSlide loop + attachAsset |
| **Section 07** | Frontend: ImportPresentationDialog | Two-tab dialog (PPTX upload + GSlides URL) with progress + fidelity result |
| **Section 08** | Frontend: PresentationEditor integration | Import button in toolbar, dialog wiring |
| **Section 09** | Tests | `test_pptx_importer.py`, `test_gslides_importer.py`, Vitest for dialog |
| **Section 10** | Security + QA | File size validation, MIME check, URL validation, OAuth scope audit |

---

## 13. Acceptance Criteria

- [ ] User can upload a 16:9 PPTX with text and images; the resulting deck has the correct number of slides, elements are positioned correctly (within ±5px), and all embedded images are accessible via HTTPS URLs.
- [ ] User can import a Google Slides presentation using their existing Google OAuth session; text and images are correctly extracted.
- [ ] Unsupported elements (table, chart, SmartArt) produce `fidelityWarnings` and are logged to `presentationConversionRecords`.
- [ ] A 10-slide PPTX with 5 images per slide completes import in under 60 seconds.
- [ ] A PPTX larger than 50MB is rejected before upload.
- [ ] The imported deck respects the SmartSpecPro 200-slide and 100MB limits.
- [ ] All images are stored in tenant-scoped S3 paths (not inline base64 or external URLs).
- [ ] `pytest` coverage ≥ 80% for `pptx_importer.py` and `gslides_importer.py`.
- [ ] TypeScript check passes (`pnpm check`).
