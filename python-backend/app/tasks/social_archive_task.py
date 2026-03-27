"""Celery task for archiving resolved social conversations into RAG storage."""

from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
import structlog
from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_db_context
from app.core.vectordb import VectorCollection
from app.services.embedding_service import get_embedding_service

logger = structlog.get_logger(__name__)

INTERNAL_BACKEND_URL = os.getenv("PYTHON_BACKEND_INTERNAL_URL", "http://127.0.0.1:8000").rstrip("/")
INTERNAL_TOKEN = (
    getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")
).strip()

ARCHIVE_QUEUE = "social"
ARCHIVE_LIMIT = 50
ARCHIVE_COOLDOWN = timedelta(hours=1)
MAX_CHUNK_TOKENS = 1000
TRUNCATE_HEAD_TOKENS = 200
TRUNCATE_TAIL_TOKENS = 200

_TOKENIZER: Any | None = None


def _row_value(row: Any, key: str, index: int, default: Any = None) -> Any:
    if row is None:
        return default
    mapping = getattr(row, "_mapping", None)
    if mapping is not None and key in mapping:
        return mapping[key]
    if isinstance(row, dict):
        return row.get(key, default)
    try:
        return row[index]
    except Exception:
        return default


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _get_tokenizer():
    global _TOKENIZER
    if _TOKENIZER is not None:
        return _TOKENIZER

    try:
        import tiktoken

        _TOKENIZER = tiktoken.get_encoding("cl100k_base")
    except Exception:
        _TOKENIZER = False
    return _TOKENIZER


def _tokenize_text(text_value: str) -> list[str]:
    tokenizer = _get_tokenizer()
    if tokenizer and tokenizer is not False:
        return list(tokenizer.encode(text_value))
    return re.findall(r"\S+", text_value)


def _detokenize_text(tokens: list[Any]) -> str:
    tokenizer = _get_tokenizer()
    if tokenizer and tokenizer is not False:
        try:
            return tokenizer.decode(tokens)
        except Exception:
            pass
    return " ".join(str(token) for token in tokens)


def _truncate_token_sequence(
    tokens: list[Any],
    *,
    max_tokens: int = MAX_CHUNK_TOKENS,
    head_tokens: int = TRUNCATE_HEAD_TOKENS,
    tail_tokens: int = TRUNCATE_TAIL_TOKENS,
) -> tuple[list[Any], bool]:
    if len(tokens) <= max_tokens:
        return tokens, False
    kept = tokens[:head_tokens] + tokens[-tail_tokens:]
    return kept, True


def _truncate_text(text_value: str) -> tuple[str, int, bool]:
    tokens = _tokenize_text(text_value)
    truncated_tokens, was_truncated = _truncate_token_sequence(tokens)
    if not was_truncated:
        return text_value, len(tokens), False
    return (
        f"{_detokenize_text(truncated_tokens[:TRUNCATE_HEAD_TOKENS])}\n[...truncated...]\n"
        f"{_detokenize_text(truncated_tokens[-TRUNCATE_TAIL_TOKENS:])}",
        len(tokens),
        True,
    )


def _normalize_direction(message: dict[str, Any]) -> str | None:
    direction = str(message.get("direction") or message.get("messageDirection") or "").strip().lower()
    sender_type = str(message.get("senderType") or message.get("sender_type") or "").strip().lower()

    if direction in {"inbound", "incoming", "received", "customer", "user"}:
        return "inbound"
    if direction in {"outbound", "outgoing", "sent", "agent", "assistant"}:
        return "outbound"

    if sender_type in {"customer", "visitor", "user"}:
        return "inbound"
    if sender_type in {"agent", "assistant", "system"}:
        return "outbound"
    return None


