"""Tests for LibraryChunk model additions for parent-child chunk support."""

import pytest

from app.models.library import LibraryChunk


@pytest.mark.unit
class TestLibraryChunkParentChild:
    """Tests for is_parent and parent_chunk_id columns."""

    def test_is_parent_default_false(self):
        """LibraryChunk model has is_parent field with default False."""
        col = LibraryChunk.__table__.columns["is_parent"]
        assert col.default.arg is False
        assert col.nullable is False

    def test_parent_chunk_id_nullable(self):
        """LibraryChunk model has parent_chunk_id field (nullable)."""
        col = LibraryChunk.__table__.columns["parent_chunk_id"]
        assert col.nullable is True
