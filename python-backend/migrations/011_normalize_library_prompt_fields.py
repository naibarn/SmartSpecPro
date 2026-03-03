"""
Migration 011: normalize markdown-fenced prompt text in Library/RAG tables.

Backfills prompt-like fields that can be displayed in Library UI and consumed by
RAG indexing:
- media_tasks.prompt
- library_items.description (media_task source only)
- library_items.metadata.prompt
- library_chunks.content (chunks belonging to media_task source items)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

MARKDOWN_FENCED_BLOCK_PATTERN = re.compile(
    r"^\s*```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$"
)
MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN = re.compile(
    r"```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)\s*```"
)
MARKDOWN_FENCE_LINE_PATTERN = re.compile(r"^\s*```[A-Za-z0-9_-]*\s*$", re.MULTILINE)
LEADING_JSON_LABEL_PATTERN = re.compile(r"^json\s*\n([\s\S]*)$", re.IGNORECASE)


def normalize_media_prompt(prompt: Any) -> str:
    """Normalize prompt text by unwrapping markdown fenced blocks."""
    if prompt is None:
        return ""

    normalized = str(prompt).replace("\r\n", "\n").strip()
    for _ in range(2):
        match = MARKDOWN_FENCED_BLOCK_PATTERN.match(normalized)
        if not match:
            break
        normalized = (match.group(1) or "").strip()

    normalized = MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN.sub(
        lambda match: (match.group(1) or "").strip(),
        normalized,
    )
    normalized = MARKDOWN_FENCE_LINE_PATTERN.sub("", normalized).strip()

    json_label_match = LEADING_JSON_LABEL_PATTERN.match(normalized)
    if json_label_match:
        candidate = (json_label_match.group(1) or "").strip()
        if candidate.startswith("{") or candidate.startswith("["):
            normalized = candidate

    return normalized


def _coerce_metadata_dict(raw_metadata: Any) -> dict[str, Any]:
    if isinstance(raw_metadata, dict):
        return raw_metadata

    if isinstance(raw_metadata, str):
        try:
            parsed = json.loads(raw_metadata)
        except Exception:  # noqa: BLE001
            return {}
        if isinstance(parsed, dict):
            return parsed

    return {}


async def _normalize_media_tasks(session: AsyncSession) -> tuple[int, int]:
    scanned = 0
    updated = 0

    result = await session.execute(
        text(
            r"""
            SELECT id, prompt
            FROM media_tasks
            WHERE prompt IS NOT NULL
              AND (
                prompt LIKE '%```%'
                OR prompt ~* '^\s*json\s*\n\s*[\{\[]'
              )
            """
        )
    )

    for row in result.mappings().all():
        scanned += 1
        raw_prompt = row.get("prompt")
        if not isinstance(raw_prompt, str):
            continue

        normalized_prompt = normalize_media_prompt(raw_prompt)
        if normalized_prompt == raw_prompt:
            continue

        await session.execute(
            text(
                """
                UPDATE media_tasks
                SET prompt = :prompt
                WHERE id = :id
                """
            ),
            {"id": row["id"], "prompt": normalized_prompt},
        )
        updated += 1

    return scanned, updated


async def _normalize_library_items(session: AsyncSession) -> tuple[int, int]:
    scanned = 0
    updated = 0

    result = await session.execute(
        text(
            r"""
            SELECT id, source, description, metadata
            FROM library_items
            WHERE (
                source = 'media_task'
                AND description IS NOT NULL
                AND (
                    description LIKE '%```%'
                    OR description ~* '^\s*json\s*\n\s*[\{\[]'
                )
            )
            OR (
                metadata IS NOT NULL
                AND json_typeof(metadata::json) = 'object'
                AND (metadata::jsonb ? 'prompt')
                AND (
                    (metadata::jsonb ->> 'prompt') LIKE '%```%'
                    OR (metadata::jsonb ->> 'prompt') ~* '^\s*json\s*\n\s*[\{\[]'
                )
            )
            """
        )
    )

    for row in result.mappings().all():
        scanned += 1
        source = str(row.get("source") or "")
        description = row.get("description")
        metadata = _coerce_metadata_dict(row.get("metadata"))

        changed = False
        new_description = description

        if source == "media_task" and isinstance(description, str):
            normalized_description = normalize_media_prompt(description)
            if normalized_description != description:
                new_description = normalized_description
                changed = True

        prompt_value = metadata.get("prompt")
        if isinstance(prompt_value, str):
            normalized_prompt = normalize_media_prompt(prompt_value)
            if normalized_prompt != prompt_value:
                metadata = dict(metadata)
                metadata["prompt"] = normalized_prompt
                changed = True

        if not changed:
            continue

        await session.execute(
            text(
                """
                UPDATE library_items
                SET description = :description,
                    metadata = CAST(:metadata AS json)
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "description": new_description,
                "metadata": json.dumps(metadata, ensure_ascii=False),
            },
        )
        updated += 1

    return scanned, updated


async def _normalize_library_chunks(session: AsyncSession) -> tuple[int, int]:
    scanned = 0
    updated = 0

    result = await session.execute(
        text(
            r"""
            SELECT lc.id, lc.content
            FROM library_chunks lc
            INNER JOIN library_items li ON li.id = lc.library_item_id
            WHERE lc.content IS NOT NULL
              AND (
                li.source = 'media_task'
                OR (li.metadata::jsonb ->> 'source_type') = 'media_task'
              )
              AND (
                lc.content LIKE '%```%'
                OR lc.content ~* '^\s*json\s*\n\s*[\{\[]'
              )
            """
        )
    )

    for row in result.mappings().all():
        scanned += 1
        raw_content = row.get("content")
        if not isinstance(raw_content, str):
            continue

        normalized_content = normalize_media_prompt(raw_content)
        if normalized_content == raw_content:
            continue

        await session.execute(
            text(
                """
                UPDATE library_chunks
                SET content = :content
                WHERE id = :id
                """
            ),
            {"id": row["id"], "content": normalized_content},
        )
        updated += 1

    return scanned, updated


async def upgrade() -> None:
    """Apply migration 011."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            media_scanned, media_updated = await _normalize_media_tasks(session)
            items_scanned, items_updated = await _normalize_library_items(session)
            chunks_scanned, chunks_updated = await _normalize_library_chunks(session)

            await session.commit()

            logger.info(
                "normalize_library_prompt_fields_upgraded",
                extra={
                    "media_tasks_scanned": media_scanned,
                    "media_tasks_updated": media_updated,
                    "library_items_scanned": items_scanned,
                    "library_items_updated": items_updated,
                    "library_chunks_scanned": chunks_scanned,
                    "library_chunks_updated": chunks_updated,
                },
            )

            print(
                "normalize_library_prompt_fields:"
                f" media_tasks scanned={media_scanned}, updated={media_updated};"
                f" library_items scanned={items_scanned}, updated={items_updated};"
                f" library_chunks scanned={chunks_scanned}, updated={chunks_updated}"
            )
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """
    Rollback migration 011.

    Irreversible data migration: no-op.
    """
    logger.warning("normalize_library_prompt_fields_downgrade_noop")


if __name__ == "__main__":
    asyncio.run(upgrade())
