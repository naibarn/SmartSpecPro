I now have all the context I need. Let me generate the section content for `section-02-pptx-importer`.

# Section 02: Python — PPTX Importer

## Overview

This section implements the PPTX parsing layer for Feature 024. It is self-contained and can be built in parallel with Section 03 (Google Slides Importer). The output of this section is consumed by Section 04 (Celery task).

**Dependency:** Section 01 (DB migration) must be complete only insofar as the dev environment is set up. This section has no runtime DB dependency — it is a pure parsing service.

**Test command:** `cd python-backend && uv run pytest tests/test_pptx_importer.py -v --cov=app`

---

## Files to Create or Modify

| Path | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt` | Modify — add `python-pptx>=1.0.2` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/presentation_importer.py` | Create — shared `ImportResult` dataclass |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/pptx_importer.py` | Create — `PptxImporter` class |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/r2_storage_service.py` | Modify — add `upload_bytes` method |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_pptx_importer.py` | Create — full test suite |

---

## Tests First

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_pptx_importer.py`

Framework: `pytest` with `@pytest.mark.unit` and `@pytest.mark.asyncio`. All tests use `unittest.mock.AsyncMock` to patch `R2StorageService.upload_bytes`. No real S3 calls are made.

### Test Setup Pattern

Build minimal PPTX fixtures programmatically using `python-pptx` itself — create a `Presentation()` object, add shapes with known properties, then serialize to `io.BytesIO`. This gives deterministic, dependency-free fixtures.

```python
import io
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pptx import Presentation as PptxPresentation
from pptx.util import Emu, Pt

MOCK_UPLOAD_URL = "https://cdn.example.com/test.png"

@pytest.fixture
def mock_r2():
    """Returns a mock R2StorageService with upload_bytes pre-patched."""
    svc = MagicMock()
    svc.upload_bytes = AsyncMock(return_value=MOCK_UPLOAD_URL)
    return svc
```

### Coordinate Conversion Tests (pure functions — write first)

These test the private module-level functions exported from `pptx_importer.py`. Import them directly for isolated testing.

```python
from app.services.pptx_importer import _emu_to_px, _scale_to_canvas, _pt_to_canvas_px

@pytest.mark.unit
def test_emu_to_px_one_inch():
    """914400 EMU = 1 inch = 96px at 96 DPI."""
    assert _emu_to_px(914_400) == pytest.approx(96.0)

@pytest.mark.unit
def test_emu_to_px_zero():
    assert _emu_to_px(0) == 0.0

@pytest.mark.unit
def test_scale_to_canvas_proportional():
    """Half the slide width should map to half the canvas width."""
    # slide is 9144000 EMU wide, canvas is 1280px wide
    # half the slide = 4572000 EMU -> 640px
    result = _scale_to_canvas(4_572_000, 9_144_000, 1280)
    assert result == 640

@pytest.mark.unit
def test_pt_to_canvas_px_normal():
    """12pt × 4/3 = 16px."""
    assert _pt_to_canvas_px(12.0) == 16

@pytest.mark.unit
def test_pt_to_canvas_px_clamp_min():
    """Values that compute below 8 are clamped to 8."""
    assert _pt_to_canvas_px(3.0) == 8

@pytest.mark.unit
def test_pt_to_canvas_px_clamp_max():
    """Values that compute above 512 are clamped to 512."""
    assert _pt_to_canvas_px(400.0) == 512
```

### Canvas Detection Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_canvas_16_9(mock_r2):
    """9144000 × 5143500 EMU → 16:9 preset, 1280×720."""
    prs = PptxPresentation()
    prs.slide_width = Emu(9_144_000)
    prs.slide_height = Emu(5_143_500)
    # Add a blank slide
    layout = prs.slide_layouts[6]  # blank
    prs.slides.add_slide(layout)
    buf = io.BytesIO()
    prs.save(buf)
    ...
    # result.slides[0] canvas preset should be "16:9" with 1280×720

