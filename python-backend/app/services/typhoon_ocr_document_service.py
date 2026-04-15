from __future__ import annotations

import base64
import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
import structlog

from app.services.typhoon_ocr_rate_limiter import TyphoonOcrRateLimiter

TYPHOON_DEFAULT_BASE_URL = "https://api.opentyphoon.ai/v1"
TYPHOON_DEFAULT_MODEL = "typhoon-ocr"
TYPHOON_DEFAULT_TIMEOUT_SECONDS = 90.0
TYPHOON_DEFAULT_MAX_TOKENS = 16_000

DOCUMENT_OCR_BASE_PROMPT = """You are a document transcription engine for finance uploads.
Return a JSON object with EXACTLY these fields:
{
  "shortCaption": "One short sentence naming the document type",
  "detailedCaption": "2-3 sentences summarizing the document",
  "ocrText": "Full transcription of every readable word, number, date, time, amount, bank name, person name, reference, and account hint visible in the document",
  "objects": ["list", "of", "visible", "objects"],
  "styles": [],
  "materials": [],
  "colors": [],
  "rooms": [],
  "architectureTags": [],
  "safetyLabels": []
}
Rules:
- Treat the image as a finance document first, not a scene photo.
- Preserve Thai and English exactly as visible.
- Keep the reading order top-to-bottom, left-to-right.
- Do not summarize, translate, or omit readable text in ocrText.
- If a value is partly obscured, include the readable portion exactly.
- If there are duplicate text regions, keep the most legible transcription.
Return ONLY valid JSON, no markdown or explanation."""


class TyphoonDocumentAdapterError(RuntimeError):
    """Base error for Typhoon OCR processing."""


class TyphoonDocumentProviderUnavailableError(TyphoonDocumentAdapterError):
    """Raised when Typhoon OCR is unavailable or misconfigured."""


class TyphoonUnsupportedDocumentError(TyphoonDocumentAdapterError):
    """Raised when the input cannot be processed by Typhoon OCR."""


logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class TyphoonOcrDocumentConfig:
    api_key: str
    base_url: str = TYPHOON_DEFAULT_BASE_URL
    model: str = TYPHOON_DEFAULT_MODEL
    timeout_seconds: float = TYPHOON_DEFAULT_TIMEOUT_SECONDS
    max_tokens: int = TYPHOON_DEFAULT_MAX_TOKENS
    temperature: float = 0.0
    top_p: float = 0.6
    repetition_penalty: float = 1.2


@dataclass(frozen=True)
class TyphoonDocumentResult:
    provider: str
    model_version: str | None
    source_url_kind: str
    source_url_public: str
    markdown: str
    ocr_text: str
    structured_json: dict[str, Any] | None
    page_count: int | None
    warnings: list[str] = field(default_factory=list)
    trace_id: str | None = None
    provider_request_id: str | None = None
    parse_status: str = "completed"
    mime_type: str | None = None
    file_hash: str | None = None
    markdown_hash: str | None = None
    ocr_text_hash: str | None = None

    def to_legacy_analysis(self) -> dict[str, Any]:
        analysis: dict[str, Any]
        if self.structured_json and isinstance(self.structured_json, dict):
            analysis = dict(self.structured_json)
        else:
            fallback_text = self.ocr_text.strip() or self.markdown.strip()
            analysis = {
                "shortCaption": "Document",
                "detailedCaption": fallback_text[:512],
                "ocrText": fallback_text,
                "objects": [],
                "styles": [],
                "materials": [],
                "colors": [],
                "rooms": [],
                "architectureTags": [],
                "safetyLabels": [],
            }

        fallback_text = self.ocr_text.strip() or self.markdown.strip()
        analysis.setdefault("shortCaption", "Document")
        analysis.setdefault("detailedCaption", fallback_text[:512])
        analysis.setdefault("ocrText", fallback_text)
        for key in ("objects", "styles", "materials", "colors", "rooms", "architectureTags", "safetyLabels"):
            analysis.setdefault(key, [])
        analysis["metadata"] = {
            "provider": self.provider,
            "model_version": self.model_version,
            "source_url_kind": self.source_url_kind,
            "source_url_public": self.source_url_public,
            "page_count": self.page_count,
            "parse_status": self.parse_status,
            "provider_request_id": self.provider_request_id,
            "trace_id": self.trace_id,
            "warnings": list(self.warnings),
            "mime_type": self.mime_type,
            "file_hash": self.file_hash,
            "markdown_hash": self.markdown_hash,
            "ocr_text_hash": self.ocr_text_hash,
        }
        return analysis


