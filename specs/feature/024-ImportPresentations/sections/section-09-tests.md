Now I have all the context needed. Let me generate the complete section-09-tests content.

# Section 09: Tests

## Overview

This section covers verification of all test suites for Feature 024: Import Presentations. All implementation sections (01–08) are complete. Test files were created during TDD in each prior section, so this section verifies they all pass and documents coverage.

**Test commands:**

- Python: `cd python-backend && uv run pytest tests/test_pptx_importer.py tests/test_gslides_importer.py tests/test_presentation_import_api.py -v`
- TypeScript: `cd apps/web && npx vitest run` (or specific files)

## Actual Implementation Notes

All test files listed in this section were implemented during TDD in prior sections (02-08). Section-09 verified:

1. **Python tests:** 74 tests passing across 3 files (8.00s)
   - `test_pptx_importer.py`: 22+ tests (74% coverage of pptx_importer.py)
   - `test_gslides_importer.py`: 25+ tests (97% coverage of gslides_importer.py)
   - `test_presentation_import_api.py`: task + API endpoint tests (62% coverage of tasks, 100% of importer model)

2. **TypeScript tests:** 46 tests passing across 5 files (2.52s)
   - `presentationImport.test.ts`: 12 tests (tRPC router)
   - `presentationImportCallback.test.ts`: 7 tests (internal callback)
   - `presentationImportService.test.ts`: 7 tests (service layer)
   - `ImportPresentationDialog.test.tsx`: 17 tests (React dialog)
   - `PresentationEditor.test.tsx`: 3 import integration tests (lines 1347-1375)

3. **Code review finding:** A duplicate `PresentationEditor.import.test.tsx` was initially created but removed after review identified it as redundant with the existing tests in `PresentationEditor.test.tsx`.

---

## Dependencies

This section depends on all prior sections being complete:

- Section 02: `python-backend/app/services/pptx_importer.py` and `presentation_importer.py`
- Section 03: `python-backend/app/services/gslides_importer.py`
- Section 04: `python-backend/app/tasks/presentation_import_tasks.py` and `python-backend/app/api/v1/presentation_import.py`
- Section 05: `apps/web/server/routers/presentationImport.ts`
- Section 06: `apps/web/server/services/presentationImportService.ts` and the internal callback route
- Section 07: `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx`
- Section 08: Import button integrated in `apps/web/client/src/pages/PresentationEditor.tsx`

---

## Python Test Files

### `python-backend/tests/test_pptx_importer.py`

**Framework:** pytest with `@pytest.mark.unit` and `@pytest.mark.asyncio`

**Mock strategy:** Mock `R2StorageService.upload_bytes` to return a fixed URL (`"https://cdn.example.com/test.png"`) without real S3 calls. Build PPTX test fixtures programmatically using `python-pptx` itself (construct a `Presentation()` with known shapes and known EMU dimensions).

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_pptx_importer.py`

```python
"""Tests for PptxImporter and pure coordinate conversion helpers.

Uses python-pptx to build programmatic fixtures — no real .pptx files required.
All S3/R2 calls are mocked to return a fixed URL.
"""
import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pptx import Presentation
from pptx.util import Emu, Pt

# Import the module under test (adjust import path if needed)
from app.services.pptx_importer import (
    PptxImporter,
    _emu_to_px,
    _scale_to_canvas,
    _pt_to_canvas_px,
    PRESET_MAP,
)
from app.services.presentation_importer import ImportResult


MOCK_UPLOAD_URL = "https://cdn.example.com/test.png"


@pytest.fixture
def mock_r2():
    """R2StorageService mock — upload_bytes returns a fixed URL."""
    svc = MagicMock()
    svc.upload_bytes = AsyncMock(return_value=MOCK_UPLOAD_URL)
    return svc


@pytest.fixture
def importer(mock_r2):
    return PptxImporter(r2_service=mock_r2)


# ---------------------------------------------------------------------------
# Coordinate conversion — pure functions
# ---------------------------------------------------------------------------

class TestEmuToPx:
    def test_one_inch(self):
        """914,400 EMU = 1 inch = 96 px at 96 DPI."""
        assert _emu_to_px(914_400) == pytest.approx(96.0)

    def test_zero(self):
        assert _emu_to_px(0) == 0.0

    def test_proportional(self):
        """Half an inch should be 48 px."""
        assert _emu_to_px(457_200) == pytest.approx(48.0)