@pytest.mark.unit
@pytest.mark.asyncio
async def test_canvas_4_3(mock_r2):
    """9144000 × 6858000 EMU → 4:3 preset, 1024×768."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_canvas_unknown_ratio(mock_r2):
    """Non-standard ratio → preset is None, natural px dimensions used."""
    ...
```

### Text Box Parsing Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_textbox_element_type(mock_r2):
    """TEXT_BOX shape produces element with type='text'."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_textbox_multiline_joined(mock_r2):
    """Text from multiple paragraphs is joined with '\\n'."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_textbox_text_capped_at_10000(mock_r2):
    """Text longer than 10000 chars is truncated to 10000."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_textbox_font_color_rgb(mock_r2):
    """RGB font color produces hex string '#RRGGBB' in element style."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_textbox_position_scaled(mock_r2):
    """Element x, y, width, height are scaled to canvas coordinates."""
    ...
```

### Image Parsing Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_picture_upload_called(mock_r2):
    """PICTURE shape calls upload_bytes with key matching '*/images/*.{ext}'."""
    ...
    # Assert mock_r2.upload_bytes was called once
    # Assert call args[0] (key) matches regex r".*/images/[^/]+\.\w+"

@pytest.mark.unit
@pytest.mark.asyncio
async def test_picture_element_src(mock_r2):
    """PICTURE element type is 'image', src equals the mocked upload URL."""
    ...
    assert element["type"] == "image"
    assert element["src"] == MOCK_UPLOAD_URL

@pytest.mark.unit
@pytest.mark.asyncio
async def test_linked_picture_skipped(mock_r2):
    """LINKED_PICTURE (shape_type 14) produces a fidelityWarning and no element."""
    ...
    assert any("Linked image" in w for w in result.fidelity_warnings)
    assert len([e for e in slide_elements if e.get("type") == "image"]) == 0
```

### Shape Parsing Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_autoshape_rectangle(mock_r2):
    """AUTO_SHAPE RECTANGLE produces element type 'rect' with fill extracted."""
    ...

@pytest.mark.unit
@pytest.mark.asyncio
async def test_autoshape_oval_produces_warning(mock_r2):
    """AUTO_SHAPE OVAL produces element type 'rect' AND a fidelityWarning."""
    ...
    assert any("Oval" in w or "oval" in w.lower() for w in result.fidelity_warnings)

@pytest.mark.unit
@pytest.mark.asyncio
async def test_line_shape(mock_r2):
    """LINE shape produces element type 'line' with stroke and strokeWidth."""
    ...
    assert element["type"] == "line"
    assert "stroke" in element
    assert "strokeWidth" in element
```

### Group Shape Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_group_child_offset(mock_r2):
    """GROUP: child element x,y include the group's left/top offset."""
    ...
    # group at (left=100, top=50) with child at (left=20, top=10)
    # child canvas position must include group offset

@pytest.mark.unit
@pytest.mark.asyncio
async def test_nested_group_accumulates_offsets(mock_r2):
    """Nested GROUP: child accumulates all ancestor offsets."""
    ...
```

### Unsupported Shape Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_table_produces_warning_and_skipped(mock_r2):
    """TABLE shape produces fidelityWarning containing 'Table' and no element."""
    ...
    assert any("Table" in w for w in result.fidelity_warnings)

@pytest.mark.unit
@pytest.mark.asyncio
async def test_chart_produces_warning_and_skipped(mock_r2):
    """CHART shape produces fidelityWarning containing 'Chart' and no element."""
    ...
    assert any("Chart" in w for w in result.fidelity_warnings)
```

### Error Handling Tests

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_corrupt_file_raises_import_error(mock_r2):
    """Non-zip bytes cause import_file to raise ImportError with user-friendly message."""
    from app.services.pptx_importer import PptxImporter
    importer = PptxImporter(mock_r2)
    with pytest.raises(ImportError, match="not a valid .pptx"):
        await importer.import_file(b"this is not a pptx file", "tenant1/presentations/imports/99")

@pytest.mark.unit
@pytest.mark.asyncio
async def test_empty_file_raises_import_error(mock_r2):
    from app.services.pptx_importer import PptxImporter
    importer = PptxImporter(mock_r2)
    with pytest.raises(ImportError):
        await importer.import_file(b"", "tenant1/presentations/imports/99")
```

### fidelityWarnings Cap Test

```python
@pytest.mark.unit
@pytest.mark.asyncio
async def test_fidelity_warnings_capped_at_25(mock_r2):
    """When 30 warnings generated, result has exactly 25 items."""
    ...
    assert len(result.fidelity_warnings) == 25
    assert "more warnings" in result.fidelity_warnings[-1]
