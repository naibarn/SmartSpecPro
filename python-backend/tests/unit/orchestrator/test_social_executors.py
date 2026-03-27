from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.social.approval_gate_executor import SocialApprovalGateExecutor
from app.orchestrator.node_executors.social.classify_intent_executor import ClassifyIntentExecutor
from app.orchestrator.node_executors.social.draft_reply_executor import DraftReplyExecutor
from app.orchestrator.node_executors.social.meta_message_trigger import MetaMessageTriggerExecutor
from app.orchestrator.node_executors.social.publish_post_executor import PublishPostExecutor
from app.orchestrator.node_executors.social.send_reply_executor import SendReplyExecutor
from app.orchestrator.workflow_compiler import TRIGGER_NODE_TYPES


def _data(
    *,
    node_type: str,
    config: dict | None = None,
    inputs: dict | None = None,
) -> NodeExecutionData:
    return NodeExecutionData(
        node_id="node-1",
        node_type=node_type,
        config=config or {},
        inputs=inputs or {},
        state={},
    )


def _context(*, tenant_id: str = "tenant-1", user_id: int = 7, extra_data: dict | None = None) -> ExecutionContext:
    return ExecutionContext(
        user_id=user_id,
        tenant_id=tenant_id,
        workflow_id="workflow-1",
        execution_id="execution-1",
        extra_data=extra_data or {},
    )


class _AsyncContext:
    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _result(row=None):
    result = MagicMock()
    result.fetchone.return_value = row
    return result


def test_social_trigger_node_is_registered_as_trigger() -> None:
    assert "incoming_meta_message" in TRIGGER_NODE_TYPES


@pytest.mark.asyncio
async def test_meta_message_trigger_executor_outputs_message_fields() -> None:
    executor = MetaMessageTriggerExecutor()
    data = _data(
        node_type="incoming_meta_message",
        config={"pageId": "7", "triggerMode": "batch", "filterKeywords": "urgent,refund"},
    )
    context = _context(
        extra_data={
            "social_message": {
                "id": 42,
                "conversation_id": 99,
                "body": "This is urgent, please help",
                "sender_name": "Ada",
                "sender_external_id": "psid-1",
            }
        }
    )

    result = await executor.execute(data, context)

    assert result["conversationId"] == 99
    assert result["messageBody"] == "This is urgent, please help"
    assert result["senderName"] == "Ada"
    assert result["senderExternalId"] == "psid-1"


@pytest.mark.asyncio
async def test_meta_message_trigger_executor_filters_keywords() -> None:
    executor = MetaMessageTriggerExecutor()
    data = _data(
        node_type="incoming_meta_message",
        config={"pageId": "7", "filterKeywords": "urgent"},
    )
    context = _context(
        extra_data={
            "social_message": {
                "id": 42,
                "conversation_id": 99,
                "body": "Just saying hello",
                "sender_name": "Ada",
                "sender_external_id": "psid-1",
            }
        }
    )

    with pytest.raises(ValueError, match="filtered out"):
        await executor.execute(data, context)


@pytest.mark.asyncio
async def test_classify_intent_executor_parses_response_and_marks_high_risk(monkeypatch) -> None:
    fake_client = SimpleNamespace(
        initialize=AsyncMock(),
        chat=AsyncMock(return_value=SimpleNamespace(content='{"intent":"billing","confidence":0.87,"category":"billing"}')),
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.classify_intent_executor.get_unified_client",
        lambda: fake_client,
    )

    executor = ClassifyIntentExecutor()
    result = await executor.execute(
        _data(
            node_type="classify_social_intent",
            inputs={"messageBody": "I need a refund", "model": "openai/gpt-4o-mini"},
        ),
        _context(),
    )

    assert result["intent"] == "billing"
    assert result["confidence"] == 0.87
    assert result["category"] == "billing"
    assert result["requiresHuman"] is True


@pytest.mark.asyncio
async def test_classify_intent_executor_defaults_on_bad_payload(monkeypatch) -> None:
    fake_client = SimpleNamespace(
        initialize=AsyncMock(),
        chat=AsyncMock(return_value=SimpleNamespace(content="not-json")),
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.classify_intent_executor.get_unified_client",
        lambda: fake_client,
    )

    executor = ClassifyIntentExecutor()
    result = await executor.execute(
        _data(
            node_type="classify_social_intent",
            inputs={"messageBody": "Hello there"},
        ),
        _context(),
    )

    assert result["intent"] == "other"
    assert result["category"] == "other"
    assert result["requiresHuman"] is True


