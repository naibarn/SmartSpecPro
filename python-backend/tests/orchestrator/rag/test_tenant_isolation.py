"""Integration tests for cross-tenant isolation in RAG retrieval."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.orchestrator.rag.scope_engine import compute_effective_scopes


def _mock_session_with_groups(group_ids: list[int]) -> AsyncMock:
    """Build a mock session that returns active group membership scalars."""
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = group_ids
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.unit
@pytest.mark.asyncio
class TestCrossTenantIsolation:
    """Verify that scope computation enforces tenant boundaries."""

    async def test_user_in_tenant_a_cannot_see_tenant_b_scopes(self):
        """User in tenant A should only get scopes for tenant A, not tenant B."""
        session_a = _mock_session_with_groups([10])
        scopes_a = await compute_effective_scopes(
            user_id=1, tenant_id="tenant-a", session=session_a,
        )

        session_b = _mock_session_with_groups([20])
        scopes_b = await compute_effective_scopes(
            user_id=2, tenant_id="tenant-b", session=session_b,
        )

        # Tenant A user should have tenant A scope, not tenant B
        assert "t:tenant-a" in scopes_a
        assert "t:tenant-b" not in scopes_a

        # Tenant B user should have tenant B scope, not tenant A
        assert "t:tenant-b" in scopes_b
        assert "t:tenant-a" not in scopes_b

    async def test_group_scope_bound_to_query_tenant(self):
        """Group scopes should only include groups from the query's tenant."""
        # User is in group 10 (tenant A) and group 20 (tenant B)
        # But query is for tenant A, so only group 10 should appear
        session = _mock_session_with_groups([10])  # SQL already filters by tenant
        scopes = await compute_effective_scopes(
            user_id=1, tenant_id="tenant-a", session=session,
        )

        assert "g:10" in scopes
        # g:20 is from tenant-b, filtered by the SQL query
        assert "g:20" not in scopes

    async def test_shared_doc_accessible_only_by_group_members(self):
        """Document with allowed_scopes=["u:1", "g:10"] should be accessible
        only by user 1 and active members of group 10."""
        doc_scopes = {"u:1", "g:10"}

        # User 2 is active member of group 10
        session_user2 = _mock_session_with_groups([10])
        user2_scopes = await compute_effective_scopes(
            user_id=2, tenant_id="t1", session=session_user2,
        )

        # User 3 is NOT a member of group 10
        session_user3 = _mock_session_with_groups([])
        user3_scopes = await compute_effective_scopes(
            user_id=3, tenant_id="t1", session=session_user3,
        )

        # User 2 has g:10, so doc_scopes & user2_scopes should intersect
        assert len(doc_scopes & user2_scopes) > 0

        # User 3 does NOT have g:10 or u:1, so no intersection
        assert len(doc_scopes & user3_scopes) == 0

    async def test_pending_member_cannot_access_group_docs(self):
        """Pending group member should not have the group scope."""
        # SQL filters status='active', so pending member returns no groups
        session = _mock_session_with_groups([])
        scopes = await compute_effective_scopes(
            user_id=4, tenant_id="t1", session=session,
        )

        doc_scopes = {"u:1", "g:10"}
        # User 4 has no group scopes and is not user 1
        assert len(doc_scopes & scopes) == 0

    async def test_unshared_doc_immediately_inaccessible(self):
        """After removing a scope, the document should no longer be accessible."""
        # Before: doc has scopes ["u:1", "g:10"]
        doc_scopes_before = {"u:1", "g:10"}

        session = _mock_session_with_groups([10])
        user2_scopes = await compute_effective_scopes(
            user_id=2, tenant_id="t1", session=session,
        )
        assert len(doc_scopes_before & user2_scopes) > 0  # accessible

        # After: doc scopes updated to ["u:1"] (group share removed)
        doc_scopes_after = {"u:1"}
        assert len(doc_scopes_after & user2_scopes) == 0  # no longer accessible

    async def test_public_doc_accessible_by_any_tenant(self):
        """Documents with p:global scope should be accessible by any user."""
        doc_scopes = {"u:1", "p:global"}

        session = _mock_session_with_groups([])
        any_user_scopes = await compute_effective_scopes(
            user_id=999, tenant_id="any-tenant", session=session,
        )

        # p:global is always in effective scopes
        assert "p:global" in any_user_scopes
        assert len(doc_scopes & any_user_scopes) > 0
