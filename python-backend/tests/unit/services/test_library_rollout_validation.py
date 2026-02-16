"""Section 08 acceptance-style validation for vector rollout readiness."""

from datetime import datetime
from importlib import util
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.library import (
    LibraryBackfillCampaign,
    LibraryChunk,
    LibraryIndexJob,
    LibraryItem,
    LibraryProviderSwitchState,
)
from app.models.user import User
from app.services.library_backfill_service import validate_backfill_consistency
from app.services.library_cutover_service import (
    approve_read_cutover,
    apply_either_trigger_rollback,
    get_or_create_switch_state,
    request_provider_cutover,
)
from app.services.library_indexing_service import (
    delete_library_item_vectors,
    enqueue_library_index_job,
    process_library_index_job,
)
from app.services.library_vector_observability_service import (
    build_admin_vector_health_snapshot,
    build_provider_settings_diagnostics,
    build_vector_audit_event,
    evaluate_vector_alert_policies,
    record_vector_audit_event,
    reset_vector_audit_events_for_tests,
)


class _FakeEmbeddingService:
    def embed_batch(self, texts):
        return [[float(len(t)), 1.0, 0.5] for t in texts]


def _fake_upsert(*, tenant_id, item_id, chunks, embeddings):
    assert len(chunks) == len(embeddings)
    return [f"vec:{tenant_id}:{item_id}:{chunk['chunk_index']}" for chunk in chunks]


@pytest.fixture
async def rollout_db():
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
                    User.__table__,
                    LibraryItem.__table__,
                    LibraryChunk.__table__,
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


