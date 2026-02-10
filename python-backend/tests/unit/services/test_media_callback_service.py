"""Unit tests for media callback reliability service."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.media_task import MediaTask, MediaType, TaskStatus
from app.models.media_callback_event import MediaCallbackDLQ, MediaCallbackEvent
from app.models.user import User
from app.services.library_observability import (
    get_metric_count,
    reset_library_observability_metrics,
)
from app.services.media_callback_service import process_kie_callback_payload, retry_due_callback_events
from app.services.media_task_service import MediaTaskService


@pytest.fixture
async def callback_db():
    """SQLite test DB with only callback-related tables."""
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
                    MediaTask.__table__,
                    MediaCallbackEvent.__table__,
                    MediaCallbackDLQ.__table__,
                ],
            )
        )

    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.drop_all(
                sync_conn,
                tables=[
                    MediaCallbackDLQ.__table__,
                    MediaCallbackEvent.__table__,
                    MediaTask.__table__,
                    User.__table__,
                ],
            )
        )
    await engine.dispose()


@pytest.mark.unit
class TestMediaCallbackService:
    @pytest.mark.asyncio
    async def test_duplicate_callback_is_idempotent(self, callback_db):
        user = User(email="cb-idempotent@example.com", password="hash", credits=100)
        callback_db.add(user)
        await callback_db.commit()
        await callback_db.refresh(user)

        task = await MediaTaskService.create_task(
            callback_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "A mountain timelapse",
        )
        await MediaTaskService.update_task_status(
            callback_db,
            task.id,
            TaskStatus.PROCESSING,
            external_task_id="prov-task-dup-1",
        )

        payload = {
            "taskId": "prov-task-dup-1",
            "status": "completed",
            "output": {"url": "https://cdn.example.com/video-1.mp4"},
        }

        first = await process_kie_callback_payload(callback_db, payload)
        second = await process_kie_callback_payload(callback_db, payload)

        refreshed_task = await MediaTaskService.get_task(callback_db, task.id, user.id)
        assert refreshed_task is not None
        assert refreshed_task.status == TaskStatus.COMPLETED.value
        assert refreshed_task.result_url == "https://cdn.example.com/video-1.mp4"

        events_count = await callback_db.scalar(select(func.count()).select_from(MediaCallbackEvent))
        assert events_count == 1
        assert first["duplicate"] is False
        assert second["duplicate"] is True

    @pytest.mark.asyncio
    async def test_transient_missing_task_retries_then_completes(self, callback_db):
        payload = {
            "taskId": "prov-task-retry-1",
            "status": "completed",
            "output": {"url": "https://cdn.example.com/video-2.mp4"},
        }

        initial = await process_kie_callback_payload(callback_db, payload)
        assert initial["status"] == "retry_pending"

        event = await callback_db.scalar(
            select(MediaCallbackEvent).where(MediaCallbackEvent.provider_task_id == "prov-task-retry-1")
        )
        assert event is not None

        user = User(email="cb-retry@example.com", password="hash", credits=100)
        callback_db.add(user)
        await callback_db.commit()
        await callback_db.refresh(user)

        task = await MediaTaskService.create_task(
            callback_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "Retry callback test",
        )
        await MediaTaskService.update_task_status(
            callback_db,
            task.id,
            TaskStatus.PROCESSING,
            external_task_id="prov-task-retry-1",
        )

        # Force event as due now so retry loop picks it up.
        event.next_retry_at = datetime.utcnow() - timedelta(seconds=1)
        await callback_db.commit()

        retried = await retry_due_callback_events(callback_db)
        assert retried["processed"] >= 1
        assert retried["completed"] >= 1

        refreshed_task = await MediaTaskService.get_task(callback_db, task.id, user.id)
        assert refreshed_task is not None
        assert refreshed_task.status == TaskStatus.COMPLETED.value
        assert refreshed_task.result_url == "https://cdn.example.com/video-2.mp4"

    @pytest.mark.asyncio
    async def test_missing_provider_task_id_goes_to_dlq(self, callback_db):
        payload = {
            "status": "failed",
            "error": "provider timeout",
        }

        result = await process_kie_callback_payload(callback_db, payload)

        assert result["status"] == "failed_terminal"
        assert "provider_task_id" in result["error"]

        dlq_count = await callback_db.scalar(select(func.count()).select_from(MediaCallbackDLQ))
        assert dlq_count == 1

        event = await callback_db.scalar(select(MediaCallbackEvent).order_by(MediaCallbackEvent.id.desc()))
        assert event is not None
        assert event.status == "failed"

    @pytest.mark.asyncio
    async def test_callback_metrics_emit_for_success_and_dlq_failure(self, callback_db):
        reset_library_observability_metrics()

        user = User(email="cb-metrics@example.com", password="hash", credits=100)
        callback_db.add(user)
        await callback_db.commit()
        await callback_db.refresh(user)

        task = await MediaTaskService.create_task(
            callback_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "metrics callback task",
        )
        await MediaTaskService.update_task_status(
            callback_db,
            task.id,
            TaskStatus.PROCESSING,
            external_task_id="prov-task-metrics-1",
        )

        await process_kie_callback_payload(
            callback_db,
            {
                "taskId": "prov-task-metrics-1",
                "status": "completed",
                "output": {"url": "https://cdn.example.com/video-ok.mp4"},
            },
        )

        await process_kie_callback_payload(
            callback_db,
            {
                "status": "failed",
                "error": "missing task id",
            },
        )

        assert get_metric_count("media.callback.processed_total") == 1
        assert get_metric_count("media.callback.dlq_total") == 1
