"""Tests for agency persistence hooks."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _make_mock_session_factory():
    """Create a mock async session factory for testing."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_session.execute = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_factory = MagicMock()
    mock_factory.return_value = mock_session
    return mock_factory, mock_session


class TestPersistenceHooks:
    """Tests for create_persistence_hooks()."""

    async def test_save_callback_writes_messages(self):
        """Save callback writes messages to agency_messages table."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()
        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-1",
            db_session_factory=factory,
        )

        messages = [
            {"role": "user", "content": "Hello agent"},
            {"role": "assistant", "content": "Hi there!", "agent_name": "Agent1"},
        ]

        await save_cb(messages)

        # Should have executed insert statements
        assert mock_session.execute.call_count >= 1
        mock_session.commit.assert_called_once()

    async def test_save_callback_applies_pii_redaction(self):
        """Save callback applies PII redaction to agent-to-agent messages."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()
        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-1",
            db_session_factory=factory,
        )

        messages = [
            {
                "role": "assistant",
                "content": "The email is user@example.com",
                "agent_name": "InternalAgent",
            },
        ]

        with patch("app.services.agency_persistence.redact_pii") as mock_redact:
            mock_redact.return_value = ("The email is [EMAIL]", True)
            await save_cb(messages)
            mock_redact.assert_called_once_with("The email is user@example.com")

    async def test_save_callback_no_redact_user_facing(self):
        """Save callback does NOT redact user messages."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()
        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-1",
            db_session_factory=factory,
        )

        messages = [
            {"role": "user", "content": "My email is user@example.com"},
        ]

        with patch("app.services.agency_persistence.redact_pii") as mock_redact:
            await save_cb(messages)
            # User messages should NOT be redacted
            mock_redact.assert_not_called()

    async def test_load_callback_returns_messages(self):
        """Load callback returns messages from database."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()

        # Mock query result
        mock_row1 = MagicMock()
        mock_row1.role = "user"
        mock_row1.content = "Hello"
        mock_row1.agent_name = None
        mock_row1.tool_calls = None

        mock_row2 = MagicMock()
        mock_row2.role = "assistant"
        mock_row2.content = "Hi there!"
        mock_row2.agent_name = "Agent1"
        mock_row2.tool_calls = None

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row1, mock_row2]
        mock_session.execute = AsyncMock(return_value=mock_result)

        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-1",
            db_session_factory=factory,
        )

        messages = await load_cb()

        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Hello"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "Hi there!"

    async def test_load_callback_empty_for_new_conversation(self):
        """Load callback returns empty list for new conversation."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-new",
            db_session_factory=factory,
        )

        messages = await load_cb()
        assert messages == []

    async def test_save_empty_messages_is_noop(self):
        """Save callback with empty list does not hit the database."""
        from app.services.agency_persistence import create_persistence_hooks

        factory, mock_session = _make_mock_session_factory()
        load_cb, save_cb = create_persistence_hooks(
            conversation_id="conv-1",
            db_session_factory=factory,
        )

        await save_cb([])
        mock_session.execute.assert_not_called()