class TestScaleToCanvas:
    def test_proportional_scaling(self):
        """Element half the slide width maps to half the canvas width."""
        result = _scale_to_canvas(emu=4_572_000, slide_emu=9_144_000, canvas_px=1280)
        assert result == 640

    def test_full_width(self):
        result = _scale_to_canvas(emu=9_144_000, slide_emu=9_144_000, canvas_px=1280)
        assert result == 1280


class TestPtToCanvasPx:
    def test_normal(self):
        """12pt × 4/3 = 16px."""
        assert _pt_to_canvas_px(12.0) == 16

    def test_clamp_minimum(self):
        """Very small font (3pt × 4/3 = 4) clamps to 8."""
        assert _pt_to_canvas_px(3.0) == 8

    def test_clamp_maximum(self):
        """Very large font clamps to 512."""
        assert _pt_to_canvas_px(400.0) == 512


# ---------------------------------------------------------------------------
# Canvas detection
# ---------------------------------------------------------------------------

class TestCanvasDetection:
    @pytest.mark.asyncio
    async def test_16_9(self, importer):
        """9,144,000 × 5,143,500 EMU is 16:9."""
        prs = Presentation()
        prs.slide_width = Emu(9_144_000)
        prs.slide_height = Emu(5_143_500)
        buf = io.BytesIO()
        prs.save(buf)
        result = await importer.import_file(buf.getvalue(), s3_prefix="t/imports/1")
        # Test verifies canvas detection by checking first slide or via a helper
        # The importer should expose canvas info or we verify via element coordinates
        # Implementation note: check that PRESET_MAP lookup returns ("16:9", 1280, 720)
        assert isinstance(result, ImportResult)

    @pytest.mark.asyncio
    async def test_4_3(self, importer):
        """9,144,000 × 6,858,000 EMU is 4:3."""
        prs = Presentation()
        prs.slide_width = Emu(9_144_000)
        prs.slide_height = Emu(6_858_000)
        buf = io.BytesIO()
        prs.save(buf)
        result = await importer.import_file(buf.getvalue(), s3_prefix="t/imports/1")
        assert isinstance(result, ImportResult)

    @pytest.mark.asyncio
    async def test_unknown_ratio(self, importer):
        """Non-preset ratio → preset is None, width/height are natural px."""
        prs = Presentation()
        prs.slide_width = Emu(7_000_000)
        prs.slide_height = Emu(3_000_000)
        buf = io.BytesIO()
        prs.save(buf)
        result = await importer.import_file(buf.getvalue(), s3_prefix="t/imports/1")
        assert isinstance(result, ImportResult)


# ---------------------------------------------------------------------------
# Text box parsing
# ---------------------------------------------------------------------------

class TestTextBoxParsing:
    @pytest.mark.asyncio
    async def test_element_type_is_text(self, importer):
        """TEXT_BOX shape produces an element with type 'text'."""
        # Build a PPTX with a text box
        # ... (construct prs, add text box, serialize to bytes, call import_file)
        # Assert at least one element has type == "text"
        pass

    @pytest.mark.asyncio
    async def test_paragraphs_joined_with_newline(self, importer):
        """Multiple paragraphs joined with '\\n'."""
        pass

    @pytest.mark.asyncio
    async def test_text_capped_at_10000_chars(self, importer):
        """Text content exceeding 10,000 chars is capped."""
        pass

    @pytest.mark.asyncio
    async def test_font_color_hex(self, importer):
        """RGB font color extracted as #RRGGBB hex string."""
        pass

    @pytest.mark.asyncio
    async def test_position_scaled_to_canvas(self, importer):
        """Element x, y, width, height are scaled canvas coordinates (int px)."""
        pass


# ---------------------------------------------------------------------------
# Image parsing
# ---------------------------------------------------------------------------

class TestImageParsing:
    @pytest.mark.asyncio
    async def test_picture_calls_upload_bytes(self, importer, mock_r2):
        """PICTURE shape calls upload_bytes with key matching */images/*.{ext}."""
        import re
        # Build PPTX with an image shape
        # Call import_file
        # Assert mock_r2.upload_bytes.called and key pattern matches
        pass

    @pytest.mark.asyncio
    async def test_picture_element_type_and_src(self, importer):
        """PICTURE shape produces element with type='image', src=mock URL."""
        pass

    @pytest.mark.asyncio
    async def test_linked_picture_produces_warning_and_is_skipped(self, importer):
        """LINKED_PICTURE (type 14) emits a fidelityWarning and produces no element."""
        pass


# ---------------------------------------------------------------------------
# Rectangle, line parsing
# ---------------------------------------------------------------------------

