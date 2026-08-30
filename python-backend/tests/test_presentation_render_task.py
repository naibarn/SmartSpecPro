"""
Unit tests for the presentation_render Celery task.

All tests mock Playwright, FFmpeg (subprocess.run), and R2 storage.
No real browser, FFmpeg binary, or external storage services are required.

Tests are @pytest.mark.unit (synchronous, fast).
"""

import io
import os
import shutil
import subprocess
import zipfile
import pytest
from unittest.mock import MagicMock, patch, call
from celery.exceptions import SoftTimeLimitExceeded
from PIL import Image, ImageChops, ImageStat
import pypdf


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_png_bytes(width: int = 1, height: int = 1) -> bytes:
    """Create minimal valid PNG bytes using Pillow (1×1 white pixel by default)."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (255, 255, 255)).save(buf, "PNG")
    return buf.getvalue()


MOCK_PNG_BYTES = _make_png_bytes()


def _make_blank_pdf_bytes(width: int = 1920, height: int = 1080) -> bytes:
    """Create minimal valid PDF bytes using pypdf (blank page at given dimensions)."""
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=width, height=height)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


MOCK_PDF_BYTES = _make_blank_pdf_bytes()


def _ffmpeg_available() -> bool:
    return bool(shutil.which("ffmpeg"))


def _make_white_then_motion_video(output_path: str) -> None:
    """
    Create a synthetic clip with white pre-roll followed by moving test pattern.
    Used to verify trim + first-frame quality checks.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=white:s=320x180:r=10:d=0.4",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:r=10:d=1.2",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p",
        "-an",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def _extract_frame(video_path: str, at_seconds: float, frame_path: str) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{at_seconds:.3f}",
        "-i",
        video_path,
        "-frames:v",
        "1",
        frame_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def _image_luma_mean(image_path: str) -> float:
    with Image.open(image_path) as image:
        stat = ImageStat.Stat(image.convert("L"))
        return float(stat.mean[0])


def _frame_diff_mean(first_path: str, second_path: str) -> float:
    with Image.open(first_path) as first, Image.open(second_path) as second:
        diff = ImageChops.difference(first.convert("RGB"), second.convert("RGB"))
        stat = ImageStat.Stat(diff)
        return float(sum(stat.mean) / len(stat.mean))


def _make_mock_playwright(png_bytes: bytes = MOCK_PNG_BYTES, slide_ready: bool = True):
    """
    Build a mock playwright context manager hierarchy.

    When page.screenshot(path=...) is called, writes png_bytes to that path.
    page.evaluate returns slide_ready (True = ready immediately).
    Returns the mock to pass to patch("app.tasks.presentation_render.sync_playwright").
    """
    mock_page = MagicMock()
    mock_page.evaluate.return_value = slide_ready

    def fake_screenshot(**kwargs):
        path = kwargs.get("path")
        if path:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(png_bytes)

    mock_page.screenshot.side_effect = fake_screenshot

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page

    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context

    mock_pw_instance = MagicMock()
    mock_pw_instance.chromium.launch.return_value = mock_browser

    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_pw_instance)
    mock_cm.__exit__ = MagicMock(return_value=None)

    mock_sync_playwright = MagicMock(return_value=mock_cm)
    return mock_sync_playwright, mock_page


def _make_mock_playwright_pdf(pdf_bytes: bytes = MOCK_PDF_BYTES):
    """
    Build a mock playwright context manager for _build_pdf.

    When page.pdf(path=...) is called, writes pdf_bytes to that path.
    """
    mock_page = MagicMock()

    def fake_pdf(**kwargs):
        path = kwargs.get("path")
        if path:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(pdf_bytes)

    mock_page.pdf.side_effect = fake_pdf

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page

    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context

    mock_pw_instance = MagicMock()
    mock_pw_instance.chromium.launch.return_value = mock_browser

    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_pw_instance)
    mock_cm.__exit__ = MagicMock(return_value=None)

    mock_sync_playwright = MagicMock(return_value=mock_cm)
    return mock_sync_playwright, mock_page


