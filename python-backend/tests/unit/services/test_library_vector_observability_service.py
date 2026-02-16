"""Unit tests for vector observability/admin diagnostics (Section 07)."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import (
    LibraryBackfillCampaign,
    LibraryIndexJob,
    LibraryProviderSwitchState,
)
from app.services.library_vector_observability_service import (
    build_admin_vector_health_snapshot,
    build_provider_settings_diagnostics,
    build_vector_audit_event,
    evaluate_vector_alert_policies,
    get_recent_vector_audit_events,
    record_vector_audit_event,
    reset_vector_audit_events_for_tests,
)


@pytest.fixture
async def vector_obs_db():
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
                    LibraryIndexJob.__table__,
                    LibraryBackfillCampaign.__table__,
                    LibraryProviderSwitchState.__table__,
                ],
            )
        )

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.unit
class TestLibraryVectorObservabilityService:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("operation", ["index", "delete", "search", "switch", "reindex"])
    async def test_audit_event_records_required_fields_per_operation(self, operation):
        reset_vector_audit_events_for_tests()
        event = build_vector_audit_event(
            operation=operation,
            outcome="success",
            tenant_id="tenant-700",
            provider="pgvector",
            correlation_id=f"corr-{operation}",
            entity_id="library:123",
            details={"chunk_count": 2},
        )
        record = record_vector_audit_event(event)

        assert record["event_version"] == "v1"
        assert record["operation"] == operation
        assert record["outcome"] == "success"
        assert record["tenant_id"] == "tenant-700"
        assert record["provider"] == "pgvector"
        assert record["correlation_id"] == f"corr-{operation}"
        assert "timestamp" in record

        recent = get_recent_vector_audit_events(limit=1)
        assert len(recent) == 1
        assert recent[0]["operation"] == operation

    @pytest.mark.asyncio
    async def test_admin_health_snapshot_returns_provider_queue_campaign_and_failures(self, vector_obs_db):
        now = datetime.utcnow()
        vector_obs_db.add(
            LibraryProviderSwitchState(
                tenant_id="tenant-701",
                current_read_provider="cloudflare_vectorize",
                target_provider="pgvector",
                previous_read_provider="cloudflare_vectorize",
                campaign_status="ready_for_cutover",
                status="active",
                switch_version=3,
                mirror_writes=True,
            )
        )
        vector_obs_db.add(
            LibraryBackfillCampaign(
                tenant_id="tenant-701",
                domain="library",
                status="running",
                queued_count=10,
                processed_count=7,
                succeeded_count=6,
                failed_count=1,
                skipped_count=0,
            )
        )
        vector_obs_db.add(
            LibraryIndexJob(
                tenant_id="tenant-701",
                library_item_id=77,
                job_type="initial_index",
                status="pending",
                run_at=now - timedelta(minutes=22),
            )
        )
        vector_obs_db.add(
            LibraryIndexJob(
                tenant_id="tenant-701",
                library_item_id=99,
                job_type="initial_index",
                status="failed",
                run_at=now - timedelta(minutes=35),
                completed_at=now - timedelta(minutes=5),
                last_error="embedding timeout",
            )
        )
        await vector_obs_db.commit()

        snapshot = await build_admin_vector_health_snapshot(
            vector_obs_db,
            tenant_id="tenant-701",
            now=now,
        )

        assert snapshot["provider_status"]["current_read_provider"] == "cloudflare_vectorize"
        assert snapshot["provider_status"]["target_provider"] == "pgvector"
        assert snapshot["provider_status"]["switch_status"] == "active"
        assert snapshot["queue_status"]["lag_minutes"] >= 20
        assert snapshot["campaign_progress"]["status"] == "running"
        assert snapshot["campaign_progress"]["processed"] == 7
        assert len(snapshot["recent_failures"]) == 1
        assert snapshot["recent_failures"][0]["library_item_id"] == 99

    @pytest.mark.asyncio
    async def test_queue_lag_alert_fires_on_threshold_breach(self):
        alerts = evaluate_vector_alert_policies(
            queue_lag_minutes=12.0,
            queue_lag_window_minutes=15.0,
            failure_rate=0.01,
            failure_window_minutes=30.0,
            latency_p95_ms=100.0,
            latency_baseline_p95_ms=100.0,
            latency_window_minutes=15.0,
        )
        keys = {alert["alert_key"] for alert in alerts}
        assert "queue_lag_breach" in keys

    @pytest.mark.asyncio
    async def test_failure_rate_alert_fires_on_rolling_window_breach(self):
        alerts = evaluate_vector_alert_policies(
            queue_lag_minutes=1.0,
            queue_lag_window_minutes=15.0,
            failure_rate=0.09,
            failure_window_minutes=30.0,
            latency_p95_ms=100.0,
            latency_baseline_p95_ms=100.0,
            latency_window_minutes=15.0,
        )
        keys = {alert["alert_key"] for alert in alerts}
        assert "index_failure_rate_breach" in keys

    @pytest.mark.asyncio
    async def test_latency_regression_alert_fires_when_factor_exceeds_threshold(self):
        alerts = evaluate_vector_alert_policies(
            queue_lag_minutes=1.0,
            queue_lag_window_minutes=15.0,
            failure_rate=0.01,
            failure_window_minutes=30.0,
            latency_p95_ms=190.0,
            latency_baseline_p95_ms=100.0,
            latency_window_minutes=15.0,
        )
        keys = {alert["alert_key"] for alert in alerts}
        assert "search_latency_regression" in keys

    @pytest.mark.asyncio
    async def test_provider_settings_diagnostics_masks_credentials_but_keeps_health(self):
        diagnostics = build_provider_settings_diagnostics(
            provider_name="cloudflare_vectorize",
            config={
                "account_id": "acct-123",
                "api_token": "secret-token",
                "nested": {"Authorization": "Bearer secret"},
            },
            connection_health={"healthy": True, "status": "ok", "message": "reachable"},
            capabilities={"supports_metadata_filter": True},
        )

        assert diagnostics["provider"] == "cloudflare_vectorize"
        assert diagnostics["config_masked"]["account_id"] == "acct-123"
        assert diagnostics["config_masked"]["api_token"] == "***redacted***"
        assert diagnostics["config_masked"]["nested"]["Authorization"] == "***redacted***"
        assert diagnostics["connection_health"]["healthy"] is True
        assert diagnostics["connection_health"]["status"] == "ok"
        assert diagnostics["capabilities"]["supports_metadata_filter"] is True
