from __future__ import annotations

from app.services.openai_agents_trace import (
    build_trace_config,
    normalize_stream_event,
    redact_trace_payload,
)
from app.services.openai_agents_version import ADAPTER_VERSION


def test_sensitive_trace_data_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SMARTSPEC_OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA", raising=False)
    monkeypatch.delenv("OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA", raising=False)

    config = build_trace_config()

    assert config.include_sensitive_data is False
    assert config.production_safe is True


def test_external_sdk_trace_export_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SMARTSPEC_OPENAI_AGENTS_TRACE_EXPORT_ENABLED", raising=False)

    config = build_trace_config()

    assert config.external_export_enabled is False
    assert config.export_mode == "platform_redacted_only"


def test_redaction_removes_tokens_signed_urls_cookies_and_provider_keys():
    payload = {
        "authorization": "Bearer secret.jwt.token",
        "cookie": "sessionid=abc123; csrftoken=def456",
        "signedUrl": "https://example.com/file?X-Amz-Signature=abcdef&token=opaque",
        "providerApiKey": "sk-live-direct-provider",
        "nested": {
            "x-api-key": "another-secret",
            "url": "https://example.com/object?signature=12345",
        },
    }

    redacted = redact_trace_payload(payload)

    rendered = str(redacted)
    assert "secret.jwt.token" not in rendered
    assert "abc123" not in rendered
    assert "sk-live-direct-provider" not in rendered
    assert "another-secret" not in rendered
    assert "[REDACTED]" in rendered


def test_trace_event_includes_sdk_and_adapter_versions():
    event = normalize_stream_event(
        raw_event={"type": "response.output_text.delta", "delta": "hello"},
        surface="chat",
        request_id="request_demo",
        idempotency_key="idem_demo",
        sequence=1,
        trace_id="trace_demo",
    )

    assert event.adapterVersion == ADAPTER_VERSION
    assert event.sdkVersion
    assert event.idempotencyKey == "idem_demo"
