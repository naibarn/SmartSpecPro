Now I have all the context I need. Let me generate the section content for `section-03-gslides-importer`.

# Section 03: Python — Google Slides Importer

## Overview

This section implements `python-backend/app/services/gslides_importer.py`, a service class that calls the Google Slides REST API, concurrently downloads all slide images (whose `contentUrl` values are short-lived), parses each `pageElement` into a `PresentationSlideContent` dict, and returns an `ImportResult`.

This section can be implemented in **parallel with Section 02 (PPTX Importer)**. It depends on `ImportResult` from `presentation_importer.py` (defined in Section 02) and the `upload_bytes` method on `R2StorageService` (also added in Section 02). Section 04 (Celery task) depends on this section.

---

## Dependencies

Before implementing this section, the following must exist:

- `python-backend/app/services/presentation_importer.py` — provides the `ImportResult` dataclass (from Section 02):
  ```python
  @dataclass
  class ImportResult:
      slides: list[dict]            # list of PresentationSlideContent dicts
      fidelity_warnings: list[str]  # capped at 25 items
  ```
- `python-backend/app/services/r2_storage_service.py` — the `R2StorageService` class must have an `upload_bytes(key: str, data: bytes, content_type: str) -> str` method added in Section 02.
- `python-backend/app/services/google_token_service.py` — already exists; `GoogleTokenService.get_valid_access_token(user_id)` is used by the Celery task (Section 04), not directly here. The `GSlidesImporter` receives an already-valid `access_token` string.
- `google-api-python-client` and `google-auth` packages — verify presence in `requirements.txt`. Add if missing.
- `httpx` — already present.

---

## Tests First

**File:** `python-backend/tests/test_gslides_importer.py`

Write these tests before implementing. All tests use `@pytest.mark.asyncio`. Mock `googleapiclient.discovery.build` to return a `MagicMock` with canned fixture JSON. Mock `httpx.AsyncClient` to return fake image bytes.

```python
"""
Tests for GSlidesImporter.

Mock targets:
  - googleapiclient.discovery.build  → MagicMock service with fixture JSON
  - httpx.AsyncClient                → fake image bytes (POST/GET)

Run: cd python-backend && uv run pytest tests/test_gslides_importer.py -v --cov=app
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# -- Canvas detection --------------------------------------------------------

@pytest.mark.asyncio
async def test_canvas_16x9_preset():
    """pageSize with 16:9 EMU dimensions → preset '16:9', 1280×720."""
    ...

@pytest.mark.asyncio
async def test_canvas_unknown_ratio():
    """Unknown ratio → natural px dimensions, preset is None."""
    ...

# -- Text extraction ---------------------------------------------------------

@pytest.mark.asyncio
async def test_textbox_concatenated_text():
    """TEXT_BOX shape with textElements → correct concatenated text string."""
    ...

@pytest.mark.asyncio
async def test_textbox_fontsize_pt_to_px():
    """textRun.style.fontSize.magnitude in PT converted to px via _pt_to_canvas_px."""
    ...

@pytest.mark.asyncio
async def test_textbox_rgb_float_to_hex():
    """rgbColor float values converted to correct hex string."""
    ...

@pytest.mark.asyncio
async def test_textbox_theme_color_fallback():
    """themeColor (absent rgbColor) → element color '#000000' + fidelityWarning emitted."""
    ...

# -- Shape types -------------------------------------------------------------

@pytest.mark.asyncio
async def test_rectangle_shape():
    """RECTANGLE shape → element type 'rect', solidFill color extracted."""
    ...

@pytest.mark.asyncio
async def test_ellipse_approximated():
    """ELLIPSE shape → element type 'rect' + fidelityWarning about approximation."""
    ...

@pytest.mark.asyncio
async def test_triangle_approximated():
    """TRIANGLE shape → element type 'rect' + fidelityWarning."""
    ...

# -- Image element -----------------------------------------------------------

@pytest.mark.asyncio
async def test_image_download_called():
    """_download_image called with contentUrl and access_token in Authorization header."""
    ...

@pytest.mark.asyncio
async def test_image_upload_called():
    """Downloaded bytes passed to r2_service.upload_bytes."""
    ...

@pytest.mark.asyncio
async def test_image_src_from_upload():
    """Element src equals upload result URL."""
    ...

@pytest.mark.asyncio
async def test_image_download_failure():
    """Failed image download (httpx error) → fidelityWarning emitted, element skipped."""
    ...

# -- Line element ------------------------------------------------------------

@pytest.mark.asyncio
async def test_line_stroke_color():
    """line.lineProperties.lineFill.solidFill.color.rgbColor → hex stroke color."""
    ...

@pytest.mark.asyncio
async def test_line_stroke_width():
    """line.lineProperties.weight.magnitude (EMU) → px strokeWidth."""
    ...

# -- Group element -----------------------------------------------------------

@pytest.mark.asyncio
async def test_group_child_offset():
    """Child element positions include group transform translateX/Y offset."""
    ...

# -- Non-uniform transform ---------------------------------------------------

@pytest.mark.asyncio
async def test_skew_detection():
    """Element with non-zero shearX emits fidelityWarning about skew."""
    ...

# -- Unsupported types -------------------------------------------------------

@pytest.mark.asyncio
async def test_table_skipped():
    """table element → fidelityWarning + skipped."""
    ...

@pytest.mark.asyncio
async def test_sheets_chart_skipped():
    """sheetsChart element → fidelityWarning + skipped."""
    ...

# -- fidelityWarnings cap ----------------------------------------------------

@pytest.mark.asyncio
async def test_fidelity_warnings_capped():
    """30 warnings → exactly 25 items in result, last is '... and N more warnings'."""
    ...

# -- Security: _download_image -----------------------------------------------

@pytest.mark.asyncio
async def test_download_image_rejects_non_https():
    """_download_image with non-HTTPS URL returns None without making HTTP request."""
    ...
```