def _make_mock_playwright_video(tmp_dir: str, slide_ready: bool = True):
    """
    Build a mock playwright context manager for _render_slides_to_video_clips.

    The mocked page exposes page.video.path() and writes a small .webm file on page.close().
    """
    raw_video_path = os.path.join(tmp_dir, "playwright_recorded_slide.webm")

    mock_video = MagicMock()
    mock_video.path.return_value = raw_video_path

    mock_page = MagicMock()
    mock_page.evaluate.return_value = slide_ready
    mock_page.video = mock_video

    def fake_close():
        os.makedirs(os.path.dirname(raw_video_path), exist_ok=True)
        with open(raw_video_path, "wb") as f:
            f.write(b"webm")

    mock_page.close.side_effect = fake_close

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page

    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context

    mock_pw_instance = MagicMock()
    mock_pw_instance.chromium.launch.return_value = mock_browser

    mock_cm = MagicMock()
    mock_cm.__enter__ = MagicMock(return_value=mock_pw_instance)
    mock_cm.__exit__ = MagicMock(return_value=None)

    mock_sync_playwright = MagicMock(return_value=mock_cm)
    return mock_sync_playwright, mock_page


def _make_render_spec(num_slides: int = 2, fmt: str = "mp4") -> dict:
    """Build a minimal render spec with N slides."""
    return {
        "deckId": 7,
        "slides": [
            {
                "slideId": 100 + i,
                "orderIndex": i,
                "durationMs": 3000,
                "title": f"Slide {i + 1}",
                "audioTrack": None,
            }
            for i in range(num_slides)
        ],
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "format": fmt,
        "quality": "standard",
        "projectAudioTrack": None,
    }


def _make_mock_task_self():
    """Create a mock Celery task self with update_state tracking."""
    task_self = MagicMock()
    task_self.update_state = MagicMock()
    task_self.request.id = "test-task-id-abc"
    return task_self