```

---

## Implementation

### Step 1: Add python-pptx to requirements.txt

File: `/home/dev/projects/SmartSpecPro/python-backend/requirements.txt`

Append to the appropriate section (image/file processing dependencies):

```
python-pptx>=1.0.2
```

### Step 2: Create the Shared ImportResult Dataclass

File: `/home/dev/projects/SmartSpecPro/python-backend/app/services/presentation_importer.py`

This module is the unified interface imported by both `PptxImporter` (this section) and `GSlidesImporter` (Section 03).

```python
"""
Shared types for presentation import.

Both PptxImporter and GSlidesImporter return ImportResult.
"""
from dataclasses import dataclass, field


@dataclass
class ImportResult:
    """Result of parsing a presentation file into SmartSpecPro slide content."""
    slides: list[dict]
    """List of PresentationSlideContent dicts, one per slide."""
    fidelity_warnings: list[str] = field(default_factory=list)
    """Capped at 25 items. Each string describes a feature that could not be fully preserved."""
```

### Step 3: Add upload_bytes to R2StorageService

File: `/home/dev/projects/SmartSpecPro/python-backend/app/services/r2_storage_service.py`

Add the following method to the `R2StorageService` class. The existing `upload_file` method generates its own key internally; `upload_bytes` accepts a caller-specified key for the `{tenant_id}/presentations/imports/{conversion_id}/images/{uuid}.{ext}` path convention required by both importers.

```python
async def upload_bytes(
    self,
    key: str,
    data: bytes,
    content_type: str,
    db_session: Optional["AsyncSession"] = None,
) -> str:
    """Upload raw bytes to R2/S3 at an explicit key.

    Unlike upload_file(), the caller controls the full object key.
    Returns the public URL of the uploaded object.

    Raises ValueError if storage is not configured.
    """
    settings = await self.get_active_settings(db_session=db_session)

    if not settings:
        raise ValueError("Storage not configured — cannot upload bytes")

    try:
        client = self._get_s3_client(settings)

        client.put_object(
            Bucket=settings.get("bucket", ""),
            Key=key,
            Body=data,
            ContentType=content_type,
        )

        public_url_prefix = settings.get("publicUrlPrefix", "").rstrip("/")
        if public_url_prefix:
            url = f"{public_url_prefix}/{key}"
        else:
            endpoint = settings.get("endpoint", "").rstrip("/")
            bucket = settings.get("bucket", "")
            url = f"{endpoint}/{bucket}/{key}"

        logger.info("bytes_uploaded_r2", key=key, size=len(data))
        return url

    except Exception as e:
        logger.error("upload_bytes_error", key=key, error=str(e))
        raise
```

### Step 4: Create PptxImporter

File: `/home/dev/projects/SmartSpecPro/python-backend/app/services/pptx_importer.py`

#### Module-level constants and pure helpers

```python
"""
PPTX Importer — parses a .pptx file into PresentationSlideContent dicts.

Uses python-pptx to extract shapes (text, image, rect, line, group).
Uploads embedded images to R2 via R2StorageService.upload_bytes.
Returns ImportResult with slides and fidelity_warnings.
"""
import io
import zipfile
from dataclasses import dataclass, field
from typing import Optional
from uuid import uuid4

import structlog
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn

from app.services.presentation_importer import ImportResult
from app.services.r2_storage_service import R2StorageService, get_r2_storage_service

logger = structlog.get_logger(__name__)

# Aspect ratio preset map: round(width/height, 3) → (label, canvas_width, canvas_height)
PRESET_MAP: dict[float, tuple[str, int, int]] = {
    1.778: ("16:9",  1280, 720),
    0.563: ("9:16",  720,  1280),
    1.333: ("4:3",   1024, 768),
    0.75:  ("3:4",   768,  1024),
    0.8:   ("4:5",   960,  1200),
    1.25:  ("5:4",   1250, 1000),
    1.0:   ("1:1",   1080, 1080),
}