Test command: `cd python-backend && uv run pytest tests/test_gslides_importer.py -v --cov=app`

---

## Implementation

### File to Create

`python-backend/app/services/gslides_importer.py`

### Required Packages

Verify `requirements.txt` contains (add if missing):
- `google-api-python-client>=2.0`
- `google-auth>=2.0`
- `httpx` (already present)

### Module-level Imports and Shared Preset Map

The file should import the same `PRESET_MAP`, `_emu_to_px`, and `_pt_to_canvas_px` helpers from `pptx_importer.py`, or define them locally. To avoid circular imports, define them locally in `gslides_importer.py` as well (they are pure functions). Use the identical `PRESET_MAP` dict:

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

### Data Types

```python
@dataclass
class ElementBounds:
    """Canvas-pixel bounding box for a pageElement."""
    x: int
    y: int
    width: int
    height: int
    rotation: float | None  # degrees; None if abs(angle) < 0.01
```

### GSlidesImporter Class Signature

```python
class GSlidesImporter:
    """
    Imports a Google Slides presentation into PresentationSlideContent dicts.

    The caller is responsible for supplying a valid access_token.
    This class does NOT handle token refresh — use GoogleTokenService first.

    Args:
        access_token: A valid Google OAuth access token with drive.readonly scope.
        r2_service: The module-level R2StorageService singleton.
    """

    def __init__(self, access_token: str, r2_service: "R2StorageService") -> None:
        ...

    async def import_presentation(self, presentation_id: str, s3_prefix: str) -> ImportResult:
        """
        Fetch and convert a Google Slides presentation.

        Args:
            presentation_id: The Google Slides presentation ID (from URL).
            s3_prefix: S3 key prefix for uploaded images,
                       e.g. '{tenant_id}/presentations/imports/{conversion_id}'.

        Returns:
            ImportResult with slide dicts and capped fidelity_warnings.

        Raises:
            googleapiclient.errors.HttpError: On API errors (e.g. 403 forbidden).
        """
        ...
```

### Internal Service Build

Build the Google Slides API service inside `__init__`:

```python
import google.oauth2.credentials
import googleapiclient.discovery

credentials = google.oauth2.credentials.Credentials(token=access_token)
self._slides_service = googleapiclient.discovery.build(
    "slides", "v1", credentials=credentials
)
```

### import_presentation Logic

The method must follow this order:

1. Call `self._slides_service.presentations().get(presentationId=presentation_id).execute()` to get the full presentation JSON.