class TyphoonOcrDocumentClientProtocol(Protocol):
    async def extract(self, *, content: bytes, mime_type: str, file_name: str, prompt: str, trace_id: str | None = None) -> dict[str, Any]:
        ...


def _resolve_api_key(api_key_override: str | None = None) -> str:
    return str(api_key_override or "").strip()


def _normalize_mime_type(mime_type: str) -> str:
    return str(mime_type or "").split(";", 1)[0].strip().lower()


def _is_image_mime(mime_type: str) -> bool:
    return _normalize_mime_type(mime_type) in {"image/jpeg", "image/png"}


def _is_pdf_mime(mime_type: str, file_name: str) -> bool:
    normalized = _normalize_mime_type(mime_type)
    return normalized == "application/pdf" or file_name.lower().endswith(".pdf")


def _build_document_ocr_prompt(capture_intent: str | None = None) -> str:
    prompt = DOCUMENT_OCR_BASE_PROMPT
    if capture_intent == "transfer_slip":
        prompt += (
            "\nThis document is a transfer slip. Prioritize sender, receiver, bank name, "
            "account nickname, masked account number, reference number, amount, fee, and timestamp."
        )
    elif capture_intent == "statement":
        prompt += (
            "\nThis document is a bank statement. Prioritize account holder, bank name, "
            "statement period, opening balance, closing balance, and transaction rows."
        )
    else:
        prompt += (
            "\nThis document is a receipt or invoice. Prioritize merchant name, total, VAT, "
            "subtotal, payment method, and purchase date/time."
        )
    return prompt