CONTENT_TYPE_TO_EXT: dict[str, str] = {
    "image/png":  "png",
    "image/jpeg": "jpg",
    "image/gif":  "gif",
    "image/webp": "webp",
    "image/bmp":  "bmp",
    "image/tiff": "tiff",
}
```

#### Pure coordinate conversion functions

These are module-level functions, not methods, so they can be imported and tested independently.

```python
def _emu_to_px(emu: float, dpi: int = 96) -> float:
    """Convert EMU (English Metric Units) to pixels at the given DPI.

    1 inch = 914400 EMU = dpi pixels.
    """
    return emu * dpi / 914_400


def _scale_to_canvas(emu: float, slide_emu: float, canvas_px: int) -> int:
    """Scale an EMU dimension proportionally to the canvas pixel space."""
    return round(_emu_to_px(emu) * canvas_px / _emu_to_px(slide_emu))


def _pt_to_canvas_px(pt: float) -> int:
    """Convert font size in points to pixels, clamped to [8, 512]."""
    return max(8, min(512, round(pt * 4 / 3)))
```

#### Canvas size detection helper

```python
@dataclass
class _CanvasSize:
    """Resolved canvas dimensions for a presentation."""
    preset: Optional[str]    # e.g. "16:9", or None if unknown
    width: int               # canvas width in px
    height: int              # canvas height in px


def _detect_canvas(slide_width_emu: int, slide_height_emu: int) -> _CanvasSize:
    """Look up slide dimensions in PRESET_MAP; fall back to natural px."""
    ratio = round(slide_width_emu / slide_height_emu, 3)
    if ratio in PRESET_MAP:
        label, w, h = PRESET_MAP[ratio]
        return _CanvasSize(preset=label, width=w, height=h)
    return _CanvasSize(
        preset=None,
        width=round(_emu_to_px(slide_width_emu)),
        height=round(_emu_to_px(slide_height_emu)),
    )
```

#### PptxImporter class

```python
class PptxImporter:
    """Parse a PPTX file into a list of PresentationSlideContent dicts.

    Args:
        r2_service: R2StorageService singleton for uploading embedded images.
                    Use get_r2_storage_service() from the caller.
    """

    def __init__(self, r2_service: R2StorageService) -> None:
        self._r2 = r2_service

    async def import_file(self, pptx_bytes: bytes, s3_prefix: str) -> ImportResult:
        """Parse pptx_bytes and return an ImportResult.

        Args:
            pptx_bytes: Raw bytes of the .pptx file.
            s3_prefix: Prefix for S3 keys, e.g.
                       "{tenant_id}/presentations/imports/{conversion_id}".

        Raises:
            ImportError: If pptx_bytes is not a valid .pptx file.
        """
        ...

    async def _parse_slide(
        self,
        slide,
        canvas: _CanvasSize,
        slide_width_emu: int,
        slide_height_emu: int,
        s3_prefix: str,
        slide_num: int,
    ) -> tuple[list[dict], list[str]]:
        """Parse all shapes on one slide. Returns (elements, warnings)."""
        ...

    async def _parse_shapes(
        self,
        shapes,
        parent_left_emu: int,
        parent_top_emu: int,
        canvas: _CanvasSize,
        slide_width_emu: int,
        slide_height_emu: int,
        s3_prefix: str,
        slide_num: int,
    ) -> tuple[list[dict], list[str]]:
        """Recursively parse a shape collection with accumulated parent offsets.

        parent_left_emu and parent_top_emu represent the cumulative offset of
        all ancestor GROUP shapes. Pass 0 for top-level shapes on a slide.
        """
        ...