# ---------------------------------------------------------------------------
# Tests: _make_slide_token
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestMakeSlideToken:
    """JWT token generation for the internal slide render endpoint."""

    def test_token_contains_correct_deck_and_slide_claims(self, monkeypatch):
        """Token payload contains deckId and slideIndex claims."""
        import jwt

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        from app.tasks.presentation_render import _make_slide_token

        token = _make_slide_token(deck_id=42, slide_index=3)
        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])

        assert payload["deckId"] == 42
        assert payload["slideIndex"] == 3

    def test_token_contains_slide_render_scope(self, monkeypatch):
        """Token scopes list includes 'internal:slide-render'."""
        import jwt

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        from app.tasks.presentation_render import _make_slide_token

        token = _make_slide_token(deck_id=1, slide_index=0)
        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])

        assert "internal:slide-render" in payload["scopes"]

    def test_token_contains_render_actor_claims(self, monkeypatch):
        """Token carries user and tenant claims used by protected storage routes."""
        import jwt

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        from app.tasks.presentation_render import _make_slide_token

        token = _make_slide_token(
            deck_id=42,
            slide_index=3,
            render_auth={"user_id": 9, "tenant_id": "tenant-1"},
        )
        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])

        assert payload["userId"] == 9
        assert payload["tenantId"] == "tenant-1"

    def test_embedded_render_actor_is_consumed_for_rolling_deploy_compatibility(
        self, monkeypatch, tmp_path
    ):
        """The worker accepts actor context embedded by a newer API."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)
        render_spec["__presentation_render_auth"] = {
            "user_id": 9,
            "tenant_id": "tenant-1",
        }

        with (
            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_stage1,
            patch("app.tasks.presentation_render._process_format", return_value="output.zip"),
            patch("app.tasks.presentation_render._upload_output", return_value={
                "output_url": "https://example.com/output.zip",
                "output_bytes": 10,
            }),
            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
            patch("shutil.rmtree"),
        ):
            mock_stage1.return_value = ["slide_0000.png"]
            from app.tasks.presentation_render import render_presentation

            render_presentation.run.__wrapped__.__func__(
                task_self,
                render_spec,
                "standard",
                "png",
            )

        assert mock_stage1.call_args.args[3] == {
            "user_id": 9,
            "tenant_id": "tenant-1",
        }
        assert "__presentation_render_auth" not in render_spec

    def test_token_has_expiry_approximately_5_minutes(self, monkeypatch):
        """Token exp claim is approximately 5 minutes (300s) from now."""
        import jwt
        import time

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        from app.tasks.presentation_render import _make_slide_token

        before = int(time.time())
        token = _make_slide_token(deck_id=1, slide_index=0)
        after = int(time.time())

        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
        ttl = payload["exp"] - before
        assert 295 <= ttl <= 305  # 300 ± 5s tolerance

    def test_token_uses_hs256_algorithm(self, monkeypatch):
        """Token is signed with HS256."""
        import jwt

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        from app.tasks.presentation_render import _make_slide_token

        token = _make_slide_token(deck_id=1, slide_index=0)
        header = jwt.get_unverified_header(token)
        assert header["alg"] == "HS256"


# ---------------------------------------------------------------------------
# Tests: _render_slides_to_screenshots — JWT security
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestJWTHeaderSecurity:
    """Internal render JWT is passed as a header, not a query parameter."""

    def test_token_in_x_internal_token_header(self, monkeypatch, tmp_path):
        """set_extra_http_headers is called with X-Internal-Token."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        # set_extra_http_headers must have been called with X-Internal-Token
        call_args_list = mock_page.set_extra_http_headers.call_args_list
        assert len(call_args_list) == 1
        headers_passed = call_args_list[0][0][0]  # first positional arg to first call
        assert "X-Internal-Token" in headers_passed
        assert headers_passed["X-Internal-Token"]  # non-empty

    def test_token_not_in_url(self, monkeypatch, tmp_path):
        """The URL passed to page.goto does not contain a token query parameter."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        goto_url = mock_page.goto.call_args[0][0]
        assert "token" not in goto_url.lower()
        assert "?" not in goto_url

    def test_actor_token_is_sent_as_bearer_for_media_subrequests(self, monkeypatch, tmp_path):
        """Playwright subrequests receive the tenant-scoped bearer token."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(
                task_self,
                render_spec,
                str(tmp_path),
                {"user_id": 9, "tenant_id": "tenant-1"},
            )

        headers_passed = mock_page.set_extra_http_headers.call_args[0][0]
        assert headers_passed["Authorization"].startswith("Bearer ")

    def test_internal_render_base_url_env_var(self, monkeypatch, tmp_path):
        """INTERNAL_RENDER_BASE_URL controls the base URL used in Playwright navigation."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://custom-host:3001")

        mock_sync_playwright, mock_page = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        goto_url = mock_page.goto.call_args[0][0]
        assert "custom-host:3001" in goto_url


# ---------------------------------------------------------------------------
# Tests: _render_slides_to_screenshots — progress reporting
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestRenderPresentationProgress:
    """update_state is called with monotonically increasing percent values."""

    def test_progress_increases_per_slide(self, monkeypatch, tmp_path):
        """update_state percent rises across all slides (first call < last call)."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, _ = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=3)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        calls = task_self.update_state.call_args_list
        percents = [c[1]["meta"]["percent"] for c in calls]
        assert len(percents) >= 2
        assert percents == sorted(percents), "Percents must be monotonically non-decreasing"

    def test_progress_reaches_75_after_all_slides(self, monkeypatch, tmp_path):
        """After all screenshots, the last update_state call has percent == 75."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, _ = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=2)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        final_percent = task_self.update_state.call_args_list[-1][1]["meta"]["percent"]
        assert final_percent == 75  # L-3: exactly 75 for last slide (formula guarantees this)

    def test_update_state_called_once_per_slide(self, monkeypatch, tmp_path):
        """update_state is called exactly N times for N slides."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, _ = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=4)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        assert task_self.update_state.call_count == 4


