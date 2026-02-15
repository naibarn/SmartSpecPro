"""Tests for Sentry Python backend integration."""

import json
import pytest
from unittest.mock import patch, MagicMock

from app.core.sentry_config import before_send, init_sentry


class TestBeforeSend:
    """Test PII scrubbing in before_send callback."""

    def test_scrubs_authorization_header(self):
        event = {
            "request": {
                "headers": {
                    "authorization": "Bearer secret-token",
                    "content-type": "application/json",
                }
            }
        }

        result = before_send(event, {})

        assert result is not None
        assert result["request"]["headers"]["authorization"] == "[FILTERED]"
        assert result["request"]["headers"]["content-type"] == "application/json"

    def test_scrubs_cookie_header(self):
        event = {
            "request": {
                "headers": {
                    "cookie": "session=abc123",
                }
            }
        }

        result = before_send(event, {})

        assert result is not None
        assert result["request"]["headers"]["cookie"] == "[FILTERED]"

    def test_scrubs_x_proxy_token_header(self):
        event = {
            "request": {
                "headers": {
                    "x-proxy-token": "proxy-secret",
                }
            }
        }

        result = before_send(event, {})

        assert result is not None
        assert result["request"]["headers"]["x-proxy-token"] == "[FILTERED]"

    def test_scrubs_sensitive_body_fields_dict(self):
        event = {
            "request": {
                "data": {
                    "username": "john",
                    "password": "secret123",
                    "token": "auth-token",
                    "secret": "shhh",
                    "apiKey": "key-123",
                    "normalField": "keep-this",
                }
            }
        }

        result = before_send(event, {})

        assert result is not None
        data = result["request"]["data"]
        assert data["username"] == "john"
        assert data["password"] == "[FILTERED]"
        assert data["token"] == "[FILTERED]"
        assert data["secret"] == "[FILTERED]"
        assert data["apiKey"] == "[FILTERED]"
        assert data["normalField"] == "keep-this"

    def test_scrubs_sensitive_body_fields_json_string(self):
        body = {"username": "john", "password": "secret123", "normalField": "keep"}
        event = {"request": {"data": json.dumps(body)}}

        result = before_send(event, {})

        assert result is not None
        parsed = json.loads(result["request"]["data"])
        assert parsed["username"] == "john"
        assert parsed["password"] == "[FILTERED]"
        assert parsed["normalField"] == "keep"

    def test_handles_event_without_request(self):
        event = {"message": "test error"}

        result = before_send(event, {})

        assert result is not None
        assert result["message"] == "test error"

    def test_handles_event_with_empty_headers(self):
        event = {"request": {"headers": {}}}

        result = before_send(event, {})

        assert result is not None


class TestInitSentry:
    """Test Sentry initialization."""

    @patch("app.core.sentry_config.sentry_sdk")
    def test_skips_init_when_no_dsn(self, mock_sdk):
        # settings.SENTRY_DSN defaults to "" which is falsy
        init_sentry()
        mock_sdk.init.assert_not_called()

    @patch("app.core.sentry_config.sentry_sdk")
    def test_initializes_with_dsn(self, mock_sdk):
        mock_settings = MagicMock()
        mock_settings.SENTRY_DSN = "https://key@sentry.io/123"
        mock_settings.ENVIRONMENT = "production"
        mock_settings.APP_VERSION = "1.0.0"
        with patch("app.core.config.settings", mock_settings):
            from app.core import sentry_config
            sentry_config.init_sentry()

        mock_sdk.init.assert_called_once()
        call_kwargs = mock_sdk.init.call_args[1]
        assert call_kwargs["dsn"] == "https://key@sentry.io/123"
        assert call_kwargs["environment"] == "production"
        assert call_kwargs["traces_sample_rate"] == 0.05
        assert call_kwargs["before_send"] == before_send


class TestSentryTagMiddleware:
    """Test that Sentry tags are set during request processing."""

    @pytest.mark.anyio
    async def test_request_id_set_as_sentry_tag(self):
        import httpx
        import sentry_sdk as real_sentry
        from fastapi import FastAPI
        from app.core.middleware import SentryTagMiddleware
        from app.core.request_logging import RequestLoggingMiddleware

        app = FastAPI()
        app.add_middleware(SentryTagMiddleware)
        app.add_middleware(RequestLoggingMiddleware)

        @app.get("/test")
        async def test_endpoint():
            return {"status": "ok"}

        transport = httpx.ASGITransport(app=app)
        with patch.object(real_sentry, "set_tag") as mock_set_tag:
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/test",
                    headers={"X-Request-ID": "test-req-id-abc"},
                )

            assert response.status_code == 200
            # Verify set_tag was called with request_id
            tag_calls = {call[0][0]: call[0][1] for call in mock_set_tag.call_args_list}
            assert tag_calls.get("request_id") == "test-req-id-abc"
