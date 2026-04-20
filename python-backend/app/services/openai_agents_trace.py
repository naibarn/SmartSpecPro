from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass, is_dataclass
from typing import Any

from app.services.openai_agents_contracts import (
    AgentRuntimeEvent,
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    CURRENT_RUNTIME_CONTRACT_VERSION,
    CURRENT_TRACE_SCHEMA_VERSION,
    RuntimeSurface,
)
from app.services.openai_agents_version import ADAPTER_VERSION, get_effective_openai_agents_version

_SENSITIVE_KEY_NAMES = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "api_key",
    "providerapikey",
    "provider_api_key",
    "openai_api_key",
    "anthropic_api_key",
    "signedurl",
    "signed_url",
    "token",
    "access_token",
    "refresh_token",
}
_BEARER_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE)
_SK_KEY_PATTERN = re.compile(r"\b(?:sk|rk|pk)-[A-Za-z0-9_\-]+\b")
_QUERY_SECRET_PATTERN = re.compile(
    r"(?P<name>(?:token|sig|signature|x-amz-signature))=[^&\s]+",
    re.IGNORECASE,
)
_JWT_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_\-]+=*\.[A-Za-z0-9_\-]+=*\.[A-Za-z0-9_\-]+=*\b")


def _normalize_sensitive_key_name(value: str) -> str:
    return value.lower().replace("-", "").replace("_", "")


_NORMALIZED_SENSITIVE_KEY_NAMES = {
    _normalize_sensitive_key_name(key) for key in _SENSITIVE_KEY_NAMES
}


@dataclass(frozen=True)
class TraceRuntimeConfig:
    include_sensitive_data: bool
    external_export_enabled: bool
    sdk_tracing_enabled: bool
    export_mode: str
    production_safe: bool


def _env_truthy(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_trace_config() -> TraceRuntimeConfig:
    include_sensitive_data = _env_truthy(
        "SMARTSPEC_OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA",
        default=False,
    )
    if "SMARTSPEC_OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA" not in os.environ:
        include_sensitive_data = _env_truthy(
            "OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA",
            default=False,
        )
    external_export_enabled = _env_truthy(
        "SMARTSPEC_OPENAI_AGENTS_TRACE_EXPORT_ENABLED",
        default=False,
    )
    sdk_tracing_enabled = _env_truthy(
        "SMARTSPEC_OPENAI_AGENTS_SDK_TRACING_ENABLED",
        default=False,
    )
    export_mode = "platform_redacted_only"
    if external_export_enabled:
        export_mode = "sdk_external_export"
    elif not sdk_tracing_enabled:
        export_mode = "platform_redacted_only"

    return TraceRuntimeConfig(
        include_sensitive_data=include_sensitive_data,
        external_export_enabled=external_export_enabled,
        sdk_tracing_enabled=sdk_tracing_enabled,
        export_mode=export_mode,
        production_safe=(not include_sensitive_data and not external_export_enabled),
    )


def _to_jsonable(value: Any) -> Any:
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return model_dump(mode="json", exclude_none=True)
        except TypeError:
            return model_dump()
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_to_jsonable(item) for item in value]
    if hasattr(value, "__dict__") and not isinstance(value, type):
        return {
            str(key): _to_jsonable(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return value


def _redact_string(value: str) -> str:
    redacted = _BEARER_PATTERN.sub("Bearer [REDACTED]", value)
    redacted = _SK_KEY_PATTERN.sub("[REDACTED]", redacted)
    redacted = _JWT_PATTERN.sub("[REDACTED]", redacted)
    redacted = _QUERY_SECRET_PATTERN.sub(lambda match: f"{match.group('name')}=[REDACTED]", redacted)
    return redacted


def redact_trace_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        redacted: dict[str, Any] = {}
        for key, value in payload.items():
            normalized_key = _normalize_sensitive_key_name(str(key))
            if normalized_key in _NORMALIZED_SENSITIVE_KEY_NAMES:
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = redact_trace_payload(value)
        return redacted
    if isinstance(payload, list):
        return [redact_trace_payload(item) for item in payload]
    if isinstance(payload, tuple):
        return [redact_trace_payload(item) for item in payload]
    if isinstance(payload, str):
        return _redact_string(payload)
    return payload


def _extract_event_name(raw_event: Any) -> str:
    if isinstance(raw_event, dict):
        return str(raw_event.get("name") or raw_event.get("type") or "stream_event")
    return str(
        getattr(raw_event, "name", None)
        or getattr(raw_event, "type", None)
        or raw_event.__class__.__name__
    )


def _extract_event_payload(raw_event: Any) -> dict[str, Any]:
    jsonable = _to_jsonable(raw_event)
    if isinstance(jsonable, dict):
        return jsonable
    return {"value": jsonable}


def _stable_event_id(
    *,
    request_id: str,
    idempotency_key: str,
    event_name: str,
    raw_payload: dict[str, Any],
    sequence: int,
    trace_id: str | None,
    step_id: str | None,
    step_key: str | None,
    attempt_id: str | None,
) -> str:
    raw_id = raw_payload.get("id") or raw_payload.get("event_id")
    identity_source = {
        "requestId": request_id,
        "idempotencyKey": idempotency_key,
        "eventName": event_name,
        "rawId": raw_id,
        "sequence": sequence,
        "traceId": trace_id,
        "stepId": step_id,
        "stepKey": step_key,
        "attemptId": attempt_id,
        "payload": redact_trace_payload(raw_payload),
    }
    canonical = json.dumps(identity_source, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def normalize_stream_event(
    *,
    raw_event: Any,
    surface: RuntimeSurface,
    request_id: str,
    idempotency_key: str,
    sequence: int,
    trace_id: str | None = None,
    step_id: str | None = None,
    step_key: str | None = None,
    attempt_id: str | None = None,
    source_component: str = "openai_agents_adapter",
) -> AgentRuntimeEvent:
    event_name = _extract_event_name(raw_event)
    payload = _extract_event_payload(raw_event)
    redacted_payload = redact_trace_payload(payload)
    event_id = _stable_event_id(
        request_id=request_id,
        idempotency_key=idempotency_key,
        event_name=event_name,
        raw_payload=payload,
        sequence=sequence,
        trace_id=trace_id,
        step_id=step_id,
        step_key=step_key,
        attempt_id=attempt_id,
    )
    return AgentRuntimeEvent.model_validate(
        {
            "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
            "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
            "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
            "eventId": event_id,
            "eventName": event_name,
            "surface": surface,
            "requestId": request_id,
            "idempotencyKey": idempotency_key,
            "sequence": sequence,
            "sourceComponent": source_component,
            "traceId": trace_id,
            "stepId": step_id,
            "stepKey": step_key,
            "attemptId": attempt_id,
            "sdkVersion": get_effective_openai_agents_version(),
            "adapterVersion": ADAPTER_VERSION,
            "redactedPayload": redacted_payload,
        }
    )