# ---------------------------------------------------------------------------
# Tests: _render_slides_to_screenshots — slide ready timeout
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSlideReadyTimeout:
    """window.__slideReady timeout logs a warning but does not abort."""

    def test_timeout_logs_warning_and_continues(self, monkeypatch, tmp_path, caplog):
        """When __slideReady never becomes true, a warning is logged but screenshot is taken."""
        import logging

        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        # slide_ready=False so evaluate always returns False
        mock_sync_playwright, mock_page = _make_mock_playwright(slide_ready=False)
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            # Also patch the timeout loop to avoid 100 iterations in tests
            with patch("app.tasks.presentation_render._SLIDE_READY_POLL_ATTEMPTS", 1):
                from app.tasks.presentation_render import _render_slides_to_screenshots
                with caplog.at_level(logging.WARNING):
                    result = _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        # Must still return screenshot paths (does not abort)
        assert len(result) == 1
        # Screenshot was still taken
        assert mock_page.screenshot.called

    def test_failed_ready_state_raises_timeout_error(self, monkeypatch, tmp_path):
        """When route reports failed ready-state, worker raises E_SLIDE_READY_TIMEOUT."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright(slide_ready=False)
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        def evaluate_side_effect(script):
            if "window.__slideReady === true" in script:
                return False
            if "window.__slideReadyState" in script:
                return {
                    "status": "failed",
                    "code": "E_SLIDE_READY_TIMEOUT",
                    "reason": "base_layout_missing",
                }
            return False

        mock_page.evaluate.side_effect = evaluate_side_effect

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            with patch("app.tasks.presentation_render._SLIDE_READY_POLL_ATTEMPTS", 1):
                from app.tasks.presentation_render import _render_slides_to_screenshots
                with pytest.raises(RuntimeError, match="E_SLIDE_READY_TIMEOUT"):
                    _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        assert not mock_page.screenshot.called

    def test_media_degraded_state_never_produces_screenshot(self, monkeypatch, tmp_path):
        """A ready layout with failed media must fail before packaging a white PNG."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright(slide_ready=True)
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1)

        def evaluate_side_effect(script):
            if "window.__slideReady === true" in script:
                return True
            if "window.__slideReadyState" in script:
                return {
                    "status": "ready",
                    "mediaDegraded": True,
                    "mediaReady": True,
                }
            return True

        mock_page.evaluate.side_effect = evaluate_side_effect

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_screenshots
            with pytest.raises(RuntimeError, match="E_SLIDE_MEDIA_DEGRADED"):
                _render_slides_to_screenshots(task_self, render_spec, str(tmp_path))

        assert not mock_page.screenshot.called


# ---------------------------------------------------------------------------
# Tests: dynamic video MP4 path
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDynamicVideoExportPath:
    """MP4 exports with hasDynamicVideo use clip-recording path."""

    def test_render_slides_to_video_clips_uses_record_mode_url(self, monkeypatch, tmp_path):
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, mock_page = _make_mock_playwright_video(str(tmp_path))
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="mp4")

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            from app.tasks.presentation_render import _render_slides_to_video_clips

            result = _render_slides_to_video_clips(task_self, render_spec, str(tmp_path))

        assert len(result) == 1
        assert str(result[0]["path"]).endswith("slide_0000.webm")
        assert os.path.exists(result[0]["path"])
        assert result[0]["duration_ms"] == 3000
        assert result[0]["trim_start_ms"] >= 0
        goto_url = mock_page.goto.call_args[0][0]
        assert "mode=record" in goto_url

    def test_render_presentation_uses_dynamic_clip_path_for_mp4(self, monkeypatch, tmp_path):
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="mp4")
        render_spec["hasDynamicVideo"] = True

        with (
            patch("app.tasks.presentation_render._render_slides_to_video_clips") as mock_clips,
            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_screens,
            patch("app.tasks.presentation_render._build_mp4_from_clips") as mock_build_mp4_from_clips,
            patch("app.tasks.presentation_render._upload_output") as mock_upload,
            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
            patch("shutil.rmtree"),
        ):
            clip_path = tmp_path / "slide_0000.webm"
            clip_path.write_bytes(b"webm")
            output_mp4 = tmp_path / "output.mp4"
            output_mp4.write_bytes(b"mp4")
            mock_clips.return_value = [{"path": str(clip_path), "trim_start_ms": 800, "duration_ms": 3000}]
            mock_build_mp4_from_clips.return_value = str(output_mp4)
            mock_upload.return_value = {"output_url": "https://presigned.example.com/out.mp4?token=x", "output_bytes": 120}
            from app.tasks.presentation_render import render_presentation

            result = render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "mp4")

        assert result["output_url"].startswith("https://presigned.example.com/")
        mock_clips.assert_called_once()
        mock_build_mp4_from_clips.assert_called_once()
        mock_screens.assert_not_called()


@pytest.mark.unit
@pytest.mark.skipif(not _ffmpeg_available(), reason="ffmpeg is required for clip quality checks")
class TestDynamicVideoQualityGuards:
    """Quality checks for first-frame pre-roll trim and motion retention."""

    def test_trimmed_clip_first_frame_is_not_white_and_has_motion(self, tmp_path):
        source_clip = tmp_path / "white_then_motion.mp4"
        _make_white_then_motion_video(str(source_clip))

        from app.tasks.presentation_render import _trim_video_clip_segment

        segment = {
            "path": str(source_clip),
            "trim_start_ms": 500,
            "duration_ms": 900,
        }
        trimmed = _trim_video_clip_segment(segment, idx=0, fps=10, tmp_dir=str(tmp_path))
        assert os.path.exists(trimmed)

        first_frame = tmp_path / "trim_first.png"
        next_frame = tmp_path / "trim_next.png"
        _extract_frame(trimmed, 0.00, str(first_frame))
        _extract_frame(trimmed, 0.20, str(next_frame))

        first_luma = _image_luma_mean(str(first_frame))
        motion_delta = _frame_diff_mean(str(first_frame), str(next_frame))

        # Fully white RGB frame has mean ~255. We expect trimmed output to start on content.
        assert first_luma < 220
        # Moving testsrc frames should differ measurably.
        assert motion_delta > 2.0