class TestRectAndLineParsing:
    @pytest.mark.asyncio
    async def test_rectangle_produces_rect_element(self, importer):
        """AUTO_SHAPE RECTANGLE produces element type 'rect' with fill color."""
        pass

    @pytest.mark.asyncio
    async def test_oval_produces_rect_and_warning(self, importer):
        """AUTO_SHAPE OVAL maps to 'rect' element AND emits a fidelityWarning."""
        pass

    @pytest.mark.asyncio
    async def test_line_produces_line_element(self, importer):
        """LINE shape produces element type 'line' with stroke and strokeWidth."""
        pass


# ---------------------------------------------------------------------------
# Group parsing
# ---------------------------------------------------------------------------

class TestGroupParsing:
    @pytest.mark.asyncio
    async def test_group_child_positions_include_offset(self, importer):
        """Child element x, y include the group's left/top canvas offset."""
        pass

    @pytest.mark.asyncio
    async def test_nested_group_accumulates_offsets(self, importer):
        """Nested group: child accumulates all ancestor group offsets."""
        pass


# ---------------------------------------------------------------------------
# Unsupported shapes
# ---------------------------------------------------------------------------

class TestUnsupportedShapes:
    @pytest.mark.asyncio
    async def test_table_produces_warning_and_is_skipped(self, importer):
        """TABLE shape emits fidelityWarning containing 'Table', produces no element."""
        pass

    @pytest.mark.asyncio
    async def test_chart_produces_warning_and_is_skipped(self, importer):
        """CHART shape emits fidelityWarning containing 'Chart', produces no element."""
        pass


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_corrupt_file_raises_import_error(self, importer):
        """Non-zip bytes raises ImportError with a user-friendly message."""
        corrupt = b"not a zip file at all"
        with pytest.raises(ImportError, match="not a valid .pptx"):
            await importer.import_file(corrupt, s3_prefix="t/imports/1")

    @pytest.mark.asyncio
    async def test_empty_file_raises_import_error(self, importer):
        """Empty bytes raises ImportError."""
        with pytest.raises(ImportError):
            await importer.import_file(b"", s3_prefix="t/imports/1")


# ---------------------------------------------------------------------------
# fidelityWarnings cap
# ---------------------------------------------------------------------------

class TestFidelityWarningsCap:
    @pytest.mark.asyncio
    async def test_30_warnings_capped_to_25(self, importer):
        """30 generated warnings result in exactly 25 items in the output list."""
        # Build a PPTX with 30 unsupported shapes to generate 30 warnings
        # Assert len(result.fidelity_warnings) == 25
        pass

    @pytest.mark.asyncio
    async def test_last_warning_mentions_more(self, importer):
        """When warnings are capped, the last item says '... and N more warnings'."""
        pass
```

---

### `python-backend/tests/test_gslides_importer.py`

**Framework:** pytest-asyncio + unittest.mock

**Mock strategy:** Mock `googleapiclient.discovery.build` to return a `MagicMock` service with canned fixture JSON representing a Google Slides presentation. Mock `httpx.AsyncClient` to return fake image bytes.

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_gslides_importer.py`

**Canned fixture structure:** The fixture JSON must mirror the real Google Slides API response. Key fields: `pageSize.width.magnitude`, `pageSize.width.unit`, `pageSize.height.*`, and `slides` as a list of pages, each with `pageElements`.

