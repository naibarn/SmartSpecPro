"""
Security tests for the media job worker validation layer.

Tests SSRF prevention, path traversal rejection, resource limits, and
input sanitization for FFmpeg command construction.
"""

import pytest

from app.core.media_job_validators import (
    validate_job_spec_security,
    validate_uri_no_ssrf,
    validate_output_path,
    validate_codec,
    FFMPEG_TIMEOUT_SECONDS,
    MAX_OUTPUT_FILE_BYTES,
    MAX_CLIPS,
    MAX_RESOLUTION_PIXELS,
    ALLOWED_CODECS,
)


# ========================================
# SSRF Prevention
# ========================================

class TestSSRFPrevention:
    """Worker rejects job specs with SSRF-prone URIs."""

    def test_rejects_localhost(self):
        with pytest.raises(ValueError, match="internal"):
            validate_uri_no_ssrf("http://localhost:8080/api/secret")

    def test_rejects_127_0_0_1(self):
        with pytest.raises(ValueError, match="private|internal"):
            validate_uri_no_ssrf("http://127.0.0.1/admin")

    def test_rejects_private_10_range(self):
        with pytest.raises(ValueError, match="private"):
            validate_uri_no_ssrf("http://10.0.0.5:3000/internal")

    def test_rejects_private_172_range(self):
        with pytest.raises(ValueError, match="private"):
            validate_uri_no_ssrf("http://172.20.0.1/private")

    def test_rejects_private_192_168_range(self):
        with pytest.raises(ValueError, match="private"):
            validate_uri_no_ssrf("http://192.168.0.1/config")

    def test_rejects_metadata_endpoint(self):
        with pytest.raises(ValueError, match="private"):
            validate_uri_no_ssrf("http://169.254.169.254/latest/meta-data/")

    def test_rejects_file_scheme(self):
        with pytest.raises(ValueError, match="file://"):
            validate_uri_no_ssrf("file:///etc/passwd")

    def test_rejects_0_0_0_0(self):
        with pytest.raises(ValueError, match="internal"):
            validate_uri_no_ssrf("http://0.0.0.0/")

    def test_allows_public_https_url(self):
        result = validate_uri_no_ssrf("https://cdn.example.com/media/video.mp4")
        assert result == "https://cdn.example.com/media/video.mp4"

    def test_allows_public_http_url(self):
        result = validate_uri_no_ssrf("http://cdn.example.com/media/video.mp4")
        assert result == "http://cdn.example.com/media/video.mp4"


# ========================================
# Path Traversal
# ========================================

class TestPathTraversal:
    """Worker rejects job specs with path traversal in URIs or output targets."""

    def test_rejects_uri_with_dot_dot(self):
        with pytest.raises(ValueError, match="metachar|traversal"):
            # The '..' in a URI might also be caught by other validators
            validate_output_path("../../etc/passwd")

    def test_rejects_encoded_traversal(self):
        with pytest.raises(ValueError, match="traversal"):
            validate_output_path("%2e%2e/%2e%2e/etc/passwd")

    def test_rejects_output_path_traversal(self):
        with pytest.raises(ValueError, match="traversal"):
            validate_output_path("../../../tmp/evil")

    def test_accepts_valid_output_path(self):
        result = validate_output_path("output/video.mp4", workspace_dir="/tmp")
        assert result == "output/video.mp4"


# ========================================
# Resource Limits
# ========================================

class TestResourceLimits:
    """Worker enforces FFmpeg timeout and output size limits."""

    def test_ffmpeg_timeout_is_configured(self):
        assert FFMPEG_TIMEOUT_SECONDS == 1800

    def test_max_output_file_size_is_configured(self):
        assert MAX_OUTPUT_FILE_BYTES > 0
        assert MAX_OUTPUT_FILE_BYTES <= 10 * 1024 * 1024 * 1024  # 10GB max

    def test_max_clips_is_configured(self):
        assert MAX_CLIPS == 1000

    def test_max_resolution_is_4k(self):
        assert MAX_RESOLUTION_PIXELS == 3840 * 2160