# ---------------------------------------------------------------------------
# Tests: _build_pdf  (M-5)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildPdf:
    """_build_pdf uses Playwright page.pdf() to produce per-slide PDFs, merged with pypdf."""

    def test_pdf_output_file_is_created(self, tmp_path):
        """Output PDF file is created at output.pdf inside tmp_dir."""
        from app.tasks.presentation_render import _build_pdf

        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        render_spec = _make_render_spec(num_slides=2, fmt="pdf")
        mock_sync_playwright, _ = _make_mock_playwright_pdf()

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            output = _build_pdf(render_spec, paths, str(tmp_path))

        assert output.endswith(".pdf")
        assert os.path.exists(output)

    def test_pdf_calls_page_pdf_for_each_slide(self, tmp_path):
        """page.pdf() is called exactly once per slide."""
        from app.tasks.presentation_render import _build_pdf

        paths = []
        for i in range(3):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        render_spec = _make_render_spec(num_slides=3, fmt="pdf")
        mock_sync_playwright, mock_page = _make_mock_playwright_pdf()

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            _build_pdf(render_spec, paths, str(tmp_path))

        assert mock_page.pdf.call_count == 3

    def test_pdf_output_uses_pypdf_writer(self, tmp_path):
        """pypdf.PdfWriter.add_page is called once per slide."""
        from app.tasks.presentation_render import _build_pdf

        p = tmp_path / "slide_0000.png"
        p.write_bytes(MOCK_PNG_BYTES)

        render_spec = _make_render_spec(num_slides=1, fmt="pdf")
        mock_sync_playwright, _ = _make_mock_playwright_pdf()

        with patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright):
            with patch("pypdf.PdfWriter") as mock_writer_class:
                mock_writer = MagicMock()
                mock_writer_class.return_value = mock_writer
                # PdfReader still needs to work, so patch at a higher level
                with patch("pypdf.PdfReader") as mock_reader_class:
                    mock_reader = MagicMock()
                    mock_reader.pages = [MagicMock()]
                    mock_reader_class.return_value = mock_reader
                    _build_pdf(render_spec, [str(p)], str(tmp_path))

        mock_writer.add_page.assert_called_once()


# ---------------------------------------------------------------------------
# Tests: _build_png_zip
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildPngZip:
    """PNG zip output contains correctly named slide files."""

    def test_zip_contains_one_entry_per_slide(self, tmp_path):
        """Zip file has exactly N entries for N slide PNGs."""
        from app.tasks.presentation_render import _build_png_zip

        paths = []
        for i in range(3):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        output = _build_png_zip(paths, str(tmp_path))

        with zipfile.ZipFile(output) as zf:
            names = zf.namelist()
        assert len(names) == 3

    def test_zip_entry_names_are_slide_filenames(self, tmp_path):
        """Zip entries use the original filenames (slide_0000.png etc.)."""
        from app.tasks.presentation_render import _build_png_zip

        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        output = _build_png_zip(paths, str(tmp_path))

        with zipfile.ZipFile(output) as zf:
            names = zf.namelist()
        assert "slide_0000.png" in names
        assert "slide_0001.png" in names

    def test_zip_file_created_in_tmp_dir(self, tmp_path):
        """Output zip file is created inside tmp_dir."""
        from app.tasks.presentation_render import _build_png_zip

        p = tmp_path / "slide_0000.png"
        p.write_bytes(MOCK_PNG_BYTES)
        output = _build_png_zip([str(p)], str(tmp_path))

        assert output.startswith(str(tmp_path))
        assert output.endswith(".zip")

    def test_rejects_corrupt_png_before_packaging(self, tmp_path):
        """A truncated screenshot must fail instead of producing a bad export."""
        from app.tasks.presentation_render import _build_png_zip

        p = tmp_path / "slide_0000.png"
        p.write_bytes(b"\x89PNG\r\n\x1a\ntruncated")

        with pytest.raises(RuntimeError, match="E_PNG_SCREENSHOT_INVALID"):
            _build_png_zip([str(p)], str(tmp_path))