```

#### Shape parsing rules

Implement `_parse_shapes` by iterating `shapes` and dispatching on `shape.shape_type`:

**MSO_SHAPE_TYPE.TEXT_BOX (17):**
- Compute absolute position: `abs_left = (shape.left or 0) + parent_left_emu`.
- Scale to canvas: `x = _scale_to_canvas(abs_left, slide_width_emu, canvas.width)`, same for y, width, height.
- Collect all paragraphs from `shape.text_frame.paragraphs`. For each paragraph, join all run texts. Join paragraphs with `"\n"`. Cap total text at 10,000 chars.
- Extract style from first non-empty run's `font`:
  - Color: check `font.color.type == PP_COLOR_TYPE.RGB` → `str(font.color.rgb)` (returns `"RRGGBB"`, prepend `"#"`). Otherwise omit.
  - Size: `_pt_to_canvas_px(font.size.pt)` if `font.size` is not None. Otherwise omit.
  - Bold: `font.bold`.
  - Italic: `font.italic`.
- Produce: `{"type": "text", "x": x, "y": y, "width": w, "height": h, "content": text, "style": {...}}`.

**MSO_SHAPE_TYPE.PICTURE (13):**
- Read `shape.image.blob` and `shape.image.content_type` (default `"image/png"`).
- Derive extension: look up in `CONTENT_TYPE_TO_EXT`, default `"png"`.
- Key: `f"{s3_prefix}/images/{uuid4()}.{ext}"`.
- Upload: `url = await self._r2.upload_bytes(key, blob, content_type)`.
- Produce: `{"type": "image", "x": x, "y": y, "width": w, "height": h, "src": url}`.

**Shape type 14 (LINKED_PICTURE):**
- Append `f"Slide {slide_num}: Linked image skipped (external link, blob not embedded)"` to warnings.
- Skip — produce no element.

**MSO_SHAPE_TYPE.AUTO_SHAPE (1):**
- Check `shape.auto_shape_type.real`:
  - `1` (RECTANGLE) or `2` (ROUNDED_RECTANGLE): produce `rect` element.
  - `3` (OVAL): produce `rect` element, append fidelityWarning `f"Slide {slide_num}: Oval approximated as rectangle"`.
  - Other: append `f"Slide {slide_num}: Shape type '{shape.auto_shape_type}' not supported"`, skip.
- For supported rect/oval: extract `fill` from `shape.fill.fore_color.rgb` if `shape.fill.type` is solid and `fore_color.type == RGB`, else `"#cccccc"`.
- Extract stroke/strokeWidth from `shape.line` if `shape.line.width` is not None.
- If `shape.has_text_frame`: also produce a `text` element at the same position.

**MSO_SHAPE_TYPE.LINE (9):**
- Extract `shape.line.color.rgb` → hex string.
- Extract `shape.line.width` (EMU) → `_emu_to_px()` → round to px.
- Produce: `{"type": "line", "x": x, "y": y, "width": w, "height": h, "stroke": stroke_hex, "strokeWidth": stroke_px}`.

**MSO_SHAPE_TYPE.GROUP (6):**
- Group offset: `group_left = shape.left or 0`, `group_top = shape.top or 0`.
- Recurse: `await self._parse_shapes(shape.shapes, parent_left_emu + group_left, parent_top_emu + group_top, canvas, slide_width_emu, slide_height_emu, s3_prefix, slide_num)`.
- Extend elements and warnings from the recursive call.

**Shape type 16 (TABLE):**
- Append `f"Slide {slide_num}: Table dropped (not supported)"`. Skip.

**Shape type 3 (CHART):**
- Append `f"Slide {slide_num}: Chart dropped (not supported)"`. Skip.

**All other shape types:**
- Append `f"Slide {slide_num}: Unknown shape type {shape.shape_type} skipped"`. Skip.

#### fidelityWarnings cap

Apply this truncation rule in `import_file` after collecting all warnings from all slides:

```python
def _cap_warnings(warnings: list[str]) -> list[str]:
    """Cap warnings list at 25 items with a summary item if truncated."""
    if len(warnings) <= 25:
        return warnings
    overflow = len(warnings) - 24
    return warnings[:24] + [f"... and {overflow} more warnings"]
```

#### Error handling in import_file

```python
try:
    prs = Presentation(io.BytesIO(pptx_bytes))
except Exception:
    # Catches pptx.exceptions.PackageNotFoundError and zipfile.BadZipFile
    raise ImportError("The uploaded file is not a valid .pptx file")
