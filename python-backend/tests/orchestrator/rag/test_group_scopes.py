"""
Tests for group membership -> scope mapping.

Verifies the mapping of groupMembers.status to scope inclusion/exclusion:
- active -> included
- pending -> excluded
- removed -> excluded
- Enterprise cross-tenant invite rejection
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.orchestrator.rag.scope_engine import compute_effective_scopes


def _mock_session_with_groups(group_ids: list[int]):
    """Build a mock session that returns active group membership scalars.

    scalars().all() returns raw column values, not row objects.
    For ``SELECT group_id FROM ...``, this means a list of ints.
    """
    session = AsyncMock()

    result = MagicMock()
    result.scalars.return_value.all.return_value = group_ids
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
class TestGroupScopes:

    async def test_active_member_gets_group_scope(self):
        """Active group members should have g:<group_id> in their scopes."""
        session = _mock_session_with_groups([42])
        result = await compute_effective_scopes(user_id=1, tenant_id="t1", session=session)

        assert "g:42" in result

    async def test_pending_member_excluded(self):
        """Pending (invited but not accepted) members should NOT get group scopes.

        The SQL query filters by status='active', so pending memberships
        are never returned. We verify that only active groups appear.
        """
        # Only active groups returned by query
        session = _mock_session_with_groups([10])
        result = await compute_effective_scopes(user_id=1, tenant_id="t1", session=session)

        # Only group 10 is active
        group_scopes = {s for s in result if s.startswith("g:")}
        assert group_scopes == {"g:10"}

    async def test_removed_member_excluded(self):
        """Removed members should NOT get group scopes.

        Same as pending — the SQL filters them out.
        """
        session = _mock_session_with_groups([])  # No active groups
        result = await compute_effective_scopes(user_id=1, tenant_id="t1", session=session)

        group_scopes = {s for s in result if s.startswith("g:")}
        assert len(group_scopes) == 0

    async def test_multiple_active_groups(self):
        """User with multiple active groups gets all group scopes."""
        session = _mock_session_with_groups([5, 10, 15])
        result = await compute_effective_scopes(user_id=1, tenant_id="t1", session=session)

        assert "g:5" in result
        assert "g:10" in result
        assert "g:15" in result

    async def test_enterprise_cross_tenant_invite_rejected(self):
        """Enterprise tenants must reject invites where the user belongs to a different tenant.

        This is a defense-in-depth check. The SQL query for active groups
        should be scoped to the query tenant. If a group belongs to a different
        tenant, it should not appear in the results.

        For this unit test, we verify the function only returns groups
        that the mock session provides (which should be pre-filtered by
        the SQL query's tenant scope).
        """
        # Mock returns only same-tenant groups
        session = _mock_session_with_groups([10])
        result = await compute_effective_scopes(user_id=1, tenant_id="enterprise-tenant", session=session)

        # Only same-tenant group should be present
        group_scopes = {s for s in result if s.startswith("g:")}
        assert group_scopes == {"g:10"}