async def _seed_item(
    db: AsyncSession,
    *,
    tenant_id: str,
    suffix: str,
    source: str,
    title: str,
) -> LibraryItem:
    user = User(email=f"rollout-{tenant_id}-{suffix}@example.com", password="hash", credits=100)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    item = LibraryItem(
        tenant_id=tenant_id,
        owner_user_id=user.id,
        item_type="document" if source != "media_history" else "image",
        source=source,
        title=title,
        description=f"description-{suffix}",
        status="ready",
        visibility="private",
        metadata={"prompt": f"prompt-{suffix}"},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@pytest.mark.unit
class TestLibraryRolloutValidation:
    @pytest.mark.asyncio
    async def test_gallery_and_library_auto_indexing_acceptance(self, rollout_db):
        library_item = await _seed_item(
            rollout_db,
            tenant_id="tenant-800",
            suffix="library",
            source="library_upload",
            title="Library acceptance",
        )
        gallery_item = await _seed_item(
            rollout_db,
            tenant_id="tenant-800",
            suffix="gallery",
            source="media_history",
            title="Gallery acceptance",
        )

        lib_job = await enqueue_library_index_job(rollout_db, library_item.id, tenant_id="tenant-800")
        gal_job = await enqueue_library_index_job(rollout_db, gallery_item.id, tenant_id="tenant-800", job_type="gallery_index")

        lib_result = await process_library_index_job(
            rollout_db,
            lib_job["job_id"],
            embedding_service=_FakeEmbeddingService(),
            vector_upsert_fn=_fake_upsert,
        )
        gal_result = await process_library_index_job(
            rollout_db,
            gal_job["job_id"],
            embedding_service=_FakeEmbeddingService(),
            vector_upsert_fn=_fake_upsert,
        )

        assert lib_result["status"] == "completed"
        assert gal_result["status"] == "completed"

        lib_chunks = await rollout_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == library_item.id)
        )
        gal_chunks = await rollout_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == gallery_item.id)
        )
        assert int(lib_chunks or 0) > 0
        assert int(gal_chunks or 0) > 0

    @pytest.mark.asyncio
    async def test_delete_acceptance_removes_indexed_vectors(self, rollout_db):
        item = await _seed_item(
            rollout_db,
            tenant_id="tenant-801",
            suffix="delete",
            source="library_upload",
            title="Delete acceptance",
        )

        job = await enqueue_library_index_job(rollout_db, item.id, tenant_id="tenant-801")
        process_result = await process_library_index_job(
            rollout_db,
            job["job_id"],
            embedding_service=_FakeEmbeddingService(),
            vector_upsert_fn=_fake_upsert,
        )
        assert process_result["status"] == "completed"

        deleted = await delete_library_item_vectors(
            rollout_db,
            item.id,
            tenant_id="tenant-801",
            soft_delete_item=True,
        )
        assert deleted["removed_chunks"] > 0
        assert deleted["removed_vector_refs"] > 0

        remaining_chunks = await rollout_db.scalar(
            select(func.count()).select_from(LibraryChunk).where(LibraryChunk.library_item_id == item.id)
        )
        assert int(remaining_chunks or 0) == 0

        consistency = await validate_backfill_consistency(
            rollout_db,
            domain="library",
            tenant_id="tenant-801",
            tolerance=0.0,
        )
        assert consistency["passed"] is True

    @pytest.mark.asyncio
    async def test_switch_and_rollback_acceptance_for_both_trigger_classes(self, rollout_db):
        state = await get_or_create_switch_state(rollout_db, tenant_id="tenant-802")

        active = await request_provider_cutover(
            rollout_db,
            tenant_id="tenant-802",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=state.switch_version,
        )
        cutover = await approve_read_cutover(
            rollout_db,
            tenant_id="tenant-802",
            coverage_ratio=0.99,
            smoke_passed=True,
            parity_ratio=0.98,
            reconciliation_report={"drift_count": 0, "missing_in_target": [], "unexpected_in_target": []},
            expected_version=active.switch_version,
        )
        assert cutover["cutover_applied"] is True

        refreshed = await rollout_db.scalar(
            select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.tenant_id == "tenant-802")
        )
        assert refreshed is not None

        rollback_failure_rate = await apply_either_trigger_rollback(
            rollout_db,
            tenant_id="tenant-802",
            indexing_failure_rate=0.08,
            search_latency_factor=1.0,
            search_regression_detected=False,
            expected_version=refreshed.switch_version,
        )
        assert rollback_failure_rate["rollback_applied"] is True

        refreshed = await rollout_db.scalar(
            select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.tenant_id == "tenant-802")
        )
        assert refreshed is not None
        active2 = await request_provider_cutover(
            rollout_db,
            tenant_id="tenant-802",
            target_provider="pgvector",
            campaign_completed=True,
            connectivity_ok=True,
            expected_version=refreshed.switch_version,
        )
        cutover2 = await approve_read_cutover(
            rollout_db,
            tenant_id="tenant-802",
            coverage_ratio=0.99,
            smoke_passed=True,
            parity_ratio=0.98,
            reconciliation_report={"drift_count": 0, "missing_in_target": [], "unexpected_in_target": []},
            expected_version=active2.switch_version,
        )
        assert cutover2["cutover_applied"] is True

        refreshed = await rollout_db.scalar(
            select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.tenant_id == "tenant-802")
        )
        assert refreshed is not None
        rollback_search = await apply_either_trigger_rollback(
            rollout_db,
            tenant_id="tenant-802",
            indexing_failure_rate=0.0,
            search_latency_factor=1.8,
            search_regression_detected=True,
            expected_version=refreshed.switch_version,
        )
        assert rollback_search["rollback_applied"] is True

    @pytest.mark.asyncio
    async def test_pgvector_and_rls_acceptance_contracts(self):
        migration_path = Path(__file__).resolve().parents[3] / "migrations" / "006_pgvector_tenant_rls.py"
        spec = util.spec_from_file_location("migration_006_pgvector_tenant_rls", migration_path)
        assert spec is not None and spec.loader is not None
        module = util.module_from_spec(spec)
        spec.loader.exec_module(module)

        module.assert_preflight_ok(
            {
                "can_create_extension": True,
                "capacity_headroom_bytes": 10 * 1024 * 1024 * 1024,
                "server_version_num": 150000,
            }
        )
        module.assert_verification_ok(
            {
                "extension_present": True,
                "table_present": True,
                "index_presence": {
                    "ix_library_chunk_vectors_tenant_item": True,
                    "ix_library_chunk_vectors_embedding_hnsw": True,
                },
                "rls_enabled": True,
                "policy_names": {
                    "library_chunk_vectors_tenant_select",
                    "library_chunk_vectors_tenant_insert",
                    "library_chunk_vectors_tenant_update",
                    "library_chunk_vectors_tenant_delete",
                },
            }
        )

    @pytest.mark.asyncio
    async def test_observability_acceptance_health_and_alert_signals(self, rollout_db):
        reset_vector_audit_events_for_tests()
        record_vector_audit_event(
            build_vector_audit_event(
                operation="index",
                outcome="success",
                tenant_id="tenant-803",
                provider="pgvector",
                correlation_id="acceptance-index-1",
                entity_id="library:1",
                details={"chunk_count": 3},
            )
        )

        rollout_db.add(
            LibraryProviderSwitchState(
                tenant_id="tenant-803",
                current_read_provider="pgvector",
                target_provider="pgvector",
                previous_read_provider="cloudflare_vectorize",
                campaign_status="completed",
                status="cutover_complete",
                switch_version=4,
            )
        )
        rollout_db.add(
            LibraryBackfillCampaign(
                tenant_id="tenant-803",
                domain="library",
                status="completed",
                queued_count=100,
                processed_count=100,
                succeeded_count=95,
                failed_count=5,
                skipped_count=0,
            )
        )
        rollout_db.add(
            LibraryIndexJob(
                tenant_id="tenant-803",
                library_item_id=22,
                job_type="initial_index",
                status="failed",
                run_at=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                last_error="provider timeout",
            )
        )
        await rollout_db.commit()

        snapshot = await build_admin_vector_health_snapshot(rollout_db, tenant_id="tenant-803")
        assert snapshot["provider_status"]["current_read_provider"] == "pgvector"
        assert snapshot["campaign_progress"]["status"] == "completed"

        alerts = evaluate_vector_alert_policies(
            queue_lag_minutes=12.0,
            queue_lag_window_minutes=15.0,
            failure_rate=0.06,
            failure_window_minutes=30.0,
            latency_p95_ms=190.0,
            latency_baseline_p95_ms=100.0,
            latency_window_minutes=15.0,
        )
        assert {alert["alert_key"] for alert in alerts} == {
            "queue_lag_breach",
            "index_failure_rate_breach",
            "search_latency_regression",
        }
        assert all(alert.get("runbook_url") for alert in alerts)
        assert all(alert.get("owner") for alert in alerts)

        diagnostics = build_provider_settings_diagnostics(
            provider_name="pgvector",
            config={"host": "localhost", "password": "top-secret"},
            connection_health={"healthy": True, "status": "configured"},
            capabilities={"supports_hybrid_search": True},
        )
        assert diagnostics["config_masked"]["password"] == "***redacted***"
        assert diagnostics["connection_health"]["healthy"] is True