2. **Front-load all image downloads** before any other processing. Collect every `contentUrl` from every `pageElement` across all slides that has `"image"` key. Build a mapping `{objectId: bytes | None}`. Download all concurrently with `asyncio.gather`. This is mandatory because `contentUrl` values are short-lived Google-signed URLs that expire within minutes to hours.

3. Detect canvas size from `presentation["pageSize"]["width"]` and `presentation["pageSize"]["height"]` (both have `magnitude` and `unit` fields — unit will be `"EMU"`). Compute `round(page_width_emu / page_height_emu, 3)` and look up in `PRESET_MAP`. If found: use preset width/height. If not: use `round(_emu_to_px(page_width_emu))` and `round(_emu_to_px(page_height_emu))`.

4. Compute scale factors:
   ```python
   canvas_scale_x = canvas_px_width / _emu_to_px(page_width_emu)
   canvas_scale_y = canvas_px_height / _emu_to_px(page_height_emu)
   ```

5. Iterate `presentation["slides"]`, call `_parse_page(page, canvas, downloaded_images, s3_prefix, page_index+1)` for each.

6. Cap warnings at 25: if `len(all_warnings) > 25`, keep first 24 and append `f"... and {len(all_warnings) - 24} more warnings"`.

7. Return `ImportResult(slides=slides, fidelity_warnings=capped_warnings)`.

### Image Pre-Download

```python
async def _prefetch_images(
    self,
    presentation: dict,
    access_token: str,
) -> dict[str, bytes | None]:
    """
    Concurrently download all contentUrls across all slides.
    Returns a dict mapping objectId → bytes (or None on failure).
    """
    ...
```

Collect all `(objectId, contentUrl)` pairs where a `pageElement` contains an `"image"` key with a `"contentUrl"`. Then run `asyncio.gather(*[_download_image(url, access_token) for url in urls])`.

### Image Download Helper

```python
async def _download_image(url: str, access_token: str) -> bytes | None:
    """
    Download a GSlides contentUrl.

    Security: rejects non-HTTPS URLs without making an HTTP request.
    Returns None on any httpx.HTTPError.
    """
```

- Validate `url.startswith("https://")` — return `None` immediately if not.
- Use `httpx.AsyncClient` with `Authorization: Bearer {access_token}`, `follow_redirects=True`, `timeout=30.0`.
- Return `None` on `httpx.HTTPError`. Do NOT log the URL (it contains embedded credentials).

### Position and Size Extraction

```python
def _extract_bounds(
    self,
    element: dict,
    canvas_scale_x: float,
    canvas_scale_y: float,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> ElementBounds:
    """
    Extract canvas-pixel bounding box from a pageElement.

    'transform' AffineTransform: translateX/Y are in EMU.
    'size': width/height have magnitude (EMU) and unit ('EMU').
    Rotation: math.degrees(math.atan2(shearY, scaleX)).
    """
```

- `translate_x = transform.get("translateX", 0.0)` — in EMU
- `translate_y = transform.get("translateY", 0.0)` — in EMU
- Canvas x = `round((_emu_to_px(translate_x) + offset_x) * canvas_scale_x)`
- Canvas y = `round((_emu_to_px(translate_y) + offset_y) * canvas_scale_y)`
- Width = `round(_emu_to_px(size_width_emu) * canvas_scale_x)`
- Height = `round(_emu_to_px(size_height_emu) * canvas_scale_y)`
- Rotation = `math.degrees(math.atan2(transform.get("shearY", 0.0), transform.get("scaleX", 1.0)))` — set to `None` if `abs(rotation) < 0.01`

### Non-uniform Transform Detection

After extracting bounds, check: `if abs(transform.get("shearX", 0.0)) > 0.01:` → append fidelityWarning `f"Slide {page_num}: Element has skew transform — rendered as bounding box"`. Still produce the element using the bounding box.

### _parse_page Logic

```python
def _parse_page(
    self,
    page: dict,
    canvas: dict,
    downloaded_images: dict[str, bytes | None],
    s3_prefix: str,
    page_num: int,
) -> tuple[dict, list[str]]:
    """
    Parse a single slide page into a PresentationSlideContent dict.

    Returns (slide_dict, warnings_for_this_slide).
    """
```

Iterates `page.get("pageElements", [])`. For each element, dispatches on which sub-key is present:

