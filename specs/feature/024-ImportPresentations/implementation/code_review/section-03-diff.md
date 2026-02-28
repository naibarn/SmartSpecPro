diff --git a/python-backend/app/services/gslides_importer.py b/python-backend/app/services/gslides_importer.py
new file mode 100644
index 0000000..8e9fb70
--- /dev/null
+++ b/python-backend/app/services/gslides_importer.py
@@ -0,0 +1,582 @@
+"""
+Google Slides Importer — converts a Google Slides presentation into PresentationSlideContent dicts.
+
+Calls the Google Slides REST API, concurrently downloads all slide images
+(whose contentUrl values are short-lived), parses each pageElement into a
+PresentationSlideContent dict, and returns an ImportResult.
+
+Security constraints:
+  - Never logs contentUrl (contains embedded Google-signed credentials)
+  - Never logs access_token
+  - _download_image validates HTTPS before issuing any HTTP request
+  - access_token is received as a parameter; token refresh is the caller's responsibility
+"""
+import asyncio
+import math
+from dataclasses import dataclass
+from typing import Optional
+from uuid import uuid4
+
+import httpx
+import google.oauth2.credentials
+import googleapiclient.discovery
+
+from app.services.presentation_importer import ImportResult
+from app.services.r2_storage_service import R2StorageService
+
+# Aspect ratio preset map: round(width/height, 3) → (label, canvas_width, canvas_height)
+PRESET_MAP: dict[float, tuple[str, int, int]] = {
+    1.778: ("16:9", 1280, 720),
+    0.563: ("9:16", 720, 1280),
+    1.333: ("4:3", 1024, 768),
+    0.75: ("3:4", 768, 1024),
+    0.8: ("4:5", 960, 1200),
+    1.25: ("5:4", 1250, 1000),
+    1.0: ("1:1", 1080, 1080),
+}
+
+
+@dataclass
+class ElementBounds:
+    """Canvas-pixel bounding box for a pageElement."""
+
+    x: int
+    y: int
+    width: int
+    height: int
+    rotation: Optional[float]  # degrees; None if abs(angle) < 0.01
+
+
+# ---------------------------------------------------------------------------
+# Pure helper functions
+# ---------------------------------------------------------------------------
+
+
+def _emu_to_px(emu: float, dpi: int = 96) -> float:
+    """Convert EMU (English Metric Units) to pixels at the given DPI.
+
+    1 inch = 914400 EMU = dpi pixels.
+    """
+    return emu * dpi / 914_400
+
+
+def _pt_to_canvas_px(pt: float) -> int:
+    """Convert font size in points to canvas pixels, clamped to [8, 512]."""
+    return max(8, min(512, round(pt * 4 / 3)))
+
+
+def _cap_warnings(warnings: list[str]) -> list[str]:
+    """Cap warnings list at 25 items with a summary item if truncated."""
+    if len(warnings) <= 25:
+        return warnings
+    overflow = len(warnings) - 24
+    return warnings[:24] + [f"... and {overflow} more warnings"]
+
+
+def rgb_float_to_hex(color: dict) -> str:
+    """Convert Google Slides float RGB dict to '#RRGGBB' hex string.
+
+    Google encodes RGB as floats 0.0–1.0. Missing keys default to 0.0.
+    Example: {"red": 1.0, "green": 0.5, "blue": 0.0} → "#ff8000"
+    """
+    r = round(color.get("red", 0.0) * 255)
+    g = round(color.get("green", 0.0) * 255)
+    b = round(color.get("blue", 0.0) * 255)
+    return f"#{r:02x}{g:02x}{b:02x}"
+
+
+async def _download_image(url: str, access_token: str) -> Optional[bytes]:
+    """Download a GSlides contentUrl.
+
+    Security: rejects non-HTTPS URLs without making an HTTP request.
+    Returns None on any httpx.HTTPError. Does NOT log the URL (contains embedded credentials).
+    """
+    if not url.startswith("https://"):
+        return None
+    try:
+        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
+            response = await client.get(
+                url,
+                headers={"Authorization": f"Bearer {access_token}"},
+            )
+            response.raise_for_status()
+            return response.content
+    except httpx.HTTPError:
+        return None
+
+
+# ---------------------------------------------------------------------------
+# GSlidesImporter class
+# ---------------------------------------------------------------------------
+
+
+class GSlidesImporter:
+    """Imports a Google Slides presentation into PresentationSlideContent dicts.
+
+    The caller is responsible for supplying a valid access_token.
+    This class does NOT handle token refresh — use GoogleTokenService first.
+
+    Args:
+        access_token: A valid Google OAuth access token with drive.readonly scope.
+        r2_service: The module-level R2StorageService singleton.
+    """
+
+    def __init__(self, access_token: str, r2_service: R2StorageService) -> None:
+        self._access_token = access_token
+        self._r2_service = r2_service
+        credentials = google.oauth2.credentials.Credentials(token=access_token)
+        self._slides_service = googleapiclient.discovery.build(
+            "slides", "v1", credentials=credentials
+        )
+
+    async def import_presentation(self, presentation_id: str, s3_prefix: str) -> ImportResult:
+        """Fetch and convert a Google Slides presentation.
+
+        Args:
+            presentation_id: The Google Slides presentation ID (from URL).
+            s3_prefix: S3 key prefix for uploaded images,
+                       e.g. '{tenant_id}/presentations/imports/{conversion_id}'.
+
+        Returns:
+            ImportResult with slide dicts and capped fidelity_warnings.
+
+        Raises:
+            googleapiclient.errors.HttpError: On API errors (e.g. 403 forbidden).
+        """
+        # 1. Fetch full presentation JSON
+        presentation = (
+            self._slides_service.presentations()
+            .get(presentationId=presentation_id)
+            .execute()
+        )
+
+        # 2. Front-load all image downloads before any other processing.
+        #    contentUrl values are short-lived Google-signed URLs.
+        downloaded_images = await self._prefetch_images(presentation, self._access_token)
+
+        # 3. Detect canvas size from pageSize
+        page_size = presentation["pageSize"]
+        page_width_emu = page_size["width"]["magnitude"]
+        page_height_emu = page_size["height"]["magnitude"]
+        ratio = round(page_width_emu / page_height_emu, 3)
+
+        if ratio in PRESET_MAP:
+            preset_label, canvas_px_width, canvas_px_height = PRESET_MAP[ratio]
+        else:
+            preset_label = None
+            canvas_px_width = round(_emu_to_px(page_width_emu))
+            canvas_px_height = round(_emu_to_px(page_height_emu))
+
+        # 4. Compute scale factors
+        canvas_scale_x = canvas_px_width / _emu_to_px(page_width_emu)
+        canvas_scale_y = canvas_px_height / _emu_to_px(page_height_emu)
+
+        canvas = {
+            "preset": preset_label,
+            "width": canvas_px_width,
+            "height": canvas_px_height,
+            "scale_x": canvas_scale_x,
+            "scale_y": canvas_scale_y,
+        }
+
+        # 5. Parse each slide
+        all_slides: list[dict] = []
+        all_warnings: list[str] = []
+
+        for page_index, page in enumerate(presentation.get("slides", [])):
+            slide_dict, warnings = await self._parse_page(
+                page, canvas, downloaded_images, s3_prefix, page_index + 1
+            )
+            all_slides.append(slide_dict)
+            all_warnings.extend(warnings)
+
+        # 6. Cap warnings at 25 and return
+        return ImportResult(
+            slides=all_slides,
+            fidelity_warnings=_cap_warnings(all_warnings),
+        )
+
+    async def _prefetch_images(
+        self,
+        presentation: dict,
+        access_token: str,
+    ) -> dict[str, Optional[bytes]]:
+        """Concurrently download all contentUrls across all slides.
+
+        Returns a dict mapping objectId → bytes (or None on failure).
+        """
+        image_pairs: list[tuple[str, str]] = []  # (objectId, contentUrl)
+
+        for slide in presentation.get("slides", []):
+            for element in slide.get("pageElements", []):
+                if "image" in element:
+                    content_url = element["image"].get("contentUrl", "")
+                    if content_url:
+                        image_pairs.append((element["objectId"], content_url))
+
+        if not image_pairs:
+            return {}
+
+        object_ids = [pair[0] for pair in image_pairs]
+        urls = [pair[1] for pair in image_pairs]
+
+        downloaded = await asyncio.gather(
+            *[_download_image(url, access_token) for url in urls]
+        )
+
+        return dict(zip(object_ids, downloaded))
+
+    def _extract_bounds(
+        self,
+        element: dict,
+        canvas_scale_x: float,
+        canvas_scale_y: float,
+        offset_x: float = 0.0,  # in natural pixels
+        offset_y: float = 0.0,  # in natural pixels
+    ) -> ElementBounds:
+        """Extract canvas-pixel bounding box from a pageElement.
+
+        'transform' AffineTransform: translateX/Y are in EMU.
+        'size': width/height have magnitude (EMU) and unit ('EMU').
+        Rotation: math.degrees(math.atan2(shearY, scaleX)).
+
+        offset_x/offset_y are in natural pixels (from parent group translate).
+        """
+        transform = element.get("transform", {})
+        size = element.get("size", {})
+
+        translate_x = transform.get("translateX", 0.0)
+        translate_y = transform.get("translateY", 0.0)
+        size_width_emu = size.get("width", {}).get("magnitude", 0.0)
+        size_height_emu = size.get("height", {}).get("magnitude", 0.0)
+
+        x = round((_emu_to_px(translate_x) + offset_x) * canvas_scale_x)
+        y = round((_emu_to_px(translate_y) + offset_y) * canvas_scale_y)
+        width = round(_emu_to_px(size_width_emu) * canvas_scale_x)
+        height = round(_emu_to_px(size_height_emu) * canvas_scale_y)
+
+        # Rotation from affine transform
+        shear_y = transform.get("shearY", 0.0)
+        scale_x = transform.get("scaleX", 1.0)
+        rotation_deg = math.degrees(math.atan2(shear_y, scale_x))
+        rotation: Optional[float] = None if abs(rotation_deg) < 0.01 else rotation_deg
+
+        return ElementBounds(x=x, y=y, width=width, height=height, rotation=rotation)
+
+    async def _parse_page(
+        self,
+        page: dict,
+        canvas: dict,
+        downloaded_images: dict[str, Optional[bytes]],
+        s3_prefix: str,
+        page_num: int,
+    ) -> tuple[dict, list[str]]:
+        """Parse a single slide page into a PresentationSlideContent dict.
+
+        Returns (slide_dict, warnings_for_this_slide).
+        """
+        elements, warnings = await self._parse_elements(
+            page.get("pageElements", []),
+            canvas,
+            downloaded_images,
+            s3_prefix,
+            page_num,
+            offset_x=0.0,
+            offset_y=0.0,
+        )
+
+        slide_dict = {
+            "canvasPreset": canvas["preset"],
+            "canvasWidth": canvas["width"],
+            "canvasHeight": canvas["height"],
+            "elements": elements,
+        }
+
+        return slide_dict, warnings
+
+    async def _parse_elements(
+        self,
+        page_elements: list[dict],
+        canvas: dict,
+        downloaded_images: dict[str, Optional[bytes]],
+        s3_prefix: str,
+        page_num: int,
+        offset_x: float = 0.0,  # in natural pixels
+        offset_y: float = 0.0,  # in natural pixels
+    ) -> tuple[list[dict], list[str]]:
+        """Parse a list of pageElements into element dicts."""
+        elements: list[dict] = []
+        warnings: list[str] = []
+
+        canvas_scale_x = canvas["scale_x"]
+        canvas_scale_y = canvas["scale_y"]
+
+        for element in page_elements:
+            transform = element.get("transform", {})
+            bounds = self._extract_bounds(
+                element, canvas_scale_x, canvas_scale_y, offset_x, offset_y
+            )
+
+            # Non-uniform skew check
+            shear_x = transform.get("shearX", 0.0)
+            if abs(shear_x) > 0.01:
+                warnings.append(
+                    f"Slide {page_num}: Element has skew transform — rendered as bounding box"
+                )
+
+            if "shape" in element:
+                shape = element["shape"]
+                shape_type = shape.get("shapeType", "")
+
+                if shape_type == "TEXT_BOX":
+                    elem, warns = self._parse_text_element(shape, bounds, page_num)
+                    if elem:
+                        elements.append(elem)
+                    warnings.extend(warns)
+
+                elif shape_type == "RECTANGLE":
+                    elem, warns = self._parse_rect_element(shape, bounds, page_num)
+                    elements.append(elem)
+                    warnings.extend(warns)
+
+                else:
+                    # All other shapes: approximate as rectangle + warning
+                    warnings.append(
+                        f"Slide {page_num}: {shape_type} approximated as rectangle"
+                    )
+                    elem, warns = self._parse_rect_element(shape, bounds, page_num)
+                    elements.append(elem)
+                    warnings.extend(warns)
+
+            elif "image" in element:
+                elem, warns = await self._parse_image_element(
+                    element, bounds, downloaded_images, s3_prefix, page_num
+                )
+                if elem:
+                    elements.append(elem)
+                warnings.extend(warns)
+
+            elif "line" in element:
+                elem = self._parse_line_element(element, bounds)
+                elements.append(elem)
+
+            elif "table" in element:
+                warnings.append(f"Slide {page_num}: Table dropped (not supported)")
+
+            elif "sheetsChart" in element:
+                warnings.append(f"Slide {page_num}: Chart dropped (not supported)")
+
+            elif "wordArt" in element:
+                text_content = element["wordArt"].get("renderedText", "")
+                warnings.append(
+                    f"Slide {page_num}: WordArt decoration lost — text preserved"
+                )
+                if text_content:
+                    elements.append(
+                        {
+                            "type": "text",
+                            "x": bounds.x,
+                            "y": bounds.y,
+                            "width": bounds.width,
+                            "height": bounds.height,
+                            "content": text_content,
+                            "style": {},
+                        }
+                    )
+
+            elif "video" in element:
+                url = element["video"].get("url", "")
+                warnings.append(
+                    f"Slide {page_num}: Video element may not play in presentation editor"
+                )
+                elements.append(
+                    {
+                        "type": "video",
+                        "src": url,
+                        "x": bounds.x,
+                        "y": bounds.y,
+                        "width": bounds.width,
+                        "height": bounds.height,
+                    }
+                )
+
+            elif "elementGroup" in element:
+                # Group: recurse with parent offset in natural pixels
+                group_x_natural = _emu_to_px(transform.get("translateX", 0.0))
+                group_y_natural = _emu_to_px(transform.get("translateY", 0.0))
+                group_children = element["elementGroup"].get("children", [])
+                child_elems, child_warns = await self._parse_elements(
+                    group_children,
+                    canvas,
+                    downloaded_images,
+                    s3_prefix,
+                    page_num,
+                    offset_x=offset_x + group_x_natural,
+                    offset_y=offset_y + group_y_natural,
+                )
+                elements.extend(child_elems)
+                warnings.extend(child_warns)
+
+        return elements, warnings
+
+    def _parse_text_element(
+        self,
+        shape: dict,
+        bounds: ElementBounds,
+        page_num: int,
+    ) -> tuple[Optional[dict], list[str]]:
+        """Parse a TEXT_BOX shape into a text element dict."""
+        warnings: list[str] = []
+        text_content_obj = shape.get("text", {})
+        text_elements = text_content_obj.get("textElements", [])
+
+        parts: list[str] = []
+        first_run_style: dict = {}
+        first_run_found = False
+
+        for text_elem in text_elements:
+            if "paragraphMarker" in text_elem:
+                if parts:
+                    parts.append("\n")
+            elif "textRun" in text_elem:
+                run = text_elem["textRun"]
+                content = run.get("content", "")
+                parts.append(content)
+
+                if not first_run_found:
+                    first_run_found = True
+                    style = run.get("style", {})
+                    fg_color = (
+                        style.get("foregroundColor", {}).get("opaqueColor", {})
+                    )
+                    rgb_color = fg_color.get("rgbColor")
+
+                    if rgb_color is not None:
+                        first_run_style["color"] = rgb_float_to_hex(rgb_color)
+                    else:
+                        first_run_style["color"] = "#000000"
+                        warnings.append(
+                            f"Slide {page_num}: Text color uses theme color — defaulted to #000000"
+                        )
+
+                    font_size = style.get("fontSize", {})
+                    magnitude = font_size.get("magnitude", 0)
+                    if magnitude:
+                        first_run_style["fontSize"] = _pt_to_canvas_px(magnitude)
+
+        text = "".join(parts)[:10_000]
+
+        if not text.strip():
+            return None, warnings
+
+        return {
+            "type": "text",
+            "x": bounds.x,
+            "y": bounds.y,
+            "width": bounds.width,
+            "height": bounds.height,
+            "content": text,
+            "style": first_run_style,
+        }, warnings
+
+    def _parse_rect_element(
+        self,
+        shape: dict,
+        bounds: ElementBounds,
+        page_num: int,
+    ) -> tuple[dict, list[str]]:
+        """Parse a rect/shape element into a rect dict."""
+        warnings: list[str] = []
+
+        fill = "#cccccc"
+        try:
+            bg_fill = (
+                shape.get("shapeProperties", {})
+                .get("shapeBackgroundFill", {})
+                .get("solidFill", {})
+                .get("color", {})
+            )
+            rgb_color = bg_fill.get("rgbColor")
+            if rgb_color is not None:
+                fill = rgb_float_to_hex(rgb_color)
+            elif bg_fill.get("themeColor"):
+                warnings.append(
+                    f"Slide {page_num}: Shape fill uses theme color — defaulted to #cccccc"
+                )
+        except Exception:
+            pass
+
+        return {
+            "type": "rect",
+            "x": bounds.x,
+            "y": bounds.y,
+            "width": bounds.width,
+            "height": bounds.height,
+            "fill": fill,
+        }, warnings
+
+    async def _parse_image_element(
+        self,
+        element: dict,
+        bounds: ElementBounds,
+        downloaded_images: dict[str, Optional[bytes]],
+        s3_prefix: str,
+        page_num: int,
+    ) -> tuple[Optional[dict], list[str]]:
+        """Parse an image element: look up pre-downloaded bytes, upload to R2."""
+        warnings: list[str] = []
+        object_id = element.get("objectId", "")
+        image_bytes = downloaded_images.get(object_id)
+
+        if image_bytes is None:
+            warnings.append(f"Slide {page_num}: Image download failed — skipped")
+            return None, warnings
+
+        key = f"{s3_prefix}/images/{uuid4()}.jpg"
+        upload_url = await self._r2_service.upload_bytes(key, image_bytes, "image/jpeg")
+
+        return {
+            "type": "image",
+            "x": bounds.x,
+            "y": bounds.y,
+            "width": bounds.width,
+            "height": bounds.height,
+            "src": upload_url,
+        }, warnings
+
+    def _parse_line_element(self, element: dict, bounds: ElementBounds) -> dict:
+        """Parse a line element into a line dict."""
+        line = element.get("line", {})
+        line_props = line.get("lineProperties", {})
+
+        stroke = "#000000"
+        try:
+            rgb_color = (
+                line_props.get("lineFill", {})
+                .get("solidFill", {})
+                .get("color", {})
+                .get("rgbColor")
+            )
+            if rgb_color is not None:
+                stroke = rgb_float_to_hex(rgb_color)
+        except Exception:
+            pass
+
+        stroke_width = 1
+        try:
+            weight = line_props.get("weight", {})
+            magnitude = weight.get("magnitude")
+            if magnitude is not None:
+                stroke_width = round(_emu_to_px(magnitude))
+        except Exception:
+            pass
+
+        return {
+            "type": "line",
+            "x": bounds.x,
+            "y": bounds.y,
+            "width": bounds.width,
+            "height": bounds.height,
+            "stroke": stroke,
+            "strokeWidth": stroke_width,
+        }
diff --git a/python-backend/tests/test_gslides_importer.py b/python-backend/tests/test_gslides_importer.py
new file mode 100644
index 0000000..53bbba9
--- /dev/null
+++ b/python-backend/tests/test_gslides_importer.py
@@ -0,0 +1,790 @@
+"""
+Tests for GSlidesImporter — section 03 of the Import Presentations feature.
+
+Mock targets:
+  - googleapiclient.discovery.build  → MagicMock service with fixture JSON
+  - httpx.AsyncClient                → fake image bytes
+
+Run: cd python-backend && uv run pytest tests/test_gslides_importer.py -v --cov=app
+"""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch, call
+import httpx
+
+# ---------------------------------------------------------------------------
+# Constants
+# ---------------------------------------------------------------------------
+
+# 16:9 ratio: 9144000 / 5143500 = 1.778 → preset "16:9", 1280×720
+EMU_16_9_W = 9_144_000
+EMU_16_9_H = 5_143_500
+
+# Unknown ratio: 10000000 / 5000000 = 2.0 → no preset, natural px
+EMU_UNKNOWN_W = 10_000_000
+EMU_UNKNOWN_H = 5_000_000
+
+MOCK_UPLOAD_URL = "https://cdn.example.com/test.jpg"
+FAKE_IMAGE_BYTES = b"fake_image_data"
+
+
+# ---------------------------------------------------------------------------
+# Helpers
+# ---------------------------------------------------------------------------
+
+
+@pytest.fixture
+def mock_r2():
+    """Returns a mock R2StorageService with upload_bytes pre-patched."""
+    svc = MagicMock()
+    svc.upload_bytes = AsyncMock(return_value=MOCK_UPLOAD_URL)
+    return svc
+
+
+def _minimal_presentation(width_emu=EMU_16_9_W, height_emu=EMU_16_9_H, slides=None):
+    """Build a minimal Google Slides presentation dict."""
+    return {
+        "presentationId": "test_pres_id",
+        "pageSize": {
+            "width": {"magnitude": width_emu, "unit": "EMU"},
+            "height": {"magnitude": height_emu, "unit": "EMU"},
+        },
+        "slides": slides or [],
+    }
+
+
+def _make_importer(mock_r2, presentation_fixture):
+    """Create GSlidesImporter with mocked Google API build; returns (importer, mock_service)."""
+    mock_service = MagicMock()
+    mock_service.presentations.return_value.get.return_value.execute.return_value = (
+        presentation_fixture
+    )
+    with patch("googleapiclient.discovery.build") as mock_build:
+        mock_build.return_value = mock_service
+        from app.services.gslides_importer import GSlidesImporter
+
+        importer = GSlidesImporter(access_token="fake_token", r2_service=mock_r2)
+    # patch only needed during __init__; _slides_service is already set to mock_service
+    return importer, mock_service
+
+
+def _one_slide(page_elements=None):
+    """Return a slides list with one slide containing the given elements."""
+    return [{"objectId": "slide1", "pageElements": page_elements or []}]
+
+
+def _text_element(
+    object_id="elem1",
+    translate_x=0.0,
+    translate_y=0.0,
+    width=2_286_000,
+    height=1_143_000,
+    text_runs=None,
+    shear_x=0.0,
+):
+    """Build a TEXT_BOX pageElement dict."""
+    text_elements = []
+    for run in (text_runs or [{"content": "Hello", "color": {"red": 0.0}, "font_size_pt": 24}]):
+        text_elements.append({"paragraphMarker": {}})
+        style = {
+            "foregroundColor": {
+                "opaqueColor": {
+                    "rgbColor": run.get("color", {"red": 0.0, "green": 0.0, "blue": 0.0})
+                }
+            },
+            "fontSize": {"magnitude": run.get("font_size_pt", 24), "unit": "PT"},
+        }
+        text_elements.append({"textRun": {"content": run["content"], "style": style}})
+    return {
+        "objectId": object_id,
+        "size": {
+            "width": {"magnitude": width, "unit": "EMU"},
+            "height": {"magnitude": height, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0,
+            "scaleY": 1.0,
+            "shearX": shear_x,
+            "shearY": 0.0,
+            "translateX": translate_x,
+            "translateY": translate_y,
+            "unit": "EMU",
+        },
+        "shape": {
+            "shapeType": "TEXT_BOX",
+            "text": {"textElements": text_elements},
+        },
+    }
+
+
+def _rect_element(
+    object_id="rect1",
+    shape_type="RECTANGLE",
+    fill_rgb=None,
+    theme_color=None,
+    translate_x=0.0,
+    translate_y=0.0,
+    width=2_286_000,
+    height=1_143_000,
+):
+    """Build a shape pageElement dict (RECTANGLE or other)."""
+    color_dict = {}
+    if fill_rgb is not None:
+        color_dict["rgbColor"] = fill_rgb
+    elif theme_color is not None:
+        color_dict["themeColor"] = theme_color
+    return {
+        "objectId": object_id,
+        "size": {
+            "width": {"magnitude": width, "unit": "EMU"},
+            "height": {"magnitude": height, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0,
+            "scaleY": 1.0,
+            "shearX": 0.0,
+            "shearY": 0.0,
+            "translateX": translate_x,
+            "translateY": translate_y,
+            "unit": "EMU",
+        },
+        "shape": {
+            "shapeType": shape_type,
+            "shapeProperties": {
+                "shapeBackgroundFill": {"solidFill": {"color": color_dict}}
+            },
+        },
+    }
+
+
+def _image_element(
+    object_id="img1",
+    content_url="https://lh3.googleusercontent.com/fake",
+    translate_x=0.0,
+    translate_y=0.0,
+    width=2_286_000,
+    height=1_143_000,
+):
+    """Build an image pageElement dict."""
+    return {
+        "objectId": object_id,
+        "size": {
+            "width": {"magnitude": width, "unit": "EMU"},
+            "height": {"magnitude": height, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0,
+            "scaleY": 1.0,
+            "shearX": 0.0,
+            "shearY": 0.0,
+            "translateX": translate_x,
+            "translateY": translate_y,
+            "unit": "EMU",
+        },
+        "image": {"contentUrl": content_url},
+    }
+
+
+def _line_element(
+    object_id="line1",
+    stroke_rgb=None,
+    weight_emu=None,
+    translate_x=0.0,
+    translate_y=0.0,
+    width=1_828_800,
+    height=9_144,
+):
+    """Build a line pageElement dict."""
+    line_props = {}
+    if stroke_rgb is not None:
+        line_props["lineFill"] = {
+            "solidFill": {"color": {"rgbColor": stroke_rgb}}
+        }
+    if weight_emu is not None:
+        line_props["weight"] = {"magnitude": weight_emu, "unit": "EMU"}
+    return {
+        "objectId": object_id,
+        "size": {
+            "width": {"magnitude": width, "unit": "EMU"},
+            "height": {"magnitude": height, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0,
+            "scaleY": 1.0,
+            "shearX": 0.0,
+            "shearY": 0.0,
+            "translateX": translate_x,
+            "translateY": translate_y,
+            "unit": "EMU",
+        },
+        "line": {"lineProperties": line_props},
+    }
+
+
+# ---------------------------------------------------------------------------
+# Canvas detection
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_canvas_16x9_preset(mock_r2):
+    """pageSize with 16:9 EMU dimensions → preset '16:9', 1280×720."""
+    presentation = _minimal_presentation(
+        width_emu=EMU_16_9_W,
+        height_emu=EMU_16_9_H,
+        slides=_one_slide(),
+    )
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    assert len(result.slides) == 1
+    assert result.slides[0]["canvasPreset"] == "16:9"
+    assert result.slides[0]["canvasWidth"] == 1280
+    assert result.slides[0]["canvasHeight"] == 720
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_canvas_unknown_ratio(mock_r2):
+    """Unknown ratio → natural px dimensions, preset is None."""
+    # ratio = 10000000/5000000 = 2.0 → not in PRESET_MAP
+    presentation = _minimal_presentation(
+        width_emu=EMU_UNKNOWN_W,
+        height_emu=EMU_UNKNOWN_H,
+        slides=_one_slide(),
+    )
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    from app.services.gslides_importer import _emu_to_px
+
+    expected_w = round(_emu_to_px(EMU_UNKNOWN_W))  # ≈ 1050
+    expected_h = round(_emu_to_px(EMU_UNKNOWN_H))  # ≈ 525
+
+    assert result.slides[0]["canvasPreset"] is None
+    assert result.slides[0]["canvasWidth"] == expected_w
+    assert result.slides[0]["canvasHeight"] == expected_h
+
+
+# ---------------------------------------------------------------------------
+# Text extraction
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_textbox_concatenated_text(mock_r2):
+    """TEXT_BOX shape with textElements → correct concatenated text string."""
+    runs = [
+        {"content": "Hello ", "color": {"red": 0.0}, "font_size_pt": 12},
+        {"content": "World", "color": {"red": 0.0}, "font_size_pt": 12},
+    ]
+    elem = _text_element(text_runs=runs)
+    # Build textElements with two paragraphs separated by paragraphMarker
+    # Override to have both runs in one block (no extra separator between them)
+    text_elements = [
+        {"paragraphMarker": {}},
+        {
+            "textRun": {
+                "content": "Hello ",
+                "style": {
+                    "foregroundColor": {"opaqueColor": {"rgbColor": {"red": 0.0}}},
+                    "fontSize": {"magnitude": 12, "unit": "PT"},
+                },
+            }
+        },
+        {
+            "textRun": {
+                "content": "World",
+                "style": {
+                    "foregroundColor": {"opaqueColor": {"rgbColor": {"red": 0.0}}},
+                    "fontSize": {"magnitude": 12, "unit": "PT"},
+                },
+            }
+        },
+    ]
+    elem["shape"]["text"]["textElements"] = text_elements
+
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert "Hello " in elements[0]["content"]
+    assert "World" in elements[0]["content"]
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_textbox_fontsize_pt_to_px(mock_r2):
+    """textRun.style.fontSize.magnitude in PT converted to px via _pt_to_canvas_px."""
+    elem = _text_element(
+        text_runs=[{"content": "Hello", "color": {"red": 0.0}, "font_size_pt": 24}]
+    )
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    from app.services.gslides_importer import _pt_to_canvas_px
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["style"]["fontSize"] == _pt_to_canvas_px(24)  # 32
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_textbox_rgb_float_to_hex(mock_r2):
+    """rgbColor float values converted to correct hex string."""
+    elem = _text_element(
+        text_runs=[
+            {
+                "content": "Colored",
+                "color": {"red": 1.0, "green": 0.5, "blue": 0.0},
+                "font_size_pt": 12,
+            }
+        ]
+    )
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    # red=1.0→255=ff, green=0.5→128=80, blue=0.0→0=00
+    assert elements[0]["style"]["color"] == "#ff8000"
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_textbox_theme_color_fallback(mock_r2):
+    """themeColor (absent rgbColor) → element color '#000000' + fidelityWarning emitted."""
+    text_elements = [
+        {"paragraphMarker": {}},
+        {
+            "textRun": {
+                "content": "Theme text",
+                "style": {
+                    "foregroundColor": {
+                        "opaqueColor": {
+                            "themeColor": "DARK1"
+                            # no rgbColor key
+                        }
+                    },
+                    "fontSize": {"magnitude": 12, "unit": "PT"},
+                },
+            }
+        },
+    ]
+    elem = _text_element()
+    elem["shape"]["text"]["textElements"] = text_elements
+
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["style"]["color"] == "#000000"
+    assert any("theme color" in w.lower() for w in result.fidelity_warnings)
+
+
+# ---------------------------------------------------------------------------
+# Shape types
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_rectangle_shape(mock_r2):
+    """RECTANGLE shape → element type 'rect', solidFill color extracted."""
+    elem = _rect_element(
+        shape_type="RECTANGLE",
+        fill_rgb={"red": 0.0, "green": 0.0, "blue": 1.0},
+    )
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["type"] == "rect"
+    assert elements[0]["fill"] == "#0000ff"
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_ellipse_approximated(mock_r2):
+    """ELLIPSE shape → element type 'rect' + fidelityWarning about approximation."""
+    elem = _rect_element(shape_type="ELLIPSE")
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["type"] == "rect"
+    assert any("ELLIPSE" in w for w in result.fidelity_warnings)
+    assert any("approximated" in w.lower() for w in result.fidelity_warnings)
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_triangle_approximated(mock_r2):
+    """TRIANGLE shape → element type 'rect' + fidelityWarning."""
+    elem = _rect_element(shape_type="TRIANGLE")
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["type"] == "rect"
+    assert any("TRIANGLE" in w for w in result.fidelity_warnings)
+
+
+# ---------------------------------------------------------------------------
+# Image element
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_image_download_called(mock_r2):
+    """_download_image called with contentUrl and access_token."""
+    content_url = "https://lh3.googleusercontent.com/test_image"
+    elem = _image_element(object_id="img1", content_url=content_url)
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+
+    with patch(
+        "app.services.gslides_importer._download_image", new_callable=AsyncMock
+    ) as mock_dl:
+        mock_dl.return_value = FAKE_IMAGE_BYTES
+        await importer.import_presentation("test_pres_id", "prefix")
+
+    mock_dl.assert_called_once_with(content_url, "fake_token")
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_image_upload_called(mock_r2):
+    """Downloaded bytes passed to r2_service.upload_bytes."""
+    elem = _image_element(object_id="img1")
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+
+    with patch(
+        "app.services.gslides_importer._download_image", new_callable=AsyncMock
+    ) as mock_dl:
+        mock_dl.return_value = FAKE_IMAGE_BYTES
+        await importer.import_presentation("test_pres_id", "prefix")
+
+    assert mock_r2.upload_bytes.called
+    call_args = mock_r2.upload_bytes.call_args
+    assert call_args[0][1] == FAKE_IMAGE_BYTES  # data argument
+    assert call_args[0][2] == "image/jpeg"  # content_type argument
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_image_src_from_upload(mock_r2):
+    """Element src equals upload result URL."""
+    elem = _image_element(object_id="img1")
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+
+    with patch(
+        "app.services.gslides_importer._download_image", new_callable=AsyncMock
+    ) as mock_dl:
+        mock_dl.return_value = FAKE_IMAGE_BYTES
+        result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["type"] == "image"
+    assert elements[0]["src"] == MOCK_UPLOAD_URL
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_image_download_failure(mock_r2):
+    """Failed image download → fidelityWarning emitted, element skipped."""
+    elem = _image_element(object_id="img1")
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+
+    with patch(
+        "app.services.gslides_importer._download_image", new_callable=AsyncMock
+    ) as mock_dl:
+        mock_dl.return_value = None  # download failure
+        result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 0  # element skipped
+    assert any("Image download failed" in w for w in result.fidelity_warnings)
+
+
+# ---------------------------------------------------------------------------
+# Line element
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_line_stroke_color(mock_r2):
+    """line.lineProperties.lineFill.solidFill.color.rgbColor → hex stroke color."""
+    elem = _line_element(stroke_rgb={"red": 1.0, "green": 0.0, "blue": 0.0})
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["type"] == "line"
+    assert elements[0]["stroke"] == "#ff0000"
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_line_stroke_width(mock_r2):
+    """line.lineProperties.weight.magnitude (EMU) → px strokeWidth."""
+    # 914400 EMU = 1 inch = 96 px at 96 DPI
+    elem = _line_element(weight_emu=914_400)
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    assert elements[0]["strokeWidth"] == 96
+
+
+# ---------------------------------------------------------------------------
+# Group element
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_group_child_offset(mock_r2):
+    """Child element positions include group transform translateX/Y offset."""
+    # Group at (914400, 914400) EMU = (96, 96) natural px
+    # For 16:9: scale_x = 1280/960 = 4/3, scale_y = 720/540 = 4/3
+    # canvas group offset = 96 * (4/3) = 128 canvas px
+    # Child at translateX=0 → canvas x = (0 + 96) * (4/3) = 128
+    group_elem = {
+        "objectId": "group1",
+        "size": {
+            "width": {"magnitude": 1_828_800, "unit": "EMU"},
+            "height": {"magnitude": 914_400, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0,
+            "scaleY": 1.0,
+            "shearX": 0.0,
+            "shearY": 0.0,
+            "translateX": 914_400.0,  # 96 natural px
+            "translateY": 914_400.0,  # 96 natural px
+            "unit": "EMU",
+        },
+        "elementGroup": {
+            "children": [
+                {
+                    "objectId": "child1",
+                    "size": {
+                        "width": {"magnitude": 914_400, "unit": "EMU"},
+                        "height": {"magnitude": 457_200, "unit": "EMU"},
+                    },
+                    "transform": {
+                        "scaleX": 1.0,
+                        "scaleY": 1.0,
+                        "shearX": 0.0,
+                        "shearY": 0.0,
+                        "translateX": 0.0,
+                        "translateY": 0.0,
+                        "unit": "EMU",
+                    },
+                    "shape": {
+                        "shapeType": "RECTANGLE",
+                        "shapeProperties": {
+                            "shapeBackgroundFill": {
+                                "solidFill": {
+                                    "color": {
+                                        "rgbColor": {"red": 0.0, "green": 1.0, "blue": 0.0}
+                                    }
+                                }
+                            }
+                        },
+                    },
+                }
+            ]
+        },
+    }
+    presentation = _minimal_presentation(slides=_one_slide([group_elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    elements = result.slides[0]["elements"]
+    assert len(elements) == 1
+    # Group translateX = 914400 EMU = 96 natural px
+    # scale_x = 1280 / (9144000 * 96 / 914400) = 1280/960 = 1.333...
+    # child canvas_x = round((0 + 96) * 1.333...) = round(128.0) = 128
+    assert elements[0]["x"] == 128
+    assert elements[0]["y"] == 128
+
+
+# ---------------------------------------------------------------------------
+# Non-uniform transform
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_skew_detection(mock_r2):
+    """Element with non-zero shearX emits fidelityWarning about skew."""
+    elem = _text_element(shear_x=0.5)  # non-zero shearX
+    presentation = _minimal_presentation(slides=_one_slide([elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    assert any("skew transform" in w.lower() for w in result.fidelity_warnings)
+
+
+# ---------------------------------------------------------------------------
+# Unsupported types
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_table_skipped(mock_r2):
+    """table element → fidelityWarning + skipped."""
+    table_elem = {
+        "objectId": "table1",
+        "size": {
+            "width": {"magnitude": 2_286_000, "unit": "EMU"},
+            "height": {"magnitude": 1_143_000, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0, "scaleY": 1.0,
+            "shearX": 0.0, "shearY": 0.0,
+            "translateX": 0.0, "translateY": 0.0,
+            "unit": "EMU",
+        },
+        "table": {"rows": [], "columns": []},
+    }
+    presentation = _minimal_presentation(slides=_one_slide([table_elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    assert len(result.slides[0]["elements"]) == 0
+    assert any("Table dropped" in w for w in result.fidelity_warnings)
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_sheets_chart_skipped(mock_r2):
+    """sheetsChart element → fidelityWarning + skipped."""
+    chart_elem = {
+        "objectId": "chart1",
+        "size": {
+            "width": {"magnitude": 2_286_000, "unit": "EMU"},
+            "height": {"magnitude": 1_143_000, "unit": "EMU"},
+        },
+        "transform": {
+            "scaleX": 1.0, "scaleY": 1.0,
+            "shearX": 0.0, "shearY": 0.0,
+            "translateX": 0.0, "translateY": 0.0,
+            "unit": "EMU",
+        },
+        "sheetsChart": {"spreadsheetId": "abc"},
+    }
+    presentation = _minimal_presentation(slides=_one_slide([chart_elem]))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    assert len(result.slides[0]["elements"]) == 0
+    assert any("Chart dropped" in w for w in result.fidelity_warnings)
+
+
+# ---------------------------------------------------------------------------
+# fidelityWarnings cap
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_fidelity_warnings_capped(mock_r2):
+    """30 warnings → exactly 25 items in result, last is '... and N more warnings'."""
+    # Create 30 unsupported shape elements — each produces one warning
+    elements = [
+        _rect_element(object_id=f"elem{i}", shape_type="DIAMOND")
+        for i in range(30)
+    ]
+    presentation = _minimal_presentation(slides=_one_slide(elements))
+    importer, _ = _make_importer(mock_r2, presentation)
+    result = await importer.import_presentation("test_pres_id", "prefix")
+
+    assert len(result.fidelity_warnings) == 25
+    assert "more warnings" in result.fidelity_warnings[-1]
+
+
+# ---------------------------------------------------------------------------
+# Security: _download_image
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_download_image_rejects_non_https():
+    """_download_image with non-HTTPS URL returns None without making HTTP request."""
+    from app.services.gslides_importer import _download_image
+
+    with patch("httpx.AsyncClient") as mock_client_cls:
+        result = await _download_image("http://malicious.com/image.jpg", "token")
+
+    assert result is None
+    mock_client_cls.assert_not_called()
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_download_image_https_success():
+    """_download_image with HTTPS URL downloads and returns bytes."""
+    from app.services.gslides_importer import _download_image
+
+    mock_response = MagicMock()
+    mock_response.content = FAKE_IMAGE_BYTES
+    mock_response.raise_for_status = MagicMock()
+
+    mock_client = AsyncMock()
+    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+    mock_client.__aexit__ = AsyncMock(return_value=False)
+    mock_client.get = AsyncMock(return_value=mock_response)
+
+    with patch("httpx.AsyncClient", return_value=mock_client):
+        result = await _download_image("https://example.com/img.jpg", "mytoken")
+
+    assert result == FAKE_IMAGE_BYTES
+    mock_client.get.assert_called_once()
+    call_kwargs = mock_client.get.call_args
+    assert call_kwargs[1]["headers"]["Authorization"] == "Bearer mytoken"
+
+
+@pytest.mark.asyncio
+@pytest.mark.unit
+async def test_download_image_http_error_returns_none():
+    """_download_image returns None on httpx.HTTPError."""
+    from app.services.gslides_importer import _download_image
+
+    mock_client = AsyncMock()
+    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
+    mock_client.__aexit__ = AsyncMock(return_value=False)
+    mock_client.get = AsyncMock(side_effect=httpx.HTTPError("network error"))
+
+    with patch("httpx.AsyncClient", return_value=mock_client):
+        result = await _download_image("https://example.com/img.jpg", "mytoken")
+
+    assert result is None