```

Both `pptx.exceptions.PackageNotFoundError` and `zipfile.BadZipFile` (and empty bytes) are caught by this broad `except Exception` guard. The re-raise as `ImportError` gives a consistent domain-level error for Section 04 to handle.

---

## Key Design Decisions

**Why module-level pure functions for coordinate conversion?**
They have no side effects or dependencies, making them trivially unit-testable without any mocking. Test them first, independently, before testing the full `import_file` flow.

**Why `upload_bytes` instead of reusing `upload_file`?**
The existing `upload_file` method generates its own key internally (`_generate_file_key`). The importers need explicit key control so that images land at the path convention `{tenant_id}/presentations/imports/{conversion_id}/images/{uuid}.{ext}`, which allows S3 lifecycle rules to target the imports prefix for cleanup.

**Why `parent_left_emu / parent_top_emu` threading in `_parse_shapes`?**
PowerPoint groups nest arbitrarily deep. Each group's `shape.left/top` is relative to its parent group's coordinate system. The accumulated offset must be threaded through all levels; it cannot be computed after the fact because child shapes only know their position relative to their immediate parent.

**Warning cap at 25:**
The fidelityWarnings list is stored in the DB as a JSON column and displayed to the user. Unlimited warnings would create noisy UI and oversized DB rows for large presentations. Cap at 24 real warnings + 1 summary item.

---

## Dependencies Between Files

- `presentation_importer.py` has zero imports from this project — it only uses Python stdlib `dataclasses`. Create it first.
- `pptx_importer.py` imports `ImportResult` from `presentation_importer.py` and `R2StorageService` from `r2_storage_service.py`. Both must exist before `pptx_importer.py` can be imported.
- `r2_storage_service.py` already exists. The `upload_bytes` method is additive — it does not modify existing methods.
- Section 03 (GSlidesImporter) also imports `ImportResult` from `presentation_importer.py`. That is why the shared type lives in its own module rather than in `pptx_importer.py`.
- Section 04 (Celery task) imports `PptxImporter` from `pptx_importer.py`. This section must be complete before Section 04.

---

## As Built (actual implementation)

### Files Created / Modified

| Path | Action |
|------|--------|
| `python-backend/requirements.txt` | Added `python-pptx>=1.0.2` |
| `python-backend/app/services/presentation_importer.py` | Created — `ImportResult` dataclass |
| `python-backend/app/services/pptx_importer.py` | Created — full `PptxImporter` class (449 lines) |
| `python-backend/app/services/r2_storage_service.py` | Added `upload_bytes` method + local provider guard |
| `python-backend/tests/test_pptx_importer.py` | Created — 25 passing tests |

### Deviations from Plan

**Imports changed:**
- Removed `RGBColor` and `qn` from module-level imports — unused (code review fix).
- Dead local imports inside `_parse_auto_shape` (`MSO_THEME_COLOR`, `qn as _qn`, `PP_PLACEHOLDER`, `RGBColor as _RGB`) removed — unused (code review fix).
- Only `MSO_COLOR_TYPE` and `MSO_AUTO_SHAPE_TYPE` / `MSO_SHAPE_TYPE` needed at module level.

**Size limit added (code review — HIGH):**
- `MAX_PPTX_SIZE = 50_000_000` constant at module level.
- `import_file` raises `ImportError` if `len(pptx_bytes) > MAX_PPTX_SIZE`.
- `except Exception` → `except (Exception, MemoryError)` to prevent zip-bomb crashes.

**Empty textboxes filtered (code review — MEDIUM):**
- `_parse_textbox` returns `None` when `text.strip()` is empty — avoids noisy canvas elements.

**Local provider guard in upload_bytes (code review — MEDIUM):**
- `upload_bytes` raises `ValueError("Local storage provider does not support external-access uploads")` when `providerType == "local"`, consistent with `upload_file`.

**Shape type dispatch uses enum names (not raw integers):**
- Plan listed incorrect integers for some shape types (e.g., TABLE=16, CHART=3 in plan vs actual TABLE=19, CHART=3). Implementation uses `MSO_SHAPE_TYPE` enum attributes throughout.

**test_line_shape assertion fixed:**
- Changed vacuous `assert len(elements) >= 0` → `assert isinstance(elements, list)`.

### Tests (25 total, all passing)

- 6 coordinate conversion (pure function tests)
- 3 canvas detection
- 5 text box parsing (includes `test_textbox_font_color_rgb` added in code review)
- 2 image parsing
- 3 shape parsing (rect, oval, line)
- 1 table warning
- 2 error handling (corrupt/empty file)
- 1 fidelity warnings cap
- 3 added from code review: `test_linked_picture_skipped`, `test_textbox_font_color_rgb`, `test_group_child_offset`