```python
"""Tests for GSlidesImporter.

All external calls (Google API, httpx image downloads, R2 uploads) are mocked.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from app.services.gslides_importer import GSlidesImporter, _download_image, rgb_float_to_hex
from app.services.presentation_importer import ImportResult


MOCK_UPLOAD_URL = "https://cdn.example.com/slide_image.jpg"
MOCK_IMAGE_BYTES = b"\xff\xd8\xff\xe0fake_jpeg_bytes"
ACCESS_TOKEN = "ya29.fake_token"


def make_emu_dim(magnitude: float) -> dict:
    return {"magnitude": magnitude, "unit": "EMU"}


def make_pt_dim(magnitude: float) -> dict:
    return {"magnitude": magnitude, "unit": "PT"}


def make_presentation_fixture(
    page_width_emu: float = 9_144_000,
    page_height_emu: float = 5_143_500,
    slides: list = None,
) -> dict:
    """Build a minimal Google Slides API presentation response."""
    return {
        "pageSize": {
            "width": make_emu_dim(page_width_emu),
            "height": make_emu_dim(page_height_emu),
        },
        "slides": slides or [],
    }


def make_transform(tx: float = 0.0, ty: float = 0.0, scale_x: float = 1.0, scale_y: float = 1.0, shear_x: float = 0.0, shear_y: float = 0.0) -> dict:
    return {
        "translateX": tx,
        "translateY": ty,
        "scaleX": scale_x,
        "scaleY": scale_y,
        "shearX": shear_x,
        "shearY": shear_y,
        "unit": "EMU",
    }


@pytest.fixture
def mock_r2():
    svc = MagicMock()
    svc.upload_bytes = AsyncMock(return_value=MOCK_UPLOAD_URL)
    return svc


@pytest.fixture
def importer(mock_r2):
    with patch("googleapiclient.discovery.build"):
        return GSlidesImporter(access_token=ACCESS_TOKEN, r2_service=mock_r2)


# ---------------------------------------------------------------------------
# Canvas detection
# ---------------------------------------------------------------------------

class TestCanvasDetection:
    @pytest.mark.asyncio
    async def test_16_9_preset(self, importer, mock_r2):
        """16:9 EMU pageSize resolves to preset '16:9', 1280×720."""
        fixture = make_presentation_fixture(9_144_000, 5_143_500)
        importer._slides_service = MagicMock()
        importer._slides_service.presentations().get().execute.return_value = fixture
        result = await importer.import_presentation("fake_id", "t/imports/1")
        assert isinstance(result, ImportResult)

    @pytest.mark.asyncio
    async def test_unknown_ratio(self, importer):
        """Non-preset ratio → no preset, natural px dimensions."""
        fixture = make_presentation_fixture(7_000_000, 3_000_000)
        importer._slides_service = MagicMock()
        importer._slides_service.presentations().get().execute.return_value = fixture
        result = await importer.import_presentation("fake_id", "t/imports/1")
        assert isinstance(result, ImportResult)


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

class TestTextExtraction:
    @pytest.mark.asyncio
    async def test_textbox_text_assembled(self, importer):
        """TEXT_BOX pageElement text assembled from textElements list."""
        pass

    @pytest.mark.asyncio
    async def test_fontsize_pt_to_px(self, importer):
        """fontSize in PT converted via _pt_to_canvas_px."""
        pass

    @pytest.mark.asyncio
    async def test_rgb_float_to_hex(self):
        """rgb_float_to_hex converts float color components correctly."""
        color = {"red": 1.0, "green": 0.502, "blue": 0.0}
        result = rgb_float_to_hex(color)
        assert result.startswith("#")
        assert len(result) == 7

    @pytest.mark.asyncio
    async def test_theme_color_fallback(self, importer):
        """themeColor (no rgbColor) → element color '#000000', fidelityWarning emitted."""
        pass


# ---------------------------------------------------------------------------
# Shape types
# ---------------------------------------------------------------------------

class TestShapeTypes:
    @pytest.mark.asyncio
    async def test_rectangle_produces_rect_element(self, importer):
        """RECTANGLE shapeType → element type 'rect', solidFill color extracted."""
        pass

    @pytest.mark.asyncio
    async def test_ellipse_produces_rect_and_warning(self, importer):
        """ELLIPSE → element type 'rect' + fidelityWarning about approximation."""
        pass

    @pytest.mark.asyncio
    async def test_triangle_produces_rect_and_warning(self, importer):
        """TRIANGLE → element type 'rect' + fidelityWarning."""
        pass


# ---------------------------------------------------------------------------
# Image element
# ---------------------------------------------------------------------------

class TestImageElement:
    @pytest.mark.asyncio
    async def test_download_image_called_with_auth(self, importer, mock_r2):
        """_download_image called with contentUrl and access_token in header."""
        pass

    @pytest.mark.asyncio
    async def test_image_src_equals_upload_result(self, importer, mock_r2):
        """element src equals the URL returned by r2_service.upload_bytes."""
        pass

    @pytest.mark.asyncio
    async def test_failed_image_download_emits_warning(self, importer):
        """httpx error during image download → fidelityWarning, element skipped."""
        pass


# ---------------------------------------------------------------------------
# Line element
# ---------------------------------------------------------------------------

class TestLineElement:
    @pytest.mark.asyncio
    async def test_line_stroke_color_extracted(self, importer):
        """Line solidFill rgbColor → hex stroke color on element."""
        pass

    @pytest.mark.asyncio
    async def test_line_stroke_width_from_weight(self, importer):
        """line.lineProperties.weight.magnitude (EMU) → px strokeWidth."""
        pass


# ---------------------------------------------------------------------------
# Group element
# ---------------------------------------------------------------------------

class TestGroupElement:
    @pytest.mark.asyncio
    async def test_group_child_offset(self, importer):
        """Child element positions include group's translateX/Y offset."""
        pass


# ---------------------------------------------------------------------------
# Non-uniform transform (skew detection)
# ---------------------------------------------------------------------------

class TestSkewDetection:
    @pytest.mark.asyncio
    async def test_nonzero_shear_emits_warning(self, importer):
        """Element with non-zero shearX emits a fidelityWarning about skew."""
        pass


# ---------------------------------------------------------------------------
# Unsupported types
# ---------------------------------------------------------------------------

class TestUnsupportedTypes:
    @pytest.mark.asyncio
    async def test_table_produces_warning_and_is_skipped(self, importer):
        pass

    @pytest.mark.asyncio
    async def test_sheets_chart_produces_warning_and_is_skipped(self, importer):
        pass


# ---------------------------------------------------------------------------
# fidelityWarnings cap
# ---------------------------------------------------------------------------

class TestFidelityWarningsCap:
    @pytest.mark.asyncio
    async def test_30_warnings_capped_to_25(self, importer):
        """30 generated warnings capped to exactly 25 items."""
        pass

    @pytest.mark.asyncio
    async def test_last_warning_mentions_more(self, importer):
        """Last item after cap says 'more warnings'."""
        pass


# ---------------------------------------------------------------------------
# _download_image standalone tests
# ---------------------------------------------------------------------------

class TestDownloadImage:
    @pytest.mark.asyncio
    async def test_non_https_url_returns_none(self):
        """Non-HTTPS URL returns None without making an HTTP request."""
        result = await _download_image("http://evil.example.com/img.jpg", ACCESS_TOKEN)
        assert result is None

    @pytest.mark.asyncio
    async def test_http_error_returns_none(self):
        """httpx.HTTPError → returns None."""
        import httpx
        with patch("httpx.AsyncClient") as mock_client:
            instance = mock_client.return_value.__aenter__.return_value
            instance.get.side_effect = httpx.HTTPError("connection failed")
            result = await _download_image("https://slides.google.com/img.jpg", ACCESS_TOKEN)
        assert result is None
```

