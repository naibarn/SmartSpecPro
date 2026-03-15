"""
Celery task for vision analysis pipeline (Section 03: Vision Pipeline).

analyze_image_task:
  1. Idempotency check (skip if analysis exists)
  2. Call Gemini 2.5 Flash for structured image analysis
  3. Safety check (NSFW blocking)
  4. Store analysis results in media_asset_analysis
  5. Create multimodal_memory_items and multimodal_memory_vectors
  6. Update media_assets.status
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx
import structlog
from sqlalchemy import select, update

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.vision import (
    MediaAsset,
    MediaAssetAnalysis,
    MultimodalMemoryItem,
    MultimodalMemoryVector,
)

logger = structlog.get_logger(__name__)

# Retry backoff intervals (seconds)
RETRY_BACKOFFS = [30, 120, 480]
NSFW_THRESHOLD = 0.7
NSFW_CATEGORIES = {
    "SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "SEXUAL",
    "NSFW",
}

GEMINI_VISION_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
)
GEMINI_EMBEDDING_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:embedContent"
)

VISION_PROMPT = """Analyze this image and return a JSON object with EXACTLY these fields:
{
  "shortCaption": "One sentence description (max 20 words)",
  "detailedCaption": "2-3 sentences with more detail",
  "ocrText": "Any text visible in the image, or empty string",
  "objects": ["list", "of", "visible", "objects"],
  "styles": ["design", "styles", "detected"],
  "materials": ["materials", "visible"],
  "colors": ["dominant", "colors"],
  "rooms": ["room", "types", "if", "interior"],
  "architectureTags": ["architectural", "features"],
  "aestheticScore": 0.75,
  "safetyLabels": []
}
Return ONLY valid JSON, no markdown or explanation."""


def _run_async(coro):
    """Run async coroutine in Celery worker context."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)


def _is_nsfw(safety_labels: list) -> bool:
    """Return True if any safety label exceeds NSFW threshold."""
    for label in safety_labels or []:
        category = label.get("category", "").upper()
        confidence = float(label.get("confidence", 0))
        if category in NSFW_CATEGORIES and confidence > NSFW_THRESHOLD:
            return True
    return False


def _build_searchable_text(analysis: dict) -> str:
    """Build concatenated searchable text from analysis fields."""
    parts = []
    if analysis.get("shortCaption"):
        parts.append(analysis["shortCaption"])
    if analysis.get("objects"):
        parts.append(" ".join(analysis["objects"]))
    if analysis.get("styles"):
        parts.append("style: " + ", ".join(analysis["styles"]))
    if analysis.get("materials"):
        parts.append("materials: " + ", ".join(analysis["materials"]))
    if analysis.get("colors"):
        parts.append("colors: " + ", ".join(analysis["colors"]))
    if analysis.get("ocrText"):
        parts.append("ocr: " + analysis["ocrText"])
    return " | ".join(parts)


