"""
Google Slides Importer — converts a Google Slides presentation into PresentationSlideContent dicts.

Calls the Google Slides REST API, concurrently downloads all slide images
(whose contentUrl values are short-lived), parses each pageElement into a
PresentationSlideContent dict, and returns an ImportResult.

Security constraints:
  - Never logs contentUrl (contains embedded Google-signed credentials)
  - Never logs access_token
  - _download_image validates HTTPS before issuing any HTTP request
  - Video URLs validated for HTTPS before storage
  - access_token is received as a parameter; token refresh is the caller's responsibility
"""
import asyncio
import math
from dataclasses import dataclass
from uuid import uuid4

import httpx
import google.oauth2.credentials
import googleapiclient.discovery

from app.services.presentation_importer import ImportResult
from app.services.r2_storage_service import R2StorageService

# Aspect ratio preset map: round(width/height, 3) → (label, canvas_width, canvas_height)
PRESET_MAP: dict[float, tuple[str, int, int]] = {
    1.778: ("16:9", 1280, 720),
    0.563: ("9:16", 720, 1280),
    1.333: ("4:3", 1024, 768),
    0.75: ("3:4", 768, 1024),
    0.8: ("4:5", 960, 1200),
    1.25: ("5:4", 1250, 1000),
    1.0: ("1:1", 1080, 1080),
}

# Maximum concurrent image downloads to prevent FD exhaustion and API rate limiting
_IMAGE_DOWNLOAD_CONCURRENCY = 10


@dataclass
class ElementBounds:
    """Canvas-pixel bounding box for a pageElement."""

    x: int
    y: int
    width: int
    height: int
    rotation: float | None  # degrees; None if abs(angle) < 0.01


# ---------------------------------------------------------------------------
# Pure helper functions
# ---------------------------------------------------------------------------


def _emu_to_px(emu: float, dpi: int = 96) -> float:
    """Convert EMU (English Metric Units) to pixels at the given DPI.

    1 inch = 914400 EMU = dpi pixels.
    """
    return emu * dpi / 914_400


def _pt_to_canvas_px(pt: float) -> int:
    """Convert font size in points to canvas pixels, clamped to [8, 512]."""
    return max(8, min(512, round(pt * 4 / 3)))


def _cap_warnings(warnings: list[str]) -> list[str]:
    """Cap warnings list at 25 items with a summary item if truncated."""
    if len(warnings) <= 25:
        return warnings
    overflow = len(warnings) - 24
    return warnings[:24] + [f"... and {overflow} more warnings"]


def rgb_float_to_hex(color: dict) -> str:
    """Convert Google Slides float RGB dict to '#RRGGBB' hex string.

    Google encodes RGB as floats 0.0–1.0. Missing keys default to 0.0.
    Example: {"red": 1.0, "green": 0.5, "blue": 0.0} → "#ff8000"
    """
    r = round(color.get("red", 0.0) * 255)
    g = round(color.get("green", 0.0) * 255)
    b = round(color.get("blue", 0.0) * 255)
    return f"#{r:02x}{g:02x}{b:02x}"


async def _download_image(url: str, access_token: str) -> bytes | None:
    """Download a GSlides contentUrl.

    Security:
      - Rejects non-HTTPS URLs without making an HTTP request (primary SSRF defense).
      - Follows redirects (Google CDN may 302) with timeout=30s.
      - Returns None on any httpx.HTTPError.
      - Does NOT log the URL (contains embedded credentials).
    """
    if not url.startswith("https://"):
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            return response.content
    except httpx.HTTPError:
        return None


def _collect_image_urls(elements: list[dict]) -> list[tuple[str, str]]:
    """Recursively collect (objectId, contentUrl) pairs from elements and group children.

    Recursion handles elementGroup.children so grouped images are also pre-fetched.
    """
    pairs: list[tuple[str, str]] = []
    for element in elements:
        if "image" in element:
            content_url = element["image"].get("contentUrl", "")
            if content_url:
                pairs.append((element["objectId"], content_url))
        elif "elementGroup" in element:
            children = element["elementGroup"].get("children", [])
            pairs.extend(_collect_image_urls(children))
    return pairs


# ---------------------------------------------------------------------------
# GSlidesImporter class
# ---------------------------------------------------------------------------


