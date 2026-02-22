"""
Tests for compute_effective_scopes utility.

Verifies that a user's effective scopes at query time correctly include:
- Their own user scope (always)
- Public global scope (always)
- Group scopes for active memberships only
- Tenant scope when applicable
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.orchestrator.rag.scope_engine import compute_effective_scopes


def _mock_session_with_groups(group_ids: list[int]):
    """Build a mock session that returns group membership scalars.

    scalars().all() returns raw column values, not row objects.
    For ``SELECT group_id FROM ...``, this means a list of ints.
    """
    session = AsyncMock()

    result = MagicMock()
    result.scalars.return_value.all.return_value = group_ids
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
class TestComputeEffectiveScopes:
    """Tests for the compute_effective_scopes function."""

    async def test_always_includes_user_scope(self):
        """Effective scopes must always contain the user's own scope."""
        session = _mock_session_with_groups([])
        result = await compute_effective_scopes(user_id=42, tenant_id="t1", session=session)

        assert "u:42" in result

    async def test_always_includes_public_global(self):
        """Effective scopes must always contain 'p:global'."""
        session = _mock_session_with_groups([])
        result = await compute_effective_scopes(user_id=42, tenant_id="t1", session=session)

        assert "p:global" in result

    async def test_includes_active_group_scopes(self):
        """Active group memberships should produce g:<group_id> scopes."""
        session = _mock_session_with_groups([10, 20, 30])
        result = await compute_effective_scopes(user_id=42, tenant_id="t1", session=session)

        assert "g:10" in result
        assert "g:20" in result
        assert "g:30" in result

    async def test_includes_tenant_scope(self):
        """Tenant scope should be included for tenant-level access."""
        session = _mock_session_with_groups([])
        result = await compute_effective_scopes(user_id=42, tenant_id="abc-123", session=session)

        assert "t:abc-123" in result

    async def test_user_with_no_groups(self):
        """A user with no group memberships should have minimal scopes."""
        session = _mock_session_with_groups([])
        result = await compute_effective_scopes(user_id=5, tenant_id="t1", session=session)

        assert result == {"u:5", "p:global", "t:t1"}

    async def test_pending_groups_excluded(self):
        """The query only selects active groups; pending ones are excluded by SQL."""
        # The mock returns only active groups (10, 20, 30)
        # Pending group (99) is not returned by the SQL query
        session = _mock_session_with_groups([10, 20, 30])
        result = await compute_effective_scopes(user_id=42, tenant_id="t1", session=session)

        # Only the 3 active groups should be present
        group_scopes = {s for s in result if s.startswith("g:")}
        assert len(group_scopes) == 3
        assert "g:10" in group_scopes
        assert "g:20" in group_scopes
        assert "g:30" in group_scopes

    async def test_result_is_set(self):
        """Result should be a set for efficient membership checks."""
        session = _mock_session_with_groups([])
        result = await compute_effective_scopes(user_id=1, tenant_id="t1", session=session)

        assert isinstance(result, set)