# ========================================
# Codec Validation
# ========================================

class TestCodecValidation:
    """Worker validates codecs against allowlist."""

    def test_rejects_unknown_codec(self):
        with pytest.raises(ValueError, match="not in allowlist"):
            validate_codec("custom_evil_codec")

    def test_accepts_libx264(self):
        assert validate_codec("libx264") == "libx264"

    def test_accepts_aac(self):
        assert validate_codec("aac") == "aac"

    def test_accepts_copy(self):
        assert validate_codec("copy") == "copy"


# ========================================
# FFmpeg Arg Sanitization
# ========================================

class TestFFmpegArgSanitization:
    """No user-supplied strings are passed directly to FFmpeg."""

    def test_rejects_shell_metacharacters_in_uri(self):
        with pytest.raises(ValueError, match="metacharacter"):
            validate_uri_no_ssrf("https://example.com/file; rm -rf /")

    def test_rejects_pipe_in_uri(self):
        with pytest.raises(ValueError, match="metacharacter"):
            validate_uri_no_ssrf("https://example.com/file| cat /etc/passwd")


# ========================================
# Top-level validate_job_spec_security
# ========================================

class TestValidateJobSpecSecurity:
    """Integration tests for the top-level validation function."""

    def _make_spec(self, **overrides) -> dict:
        base = {
            "specVersion": "0.1",
            "jobId": "test-1",
            "jobType": "probe",
            "inputs": {
                "assets": [
                    {"assetId": "a1", "kind": "video", "uri": "https://cdn.example.com/v.mp4"}
                ]
            },
            "output": {"mode": "file", "target": "output/result.mp4"},
            "params": {},
        }
        base.update(overrides)
        return base

    def test_valid_spec_passes(self):
        validate_job_spec_security(self._make_spec())

    def test_rejects_ssrf_in_asset(self):
        spec = self._make_spec(
            inputs={"assets": [{"assetId": "a1", "kind": "video", "uri": "http://localhost/secret"}]}
        )
        with pytest.raises(ValueError, match="internal"):
            validate_job_spec_security(spec)

    def test_rejects_traversal_in_output(self):
        spec = self._make_spec(
            output={"mode": "file", "target": "../../etc/shadow"}
        )
        with pytest.raises(ValueError, match="traversal"):
            validate_job_spec_security(spec)

    def test_rejects_unknown_codec_in_params(self):
        spec = self._make_spec(
            params={"codec": "evil_codec"}
        )
        with pytest.raises(ValueError, match="not in allowlist"):
            validate_job_spec_security(spec)

    def test_rejects_excessive_clips(self):
        tracks = [{"trackId": "t1", "type": "video", "clips": [
            {"clipId": f"c{i}", "assetId": "a1", "startMs": i * 100}
            for i in range(1001)
        ]}]
        spec = self._make_spec(
            inputs={
                "assets": [{"assetId": "a1", "kind": "video", "uri": "https://cdn.example.com/v.mp4"}],
                "project": {"projectId": "p1", "fps": 30, "width": 1920, "height": 1080, "tracks": tracks},
            }
        )
        with pytest.raises(ValueError, match="Too many clips"):
            validate_job_spec_security(spec)

    def test_rejects_8k_resolution(self):
        spec = self._make_spec(
            inputs={
                "assets": [],
                "project": {"projectId": "p1", "fps": 30, "width": 7680, "height": 4320, "tracks": []},
            }
        )
        with pytest.raises(ValueError, match="exceeds max"):
            validate_job_spec_security(spec)

    def test_rejects_shell_metachar_in_params(self):
        spec = self._make_spec(
            params={"filter": "scale=1920:1080; rm -rf /"}
        )
        with pytest.raises(ValueError, match="metacharacter"):
            validate_job_spec_security(spec)
