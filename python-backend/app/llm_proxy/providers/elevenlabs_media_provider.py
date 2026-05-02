"""Direct ElevenLabs media provider for audio workflows."""

from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.core.media_job_validators import validate_uri_strict


ELEVENLABS_PROVIDER = "elevenlabs"
ELEVENLABS_DEFAULT_BASE_URL = "https://api.elevenlabs.io"
ELEVENLABS_MAX_SOURCE_BYTES = 100 * 1024 * 1024


class ElevenLabsMediaError(ValueError):
    """Raised for invalid ElevenLabs media requests."""


@dataclass(frozen=True, slots=True)
class ElevenLabsBinaryResult:
    content: bytes
    content_type: str
    extension: str
    output_format: Optional[str]
    capability: str


@dataclass(frozen=True, slots=True)
class ElevenLabsTranscriptResult:
    transcript: dict[str, Any]
    text: str
    capability: str = "speech_to_text"


class ElevenLabsMediaProvider:
    """Small async client for first-party ElevenLabs media endpoints."""

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        timeout: Optional[httpx.Timeout] = None,
    ) -> None:
        if not api_key:
            raise ElevenLabsMediaError("ElevenLabs API key is required")
        self.base_url = (base_url or ELEVENLABS_DEFAULT_BASE_URL).rstrip("/")
        self._api_key = api_key
        self.client = httpx.AsyncClient(
            timeout=timeout or httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=5.0),
            follow_redirects=False,
        )

    async def aclose(self) -> None:
        await self.client.aclose()

    async def generate_text_to_speech(self, payload: dict[str, Any]) -> ElevenLabsBinaryResult:
        voice_id = _required_string(payload, "voice_id")
        body = _compact_json_payload(payload, exclude={"voice_id", "output_format"})
        if "text" not in body:
            body["text"] = _required_string(payload, "text")
        output_format = _optional_string(payload.get("output_format"))
        response = await self.client.post(
            self._url(f"/v1/text-to-speech/{quote(voice_id, safe='')}"),
            headers=self._headers(accept="audio/mpeg"),
            params=_output_format_params(output_format),
            json=body,
        )
        await self._raise_for_status(response)
        return _binary_result(response, output_format=output_format, capability="text_to_speech")

    async def generate_sound_effect(self, payload: dict[str, Any]) -> ElevenLabsBinaryResult:
        body = _compact_json_payload(payload, exclude={"output_format"})
        if "text" not in body:
            body["text"] = _required_string(payload, "text")
        output_format = _optional_string(payload.get("output_format"))
        response = await self.client.post(
            self._url("/v1/sound-generation"),
            headers=self._headers(accept="audio/mpeg"),
            params=_output_format_params(output_format),
            json=body,
        )
        await self._raise_for_status(response)
        return _binary_result(response, output_format=output_format, capability="sound_effects")

    async def convert_voice(self, payload: dict[str, Any]) -> ElevenLabsBinaryResult:
        voice_id = _required_string(payload, "voice_id")
        source = await self._download_source(_required_string(payload, "audio"))
        output_format = _optional_string(payload.get("output_format"))
        files = {"audio": (source.filename, source.content, source.content_type)}
        data = _compact_form_payload(payload, exclude={"audio", "voice_id", "output_format"})
        response = await self.client.post(
            self._url(f"/v1/speech-to-speech/{quote(voice_id, safe='')}"),
            headers=self._headers(accept="audio/mpeg", content_type=None),
            params=_output_format_params(output_format),
            data=data,
            files=files,
        )
        await self._raise_for_status(response)
        return _binary_result(response, output_format=output_format, capability="voice_changer")

    async def isolate_voice(self, payload: dict[str, Any]) -> ElevenLabsBinaryResult:
        source = await self._download_source(_required_string(payload, "audio"))
        output_format = _optional_string(payload.get("output_format"))
        response = await self.client.post(
            self._url("/v1/audio-isolation"),
            headers=self._headers(accept="audio/mpeg", content_type=None),
            params=_output_format_params(output_format),
            files={"audio": (source.filename, source.content, source.content_type)},
        )
        await self._raise_for_status(response)
        return _binary_result(response, output_format=output_format, capability="voice_isolator")

    async def transcribe(self, payload: dict[str, Any]) -> ElevenLabsTranscriptResult:
        source = await self._download_source(_required_string(payload, "file"))
        data = _compact_form_payload(payload, exclude={"file"})
        data.setdefault("model_id", "scribe_v2")
        response = await self.client.post(
            self._url("/v1/speech-to-text"),
            headers=self._headers(accept="application/json", content_type=None),
            data=data,
            files={"file": (source.filename, source.content, source.content_type)},
        )
        await self._raise_for_status(response)
        transcript = response.json()
        text = str(transcript.get("text") or transcript.get("transcript") or "").strip()
        return ElevenLabsTranscriptResult(transcript=transcript, text=text)

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _headers(self, *, accept: str, content_type: Optional[str] = "application/json") -> dict[str, str]:
        headers = {
            "xi-api-key": self._api_key,
            "Accept": accept,
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    async def _raise_for_status(self, response: httpx.Response) -> None:
        if response.is_success:
            return
        message = response.text[:500].replace(self._api_key, "[redacted]")
        raise httpx.HTTPStatusError(
            f"ElevenLabs API error (HTTP {response.status_code}): {message}",
            request=response.request,
            response=response,
        )

    async def _download_source(self, url: str) -> "_DownloadedSource":
        validate_uri_strict(url)
        response = await self.client.get(url, headers={"Accept": "*/*"})
        response.raise_for_status()
        if len(response.content) > ELEVENLABS_MAX_SOURCE_BYTES:
            raise ElevenLabsMediaError("Source media exceeds the maximum supported size")
        content_type = response.headers.get("content-type", "application/octet-stream").split(";")[0].strip()
        extension = mimetypes.guess_extension(content_type) or ".bin"
        return _DownloadedSource(
            filename=f"source{extension}",
            content=response.content,
            content_type=content_type,
        )


@dataclass(frozen=True, slots=True)
class _DownloadedSource:
    filename: str
    content: bytes
    content_type: str


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if isinstance(value, list) and value:
        value = value[0]
    if not isinstance(value, str) or not value.strip():
        raise ElevenLabsMediaError(f"ElevenLabs field '{key}' is required")
    return value.strip()


def _optional_string(value: Any) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _compact_json_payload(payload: dict[str, Any], *, exclude: set[str]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in exclude and value is not None and value != ""}


def _compact_form_payload(payload: dict[str, Any], *, exclude: set[str]) -> dict[str, str]:
    compact: dict[str, str] = {}
    for key, value in payload.items():
        if key in exclude or value is None or value == "":
            continue
        if isinstance(value, bool):
            compact[key] = "true" if value else "false"
        else:
            compact[key] = str(value)
    return compact


def _output_format_params(output_format: Optional[str]) -> dict[str, str]:
    return {"output_format": output_format} if output_format else {}


def _binary_result(response: httpx.Response, *, output_format: Optional[str], capability: str) -> ElevenLabsBinaryResult:
    content_type = response.headers.get("content-type", "audio/mpeg").split(";")[0].strip()
    extension = _extension_for_audio(content_type, output_format)
    return ElevenLabsBinaryResult(
        content=response.content,
        content_type=content_type,
        extension=extension,
        output_format=output_format,
        capability=capability,
    )


def _extension_for_audio(content_type: str, output_format: Optional[str]) -> str:
    if output_format:
        first = output_format.split("_", 1)[0].lower()
        if first == "pcm":
            return "wav"
        if first in {"mp3", "wav", "ogg", "ulaw"}:
            return first
    if content_type == "audio/wav":
        return "wav"
    if content_type == "audio/ogg":
        return "ogg"
    return "mp3"
