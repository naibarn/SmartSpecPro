"""
Tests for GSlidesImporter — section 03 of the Import Presentations feature.

Mock targets:
  - googleapiclient.discovery.build  → MagicMock service with fixture JSON
  - httpx.AsyncClient                → fake image bytes

Run: cd python-backend && uv run pytest tests/test_gslides_importer.py -v --cov=app
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 16:9 ratio: 9144000 / 5143500 = 1.778 → preset "16:9", 1280×720
EMU_16_9_W = 9_144_000
EMU_16_9_H = 5_143_500

# Unknown ratio: 10000000 / 5000000 = 2.0 → no preset, natural px
EMU_UNKNOWN_W = 10_000_000
EMU_UNKNOWN_H = 5_000_000

MOCK_UPLOAD_URL = "https://cdn.example.com/test.jpg"
FAKE_IMAGE_BYTES = b"fake_image_data"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_r2():
    """Returns a mock R2StorageService with upload_bytes pre-patched."""
    svc = MagicMock()
    svc.upload_bytes = AsyncMock(return_value=MOCK_UPLOAD_URL)
    return svc


def _minimal_presentation(width_emu=EMU_16_9_W, height_emu=EMU_16_9_H, slides=None):
    """Build a minimal Google Slides presentation dict."""
    return {
        "presentationId": "test_pres_id",
        "pageSize": {
            "width": {"magnitude": width_emu, "unit": "EMU"},
            "height": {"magnitude": height_emu, "unit": "EMU"},
        },
        "slides": slides or [],
    }


def _make_importer(mock_r2, presentation_fixture):
    """Create GSlidesImporter with mocked Google API build; returns (importer, mock_service)."""
    mock_service = MagicMock()
    mock_service.presentations.return_value.get.return_value.execute.return_value = (
        presentation_fixture
    )
    with patch("googleapiclient.discovery.build") as mock_build:
        mock_build.return_value = mock_service
        from app.services.gslides_importer import GSlidesImporter

        importer = GSlidesImporter(access_token="fake_token", r2_service=mock_r2)
    # patch only needed during __init__; _slides_service is already set to mock_service
    return importer, mock_service


def _one_slide(page_elements=None):
    """Return a slides list with one slide containing the given elements."""
    return [{"objectId": "slide1", "pageElements": page_elements or []}]


def _text_element(
    object_id="elem1",
    translate_x=0.0,
    translate_y=0.0,
    width=2_286_000,
    height=1_143_000,
    text_runs=None,
    shear_x=0.0,
):
    """Build a TEXT_BOX pageElement dict."""
    text_elements = []
    for run in (text_runs or [{"content": "Hello", "color": {"red": 0.0}, "font_size_pt": 24}]):
        text_elements.append({"paragraphMarker": {}})
        style = {
            "foregroundColor": {
                "opaqueColor": {
                    "rgbColor": run.get("color", {"red": 0.0, "green": 0.0, "blue": 0.0})
                }
            },
            "fontSize": {"magnitude": run.get("font_size_pt", 24), "unit": "PT"},
        }
        text_elements.append({"textRun": {"content": run["content"], "style": style}})
    return {
        "objectId": object_id,
        "size": {
            "width": {"magnitude": width, "unit": "EMU"},
            "height": {"magnitude": height, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0,
            "scaleY": 1.0,
            "shearX": shear_x,
            "shearY": 0.0,
            "translateX": translate_x,
            "translateY": translate_y,
            "unit": "EMU",
        },
        "shape": {
            "shapeType": "TEXT_BOX",
            "text": {"textElements": text_elements},
        },
    }


def _rect_element(
    object_id="rect1",
    shape_type="RECTANGLE",
    fill_rgb=None,
    theme_color=None,
    translate_x=0.0,
    translate_y=0.0,
    width=2_286_000,
    height=1_143_000,
):
    """Build a shape pageElement dict (RECTANGLE or other)."""
    color_dict = {}
    if fill_rgb is not None:
        color_dict["rgbColor"] = fill_rgb
    elif theme_color is not None:
        color_dict["themeColor"] = theme_color
    return {
        "objectId": object_id,
        "size": {
            "width": {"magnitude": width, "unit": "EMU"},
            "height": {"magnitude": height, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0,
            "scaleY": 1.0,
            "shearX": 0.0,
            "shearY": 0.0,
            "translateX": translate_x,
            "translateY": translate_y,
            "unit": "EMU",
        },
        "shape": {
            "shapeType": shape_type,
            "shapeProperties": {
                "shapeBackgroundFill": {"solidFill": {"color": color_dict}}
            },
        },
    }


def _image_element(
    object_id="img1",
    content_url="https://lh3.googleusercontent.com/fake",
    translate_x=0.0,
    translate_y=0.0,
    width=2_286_000,
    height=1_143_000,
):
    """Build an image pageElement dict."""
    return {
        "objectId": object_id,
        "size": {
            "width": {"magnitude": width, "unit": "EMU"},
            "height": {"magnitude": height, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0,
            "scaleY": 1.0,
            "shearX": 0.0,
            "shearY": 0.0,
            "translateX": translate_x,
            "translateY": translate_y,
            "unit": "EMU",
        },
        "image": {"contentUrl": content_url},
    }


def _line_element(
    object_id="line1",
    stroke_rgb=None,
    weight_emu=None,
    translate_x=0.0,
    translate_y=0.0,
    width=1_828_800,
    height=9_144,
):
    """Build a line pageElement dict."""
    line_props = {}
    if stroke_rgb is not None:
        line_props["lineFill"] = {
            "solidFill": {"color": {"rgbColor": stroke_rgb}}
        }
    if weight_emu is not None:
        line_props["weight"] = {"magnitude": weight_emu, "unit": "EMU"}
    return {
        "objectId": object_id,
        "size": {
            "width": {"magnitude": width, "unit": "EMU"},
            "height": {"magnitude": height, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0,
            "scaleY": 1.0,
            "shearX": 0.0,
            "shearY": 0.0,
            "translateX": translate_x,
            "translateY": translate_y,
            "unit": "EMU",
        },
        "line": {"lineProperties": line_props},
    }


# ---------------------------------------------------------------------------
# Canvas detection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_canvas_16x9_preset(mock_r2):
    """pageSize with 16:9 EMU dimensions → preset '16:9', 1280×720."""
    presentation = _minimal_presentation(
        width_emu=EMU_16_9_W,
        height_emu=EMU_16_9_H,
        slides=_one_slide(),
    )
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert len(result.slides) == 1
    assert result.slides[0]["canvasPreset"] == "16:9"
    assert result.slides[0]["canvasWidth"] == 1280
    assert result.slides[0]["canvasHeight"] == 720


@pytest.mark.asyncio
@pytest.mark.unit
async def test_canvas_unknown_ratio(mock_r2):
    """Unknown ratio → natural px dimensions, preset is None."""
    # ratio = 10000000/5000000 = 2.0 → not in PRESET_MAP
    presentation = _minimal_presentation(
        width_emu=EMU_UNKNOWN_W,
        height_emu=EMU_UNKNOWN_H,
        slides=_one_slide(),
    )
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    from app.services.gslides_importer import _emu_to_px

    expected_w = round(_emu_to_px(EMU_UNKNOWN_W))  # ≈ 1050
    expected_h = round(_emu_to_px(EMU_UNKNOWN_H))  # ≈ 525

    assert result.slides[0]["canvasPreset"] is None
    assert result.slides[0]["canvasWidth"] == expected_w
    assert result.slides[0]["canvasHeight"] == expected_h


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_textbox_concatenated_text(mock_r2):
    """TEXT_BOX shape with textElements → correct concatenated text string."""
    runs = [
        {"content": "Hello ", "color": {"red": 0.0}, "font_size_pt": 12},
        {"content": "World", "color": {"red": 0.0}, "font_size_pt": 12},
    ]
    elem = _text_element(text_runs=runs)
    # Build textElements with two paragraphs separated by paragraphMarker
    # Override to have both runs in one block (no extra separator between them)
    text_elements = [
        {"paragraphMarker": {}},
        {
            "textRun": {
                "content": "Hello ",
                "style": {
                    "foregroundColor": {"opaqueColor": {"rgbColor": {"red": 0.0}}},
                    "fontSize": {"magnitude": 12, "unit": "PT"},
                },
            }
        },
        {
            "textRun": {
                "content": "World",
                "style": {
                    "foregroundColor": {"opaqueColor": {"rgbColor": {"red": 0.0}}},
                    "fontSize": {"magnitude": 12, "unit": "PT"},
                },
            }
        },
    ]
    elem["shape"]["text"]["textElements"] = text_elements

    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert "Hello " in elements[0]["content"]
    assert "World" in elements[0]["content"]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_textbox_fontsize_pt_to_px(mock_r2):
    """textRun.style.fontSize.magnitude in PT converted to px via _pt_to_canvas_px."""
    elem = _text_element(
        text_runs=[{"content": "Hello", "color": {"red": 0.0}, "font_size_pt": 24}]
    )
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    from app.services.gslides_importer import _pt_to_canvas_px

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["style"]["fontSize"] == _pt_to_canvas_px(24)  # 32


@pytest.mark.asyncio
@pytest.mark.unit
async def test_textbox_rgb_float_to_hex(mock_r2):
    """rgbColor float values converted to correct hex string."""
    elem = _text_element(
        text_runs=[
            {
                "content": "Colored",
                "color": {"red": 1.0, "green": 0.5, "blue": 0.0},
                "font_size_pt": 12,
            }
        ]
    )
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    # red=1.0→255=ff, green=0.5→128=80, blue=0.0→0=00
    assert elements[0]["style"]["color"] == "#ff8000"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_textbox_theme_color_fallback(mock_r2):
    """themeColor (absent rgbColor) → element color '#000000' + fidelityWarning emitted."""
    text_elements = [
        {"paragraphMarker": {}},
        {
            "textRun": {
                "content": "Theme text",
                "style": {
                    "foregroundColor": {
                        "opaqueColor": {
                            "themeColor": "DARK1"
                            # no rgbColor key
                        }
                    },
                    "fontSize": {"magnitude": 12, "unit": "PT"},
                },
            }
        },
    ]
    elem = _text_element()
    elem["shape"]["text"]["textElements"] = text_elements

    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["style"]["color"] == "#000000"
    assert any("theme color" in w.lower() for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# Shape types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_rectangle_shape(mock_r2):
    """RECTANGLE shape → element type 'rect', solidFill color extracted."""
    elem = _rect_element(
        shape_type="RECTANGLE",
        fill_rgb={"red": 0.0, "green": 0.0, "blue": 1.0},
    )
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "rect"
    assert elements[0]["fill"] == "#0000ff"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_ellipse_approximated(mock_r2):
    """ELLIPSE shape → element type 'rect' + fidelityWarning about approximation."""
    elem = _rect_element(shape_type="ELLIPSE")
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "rect"
    assert any("ELLIPSE" in w for w in result.fidelity_warnings)
    assert any("approximated" in w.lower() for w in result.fidelity_warnings)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_triangle_approximated(mock_r2):
    """TRIANGLE shape → element type 'rect' + fidelityWarning."""
    elem = _rect_element(shape_type="TRIANGLE")
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "rect"
    assert any("TRIANGLE" in w for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# Image element
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_image_download_called(mock_r2):
    """_download_image called with contentUrl and access_token."""
    content_url = "https://lh3.googleusercontent.com/test_image"
    elem = _image_element(object_id="img1", content_url=content_url)
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)

    with patch(
        "app.services.gslides_importer._download_image", new_callable=AsyncMock
    ) as mock_dl:
        mock_dl.return_value = FAKE_IMAGE_BYTES
        await importer.import_presentation("test_pres_id", "prefix")

    mock_dl.assert_called_once_with(content_url, "fake_token")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_image_upload_called(mock_r2):
    """Downloaded bytes passed to r2_service.upload_bytes."""
    elem = _image_element(object_id="img1")
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)

    with patch(
        "app.services.gslides_importer._download_image", new_callable=AsyncMock
    ) as mock_dl:
        mock_dl.return_value = FAKE_IMAGE_BYTES
        await importer.import_presentation("test_pres_id", "prefix")

    assert mock_r2.upload_bytes.called
    call_args = mock_r2.upload_bytes.call_args
    assert call_args[0][1] == FAKE_IMAGE_BYTES  # data argument
    assert call_args[0][2] == "image/jpeg"  # content_type argument


@pytest.mark.asyncio
@pytest.mark.unit
async def test_image_src_from_upload(mock_r2):
    """Element src equals upload result URL."""
    elem = _image_element(object_id="img1")
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)

    with patch(
        "app.services.gslides_importer._download_image", new_callable=AsyncMock
    ) as mock_dl:
        mock_dl.return_value = FAKE_IMAGE_BYTES
        result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "image"
    assert elements[0]["src"] == MOCK_UPLOAD_URL


@pytest.mark.asyncio
@pytest.mark.unit
async def test_image_download_failure(mock_r2):
    """Failed image download → fidelityWarning emitted, element skipped."""
    elem = _image_element(object_id="img1")
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)

    with patch(
        "app.services.gslides_importer._download_image", new_callable=AsyncMock
    ) as mock_dl:
        mock_dl.return_value = None  # download failure
        result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 0  # element skipped
    assert any("Image download failed" in w for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# Line element
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_line_stroke_color(mock_r2):
    """line.lineProperties.lineFill.solidFill.color.rgbColor → hex stroke color."""
    elem = _line_element(stroke_rgb={"red": 1.0, "green": 0.0, "blue": 0.0})
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "line"
    assert elements[0]["stroke"] == "#ff0000"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_line_stroke_width(mock_r2):
    """line.lineProperties.weight.magnitude (EMU) → px strokeWidth."""
    # 914400 EMU = 1 inch = 96 px at 96 DPI
    elem = _line_element(weight_emu=914_400)
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["strokeWidth"] == 96


# ---------------------------------------------------------------------------
# Group element
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_group_child_offset(mock_r2):
    """Child element positions include group transform translateX/Y offset."""
    # Group at (914400, 914400) EMU = (96, 96) natural px
    # For 16:9: scale_x = 1280/960 = 4/3, scale_y = 720/540 = 4/3
    # canvas group offset = 96 * (4/3) = 128 canvas px
    # Child at translateX=0 → canvas x = (0 + 96) * (4/3) = 128
    group_elem = {
        "objectId": "group1",
        "size": {
            "width": {"magnitude": 1_828_800, "unit": "EMU"},
            "height": {"magnitude": 914_400, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0,
            "scaleY": 1.0,
            "shearX": 0.0,
            "shearY": 0.0,
            "translateX": 914_400.0,  # 96 natural px
            "translateY": 914_400.0,  # 96 natural px
            "unit": "EMU",
        },
        "elementGroup": {
            "children": [
                {
                    "objectId": "child1",
                    "size": {
                        "width": {"magnitude": 914_400, "unit": "EMU"},
                        "height": {"magnitude": 457_200, "unit": "EMU"},
                    },
                    "transform": {
                        "scaleX": 1.0,
                        "scaleY": 1.0,
                        "shearX": 0.0,
                        "shearY": 0.0,
                        "translateX": 0.0,
                        "translateY": 0.0,
                        "unit": "EMU",
                    },
                    "shape": {
                        "shapeType": "RECTANGLE",
                        "shapeProperties": {
                            "shapeBackgroundFill": {
                                "solidFill": {
                                    "color": {
                                        "rgbColor": {"red": 0.0, "green": 1.0, "blue": 0.0}
                                    }
                                }
                            }
                        },
                    },
                }
            ]
        },
    }
    presentation = _minimal_presentation(slides=_one_slide([group_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    # Group translateX = 914400 EMU = 96 natural px
    # scale_x = 1280 / (9144000 * 96 / 914400) = 1280/960 = 1.333...
    # child canvas_x = round((0 + 96) * 1.333...) = round(128.0) = 128
    assert elements[0]["x"] == 128
    assert elements[0]["y"] == 128


# ---------------------------------------------------------------------------
# Non-uniform transform
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_skew_detection(mock_r2):
    """Element with non-zero shearX emits fidelityWarning about skew."""
    elem = _text_element(shear_x=0.5)  # non-zero shearX
    presentation = _minimal_presentation(slides=_one_slide([elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert any("skew transform" in w.lower() for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# Unsupported types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_table_skipped(mock_r2):
    """table element → fidelityWarning + skipped."""
    table_elem = {
        "objectId": "table1",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0,
            "unit": "EMU",
        },
        "table": {"rows": [], "columns": []},
    }
    presentation = _minimal_presentation(slides=_one_slide([table_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert len(result.slides[0]["elements"]) == 0
    assert any("Table dropped" in w for w in result.fidelity_warnings)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_sheets_chart_skipped(mock_r2):
    """sheetsChart element → fidelityWarning + skipped."""
    chart_elem = {
        "objectId": "chart1",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0,
            "unit": "EMU",
        },
        "sheetsChart": {"spreadsheetId": "abc"},
    }
    presentation = _minimal_presentation(slides=_one_slide([chart_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert len(result.slides[0]["elements"]) == 0
    assert any("Chart dropped" in w for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# fidelityWarnings cap
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_fidelity_warnings_capped(mock_r2):
    """30 warnings → exactly 25 items in result, last is '... and N more warnings'."""
    # Create 30 unsupported shape elements — each produces one warning
    elements = [
        _rect_element(object_id=f"elem{i}", shape_type="DIAMOND")
        for i in range(30)
    ]
    presentation = _minimal_presentation(slides=_one_slide(elements))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert len(result.fidelity_warnings) == 25
    assert "more warnings" in result.fidelity_warnings[-1]


# ---------------------------------------------------------------------------
# Security: _download_image
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_download_image_rejects_non_https():
    """_download_image with non-HTTPS URL returns None without making HTTP request."""
    from app.services.gslides_importer import _download_image

    with patch("httpx.AsyncClient") as mock_client_cls:
        result = await _download_image("http://malicious.com/image.jpg", "token")

    assert result is None
    mock_client_cls.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_download_image_uses_follow_redirects_and_timeout():
    """_download_image passes follow_redirects=True and timeout=30.0 to httpx."""
    from app.services.gslides_importer import _download_image

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_response = MagicMock()
        mock_response.content = b"image-bytes"
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await _download_image("https://example.com/img.jpg", "token")

    assert result == b"image-bytes"
    # Verify follow_redirects=True and timeout=30.0 are passed
    mock_client_cls.assert_called_once_with(follow_redirects=True, timeout=30.0)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_download_image_https_success():
    """_download_image with HTTPS URL downloads and returns bytes."""
    from app.services.gslides_importer import _download_image

    mock_response = MagicMock()
    mock_response.content = FAKE_IMAGE_BYTES
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await _download_image("https://example.com/img.jpg", "mytoken")

    assert result == FAKE_IMAGE_BYTES
    mock_client.get.assert_called_once()
    call_kwargs = mock_client.get.call_args
    assert call_kwargs[1]["headers"]["Authorization"] == "Bearer mytoken"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_download_image_http_error_returns_none():
    """_download_image returns None on httpx.HTTPError."""
    from app.services.gslides_importer import _download_image

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(side_effect=httpx.HTTPError("network error"))

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await _download_image("https://example.com/img.jpg", "mytoken")

    assert result is None


# ---------------------------------------------------------------------------
# Group: images in children are pre-fetched (H2 regression)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_group_child_image_prefetched(mock_r2):
    """Image element inside elementGroup.children is downloaded and included in output."""
    content_url = "https://lh3.googleusercontent.com/grouped_image"
    group_elem = {
        "objectId": "group1",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
        },
        "elementGroup": {
            "children": [
                {
                    "objectId": "group_img1",
                    "size": {
                        "width": {"magnitude": 914_400, "unit": "EMU"},
                        "height": {"magnitude": 457_200, "unit": "EMU"},
                    },
                    "transform": {
                        "scaleX": 1.0, "scaleY": 1.0,
                        "shearX": 0.0, "shearY": 0.0,
                        "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
                    },
                    "image": {"contentUrl": content_url},
                }
            ]
        },
    }
    presentation = _minimal_presentation(slides=_one_slide([group_elem]))
    importer, _ = _make_importer(mock_r2, presentation)

    with patch(
        "app.services.gslides_importer._download_image", new_callable=AsyncMock
    ) as mock_dl:
        mock_dl.return_value = FAKE_IMAGE_BYTES
        result = await importer.import_presentation("test_pres_id", "prefix")

    # Image in group should be fetched and present in output
    mock_dl.assert_called_once_with(content_url, "fake_token")
    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "image"
    assert elements[0]["src"] == MOCK_UPLOAD_URL


# ---------------------------------------------------------------------------
# WordArt element
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_wordart_element(mock_r2):
    """wordArt with renderedText → text element + 'text preserved' warning."""
    wordart_elem = {
        "objectId": "wa1",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
        },
        "wordArt": {"renderedText": "Fancy Text"},
    }
    presentation = _minimal_presentation(slides=_one_slide([wordart_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "text"
    assert elements[0]["content"] == "Fancy Text"
    assert any("text preserved" in w for w in result.fidelity_warnings)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_wordart_empty_text(mock_r2):
    """wordArt with empty renderedText → no element produced, warning says 'dropped'."""
    wordart_elem = {
        "objectId": "wa2",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
        },
        "wordArt": {"renderedText": ""},
    }
    presentation = _minimal_presentation(slides=_one_slide([wordart_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    assert len(result.slides[0]["elements"]) == 0
    # Should NOT claim "text preserved" when there's no text
    assert not any("text preserved" in w for w in result.fidelity_warnings)
    assert any("dropped" in w.lower() for w in result.fidelity_warnings)


# ---------------------------------------------------------------------------
# Video element
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.unit
async def test_video_element(mock_r2):
    """Video element with HTTPS URL → element with src + warning."""
    video_elem = {
        "objectId": "vid1",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
        },
        "video": {"url": "https://youtube.com/watch?v=abc"},
    }
    presentation = _minimal_presentation(slides=_one_slide([video_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["type"] == "video"
    assert elements[0]["src"] == "https://youtube.com/watch?v=abc"
    assert any("Video element" in w for w in result.fidelity_warnings)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_video_non_https_url(mock_r2):
    """Video element with non-HTTPS URL → src set to '' + security warning."""
    video_elem = {
        "objectId": "vid2",
        "size": {
            "width": {"magnitude": 2_286_000, "unit": "EMU"},
            "height": {"magnitude": 1_143_000, "unit": "EMU"},
        },
        "transform": {
            "scaleX": 1.0, "scaleY": 1.0,
            "shearX": 0.0, "shearY": 0.0,
            "translateX": 0.0, "translateY": 0.0, "unit": "EMU",
        },
        "video": {"url": "http://example.com/video.mp4"},
    }
    presentation = _minimal_presentation(slides=_one_slide([video_elem]))
    importer, _ = _make_importer(mock_r2, presentation)
    result = await importer.import_presentation("test_pres_id", "prefix")

    elements = result.slides[0]["elements"]
    assert len(elements) == 1
    assert elements[0]["src"] == ""  # non-HTTPS URL rejected
    assert any("non-HTTPS" in w or "rejected" in w for w in result.fidelity_warnings)