async def _call_gemini_vision(image_url: str, api_key: str) -> dict:
    """Call Gemini 2.5 Flash for vision analysis. Returns parsed analysis dict."""
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": VISION_PROMPT},
                    {"fileData": {"mimeType": "image/jpeg", "fileUri": image_url}},
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.1,
        },
    }
    response = httpx.post(
        GEMINI_VISION_URL,
        params={"key": api_key},
        json=payload,
        timeout=60.0,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Gemini vision API error: {response.status_code} {response.text[:200]}")

    data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


async def _call_gemini_embedding(text: str, api_key: str) -> Optional[list]:
    """Call Gemini Embedding API. Returns 768-dim vector or None on failure."""
    payload = {"content": {"parts": [{"text": text}]}}
    response = httpx.post(
        GEMINI_EMBEDDING_URL,
        params={"key": api_key},
        json=payload,
        timeout=30.0,
    )
    if response.status_code != 200:
        logger.warning("Gemini embedding API error", status=response.status_code)
        return None
    return response.json().get("embedding", {}).get("values")


async def _update_asset_status(asset_id: int, status: str) -> None:
    """Update media_assets.status atomically."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(MediaAsset).where(MediaAsset.id == asset_id).values(status=status)
        )
        await db.commit()


async def _run_analysis(
    asset_id: int,
    image_url: str,
    tenant_id: str,
    user_id: int,
    system_cost: bool,
) -> None:
    """Main async analysis flow."""
    api_key = getattr(settings, "GOOGLE_API_KEY", None)
    if not api_key:
        logger.warning("GOOGLE_API_KEY not configured — skipping vision analysis", asset_id=asset_id)
        await _update_asset_status(asset_id, "failed")
        return

    # 1. Idempotency check
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MediaAssetAnalysis).where(MediaAssetAnalysis.mediaAssetId == asset_id)
        )
        existing = result.scalars().first()
        if existing:
            logger.info("Analysis already exists, skipping", asset_id=asset_id)
            return

    # 2. Set status to 'analyzing'
    await _update_asset_status(asset_id, "analyzing")

    # 3. Call Gemini vision
    try:
        analysis = await _call_gemini_vision(image_url, api_key)
    except Exception as exc:
        logger.error("Gemini vision call failed", asset_id=asset_id, error=str(exc))
        await _update_asset_status(asset_id, "failed")
        return

    # 4. Parse and validate
    short_caption = analysis.get("shortCaption", "")
    detailed_caption = analysis.get("detailedCaption", "")
    safety_labels = analysis.get("safetyLabels", [])

    # 5. Safety check
    nsfw = _is_nsfw(safety_labels)

    async with AsyncSessionLocal() as db:
        # 6. Store analysis row (always — for audit)
        analysis_row = MediaAssetAnalysis(
            mediaAssetId=asset_id,
            provider="google",
            model="gemini-2.5-flash",
            shortCaption=short_caption,
            detailedCaption=detailed_caption,
            ocrText=analysis.get("ocrText", ""),
            objects=analysis.get("objects", []),
            styles=analysis.get("styles", []),
            materials=analysis.get("materials", []),
            colors=analysis.get("colors", []),
            rooms=analysis.get("rooms", []),
            architectureTags=analysis.get("architectureTags", []),
            aestheticScore=analysis.get("aestheticScore"),
            safetyLabels=safety_labels,
            extractedJson=analysis,
        )
        db.add(analysis_row)
        await db.flush()

        if nsfw:
            await db.commit()

        if not nsfw:
            # 7. Build searchable text
            searchable_text = _build_searchable_text(analysis)

            # 8. Create memory item
            memory_item = MultimodalMemoryItem(
                tenantId=tenant_id,
                userId=user_id,
                mediaAssetId=asset_id,
                memoryKind="image",
                title=short_caption,
                summary=detailed_caption,
                searchableText=searchable_text,
                sourceRole="user",
                salience=0.500,
                confidence=0.800,
            )
            db.add(memory_item)
            await db.flush()

            # 9 & 10. Generate embedding and store vector
            embedding = await _call_gemini_embedding(searchable_text, api_key)
            if embedding:
                vector_row = MultimodalMemoryVector(
                    memoryItemId=memory_item.id,
                    provider="google",
                    model="gemini-embedding-2-preview",
                    modality="image",
                    embedding=embedding,
                    embeddingVersion="v1",
                )
                db.add(vector_row)

            await db.commit()

    # 11. Update asset status
    final_status = "nsfw_blocked" if nsfw else "analyzed"
    await _update_asset_status(asset_id, final_status)

    logger.info(
        "Vision analysis complete",
        asset_id=asset_id,
        tenant_id=tenant_id,
        status=final_status,
    )


@celery_app.task(
    bind=True,
    name="app.tasks.vision_tasks.analyze_image_task",
    max_retries=3,
    acks_late=True,
    queue="vision",
)
def analyze_image_task(
    self,
    asset_id: int,
    image_url: str,
    tenant_id: str,
    user_id: int,
    system_cost: bool = False,
) -> None:
    """Celery task: analyze an image using Gemini 2.5 Flash vision."""
    log = logger.bind(asset_id=asset_id, tenant_id=tenant_id, user_id=user_id)
    log.info("Starting vision analysis task")

    try:
        _run_async(_run_analysis(asset_id, image_url, tenant_id, user_id, system_cost))
    except Exception as exc:
        log.error("Vision analysis task failed", error=str(exc))
        retry_count = self.request.retries
        if retry_count < self.max_retries:
            backoff = RETRY_BACKOFFS[min(retry_count, len(RETRY_BACKOFFS) - 1)]
            log.warning("Retrying vision task", countdown=backoff, attempt=retry_count + 1)
            raise self.retry(exc=exc, countdown=backoff)
        # Final failure
        _run_async(_update_asset_status(asset_id, "failed"))
        log.error("Vision analysis failed after all retries", asset_id=asset_id)