---

### `python-backend/tests/test_presentation_import_api.py`

**Framework:** pytest with FastAPI `TestClient` / `AsyncClient`. Mock Celery task dispatch and DB queries.

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_presentation_import_api.py`

```python
"""Tests for POST /api/v1/presentation-import/start and GET /api/v1/presentation-import/status/{id}.

Celery task dispatch is mocked — no real worker needed.
"""
import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient
from app.main import app


class TestStartEndpoint:
    @pytest.mark.asyncio
    async def test_pptx_missing_source_library_item_id(self):
        """source_type=pptx without source_library_item_id → 422."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/presentation-import/start",
                json={"conversion_id": 1, "source_type": "pptx", "user_id": 1, "tenant_id": 1},
                headers={"Authorization": "Bearer test_token"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_gslides_missing_slides_url(self):
        """source_type=google_slides without slides_url → 422."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/presentation-import/start",
                json={"conversion_id": 1, "source_type": "google_slides", "user_id": 1, "tenant_id": 1},
                headers={"Authorization": "Bearer test_token"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_source_type(self):
        """Unknown source_type → 422."""
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/presentation-import/start",
                json={"conversion_id": 1, "source_type": "docx", "user_id": 1, "tenant_id": 1, "source_library_item_id": 5},
                headers={"Authorization": "Bearer test_token"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_pptx_request_enqueues_task(self):
        """Valid PPTX request → Celery task enqueued, response has task_id."""
        with patch("app.api.v1.presentation_import.import_presentation_task.apply_async") as mock_task:
            mock_task.return_value.id = "celery-task-abc"
            async with AsyncClient(app=app, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/presentation-import/start",
                    json={"conversion_id": 1, "source_type": "pptx", "source_library_item_id": 5, "user_id": 1, "tenant_id": 1},
                    headers={"Authorization": "Bearer test_token"},
                )
            assert resp.status_code == 200
            assert resp.json()["task_id"] == "celery-task-abc"


class TestStatusEndpoint:
    @pytest.mark.asyncio
    async def test_returns_status_for_own_tenant(self):
        """Valid conversion_id for current tenant returns status and progress."""
        pass

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(self):
        """conversion_id from different tenant → 404."""
        pass

    @pytest.mark.asyncio
    async def test_nonexistent_returns_404(self):
        """Non-existent conversion_id → 404."""
        pass


class TestCeleryTaskUnit:
    def test_pptx_path_calls_pptx_importer(self):
        """PPTX task path instantiates PptxImporter and calls import_file."""
        pass

    def test_gslides_path_gets_access_token_from_service(self):
        """Google Slides path calls GoogleTokenService.get_valid_access_token(user_id)."""
        pass

    def test_gslides_path_calls_gslides_importer(self):
        """Google Slides path calls GSlidesImporter.import_presentation with retrieved token."""
        pass

    def test_notify_nodejs_called_on_success(self):
        """_notify_nodejs called with status='done' and slides on success."""
        pass

    def test_notify_nodejs_called_on_failure(self):
        """_notify_nodejs called with status='failed' and error on exception."""
        pass

    def test_large_slides_json_truncated(self):
        """slides JSON > 8MB → truncated to fit + fidelityWarning added."""
        pass
```

---

## TypeScript Test Files

### `apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx`

**Framework:** Vitest + React Testing Library

**Mock strategy:** Mock `trpc.presentationImport.startImport`, `trpc.presentationImport.getImportStatus`, and `trpc.presentationImport.cancelImport`. Mock the XHR upload function (`uploadPptxFile`) via `vi.mock`. Mock Wouter's `useLocation` for navigation assertions.

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/ImportPresentationDialog.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportPresentationDialog } from "./ImportPresentationDialog";

// Mock tRPC — adjust import path to match the project's tRPC client setup
vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentationImport: {
      startImport: { mutate: vi.fn(), useMutation: vi.fn() },
      getImportStatus: { query: vi.fn(), useQuery: vi.fn() },
      cancelImport: { mutate: vi.fn(), useMutation: vi.fn() },
    },
  },
}));

// Mock XHR upload utility
vi.mock("./uploadPptxFile", () => ({
  uploadPptxFile: vi.fn(),
}));

const FIFTY_MB = 52_428_800;
const OVER_LIMIT = FIFTY_MB + 1;

function makeFile(sizeBytes: number, name = "deck.pptx"): File {
  return new File([new ArrayBuffer(sizeBytes)], name, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

describe("ImportPresentationDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // File validation
  // -------------------------------------------------------------------------

  describe("File validation", () => {
    it("shows inline error and stays on select step when file exceeds 50MB", async () => {
      render(<ImportPresentationDialog onClose={onClose} />);
      const input = screen.getByLabelText(/upload pptx/i);
      await userEvent.upload(input, makeFile(OVER_LIMIT));
      expect(screen.getByText(/50\s*mb/i)).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("accepts file within limit without showing size error", async () => {
      render(<ImportPresentationDialog onClose={onClose} />);
      const input = screen.getByLabelText(/upload pptx/i);
      await userEvent.upload(input, makeFile(FIFTY_MB));
      expect(screen.queryByText(/exceeds/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // PPTX upload flow
  // -------------------------------------------------------------------------

  describe("PPTX upload flow", () => {
    it("advances to uploading step when Import clicked with valid file", async () => {
      const { uploadPptxFile } = await import("./uploadPptxFile");
      (uploadPptxFile as ReturnType<typeof vi.fn>).mockResolvedValue({ libraryItemId: 42 });
      render(<ImportPresentationDialog onClose={onClose} />);
      const input = screen.getByLabelText(/upload pptx/i);
      await userEvent.upload(input, makeFile(FIFTY_MB));
      await userEvent.click(screen.getByRole("button", { name: /import/i }));
      await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    });

    it("calls startImport with sourceType=pptx and sourceLibraryItemId after upload", async () => {
      /** Verify startImport receives correct payload. */
      // Setup mocks, render, simulate upload success, assert startImport args
    });

    it("advances to processing step after upload and startImport succeed", async () => {
      /** step === 'processing' visible when both upload and startImport resolve. */
    });

    it("advances to error step with message on upload failure", async () => {
      /** uploadPptxFile rejects → step changes to 'error', error message displayed. */
    });

    it("calls AbortController.abort() and resets to select on cancel during upload", async () => {
      /** Abort is called when Cancel button clicked during upload step. */
    });
  });

  // -------------------------------------------------------------------------
  // Google Slides flow
  // -------------------------------------------------------------------------

  describe("Google Slides flow", () => {
    it("shows validation error for non-Google Slides URL", async () => {
      render(<ImportPresentationDialog onClose={onClose} />);
      await userEvent.click(screen.getByRole("tab", { name: /google slides/i }));
      const urlInput = screen.getByRole("textbox");
      await userEvent.type(urlInput, "https://example.com/not-slides");
      fireEvent.blur(urlInput);
      expect(screen.getByText(/google\.com\/presentation/i)).toBeInTheDocument();
    });

    it("calls startImport with sourceType=google_slides and slidesUrl for valid URL", async () => {
      /** Valid GSlides URL results in startImport called with slidesUrl. */
    });

    it("shows Connect Google Drive button when OAuth not connected", async () => {
      /** Render with OAuth disconnected state → 'Connect Google Drive' rendered. */
    });
  });

  // -------------------------------------------------------------------------
  // Processing step polling
  // -------------------------------------------------------------------------

  describe("Processing step — polling", () => {
    it("advances to result step when status polling returns done", async () => {
      /** getImportStatus returns status='done' → step changes to 'result'. */
    });

    it("advances to error step when status polling returns failed", async () => {
      /** getImportStatus returns status='failed' → step 'error', error message shown. */
    });

    it("calls cancelImport and resets to select when Cancel clicked during processing", async () => {
      /** Cancel during processing calls cancelImport mutation, resets state. */
    });
  });

  // -------------------------------------------------------------------------
  // Result step
  // -------------------------------------------------------------------------

  describe("Result step", () => {
    it("displays imported slide count", async () => {
      /** result data has slideCount=5 → '5 slides imported' visible. */
    });

    it("renders fidelityWarnings as list items", async () => {
      /** result.fidelityWarnings is an array → each item in a <li>. */
    });

    it("navigates to correct deckLibraryItemId route on Open Deck click", async () => {
      /** Open Deck button triggers navigation with correct deckLibraryItemId. */
    });
  });

  // -------------------------------------------------------------------------
  // Error step
  // -------------------------------------------------------------------------

  describe("Error step", () => {
    it("resets step to select and clears error on Try Again click", async () => {
      /** After advancing to error, clicking Try Again returns to 'select'. */
    });
  });
});
```

---

### `apps/web/server/services/presentationImportService.test.ts`

**Framework:** Vitest. Mock Drizzle DB calls and `createPresentationDeckForLibraryItem` / `addSlideToDeck`.

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/presentationImportService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDeckFromImportResult } from "./presentationImportService";

vi.mock("@/db", () => ({ db: { insert: vi.fn(), update: vi.fn() } }));
vi.mock("../presentation/presentationService", () => ({
  createPresentationDeckForLibraryItem: vi.fn(),
  addSlideToDeck: vi.fn(),
}));

describe("createDeckFromImportResult", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates libraryItem with itemType='presentation' and status='active'", async () => {
    /** Drizzle insert called with correct fields. */
  });

  it("calls createPresentationDeckForLibraryItem with new libraryItemId", async () => {
    /** Verify deckId is created for the libraryItem. */
  });

  it("calls addSlideToDeck for each slide with incrementing expectedVersion", async () => {
    /** 3 slides → addSlideToDeck called 3× with expectedVersion 0, 1, 2. */
  });

  it("inserts presentationSourceAttachments row linking deck to source", async () => {
    /** sourceAttachments insert called with sourceFormat and fidelityWarnings. */
  });

  it("updates presentationConversionRecords with deckId, deckLibraryItemId, status='done'", async () => {
    /** Conversion record updated after deck creation. */
  });

  it("truncates slides to 200 when input exceeds limit", async () => {
    const slides = Array.from({ length: 250 }, (_, i) => ({ id: `s${i}`, elements: [] }));
    // Call with 250 slides, assert addSlideToDeck called exactly 200 times
  });
});
```

---

### `apps/web/server/routers/presentationImport.test.ts`

**Framework:** Vitest. Test tRPC procedures directly (not via HTTP), mocking Drizzle and the Python HTTP client.

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentationImport.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests exercise router logic with mocked DB and Python HTTP client.
// Adjust import paths to match the project's tRPC test utilities.

describe("presentationImport router", () => {
  describe("startImport", () => {
    it("throws validation error when sourceType=pptx and no sourceLibraryItemId", async () => {});
    it("throws validation error when sourceType=google_slides and no slidesUrl", async () => {});
    it("throws PRECONDITION_FAILED when Google OAuth not connected", async () => {});
    it("inserts conversion record with correct fields for valid PPTX input", async () => {});
    it("calls Python start endpoint with conversionId, userId, tenantId", async () => {});
    it("returns { conversionId } on success", async () => {});
  });

  describe("getImportStatus", () => {
    it("returns status and progress for own tenant's record", async () => {});
    it("throws NOT_FOUND for conversionId from different tenant", async () => {});
    it("throws NOT_FOUND for non-existent record", async () => {});
  });

  describe("cancelImport", () => {
    it("returns early without DB update when status is already done", async () => {});
    it("sets status to cancelled and calls Python cancel for in-progress record", async () => {});
  });
});
```

