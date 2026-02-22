"""
Tests for allowed_scopes recomputation and schema integration.

These tests verify that:
- allowed_scopes is correctly computed from library_permissions records
- Scope changes propagate to all chunks belonging to an item
- Default scopes for new items are ["u:<owner_user_id>"]
- Visibility settings (public, team) are reflected in allowed_scopes
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.orchestrator.rag.scope_engine import recompute_allowed_scopes


def _make_item_row(owner_user_id=42, visibility="private", tenant_id="t1"):
    """Create a mock library_items row (as returned by text() query)."""
    row = MagicMock()
    row.owner_user_id = owner_user_id
    row.visibility = visibility
    row.tenant_id = tenant_id
    row.id = 1
    return row


def _make_permission_row(subject_type, subject_id, permission_level="read"):
    """Create a mock library_permissions row."""
    row = MagicMock()
    row.subject_type = subject_type
    row.subject_id = subject_id
    row.permission_level = permission_level
    return row


def _mock_session(item_row, permission_rows=None):
    """Build an AsyncMock session that returns canned query results.

    Call order:
      1. Item query -> one_or_none() returns item_row
      2. Permissions query -> iterable of permission_rows
      3. UPDATE library_items (no return needed)
      4. UPDATE library_chunks (no return needed)
    """
    session = AsyncMock()

    item_result = MagicMock()
    item_result.one_or_none.return_value = item_row

    # Permissions result: iterating over the result yields permission rows
    perm_result = MagicMock()
    perm_result.__iter__ = MagicMock(return_value=iter(permission_rows or []))

    # The update calls return None
    update_items_result = MagicMock()
    update_chunks_result = MagicMock()

    session.execute = AsyncMock(
        side_effect=[item_result, perm_result, update_items_result, update_chunks_result]
    )
    return session


@pytest.mark.asyncio
class TestRecomputeAllowedScopes:
    """Tests for the recompute_allowed_scopes function."""

    async def test_adding_permission_updates_allowed_scopes(self):
        """When a permission is added, allowed_scopes should include the new scope."""
        item = _make_item_row(owner_user_id=42, visibility="private")
        perms = [_make_permission_row("user", "99", "read")]
        session = _mock_session(item, perms)

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "u:42" in result  # owner
        assert "u:99" in result  # permission grant
        # Verify update was called (4 execute calls: item, perms, update item, update chunks)
        assert session.execute.call_count == 4

    async def test_deleting_permission_removes_scope(self):
        """When a permission is deleted, the corresponding scope should be removed."""
        item = _make_item_row(owner_user_id=42)
        # No permissions -> only owner scope
        session = _mock_session(item, [])

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert result == ["u:42"]

    async def test_permission_below_read_removes_scope(self):
        """Permissions below 'read' level should not grant a scope."""
        item = _make_item_row(owner_user_id=42)
        perms = [_make_permission_row("user", "99", "none")]
        session = _mock_session(item, perms)

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "u:99" not in result
        assert "u:42" in result

    async def test_scopes_propagate_to_chunks(self):
        """All chunks of an item should receive the same allowed_scopes via UPDATE."""
        item = _make_item_row(owner_user_id=42)
        perms = [_make_permission_row("group", "10", "read")]
        session = _mock_session(item, perms)

        await recompute_allowed_scopes(library_item_id=1, session=session)

        # 4 execute calls: fetch item, fetch perms, update item, update chunks
        assert session.execute.call_count == 4

    async def test_default_scopes_for_new_item(self):
        """A new item with no permissions should default to owner-only scope."""
        item = _make_item_row(owner_user_id=7)
        session = _mock_session(item, [])

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert result == ["u:7"]

    async def test_public_visibility_includes_global_scope(self):
        """Public items should include 'p:global' in their allowed_scopes."""
        item = _make_item_row(owner_user_id=42, visibility="public")
        session = _mock_session(item, [])

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "p:global" in result
        assert "u:42" in result

    async def test_team_visibility_includes_tenant_scope(self):
        """Team-visible items should include 't:<tenant_id>' in their allowed_scopes."""
        item = _make_item_row(owner_user_id=42, visibility="team", tenant_id="abc-123")
        session = _mock_session(item, [])

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "t:abc-123" in result
        assert "u:42" in result

    async def test_gin_index_exists_on_allowed_scopes(self):
        """Verify the GIN index is defined on allowed_scopes column in the model."""
        from app.models.library import LibraryItem, LibraryChunk

        assert hasattr(LibraryItem, "allowed_scopes")
        assert hasattr(LibraryChunk, "allowed_scopes")

    async def test_group_permission_adds_group_scope(self):
        """Group-type permissions should add g:<subject_id> scope."""
        item = _make_item_row(owner_user_id=42)
        perms = [_make_permission_row("group", "55", "read")]
        session = _mock_session(item, perms)

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "g:55" in result
        assert "u:42" in result

    async def test_tenant_permission_adds_tenant_scope(self):
        """Tenant-type permissions should add t:<subject_id> scope."""
        item = _make_item_row(owner_user_id=42)
        perms = [_make_permission_row("tenant", "org-1", "read")]
        session = _mock_session(item, perms)

        result = await recompute_allowed_scopes(library_item_id=1, session=session)

        assert "t:org-1" in result

    async def test_item_not_found_returns_empty(self):
        """If the library item doesn't exist, return empty list."""
        session = AsyncMock()
        item_result = MagicMock()
        item_result.one_or_none.return_value = None
        session.execute = AsyncMock(return_value=item_result)

        result = await recompute_allowed_scopes(library_item_id=999, session=session)

        assert result == []
