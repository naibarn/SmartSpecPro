"""
UVoice Provider

Thin async client for UVoice text-to-speech API.

Docs: https://www.uvoice.app/api-docs
"""

import base64
import json
import time
from typing import Any, Dict, Optional

import httpx
import structlog

logger = structlog.get_logger()


def _get_api_config_value(api_config: Optional[Dict[str, Any]], *keys: str) -> Optional[str]:
    if not isinstance(api_config, dict):
        return None

    for key in keys:
        value = api_config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_str(value: Any, *keys: str) -> Optional[str]:
    if not isinstance(value, dict):
        return None

    for key in keys:
        candidate = value.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _extract_audio_url(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None

    direct = _extract_str(payload, "audio_url", "audioUrl", "url", "result_url", "resultUrl")
    if direct:
        return direct

    for key in ("data", "result", "output", "response"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            nested_url = _extract_audio_url(nested)
            if nested_url:
                return nested_url
    return None


def _extract_audio_base64(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None

    direct = _extract_str(payload, "audio_base64", "audioBase64", "base64", "audio")
    if direct:
        return direct

    for key in ("data", "result", "output", "response"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            nested_b64 = _extract_audio_base64(nested)
            if nested_b64:
                return nested_b64
    return None


def _mime_from_output_format(output_format: Optional[str]) -> str:
    normalized = str(output_format or "").strip().lower()
    if normalized == "wav" or normalized.startswith("wav"):
        return "audio/wav"
    if normalized == "ogg" or normalized.startswith("ogg"):
        return "audio/ogg"
    return "audio/mpeg"


class UVoiceProvider:
    BASE_URL = "https://api.uvoice.ai"

    # Internal SmartSpec model IDs for fallback routing when DB metadata is unavailable.
    AUDIO_MODELS: frozenset[str] = frozenset({
        "uvoice/tts-standard",
        "uvoice/tts-natural",
        "uvoice/tts-premium",
    })

    def __init__(self, api_key: str, base_url: Optional[str] = None):
        self._api_key = api_key
        self.base_url = (base_url or self.BASE_URL).rstrip("/")
        self.client = httpx.AsyncClient(timeout=120.0)
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        logger.info("uvoice_provider_init", base_url=self.base_url)

    async def _post_json(self, endpoint: str, payload: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], httpx.Response]:
        url = endpoint
        if not endpoint.startswith(("http://", "https://")):
            url = f"{self.base_url}/{endpoint.lstrip('/')}"

        response = await self.client.post(url, headers=self._headers, json=payload)
        response.raise_for_status()

        content_type = (response.headers.get("content-type") or "").lower()
        if "json" in content_type:
            return response.json(), response

        body_text = response.text or ""
        if body_text.strip().startswith("{") or body_text.strip().startswith("["):
            try:
                parsed = json.loads(body_text)
                if isinstance(parsed, dict):
                    return parsed, response
            except json.JSONDecodeError:
                pass
        return None, response

    async def generate_audio(self, model: str, text: str, **kwargs) -> Dict[str, Any]:
        """
        Generate audio via UVoice /generate.

        Supports table-driven runtime config via api_config + extra_params.
        """
        api_config = kwargs.pop("api_config", None)
        extra_params = kwargs.pop("extra_params", None)

        endpoint = (
            _get_api_config_value(api_config, "endpoint", "api_endpoint", "apiEndpoint")
            or "/generate"
        )

        settings: Dict[str, Any] = {}
        if text:
            settings["text"] = text

        # Standard request fields.
        if kwargs.get("voice_id"):
            settings["voiceID"] = kwargs["voice_id"]
        elif kwargs.get("voice"):
            settings["voiceID"] = kwargs["voice"]
        if kwargs.get("speed") is not None:
            settings["speed"] = kwargs["speed"]
        if kwargs.get("volume") is not None:
            settings["volume"] = kwargs["volume"]
        if kwargs.get("pitch") is not None:
            settings["pitch"] = kwargs["pitch"]
        if kwargs.get("key") is not None:
            settings["key"] = kwargs["key"]
        if kwargs.get("auto_break") is not None:
            settings["autoBreak"] = kwargs["auto_break"]
        if kwargs.get("output_format"):
            settings["outputFormat"] = kwargs["output_format"]
        if kwargs.get("output_type"):
            settings["outputType"] = kwargs["output_type"]

        # Merge table-driven extra params.
        allowed_setting_keys = {
            "text",
            "voiceID",
            "autoBreak",
            "outputFormat",
            "outputType",
            "speed",
            "volume",
            "pitch",
            "key",
        }
        if isinstance(extra_params, dict):
            for key, value in extra_params.items():
                if value is None:
                    continue
                normalized_key = str(key)
                if normalized_key == "voice":
                    normalized_key = "voiceID"
                elif normalized_key == "voice_id":
                    normalized_key = "voiceID"
                elif normalized_key == "auto_break":
                    normalized_key = "autoBreak"
                elif normalized_key == "output_format":
                    normalized_key = "outputFormat"
                elif normalized_key == "output_type":
                    normalized_key = "outputType"
                if normalized_key in allowed_setting_keys:
                    settings[normalized_key] = value

        # Optional config-level defaults (if not already set by request).
        config_voice = _get_api_config_value(api_config, "voice_id", "voiceId", "voiceID", "voice")
        config_output_type = _get_api_config_value(api_config, "output_type", "outputType")
        config_output_format = _get_api_config_value(api_config, "output_format", "outputFormat")
        if config_voice and "voiceID" not in settings:
            settings["voiceID"] = config_voice
        if config_output_type and "outputType" not in settings:
            settings["outputType"] = config_output_type
        if config_output_format and "outputFormat" not in settings:
            settings["outputFormat"] = config_output_format

        # SmartSpec expects URL-based media for downstream preview/history.
        if "outputType" not in settings:
            settings["outputType"] = "url"
        if "outputFormat" not in settings:
            settings["outputFormat"] = "mp3"

        if not settings.get("voiceID"):
            raise RuntimeError("UVoice requires voiceID")

        # Optional model forwarding from config.
        explicit_model = _get_api_config_value(
            api_config,
            "uvoice_model_id",
            "uvoiceModelId",
            "model_id",
            "modelId",
        )
        payload: Dict[str, Any] = {"settings": settings}
        if explicit_model:
            payload["model"] = explicit_model

        logger.info(
            "uvoice_generate_audio_request",
            model=model,
            endpoint=endpoint,
            output_type=settings.get("outputType"),
            has_voice=bool(settings.get("voiceID")),
        )

        parsed_json: Optional[Dict[str, Any]] = None
        response: Optional[httpx.Response] = None
        try:
            parsed_json, response = await self._post_json(endpoint, payload)
        except httpx.HTTPStatusError as e:
            logger.error("uvoice_http_error", status=e.response.status_code, body=e.response.text[:1000])
            raise
        except httpx.RequestError as e:
            logger.error("uvoice_request_error", error=str(e))
            raise

        created = int(time.time())
        request_id = (
            _extract_str(parsed_json, "request_id", "requestId", "id", "task_id", "taskId")
            if parsed_json else None
        ) or (response.headers.get("x-request-id") if response else None) or f"uvoice-{created}"

        if parsed_json:
            success_flag = parsed_json.get("success")
            if success_flag is False:
                message = _extract_str(parsed_json, "message", "error", "detail") or "UVoice request failed"
                raise RuntimeError(message)

            audio_url = _extract_audio_url(parsed_json)
            audio_b64 = _extract_audio_base64(parsed_json)
            if not audio_url and audio_b64:
                mime = _mime_from_output_format(str(settings.get("outputFormat") or ""))
                audio_url = f"data:{mime};base64,{audio_b64}"

            if audio_url:
                return {
                    "id": request_id,
                    "status": "completed",
                    "created": created,
                    "data": [{"url": audio_url}],
                    "raw_response": parsed_json,
                    "uvoice_credits_charged": parsed_json.get("credits_charged"),
                    "uvoice_characters_used": parsed_json.get("characters_used"),
                }

        # If JSON was absent or had no URL, treat as binary and encode as data URL.
        if response and response.content:
            mime = _mime_from_output_format(str(settings.get("outputFormat") or ""))
            encoded = base64.b64encode(response.content).decode("ascii")
            return {
                "id": request_id,
                "status": "completed",
                "created": created,
                "data": [{"url": f"data:{mime};base64,{encoded}"}],
                "raw_response": parsed_json if parsed_json is not None else {},
            }

        raise RuntimeError("UVoice response did not contain audio URL or binary payload")

    async def aclose(self) -> None:
        await self.client.aclose()