def _message_body(message: dict[str, Any]) -> str:
    body = message.get("body")
    if isinstance(body, str) and body.strip():
        return body.strip()

    payload = message.get("payload")
    if isinstance(payload, dict):
        for key in ("text", "message", "body", "content"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        attachments = payload.get("attachments")
        if attachments:
            return json.dumps(attachments, ensure_ascii=False)
        if payload:
            return json.dumps(payload, ensure_ascii=False)

    return ""


def _message_timestamp(message: dict[str, Any]) -> datetime:
    for key in ("createdAt", "receivedAt", "sentAt", "created_at", "received_at", "sent_at"):
        value = message.get(key)
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _chunk_text(messages: list[dict[str, Any]]) -> str:
    return "\n".join(part for part in (_message_body(message) for message in messages) if part.strip())


def _build_chunk_record(
    question_messages: list[dict[str, Any]],
    answer_messages: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not question_messages or not answer_messages:
        return None

    question = _chunk_text(question_messages)
    answer = _chunk_text(answer_messages)
    if not question or not answer:
        return None

    first_timestamp = _message_timestamp(question_messages[0])
    document = f"Question:\n{question}\n\nAnswer:\n{answer}"
    truncated_document, token_count, truncated = _truncate_text(document)

    return {
        "question": question,
        "answer": answer,
        "document": truncated_document,
        "timestamp": first_timestamp.isoformat(),
        "token_count": token_count,
        "truncated": truncated,
    }


def chunk_conversation_to_qa_pairs(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Split ordered messages into question-answer pairs."""
    pairs: list[dict[str, Any]] = []
    question_messages: list[dict[str, Any]] = []
    answer_messages: list[dict[str, Any]] = []

    for message in messages:
        body = _message_body(message)
        if not body.strip():
            continue

        direction = _normalize_direction(message)
        if direction is None:
            continue

        if direction == "inbound":
            if answer_messages:
                pair = _build_chunk_record(question_messages, answer_messages)
                if pair is not None:
                    pairs.append(pair)
                question_messages = [message]
                answer_messages = []
            else:
                question_messages.append(message)
            continue

        if direction == "outbound":
            if not question_messages:
                continue
            answer_messages.append(message)

    if question_messages and answer_messages:
        pair = _build_chunk_record(question_messages, answer_messages)
        if pair is not None:
            pairs.append(pair)

    return pairs


def _detect_intent(question: str, answer: str) -> str:
    text_value = f"{question} {answer}".lower()
    rules = (
        ("billing", ("bill", "invoice", "payment", "charge", "refund", "pricing")),
        ("order_status", ("order", "shipping", "shipment", "delivery", "arrive", "tracking")),
        ("account", ("account", "login", "password", "access", "verify", "email")),
        ("technical_support", ("error", "bug", "issue", "broken", "fail", "problem", "not working", "crash")),
        ("complaint", ("complaint", "angry", "bad service", "frustrat", "refund", "cancel")),
        ("sales", ("buy", "purchase", "plan", "upgrade", "demo", "trial")),
        ("scheduling", ("schedule", "book", "resched", "meeting", "appointment")),
    )
    for intent, keywords in rules:
        if any(keyword in text_value for keyword in keywords):
            return intent
    return "general_support"


def _build_archive_collection(tenant_id: str) -> VectorCollection:
    return VectorCollection(name=f"social-conversations-{tenant_id}")


async def _embed_texts_via_internal_endpoint(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    if INTERNAL_TOKEN and INTERNAL_BACKEND_URL:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{INTERNAL_BACKEND_URL}/api/internal/embeddings/batch",
                    json={
                        "texts": texts,
                        "collection": "social-conversations",
                    },
                    headers={"x-internal-token": INTERNAL_TOKEN},
                )
                response.raise_for_status()
                payload = response.json()
                embeddings = payload.get("embeddings")
                if isinstance(embeddings, list) and len(embeddings) == len(texts):
                    return embeddings
                raise RuntimeError("Embedding endpoint returned unexpected payload")
        except Exception as exc:
            logger.warning("social_archive_internal_embedding_failed", error=str(exc))

    embedder = get_embedding_service()
    return await asyncio.to_thread(embedder.embed_batch, texts)


async def _load_resolved_conversations(db) -> list[Any]:
    result = await db.execute(
        text(
            """
            SELECT id, "tenantId", "pageId", "customerDisplayName", status, "updatedAt"
            FROM social_conversations
            WHERE status = 'resolved'
              AND "updatedAt" < :threshold
            ORDER BY "updatedAt" ASC, id ASC
            LIMIT :limit
            """
        ),
        {"threshold": datetime.now(timezone.utc) - ARCHIVE_COOLDOWN, "limit": ARCHIVE_LIMIT},
    )
    return list(result.fetchall())


async def _load_conversation_messages(db, conversation_id: int) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """
            SELECT id, "tenantId", "conversationId", "pageId", "direction", "senderType",
                   "body", "payload", "createdAt", "receivedAt", "sentAt"
            FROM social_messages
            WHERE "conversationId" = :conversation_id
            ORDER BY "createdAt" ASC, id ASC
            """
        ),
        {"conversation_id": conversation_id},
    )
    rows = result.fetchall()
    messages: list[dict[str, Any]] = []
    for row in rows:
        payload = _row_value(row, "payload", 7) or {}
        if not isinstance(payload, dict):
            payload = {}
        messages.append(
            {
                "id": _row_value(row, "id", 0),
                "tenantId": _row_value(row, "tenantId", 1),
                "conversationId": _row_value(row, "conversationId", 2),
                "pageId": _row_value(row, "pageId", 3),
                "direction": _row_value(row, "direction", 4),
                "senderType": _row_value(row, "senderType", 5),
                "body": _row_value(row, "body", 6) or "",
                "payload": payload,
                "createdAt": _row_value(row, "createdAt", 8),
                "receivedAt": _row_value(row, "receivedAt", 9),
                "sentAt": _row_value(row, "sentAt", 10),
            }
        )
    return messages


async def _archive_single_conversation(db, conversation_row: Any) -> str:
    conversation_id = int(_row_value(conversation_row, "id", 0))
    tenant_id = str(_row_value(conversation_row, "tenantId", 1))
    page_id = int(_row_value(conversation_row, "pageId", 2))
    customer_display_name = _row_value(conversation_row, "customerDisplayName", 3) or ""

    messages = await _load_conversation_messages(db, conversation_id)
    if len(messages) < 2:
        logger.info("social_archive_skipped_too_few_messages", conversation_id=conversation_id, message_count=len(messages))
        return "skipped"

    chunks = chunk_conversation_to_qa_pairs(messages)
    if not chunks:
        logger.info("social_archive_skipped_no_qa_pairs", conversation_id=conversation_id)
        return "skipped"

    documents: list[str] = []
    metadatas: list[dict[str, Any]] = []
    ids: list[str] = []

    for index, chunk in enumerate(chunks):
        document = chunk["document"]
        documents.append(document)
        metadatas.append(
            {
                "pageId": page_id,
                "conversationId": conversation_id,
                "customerDisplayName": customer_display_name,
                "timestamp": chunk["timestamp"],
                "intent": _detect_intent(chunk["question"], chunk["answer"]),
                "tokenCount": chunk["token_count"],
                "truncated": chunk["truncated"],
                "chunkIndex": index,
            }
        )
        ids.append(f"social:{conversation_id}:{index}")

    embeddings = await _embed_texts_via_internal_endpoint(documents)
    if len(embeddings) != len(documents):
        raise RuntimeError("Embedding batch size mismatch")

    collection = _build_archive_collection(tenant_id)
    try:
        collection.delete(ids=ids)
    except Exception:
        logger.debug("social_archive_predelete_failed", conversation_id=conversation_id)

    collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)

    await db.execute(
        text(
            """
            UPDATE social_conversations
            SET status = 'archived',
                "updatedAt" = NOW()
            WHERE id = :conversation_id
            """
        ),
        {"conversation_id": conversation_id},
    )
    await db.commit()

    logger.info(
        "social_archive_conversation_archived",
        conversation_id=conversation_id,
        tenant_id=tenant_id,
        chunk_count=len(chunks),
    )
    return "processed"


async def archive_resolved_conversations_async() -> dict[str, int]:
    processed = 0
    skipped = 0
    errors = 0

    async with get_db_context() as db:
        conversations = await _load_resolved_conversations(db)

        for conversation_row in conversations:
            try:
                result = await _archive_single_conversation(db, conversation_row)
                if result == "processed":
                    processed += 1
                else:
                    skipped += 1
            except Exception as exc:
                errors += 1
                await db.rollback()
                logger.error(
                    "social_archive_conversation_failed",
                    conversation_id=_row_value(conversation_row, "id", 0),
                    error=str(exc),
                )

    return {"processed": processed, "skipped": skipped, "errors": errors}


@celery_app.task(
    name="app.tasks.social_archive_task.archive_resolved_conversations",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    acks_late=True,
    reject_on_worker_lost=True,
)
def archive_resolved_conversations(self) -> dict[str, int]:
    """Archive resolved social conversations into a tenant-scoped vector collection."""
    return _run_async(archive_resolved_conversations_async())

