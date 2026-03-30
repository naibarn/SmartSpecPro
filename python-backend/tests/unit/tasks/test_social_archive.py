from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.tasks import social_archive_task


def _result(rows=None):
    result = MagicMock()
    result.fetchall.return_value = rows or []
    return result


class _FakeContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeCollection:
    def __init__(self):
        self.add_calls = []
        self.delete_calls = []

    def delete(self, ids=None, where=None):
        self.delete_calls.append({"ids": ids, "where": where})

    def add(self, ids=None, documents=None, embeddings=None, metadatas=None):
        self.add_calls.append(
            {
                "ids": ids,
                "documents": documents,
                "embeddings": embeddings,
                "metadatas": metadatas,
            }
        )


def test_chunk_conversation_to_qa_pairs_groups_turns_and_multimessage_question():
    now = datetime(2026, 3, 24, 9, 0, tzinfo=timezone.utc)
    pairs = social_archive_task.chunk_conversation_to_qa_pairs(
        [
            {"direction": "inbound", "body": "Hi", "createdAt": now},
            {"direction": "inbound", "body": "My order has not arrived", "createdAt": now + timedelta(minutes=1)},
            {"direction": "outbound", "body": "I am checking now", "createdAt": now + timedelta(minutes=2)},
            {"direction": "outbound", "body": "It ships tomorrow", "createdAt": now + timedelta(minutes=3)},
            {"direction": "inbound", "body": "Thanks", "createdAt": now + timedelta(minutes=4)},
            {"direction": "outbound", "body": "You're welcome", "createdAt": now + timedelta(minutes=5)},
        ]
    )

    assert len(pairs) == 2
    assert pairs[0]["question"] == "Hi\nMy order has not arrived"
    assert pairs[0]["answer"] == "I am checking now\nIt ships tomorrow"
    assert pairs[0]["timestamp"] == now.isoformat()
    assert pairs[1]["question"] == "Thanks"
    assert pairs[1]["answer"] == "You're welcome"


def test_truncate_token_sequence_keeps_first_and_last_tokens():
    tokens = list(range(1200))
    truncated, was_truncated = social_archive_task._truncate_token_sequence(tokens)

    assert was_truncated is True
    assert len(truncated) == 400
    assert truncated[:3] == [0, 1, 2]
    assert truncated[-3:] == [1197, 1198, 1199]


@pytest.mark.asyncio
async def test_archive_resolved_conversations_processes_and_archives_conversations(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)
    resolved_rows = [
        (101, "tenant-1", 7, "Ada Lovelace", "resolved", now - timedelta(hours=2)),
        (102, "tenant-1", 7, "Grace Hopper", "resolved", now - timedelta(hours=2, minutes=5)),
    ]
    messages_1 = [
        (1, "tenant-1", 101, 7, "inbound", "customer", "Where is my order?", {}, now - timedelta(hours=2), None, None),
        (2, "tenant-1", 101, 7, "inbound", "customer", "Order #12345", {}, now - timedelta(hours=2, minutes=59), None, None),
        (3, "tenant-1", 101, 7, "outbound", "agent", "I am checking now.", {}, now - timedelta(hours=2, minutes=58), None, None),
        (4, "tenant-1", 101, 7, "outbound", "agent", "It should arrive tomorrow.", {}, now - timedelta(hours=2, minutes=57), None, None),
    ]
    messages_2 = [
        (5, "tenant-1", 102, 7, "inbound", "customer", "Hello?", {}, now - timedelta(hours=2, minutes=10), None, None),
    ]

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _result(resolved_rows),
            _result(messages_1),
            _result(),
            _result(messages_2),
        ]
    )
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    fake_collection = _FakeCollection()
    embedding_helper = AsyncMock(return_value=[[0.1, 0.2, 0.3]])

    monkeypatch.setattr(social_archive_task, "get_db_context", lambda: _FakeContext(db))
    monkeypatch.setattr(social_archive_task, "_build_archive_collection", lambda tenant_id: fake_collection)
    monkeypatch.setattr(social_archive_task, "_embed_texts_via_internal_endpoint", embedding_helper)

    result = await social_archive_task.archive_resolved_conversations_async()

    assert result == {"processed": 1, "skipped": 1, "errors": 0}
    embedding_helper.assert_awaited_once()
    assert len(fake_collection.add_calls) == 1
    add_call = fake_collection.add_calls[0]
    assert add_call["ids"] == ["social:101:0"]
    assert "Question:\nWhere is my order?\nOrder #12345" in add_call["documents"][0]
    assert "Answer:\nI am checking now.\nIt should arrive tomorrow." in add_call["documents"][0]
    assert add_call["metadatas"][0]["pageId"] == 7
    assert add_call["metadatas"][0]["conversationId"] == 101
    assert add_call["metadatas"][0]["customerDisplayName"] == "Ada Lovelace"
    assert add_call["metadatas"][0]["intent"] == "order_status"
    assert add_call["metadatas"][0]["truncated"] is False
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_archive_resolved_conversations_skips_conversations_with_fewer_than_two_messages(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)
    resolved_rows = [
        (201, "tenant-2", 8, "Morgan", "resolved", now - timedelta(hours=2)),
    ]
    messages = [
        (11, "tenant-2", 201, 8, "inbound", "customer", "Help", {}, now - timedelta(hours=2), None, None),
    ]

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_result(resolved_rows), _result(messages)])
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    fake_collection = _FakeCollection()
    embedding_helper = AsyncMock()

    monkeypatch.setattr(social_archive_task, "get_db_context", lambda: _FakeContext(db))
    monkeypatch.setattr(social_archive_task, "_build_archive_collection", lambda tenant_id: fake_collection)
    monkeypatch.setattr(social_archive_task, "_embed_texts_via_internal_endpoint", embedding_helper)

    result = await social_archive_task.archive_resolved_conversations_async()

    assert result == {"processed": 0, "skipped": 1, "errors": 0}
    embedding_helper.assert_not_awaited()
    assert fake_collection.add_calls == []
    db.commit.assert_not_awaited()
    db.rollback.assert_not_awaited()