**`"shape"` key:**
- Get `shape_type = element["shape"]["shapeType"]`
- `"TEXT_BOX"` → produce `text` element (see below)
- `"RECTANGLE"` → produce `rect` element (see below)
- All other shapeTypes (e.g. `"ELLIPSE"`, `"TRIANGLE"`, `"ROUND_RECTANGLE"`) → produce `rect` element using bounding box + append fidelityWarning `f"Slide {page_num}: {shape_type} approximated as rectangle"`

**`"image"` key:**
- Look up `downloaded_images[element["objectId"]]`
- If `None`: append fidelityWarning `f"Slide {page_num}: Image download failed — skipped"`. Skip.
- If bytes: upload via `await self._r2_service.upload_bytes(f"{s3_prefix}/images/{uuid4()}.jpg", image_bytes, "image/jpeg")`. Produce `image` element with `src = upload_url`.

**`"line"` key:**
- Extract stroke color and width (see below). Produce `line` element.

**`"table"` key:**
- Append fidelityWarning `f"Slide {page_num}: Table dropped (not supported)"`. Skip.

**`"sheetsChart"` key:**
- Append fidelityWarning `f"Slide {page_num}: Chart dropped (not supported)"`. Skip.

**`"wordArt"` key:**
- Extract `element["wordArt"].get("renderedText", "")`. Produce `text` element. Append fidelityWarning `f"Slide {page_num}: WordArt decoration lost — text preserved"`.

**`"video"` key:**
- Extract source URL from `element["video"].get("url", "")`. Produce `video` element: `{"type": "video", "src": url, **bounds_dict}`. Append fidelityWarning `f"Slide {page_num}: Video element may not play in presentation editor"`.

**`"group"` key:**
- Get group's transform offset (translateX/Y in EMU → canvas px via scale factors). Recurse `_parse_elements(group_children, canvas, downloaded_images, s3_prefix, page_num, offset_x=group_x_px, offset_y=group_y_px)`.

### Text Element Extraction

From `shape["text"]["textElements"]`:
- Iterate elements; accumulate text by collecting `textRun["content"]` strings, inserting `"\n"` at each `"paragraphMarker"`.
- Cap total text at 10,000 characters.
- Use the first `textRun`'s style for element-level style:
  - Color: `textRun["style"]["foregroundColor"]["opaqueColor"]["rgbColor"]` → `rgb_float_to_hex()`. If `rgbColor` absent (themeColor): use `"#000000"` + fidelityWarning.
  - Font size: `textRun["style"]["fontSize"]["magnitude"]` (PT unit) → `_pt_to_canvas_px()`.

### Rectangle Element Extraction

From `shape["shapeProperties"]["shapeBackgroundFill"]["solidFill"]["color"]["rgbColor"]`:
- `fill = rgb_float_to_hex(rgb_color_dict)`. If `rgbColor` absent (themeColor): `fill = "#cccccc"` + fidelityWarning.
- Element dict: `{"type": "rect", "x": bounds.x, "y": bounds.y, "width": bounds.width, "height": bounds.height, "fill": fill}`

### Line Element Extraction

From `element["line"]`:
- Stroke color: `element["line"]["lineProperties"]["lineFill"]["solidFill"]["color"]["rgbColor"]` → `rgb_float_to_hex()`. Default to `"#000000"` if absent.
- Stroke width: `element["line"]["lineProperties"]["weight"]["magnitude"]` (EMU) → `round(_emu_to_px(magnitude))`. Default to `1` if absent.
- Element dict: `{"type": "line", "x": bounds.x, "y": bounds.y, "width": bounds.width, "height": bounds.height, "stroke": color, "strokeWidth": width}`

### Color Conversion

```python
def rgb_float_to_hex(color: dict) -> str:
    """
    Convert Google Slides float RGB dict to '#RRGGBB' hex string.

    Google encodes RGB as floats 0.0–1.0. Missing keys default to 0.0.
    Example: {"red": 1.0, "green": 0.5, "blue": 0.0} → "#ff8000"
    """
    r = round(color.get("red", 0.0) * 255)
    g = round(color.get("green", 0.0) * 255)
    b = round(color.get("blue", 0.0) * 255)
    return f"#{r:02x}{g:02x}{b:02x}"
```

### Unit Handling — Critical Detail