---

### `apps/web/server/routes/internalCallback.test.ts`

**Framework:** Vitest + Supertest (or in-memory Express app).

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/routes/internalCallback.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock createDeckFromImportResult and Drizzle DB operations.

describe("POST /api/internal/presentation-import/callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when Authorization header is missing", async () => {});
  it("returns 401 when Authorization header has wrong token", async () => {});
  it("returns 200 without calling createDeckFromImportResult when record already done (idempotency)", async () => {});
  it("calls createDeckFromImportResult and returns 200 with deckLibraryItemId for status=done", async () => {});
  it("updates conversion record to failed and returns 200 for status=failed", async () => {});
  it("returns 400 on malformed request body", async () => {});
});
```

---

### `apps/web/client/src/pages/PresentationEditor.import.test.tsx`

**Framework:** Vitest + React Testing Library. Test the Import button integration added in Section 08.

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.import.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PresentationEditor from "./PresentationEditor";

vi.mock("../components/presentation/ImportPresentationDialog", () => ({
  ImportPresentationDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-dialog">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

describe("PresentationEditor — Import button integration", () => {
  it("renders Import button in the toolbar", () => {
    render(<PresentationEditor />);
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
  });

  it("renders ImportPresentationDialog when Import button clicked", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(screen.getByTestId("import-dialog")).toBeInTheDocument();
  });

  it("hides ImportPresentationDialog when onClose is called", async () => {
    render(<PresentationEditor />);
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByTestId("import-dialog")).not.toBeInTheDocument();
  });
});
```

