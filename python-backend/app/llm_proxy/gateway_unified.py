import base64
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, Optional, List, Literal, Union
import re
import math
import mimetypes
import httpx
from uuid import uuid4
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.llm_proxy.proxy import LLMProxy, LLMProviderError
from app.llm_proxy.unified_client import get_unified_client, UnifiedLLMClient
from app.llm_proxy.models import LLMRequest, LLMResponse, ImageGenerationRequest, ImageGenerationResponse, VideoGenerationRequest, VideoGenerationResponse, AudioGenerationRequest, AudioGenerationResponse
from app.services.credit_service import CreditService, InsufficientCreditsError
from app.services.media_debug_trace import write_media_debug_event
from app.services.web_gateway_client import get_gateway_client
from app.core.credits import usd_to_credits, credits_to_usd
from app.models.user import User

# R2 storage is optional - only needed for uploading reference images
try:
    from app.services.r2_storage_service import get_r2_storage_service
    R2_STORAGE_AVAILABLE = True
except ImportError:
    R2_STORAGE_AVAILABLE = False
    get_r2_storage_service = None

logger = structlog.get_logger()


# Cost estimation matrix for different task types and priorities
COST_PER_1K_TOKENS = {
    ("planning", "quality"): Decimal("0.03"),      # GPT-4
    ("planning", "cost"): Decimal("0.001"),        # Gemini Pro
    ("planning", "speed"): Decimal("0.0001"),      # Groq
    ("code_generation", "quality"): Decimal("0.015"),  # Claude Sonnet
    ("code_generation", "cost"): Decimal("0.0"),   # Ollama
    ("code_generation", "speed"): Decimal("0.0001"),   # Groq
    ("analysis", "quality"): Decimal("0.015"),     # Claude Sonnet
    ("analysis", "cost"): Decimal("0.001"),        # Gemini Pro
    ("analysis", "speed"): Decimal("0.0001"),      # Groq
    ("decision", "quality"): Decimal("0.03"),      # GPT-4
    ("decision", "cost"): Decimal("0.0075"),       # Claude Haiku
    ("decision", "speed"): Decimal("0.0001"),      # Groq
    ("simple", "quality"): Decimal("0.0015"),      # GPT-3.5
    ("simple", "cost"): Decimal("0.0"),            # Ollama
    ("simple", "speed"): Decimal("0.0015"),        # GPT-3.5
}