All `Dimension` values in the API response use `unit: "EMU"` **except** `textRun.style.fontSize` which uses `unit: "PT"`. The code must use the `unit` field and apply the appropriate conversion:
- `"EMU"`: `emu / (914400 / 96)` — same as `_emu_to_px()`
- `"PT"`: `max(8, min(512, round(pt * 4/3)))` — same as `_pt_to_canvas_px()`

### Pure Helper Functions

These are identical in signature to the PPTX importer helpers:

```python
def _emu_to_px(emu: float, dpi: int = 96) -> float:
    """Convert EMU to pixels at the given DPI. 914400 EMU = 1 inch."""
    return emu * dpi / 914_400

def _pt_to_canvas_px(pt: float) -> int:
    """Convert font size in points to canvas pixels, clamped 8–512."""
    return max(8, min(512, round(pt * 4 / 3)))
```

### fidelityWarnings Cap

After collecting all warnings from all slides, apply the same truncation rule as the PPTX importer:

```python
if len(all_warnings) > 25:
    overflow = len(all_warnings) - 24
    all_warnings = all_warnings[:24] + [f"... and {overflow} more warnings"]
```

---

## Security Constraints

- **Never log the `contentUrl`** — it contains embedded Google-signed credentials.
- **Never log the `access_token`** at any level.
- In `_download_image`, validate `url.startswith("https://")` before issuing any HTTP request. Return `None` for non-HTTPS URLs.
- The `access_token` is received by this class as a parameter. It is the Celery task's responsibility (Section 04) to retrieve it via `GoogleTokenService.get_valid_access_token(user_id)`. This class never stores or refreshes tokens.
- The `DRIVE_SCOPES` in `google_token_service.py` already include `drive.readonly`. No additional scope is required for Google Slides API access.

---

## File Summary

| File | Action |
|------|--------|
| `python-backend/app/services/gslides_importer.py` | Create (new) |
| `python-backend/tests/test_gslides_importer.py` | Create (new) |
| `python-backend/requirements.txt` | Verified: `google-api-python-client>=2.100.0`, `google-auth>=2.23.0` already present |

---

## Implementation Notes (Actual vs Planned)

### Deviations from plan

1. **`asyncio.to_thread` for `.execute()`** — The synchronous `googleapiclient` `.execute()` call is wrapped with `await asyncio.to_thread(request.execute)` to avoid blocking the asyncio event loop. The spec did not mention this but it is required for correct async behavior.

2. **`static_discovery=True` in build** — Added to `googleapiclient.discovery.build()` to prevent a blocking discovery-document HTTP fetch in `__init__`. Uses bundled local discovery doc.

3. **`_collect_image_urls` helper** — Added a recursive helper to collect `(objectId, contentUrl)` pairs from both top-level elements and `elementGroup.children`. The spec said "collect every contentUrl across all slides" but the original `_prefetch_images` only scanned top-level elements, missing images in groups.

4. **`asyncio.Semaphore(10)`** — Added to cap concurrent image downloads at 10 (decided with user) to prevent FD exhaustion and API rate limiting.

5. **Video URL HTTPS validation** — Video URLs are validated for HTTPS before storage. Non-HTTPS URLs result in `src: ""` and a security fidelity warning.

6. **WordArt warning ordering** — Warning text differs based on whether text was preserved: "WordArt decoration lost — text preserved" (when text exists) vs "WordArt element dropped (no renderedText)" (when empty).

7. **`_parse_line_element` signature** — Added `page_num: int` parameter (not in spec) and changed return type to `tuple[dict, list[str]]` to be consistent with other parse methods.

8. **Removed bare `except: pass`** — The `_parse_rect_element` and `_parse_line_element` methods no longer use bare exception handlers. Color/width parsing flows without try/except since the data path is well-defined.

9. **`Optional[X]` → `X | None`** — Updated to modern Python 3.10+ union syntax throughout.

### Test count

28 tests implemented (23 planned + 5 added for review findings):
- `test_group_child_image_prefetched` — H2 regression test for grouped image pre-fetch
- `test_wordart_element` — wordArt with text
- `test_wordart_empty_text` — wordArt with empty text (different warning)
- `test_video_element` — video with HTTPS URL
- `test_video_non_https_url` — video with non-HTTPS URL rejected