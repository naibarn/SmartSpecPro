"""
Integration tests for the Media Job pipeline.
Tests the validation + fixture integration, spec parsing, and
security validation working together.

Note: Full Celery worker tests require Redis and are run separately.
These tests verify the validation and fixture layers integrate correctly.
"""

import json
import pytest

from app.core.media_job_validators import (
    validate_job_spec_security,
    validate_uri_no_ssrf,
    validate_output_path,
    validate_codec,
    FFMPEG_TIMEOUT_SECONDS,
    MAX_OUTPUT_FILE_BYTES,
    ALLOWED_CODECS,
)

# Import from our shared fixtures
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from fixtures.media_job_fixtures import (
    valid_probe_spec,
    valid_render_spec,
    valid_waveform_spec,
    valid_dead_air_spec,
    mock_ffprobe_output,
    mock_silence_detect_stderr,
    mock_ffmpeg_progress_lines,
)


@pytest.mark.integration
class TestProbeJobPipeline:
    """Probe job spec validation and fixture correctness."""

    def test_valid_probe_spec_passes_security(self):
        spec = valid_probe_spec()
        # Should not raise
        validate_job_spec_security(spec)

    def test_probe_spec_has_correct_structure(self):
        spec = valid_probe_spec()
        assert spec["specVersion"] == "0.1"
        assert spec["jobType"] == "probe"
        assert len(spec["inputs"]["assets"]) == 1
        assert spec["inputs"]["assets"][0]["kind"] == "video"

    def test_probe_with_ssrf_uri_rejected(self):
        spec = valid_probe_spec("http://169.254.169.254/latest/meta-data/")
        with pytest.raises(ValueError, match="private"):
            validate_job_spec_security(spec)

    def test_ffprobe_output_fixture_is_valid_json(self):
        output = mock_ffprobe_output()
        parsed = json.loads(output)
        assert "format" in parsed
        assert "streams" in parsed
        assert len(parsed["streams"]) == 2
        assert parsed["streams"][0]["codec_type"] == "video"
        assert parsed["streams"][1]["codec_type"] == "audio"


@pytest.mark.integration
class TestRenderJobPipeline:
    """Render job spec validation and fixture correctness."""

    def test_valid_render_spec_passes_security(self):
        spec = valid_render_spec()
        validate_job_spec_security(spec)

    def test_render_spec_has_timeline(self):
        spec = valid_render_spec(num_clips=3)
        project = spec["inputs"]["project"]
        assert project["fps"] == 30
        assert project["width"] == 1920
        assert project["height"] == 1080
        assert len(project["tracks"]) == 1
        assert len(project["tracks"][0]["clips"]) == 3

    def test_render_with_evil_codec_rejected(self):
        spec = valid_render_spec()
        spec["params"]["codec"] = "evil_codec"
        with pytest.raises(ValueError, match="not in allowlist"):
            validate_job_spec_security(spec)

    def test_render_with_excessive_clips_rejected(self):
        spec = valid_render_spec(num_clips=1001)
        with pytest.raises(ValueError, match="Too many clips"):
            validate_job_spec_security(spec)

    def test_render_with_8k_resolution_rejected(self):
        spec = valid_render_spec()
        spec["inputs"]["project"]["width"] = 7680
        spec["inputs"]["project"]["height"] = 4320
        with pytest.raises(ValueError, match="exceeds max"):
            validate_job_spec_security(spec)


@pytest.mark.integration
class TestWaveformJobPipeline:
    """Waveform job spec validation and fixture correctness."""

    def test_valid_waveform_spec_passes_security(self):
        spec = valid_waveform_spec()
        validate_job_spec_security(spec)

    def test_waveform_spec_has_bucket_param(self):
        spec = valid_waveform_spec(bucket_ms=75)
        assert spec["params"]["bucketMs"] == 75


@pytest.mark.integration
class TestDeadAirJobPipeline:
    """Dead air detection job spec validation."""

    def test_valid_dead_air_spec_passes_security(self):
        spec = valid_dead_air_spec()
        validate_job_spec_security(spec)

    def test_dead_air_spec_params(self):
        spec = valid_dead_air_spec()
        assert spec["params"]["thresholdDb"] == -40
        assert spec["params"]["minSilenceMs"] == 500

    def test_silence_detect_stderr_fixture(self):
        stderr = mock_silence_detect_stderr()
        assert "silence_start: 2.500" in stderr
        assert "silence_end: 4.800" in stderr
        assert "silence_duration: 2.300" in stderr
        # Should have 2 silence segments
        assert stderr.count("silence_start") == 2


@pytest.mark.integration
class TestFFmpegProgressParsing:
    """Progress line fixture correctness."""

    def test_progress_lines_have_expected_format(self):
        lines = mock_ffmpeg_progress_lines()
        # Should end with "progress=end"
        assert lines[-1] == "progress=end"
        # Should contain speed info
        speed_lines = [l for l in lines if l.startswith("speed=")]
        assert len(speed_lines) >= 1

    def test_progress_lines_have_frame_info(self):
        lines = mock_ffmpeg_progress_lines()
        frame_lines = [l for l in lines if l.startswith("frame=")]
        assert len(frame_lines) >= 2
        # Frames should increase
        frames = [int(l.split("=")[1]) for l in frame_lines]
        assert frames == sorted(frames)


@pytest.mark.integration
class TestSecurityIntegration:
    """Security integration: validation + spec construction together."""

    def test_ssrf_in_probe_asset(self):
        spec = valid_probe_spec("http://localhost:8080/secret")
        with pytest.raises(ValueError, match="internal"):
            validate_job_spec_security(spec)

    def test_file_scheme_rejected(self):
        spec = valid_probe_spec("file:///etc/passwd")
        with pytest.raises(ValueError, match="file://"):
            validate_job_spec_security(spec)

    def test_path_traversal_in_output(self):
        spec = valid_render_spec()
        spec["output"]["target"] = "../../etc/shadow"
        with pytest.raises(ValueError, match="traversal"):
            validate_job_spec_security(spec)

    def test_shell_metachar_in_params(self):
        spec = valid_render_spec()
        spec["params"]["filter"] = "scale=1920:1080; rm -rf /"
        with pytest.raises(ValueError, match="metacharacter"):
            validate_job_spec_security(spec)

    def test_all_allowed_codecs_pass_validation(self):
        for codec in ALLOWED_CODECS:
            assert validate_codec(codec) == codec

    def test_resource_limits_are_reasonable(self):
        assert FFMPEG_TIMEOUT_SECONDS == 1800
        assert MAX_OUTPUT_FILE_BYTES == 10 * 1024 * 1024 * 1024
