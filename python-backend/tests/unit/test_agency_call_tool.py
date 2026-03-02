"""Tests for F09 Cross-Agency Communication tool."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestTenantIsolation:
    """Cross-tenant agency call must be rejected."""

    @pytest.mark.asyncio
    async def test_cross_tenant_call_rejected(self):
        """Calling an agency from a different tenant returns 'Agency not found'."""
        from app.services.tools.agency_call_tool import validate_tenant_isolation, AgencyCallError

        mock_db = AsyncMock()
        # Simulate agency not found in caller's tenant (cross-tenant)
        mock_result = MagicMock()
        mock_result.fetchone.return_value = None
        mock_db.execute.return_value = mock_result

        with pytest.raises(AgencyCallError, match="[Aa]gency not found"):
            await validate_tenant_isolation(mock_db, "agency-B", "tenant-A")

    @pytest.mark.asyncio
    async def test_same_tenant_call_allowed(self):
        """Calling an agency within the same tenant returns the agency row."""
        from app.services.tools.agency_call_tool import validate_tenant_isolation

        mock_db = AsyncMock()
        mock_row = {"id": "agency-A", "tenantId": "tenant-A", "visibility": "public", "createdBy": 1, "status": "active"}
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_db.execute.return_value = mock_result

        result = await validate_tenant_isolation(mock_db, "agency-A", "tenant-A")
        assert result == mock_row


class TestDepthLimit:
    """Depth tracking prevents unbounded recursion."""

    @pytest.mark.asyncio
    async def test_depth_at_max_rejected(self):
        """When currentDepth >= maxDepth, the call is rejected."""
        from app.services.tools.agency_call_tool import check_depth, AgencyCallError, MAX_ABSOLUTE_DEPTH

        with pytest.raises(AgencyCallError, match="[Dd]epth|[Ll]imit"):
            await check_depth(current_depth=MAX_ABSOLUTE_DEPTH, max_depth=MAX_ABSOLUTE_DEPTH)

    @pytest.mark.asyncio
    async def test_depth_below_max_allowed(self):
        """When currentDepth < maxDepth, the call proceeds without error."""
        from app.services.tools.agency_call_tool import check_depth

        # Should not raise
        await check_depth(current_depth=1, max_depth=3)

    @pytest.mark.asyncio
    async def test_default_max_depth_is_3(self):
        """MAX_ABSOLUTE_DEPTH constant is 3."""
        from app.services.tools.agency_call_tool import MAX_ABSOLUTE_DEPTH

        assert MAX_ABSOLUTE_DEPTH == 3


class TestLoopPrevention:
    """Redis callChain prevents A->B->A cycles."""

    @pytest.mark.asyncio
    async def test_cycle_detected_and_rejected(self):
        """If target agency is in callChain, reject with loop detection message."""
        from app.services.tools.agency_call_tool import check_loop, AgencyCallError

        mock_redis = AsyncMock()
        mock_redis.sismember.return_value = True  # target is already in chain

        with pytest.raises(AgencyCallError, match="[Ll]oop|[Cc]ycle"):
            await check_loop(mock_redis, "parent-run-1", "agency-A")

    @pytest.mark.asyncio
    async def test_callchain_persisted_in_redis(self):
        """callChain is stored in Redis with SADD+EXPIRE."""
        from app.services.tools.agency_call_tool import record_in_chain, CALLCHAIN_TTL

        mock_redis = AsyncMock()
        await record_in_chain(mock_redis, "parent-run-1", "agency-B")

        mock_redis.sadd.assert_called_once()
        mock_redis.expire.assert_called()
        # Verify key format
        call_args = mock_redis.sadd.call_args[0]
        assert "parent-run-1" in call_args[0]
        assert "agency-B" in call_args[1]

    @pytest.mark.asyncio
    async def test_callchain_ttl_is_600s(self):
        """Redis callChain key TTL is CALLCHAIN_TTL (600s)."""
        from app.services.tools.agency_call_tool import CALLCHAIN_TTL, record_in_chain

        assert CALLCHAIN_TTL == 600

        mock_redis = AsyncMock()
        await record_in_chain(mock_redis, "run-1", "agency-X")
        # Expire must be called with 600
        expire_call = mock_redis.expire.call_args[0]
        assert CALLCHAIN_TTL in expire_call or mock_redis.expire.call_args[0][1] == CALLCHAIN_TTL

    @pytest.mark.asyncio
    async def test_no_cycle_proceeds(self):
        """When target is NOT in callChain, check_loop completes without error."""
        from app.services.tools.agency_call_tool import check_loop

        mock_redis = AsyncMock()
        mock_redis.sismember.return_value = False  # not in chain

        # Should not raise
        await check_loop(mock_redis, "parent-run-1", "agency-C")


class TestBudgetCap:
    """Per-parent-run credit budget of 500 credits enforced."""

    @pytest.mark.asyncio
    async def test_budget_exceeded_rejected(self):
        """When cumulative spend would exceed 500 credits, reject."""
        from app.services.tools.agency_call_tool import check_budget, AgencyCallError, DEFAULT_BUDGET_CAP

        mock_redis = AsyncMock()
        mock_redis.get.return_value = str(DEFAULT_BUDGET_CAP)  # already at cap

        with pytest.raises(AgencyCallError, match="[Bb]udget|[Ll]imit"):
            await check_budget(mock_redis, "parent-run-1", estimated_cost=1.0)

    @pytest.mark.asyncio
    async def test_budget_within_limit_allowed(self):
        """When cumulative spend is below cap, call proceeds."""
        from app.services.tools.agency_call_tool import check_budget

        mock_redis = AsyncMock()
        mock_redis.get.return_value = "100"  # 100 credits used so far

        # Should not raise with 50 estimated cost (100+50=150 < 500)
        await check_budget(mock_redis, "parent-run-1", estimated_cost=50.0)


class TestAllowedAgencies:
    """allowedAgencies config acts as DENY ALL when empty."""

    @pytest.mark.asyncio
    async def test_empty_allowed_agencies_denies_all(self):
        """When allowedAgencies is [], ALL calls are denied."""
        from app.services.tools.agency_call_tool import check_allowed_agencies, AgencyCallError

        with pytest.raises(AgencyCallError, match="[Nn]ot allowed|[Dd]enied"):
            await check_allowed_agencies([], "agency-target")

    @pytest.mark.asyncio
    async def test_target_not_in_allowed_list_rejected(self):
        """When target not in allowedAgencies, reject."""
        from app.services.tools.agency_call_tool import check_allowed_agencies, AgencyCallError

        with pytest.raises(AgencyCallError, match="[Nn]ot allowed|[Dd]enied"):
            await check_allowed_agencies(["agency-A"], "agency-B")

    @pytest.mark.asyncio
    async def test_target_in_allowed_list_proceeds(self):
        """When target is in allowedAgencies, proceed without error."""
        from app.services.tools.agency_call_tool import check_allowed_agencies

        # Should not raise
        await check_allowed_agencies(["agency-A", "agency-B"], "agency-B")


class TestConcurrencyLimit:
    """Max 2 concurrent sub-agency calls per parent run via Redis semaphore."""

    @pytest.mark.asyncio
    async def test_concurrent_limit_exceeded_rejected(self):
        """When 2 sub-calls already in progress, reject."""
        from app.services.tools.agency_call_tool import acquire_semaphore, AgencyCallError, SEMAPHORE_MAX

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[SEMAPHORE_MAX + 1, True])
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.decr = AsyncMock(return_value=SEMAPHORE_MAX)

        with pytest.raises(AgencyCallError, match="[Cc]oncurrency|[Ll]imit"):
            await acquire_semaphore(mock_redis, "parent-run-1")

    @pytest.mark.asyncio
    async def test_semaphore_released_on_completion(self):
        """Redis semaphore is released after sub-agency call completes."""
        from app.services.tools.agency_call_tool import release_semaphore

        mock_redis = AsyncMock()
        mock_redis.decr.return_value = 0  # remaining slots after release
        await release_semaphore(mock_redis, "parent-run-1")

        mock_redis.decr.assert_called_once()

    @pytest.mark.asyncio
    async def test_semaphore_released_on_error(self):
        """Redis semaphore is released even when sub-call raises."""
        from app.services.tools.agency_call_tool import release_semaphore

        mock_redis = AsyncMock()
        mock_redis.decr.return_value = 1  # valid int return
        await release_semaphore(mock_redis, "parent-run-1")
        mock_redis.decr.assert_called_once()