# ---------------------------------------------------------------------------
# Tests: _build_jpg_zip
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildJpgZip:
    """JPG zip converts PNG screenshots to JPEG quality=90."""

    def test_zip_contains_jpg_entries(self, tmp_path):
        """Zip entries have .jpg extension."""
        from app.tasks.presentation_render import _build_jpg_zip

        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        output = _build_jpg_zip(paths, str(tmp_path))

        with zipfile.ZipFile(output) as zf:
            names = zf.namelist()
        assert all(n.endswith(".jpg") for n in names)
        assert len(names) == 2

    def test_jpg_entries_are_valid_jpeg(self, tmp_path):
        """Each entry in the zip is valid JPEG data (starts with JPEG magic bytes)."""
        from app.tasks.presentation_render import _build_jpg_zip

        p = tmp_path / "slide_0000.png"
        p.write_bytes(MOCK_PNG_BYTES)

        output = _build_jpg_zip([str(p)], str(tmp_path))

        with zipfile.ZipFile(output) as zf:
            data = zf.read("slide_0000.jpg")
        # JPEG files start with FF D8 FF
        assert data[:3] == b"\xff\xd8\xff"


# ---------------------------------------------------------------------------
# Tests: _build_mp4 / FFmpeg concat file
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFFmpegConcatFile:
    """FFmpeg concat demuxer file format is correct."""

    def test_concat_file_has_one_entry_per_slide(self, tmp_path):
        """Concat file has exactly N `file '...'` lines for N slides."""
        from app.tasks.presentation_render import _write_concat_file

        paths = [str(tmp_path / f"slide_{i:04d}.png") for i in range(3)]
        durations = [3000, 4000, 5000]  # ms

        concat_path = str(tmp_path / "concat_list.txt")
        _write_concat_file(paths, durations, concat_path)

        with open(concat_path) as f:
            content = f.read()

        file_lines = [ln for ln in content.splitlines() if ln.startswith("file ")]
        assert len(file_lines) == 3

    def test_concat_file_duration_from_duration_ms(self, tmp_path):
        """Each `duration` line equals durationMs / 1000."""
        from app.tasks.presentation_render import _write_concat_file

        paths = [str(tmp_path / "slide_0000.png")]
        durations = [3500]  # ms → 3.500

        concat_path = str(tmp_path / "concat_list.txt")
        _write_concat_file(paths, durations, concat_path)

        with open(concat_path) as f:
            content = f.read()

        duration_lines = [ln for ln in content.splitlines() if ln.startswith("duration ")]
        assert len(duration_lines) == 1
        assert "3.500" in duration_lines[0]

    def test_build_mp4_calls_ffmpeg_with_correct_args(self, tmp_path, monkeypatch):
        """FFmpeg is invoked with concat input, libx264, and quality preset args."""
        from app.tasks.presentation_render import _build_mp4

        # Write fake PNG files
        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        render_spec = _make_render_spec(num_slides=2, fmt="mp4")

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            _build_mp4(render_spec, "standard", paths, str(tmp_path))

        assert mock_run.called
        cmd = mock_run.call_args[0][0]
        cmd_str = " ".join(str(a) for a in cmd)
        assert "ffmpeg" in cmd_str
        assert "concat" in cmd_str
        assert "libx264" in cmd_str

    def test_build_mp4_no_hardcoded_r30(self, tmp_path):
        """FFmpeg command does not contain a hardcoded -r 30 (M-4: fps controlled by -vf only)."""
        from app.tasks.presentation_render import _build_mp4

        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        render_spec = _make_render_spec(num_slides=2, fmt="mp4")

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            _build_mp4(render_spec, "standard", paths, str(tmp_path))

        cmd = mock_run.call_args[0][0]
        # -r flag should not appear (fps is set via -vf fps= filter only)
        assert "-r" not in cmd

    def test_build_mp4_subprocess_has_timeout(self, tmp_path):
        """subprocess.run is called with timeout= argument (M-2: prevents blocking past Celery limit)."""
        from app.tasks.presentation_render import _build_mp4

        paths = []
        for i in range(2):
            p = tmp_path / f"slide_{i:04d}.png"
            p.write_bytes(MOCK_PNG_BYTES)
            paths.append(str(p))

        render_spec = _make_render_spec(num_slides=2, fmt="mp4")

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            _build_mp4(render_spec, "standard", paths, str(tmp_path))

        call_kwargs = mock_run.call_args[1]
        assert "timeout" in call_kwargs
        assert call_kwargs["timeout"] > 0

    def test_quality_preset_standard_crf23(self, tmp_path):
        """Standard quality uses CRF=23."""
        from app.tasks.presentation_render import QUALITY_PRESETS

        assert QUALITY_PRESETS["standard"]["crf"] == 23
        assert QUALITY_PRESETS["draft"]["crf"] == 28
        assert QUALITY_PRESETS["high"]["crf"] == 18

    def test_quality_preset_speed_values(self, tmp_path):
        """Preset speed values: draft=veryfast, standard=medium, high=slow."""
        from app.tasks.presentation_render import QUALITY_PRESETS

        assert QUALITY_PRESETS["draft"]["preset"] == "veryfast"
        assert QUALITY_PRESETS["standard"]["preset"] == "medium"
        assert QUALITY_PRESETS["high"]["preset"] == "slow"


