"""
Migration 010: normalize markdown-fenced prompts in media_tasks.

Backfills existing rows where prompt content was stored as markdown code fences
(for example ```json ... ```), converting them to plain text / plain JSON.
"""

from __future__ import annotations

import asyncio
import logging
import re

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


def normalize_media_prompt(prompt: str | None) -> str:
    """Normalize prompt text by unwrapping markdown fenced blocks."""
    if prompt is None:
        return ""

    normalized = str(prompt).replace("\r\n", "\n").strip()
    # Unwrap up to 2 layers to handle nested wrapping from chained model output.
    for _ in range(2):
        match = MARKDOWN_FENCED_BLOCK_PATTERN.match(normalized)
        if not match:
            break
        normalized = (match.group(1) or "").strip()

    # If fenced blocks were embedded with extra text, unwrap each block in-place.
    normalized = MARKDOWN_FENCED_BLOCK_GLOBAL_PATTERN.sub(
        lambda match: (match.group(1) or "").strip(),
        normalized,
    )
    # Remove leftover fence-only lines from malformed outputs.
    normalized = MARKDOWN_FENCE_LINE_PATTERN.sub("", normalized).strip()

    # Handle malformed outputs like "json\\n{...}" after fence removal.
    json_label_match = LEADING_JSON_LABEL_PATTERN.match(normalized)
    if json_label_match:
        candidate = (json_label_match.group(1) or "").strip()
        if candidate.startswith("{") or candidate.startswith("["):
            normalized = candidate

    return normalized


async def upgrade() -> None:
    """Apply migration 010."""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    scanned = 0
    updated = 0

    try:
        async with async_session() as session:
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
            rows = result.mappings().all()

            for row in rows:
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

            await session.commit()
            logger.info(
                "normalize_media_task_prompts_migration_upgraded",
                extra={"scanned": scanned, "updated": updated},
            )
            print(f"normalize_media_task_prompts: scanned={scanned}, updated={updated}")
    finally:
        await engine.dispose()


async def downgrade() -> None:
    """
    Rollback migration 010.

    Irreversible data migration: no-op.
    """
    logger.warning("normalize_media_task_prompts_migration_downgrade_noop")


if __name__ == "__main__":
    asyncio.run(upgrade())