def _extract_json_object_text(text: str) -> dict[str, Any] | None:
    candidate = text.strip()
    if not candidate:
        return None
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)

    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(candidate[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _build_data_url(content: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    normalized = _normalize_mime_type(mime_type) or "application/octet-stream"
    return f"data:{normalized};base64,{encoded}"


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _analysis_from_text(
    *,
    text: str,
    provider_request_id: str | None,
    model_version: str | None,
    mime_type: str,
    file_name: str,
    page_count: int | None,
    trace_id: str | None,
    source_url_kind: str,
    source_url_public: str,
    content: bytes,
    warnings: list[str],
    structured_json: dict[str, Any] | None = None,
) -> TyphoonDocumentResult:
    file_hash = hashlib.sha256(content).hexdigest()
    markdown = text.strip()
    return TyphoonDocumentResult(
        provider="typhoon_ocr_1_5",
        model_version=model_version,
        source_url_kind=source_url_kind,
        source_url_public=source_url_public,
        markdown=markdown,
        ocr_text=markdown,
        structured_json=structured_json,
        page_count=page_count,
        warnings=warnings,
        trace_id=trace_id,
        provider_request_id=provider_request_id,
        parse_status="completed",
        mime_type=_normalize_mime_type(mime_type) or None,
        file_hash=file_hash,
        markdown_hash=hashlib.sha256(markdown.encode("utf-8")).hexdigest() if markdown else None,
        ocr_text_hash=hashlib.sha256(markdown.encode("utf-8")).hexdigest() if markdown else None,
    )


class TyphoonOcrDocumentService:
    def __init__(self, config: TyphoonOcrDocumentConfig) -> None:
        self.config = config
        self._rate_limiter = TyphoonOcrRateLimiter()

    def is_configured(self) -> bool:
        return bool(self.config.api_key.strip())

    async def _post_completion(self, *, messages: list[dict[str, Any]], trace_id: str | None = None) -> dict[str, Any]:
        if not self.is_configured():
            raise TyphoonDocumentProviderUnavailableError("Typhoon OCR is not configured")

        rate_limit_state = await self._rate_limiter.acquire(trace_id=trace_id)
        if not rate_limit_state.allowed:
            logger.warning(
                "typhoon_ocr.rate_limited",
                trace_id=trace_id,
                limit=self._rate_limiter.max_requests,
                window_seconds=self._rate_limiter.window_seconds,
                retry_after_seconds=rate_limit_state.retry_after_seconds,
            )
            raise TyphoonDocumentProviderUnavailableError(
                rate_limit_state.error_message
                or (
                    "Typhoon OCR rate limit exceeded "
                    f"({self._rate_limiter.max_requests} requests per {self._rate_limiter.window_seconds} seconds). "
                    f"Retry after {rate_limit_state.retry_after_seconds} seconds."
                )
            )

        payload = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
            "repetition_penalty": self.config.repetition_penalty,
        }
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(self.config.timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.config.base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )

        if response.status_code >= 400:
            detail = response.text.strip()
            raise TyphoonDocumentProviderUnavailableError(
                f"Typhoon OCR request failed ({response.status_code}): {detail}"
            )

        data = response.json()
        if not isinstance(data, dict):
            raise TyphoonDocumentProviderUnavailableError("Typhoon OCR returned an invalid response")
        return data

    async def _extract_image(
        self,
        *,
        content: bytes,
        mime_type: str,
        file_name: str,
        prompt: str,
        trace_id: str | None = None,
        page_count: int | None = None,
    ) -> TyphoonDocumentResult:
        response = await self._post_completion(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": _build_data_url(content, mime_type)}},
                    ],
                }
            ],
            trace_id=trace_id,
        )
        choices = response.get("choices")
        if not isinstance(choices, list) or not choices:
            raise TyphoonDocumentProviderUnavailableError("Typhoon OCR returned no choices")

        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        content_text = ""
        if isinstance(message, dict):
            maybe_content = message.get("content")
            if isinstance(maybe_content, str):
                content_text = maybe_content.strip()
            elif isinstance(maybe_content, list):
                parts: list[str] = []
                for item in maybe_content:
                    if isinstance(item, dict) and isinstance(item.get("text"), str):
                        part = item["text"].strip()
                        if part:
                            parts.append(part)
                content_text = "\n".join(parts).strip()

        parsed = _extract_json_object_text(content_text)
        analysis = parsed if parsed else None
        if analysis is None:
            analysis = {
                "shortCaption": "Document",
                "detailedCaption": content_text[:512],
                "ocrText": content_text,
                "objects": [],
                "styles": [],
                "materials": [],
                "colors": [],
                "rooms": [],
                "architectureTags": [],
                "safetyLabels": [],
            }

        ocr_text = _coerce_text(analysis.get("ocrText")) or content_text
        if not ocr_text:
            raise TyphoonDocumentProviderUnavailableError("Typhoon OCR returned empty text")

        return _analysis_from_text(
            text=ocr_text,
            provider_request_id=str(response.get("id") or ""),
            model_version=str(response.get("model") or self.config.model or ""),
            mime_type=mime_type,
            file_name=file_name,
            page_count=page_count,
            trace_id=trace_id,
            source_url_kind="uploaded_bytes",
            source_url_public="",
            content=content,
            warnings=[],
            structured_json=analysis,
        )

    async def parse_and_extract_document(
        self,
        *,
        content: bytes | None,
        mime_type: str,
        file_name: str,
        prompt: str | None = None,
        capture_intent: str | None = None,
        source_url: str | None = None,
        trace_id: str | None = None,
        session: Any | None = None,
        allow_temp_url: bool = True,
        extract_schema: dict[str, Any] | None = None,
    ) -> TyphoonDocumentResult:
        del session, allow_temp_url, extract_schema

        if content is None or not content:
            raise TyphoonUnsupportedDocumentError("Typhoon OCR requires document bytes")

        normalized_mime = _normalize_mime_type(mime_type)
        source_url_kind = "public_url" if source_url else "uploaded_bytes"
        source_url_public = str(source_url or "")
        warnings: list[str] = []
        prompt_text = prompt or _build_document_ocr_prompt(capture_intent)

        if _is_image_mime(normalized_mime):
            return await self._extract_image(
                content=content,
                mime_type=normalized_mime,
                file_name=file_name,
                prompt=prompt_text,
                trace_id=trace_id,
                page_count=1,
            )

        if _is_pdf_mime(normalized_mime, file_name):
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            page_texts: list[str] = []
            max_pages = len(reader.pages)

            for page_index, page in enumerate(reader.pages, start=1):
                extracted_text = _coerce_text(page.extract_text())
                if extracted_text:
                    page_texts.append(f"[page {page_index}]\n{extracted_text}")
                    continue

                page_images = list(getattr(page, "images", []) or [])
                if not page_images:
                    warnings.append(f"page {page_index} has no embedded images")
                    continue

                def score(image: Any) -> tuple[int, int]:
                    pil_image = getattr(image, "image", None)
                    if pil_image is not None:
                        width = int(getattr(pil_image, "width", 0) or 0)
                        height = int(getattr(pil_image, "height", 0) or 0)
                        return (width * height, len(getattr(image, "data", b"") or b""))
                    raw_data = getattr(image, "data", None)
                    if isinstance(raw_data, (bytes, bytearray)):
                        return (len(raw_data), 0)
                    return (0, 0)

                selected_image = max(page_images, key=score)
                raw_data = getattr(selected_image, "data", None)
                image_bytes = None
                image_mime = "image/png"
                if isinstance(raw_data, (bytes, bytearray)) and raw_data:
                    image_bytes = bytes(raw_data)
                    image_mime = "image/png"
                else:
                    pil_image = getattr(selected_image, "image", None)
                    if pil_image is not None:
                        if getattr(pil_image, "mode", None) not in ("RGB", "RGBA", "L"):
                            pil_image = pil_image.convert("RGB")
                        elif getattr(pil_image, "mode", None) == "RGBA":
                            pil_image = pil_image.convert("RGB")
                        output = io.BytesIO()
                        pil_image.save(output, format="PNG")
                        image_bytes = output.getvalue()

                if not image_bytes:
                    warnings.append(f"page {page_index} image decode failed")
                    continue

                page_result = await self._extract_image(
                    content=image_bytes,
                    mime_type=image_mime,
                    file_name=file_name,
                    prompt=prompt_text,
                    trace_id=trace_id,
                    page_count=1,
                )
                page_texts.append(f"[page {page_index}]\n{page_result.ocr_text.strip()}")

            if not page_texts:
                fallback_text = _coerce_text(reader.pages[0].extract_text()) if reader.pages else ""
                if fallback_text:
                    page_texts.append(fallback_text)
                else:
                    raise TyphoonUnsupportedDocumentError("Typhoon OCR could not extract text from the PDF")

            combined_text = "\n\n".join(page_texts).strip()
            analysis = {
                "shortCaption": "Document",
                "detailedCaption": combined_text[:512],
                "ocrText": combined_text,
                "objects": [],
                "styles": [],
                "materials": [],
                "colors": [],
                "rooms": [],
                "architectureTags": [],
                "safetyLabels": [],
            }
            return _analysis_from_text(
                text=combined_text,
                provider_request_id="",
                model_version=self.config.model,
                mime_type=normalized_mime or mime_type,
                file_name=file_name,
                page_count=max_pages,
                trace_id=trace_id,
                source_url_kind=source_url_kind,
                source_url_public=source_url_public,
                content=content,
                warnings=warnings,
                structured_json=analysis,
            )

        raise TyphoonUnsupportedDocumentError(
            f"Typhoon OCR does not support mime type: {mime_type}"
        )


def get_typhoon_ocr_document_service(api_key_override: str | None = None) -> TyphoonOcrDocumentService:
    return TyphoonOcrDocumentService(
        TyphoonOcrDocumentConfig(
            api_key=_resolve_api_key(api_key_override),
        )
    )
