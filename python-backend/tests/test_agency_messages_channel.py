"""
Tests for the new channel columns on agency_messages.

Validates:
- source_channel column is nullable and accepts string values
- source_connection_id column is nullable
- external_source_id column is nullable
- Existing AgencyMessage queries and to_dict() still work with new columns
"""

import pytest
from datetime import datetime, timezone

from app.models.agency import AgencyMessage


class TestAgencyMessageChannelColumns:
    """Test new Chat Bridge columns on AgencyMessage model."""

    def test_source_channel_column_exists(self):
        """source_channel column is defined on the model."""
        assert hasattr(AgencyMessage, "source_channel")
        col = AgencyMessage.__table__.columns["source_channel"]
        assert col.nullable is True

    def test_source_connection_id_column_exists(self):
        """source_connection_id column is defined on the model."""
        assert hasattr(AgencyMessage, "source_connection_id")
        col = AgencyMessage.__table__.columns["source_connection_id"]
        assert col.nullable is True

    def test_external_source_id_column_exists(self):
        """external_source_id column is defined on the model."""
        assert hasattr(AgencyMessage, "external_source_id")
        col = AgencyMessage.__table__.columns["external_source_id"]
        assert col.nullable is True

    def test_to_dict_includes_new_fields_when_set(self):
        """to_dict() includes channel fields when they have values."""
        msg = AgencyMessage(
            id=1,
            conversation_id="conv-123",
            role="user",
            content="hello",
            source_channel="telegram",
            source_connection_id="conn-456",
            external_source_id="tg-msg-789",
            pii_redacted=False,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        d = msg.to_dict()
        assert d["sourceChannel"] == "telegram"
        assert d["sourceConnectionId"] == "conn-456"
        assert d["externalSourceId"] == "tg-msg-789"

    def test_to_dict_returns_none_for_new_fields_when_unset(self):
        """to_dict() returns None for channel fields when not set."""
        msg = AgencyMessage(
            id=2,
            conversation_id="conv-456",
            role="assistant",
            content="hi",
            pii_redacted=False,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        d = msg.to_dict()
        assert d["sourceChannel"] is None
        assert d["sourceConnectionId"] is None
        assert d["externalSourceId"] is None

    def test_existing_to_dict_fields_unchanged(self):
        """Existing to_dict() output is not affected by new columns."""
        msg = AgencyMessage(
            id=3,
            conversation_id="conv-789",
            agent_name="TestAgent",
            role="assistant",
            content="test content",
            input_tokens=100,
            output_tokens=50,
            pii_redacted=True,
            created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        d = msg.to_dict()
        assert d["id"] == 3
        assert d["conversationId"] == "conv-789"
        assert d["agentName"] == "TestAgent"
        assert d["role"] == "assistant"
        assert d["content"] == "test content"
        assert d["inputTokens"] == 100
        assert d["outputTokens"] == 50
        assert d["piiRedacted"] is True
        assert d["createdAt"] == "2026-02-01T00:00:00+00:00"