# Model selection matrix for OpenRouter
MODEL_MATRIX = {
    ("code_generation", "quality"): "anthropic/claude-3.5-sonnet",
    ("code_generation", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("code_generation", "speed"): "google/gemini-flash-1.5",
    ("analysis", "quality"): "openai/gpt-4o",
    ("analysis", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("analysis", "speed"): "google/gemini-flash-1.5",
    ("planning", "quality"): "anthropic/claude-3.5-sonnet",
    ("planning", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("planning", "speed"): "openai/gpt-4o-mini",
    ("simple", "quality"): "openai/gpt-4o-mini",
    ("simple", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("simple", "speed"): "google/gemini-flash-1.5",
    ("decision", "quality"): "anthropic/claude-3.5-sonnet",
    ("decision", "cost"): "meta-llama/llama-3.1-70b-instruct",
    ("decision", "speed"): "openai/gpt-4o",
}


class LLMGateway:
    """
    Unified LLM Gateway with credit checking and multi-provider support.
    
    This gateway provides a single entry point for all LLM operations,
    supporting both direct provider access and OpenRouter routing.
    
    Flow:
    1. Authenticate user (via dependency injection)
    2. Estimate LLM cost
    3. Check sufficient credits
    4. Call LLM (direct or via OpenRouter)
    5. Calculate actual cost
    6. Deduct credits
    7. Return response with credit info
    
    Usage:
        gateway = LLMGateway(db)
        response = await gateway.invoke(request, user)
    """

    @staticmethod
    def _format_provider_http_error(prefix: str, exc: httpx.HTTPStatusError) -> str:
        """Include provider response details for debuggable media failures."""
        detail = ""
        try:
            payload = exc.response.json()
            if isinstance(payload, dict):
                for key in ("message", "detail", "error", "errorMessage", "msg"):
                    value = payload.get(key)
                    if isinstance(value, str) and value.strip():
                        detail = value.strip()
                        break
                    if isinstance(value, dict):
                        nested = (
                            value.get("message")
                            or value.get("detail")
                            or value.get("error")
                            or value.get("errorMessage")
                            or value.get("msg")
                        )
                        if isinstance(nested, str) and nested.strip():
                            detail = nested.strip()
                            break
                if not detail and payload:
                    detail = str(payload)
            else:
                detail = str(payload)
        except Exception:
            detail = (exc.response.text or "").strip()

        if detail:
            return f"{prefix}: HTTP {exc.response.status_code} - {detail[:500]}"
        return f"{prefix}: HTTP {exc.response.status_code}"
    
    def __init__(self, db: AsyncSession):
        """
        Initialize the gateway with database session.
        
        Args:
            db: AsyncSession for database operations
        """
        self.db = db
        self.llm_proxy = LLMProxy()
        self.unified_client = get_unified_client()
        self.credit_service = CreditService(db)
        self.web_gateway = get_gateway_client()

    @staticmethod
    def _normalize_model_id(model: Optional[str]) -> str:
        if not model:
            return ""
        return re.sub(r"[^a-z0-9]+", "-", model.strip().lower()).strip("-")

    @staticmethod
    def _normalize_provider_id(provider: Optional[str]) -> str:
        if not provider:
            return ""

        normalized = re.sub(r"[^a-z0-9]+", "_", provider.strip().lower()).strip("_")
        if normalized in {"byteplus", "modelark", "byteplus_modelark", "byteplus_model_ark"}:
            return "byteplus_modelark"
        if normalized in {"kie", "kie_ai", "kieai"}:
            return "kie_ai"
        if normalized in {"uvoice", "u_voice", "uvoice_ai", "uvoiceapp"}:
            return "uvoice"
        if normalized in {"knplabs", "knplabai", "knplabs_ai", "knplabsai"}:
            return "knplabai"
        if normalized in {"fal", "fal_ai", "falai", "fal_ai_provider"}:
            return "fal_ai"
        if normalized in {"wavespeed_ai", "wavespeedai"}:
            return "wavespeed_ai"
        if normalized in {"magnific", "magnific_api", "magnific_ai"}:
            return "magnific"
        if normalized in {"elevenlabs", "eleven_labs", "elevenlabs_ai", "eleven_labs_ai"}:
            return "elevenlabs"
        return normalized

    @staticmethod
    def _get_api_config_string(
        api_config: Optional[Dict[str, Any]],
        *keys: str,
    ) -> Optional[str]:
        if not isinstance(api_config, dict):
            return None

        for key in keys:
            value = api_config.get(key)
            if isinstance(value, str):
                if value != "":
                    return value
        return None

    @staticmethod
    def _get_api_config_bool(
        api_config: Optional[Dict[str, Any]],
        *keys: str,
    ) -> Optional[bool]:
        if not isinstance(api_config, dict):
            return None

        truthy = {"1", "true", "yes", "on"}
        falsy = {"0", "false", "no", "off"}

        for key in keys:
            if key not in api_config:
                continue
            value = api_config.get(key)
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return value != 0
            if isinstance(value, str):
                normalized = value.strip().lower()
                if normalized in truthy:
                    return True
                if normalized in falsy:
                    return False
        return None

    @staticmethod
    def _get_request_extra_params(
        request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
    ) -> Dict[str, Any]:
        extra_params = getattr(request, "extra_params", None)
        return extra_params if isinstance(extra_params, dict) else {}

    @classmethod
    def _get_reserved_credit_amount(
        cls,
        request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
    ) -> Optional[Decimal]:
        reserved_value = cls._get_request_extra_params(request).get("__reserved_credits")
        if reserved_value is None:
            return None

        try:
            reserved_credits = Decimal(str(reserved_value))
        except (InvalidOperation, TypeError, ValueError):
            return None

        return reserved_credits if reserved_credits > 0 else None

    @classmethod
    def _get_reserved_cost_usd(
        cls,
        request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
    ) -> Optional[Decimal]:
        reserved_credits = cls._get_reserved_credit_amount(request)
        if reserved_credits is None:
            return None
        return credits_to_usd(int(reserved_credits))

    @staticmethod
    def _get_pricing_value_by_path(source: Dict[str, Any], path: str) -> Any:
        if not path:
            return None

        current: Any = source
        for segment in str(path).split("."):
            if not segment:
                continue
            if not isinstance(current, dict):
                return None
            current = current.get(segment)
        return current

    @classmethod
    def _build_media_pricing_tier_key(cls, config: Dict[str, Any], request_payload: Dict[str, Any]) -> str:
        formula = str(config.get("pricingFormula", "flat") or "flat")
        pricing_tiers = config.get("pricingTiers")
        if not isinstance(pricing_tiers, dict):
            pricing_tiers = {}

        raw_input_fields = config.get("inputFields")
        indexed_pricing_fields: List[tuple[int, Dict[str, Any]]] = []
        if isinstance(raw_input_fields, list):
            for index, field in enumerate(raw_input_fields):
                if isinstance(field, dict) and field.get("affectsPricing"):
                    indexed_pricing_fields.append((index, field))

        indexed_pricing_fields.sort(
            key=lambda item: (
                {"resolution": 0, "quality": 1, "duration": 2}.get(str(item[1].get("key", "")), 99),
                item[0],
            )
        )

        if formula == "per_unit":
            return "default"

        if formula == "per_duration":
            duration = cls._get_pricing_value_by_path(request_payload, "duration")
            if duration is None:
                duration_field = next(
                    (field for _, field in indexed_pricing_fields if str(field.get("key")) == "duration"),
                    None,
                )
                duration = duration_field.get("default") if duration_field else None
            if duration not in (None, ""):
                duration_key = str(duration)
                return duration_key if duration_key.endswith("s") else f"{duration_key}s"
            return "default"

        if formula == "matrix":
            parts: List[str] = []
            for _, field in indexed_pricing_fields:
                field_key = str(field.get("key") or "").strip()
                if not field_key:
                    continue
                value = cls._get_pricing_value_by_path(request_payload, field_key)
                if value is None:
                    value = field.get("default")
                if value in (None, ""):
                    continue
                value_str = str(value)
                if field_key == "duration" and not value_str.endswith("s"):
                    value_str = f"{value_str}s"
                parts.append(value_str)
            return "-".join(parts) if parts else "default"

        if len(indexed_pricing_fields) == 1:
            field = indexed_pricing_fields[0][1]
            field_key = str(field.get("key") or "").strip()
            value = cls._get_pricing_value_by_path(request_payload, field_key)
            if value is None:
                value = field.get("default")
            if value in (None, ""):
                return "default"
            value_str = str(value)
            if field_key == "duration" and not value_str.endswith("s"):
                value_str = f"{value_str}s"
            return value_str

        if formula == "flat":
            resolution = cls._get_pricing_value_by_path(request_payload, "resolution")
            if resolution is not None and str(resolution) in pricing_tiers:
                return str(resolution)

        return "default"

    @staticmethod
    def _apply_text_affix_once(text: str, prefix: str, suffix: str) -> str:
        if not isinstance(text, str) or (not prefix and not suffix):
            return text

        updated = text
        if prefix and not updated.startswith(prefix):
            updated = f"{prefix}{updated}"
        if suffix and not updated.endswith(suffix):
            updated = f"{updated}{suffix}"
        return updated

    @classmethod
    def _apply_affix_to_dialogue_payload(
        cls,
        value: Any,
        prefix: str,
        suffix: str,
    ) -> Any:
        if isinstance(value, list):
            return [cls._apply_affix_to_dialogue_payload(item, prefix, suffix) for item in value]
        if isinstance(value, dict):
            updated = dict(value)
            text_value = updated.get("text")
            if isinstance(text_value, str):
                updated["text"] = cls._apply_text_affix_once(text_value, prefix, suffix)
            return updated
        return value

    @staticmethod
    def _request_has_tts_voice_hints(request: AudioGenerationRequest) -> bool:
        if isinstance(request.voice, str) and request.voice.strip():
            return True
        if isinstance(request.voice_id, str) and request.voice_id.strip():
            return True

        if not isinstance(request.extra_params, dict):
            return False

        for key in ("voice", "voice_id", "voiceId", "voiceID"):
            value = request.extra_params.get(key)
            if isinstance(value, str) and value.strip():
                return True

        for key in ("dialogue", "dialogues"):
            if key in request.extra_params:
                return True

        return False

    @staticmethod
    def _extract_audio_voice_hint(request: AudioGenerationRequest) -> Optional[str]:
        if isinstance(request.voice_id, str) and request.voice_id.strip():
            return request.voice_id.strip()
        if isinstance(request.voice, str) and request.voice.strip():
            return request.voice.strip()
        if not isinstance(request.extra_params, dict):
            return None
        for key in ("voiceID", "voiceId", "voice_id", "voice"):
            value = request.extra_params.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @classmethod
    def _build_uvoice_fallback_requests(
        cls,
        request: AudioGenerationRequest,
    ) -> List[AudioGenerationRequest]:
        normalized_model = cls._normalize_model_id(request.model)
        selected_voice = cls._extract_audio_voice_hint(request)
        extra_params = dict(request.extra_params) if isinstance(request.extra_params, dict) else {}
        candidates: List[tuple[str, str]] = []

        if normalized_model.endswith("tts-natural"):
            candidates.append(("uvoice/tts-standard", "TH-TigerSD"))
        elif normalized_model.endswith("tts-standard"):
            candidates.append(("uvoice/tts-standard", "TH-TigerSD"))
        elif normalized_model.endswith("tts-premium"):
            candidates.extend([
                ("uvoice/tts-premium", "TH-KantapongPremiumHD"),
                ("uvoice/tts-premium", "TH-BowkyPremiumHD"),
            ])

        fallback_requests: List[AudioGenerationRequest] = []
        seen: set[tuple[str, str]] = set()
        for model_id, voice_id in candidates:
            key = (model_id, voice_id)
            if key in seen:
                continue
            seen.add(key)
            if model_id == request.model and voice_id == selected_voice:
                continue

            next_extra_params = {
                **extra_params,
                "voiceID": voice_id,
            }
            next_extra_params.pop("voiceId", None)
            next_extra_params.pop("voice_id", None)
            next_extra_params.pop("voice", None)

            updates: Dict[str, Any] = {
                "model": model_id,
                "voice": None,
                "voice_id": voice_id,
                "extra_params": next_extra_params,
            }
            if hasattr(request, "model_copy"):
                fallback_requests.append(request.model_copy(update=updates))  # Pydantic v2
            else:
                fallback_requests.append(request.copy(update=updates))  # Pydantic v1 fallback
        return fallback_requests

    @classmethod
    def _normalize_audio_request_for_generation(
        cls,
        request: AudioGenerationRequest,
    ) -> AudioGenerationRequest:
        api_config = request.api_config if isinstance(request.api_config, dict) else {}

        text_prefix = cls._get_api_config_string(
            api_config,
            "text_prefix",
            "textPrefix",
            "audio_text_prefix",
            "audioTextPrefix",
            "input_text_prefix",
            "inputTextPrefix",
        ) or ""
        text_suffix = cls._get_api_config_string(
            api_config,
            "text_suffix",
            "textSuffix",
            "audio_text_suffix",
            "audioTextSuffix",
            "input_text_suffix",
            "inputTextSuffix",
        ) or ""

        if not text_prefix:
            prepend_newline = cls._get_api_config_bool(
                api_config,
                "prepend_newline",
                "prependNewline",
                "inject_leading_newline",
                "injectLeadingNewline",
                "prevent_first_word_clipping",
                "preventFirstWordClipping",
            )
            if prepend_newline is None:
                prepend_newline = cls._request_has_tts_voice_hints(request)
            if prepend_newline is True:
                text_prefix = "\n"

        if not text_prefix and not text_suffix:
            return request

        updated_text = cls._apply_text_affix_once(request.text, text_prefix, text_suffix)
        updated_extra_params = request.extra_params

        if isinstance(request.extra_params, dict):
            updated_extra_params = dict(request.extra_params)

            if isinstance(updated_extra_params.get("text"), str):
                updated_extra_params["text"] = cls._apply_text_affix_once(
                    updated_extra_params["text"],
                    text_prefix,
                    text_suffix,
                )

            apply_to_dialogue = cls._get_api_config_bool(
                api_config,
                "apply_text_affix_to_dialogue",
                "applyTextAffixToDialogue",
                "apply_affix_to_dialogue",
                "applyAffixToDialogue",
            )
            if apply_to_dialogue is not False:
                for dialogue_key in ("dialogue", "dialogues"):
                    if dialogue_key in updated_extra_params:
                        updated_extra_params[dialogue_key] = cls._apply_affix_to_dialogue_payload(
                            updated_extra_params[dialogue_key],
                            text_prefix,
                            text_suffix,
                        )

        updates: Dict[str, Any] = {}
        if updated_text != request.text:
            updates["text"] = updated_text
        if isinstance(updated_extra_params, dict) and updated_extra_params != request.extra_params:
            updates["extra_params"] = updated_extra_params

        if not updates:
            return request

        logger.info(
            "audio_request_text_affix_applied",
            model=request.model,
            applied_to_text=updated_text != request.text,
            applied_to_extra_params=isinstance(updated_extra_params, dict) and updated_extra_params != request.extra_params,
            prefix_length=len(text_prefix),
            suffix_length=len(text_suffix),
        )

        if hasattr(request, "model_copy"):
            return request.model_copy(update=updates)  # Pydantic v2
        return request.copy(update=updates)  # Pydantic v1 fallback

    async def _resolve_media_provider(
        self,
        model_id: str,
        api_config: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        # 1) Explicit provider hint from caller payload
        if isinstance(api_config, dict):
            for key in ("provider", "provider_id", "providerId", "providerName"):
                value = api_config.get(key)
                if isinstance(value, str) and value.strip():
                    return self._normalize_provider_id(value)

        # 2) Provider from media_models table
        try:
            from sqlalchemy import text

            candidates: List[str] = []
            for candidate in (
                model_id,
                model_id.strip(),
                self._normalize_model_id(model_id),
                model_id.replace(".", "-"),
                model_id.replace("_", "-"),
                model_id.replace("-", "."),
            ):
                if candidate and candidate not in candidates:
                    candidates.append(candidate)

            for candidate in candidates:
                result = await self.db.execute(
                    text('SELECT "provider" FROM media_models WHERE lower("modelId") = lower(:model_id) LIMIT 1'),
                    {"model_id": candidate},
                )
                row = result.fetchone()
                if row and row[0]:
                    return self._normalize_provider_id(str(row[0]))
        except Exception as e:
            logger.warning("resolve_media_provider_failed", model=model_id, error=str(e))

        return None

    async def _upload_generated_media_bytes(
        self,
        *,
        user_id: int,
        job_id: str,
        media_type: str,
        payload: bytes,
        content_type: str,
        ext: str,
    ) -> str:
        if not R2_STORAGE_AVAILABLE or get_r2_storage_service is None:
            raise ImportError("R2 storage not available")

        from app.services.generation.r2_storage import StoragePath

        r2_service = get_r2_storage_service()
        if media_type == "video":
            key = StoragePath.video_generated(str(user_id), job_id, ext)
        elif media_type == "audio":
            key = StoragePath.audio_generated(str(user_id), job_id, ext)
        else:
            key = StoragePath.image_generated(str(user_id), job_id, ext)

        return await r2_service.upload_bytes(key, payload, content_type, db_session=self.db)

    async def _rehost_provider_media_url(
        self,
        *,
        user_id: int,
        job_id: str,
        media_type: str,
        url: str,
    ) -> str:
        """Download a provider result URL and upload it to platform storage."""
        from app.core.media_job_validators import validate_uri_strict

        validate_uri_strict(url)
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(300.0, connect=10.0),
            follow_redirects=True,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()

        content_type = response.headers.get("content-type", "application/octet-stream").split(";", 1)[0].strip()
        allowed_prefix = "video/" if media_type == "video" else "image/"
        if not content_type.startswith(allowed_prefix):
            raise ValueError(f"Magnific returned unsupported {media_type} content type")
        ext = mimetypes.guess_extension(content_type) or (".mp4" if media_type == "video" else ".png")
        return await self._upload_generated_media_bytes(
            user_id=user_id,
            job_id=job_id,
            media_type=media_type,
            payload=response.content,
            content_type=content_type,
            ext=ext.lstrip("."),
        )

    @staticmethod
    def _extract_first_url_from_payload(payload: Any) -> Optional[str]:
        if isinstance(payload, dict):
            for key in ("url", "image_url", "video_url", "audio_url", "result_url"):
                value = payload.get(key)
                if isinstance(value, str) and value.startswith("http"):
                    return value
            for key in ("data", "result", "output", "response"):
                nested = payload.get(key)
                if isinstance(nested, list):
                    for item in nested:
                        found = LLMGateway._extract_first_url_from_payload(item)
                        if found:
                            return found
                elif isinstance(nested, dict):
                    found = LLMGateway._extract_first_url_from_payload(nested)
                    if found:
                        return found
        elif isinstance(payload, list):
            for item in payload:
                found = LLMGateway._extract_first_url_from_payload(item)
                if found:
                    return found
        return None

    @staticmethod
    def _is_magnific_model_id(model_id: Optional[str]) -> bool:
        return isinstance(model_id, str) and model_id.strip().lower().startswith("magnific/")

    @staticmethod
    def _is_magnific_nano_banana_model_id(model_id: Optional[str]) -> bool:
        if not isinstance(model_id, str):
            return False
        normalized = model_id.strip().lower()
        return normalized in {"magnific/nano-banana-pro", "magnific/nano-banana-pro-flash"}

    @staticmethod
    def _normalize_magnific_reference_images(value: Any) -> list[dict[str, Any]]:
        if not isinstance(value, list):
            return []
        references: list[dict[str, Any]] = []
        for item in value[:3]:
            if isinstance(item, str) and item.strip():
                image_url = item.strip()
                references.append({
                    "image": image_url,
                    "mime_type": LLMGateway._infer_magnific_reference_mime_type(image_url),
                })
            elif isinstance(item, dict):
                image = item.get("image") or item.get("url") or item.get("image_url") or item.get("imageUrl")
                if isinstance(image, str) and image.strip():
                    normalized: dict[str, Any] = {"image": image.strip()}
                    text_value = item.get("text")
                    mime_type = item.get("mime_type") or item.get("mimeType")
                    if isinstance(text_value, str) and text_value.strip():
                        normalized["text"] = text_value.strip()
                    if isinstance(mime_type, str) and mime_type.strip():
                        normalized["mime_type"] = mime_type.strip()
                    else:
                        normalized["mime_type"] = LLMGateway._infer_magnific_reference_mime_type(image.strip())
                    references.append(normalized)
        return references

    @staticmethod
    def _infer_magnific_reference_mime_type(url: str) -> str:
        lower_url = url.split("?", 1)[0].lower()
        if lower_url.endswith((".jpg", ".jpeg")):
            return "image/jpeg"
        if lower_url.endswith(".webp"):
            return "image/webp"
        return "image/png"

    @staticmethod
    def _build_magnific_payload(
        request: Union[ImageGenerationRequest, VideoGenerationRequest],
    ) -> Dict[str, Any]:
        extra = request.extra_params if isinstance(request.extra_params, dict) else {}
        payload: Dict[str, Any] = {
            key: value
            for key, value in extra.items()
            if not str(key).startswith("__")
        }
        style_loras = payload.pop("style_lora_ids", payload.pop("style_lora_id", None))
        character_loras = payload.pop("character_lora_ids", payload.pop("character_lora_id", None))
        styling: Dict[str, Any] = dict(payload.get("styling")) if isinstance(payload.get("styling"), dict) else {}
        if style_loras:
            styling["styles"] = style_loras if isinstance(style_loras, list) else [style_loras]
        if character_loras:
            styling["characters"] = character_loras if isinstance(character_loras, list) else [character_loras]
        if styling:
            payload["styling"] = styling
        if getattr(request, "prompt", None):
            payload.setdefault("prompt", request.prompt)
        if getattr(request, "negative_prompt", None):
            payload.setdefault("negative_prompt", request.negative_prompt)
        if getattr(request, "aspect_ratio", None):
            payload.setdefault("aspect_ratio", request.aspect_ratio)
        if getattr(request, "resolution", None):
            payload.setdefault("resolution", request.resolution)
        if getattr(request, "duration", None):
            payload.setdefault("duration", request.duration)
        if getattr(request, "fps", None):
            payload.setdefault("fps", request.fps)
        if getattr(request, "seed", None) is not None:
            payload.setdefault("seed", request.seed)

        reference_image_urls = getattr(request, "reference_image_urls", None)
        if reference_image_urls:
            payload.setdefault("image_urls", reference_image_urls)
        reference_video_url = getattr(request, "reference_video_url", None)
        if reference_video_url:
            payload.setdefault("video_url", reference_video_url)
            payload.setdefault("video_urls", [reference_video_url])

        if LLMGateway._is_magnific_nano_banana_model_id(getattr(request, "model", None)):
            reference_images = (
                LLMGateway._normalize_magnific_reference_images(payload.pop("reference_images", None))
                or LLMGateway._normalize_magnific_reference_images(payload.pop("reference_image_urls", None))
                or LLMGateway._normalize_magnific_reference_images(payload.pop("image_urls", None))
            )
            allowed_keys = {
                "prompt",
                "reference_images",
                "aspect_ratio",
                "resolution",
                "use_google_search_tool",
            }
            payload = {key: value for key, value in payload.items() if key in allowed_keys}
            if reference_images:
                payload["reference_images"] = reference_images
            if isinstance(payload.get("prompt"), str) and len(payload["prompt"]) > 3000:
                payload["prompt"] = payload["prompt"][:3000]
            payload.setdefault("aspect_ratio", "1:1")
            if str(getattr(request, "model", "")).strip().lower() == "magnific/nano-banana-pro-flash":
                payload.setdefault("resolution", "1K")
            else:
                payload.setdefault("resolution", "2K")
        return payload
    
    async def invoke(
        self,
        request: LLMRequest,
        user: User,
        # Routing options
        use_openrouter: bool = True,
        # OpenRouter features
        fallback_models: Optional[List[str]] = None,
        sort: Optional[Literal["price", "throughput", "latency"]] = None,
        # Privacy controls
        data_collection: Literal["allow", "deny"] = "allow",
        zdr: Optional[bool] = None,
        # Cost control
        max_price: Optional[Dict[str, float]] = None,
    ) -> LLMResponse:
        """
        Invoke LLM with credit checking and automatic routing.
        
        Args:
            request: LLM request with messages, task_type, etc.
            user: Current authenticated user
            use_openrouter: Use OpenRouter for routing (default: True)
            fallback_models: List of fallback models for OpenRouter
            sort: Sort providers by price/throughput/latency
            data_collection: Allow or deny data collection
            zdr: Zero Data Retention mode
            max_price: Maximum price per 1K tokens
        
        Returns:
            LLMResponse with content, usage stats, and credit info
        
        Raises:
            HTTPException: 402 if insufficient credits, 503 if all providers fail
        """
        logger.info(
            "llm_gateway_invoke",
            user_id=user.id,
            task_type=request.task_type,
            budget_priority=request.budget_priority,
            use_openrouter=use_openrouter,
        )
        
        # Step 1: Estimate cost
        estimated_cost = await self._estimate_cost(request, use_openrouter)
        logger.info(
            "llm_cost_estimated",
            user_id=user.id,
            estimated_cost=float(estimated_cost),
        )
        
        # Step 2: Check sufficient credits
        await self._check_credits(user, estimated_cost)
        
        # Step 3: Call LLM
        if use_openrouter and self.unified_client.openrouter_client:
            response = await self._invoke_via_openrouter(
                request, user, fallback_models, sort,
                data_collection, zdr, max_price
            )
        else:
            response = await self._invoke_via_direct(request, user)
        
        # Step 4: Calculate actual cost
        actual_cost = self._calculate_actual_cost(response, use_openrouter)
        logger.info(
            "llm_cost_actual",
            user_id=user.id,
            actual_cost=float(actual_cost),
            estimated_cost=float(estimated_cost),
            difference=float(actual_cost - estimated_cost),
        )
        
        # Step 5: Deduct credits
        transaction = await self._deduct_credits(
            user, actual_cost, request, response, estimated_cost, use_openrouter
        )
        
        # Step 6: Add credit info to response
        response.credits_used = abs(transaction.amount)  # Return positive value for credits used
        response.credits_balance = transaction.balance_after
        
        return response

    async def generate_image(
        self,
        request: ImageGenerationRequest,
        user: User
    ) -> ImageGenerationResponse:
        """
        Generate image with credit checking.
        """
        logger.info("image_generation_request", user_id=user.id, model=request.model)
        api_config = request.api_config if isinstance(request.api_config, dict) else {}
        trace_id = str(
            api_config.get("trace_id")
            or api_config.get("debug_trace_id")
            or ""
        ).strip() or None
        log_file = write_media_debug_event("image.generate.start", {
            "trace_id": trace_id,
            "user_id": user.id,
            "model": request.model,
            "provider_hint": api_config.get("provider"),
            "api_config_keys": sorted(list(api_config.keys())),
            "has_reference_images": bool(request.reference_image_urls),
            "prompt_preview": (request.prompt or "")[:180],
        })

        reserved_credit_amount = self._get_reserved_credit_amount(request)
        if reserved_credit_amount is not None:
            estimated_cost = self._get_reserved_cost_usd(request) or Decimal("0")
            logger.info(
                "image_generation_using_reserved_credits",
                user_id=user.id,
                model=request.model,
                reserved_credits=float(reserved_credit_amount),
            )
        else:
            # Estimate cost via Web Gateway or use local estimate
            estimated_cost = await self._estimate_cost(request, False)
            await self._check_credits(user, estimated_cost)

        # --- BytePlus ModelArk routing ---
        from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
        resolved_provider = await self._resolve_media_provider(request.model, request.api_config)
        normalized_model = self._normalize_model_id(request.model)
        byteplus_image_models = {
            self._normalize_model_id(model_name)
            for model_name in BytePlusModelArkProvider.IMAGE_MODELS
        }
        route_to_byteplus = (
            resolved_provider == "byteplus_modelark"
            or normalized_model in byteplus_image_models
        )

        logger.info(
            "image_provider_routing",
            model=request.model,
            normalized_model=normalized_model,
            resolved_provider=resolved_provider,
            route="byteplus_modelark" if route_to_byteplus else "magnific" if resolved_provider == "magnific" or self._is_magnific_model_id(request.model) else "kie_ai",
        )
        write_media_debug_event("image.generate.routing", {
            "trace_id": trace_id,
            "task_log_file": log_file,
            "user_id": user.id,
            "model": request.model,
            "normalized_model": normalized_model,
            "resolved_provider": resolved_provider,
            "provider_hint": api_config.get("provider"),
            "route": "byteplus_modelark" if route_to_byteplus else "magnific" if resolved_provider == "magnific" or self._is_magnific_model_id(request.model) else "kie_ai",
        })

        if route_to_byteplus:
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("byteplus_modelark")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
                )
            client = None
            try:
                client = BytePlusModelArkProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                size = request.size or "2K"
                result = await client.generate_image(
                    model=request.model,
                    prompt=request.prompt,
                    size=size,
                )
                actual_cost = Decimal(str(client.calculate_cost_usd(result["usage_tokens"])))
                response = ImageGenerationResponse(
                    id=result.get("provider_task_id", ""),
                    model=request.model,
                    provider="byteplus_modelark",
                    created=0,
                    data=[{"url": result["result_url"]}],
                )
                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                write_media_debug_event("image.generate.byteplus.success", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "provider_task_id": result.get("provider_task_id"),
                    "result_url": result.get("result_url"),
                    "log_file": log_file,
                })
                return response
            except HTTPException:
                raise
            except httpx.HTTPStatusError as e:
                provider_status = e.response.status_code
                provider_message = ""
                try:
                    payload = e.response.json()
                    provider_message = (
                        payload.get("message")
                        or payload.get("msg")
                        or payload.get("error")
                        or str(payload)
                    )
                except Exception:
                    provider_message = (e.response.text or "").strip()
                provider_message = provider_message[:500] if provider_message else "Unknown provider error"

                logger.error(
                    "byteplus_image_generation_http_error",
                    user_id=user.id,
                    model=request.model,
                    status=provider_status,
                    detail=provider_message,
                )
                write_media_debug_event("image.generate.byteplus.error", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "http_status": provider_status,
                    "error": provider_message,
                    "log_file": log_file,
                })
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"BytePlus API error ({provider_status}): {provider_message}",
                )
            except Exception as e:
                logger.error("byteplus_image_generation_failed", user_id=user.id, model=request.model, error=str(e))
                write_media_debug_event("image.generate.byteplus.error", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "error": str(e),
                    "log_file": log_file,
                })
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"BytePlus image generation failed: {str(e)}",
                )
            finally:
                if client is not None:
                    await client.aclose()
        # --- End BytePlus routing ---

        # --- Magnific image routing ---
        route_to_magnific_image = (
            resolved_provider == "magnific"
            or self._is_magnific_model_id(request.model)
        )
        if route_to_magnific_image:
            from app.llm_proxy.providers.magnific_provider import MagnificProvider, MagnificProviderError
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("magnific")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Magnific not configured. Please add API key in Admin > Media Providers.",
                )

            client = None
            try:
                client = MagnificProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                payload = self._build_magnific_payload(request)
                spec = client.get_model_spec(request.model)

                if spec.dispatch_mode == "sync" and request.model == "magnific/remove-background":
                    result = await client.remove_background(payload)
                    rehosted_data = []
                    for index, item in enumerate(result.get("data") or []):
                        provider_url = item.get("url") if isinstance(item, dict) else None
                        if not provider_url:
                            continue
                        platform_url = await self._rehost_provider_media_url(
                            user_id=user.id,
                            job_id=f"{request.model}-{uuid4().hex}-{index}",
                            media_type="image",
                            url=provider_url,
                        )
                        rehosted_data.append({"url": platform_url})
                    if not rehosted_data:
                        raise ValueError("Magnific Remove Background did not produce re-hostable media")
                    response = ImageGenerationResponse(
                        id=f"magnific-sync-{uuid4().hex}",
                        model=request.model,
                        provider="magnific",
                        created=0,
                        data=rehosted_data,
                    )
                else:
                    result = await client.generate_image(request.model, payload)
                    response = ImageGenerationResponse(
                        id=result["provider_task_id"],
                        model=request.model,
                        provider="magnific",
                        created=0,
                        data=[],
                    )

                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                write_media_debug_event("image.generate.magnific.success", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "provider_task_id": response.id,
                    "has_result_url": bool(response.data),
                    "log_file": log_file,
                })
                return response
            except HTTPException:
                raise
            except MagnificProviderError as exc:
                logger.error(
                    "magnific_image_generation_failed",
                    user_id=user.id,
                    model=request.model,
                    category=exc.category,
                    status_code=exc.status_code,
                )
                raise HTTPException(
                    status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY,
                    detail=str(exc),
                ) from exc
            except Exception as exc:
                logger.error("magnific_image_generation_failed", user_id=user.id, model=request.model, error=type(exc).__name__)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Magnific image generation failed",
                ) from exc
            finally:
                if client is not None:
                    await client.aclose()
        # --- End Magnific image routing ---

        # --- fal.ai image routing ---
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as FalAIImageProvider
        fal_image_models = {self._normalize_model_id(m) for m in FalAIImageProvider.IMAGE_MODELS}
        route_to_fal_img = (
            resolved_provider == "fal_ai"
            or normalized_model in fal_image_models
        )
        if route_to_fal_img:
            await self._check_fal_concurrent_limit(user.id)
            from app.services.media_provider_service import get_media_provider_key as get_fal_img_key
            provider_config_fal = await get_fal_img_key("fal_ai")
            if not provider_config_fal or not provider_config_fal.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
                )
            fal_client = None
            try:
                fal_client = FalAIImageProvider(api_key=provider_config_fal["apiKey"])
                extra = request.extra_params if isinstance(request.extra_params, dict) else {}
                if request.prompt:
                    extra["prompt"] = request.prompt
                result = await fal_client.generate_image(request.model, extra)
                response = ImageGenerationResponse(
                    id="",
                    model=request.model,
                    provider="fal_ai",
                    created=0,
                    data=result.get("data", []),
                )
                actual_cost = estimated_cost
                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                write_media_debug_event("image.generate.fal_ai.success", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "log_file": log_file,
                })
                return response
            except HTTPException:
                raise
            except httpx.HTTPStatusError as http_err:
                msg = FalAIImageProvider.map_http_error_to_message(http_err.response.status_code)
                logger.error("fal_ai_image_generation_failed", user_id=user.id, model=request.model, status=http_err.response.status_code)
                raise HTTPException(status_code=http_err.response.status_code, detail=msg)
            except Exception as e:
                logger.error("fal_ai_image_generation_failed", user_id=user.id, model=request.model, error=type(e).__name__)
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai image generation failed")
            finally:
                if fal_client is not None:
                    await fal_client.aclose()
        # --- End fal.ai image routing ---

        # --- KNPLabs image routing ---
        from app.llm_proxy.providers.knplabai_provider import KNPLabsProvider
        knplabs_model_name = request.model.split("/", 1)[-1].strip() if isinstance(request.model, str) else request.model
        knplabs_model_normalized = self._normalize_model_id(knplabs_model_name)
        knplabs_image_openai_models = {
            self._normalize_model_id(model_name)
            for model_name in KNPLabsProvider.IMAGE_OPENAI_MODELS
        }
        knplabs_image_gemini_models = {
            self._normalize_model_id(model_name)
            for model_name in KNPLabsProvider.IMAGE_GEMINI_MODELS
        }
        route_to_knplabs_image = (
            resolved_provider in {"knplabs", "knplabai"}
            or normalized_model in knplabs_image_openai_models
            or normalized_model in knplabs_image_gemini_models
            or knplabs_model_normalized in knplabs_image_openai_models
            or knplabs_model_normalized in knplabs_image_gemini_models
        )
        if route_to_knplabs_image:
            from app.services.media_provider_service import initialize_knplabs_client
            if not self.unified_client.knplabs_client:
                self.unified_client.knplabs_client = await initialize_knplabs_client()

            if not self.unified_client.knplabs_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="KNPLabs not configured. Please add API key in Admin > Media Providers.",
                )

            client = self.unified_client.knplabs_client
            try:
                if normalized_model in knplabs_image_gemini_models or knplabs_model_normalized in knplabs_image_gemini_models:
                    aspect_ratio = (
                        request.aspect_ratio
                        or self._get_api_config_string(api_config, "aspect_ratio", "aspectRatio")
                        or "1:1"
                    )
                    image_bytes = await client.generate_image_gemini(
                        knplabs_model_name,
                        request.prompt,
                        aspect_ratio=aspect_ratio,
                    )
                    ext = (self._get_api_config_string(api_config, "output_format", "outputFormat") or "png").lower()
                    uploaded_url = await self._upload_generated_media_bytes(
                        user_id=user.id,
                        job_id=f"{request.model}-{uuid4().hex}",
                        media_type="image",
                        payload=image_bytes,
                        content_type="image/png",
                        ext=ext if ext in {"png", "jpg", "jpeg", "webp"} else "png",
                    )
                    response = ImageGenerationResponse(
                        id=f"knplabs-{uuid4().hex}",
                        model=request.model,
                        provider="knplabs",
                        created=0,
                        data=[{"url": uploaded_url}],
                    )
                else:
                    result = await client.generate_image_openai(
                        knplabs_model_name,
                        request.prompt,
                        size=request.size or self._get_api_config_string(api_config, "size") or "1024x1024",
                        n=request.n or 1,
                    )
                    result_data = result.get("data") if isinstance(result, dict) else None
                    uploaded_url = None
                    response_id = result.get("id") if isinstance(result, dict) and isinstance(result.get("id"), str) else None
                    if isinstance(result_data, list) and result_data:
                        first = result_data[0] if isinstance(result_data[0], dict) else {}
                        if isinstance(first.get("url"), str) and first["url"].startswith("http"):
                            uploaded_url = first["url"]
                        elif isinstance(first.get("b64_json"), str):
                            decoded = base64.b64decode(first["b64_json"])
                            ext = (self._get_api_config_string(api_config, "output_format", "outputFormat") or "png").lower()
                            uploaded_url = await self._upload_generated_media_bytes(
                                user_id=user.id,
                                job_id=response_id or f"{request.model}-{uuid4().hex}",
                                media_type="image",
                                payload=decoded,
                                content_type="image/png",
                                ext=ext if ext in {"png", "jpg", "jpeg", "webp"} else "png",
                            )
                            result_data = [{"url": uploaded_url}]
                    if not uploaded_url:
                        uploaded_url = self._extract_first_url_from_payload(result)
                    if not uploaded_url:
                        raise ValueError("KNPLabs image response did not include a public URL or image bytes")
                    response = ImageGenerationResponse(
                        id=response_id or f"knplabs-{uuid4().hex}",
                        model=request.model,
                        provider="knplabs",
                        created=0,
                        data=[{"url": uploaded_url}],
                    )

                actual_cost = estimated_cost
                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                write_media_debug_event("image.generate.knplabs.success", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "provider": "knplabs",
                    "log_file": log_file,
                })
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("knplabs_image_generation_failed", user_id=user.id, model=request.model, error=str(e))
                write_media_debug_event("image.generate.knplabs.error", {
                    "trace_id": trace_id,
                    "user_id": user.id,
                    "model": request.model,
                    "error": str(e),
                    "log_file": log_file,
                })
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"KNPLabs image generation failed: {str(e)}",
                )
        # --- End KNPLabs image routing ---

        write_media_debug_event("image.generate.fallback_to_kie", {
            "trace_id": trace_id,
            "user_id": user.id,
            "model": request.model,
            "resolved_provider": resolved_provider,
            "provider_hint": api_config.get("provider"),
            "reason": "byteplus_not_selected",
            "log_file": log_file,
        })

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            # Log incoming request for debugging
            logger.info(
                "generate_image_start",
                user_id=user.id,
                model=request.model,
                has_reference_urls=bool(request.reference_image_urls),
                reference_url_count=len(request.reference_image_urls) if request.reference_image_urls else 0,
            )

            # Resolve reference image URLs to public URLs via R2 storage
            # This is needed because Kie.ai needs to download images from public URLs
            resolved_reference_urls = request.reference_image_urls
            resolved_style_url = request.reference_style_url

            if request.reference_image_urls or request.reference_style_url:
                logger.info("r2_resolution_starting", urls=request.reference_image_urls)
                try:
                    if not R2_STORAGE_AVAILABLE:
                        raise ImportError("R2 storage not available (boto3 not installed)")
                    r2_service = get_r2_storage_service()
                    # Pass db_session as parameter (NOT stored on singleton to avoid async context issues)

                    if request.reference_image_urls:
                        resolved_reference_urls = await r2_service.resolve_reference_urls(
                            request.reference_image_urls,
                            db_session=self.db
                        )
                        logger.info(
                            "reference_urls_resolved",
                            original=request.reference_image_urls,
                            resolved=resolved_reference_urls
                        )

                    if request.reference_style_url:
                        resolved_style_url = await r2_service.resolve_reference_url(
                            request.reference_style_url,
                            db_session=self.db
                        )
                        logger.info(
                            "style_url_resolved",
                            original=request.reference_style_url,
                            resolved=resolved_style_url
                        )
                except Exception as e:
                    logger.warning(
                        "reference_url_resolution_failed",
                        error=str(e),
                        reference_urls=request.reference_image_urls
                    )
                    # Continue with original URLs if R2 resolution fails

            # For synchronous generation, always use polling mode (not callback mode)
            # This ensures we wait for the result before returning to the client
            # Callback mode is only suitable for async endpoints (/async/image)
            image_data = await self.unified_client.kie_ai_client.generate_image(
                model=request.model,
                prompt=request.prompt,
                callback_url="",  # Force polling mode - empty string disables callback
                reference_image_urls=resolved_reference_urls,  # Pass resolved URLs to Kie.ai
                reference_style_url=resolved_style_url,  # Pass resolved style URL to Kie.ai
                **request.dict(exclude_unset=True, exclude={
                    "model", "prompt", "user", "reference_image_urls", "reference_style_url"
                })
            )

            # Check for None response from Kie.ai
            if image_data is None:
                logger.error("kie_ai_returned_none", user_id=user.id, model=request.model)
                raise ValueError("No response received from Kie.ai image generation API")

            # Log full response for debugging
            logger.info(
                "kie_ai_image_response",
                user_id=user.id,
                id=image_data.get("id"),
                data_count=len(image_data.get("data", [])),
                data=image_data.get("data", []),
                raw_keys=list(image_data.keys()) if image_data else None,
                has_reference_images=bool(request.reference_image_urls),
            )

            # Extract data - check both 'data' and 'raw_response' fields
            result_data = image_data.get("data", [])

            # If data is empty but we have raw_response, try to extract from there
            if not result_data and image_data.get("raw_response"):
                raw_response = image_data.get("raw_response", {})
                logger.info("kie_ai_checking_raw_response", raw_keys=list(raw_response.keys()) if isinstance(raw_response, dict) else "not_dict")

                # Try nested paths in raw_response
                if isinstance(raw_response, dict):
                    nested = raw_response.get("data", {})
                    if isinstance(nested, dict):
                        result_json = nested.get("resultJson", {})
                        # Parse if it's a string
                        if isinstance(result_json, str):
                            import json
                            try:
                                result_json = json.loads(result_json)
                            except:
                                pass
                        if isinstance(result_json, dict):
                            urls = result_json.get("resultUrls", [])
                            for url in urls:
                                if isinstance(url, str):
                                    result_data.append({"url": url})
                                elif isinstance(url, dict):
                                    result_data.append({"url": url.get("url")})
                            if result_data:
                                logger.info("kie_ai_extracted_from_raw", count=len(result_data))

            response = ImageGenerationResponse(
                id=image_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=image_data.get("created", 0),
                data=result_data,
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = image_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("image_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            if reserved_credit_amount is not None:
                response.credits_used = reserved_credit_amount
                return response
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("image_generation_failed", user_id=user.id, error=str(e))
            write_media_debug_event("image.generate.kie.error", {
                "trace_id": trace_id,
                "user_id": user.id,
                "model": request.model,
                "error": str(e),
                "log_file": log_file,
            })
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image generation failed: {str(e)}")

    async def generate_video(
        self,
        request: VideoGenerationRequest,
        user: User,
        wait_for_completion: bool = True,
    ) -> VideoGenerationResponse:
        """
        Generate video with credit checking.
        """
        logger.info("video_generation_request", user_id=user.id, model=request.model)

        reserved_credit_amount = self._get_reserved_credit_amount(request)
        if reserved_credit_amount is not None:
            estimated_cost = self._get_reserved_cost_usd(request) or Decimal("0")
            logger.info(
                "video_generation_using_reserved_credits",
                user_id=user.id,
                model=request.model,
                reserved_credits=float(reserved_credit_amount),
                wait_for_completion=wait_for_completion,
            )
        else:
            # Estimate cost via Web Gateway or use local estimate
            estimated_cost = await self._estimate_cost(request, False)
            await self._check_credits(user, estimated_cost)

        # --- BytePlus ModelArk routing ---
        from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
        from app.llm_proxy.providers.wavespeed_media_provider import (
            WaveSpeedError,
            WaveSpeedMediaProvider,
            WaveSpeedPollingTimeoutError,
            WaveSpeedTerminalError,
        )
        resolved_provider = await self._resolve_media_provider(request.model, request.api_config)
        normalized_model = self._normalize_model_id(request.model)
        wavespeed_launch_model = self._normalize_model_id(WaveSpeedMediaProvider.LAUNCH_MODEL_ID)
        route_to_wavespeed = (
            resolved_provider == "wavespeed_ai"
            or normalized_model == wavespeed_launch_model
        )
        route_to_magnific_video = (
            resolved_provider == "magnific"
            or self._is_magnific_model_id(request.model)
        )
        byteplus_video_models = {
            self._normalize_model_id(model_name)
            for model_name in BytePlusModelArkProvider.VIDEO_MODELS
        }
        route_to_byteplus = (
            resolved_provider == "byteplus_modelark"
            or normalized_model in byteplus_video_models
        )

        logger.info(
            "video_provider_routing",
            model=request.model,
            normalized_model=normalized_model,
            resolved_provider=resolved_provider,
            route=(
                "wavespeed_ai"
                if route_to_wavespeed
                else "magnific"
                if route_to_magnific_video
                else "byteplus_modelark"
                if route_to_byteplus
                else "kie_ai"
            ),
        )

        if route_to_wavespeed:
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("wavespeed_ai")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="WaveSpeedAI not configured. Please add API key in Admin > Media Providers.",
                )

            client = None
            try:
                extra = request.extra_params or {}
                api_config = request.api_config if isinstance(request.api_config, dict) else {}
                aspect_ratio = (
                    request.aspect_ratio
                    or self._get_api_config_string(extra, "aspect_ratio", "aspectRatio")
                    or "16:9"
                )
                duration = request.duration or int(
                    self._get_api_config_string(extra, "duration", "seconds") or 5
                )
                resolution = request.resolution or self._get_api_config_string(extra, "resolution", "size")

                client = WaveSpeedMediaProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                    submit_endpoint=WaveSpeedMediaProvider.resolve_submit_endpoint(api_config),
                    result_endpoint_template=WaveSpeedMediaProvider.resolve_result_endpoint_template(api_config),
                    provider_model_id=WaveSpeedMediaProvider.resolve_provider_model_id(request.model, api_config),
                )

                submit_result = await client.create_prediction(
                    prompt=request.prompt,
                    reference_image_urls=request.reference_image_urls,
                    aspect_ratio=aspect_ratio,
                    duration=duration,
                    resolution=resolution,
                )
                response = VideoGenerationResponse(
                    id=submit_result["provider_task_id"],
                    model=request.model,
                    provider="wavespeed_ai",
                    created=0,
                    data=[],
                )

                if wait_for_completion:
                    completion = await client.wait_for_completion(
                        request_id=submit_result["provider_task_id"],
                    )
                    if not completion.result_url:
                        raise WaveSpeedTerminalError(
                            "WaveSpeed completed without a final media URL"
                        )
                    response.data = [{"url": completion.result_url}]

                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response

                transaction = await self._deduct_credits(
                    user,
                    estimated_cost,
                    request,
                    response,
                    estimated_cost,
                    False,
                )
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except WaveSpeedError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                ) from exc
            except WaveSpeedTerminalError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=str(exc),
                ) from exc
            except WaveSpeedPollingTimeoutError as exc:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail=str(exc),
                ) from exc
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=exc.response.status_code,
                    detail=self._format_provider_http_error("WaveSpeed API error", exc),
                ) from exc
            except Exception as exc:
                logger.error(
                    "wavespeed_video_generation_failed",
                    user_id=user.id,
                    model=request.model,
                    error=str(exc),
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="WaveSpeed video generation failed",
                ) from exc
            finally:
                if client is not None:
                    await client.aclose()

        if route_to_magnific_video:
            from app.llm_proxy.providers.magnific_provider import MagnificProvider, MagnificProviderError
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("magnific")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Magnific not configured. Please add API key in Admin > Media Providers.",
                )

            client = None
            try:
                client = MagnificProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                payload = self._build_magnific_payload(request)
                if request.model == "magnific/video-upscaler-precision":
                    result = await client.upscale_video(request.model, payload)
                else:
                    result = await client.generate_video(request.model, payload)
                response = VideoGenerationResponse(
                    id=result["provider_task_id"],
                    model=request.model,
                    provider="magnific",
                    created=0,
                    data=[],
                )

                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except MagnificProviderError as exc:
                logger.error(
                    "magnific_video_generation_failed",
                    user_id=user.id,
                    model=request.model,
                    category=exc.category,
                    status_code=exc.status_code,
                )
                raise HTTPException(
                    status_code=exc.status_code or status.HTTP_502_BAD_GATEWAY,
                    detail=str(exc),
                ) from exc
            except Exception as exc:
                logger.error("magnific_video_generation_failed", user_id=user.id, model=request.model, error=type(exc).__name__)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Magnific video generation failed",
                ) from exc
            finally:
                if client is not None:
                    await client.aclose()

        if route_to_byteplus:
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("byteplus_modelark")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="BytePlus ModelArk not configured. Please add API key in Admin > Media Providers.",
                )
            client = None
            try:
                client = BytePlusModelArkProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                extra = request.extra_params or {}
                resolution = request.resolution or extra.get("resolution", "1080p")
                duration = request.duration or int(extra.get("duration", 5))
                camerafixed = bool(extra.get("camerafixed", False))
                reference_image_url = None
                if request.reference_image_urls:
                    reference_image_url = request.reference_image_urls[0]
                result = await client.create_video_task(
                    model=request.model,
                    prompt=request.prompt,
                    resolution=resolution,
                    duration=duration,
                    camerafixed=camerafixed,
                    reference_image_url=reference_image_url,
                )
                response = VideoGenerationResponse(
                    id=result["provider_task_id"],
                    model=request.model,
                    provider="byteplus_modelark",
                    created=0,
                    data=[],
                )
                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response
                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("byteplus_video_task_creation_failed", user_id=user.id, model=request.model, error=str(e))
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="BytePlus video task creation failed. See server logs for details.")
            finally:
                if client is not None:
                    await client.aclose()
        # --- End BytePlus routing ---

        # --- fal.ai routing ---
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
        fal_video_models = {self._normalize_model_id(m) for m in FalAIProvider.VIDEO_MODELS}
        route_to_fal = (
            resolved_provider == "fal_ai"
            or normalized_model in fal_video_models
        )
        if route_to_fal:
            await self._check_fal_concurrent_limit(user.id)
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("fal_ai")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
                )
            fal_client = None
            try:
                fal_client = FalAIProvider(api_key=provider_config["apiKey"])
                extra = request.extra_params or {}
                if request.prompt:
                    extra["prompt"] = request.prompt
                result = await fal_client.generate_video(request.model, extra)
                response = VideoGenerationResponse(
                    id=result["id"],
                    model=request.model,
                    provider="fal_ai",
                    created=0,
                    data=[],
                )
                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except httpx.HTTPStatusError as http_err:
                msg = FalAIProvider.map_http_error_to_message(http_err.response.status_code)
                logger.error("fal_ai_video_generation_failed", user_id=user.id, model=request.model, status=http_err.response.status_code)
                raise HTTPException(status_code=http_err.response.status_code, detail=msg)
            except Exception as e:
                logger.error("fal_ai_video_generation_failed", user_id=user.id, model=request.model, error=type(e).__name__)
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai video generation failed")
            finally:
                if fal_client is not None:
                    await fal_client.aclose()
        # --- End fal.ai routing ---

        # --- KNPLabs video routing ---
        from app.llm_proxy.providers.knplabai_provider import KNPLabsProvider
        knplabs_model_name = request.model.split("/", 1)[-1].strip() if isinstance(request.model, str) else request.model
        knplabs_model_normalized = self._normalize_model_id(knplabs_model_name)
        knplabs_video_form_models = {
            self._normalize_model_id(model_name)
            for model_name in KNPLabsProvider.VIDEO_FORM_MODELS
        }
        knplabs_video_json_models = {
            self._normalize_model_id(model_name)
            for model_name in KNPLabsProvider.VIDEO_JSON_MODELS
        }
        route_to_knplabs_video = (
            resolved_provider in {"knplabs", "knplabai"}
            or normalized_model in knplabs_video_form_models
            or normalized_model in knplabs_video_json_models
            or knplabs_model_normalized in knplabs_video_form_models
            or knplabs_model_normalized in knplabs_video_json_models
        )
        if route_to_knplabs_video:
            from app.services.media_provider_service import initialize_knplabs_client
            if not self.unified_client.knplabs_client:
                self.unified_client.knplabs_client = await initialize_knplabs_client()

            if not self.unified_client.knplabs_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="KNPLabs not configured. Please add API key in Admin > Media Providers.",
                )

            client = self.unified_client.knplabs_client
            try:
                extra = request.extra_params or {}
                if normalized_model in knplabs_video_form_models or knplabs_model_normalized in knplabs_video_form_models:
                    size = request.resolution or self._get_api_config_string(extra, "size", "resolution") or "1080p"
                    seconds = request.duration or int(self._get_api_config_string(extra, "seconds", "duration") or 5)
                    task_id = await client.create_video_veo(
                        model=knplabs_model_name,
                        prompt=request.prompt,
                        size=size,
                        seconds=seconds,
                    )
                else:
                    images = request.reference_image_urls or []
                    task_id = await client.create_video_json(
                        model=knplabs_model_name,
                        prompt=request.prompt,
                        images=images or None,
                        aspect_ratio=request.aspect_ratio or self._get_api_config_string(extra, "aspect_ratio", "aspectRatio") or "16:9",
                    )

                response = VideoGenerationResponse(
                    id=task_id,
                    model=request.model,
                    provider="knplabs",
                    created=0,
                    data=[],
                )

                if wait_for_completion:
                    waited_result = await client.wait_for_video(task_id, knplabs_model_name)
                    result_url = client.extract_result_url(waited_result)
                    if not result_url:
                        raise ValueError("KNPLabs video completed without a result URL")
                    response.data = [{"url": result_url}]

                if reserved_credit_amount is not None:
                    response.credits_used = reserved_credit_amount
                    return response

                transaction = await self._deduct_credits(user, estimated_cost, request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("knplabs_video_generation_failed", user_id=user.id, model=request.model, error=str(e))
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"KNPLabs video generation failed: {str(e)}",
                )
        # --- End KNPLabs video routing ---

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            provider_kwargs = request.dict(exclude_unset=True, exclude={
                "model", "prompt", "user"
            })

            if wait_for_completion:
                # Synchronous mode: block until result is ready.
                provider_kwargs["callback_url"] = ""  # Explicitly disable callback and use polling.
            # Async mode: do not force callback_url; provider config callback can be used if present.

            video_data = await self.unified_client.kie_ai_client.generate_video(
                model=request.model,
                prompt=request.prompt,
                wait_for_completion=wait_for_completion,
                **provider_kwargs
            )
            response = VideoGenerationResponse(
                id=video_data.get("id", ""),
                model=request.model,
                provider="kie_ai",
                created=video_data.get("created", 0),
                data=video_data.get("data", []),
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = video_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("video_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            if reserved_credit_amount is not None:
                response.credits_used = reserved_credit_amount
                return response
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("video_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Video generation failed: {str(e)}")

    async def generate_audio(
        self,
        request: AudioGenerationRequest,
        user: User
    ) -> AudioGenerationResponse:
        """
        Generate audio with credit checking.
        """
        logger.info("audio_generation_request", user_id=user.id, model=request.model)

        normalized_request = self._normalize_audio_request_for_generation(request)

        # Estimate cost via Web Gateway or use local estimate
        estimated_cost = await self._estimate_cost(normalized_request, False)
        await self._check_credits(user, estimated_cost)

        resolved_provider = await self._resolve_media_provider(normalized_request.model, normalized_request.api_config)
        normalized_model = self._normalize_model_id(normalized_request.model)

        from app.llm_proxy.providers.uvoice_provider import UVoiceProvider
        from app.llm_proxy.providers.omnivoice_provider import OmniVoiceProvider
        uvoice_audio_models = {
            self._normalize_model_id(model_name)
            for model_name in UVoiceProvider.AUDIO_MODELS
        }
        omnivoice_audio_models = {
            self._normalize_model_id(model_name)
            for model_name in OmniVoiceProvider.AUDIO_MODELS
        }
        route_to_uvoice = (
            resolved_provider == "uvoice"
            or normalized_model in uvoice_audio_models
        )
        route_to_wavespeed_audio = resolved_provider == "wavespeed_ai"
        route_to_elevenlabs_audio = (
            resolved_provider == "elevenlabs"
            or str(normalized_request.model or "").strip().lower().startswith("elevenlabs/")
        )

        logger.info(
            "audio_provider_routing",
            model=request.model,
            normalized_model=normalized_model,
            resolved_provider=resolved_provider,
            route=(
                "wavespeed_ai"
                if route_to_wavespeed_audio
                else "elevenlabs"
                if route_to_elevenlabs_audio
                else "uvoice"
                if route_to_uvoice
                else "kie_ai"
            ),
        )

        if route_to_elevenlabs_audio:
            from app.llm_proxy.providers.elevenlabs_media_provider import (
                ElevenLabsBinaryResult,
                ElevenLabsMediaError,
                ElevenLabsMediaProvider,
                ElevenLabsTranscriptResult,
            )
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("elevenlabs")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="ElevenLabs not configured. Please add API key in Admin > Media Providers.",
                )

            api_config = normalized_request.api_config if isinstance(normalized_request.api_config, dict) else {}
            extra_params = normalized_request.extra_params if isinstance(normalized_request.extra_params, dict) else {}
            capability = (
                self._get_api_config_string(api_config, "elevenlabs_capability", "elevenlabsCapability")
                or "text_to_speech"
            )
            payload = {key: value for key, value in extra_params.items() if value is not None}
            if normalized_request.text:
                payload.setdefault("text", normalized_request.text)
            if normalized_request.voice_id:
                payload.setdefault("voice_id", normalized_request.voice_id)
            if normalized_request.output_format:
                payload.setdefault("output_format", normalized_request.output_format)
            if normalized_request.stability is not None:
                payload.setdefault("stability", normalized_request.stability)
            if normalized_request.similarity_boost is not None:
                payload.setdefault("similarity_boost", normalized_request.similarity_boost)
            if normalized_request.speed is not None:
                payload.setdefault("speed", normalized_request.speed)

            client = None
            try:
                client = ElevenLabsMediaProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                if capability == "voice_changer":
                    provider_result = await client.convert_voice(payload)
                elif capability == "speech_to_text":
                    provider_result = await client.transcribe(payload)
                elif capability == "sound_effects":
                    provider_result = await client.generate_sound_effect(payload)
                elif capability == "voice_isolator":
                    provider_result = await client.isolate_voice(payload)
                else:
                    provider_result = await client.generate_text_to_speech(payload)

                response_id = f"elevenlabs-{uuid4().hex}"
                metadata: Dict[str, Any]
                data: List[Dict[str, str]]
                if isinstance(provider_result, ElevenLabsBinaryResult):
                    result_url = await self._upload_generated_media_bytes(
                        user_id=int(user.id),
                        job_id=response_id,
                        media_type="audio",
                        payload=provider_result.content,
                        content_type=provider_result.content_type,
                        ext=provider_result.extension,
                    )
                    data = [{"url": result_url}]
                    metadata = {
                        "artifactKind": "audio",
                        "provider": "elevenlabs",
                        "capability": provider_result.capability,
                        "contentType": provider_result.content_type,
                        "outputFormat": provider_result.output_format,
                    }
                elif isinstance(provider_result, ElevenLabsTranscriptResult):
                    data = []
                    metadata = {
                        "artifactKind": "transcript",
                        "provider": "elevenlabs",
                        "capability": provider_result.capability,
                        "text": provider_result.text,
                        "transcript": provider_result.transcript,
                        "words": provider_result.transcript.get("words"),
                        "languageCode": provider_result.transcript.get("language_code"),
                    }
                else:  # pragma: no cover - defensive guard
                    raise ElevenLabsMediaError("Unsupported ElevenLabs response type")

                response = AudioGenerationResponse(
                    id=response_id,
                    model=normalized_request.model,
                    provider="elevenlabs",
                    created=0,
                    data=data,
                    metadata=metadata,
                )
                transaction = await self._deduct_credits(
                    user, estimated_cost, normalized_request, response, estimated_cost, False
                )
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except ElevenLabsMediaError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=exc.response.status_code,
                    detail=self._format_provider_http_error("ElevenLabs API error", exc),
                ) from exc
            except Exception as exc:
                logger.error(
                    "elevenlabs_audio_generation_failed",
                    user_id=user.id,
                    model=normalized_request.model,
                    error=str(exc),
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="ElevenLabs audio generation failed",
                ) from exc
            finally:
                if client is not None:
                    await client.aclose()

        if route_to_wavespeed_audio:
            from app.llm_proxy.providers.wavespeed_media_provider import (
                WaveSpeedError,
                WaveSpeedMediaProvider,
                WaveSpeedPollingTimeoutError,
                WaveSpeedTerminalError,
            )
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("wavespeed_ai")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="WaveSpeedAI not configured. Please add API key in Admin > Media Providers.",
                )

            api_config = normalized_request.api_config if isinstance(normalized_request.api_config, dict) else {}
            extra_params = normalized_request.extra_params if isinstance(normalized_request.extra_params, dict) else {}
            text_input_key = (
                self._get_api_config_string(api_config, "text_input_key", "textInputKey")
                or "text"
            )
            omit_text_input = self._get_api_config_bool(api_config, "omit_text_input", "omitTextInput") is True
            payload = {
                key: value
                for key, value in extra_params.items()
                if value is not None
            }
            if not omit_text_input:
                payload[text_input_key] = normalized_request.text
            if normalized_request.voice:
                payload.setdefault("voice", normalized_request.voice)
            if normalized_request.voice_id:
                payload.setdefault("voice_id", normalized_request.voice_id)
            if normalized_request.speed is not None:
                payload.setdefault("speed", normalized_request.speed)
            if normalized_request.output_format:
                payload.setdefault("format", normalized_request.output_format)

            client = None
            try:
                client = WaveSpeedMediaProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                    submit_endpoint=WaveSpeedMediaProvider.resolve_submit_endpoint(api_config),
                    result_endpoint_template=WaveSpeedMediaProvider.resolve_result_endpoint_template(api_config),
                    provider_model_id=WaveSpeedMediaProvider.resolve_provider_model_id(normalized_request.model, api_config),
                )
                submit_result = await client.create_audio_prediction(payload=payload)
                completion = await client.wait_for_completion(
                    request_id=submit_result["provider_task_id"],
                )
                if not completion.result_url:
                    raise WaveSpeedTerminalError(
                        "WaveSpeed completed without a final media URL"
                    )
                response = AudioGenerationResponse(
                    id=submit_result["provider_task_id"],
                    model=normalized_request.model,
                    provider="wavespeed_ai",
                    created=0,
                    data=[{"url": completion.result_url}],
                )
                transaction = await self._deduct_credits(
                    user, estimated_cost, normalized_request, response, estimated_cost, False
                )
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except WaveSpeedError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            except WaveSpeedTerminalError as exc:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
            except WaveSpeedPollingTimeoutError as exc:
                raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=exc.response.status_code,
                    detail=self._format_provider_http_error("WaveSpeed API error", exc),
                ) from exc
            except Exception as exc:
                logger.error(
                    "wavespeed_audio_generation_failed",
                    user_id=user.id,
                    model=normalized_request.model,
                    error=str(exc),
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="WaveSpeed audio generation failed",
                ) from exc
            finally:
                if client is not None:
                    await client.aclose()

        if route_to_uvoice:
            from app.services.media_provider_service import get_media_provider_key

            provider_config = await get_media_provider_key("uvoice")
            if not provider_config or not provider_config.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="UVoice not configured. Please add API key in Admin > Media Providers.",
                )

            api_config = normalized_request.api_config if isinstance(normalized_request.api_config, dict) else {}
            endpoint = self._get_api_config_string(api_config, "endpoint", "api_endpoint", "apiEndpoint") or "/generate"
            base_url = str(provider_config.get("baseUrl") or "https://api.uvoice.ai").rstrip("/")
            request_url = endpoint if endpoint.startswith(("http://", "https://")) else f"{base_url}/{endpoint.lstrip('/')}"
            extra_params = normalized_request.extra_params if isinstance(normalized_request.extra_params, dict) else {}
            selected_voice_id = (
                normalized_request.voice_id
                or normalized_request.voice
                or extra_params.get("voiceID")
                or extra_params.get("voiceId")
                or extra_params.get("voice_id")
                or extra_params.get("voice")
            )
            debug_request_payload = {
                "model": normalized_request.model,
                "text": normalized_request.text[:1200],
                "voice": normalized_request.voice,
                "voice_id": normalized_request.voice_id,
                "speed": normalized_request.speed,
                "extra_params": extra_params,
            }

            client = None
            try:
                client = UVoiceProvider(
                    api_key=provider_config["apiKey"],
                    base_url=provider_config.get("baseUrl"),
                )
                async def _generate_with_request(active_request: AudioGenerationRequest) -> tuple[Dict[str, Any], Optional[str], Dict[str, Any]]:
                    active_extra_params = active_request.extra_params if isinstance(active_request.extra_params, dict) else {}
                    active_selected_voice_id = self._extract_audio_voice_hint(active_request)
                    active_debug_request_payload = {
                        "model": active_request.model,
                        "text": active_request.text[:1200],
                        "voice": active_request.voice,
                        "voice_id": active_request.voice_id,
                        "speed": active_request.speed,
                        "extra_params": active_extra_params,
                    }
                    audio_data = await client.generate_audio(
                        model=active_request.model,
                        text=active_request.text,
                        **active_request.dict(exclude_unset=True, exclude={
                            "model", "text", "user"
                        })
                    )
                    return audio_data, active_selected_voice_id, active_debug_request_payload

                active_request = normalized_request
                active_selected_voice_id = selected_voice_id
                active_debug_request_payload = debug_request_payload
                try:
                    audio_data, active_selected_voice_id, active_debug_request_payload = await _generate_with_request(active_request)
                except httpx.HTTPStatusError as primary_error:
                    if primary_error.response.status_code == 403:
                        fallback_requests = self._build_uvoice_fallback_requests(normalized_request)
                        for fallback_request in fallback_requests:
                            fallback_voice_id = self._extract_audio_voice_hint(fallback_request)
                            logger.warning(
                                "uvoice_audio_generation_retrying_with_fallback",
                                user_id=user.id,
                                model=normalized_request.model,
                                selected_voice_id=selected_voice_id,
                                fallback_model=fallback_request.model,
                                fallback_voice_id=fallback_voice_id,
                            )
                            try:
                                audio_data, active_selected_voice_id, active_debug_request_payload = await _generate_with_request(fallback_request)
                                active_request = fallback_request
                                break
                            except httpx.HTTPStatusError:
                                continue
                        else:
                            raise primary_error
                    else:
                        raise

                response = AudioGenerationResponse(
                    id=audio_data.get("id", ""),
                    model=active_request.model,
                    provider="uvoice",
                    created=audio_data.get("created", 0),
                    data=audio_data.get("data", []),
                )
                transaction = await self._deduct_credits(
                    user, estimated_cost, request, response, estimated_cost, False
                )
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except httpx.HTTPStatusError as e:
                response_body = (e.response.text or "")[:4000]
                request_method = e.request.method if e.request else "POST"
                request_url_from_exc = str(e.request.url) if e.request and e.request.url else request_url
                logger.error(
                    "uvoice_audio_generation_http_error",
                    user_id=user.id,
                    model=normalized_request.model,
                    status=e.response.status_code,
                    request_url=request_url_from_exc,
                    body=response_body[:1000],
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "message": f"UVoice audio generation failed: HTTP {e.response.status_code}",
                        "debug": {
                            "provider_hint": "uvoice",
                            "selected_voice_id": active_selected_voice_id,
                            "api": {
                                "provider": "uvoice",
                                "endpoint": endpoint,
                                "request_url": request_url_from_exc,
                                "method": request_method,
                                "voice_id": active_selected_voice_id,
                                "request_payload": active_debug_request_payload,
                                "response_status": e.response.status_code,
                                "response_body": response_body,
                            },
                        },
                    },
                )
            except Exception as e:
                logger.error("uvoice_audio_generation_failed", user_id=user.id, model=normalized_request.model, error=str(e))
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "message": f"Audio generation failed: {str(e)}",
                        "debug": {
                            "provider_hint": "uvoice",
                            "selected_voice_id": active_selected_voice_id,
                            "api": {
                                "provider": "uvoice",
                                "endpoint": endpoint,
                                "request_url": request_url,
                                "method": "POST",
                                "voice_id": active_selected_voice_id,
                                "request_payload": active_debug_request_payload,
                            },
                        },
                    },
                )
            finally:
                if client is not None:
                    try:
                        await client.aclose()
                    except Exception:
                        pass

        route_to_omnivoice = (
            resolved_provider == "omnivoice"
            or normalized_model in omnivoice_audio_models
        )
        if route_to_omnivoice:
            from app.services.media_provider_service import initialize_omnivoice_client

            if not self.unified_client.omnivoice_client:
                self.unified_client.omnivoice_client = await initialize_omnivoice_client()

            if not self.unified_client.omnivoice_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="OmniVoice not configured. Please add base URL and API key in Admin > Media Providers.",
                )

            client = self.unified_client.omnivoice_client
            extra_params = normalized_request.extra_params if isinstance(normalized_request.extra_params, dict) else {}
            selected_voice = (
                normalized_request.voice
                or normalized_request.voice_id
                or extra_params.get("voice")
                or extra_params.get("voice_id")
                or extra_params.get("voiceId")
                or extra_params.get("voiceID")
            )
            instruct = (
                extra_params.get("instruct")
                or extra_params.get("instruction")
                or extra_params.get("system_prompt")
                or extra_params.get("systemPrompt")
            )
            reference_audio_base64 = (
                extra_params.get("reference_audio_base64")
                or extra_params.get("referenceAudioBase64")
            )
            reference_audio_url = (
                extra_params.get("reference_audio_url")
                or extra_params.get("referenceAudioUrl")
            )
            reference_text = (
                extra_params.get("reference_text")
                or extra_params.get("referenceText")
            )
            output_format = (
                normalized_request.output_format
                or self._get_api_config_string(
                    normalized_request.api_config,
                    "output_format",
                    "outputFormat",
                    "format",
                )
                or "mp3"
            )
            try:
                audio_bytes = await client.generate_speech(
                    text=normalized_request.text,
                    voice=str(selected_voice).strip() if isinstance(selected_voice, str) and selected_voice.strip() else None,
                    speed=normalized_request.speed or 1.0,
                    response_format=str(output_format),
                    instruct=str(instruct).strip() if isinstance(instruct, str) and instruct.strip() else None,
                    reference_audio_base64=str(reference_audio_base64).strip() if isinstance(reference_audio_base64, str) and reference_audio_base64.strip() else None,
                    reference_audio_url=str(reference_audio_url).strip() if isinstance(reference_audio_url, str) and reference_audio_url.strip() else None,
                    reference_text=str(reference_text).strip() if isinstance(reference_text, str) and reference_text.strip() else None,
                )
                ext = str(output_format).lower()
                if ext == "pcm16":
                    ext = "pcm"
                elif ext not in {"mp3", "opus", "aac", "flac", "wav", "pcm"}:
                    ext = "mp3"
                content_type = "audio/wav" if ext == "wav" else f"audio/{ext}"
                uploaded_url = await self._upload_generated_media_bytes(
                    user_id=user.id,
                    job_id=f"{normalized_request.model}-{uuid4().hex}",
                    media_type="audio",
                    payload=audio_bytes,
                    content_type=content_type,
                    ext=ext,
                )
                response = AudioGenerationResponse(
                    id=f"omnivoice-{uuid4().hex}",
                    model=normalized_request.model,
                    provider="omnivoice",
                    created=0,
                    data=[{"url": uploaded_url}],
                )
                transaction = await self._deduct_credits(user, estimated_cost, normalized_request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("omnivoice_audio_generation_failed", user_id=user.id, model=normalized_request.model, error=str(e))
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OmniVoice audio generation failed: {str(e)}")

        # --- fal.ai audio routing ---
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as FalAIAudioProvider
        fal_audio_models = {self._normalize_model_id(m) for m in FalAIAudioProvider.AUDIO_MODELS}
        route_to_fal_audio = (
            resolved_provider == "fal_ai"
            or normalized_model in fal_audio_models
        )
        if route_to_fal_audio:
            await self._check_fal_concurrent_limit(user.id)
            from app.services.media_provider_service import get_media_provider_key as get_fal_audio_key
            provider_config_fal = await get_fal_audio_key("fal_ai")
            if not provider_config_fal or not provider_config_fal.get("apiKey"):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="fal.ai not configured. Please add API key in Admin > Media Providers.",
                )
            fal_client = None
            try:
                fal_client = FalAIAudioProvider(api_key=provider_config_fal["apiKey"])
                extra = dict(normalized_request.extra_params) if isinstance(normalized_request.extra_params, dict) else {}
                if normalized_request.text:
                    if normalized_model == self._normalize_model_id("fal-ai/gemini-3.1-flash-tts"):
                        extra["prompt"] = normalized_request.text
                        extra.pop("text", None)
                    else:
                        extra["text"] = normalized_request.text
                result = await fal_client.generate_audio(normalized_request.model, extra)
                response = AudioGenerationResponse(
                    id=str(result.get("id") or result.get("request_id") or ""),
                    model=normalized_request.model,
                    provider="fal_ai",
                    created=0,
                    data=result.get("data", []),
                )
                transaction = await self._deduct_credits(user, estimated_cost, normalized_request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except httpx.HTTPStatusError as http_err:
                msg = FalAIAudioProvider.map_http_error_to_message(http_err.response.status_code)
                logger.error("fal_ai_audio_generation_failed", user_id=user.id, model=normalized_request.model, status=http_err.response.status_code)
                raise HTTPException(status_code=http_err.response.status_code, detail=msg)
            except Exception as e:
                logger.error("fal_ai_audio_generation_failed", user_id=user.id, model=normalized_request.model, error=type(e).__name__)
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="fal.ai audio generation failed")
            finally:
                if fal_client is not None:
                    await fal_client.aclose()
        # --- End fal.ai audio routing ---

        # --- KNPLabs audio routing ---
        from app.llm_proxy.providers.knplabai_provider import KNPLabsProvider
        knplabs_model_name = normalized_request.model.split("/", 1)[-1].strip() if isinstance(normalized_request.model, str) else normalized_request.model
        knplabs_model_normalized = self._normalize_model_id(knplabs_model_name)
        knplabs_audio_models = {
            self._normalize_model_id(model_name)
            for model_name in KNPLabsProvider.AUDIO_MODELS
        }
        route_to_knplabs_audio = (
            resolved_provider in {"knplabs", "knplabai"}
            or normalized_model in knplabs_audio_models
            or knplabs_model_normalized in knplabs_audio_models
        )
        if route_to_knplabs_audio:
            from app.services.media_provider_service import initialize_knplabs_client
            if not self.unified_client.knplabs_client:
                self.unified_client.knplabs_client = await initialize_knplabs_client()

            if not self.unified_client.knplabs_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="KNPLabs not configured. Please add API key in Admin > Media Providers.",
                )

            client = self.unified_client.knplabs_client
            try:
                output_format = (
                    normalized_request.output_format
                    or self._get_api_config_string(normalized_request.api_config, "output_format", "outputFormat")
                    or "mp3"
                )
                voice = normalized_request.voice or normalized_request.voice_id or "alloy"
                audio_bytes = await client.generate_speech(
                    model=knplabs_model_name,
                    input_text=normalized_request.text,
                    voice=voice if isinstance(voice, str) else "alloy",
                    response_format=str(output_format),
                )
                ext = str(output_format).lower()
                if ext == "pcm":
                    ext = "pcm"
                elif ext not in {"mp3", "opus", "aac", "flac", "wav", "pcm"}:
                    ext = "mp3"
                content_type = "audio/wav" if ext == "wav" else f"audio/{ext}"
                uploaded_url = await self._upload_generated_media_bytes(
                    user_id=user.id,
                    job_id=f"{normalized_request.model}-{uuid4().hex}",
                    media_type="audio",
                    payload=audio_bytes,
                    content_type=content_type,
                    ext=ext,
                )
                response = AudioGenerationResponse(
                    id=f"knplabs-{uuid4().hex}",
                    model=normalized_request.model,
                    provider="knplabs",
                    created=0,
                    data=[{"url": uploaded_url}],
                )
                transaction = await self._deduct_credits(user, estimated_cost, normalized_request, response, estimated_cost, False)
                response.credits_used = abs(transaction.amount)
                response.credits_balance = transaction.balance_after
                return response
            except HTTPException:
                raise
            except Exception as e:
                logger.error("knplabs_audio_generation_failed", user_id=user.id, model=normalized_request.model, error=str(e))
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"KNPLabs audio generation failed: {str(e)}",
                )
        # --- End KNPLabs audio routing ---

        if not self.unified_client.kie_ai_client:
            # Try to initialize from SmartSpecWeb media_providers
            from app.services.media_provider_service import initialize_kie_ai_client
            self.unified_client.kie_ai_client = await initialize_kie_ai_client()

            if not self.unified_client.kie_ai_client:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Kie.ai not configured. Please add API key in Admin > Media Providers."
                )

        try:
            # For synchronous generation, always use polling mode (not callback mode)
            audio_data = await self.unified_client.kie_ai_client.generate_audio(
                model=normalized_request.model,
                text=normalized_request.text,
                callback_url="",  # Force polling mode
                **normalized_request.dict(exclude_unset=True, exclude={
                    "model", "text", "user"
                })
            )
            response = AudioGenerationResponse(
                id=audio_data.get("id", ""),
                model=normalized_request.model,
                provider="kie_ai",
                created=audio_data.get("created", 0),
                data=audio_data.get("data", []),
            )

            # Use actual Kie.ai credits if available (Kie 1 credit = $0.005)
            kie_credits = audio_data.get("kie_credits_consumed")
            if kie_credits is not None and kie_credits > 0:
                actual_cost = Decimal(str(kie_credits)) * Decimal("0.005")
                logger.info("audio_actual_cost_from_kie", kie_credits=kie_credits, actual_cost_usd=float(actual_cost), estimated_cost_usd=float(estimated_cost))
            else:
                actual_cost = estimated_cost
            transaction = await self._deduct_credits(user, actual_cost, request, response, estimated_cost, False)
            response.credits_used = abs(transaction.amount)  # Return positive value for credits used
            response.credits_balance = transaction.balance_after
            return response
        except Exception as e:
            logger.error("audio_generation_failed", user_id=user.id, error=str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Audio generation failed: {str(e)}")

    async def _estimate_cost(self, request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest], use_openrouter: bool) -> Decimal:
        """Estimate cost based on request type, preferring Web Gateway if available."""
        if isinstance(request, LLMRequest):
            request_type = "llm"
            local_cost = COST_PER_1K_TOKENS.get((request.task_type, request.budget_priority), Decimal("0.001"))
        elif isinstance(request, ImageGenerationRequest):
            request_type = "image"
            local_cost = Decimal("0.01")
        elif isinstance(request, VideoGenerationRequest):
            request_type = "video"
            local_cost = Decimal("0.05")
        elif isinstance(request, AudioGenerationRequest):
            request_type = "audio"
            local_cost = Decimal("0.005")
        else:
            raise ValueError("Unknown request type for cost estimation")

        # For media requests, look up creditCost from media_models table
        # Uses pricingTiers from configJson when available (resolution/duration-based pricing)
        if not isinstance(request, LLMRequest):
            try:
                from sqlalchemy import text
                import json as _json
                result = await self.db.execute(
                    text('SELECT "creditCost", "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
                    {"model_id": request.model}
                )
                row = result.fetchone()
                if row and row[0]:
                    credit_cost = row[0]  # default flat cost
                    config_json = row[1]

                    # Try to use pricingTiers for more accurate cost
                    if config_json:
                        try:
                            config = _json.loads(config_json) if isinstance(config_json, str) else config_json
                            pricing_tiers = config.get("pricingTiers") if isinstance(config, dict) else None
                            if pricing_tiers and isinstance(pricing_tiers, dict):
                                request_payload = request.dict(exclude_unset=True)
                                extra_params = request_payload.get("extra_params")
                                if isinstance(extra_params, dict):
                                    request_payload.update(extra_params)
                                ignore_whitespace_for_pricing = config.get("pricingIgnoreWhitespace") is True

                                def _count_characters(value):
                                    if value is None:
                                        return 0
                                    if isinstance(value, str):
                                        if ignore_whitespace_for_pricing:
                                            return len(re.sub(r"\s+", "", value))
                                        return len(value)
                                    if isinstance(value, list):
                                        return sum(_count_characters(item) for item in value)
                                    if isinstance(value, dict):
                                        if isinstance(value.get("text"), str):
                                            text_value = value.get("text")
                                            if ignore_whitespace_for_pricing:
                                                return len(re.sub(r"\s+", "", text_value))
                                            return len(text_value)
                                        return sum(_count_characters(item) for item in value.values())
                                    return 0

                                def _count_items(value):
                                    if value is None:
                                        return 0
                                    if isinstance(value, list):
                                        return len(value)
                                    if isinstance(value, str):
                                        return 1 if value.strip() else 0
                                    return 1

                                formula = str(config.get("pricingFormula", "flat") or "flat")
                                tier_key = self._build_media_pricing_tier_key(config, request_payload)

                                base_tier_cost = pricing_tiers.get(tier_key)
                                if base_tier_cost is None:
                                    base_tier_cost = pricing_tiers.get("default")
                                if base_tier_cost is not None:
                                    credit_cost = base_tier_cost
                                    logger.info(
                                        "estimate_cost_from_pricing_tier",
                                        model=request.model,
                                        tier_key=tier_key,
                                        credit_cost=credit_cost,
                                    )

                                if formula == "per_unit":
                                    metric = str(config.get("pricingUnitMetric", "characters"))
                                    unit_field = str(config.get("pricingUnitField", "text"))
                                    unit_size_raw = config.get("pricingUnitSize", 1)
                                    try:
                                        unit_size = float(unit_size_raw)
                                    except (TypeError, ValueError):
                                        unit_size = 1.0
                                    if not unit_size or unit_size <= 0:
                                        unit_size = 1.0

                                    rounding_mode = str(config.get("pricingUnitRounding", "ceil"))
                                    min_units_raw = config.get("pricingMinUnits", 0)
                                    try:
                                        min_units = int(float(min_units_raw))
                                    except (TypeError, ValueError):
                                        min_units = 0
                                    if min_units < 0:
                                        min_units = 0

                                    source_value = self._get_pricing_value_by_path(request_payload, unit_field)
                                    if source_value is None and unit_field == "text":
                                        source_value = request_payload.get("prompt") or request_payload.get("text")

                                    measured = _count_items(source_value) if metric == "items" else _count_characters(source_value)
                                    raw_units = measured / unit_size
                                    if measured > 0:
                                        if rounding_mode == "floor":
                                            rounded_units = int(math.floor(raw_units))
                                        elif rounding_mode == "round":
                                            rounded_units = int(round(raw_units))
                                        else:
                                            rounded_units = int(math.ceil(raw_units))
                                    else:
                                        rounded_units = 0

                                    final_units = max(min_units, rounded_units)
                                    credit_cost = float(credit_cost) * final_units
                                    logger.info(
                                        "estimate_cost_from_per_unit",
                                        model=request.model,
                                        metric=metric,
                                        unit_field=unit_field,
                                        measured=measured,
                                        units=final_units,
                                        credit_cost=credit_cost,
                                    )
                        except Exception as e:
                            logger.debug(f"Could not parse pricingTiers: {e}")

                    # Convert platform credits to USD (1000 credits = $1)
                    db_cost = Decimal(str(credit_cost)) / Decimal("1000")
                    logger.info("estimate_cost_from_db", model=request.model, credit_cost=credit_cost, usd_cost=float(db_cost))
                    return db_cost
            except Exception as e:
                logger.debug(f"Could not look up model cost from DB: {e}")

            try:
                from app.llm_proxy.providers.wavespeed_media_provider import (
                    WaveSpeedMediaProvider,
                )

                if isinstance(request, VideoGenerationRequest):
                    provider_hint = self._normalize_provider_id(
                        self._get_api_config_string(request.api_config, "provider", "provider_id", "providerId", "providerName")
                    )
                    if (
                        self._normalize_model_id(request.model) == self._normalize_model_id(WaveSpeedMediaProvider.LAUNCH_MODEL_ID)
                        or provider_hint == "wavespeed_ai"
                    ):
                        extra_params = request.extra_params if isinstance(request.extra_params, dict) else {}
                        duration = request.duration or int(
                            self._get_api_config_string(extra_params, "duration", "seconds") or 5
                        )
                        credit_cost = WaveSpeedMediaProvider.get_pricing_tiers(
                            provider_model_id=WaveSpeedMediaProvider.resolve_provider_model_id(
                                request.model,
                                request.api_config if isinstance(request.api_config, dict) else {},
                            ),
                            submit_endpoint=WaveSpeedMediaProvider.resolve_submit_endpoint(
                                request.api_config if isinstance(request.api_config, dict) else {},
                            ),
                        ).get(f"{duration}s")
                        if credit_cost is not None:
                            db_cost = Decimal(str(credit_cost)) / Decimal("1000")
                            logger.info(
                                "estimate_cost_from_wavespeed_static_fallback",
                                model=request.model,
                                duration=duration,
                                credit_cost=credit_cost,
                                usd_cost=float(db_cost),
                            )
                            return db_cost
                if isinstance(request, AudioGenerationRequest):
                    provider_hint = self._normalize_provider_id(
                        self._get_api_config_string(request.api_config, "provider", "provider_id", "providerId", "providerName")
                    )
                    if provider_hint == "wavespeed_ai":
                        api_config = request.api_config if isinstance(request.api_config, dict) else {}
                        extra_params = request.extra_params if isinstance(request.extra_params, dict) else {}
                        pricing_formula = self._get_api_config_string(api_config, "pricing_formula", "pricingFormula")
                        pricing_tier_default = None
                        raw_tiers = api_config.get("pricingTiers") if isinstance(api_config, dict) else None
                        if isinstance(raw_tiers, dict):
                            pricing_tier_default = raw_tiers.get("default")
                        if pricing_tier_default is None:
                            pricing_tier_default = self._get_api_config_string(api_config, "default_credit_cost", "defaultCreditCost")
                        credit_cost = float(pricing_tier_default or 0)
                        if credit_cost > 0:
                            if pricing_formula == "per_unit":
                                unit_size_raw = self._get_api_config_string(api_config, "pricing_unit_size", "pricingUnitSize")
                                unit_size = int(unit_size_raw or 1000)
                                measured = len(str(request.text or ""))
                                units = max(1, math.ceil(measured / max(1, unit_size)))
                                credit_cost *= units
                            db_cost = Decimal(str(credit_cost)) / Decimal("1000")
                            logger.info(
                                "estimate_cost_from_wavespeed_audio_static_fallback",
                                model=request.model,
                                credit_cost=credit_cost,
                                usd_cost=float(db_cost),
                            )
                            return db_cost
            except Exception as e:
                logger.debug(f"Could not apply WaveSpeed static fallback cost: {e}")

        try:
            gateway_cost = await self.web_gateway.estimate_cost(
                request_type=request_type,
                model=request.model
            )
            if gateway_cost is not None:
                return Decimal(str(gateway_cost))
        except Exception as e:
            logger.warning(f"Failed to get cost from gateway: {e}, using local estimate")

        return local_cost

    async def _deduct_credits(
        self,
        user: User,
        actual_cost: Decimal,
        request: Union[LLMRequest, ImageGenerationRequest, VideoGenerationRequest, AudioGenerationRequest],
        response: Union[LLMResponse, ImageGenerationResponse, VideoGenerationResponse, AudioGenerationResponse],
        estimated_cost: Decimal,
        use_openrouter: bool
    ):
        """
        Deduct credits from user account via Web Gateway or local service.

        IMPORTANT: Uses a fresh database session to avoid MissingGreenlet errors
        that can occur when the original session becomes stale after long-running
        operations (like Kie.ai image generation which can take 40+ seconds).
        """
        request_type = request.__class__.__name__

        # Determine request type for gateway
        if isinstance(request, LLMRequest):
            gateway_request_type = "llm"
        elif isinstance(request, ImageGenerationRequest):
            gateway_request_type = "image"
        elif isinstance(request, VideoGenerationRequest):
            gateway_request_type = "video"
        elif isinstance(request, AudioGenerationRequest):
            gateway_request_type = "audio"
        else:
            gateway_request_type = "unknown"

        metadata = {
            "request_type": request_type,
            "model": request.model,
            "estimated_cost_usd": float(estimated_cost),
            "actual_cost_usd": float(actual_cost),
            "use_openrouter": use_openrouter,
            "response_id": getattr(response, "id", None),
            "provider": getattr(response, "provider", None),
        }

        # Try to deduct via Web Gateway first
        gateway_result = await self.web_gateway.deduct_credits(
            user_id=user.id,
            amount_usd=float(actual_cost),
            description=f"{gateway_request_type.upper()} Generation: {request.model}",
            request_type=gateway_request_type,
            model=request.model,
            metadata=metadata
        )

        if gateway_result:
            logger.info(
                "credits_deducted_via_gateway",
                user_id=user.id,
                amount_usd=float(actual_cost),
                transaction_id=gateway_result.transaction_id,
                balance_after=gateway_result.balance_after_usd,
            )
            return gateway_result

        # Fall back to local credit service with a FRESH database session
        # This is critical for long-running operations like Kie.ai image generation
        # which can take 40+ seconds, causing the original session to become stale
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as fresh_db:
            fresh_credit_service = CreditService(fresh_db)
            transaction = await fresh_credit_service.deduct_credits(
                user_id=str(user.id),
                llm_cost_usd=Decimal(str(actual_cost)) if not isinstance(actual_cost, Decimal) else actual_cost,
                description=f"{gateway_request_type.upper()} Generation: {request.model}",
                metadata=metadata
            )
            logger.info(
                "credits_deducted_locally",
                user_id=str(user.id),
                amount_usd=float(actual_cost),
                balance_after=float(transaction.balance_after),
                transaction_id=transaction.id,
            )
            return transaction

    async def _check_fal_concurrent_limit(self, user_id: int, max_concurrent: int = 3) -> None:
        """Raise HTTPException 429 if user has >= max_concurrent in-flight fal.ai tasks."""
        from sqlalchemy import text as sa_text
        from app.llm_proxy.providers.fal_ai_provider import FalAIProvider as _FalProvider
        # SECURITY: Use parameterized query with ANY() instead of f-string IN()
        # to prevent SQL injection (model list comes from frozenset, but defense-in-depth)
        all_models = list(_FalProvider.ALL_MODELS)
        query = sa_text(
            "SELECT count(*) FROM media_tasks WHERE user_id = :uid "
            "AND status = :processing_status AND model = ANY(:models)"
        )
        result = await self.db.execute(
            query,
            {"uid": user_id, "processing_status": "processing", "models": all_models},
        )
        count = result.scalar() or 0
        if count >= max_concurrent:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum {max_concurrent} concurrent fal.ai tasks. Please wait for existing tasks to complete.",
            )

    async def _check_credits(self, user: User, estimated_cost: Decimal) -> None:
        """Check if user has sufficient credits."""
        has_credits = await self.credit_service.check_sufficient_credits(
            user_id=user.id,
            estimated_cost_usd=estimated_cost
        )

        if not has_credits:
            balance_credits = await self.credit_service.get_balance(user.id)
            balance_usd = credits_to_usd(balance_credits)
            required_credits = usd_to_credits(estimated_cost)
            
            logger.warning(
                "insufficient_credits",
                user_id=user.id,
                balance_credits=balance_credits,
                balance_usd=float(balance_usd),
                needed_credits=required_credits,
                needed_usd=float(estimated_cost),
            )
            
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": "Insufficient credits",
                    "balance_credits": balance_credits,
                    "balance_usd": float(balance_usd),
                    "required_credits": required_credits,
                    "required_usd": float(estimated_cost),
                    "message": (
                        f"You need {required_credits:,} credits (${estimated_cost:.2f}) "
                        f"but only have {balance_credits:,} credits (${balance_usd:.2f}). "
                        "Please top up your account."
                    )
                }
            )
    
    async def _invoke_via_openrouter(
        self,
        request: LLMRequest,
        user: User,
        fallback_models: Optional[List[str]],
        sort: Optional[Literal["price", "throughput", "latency"]],
        data_collection: Literal["allow", "deny"],
        zdr: Optional[bool],
        max_price: Optional[Dict[str, float]],
    ) -> LLMResponse:
        """Invoke LLM via OpenRouter unified client."""
        try:
            response = await self.unified_client.chat(
                messages=request.messages,
                model=request.preferred_model,
                task_type=request.task_type,
                budget_priority=request.budget_priority,
                use_openrouter=True,
                fallback_models=fallback_models,
                sort=sort,
                data_collection=data_collection,
                zdr=zdr,
                max_price=max_price,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            
            logger.info(
                "llm_openrouter_success",
                user_id=user.id,
                model_requested=request.preferred_model,
                model_used=response.model,
                provider=response.provider,
                tokens=response.tokens_used or 0,
            )
            
            return response
            
        except Exception as e:
            logger.error(
                "llm_openrouter_failed",
                user_id=user.id,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"LLM call failed: {str(e)}"
            )
    
    async def _invoke_via_direct(
        self,
        request: LLMRequest,
        user: User
    ) -> LLMResponse:
        """
        Invoke LLM via direct provider client.
        """
        try:
            response = await self.unified_client.chat(
                messages=request.messages,
                model=request.preferred_model,
                task_type=request.task_type,
                budget_priority=request.budget_priority,
                use_openrouter=False,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            
            logger.info(
                "llm_direct_success",
                user_id=user.id,
                model_requested=request.preferred_model,
                model_used=response.model,
                provider=response.provider,
                tokens=response.tokens_used or 0,
            )
            
            return response
            
        except Exception as e:
            logger.error(
                "llm_direct_failed",
                user_id=user.id,
                error=str(e),
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"LLM call failed: {str(e)}"
            )


class LLMGatewayV1(LLMGateway):
    """
    LLM Gateway V1 (Legacy Compatibility)
    This class is kept for backward compatibility only.
    """
    pass


class LLMGatewayV2(LLMGateway):
    """
    LLM Gateway V2 (Legacy Compatibility)
    This class is kept for backward compatibility only.
    """
    pass