# ---------------------------------------------------------------------------
# Tests: _upload_output
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestUploadOutput:
    """Upload stage uses R2 storage and returns a durable object key."""

    def test_upload_output_returns_storage_key_and_bytes(self, tmp_path):
        """Return value contains a durable storage key and output_bytes."""
        from app.tasks.presentation_render import _upload_output

        # Create a fake output file
        output_path = tmp_path / "output.mp4"
        output_path.write_bytes(b"fake-video-content")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=2, fmt="mp4")

        async def fake_upload_file(file_path, key, **kwargs):
            return None  # upload success, public URL ignored

        async def fake_presigned_url(key, expires_in=3600, **kwargs):
            return f"https://presigned.r2.example.com/{key}?token=abc123"

        mock_r2 = MagicMock()
        mock_r2.upload_file = fake_upload_file
        mock_r2.generate_presigned_url = fake_presigned_url

        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
            result = _upload_output(task_self, str(output_path), render_spec, "mp4")

        assert "output_url" in result
        assert result["output_url"] is None
        assert result["output_storage_key"].startswith("presentation-exports/")
        assert "output_bytes" in result
        assert result["output_bytes"] == len(b"fake-video-content")

    def test_upload_does_not_generate_expiring_url(self, tmp_path):
        """Final presentation publication does not create a presigned URL."""
        from app.tasks.presentation_render import _upload_output

        output_path = tmp_path / "output.mp4"
        output_path.write_bytes(b"fake-video-content")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=2, fmt="mp4")

        captured_expires = {}

        async def fake_upload_file(file_path, key, **kwargs):
            return None

        async def fake_presigned_url(key, expires_in=3600, **kwargs):
            captured_expires["expires_in"] = expires_in
            return "https://presigned.r2.example.com/export.mp4?token=abc"

        mock_r2 = MagicMock()
        mock_r2.upload_file = fake_upload_file
        mock_r2.generate_presigned_url = fake_presigned_url

        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
            _upload_output(task_self, str(output_path), render_spec, "mp4")

        assert captured_expires == {}

    def test_upload_key_contains_sanitized_deck_id(self, tmp_path):
        """Upload key includes the sanitized deck ID (H-4: path traversal prevention)."""
        from app.tasks.presentation_render import _upload_output

        output_path = tmp_path / "output.zip"
        output_path.write_bytes(b"fake-zip")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=2, fmt="png")
        render_spec["deckId"] = 42

        captured_key = {}

        async def fake_upload_file(file_path, key, **kwargs):
            captured_key["key"] = key
            return None

        async def fake_presigned_url(key, expires_in=3600, **kwargs):
            return f"https://presigned.r2.example.com/{key}"

        mock_r2 = MagicMock()
        mock_r2.upload_file = fake_upload_file
        mock_r2.generate_presigned_url = fake_presigned_url

        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
            _upload_output(task_self, str(output_path), render_spec, "png")

        assert "42" in captured_key.get("key", "")
        # Must not contain path traversal characters
        assert ".." not in captured_key.get("key", "")

    def test_upload_key_sanitizes_malformed_deck_id(self, tmp_path):
        """Malformed deck_id (path traversal attempt) is coerced to '0'."""
        from app.tasks.presentation_render import _upload_output

        output_path = tmp_path / "output.zip"
        output_path.write_bytes(b"fake-zip")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="png")
        render_spec["deckId"] = "../../admin"  # path traversal attempt

        captured_key = {}

        async def fake_upload_file(file_path, key, **kwargs):
            captured_key["key"] = key
            return None

        async def fake_presigned_url(key, expires_in=3600, **kwargs):
            return f"https://presigned.r2.example.com/{key}"

        mock_r2 = MagicMock()
        mock_r2.upload_file = fake_upload_file
        mock_r2.generate_presigned_url = fake_presigned_url

        with patch("app.tasks.presentation_render.get_r2_storage", return_value=mock_r2):
            _upload_output(task_self, str(output_path), render_spec, "png")

        key = captured_key.get("key", "")
        # Malformed deck_id must be sanitized to "0"
        assert key.startswith("presentation-exports/0/")
        assert ".." not in key


