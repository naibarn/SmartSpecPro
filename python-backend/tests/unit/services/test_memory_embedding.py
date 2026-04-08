"""Unit tests for MemoryEmbeddingService — SQL safety and embedding behaviour.

Covers:
- F03: memory_embedding uses text() wrapper for SQL, not a bare string
- embed_memory returns False on empty embedding vector
- embed_memory returns False on database error (does not propagate)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

# ---------------------------------------------------------------------------
# F03 — memory_embedding uses text() for SQL, not a bare string
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestMemoryEmbeddingSQL:
    def test_sql_uses_text_wrapper(self):
        """The SQL in embed_memory must be wrapped with sqlalchemy.text()."""
        import inspect

        import app.services.memory_embedding as mod

        src = inspect.getsource(mod.MemoryEmbeddingService.embed_memory)
        # Must import and call text()
        assert "text(" in src, "embed_memory must wrap SQL with text()"
        # Must not contain a bare string passed directly to execute
        assert 'execute(\n                    "UPDATE' not in src, (
            "Bare SQL string found — must use text() wrapper"
        )

    @pytest.mark.asyncio
    async def test_embed_memory_calls_text(self):
        """embed_memory calls session.execute with a text() object."""
        from unittest.mock import AsyncMock, patch

        from sqlalchemy import TextClause

        from app.services.memory_embedding import MemoryEmbeddingService

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        captured_args = []

        async def fake_execute(stmt, params):
            captured_args.append(stmt)

        mock_session.execute = fake_execute

        svc = MemoryEmbeddingService()
        svc.embedding_client = AsyncMock()
        svc.embedding_client.embed = AsyncMock(return_value=[0.1, 0.2, 0.3])

        with patch("app.core.database.get_session", return_value=mock_session, create=True):
            await svc.embed_memory("mem-1", "some content", "title")

        assert len(captured_args) == 1
        assert isinstance(captured_args[0], TextClause), (
            f"Expected TextClause, got {type(captured_args[0])}"
        )

    @pytest.mark.asyncio
    async def test_embed_memory_returns_false_on_empty_embedding(self):
        from app.services.memory_embedding import MemoryEmbeddingService

        svc = MemoryEmbeddingService()
        svc.embedding_client = AsyncMock()
        svc.embedding_client.embed = AsyncMock(return_value=[])

        result = await svc.embed_memory("mem-1", "content")
        assert result is False

    @pytest.mark.asyncio
    async def test_embed_memory_returns_false_on_db_error(self):
        from unittest.mock import patch

        from app.services.memory_embedding import MemoryEmbeddingService

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.execute = AsyncMock(side_effect=Exception("db error"))

        svc = MemoryEmbeddingService()
        svc.embedding_client = AsyncMock()
        svc.embedding_client.embed = AsyncMock(return_value=[0.1, 0.2])

        with patch("app.core.database.get_session", return_value=mock_session, create=True):
            result = await svc.embed_memory("mem-1", "content")
        assert result is False

    @pytest.mark.asyncio
    async def test_generate_embedding_keeps_existing_default_model(self):
        from app.services.memory_embedding import MemoryEmbeddingService

        mock_embedding_service = AsyncMock()
        mock_embedding_service.embed = AsyncMock(return_value=[0.1, 0.2, 0.3])

        with patch("app.services.embedding_service.EmbeddingService", return_value=mock_embedding_service):
            svc = MemoryEmbeddingService()
            result = await svc.generate_embedding("content")

        assert result == [0.1, 0.2, 0.3]
        mock_embedding_service.embed.assert_awaited_once_with(
            text="content",
            model="text-embedding-3-small",
        )
