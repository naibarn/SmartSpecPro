"""Tests for custom tool bridge extensions in agency_tools.py."""
import pytest
from unittest.mock import patch, MagicMock

from app.services.agency_tools import (
    CustomToolConfig,
    _validate_custom_tool_input,
    _validate_tool_url,
    _execute_custom_tool_sync,
    _TOOL_LOCKS,
)


class TestCustomToolInputValidation:
    """Test input validation against JSON Schema."""

    def test_validates_input_against_schema(self):
        schema = {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        }
        err = _validate_custom_tool_input({"count": 5}, schema, strict_schema=False)
        assert err is not None
        assert "validation" in err.lower()

    def test_returns_none_for_valid_input(self):
        schema = {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        }
        err = _validate_custom_tool_input({"url": "https://example.com"}, schema, strict_schema=False)
        assert err is None

    def test_returns_structured_error_not_traceback(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }
        err = _validate_custom_tool_input({"name": 123}, schema, strict_schema=False)
        assert err is not None
        assert "validation" in err.lower()
        assert "Traceback" not in err

    def test_strict_schema_rejects_additional_properties(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
        }
        # Non-strict: additional props allowed
        err_loose = _validate_custom_tool_input(
            {"name": "test", "extra": "val"}, schema, strict_schema=False
        )
        assert err_loose is None

        # Strict: additional props rejected
        err_strict = _validate_custom_tool_input(
            {"name": "test", "extra": "val"}, schema, strict_schema=True
        )
        assert err_strict is not None
        assert "validation" in err_strict.lower()


class TestSsrfGuard:
    """Test SSRF protection at execution time."""

    def test_blocks_private_ips(self):
        with pytest.raises(ValueError, match="Blocked"):
            _validate_tool_url("http://10.0.0.1/api")

    def test_blocks_localhost(self):
        with pytest.raises(ValueError, match="Blocked|localhost"):
            _validate_tool_url("http://localhost:9999/api")

    def test_blocks_metadata_endpoint(self):
        with pytest.raises(ValueError, match="Blocked"):
            _validate_tool_url("http://169.254.169.254/latest/")

    def test_allows_public_urls(self):
        # Should not raise
        _validate_tool_url("https://api.example.com/webhook")

    def test_blocks_non_http_schemes(self):
        with pytest.raises(ValueError, match="scheme"):
            _validate_tool_url("ftp://example.com/file")


class TestCustomToolExecution:
    """Test custom tool HTTP execution."""

    @patch("app.services.agency_tools.httpx.Client")
    def test_executes_http_call(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"result": "ok"}'
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        config = CustomToolConfig(
            tool_id="test-tool",
            tool_type="http_api",
            risk_level="low",
            requires_approval=False,
            endpoint_url="https://api.example.com/hook",
            http_method="POST",
        )
        result = _execute_custom_tool_sync(config, {"query": "test"})
        assert result == '{"result": "ok"}'

    def test_rejects_ssrf_at_execution(self):
        config = CustomToolConfig(
            tool_id="bad-tool",
            tool_type="http_api",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://10.0.0.1/internal",
            http_method="POST",
        )
        result = _execute_custom_tool_sync(config, {})
        assert "blocked" in result.lower()

    @patch("app.services.agency_tools.httpx.Client")
    def test_validates_input_before_http(self, mock_client_cls):
        config = CustomToolConfig(
            tool_id="schema-tool",
            tool_type="http_api",
            risk_level="low",
            requires_approval=False,
            endpoint_url="https://api.example.com/hook",
            http_method="POST",
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        )
        result = _execute_custom_tool_sync(config, {"count": 5})
        assert "validation" in result.lower()
        # HTTP should NOT have been called
        mock_client_cls.assert_not_called()

    @patch("app.services.agency_tools.httpx.Client")
    def test_one_call_at_a_time_acquires_lock(self, mock_client_cls):
        """oneCallAtATime=True acquires threading.Lock before HTTP call and releases after."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "ok"
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.request.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        config = CustomToolConfig(
            tool_id="serial-tool",
            tool_type="http_api",
            risk_level="low",
            requires_approval=False,
            endpoint_url="https://api.example.com/hook",
            http_method="POST",
            one_call_at_a_time=True,
        )
        result = _execute_custom_tool_sync(config, {"q": "test"})
        assert result == "ok"
        # Lock should have been created for this tool_id
        assert "serial-tool" in _TOOL_LOCKS
        # Lock should be released (not locked)
        assert not _TOOL_LOCKS["serial-tool"].locked()