# ---------------------------------------------------------------------------
# Tests: temp dir cleanup
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestTempDirCleanup:
    """Temp directory is always cleaned up, even on failure."""

    def test_cleanup_on_success(self, monkeypatch, tmp_path):
        """shutil.rmtree is called in the finally block on success."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        mock_sync_playwright, _ = _make_mock_playwright()
        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="png")

        with (
            patch("app.tasks.presentation_render.sync_playwright", mock_sync_playwright),
            patch("app.tasks.presentation_render._upload_output") as mock_upload,
            patch("shutil.rmtree") as mock_rmtree,
            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
        ):
            mock_upload.return_value = {"output_url": "https://presigned.example.com/out.zip?token=x", "output_bytes": 100}
            from app.tasks.presentation_render import render_presentation

            # Call the underlying function directly (bypass Celery)
            render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "png")

        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)

    def test_cleanup_on_generic_exception(self, monkeypatch, tmp_path):
        """shutil.rmtree is called even when a mid-task exception is raised."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="png")

        with (
            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_stage1,
            patch("shutil.rmtree") as mock_rmtree,
            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
        ):
            mock_stage1.side_effect = RuntimeError("Playwright crash")
            from app.tasks.presentation_render import render_presentation

            with pytest.raises(RuntimeError, match="Playwright crash"):
                render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "png")

        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)

    def test_cleanup_on_soft_time_limit(self, monkeypatch, tmp_path):
        """shutil.rmtree is called when SoftTimeLimitExceeded is raised."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")
        monkeypatch.setenv("INTERNAL_RENDER_BASE_URL", "http://localhost:3000")

        task_self = _make_mock_task_self()
        render_spec = _make_render_spec(num_slides=1, fmt="png")

        with (
            patch("app.tasks.presentation_render._render_slides_to_screenshots") as mock_stage1,
            patch("shutil.rmtree") as mock_rmtree,
            patch("tempfile.mkdtemp", return_value=str(tmp_path)),
        ):
            mock_stage1.side_effect = SoftTimeLimitExceeded("timeout")
            from app.tasks.presentation_render import render_presentation

            with pytest.raises(SoftTimeLimitExceeded):
                render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "png")

        mock_rmtree.assert_called_once_with(str(tmp_path), ignore_errors=True)


# ---------------------------------------------------------------------------
# Tests: render_spec input validation (M-6)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestRenderSpecValidation:
    """render_presentation raises ValueError for missing required render_spec fields."""

    def test_missing_deck_id_raises_value_error(self, monkeypatch, tmp_path):
        """ValueError is raised when deckId is absent from render_spec."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")

        task_self = _make_mock_task_self()
        render_spec = {"slides": [{"slideId": 1}]}  # missing deckId

        with patch("tempfile.mkdtemp", return_value=str(tmp_path)):
            from app.tasks.presentation_render import render_presentation

            with pytest.raises(ValueError, match="deckId"):
                render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "png")

    def test_missing_slides_raises_value_error(self, monkeypatch, tmp_path):
        """ValueError is raised when slides is absent from render_spec."""
        monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-unit-tests")

        task_self = _make_mock_task_self()
        render_spec = {"deckId": 5}  # missing slides

        with patch("tempfile.mkdtemp", return_value=str(tmp_path)):
            from app.tasks.presentation_render import render_presentation

            with pytest.raises(ValueError, match="slides"):
                render_presentation.run.__wrapped__.__func__(task_self, render_spec, "standard", "png")