@pytest.mark.asyncio
async def test_draft_reply_executor_uses_tone_and_rag(monkeypatch) -> None:
    captured = {}

    class FakeClient:
        async def initialize(self):
            return None

        async def chat(self, **kwargs):
            captured["kwargs"] = kwargs
            return SimpleNamespace(content='{"reply":"Sure, we can help","confidence":0.91}')

    fake_client = FakeClient()
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.draft_reply_executor.get_unified_client",
        lambda: fake_client,
    )

    executor = DraftReplyExecutor()
    executor._query_rag_documents = AsyncMock(return_value=[{"content": "Use a warm tone", "score": 0.83}])

    result = await executor.execute(
        _data(
            node_type="draft_social_reply",
            inputs={
                "messageBody": "Can you help me?",
                "intent": "support",
                "ragCollectionId": "social-conversations-tenant-1",
                "toneGuide": "Friendly but concise",
                "model": "openai/gpt-4o-mini",
            },
        ),
        _context(),
    )

    assert result["draftReply"] == "Sure, we can help"
    assert result["confidence"] == 0.91
    assert result["sourceDocuments"] == [{"content": "Use a warm tone", "score": 0.83}]
    assert "Friendly but concise" in captured["kwargs"]["messages"][0]["content"]
    executor._query_rag_documents.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_reply_executor_sends_and_persists(monkeypatch) -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((5, "tenant-1", "provider-page-1", "active", "encrypted-token", datetime.now(timezone.utc) + timedelta(days=1), "psid-77")),
        SimpleNamespace(),
        SimpleNamespace(),
    ])
    db.commit = AsyncMock()
    fake_ctx = _AsyncContext(db)
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.AsyncSessionLocal",
        lambda: fake_ctx,
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.decrypt_smartspecweb",
        lambda value: "plain-token",
    )

    class FakeClient:
        def __init__(self, token, page_id=None):
            self.token = token
            self.page_id = page_id
            self.calls = []

        async def send_message(self, recipient_id, text):
            self.calls.append((recipient_id, text))
            return {"id": "mid-1"}

    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.MetaGraphClient",
        FakeClient,
    )
    redis = SimpleNamespace(set=AsyncMock())
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.get_cache_redis",
        AsyncMock(return_value=redis),
    )

    executor = SendReplyExecutor()
    result = await executor.execute(
        _data(
            node_type="send_meta_reply",
            inputs={"pageId": 5, "conversationId": 11, "messageBody": "Thanks!"},
        ),
        _context(),
    )

    assert result == {"providerMessageId": "mid-1", "deliveryStatus": "sent", "error": None}
    db.execute.assert_awaited()
    redis.set.assert_awaited_once_with("social:unread:tenant-1:11", "0")


@pytest.mark.asyncio
async def test_send_reply_executor_returns_error_on_meta_api_failure(monkeypatch) -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((5, "tenant-1", "provider-page-1", "active", "encrypted-token", datetime.now(timezone.utc) + timedelta(days=1), "psid-77")),
    ])
    fake_ctx = _AsyncContext(db)
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.AsyncSessionLocal",
        lambda: fake_ctx,
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.decrypt_smartspecweb",
        lambda value: "plain-token",
    )

    class FakeClient:
        def __init__(self, token, page_id=None):
            pass

        async def send_message(self, recipient_id, text):
            from app.services.social.exceptions import MetaApiError

            raise MetaApiError("boom")

    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.send_reply_executor.MetaGraphClient",
        FakeClient,
    )

    executor = SendReplyExecutor()
    result = await executor.execute(
        _data(
            node_type="send_meta_reply",
            inputs={"pageId": 5, "conversationId": 11, "messageBody": "Thanks!"},
        ),
        _context(),
    )

    assert result["deliveryStatus"] == "failed"
    assert "boom" in result["error"]


@pytest.mark.asyncio
async def test_publish_post_executor_sends_and_records_schedule(monkeypatch) -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _result((5, "tenant-1", "provider-page-1", "active", "encrypted-token", datetime.now(timezone.utc) + timedelta(days=1))),
        _result((123,)),
    ])
    db.commit = AsyncMock()
    fake_ctx = _AsyncContext(db)
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.publish_post_executor.AsyncSessionLocal",
        lambda: fake_ctx,
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.publish_post_executor.decrypt_smartspecweb",
        lambda value: "plain-token",
    )

    class FakeClient:
        def __init__(self, token, page_id=None):
            self.token = token
            self.page_id = page_id
            self.calls = []

        async def create_post(self, message, link=None, scheduled_at=None):
            self.calls.append((message, link, scheduled_at))
            return {"id": "post-1"}

    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.publish_post_executor.MetaGraphClient",
        FakeClient,
    )

    executor = PublishPostExecutor()
    scheduled_at = "2026-01-01T00:00:00+00:00"
    result = await executor.execute(
        _data(
            node_type="publish_meta_post",
            inputs={
                "pageId": 5,
                "contentText": "New feature launch",
                "contentLink": "https://example.com",
                "scheduledAt": scheduled_at,
            },
        ),
        _context(),
    )

    assert result["postId"] == 123
    assert result["providerPostId"] == "post-1"
    assert result["status"] == "scheduled"


@pytest.mark.asyncio
async def test_social_approval_gate_executor_auto_approves() -> None:
    executor = SocialApprovalGateExecutor()
    result = await executor.execute(
        _data(
            node_type="approve_social_action",
            inputs={
                "actionType": "reply",
                "content": "Approved reply",
                "confidence": 0.99,
                "autoApproveThreshold": 0.95,
            },
        ),
        _context(),
    )

    assert result == {
        "approved": True,
        "content": "Approved reply",
        "reviewerNote": "Auto-approved by policy threshold",
    }


@pytest.mark.asyncio
async def test_social_approval_gate_executor_pauses_for_review(monkeypatch) -> None:
    executor = SocialApprovalGateExecutor()
    executor._create_social_approval = AsyncMock(return_value=77)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=SimpleNamespace())
    db.commit = AsyncMock()
    fake_ctx = _AsyncContext(db)
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.approval_gate_executor.AsyncSessionLocal",
        lambda: fake_ctx,
    )
    monkeypatch.setattr(
        "app.orchestrator.node_executors.social.approval_gate_executor.interrupt",
        lambda payload: {"approved": True, "content": "Edited reply", "comment": "Looks good", "approved_by": 9},
    )

    result = await executor.execute(
        _data(
            node_type="approve_social_action",
            inputs={
                "actionType": "reply",
                "content": "Original reply",
                "confidence": 0.4,
                "autoApproveThreshold": 0.95,
            },
        ),
        _context(),
    )

    assert result["approved"] is True
    assert result["content"] == "Edited reply"
    assert result["reviewerNote"] == "Looks good"