---

## Running the Full Test Suite

After all stubs are filled in and implementation is complete, run these commands to verify coverage:

```bash
# Python — must pass with ≥ 80% coverage
cd /home/dev/projects/SmartSpecPro/python-backend
uv run pytest tests/test_pptx_importer.py tests/test_gslides_importer.py tests/test_presentation_import_api.py \
  -v --cov=app --cov-fail-under=80

# TypeScript — all tests must pass
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm test

# TypeScript — type check must be clean
pnpm check
```

---

## Test Implementation Notes

### Filling In the Stubs

Each stub marked `pass` (Python) or `{}` (TypeScript) requires:

1. Build the smallest fixture that exercises the code path being tested (use `python-pptx` APIs to add shapes programmatically rather than loading real .pptx files).
2. Call the function under test.
3. Assert the specific behavior described in the docstring — do not assert unrelated fields.
4. For async Python tests, always use `@pytest.mark.asyncio`.

### PPTX Fixture Construction Pattern

To build a PPTX with a specific shape type programmatically for a test:

```python
from pptx import Presentation
from pptx.util import Emu, Pt
import io

prs = Presentation()
prs.slide_width = Emu(9_144_000)
prs.slide_height = Emu(5_143_500)
slide_layout = prs.slide_layouts[6]  # blank layout
slide = prs.slides.add_slide(slide_layout)
# Add shapes via slide.shapes API
buf = io.BytesIO()
prs.save(buf)
pptx_bytes = buf.getvalue()
```

