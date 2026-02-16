"""Unit tests for staged cutover and rollback governance (Section 06)."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import LibraryProviderSwitchState
from app.services.library_cutover_service import (
    DEFAULT_READ_PROVIDER,
    apply_either_trigger_rollback,
    approve_read_cutover,
    assert_config_edit_allowed,
    detect_reconciliation_drift,
    evaluate_cutover_readiness,
    get_or_create_switch_state,
    request_provider_cutover,
)


@pytest.fixture
async def cutover_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn,
                tables=[
                    LibraryProviderSwitchState.__table__,
                ],
            )
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.unit
class TestLibraryCutoverService:
    @pytest.mark.asyncio
    async def test_switch_request_fails_when_connectivity_check_fails(self, cutover_db):
        state = await get_or_create_switch_state(cutover_db, tenant_id="tenant-600")

        with pytest.raises(RuntimeError, match="target_connectivity_check_failed"):
            await request_provider_cutover(
                cutover_db,
                tenant_id="tenant-600",
                target_provider="pgvector",
                campaign_completed=True,
                connectivity_ok=False,
                expected_version=state.switch_version,
            )

    @pytest.mark.asyncio
    async def test_non_emergency_edits_blocked_during_active_cutover(self, cutover_db):
        state = await get_or_create_switch_state(cutover_db, tenant_id="tenant-601")
        active = await request_provider_cutover(
            cutover_db,
            tenant_id="tenant-601",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=state.switch_version,
        )

        with pytest.raises(PermissionError, match="cutover_non_emergency_edit_blocked"):
            assert_config_edit_allowed(active, emergency=False)

        assert_config_edit_allowed(active, emergency=True)

    @pytest.mark.asyncio
    async def test_optimistic_lock_rejects_stale_switch_state_updates(self, cutover_db):
        initial = await get_or_create_switch_state(cutover_db, tenant_id="tenant-602")
        stale_version = int(initial.switch_version)

        await request_provider_cutover(
            cutover_db,
            tenant_id="tenant-602",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=stale_version,
        )

        with pytest.raises(RuntimeError, match="switch_state_version_conflict"):
            await request_provider_cutover(
                cutover_db,
                tenant_id="tenant-602",
                target_provider="chromadb",
                campaign_completed=True,
                connectivity_ok=True,
                expected_version=stale_version,
            )

    @pytest.mark.asyncio
    async def test_read_provider_remains_old_until_readiness_gate_passes(self, cutover_db):
        initial = await get_or_create_switch_state(cutover_db, tenant_id="tenant-603")
        active = await request_provider_cutover(
            cutover_db,
            tenant_id="tenant-603",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=initial.switch_version,
        )

        failed_gate = await approve_read_cutover(
            cutover_db,
            tenant_id="tenant-603",
            coverage_ratio=0.90,
            smoke_passed=True,
            parity_ratio=0.98,
            reconciliation_report={"drift_count": 0, "missing_in_target": [], "unexpected_in_target": []},
            expected_version=active.switch_version,
        )
        assert failed_gate["cutover_applied"] is False
        assert failed_gate["current_read_provider"] == DEFAULT_READ_PROVIDER

        refreshed = await cutover_db.scalar(
            select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.tenant_id == "tenant-603")
        )
        assert refreshed is not None

        success = await approve_read_cutover(
            cutover_db,
            tenant_id="tenant-603",
            coverage_ratio=0.98,
            smoke_passed=True,
            parity_ratio=0.99,
            reconciliation_report={"drift_count": 0, "missing_in_target": [], "unexpected_in_target": []},
            expected_version=refreshed.switch_version,
        )
        assert success["cutover_applied"] is True
        assert success["current_read_provider"] == "pgvector"
        assert success["mirror_writes"] is False

    @pytest.mark.asyncio
    async def test_readiness_gate_fails_when_thresholds_not_met(self, cutover_db):
        gate = evaluate_cutover_readiness(
            coverage_ratio=0.80,
            smoke_passed=False,
            parity_ratio=0.75,
            reconciliation_drift_count=2,
        )

        assert gate["passed"] is False
        assert "coverage_below_threshold" in gate["failed_checks"]
        assert "smoke_failed" in gate["failed_checks"]
        assert "parity_below_threshold" in gate["failed_checks"]
        assert "reconciliation_drift" in gate["failed_checks"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("indexing_failure_rate", "search_latency_factor", "search_regression_detected"),
        [
            (0.08, 1.0, False),
            (0.0, 1.8, True),
        ],
    )
    async def test_either_rollback_trigger_restores_stable_provider_state(
        self,
        cutover_db,
        indexing_failure_rate,
        search_latency_factor,
        search_regression_detected,
    ):
        initial = await get_or_create_switch_state(cutover_db, tenant_id="tenant-604")
        active = await request_provider_cutover(
            cutover_db,
            tenant_id="tenant-604",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=initial.switch_version,
        )
        cutover = await approve_read_cutover(
            cutover_db,
            tenant_id="tenant-604",
            coverage_ratio=0.99,
            smoke_passed=True,
            parity_ratio=0.99,
            reconciliation_report={"drift_count": 0, "missing_in_target": [], "unexpected_in_target": []},
            expected_version=active.switch_version,
        )
        assert cutover["cutover_applied"] is True
        assert cutover["current_read_provider"] == "pgvector"

        refreshed = await cutover_db.scalar(
            select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.tenant_id == "tenant-604")
        )
        assert refreshed is not None

        rollback = await apply_either_trigger_rollback(
            cutover_db,
            tenant_id="tenant-604",
            indexing_failure_rate=indexing_failure_rate,
            search_latency_factor=search_latency_factor,
            search_regression_detected=search_regression_detected,
            expected_version=refreshed.switch_version,
        )

        assert rollback["rollback_applied"] is True
        assert rollback["current_read_provider"] == DEFAULT_READ_PROVIDER
        assert rollback["status"] == "rolled_back"

    @pytest.mark.asyncio
    async def test_reconciliation_detects_drift_before_cutover_approval(self, cutover_db):
        initial = await get_or_create_switch_state(cutover_db, tenant_id="tenant-605")
        active = await request_provider_cutover(
            cutover_db,
            tenant_id="tenant-605",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=initial.switch_version,
        )

        drift = detect_reconciliation_drift(
            expected_entity_ids=["library:1", "library:2"],
            actual_entity_ids=["library:1"],
        )
        assert drift["drift_count"] == 1
        assert drift["missing_in_target"] == ["library:2"]

        response = await approve_read_cutover(
            cutover_db,
            tenant_id="tenant-605",
            coverage_ratio=0.99,
            smoke_passed=True,
            parity_ratio=0.99,
            reconciliation_report=drift,
            expected_version=active.switch_version,
        )

        assert response["cutover_applied"] is False
        assert "reconciliation_drift" in response["failed_checks"]
        assert response["current_read_provider"] == DEFAULT_READ_PROVIDER
