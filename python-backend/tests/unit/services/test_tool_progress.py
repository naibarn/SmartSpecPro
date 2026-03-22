"""Tests for emit_progress support in tool bridge run functions."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.agency_tools import (
    ToolConfig,
    _make_run_func,
    create_tool_bridge,
)


class FakeEmitter:
    """Fake AgencyEventEmitter that records emitted events."""

    def __init__(self):
        self.events: list[tuple[str, dict]] = []
        self.run_id = "run-123"

    async def emit(self, event_type: str, data: dict) -> None:
        self.events.append((event_type, data))


@pytest.mark.unit
class TestToolProgressEmit:
    """Tests for emit_progress in _make_run_func."""

    def test_emit_progress_publishes_tool_progress_event(self):
        """emit_progress publishes tool_progress SSE event via emitter."""
        emitter = FakeEmitter()
        config = ToolConfig(
            tool_id="builtin-web-search",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
        )
        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=emitter, run_id="run-123")

        # The run_func should expose emit_progress
        assert hasattr(run_func, "emit_progress"), "run_func should have emit_progress attached"

        # Call emit_progress
        import asyncio
        asyncio.run(run_func.emit_progress("Searching...", percent=25))

        assert len(emitter.events) == 1
        event_type, data = emitter.events[0]
        assert event_type == "tool_progress"
        assert data["toolCallId"] == "builtin-web-search"
        assert data["message"] == "Searching..."
        assert data["percent"] == 25

    def test_emit_progress_without_percent_omits_percent_field(self):
        """emit_progress with no percent omits percent field."""
        emitter = FakeEmitter()
        config = ToolConfig(
            tool_id="builtin-rag-knowledge",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://127.0.0.1:3000/api/internal/tools/rag-knowledge",
        )
        run_func = _make_run_func(config, {"builtin-rag-knowledge"}, emitter=emitter, run_id="run-123")

        import asyncio
        asyncio.run(run_func.emit_progress("Working..."))

        assert len(emitter.events) == 1
        event_type, data = emitter.events[0]
        assert event_type == "tool_progress"
        assert data["message"] == "Working..."
        assert "percent" not in data

    def test_emit_progress_noop_when_emitter_is_none(self):
        """emit_progress is no-op when emitter is None."""
        config = ToolConfig(
            tool_id="builtin-web-search",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
        )
        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=None, run_id=None)

        # Should not raise
        import asyncio
        asyncio.run(run_func.emit_progress("test"))
        # No assertion needed — just verifying no exception

    def test_builtin_web_search_emits_progress_during_execution(self):
        """builtin-web-search emits progress during execution."""
        emitter = FakeEmitter()
        config = ToolConfig(
            tool_id="builtin-web-search",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://127.0.0.1:3000/api/internal/tools/web-search",
        )
        run_func = _make_run_func(config, {"builtin-web-search"}, emitter=emitter, run_id="run-123")

        # Mock HTTP call
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '{"results": [{"title": "Test"}]}'

        with patch("app.services.agency_tools.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            tool_instance = MagicMock()
            tool_instance.query = "test query"
            result = run_func(tool_instance)

        # Check at least one progress event was emitted with "Searching"
        progress_events = [(t, d) for t, d in emitter.events if t == "tool_progress"]
        assert len(progress_events) >= 1
        assert any("Searching" in d["message"] for _, d in progress_events)

    def test_builtin_rag_knowledge_emits_progress_during_execution(self):
        """builtin-rag-knowledge emits progress during execution."""
        emitter = FakeEmitter()
        config = ToolConfig(
            tool_id="builtin-rag-knowledge",
            tool_type="builtin",
            risk_level="low",
            requires_approval=False,
            endpoint_url="http://127.0.0.1:3000/api/internal/tools/rag-knowledge",
        )
        run_func = _make_run_func(config, {"builtin-rag-knowledge"}, emitter=emitter, run_id="run-123")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = '{"documents": []}'

        with patch("app.services.agency_tools.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            tool_instance = MagicMock()
            tool_instance.query = "test query"
            result = run_func(tool_instance)

        progress_events = [(t, d) for t, d in emitter.events if t == "tool_progress"]
        assert len(progress_events) >= 1
        assert any("Querying" in d["message"] for _, d in progress_events)