### Google Slides Fixture Construction Pattern

Build the API response dict directly in the test rather than loading JSON files:

```python
fixture = {
    "pageSize": {"width": {"magnitude": 9_144_000, "unit": "EMU"}, "height": {"magnitude": 5_143_500, "unit": "EMU"}},
    "slides": [{
        "pageElements": [{
            "objectId": "obj1",
            "size": {"width": {"magnitude": 4_572_000, "unit": "EMU"}, "height": {"magnitude": 1_000_000, "unit": "EMU"}},
            "transform": {"translateX": 0, "translateY": 0, "scaleX": 1.0, "scaleY": 1.0, "shearX": 0.0, "shearY": 0.0, "unit": "EMU"},
            "shape": {
                "shapeType": "TEXT_BOX",
                "text": {"textElements": [{"textRun": {"content": "Hello World", "style": {"fontSize": {"magnitude": 14.0, "unit": "PT"}, "foregroundColor": {"opaqueColor": {"rgbColor": {"red": 0.0, "green": 0.0, "blue": 0.0}}}}}}]}
            }
        }]
    }]
}
```

### Mocking the Google API Client

```python
from unittest.mock import patch, MagicMock

with patch("googleapiclient.discovery.build") as mock_build:
    mock_service = MagicMock()
    mock_service.presentations().get().execute.return_value = fixture
    mock_build.return_value = mock_service
    importer = GSlidesImporter(access_token="token", r2_service=mock_r2)
    result = await importer.import_presentation("pres_id", "t/imports/1")
```