class GSlidesImporter:
    """Imports a Google Slides presentation into PresentationSlideContent dicts.

    The caller is responsible for supplying a valid access_token.
    This class does NOT handle token refresh — use GoogleTokenService first.

    Args:
        access_token: A valid Google OAuth access token with drive.readonly scope.
        r2_service: The module-level R2StorageService singleton.
    """

    def __init__(self, access_token: str, r2_service: R2StorageService) -> None:
        self._access_token = access_token
        self._r2_service = r2_service
        credentials = google.oauth2.credentials.Credentials(token=access_token)
        # static_discovery=True uses bundled discovery doc; avoids blocking network fetch in __init__
        self._slides_service = googleapiclient.discovery.build(
            "slides", "v1", credentials=credentials, static_discovery=True
        )

    async def import_presentation(self, presentation_id: str, s3_prefix: str) -> ImportResult:
        """Fetch and convert a Google Slides presentation.

        Args:
            presentation_id: The Google Slides presentation ID (from URL).
            s3_prefix: S3 key prefix for uploaded images,
                       e.g. '{tenant_id}/presentations/imports/{conversion_id}'.

        Returns:
            ImportResult with slide dicts and capped fidelity_warnings.

        Raises:
            googleapiclient.errors.HttpError: On API errors (e.g. 403 forbidden).
        """
        # 1. Fetch full presentation JSON — offloaded to thread pool to avoid blocking the event loop
        request = self._slides_service.presentations().get(presentationId=presentation_id)
        presentation = await asyncio.to_thread(request.execute)

        # 2. Front-load all image downloads before any other processing.
        #    contentUrl values are short-lived Google-signed URLs.
        downloaded_images = await self._prefetch_images(presentation, self._access_token)

        # 3. Detect canvas size from pageSize
        page_size = presentation["pageSize"]
        page_width_emu = page_size["width"]["magnitude"]
        page_height_emu = page_size["height"]["magnitude"]
        ratio = round(page_width_emu / page_height_emu, 3)

        if ratio in PRESET_MAP:
            preset_label, canvas_px_width, canvas_px_height = PRESET_MAP[ratio]
        else:
            preset_label = None
            canvas_px_width = round(_emu_to_px(page_width_emu))
            canvas_px_height = round(_emu_to_px(page_height_emu))

        # 4. Compute scale factors
        canvas_scale_x = canvas_px_width / _emu_to_px(page_width_emu)
        canvas_scale_y = canvas_px_height / _emu_to_px(page_height_emu)

        canvas = {
            "preset": preset_label,
            "width": canvas_px_width,
            "height": canvas_px_height,
            "scale_x": canvas_scale_x,
            "scale_y": canvas_scale_y,
        }

        # 5. Parse each slide
        all_slides: list[dict] = []
        all_warnings: list[str] = []

        for page_index, page in enumerate(presentation.get("slides", [])):
            slide_dict, warnings = await self._parse_page(
                page, canvas, downloaded_images, s3_prefix, page_index + 1
            )
            all_slides.append(slide_dict)
            all_warnings.extend(warnings)

        # 6. Cap warnings at 25 and return
        return ImportResult(
            slides=all_slides,
            fidelity_warnings=_cap_warnings(all_warnings),
        )

    async def _prefetch_images(
        self,
        presentation: dict,
        access_token: str,
    ) -> dict[str, bytes | None]:
        """Concurrently download all contentUrls across all slides (including group children).

        Returns a dict mapping objectId → bytes (or None on failure).
        Caps concurrent connections at _IMAGE_DOWNLOAD_CONCURRENCY.
        """
        image_pairs: list[tuple[str, str]] = []  # (objectId, contentUrl)

        for slide in presentation.get("slides", []):
            image_pairs.extend(_collect_image_urls(slide.get("pageElements", [])))

        if not image_pairs:
            return {}

        object_ids = [pair[0] for pair in image_pairs]
        urls = [pair[1] for pair in image_pairs]

        semaphore = asyncio.Semaphore(_IMAGE_DOWNLOAD_CONCURRENCY)

        async def _download_with_limit(url: str) -> bytes | None:
            async with semaphore:
                return await _download_image(url, access_token)

        downloaded = await asyncio.gather(*[_download_with_limit(url) for url in urls])

        return dict(zip(object_ids, downloaded))

    def _extract_bounds(
        self,
        element: dict,
        canvas_scale_x: float,
        canvas_scale_y: float,
        offset_x: float = 0.0,  # in natural pixels
        offset_y: float = 0.0,  # in natural pixels
    ) -> ElementBounds:
        """Extract canvas-pixel bounding box from a pageElement.

        'transform' AffineTransform: translateX/Y are in EMU.
        'size': width/height have magnitude (EMU) and unit ('EMU').
        Rotation: math.degrees(math.atan2(shearY, scaleX)).

        offset_x/offset_y are in natural pixels (from parent group translate).
        """
        transform = element.get("transform", {})
        size = element.get("size", {})

        translate_x = transform.get("translateX", 0.0)
        translate_y = transform.get("translateY", 0.0)
        size_width_emu = size.get("width", {}).get("magnitude", 0.0)
        size_height_emu = size.get("height", {}).get("magnitude", 0.0)

        x = round((_emu_to_px(translate_x) + offset_x) * canvas_scale_x)
        y = round((_emu_to_px(translate_y) + offset_y) * canvas_scale_y)
        width = round(_emu_to_px(size_width_emu) * canvas_scale_x)
        height = round(_emu_to_px(size_height_emu) * canvas_scale_y)

        # Rotation from affine transform
        shear_y = transform.get("shearY", 0.0)
        scale_x = transform.get("scaleX", 1.0)
        rotation_deg = math.degrees(math.atan2(shear_y, scale_x))
        rotation: float | None = None if abs(rotation_deg) < 0.01 else rotation_deg

        return ElementBounds(x=x, y=y, width=width, height=height, rotation=rotation)

    async def _parse_page(
        self,
        page: dict,
        canvas: dict,
        downloaded_images: dict[str, bytes | None],
        s3_prefix: str,
        page_num: int,
    ) -> tuple[dict, list[str]]:
        """Parse a single slide page into a PresentationSlideContent dict.

        Returns (slide_dict, warnings_for_this_slide).
        """
        elements, warnings = await self._parse_elements(
            page.get("pageElements", []),
            canvas,
            downloaded_images,
            s3_prefix,
            page_num,
            offset_x=0.0,
            offset_y=0.0,
        )

        slide_dict = {
            "canvasPreset": canvas["preset"],
            "canvasWidth": canvas["width"],
            "canvasHeight": canvas["height"],
            "elements": elements,
        }

        return slide_dict, warnings

    async def _parse_elements(
        self,
        page_elements: list[dict],
        canvas: dict,
        downloaded_images: dict[str, bytes | None],
        s3_prefix: str,
        page_num: int,
        offset_x: float = 0.0,  # in natural pixels
        offset_y: float = 0.0,  # in natural pixels
    ) -> tuple[list[dict], list[str]]:
        """Parse a list of pageElements into element dicts."""
        elements: list[dict] = []
        warnings: list[str] = []

        canvas_scale_x = canvas["scale_x"]
        canvas_scale_y = canvas["scale_y"]

        for element in page_elements:
            transform = element.get("transform", {})
            bounds = self._extract_bounds(
                element, canvas_scale_x, canvas_scale_y, offset_x, offset_y
            )

            # Non-uniform skew check
            shear_x = transform.get("shearX", 0.0)
            if abs(shear_x) > 0.01:
                warnings.append(
                    f"Slide {page_num}: Element has skew transform — rendered as bounding box"
                )

            if "shape" in element:
                shape = element["shape"]
                shape_type = shape.get("shapeType", "")

                if shape_type == "TEXT_BOX":
                    elem, warns = self._parse_text_element(shape, bounds, page_num)
                    if elem:
                        elements.append(elem)
                    warnings.extend(warns)

                elif shape_type == "RECTANGLE":
                    elem, warns = self._parse_rect_element(shape, bounds, page_num)
                    elements.append(elem)
                    warnings.extend(warns)

                else:
                    # All other shapes: approximate as rectangle + warning
                    warnings.append(
                        f"Slide {page_num}: {shape_type} approximated as rectangle"
                    )
                    elem, warns = self._parse_rect_element(shape, bounds, page_num)
                    elements.append(elem)
                    warnings.extend(warns)

            elif "image" in element:
                elem, warns = await self._parse_image_element(
                    element, bounds, downloaded_images, s3_prefix, page_num
                )
                if elem:
                    elements.append(elem)
                warnings.extend(warns)

            elif "line" in element:
                elem, warns = self._parse_line_element(element, bounds, page_num)
                elements.append(elem)
                warnings.extend(warns)

            elif "table" in element:
                warnings.append(f"Slide {page_num}: Table dropped (not supported)")

            elif "sheetsChart" in element:
                warnings.append(f"Slide {page_num}: Chart dropped (not supported)")

            elif "wordArt" in element:
                text_content = element["wordArt"].get("renderedText", "")
                if text_content:
                    warnings.append(
                        f"Slide {page_num}: WordArt decoration lost — text preserved"
                    )
                    elements.append(
                        {
                            "type": "text",
                            "x": bounds.x,
                            "y": bounds.y,
                            "width": bounds.width,
                            "height": bounds.height,
                            "content": text_content,
                            "style": {},
                        }
                    )
                else:
                    warnings.append(
                        f"Slide {page_num}: WordArt element dropped (no renderedText)"
                    )

            elif "video" in element:
                url = element["video"].get("url", "")
                warnings.append(
                    f"Slide {page_num}: Video element may not play in presentation editor"
                )
                # Security: only store HTTPS video URLs
                safe_url = url if url.startswith("https://") else ""
                if url and not url.startswith("https://"):
                    warnings.append(
                        f"Slide {page_num}: Video URL rejected — non-HTTPS URL not stored"
                    )
                elements.append(
                    {
                        "type": "video",
                        "src": safe_url,
                        "x": bounds.x,
                        "y": bounds.y,
                        "width": bounds.width,
                        "height": bounds.height,
                    }
                )

            elif "elementGroup" in element:
                # Group: recurse with parent offset in natural pixels
                group_x_natural = _emu_to_px(transform.get("translateX", 0.0))
                group_y_natural = _emu_to_px(transform.get("translateY", 0.0))
                group_children = element["elementGroup"].get("children", [])
                child_elems, child_warns = await self._parse_elements(
                    group_children,
                    canvas,
                    downloaded_images,
                    s3_prefix,
                    page_num,
                    offset_x=offset_x + group_x_natural,
                    offset_y=offset_y + group_y_natural,
                )
                elements.extend(child_elems)
                warnings.extend(child_warns)

        return elements, warnings

    def _parse_text_element(
        self,
        shape: dict,
        bounds: ElementBounds,
        page_num: int,
    ) -> tuple[dict | None, list[str]]:
        """Parse a TEXT_BOX shape into a text element dict."""
        warnings: list[str] = []
        text_content_obj = shape.get("text", {})
        text_elements = text_content_obj.get("textElements", [])

        parts: list[str] = []
        first_run_style: dict = {}
        first_run_found = False

        for text_elem in text_elements:
            if "paragraphMarker" in text_elem:
                if parts:
                    parts.append("\n")
            elif "textRun" in text_elem:
                run = text_elem["textRun"]
                content = run.get("content", "")
                parts.append(content)

                if not first_run_found:
                    first_run_found = True
                    style = run.get("style", {})
                    fg_color = style.get("foregroundColor", {}).get("opaqueColor", {})
                    rgb_color = fg_color.get("rgbColor")

                    if rgb_color is not None:
                        first_run_style["color"] = rgb_float_to_hex(rgb_color)
                    else:
                        first_run_style["color"] = "#000000"
                        warnings.append(
                            f"Slide {page_num}: Text color uses theme color — defaulted to #000000"
                        )

                    font_size = style.get("fontSize", {})
                    magnitude = font_size.get("magnitude", 0)
                    if magnitude:
                        first_run_style["fontSize"] = _pt_to_canvas_px(magnitude)

        text = "".join(parts)[:10_000]

        if not text.strip():
            return None, warnings

        return {
            "type": "text",
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height,
            "content": text,
            "style": first_run_style,
        }, warnings

    def _parse_rect_element(
        self,
        shape: dict,
        bounds: ElementBounds,
        page_num: int,
    ) -> tuple[dict, list[str]]:
        """Parse a rect/shape element into a rect dict."""
        warnings: list[str] = []

        fill = "#cccccc"
        bg_fill = (
            shape.get("shapeProperties", {})
            .get("shapeBackgroundFill", {})
            .get("solidFill", {})
            .get("color", {})
        )
        rgb_color = bg_fill.get("rgbColor")
        if rgb_color is not None:
            fill = rgb_float_to_hex(rgb_color)
        elif bg_fill.get("themeColor"):
            warnings.append(
                f"Slide {page_num}: Shape fill uses theme color — defaulted to #cccccc"
            )

        return {
            "type": "rect",
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height,
            "fill": fill,
        }, warnings

    async def _parse_image_element(
        self,
        element: dict,
        bounds: ElementBounds,
        downloaded_images: dict[str, bytes | None],
        s3_prefix: str,
        page_num: int,
    ) -> tuple[dict | None, list[str]]:
        """Parse an image element: look up pre-downloaded bytes, upload to R2."""
        warnings: list[str] = []
        object_id = element.get("objectId", "")
        image_bytes = downloaded_images.get(object_id)

        if image_bytes is None:
            warnings.append(f"Slide {page_num}: Image download failed — skipped")
            return None, warnings

        key = f"{s3_prefix}/images/{uuid4()}.jpg"
        upload_url = await self._r2_service.upload_bytes(key, image_bytes, "image/jpeg")

        return {
            "type": "image",
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height,
            "src": upload_url,
        }, warnings

    def _parse_line_element(
        self, element: dict, bounds: ElementBounds, page_num: int
    ) -> tuple[dict, list[str]]:
        """Parse a line element into a line dict."""
        warnings: list[str] = []
        line = element.get("line", {})
        line_props = line.get("lineProperties", {})

        stroke = "#000000"
        rgb_color = (
            line_props.get("lineFill", {})
            .get("solidFill", {})
            .get("color", {})
            .get("rgbColor")
        )
        if rgb_color is not None:
            stroke = rgb_float_to_hex(rgb_color)

        stroke_width = 1
        weight = line_props.get("weight", {})
        magnitude = weight.get("magnitude")
        if magnitude is not None:
            stroke_width = round(_emu_to_px(magnitude))

        return {
            "type": "line",
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height,
            "stroke": stroke,
            "strokeWidth": stroke_width,
        }, warnings
