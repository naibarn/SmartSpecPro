"""
Slow integration tests for the full presentation render pipeline.

These tests mock only Playwright screenshots and R2 upload.
All other processing (zip, FFmpeg concat file creation, pypdf, Pillow) is real.

Run with: uv run pytest -m slow
"""
import io
import os
import zipfile

import pytest
from unittest.mock import patch, MagicMock, AsyncMock


def _make_mock_playwright(screenshot_bytes: bytes):
    """
    Build a nested MagicMock representing the Playwright context manager.
    The mock_page.screenshot() side_effect writes screenshot_bytes to the
    'path' kwarg so the real file-based implementation gets actual PNG files.
    """
    def _screenshot_to_disk(**kwargs):
        """Write mock screenshot bytes to the path= arg like real Playwright."""
        path = kwargs.get("path")
        if path:
            with open(path, "wb") as f:
                f.write(screenshot_bytes)

    mock_page = MagicMock()
    mock_page.screenshot.side_effect = _screenshot_to_disk
    mock_page.evaluate.return_value = True  # window.__slideReady

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page

    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context

    mock_pw = MagicMock()
    mock_pw.__enter__ = MagicMock(return_value=mock_pw)
    mock_pw.__exit__ = MagicMock(return_value=False)
    mock_pw.chromium.launch.return_value = mock_browser
    return mock_pw


@pytest.mark.slow
class TestRenderPipelineEndToEnd:

    def test_3_slide_deck_to_png_zip_contains_correct_files(
        self, three_slide_render_spec, white_png_1920x1080, monkeypatch, tmp_path
    ):
        """
        PNG format must produce exactly 3 entries in the output ZIP:
        slide_0000.png, slide_0001.png, slide_0002.png.
        """
        from app.tasks.presentation_render import _render_slides_to_screenshots, _build_png_zip

        mock_pw = _make_mock_playwright(white_png_1920x1080)
        mock_self = MagicMock()
        mock_self.update_state = MagicMock()

        monkeypatch.setenv("JWT_SECRET", "test-secret-for-render-pipeline-tests-at-least-32-chars")

        with patch("app.tasks.presentation_render.sync_playwright", return_value=mock_pw):
            screenshot_paths = _render_slides_to_screenshots(
                mock_self, three_slide_render_spec, str(tmp_path)
            )

        assert len(screenshot_paths) == 3
        for path in screenshot_paths:
            assert os.path.exists(path), f"Expected screenshot at {path}"

        zip_path = _build_png_zip(screenshot_paths, str(tmp_path))
        with zipfile.ZipFile(zip_path) as zf:
            names = sorted(zf.namelist())

        assert names == ["slide_0000.png", "slide_0001.png", "slide_0002.png"]

    def test_concat_file_format_matches_ffmpeg_demuxer_spec(
        self, three_slide_render_spec, tmp_path
    ):
        """
        Concat file lines must alternate:
          file '<absolute path>'
          duration <float>
        where duration matches durationMs / 1000 from the render spec.
        """
        from app.tasks.presentation_render import _write_concat_file

        slide_files = [str(tmp_path / f"slide_{i:04d}.png") for i in range(3)]
        for p in slide_files:
            open(p, "wb").close()

        concat_path = str(tmp_path / "concat.txt")
        durations_ms = [s["durationMs"] for s in three_slide_render_spec["slides"]]
        _write_concat_file(slide_files, durations_ms, concat_path)

        with open(concat_path) as f:
            lines = [line.rstrip("\n") for line in f if line.strip()]

        # Expect pairs: file ... / duration ...
        assert len(lines) % 2 == 0
        for i in range(len(lines) // 2):
            file_line = lines[i * 2]
            dur_line = lines[i * 2 + 1]
            assert file_line.startswith("file "), f"Line {i*2} should start with 'file '"
            assert dur_line.startswith("duration "), f"Line {i*2+1} should start with 'duration '"
            expected_dur = durations_ms[i] / 1000
            actual_dur = float(dur_line.split()[1])
            assert abs(actual_dur - expected_dur) < 0.001

    def test_png_screenshot_is_valid_png(
        self, three_slide_render_spec, white_png_1920x1080, monkeypatch, tmp_path
    ):
        """
        Each screenshot file written by _render_slides_to_screenshots
        must start with the PNG magic bytes.
        """
        from app.tasks.presentation_render import _render_slides_to_screenshots

        mock_pw = _make_mock_playwright(white_png_1920x1080)
        mock_self = MagicMock()
        mock_self.update_state = MagicMock()

        monkeypatch.setenv("JWT_SECRET", "test-secret-for-render-pipeline-tests-at-least-32-chars")

        with patch("app.tasks.presentation_render.sync_playwright", return_value=mock_pw):
            screenshot_paths = _render_slides_to_screenshots(
                mock_self, three_slide_render_spec, str(tmp_path)
            )

        for path in screenshot_paths:
            with open(path, "rb") as f:
                header = f.read(8)
            # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
            assert header[:4] == b"\x89PNG", f"Expected PNG header in {path}"

    def test_jpg_zip_converts_png_to_jpeg(
        self, three_slide_render_spec, white_png_1920x1080, monkeypatch, tmp_path
    ):
        """
        JPG format must produce a ZIP where each file is a valid JPEG
        (starts with JPEG SOI marker 0xFF 0xD8).
        """
        from app.tasks.presentation_render import _render_slides_to_screenshots, _build_jpg_zip

        mock_pw = _make_mock_playwright(white_png_1920x1080)
        mock_self = MagicMock()
        mock_self.update_state = MagicMock()

        monkeypatch.setenv("JWT_SECRET", "test-secret-for-render-pipeline-tests-at-least-32-chars")

        with patch("app.tasks.presentation_render.sync_playwright", return_value=mock_pw):
            screenshot_paths = _render_slides_to_screenshots(
                mock_self, three_slide_render_spec, str(tmp_path)
            )

        zip_path = _build_jpg_zip(screenshot_paths, str(tmp_path))
        with zipfile.ZipFile(zip_path) as zf:
            for name in zf.namelist():
                data = zf.read(name)
                assert data[:2] == b"\xff\xd8", f"Expected JPEG header in {name}"
