from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.live_browser import (
    LiveBrowserEvent,
    LiveBrowserIdempotencyKey,
    LiveBrowserSession,
)
from app.models.tenant import Tenant, TenantPlan, TenantStatus
from app.models.user import Plan, Role, User
from app.services.live_browser_session_manager import (
    DatabaseLiveBrowserStore,
    DatabaseSingleWriterCoordinator,
    InMemoryLiveBrowserStore,
    InMemorySingleWriterCoordinator,
    LiveBrowserSessionManager,
    LiveBrowserSessionMutationError,
)


def _create_manager(
    *,
    writer_id: str = "writer-a",
    store: InMemoryLiveBrowserStore | None = None,
    coordinator: InMemorySingleWriterCoordinator | None = None,
) -> LiveBrowserSessionManager:
    return LiveBrowserSessionManager(
        store=store,
        coordinator=coordinator,
        writer_id=writer_id,
        lease_ttl=timedelta(minutes=1),
    )


def _seed_session(
    manager: LiveBrowserSessionManager,
    *,
    session_id: str = "lbs_runtime_123",
    status: str = "ready",
    control_mode: str = "observe",
    now: datetime | None = None,
):
    return manager.create_session(
        session_id=session_id,
        tenant_id="tenant-123",
        user_id=42,
        source_type="automation",
        source_id="auto-123",
        status=status,
        control_mode=control_mode,
        now=now or datetime.now(UTC),
    )


def _create_db_manager(*, writer_id: str = "writer-a") -> LiveBrowserSessionManager:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            Tenant.__table__,
            User.__table__,
            LiveBrowserSession.__table__,
            LiveBrowserEvent.__table__,
            LiveBrowserIdempotencyKey.__table__,
        ],
    )
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db:
        db.add(
            Tenant(
                id="tenant-123",
                name="Tenant 123",
                slug="tenant-123",
                status=TenantStatus.ACTIVE,
                plan=TenantPlan.FREE,
            )
        )
        db.add(
            User(
                id=42,
                email="user-42@example.com",
                role=Role.user,
                plan=Plan.free,
                credits=0,
                currentTenantId="tenant-123",
            )
        )
        db.commit()

    store = DatabaseLiveBrowserStore(session_factory=session_factory)
    coordinator = DatabaseSingleWriterCoordinator(session_factory=session_factory)
    return LiveBrowserSessionManager(
        store=store,
        coordinator=coordinator,
        writer_id=writer_id,
        lease_ttl=timedelta(minutes=1),
    )


def test_valid_state_transitions_increment_session_version():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    queued = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-1",
        actor_type="user",
        actor_id="42",
        command_text="Summarize the pricing page",
    )
    assert queued["accepted"] is True
    assert queued["sessionVersion"] == 2

    paused = manager.pause_agent(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="pause-1",
        actor_type="user",
        actor_id="42",
        reason="user_requested",
    )
    assert paused["accepted"] is True
    assert paused["sessionVersion"] == 3

    session = manager.get_session("lbs_runtime_123")
    assert session.session_version == 3
    assert session.status == "waiting_for_human"


def test_invalid_state_transitions_do_not_mutate_persistent_state():
    manager = _create_manager()
    _seed_session(manager, status="provisioning")

    with pytest.raises(LiveBrowserSessionMutationError, match="Cannot queue commands"):
        manager.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=1,
            idempotency_key="cmd-invalid",
            actor_type="user",
            actor_id="42",
            command_text="Do not run",
        )

    session = manager.get_session("lbs_runtime_123")
    assert session.session_version == 1
    assert session.status == "provisioning"


def test_stale_session_version_requests_return_conflict_response():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    with pytest.raises(LiveBrowserSessionMutationError) as exc_info:
        manager.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=0,
            idempotency_key="cmd-stale",
            actor_type="user",
            actor_id="42",
            command_text="Open the pricing page",
        )

    error = exc_info.value
    assert error.code == "session_version_conflict"
    assert error.current_session_version == 1
    assert error.retryable is True


def test_duplicate_mutations_replay_stored_idempotency_response():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    first = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-replay",
        actor_type="user",
        actor_id="42",
        command_text="Inspect the refund policy",
    )
    second = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=99,
        idempotency_key="cmd-replay",
        actor_type="user",
        actor_id="42",
        command_text="Inspect the refund policy again",
    )

    assert second == first
    assert manager.get_session("lbs_runtime_123").session_version == 2


def test_controller_lease_expiry_moves_session_to_waiting_state():
    manager = _create_manager()
    seeded_at = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)
    _seed_session(manager, status="waiting_for_human", now=seeded_at)

    takeover = manager.take_control(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="takeover-1",
        actor_id="42",
        reason="manual_selection_required",
        now=seeded_at,
    )
    assert takeover["sessionVersion"] == 2

    expired = manager.expire_controller_lease(
        session_id="lbs_runtime_123",
        now=seeded_at + timedelta(minutes=2),
    )
    assert expired.session_version == 3
    assert expired.status == "waiting_for_human"
    assert expired.control_mode == "approve_only"


def test_recovery_logic_moves_session_to_failed_recovery_required_when_incomplete():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    result = manager.mark_recovery_state(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="recovery-1",
        runtime_metadata_complete=False,
    )

    assert result["accepted"] is True
    assert result["status"] == "failed_recovery_required"
    assert result["sessionVersion"] == 2
    assert manager.get_session("lbs_runtime_123").status == "failed_recovery_required"


def test_multi_instance_deployment_preserves_single_writer_behavior():
    store = InMemoryLiveBrowserStore()
    coordinator = InMemorySingleWriterCoordinator()
    manager_a = _create_manager(writer_id="writer-a", store=store, coordinator=coordinator)
    manager_b = _create_manager(writer_id="writer-b", store=store, coordinator=coordinator)

    _seed_session(manager_a, status="ready")

    with pytest.raises(LiveBrowserSessionMutationError, match="owned by writer-a"):
        manager_b.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=1,
            idempotency_key="cmd-other-writer",
            actor_type="user",
            actor_id="42",
            command_text="This writer should be blocked",
        )


def test_database_store_persists_sessions_events_and_idempotency():
    manager = _create_db_manager()
    seeded_at = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)

    created = _seed_session(manager, status="ready", now=seeded_at)
    assert created.runtime_owner_id == "writer-a"

    replayed = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-db-1",
        actor_type="user",
        actor_id="42",
        command_text="Open the settings page",
        now=seeded_at + timedelta(seconds=10),
    )
    assert replayed["accepted"] is True
    assert replayed["sessionVersion"] == 2

    replay_again = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=999,
        idempotency_key="cmd-db-1",
        actor_type="user",
        actor_id="42",
        command_text="ignored",
        now=seeded_at + timedelta(seconds=20),
    )
    assert replay_again == replayed

    session = manager.get_session("lbs_runtime_123")
    assert session.session_version == 2
    assert session.status == "agent_running"
    assert session.runtime_owner_id == "writer-a"

    db_store = manager._store
    assert isinstance(db_store, DatabaseLiveBrowserStore)
    assert len(db_store.list_events("lbs_runtime_123")) == 2


def test_database_coordinator_blocks_competing_writer_claims():
    manager_a = _create_db_manager(writer_id="writer-a")
    manager_b = LiveBrowserSessionManager(
        store=manager_a._store,
        coordinator=manager_a._coordinator,
        writer_id="writer-b",
        lease_ttl=timedelta(minutes=1),
    )

    _seed_session(manager_a, status="ready")

    with pytest.raises(LiveBrowserSessionMutationError, match="owned by writer-a"):
        manager_b.pause_agent(
            session_id="lbs_runtime_123",
            expected_session_version=1,
            idempotency_key="pause-db-b",
            actor_type="user",
            actor_id="42",
            reason="competing_writer",
        )


def test_only_one_agent_owned_command_executes_at_a_time():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    first = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-q-1",
        actor_type="agent",
        actor_id="agent-1",
        command_text="Open pricing page",
    )
    second = manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="cmd-q-2",
        actor_type="agent",
        actor_id="agent-1",
        command_text="Extract the first plan",
    )

    session = manager.get_session("lbs_runtime_123")
    assert first["accepted"] is True
    assert second["accepted"] is True
    assert session.browser_context_ref["activeCommandId"] == first["queuedCommandId"]
    assert [item["commandId"] for item in session.browser_context_ref["commandQueue"]] == [
        second["queuedCommandId"]
    ]


def test_queue_overflow_returns_command_queue_full():
    manager = _create_manager()
    _seed_session(manager, status="ready")

    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-overflow-1",
        actor_type="agent",
        actor_id="agent-1",
        command_text="one",
    )
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="cmd-overflow-2",
        actor_type="agent",
        actor_id="agent-1",
        command_text="two",
    )
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=3,
        idempotency_key="cmd-overflow-3",
        actor_type="agent",
        actor_id="agent-1",
        command_text="three",
    )

    with pytest.raises(LiveBrowserSessionMutationError) as exc_info:
        manager.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=4,
            idempotency_key="cmd-overflow-4",
            actor_type="agent",
            actor_id="agent-1",
            command_text="four",
        )

    assert exc_info.value.code == "command_queue_full"


def test_pending_approval_blocks_new_agent_work():
    manager = _create_manager()
    _seed_session(manager, status="agent_running")

    manager.request_approval(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="approval-1",
        actor_id="policy-1",
        approval_request_id="apr_1",
        prompt="Send payment?",
    )

    with pytest.raises(LiveBrowserSessionMutationError, match="human input is pending"):
        manager.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=2,
            idempotency_key="cmd-blocked",
            actor_type="agent",
            actor_id="agent-1",
            command_text="continue",
        )


def test_pending_assist_blocks_new_agent_work():
    manager = _create_manager()
    _seed_session(manager, status="agent_running")

    manager.request_assist(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="assist-1",
        actor_id="agent-1",
        assist_request_id="ast_1",
        request_type="decision",
        prompt="Pick the correct CTA",
    )

    with pytest.raises(LiveBrowserSessionMutationError, match="human input is pending"):
        manager.send_command(
            session_id="lbs_runtime_123",
            expected_session_version=2,
            idempotency_key="cmd-blocked-2",
            actor_type="agent",
            actor_id="agent-1",
            command_text="continue",
        )


def test_cancelation_preempts_queued_work_and_moves_session_terminal():
    manager = _create_manager()
    _seed_session(manager, status="ready")
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cancel-q-1",
        actor_type="agent",
        actor_id="agent-1",
        command_text="one",
    )
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="cancel-q-2",
        actor_type="agent",
        actor_id="agent-1",
        command_text="two",
    )

    cancelled = manager.cancel_session(
        session_id="lbs_runtime_123",
        expected_session_version=3,
        idempotency_key="cancel-session",
        actor_type="user",
        actor_id="42",
        reason="user_cancelled",
    )

    session = manager.get_session("lbs_runtime_123")
    events, _, _ = manager.list_events(session_id="lbs_runtime_123", limit=20)

    assert cancelled["status"] == "cancelled"
    assert session.status == "cancelled"
    assert session.browser_context_ref["commandQueue"] == []
    assert any(event.event_type == "command_failed" for event in events)


def test_takeover_pauses_agent_before_controller_authority_is_granted():
    manager = _create_manager()
    _seed_session(manager, status="agent_running")

    takeover = manager.take_control(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="takeover-agent-running",
        actor_id="42",
        reason="manual_selection_required",
    )

    session = manager.get_session("lbs_runtime_123")
    assert takeover["status"] == "human_controlling"
    assert session.status == "human_controlling"
    assert session.control_mode == "takeover"
    assert session.pause_reason == "manual_selection_required"


def test_returning_control_without_revalidation_keeps_session_blocked():
    manager = _create_manager()
    _seed_session(manager, status="agent_running")
    manager.take_control(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="takeover-revalidation",
        actor_id="42",
        reason="inspect_checkout",
    )

    returned = manager.return_control(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="return-control-1",
        actor_id="42",
        checkpoint="after_manual_review",
        revalidation_ok=False,
    )

    assert returned["status"] == "waiting_for_human"
    assert manager.get_session("lbs_runtime_123").pause_reason == "revalidation_failed"


def test_approval_resolution_fails_when_tab_context_drifted():
    manager = _create_manager()
    _seed_session(
        manager,
        status="agent_running",
        now=datetime.now(UTC),
    )
    manager.update_tab_context(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="tab-bind-initial",
        actor_type="system",
        actor_id="runtime",
        tab_id="tab_1",
        url="https://example.com/start",
        dom_fingerprint="dom-1",
    )
    manager.request_approval(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="approval-bind",
        actor_id="policy-1",
        approval_request_id="apr_bind",
        prompt="Approve checkout?",
    )
    manager.update_tab_context(
        session_id="lbs_runtime_123",
        expected_session_version=3,
        idempotency_key="tab-bind-drift",
        actor_type="system",
        actor_id="runtime",
        tab_id="tab_2",
        url="https://example.com/checkout",
        dom_fingerprint="dom-2",
    )

    with pytest.raises(LiveBrowserSessionMutationError, match="requires revalidation"):
        manager.resolve_approval(
            session_id="lbs_runtime_123",
            expected_session_version=4,
            idempotency_key="approval-resolve-drift",
            actor_id="42",
            approval_request_id="apr_bind",
            decision="approved",
        )


def test_tab_switch_invalidates_queued_work_with_explicit_events():
    manager = _create_manager()
    _seed_session(manager, status="ready")
    manager.update_tab_context(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="tab-init",
        actor_type="system",
        actor_id="runtime",
        tab_id="tab_1",
        url="https://example.com/start",
        dom_fingerprint="dom-1",
    )
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=2,
        idempotency_key="tab-cmd-1",
        actor_type="agent",
        actor_id="agent-1",
        command_text="Extract pricing",
    )
    manager.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=3,
        idempotency_key="tab-cmd-2",
        actor_type="agent",
        actor_id="agent-1",
        command_text="Open FAQs",
    )

    manager.update_tab_context(
        session_id="lbs_runtime_123",
        expected_session_version=4,
        idempotency_key="tab-switch",
        actor_type="system",
        actor_id="runtime",
        tab_id="tab_2",
        url="https://example.com/faq",
        dom_fingerprint="dom-2",
    )

    session = manager.get_session("lbs_runtime_123")
    events, _, _ = manager.list_events(session_id="lbs_runtime_123", limit=20)
    assert session.browser_context_ref["commandQueue"] == []
    assert any(
        event.event_type == "command_failed"
        and event.payload.get("reason") == "active_tab_changed"
        for event in events
    )


def test_cleanup_marks_stale_provisioning_and_expires_old_sessions():
    manager = _create_manager()
    now = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)
    manager.create_session(
        session_id="lbs_provisioning",
        tenant_id="tenant-123",
        user_id=42,
        source_type="automation",
        status="provisioning",
        control_mode="observe",
        now=now - timedelta(minutes=20),
    )
    manager.create_session(
        session_id="lbs_old",
        tenant_id="tenant-123",
        user_id=42,
        source_type="automation",
        status="ready",
        control_mode="observe",
        now=now - timedelta(hours=5),
    )

    result = manager.cleanup_stale_sessions(now=now)

    assert result["staleProvisioningSessions"] == 1
    assert result["expiredSessions"] == 1
    assert manager.get_session("lbs_provisioning").status == "failed"
    assert manager.get_session("lbs_old").status == "expired"


def test_database_coordinator_reclaims_stale_runtime_owner_claims():
    manager_a = _create_db_manager(writer_id="writer-a")
    manager_b = LiveBrowserSessionManager(
        store=manager_a._store,
        coordinator=manager_a._coordinator,
        writer_id="writer-b",
        lease_ttl=timedelta(minutes=1),
    )

    _seed_session(manager_a, status="ready")

    db_store = manager_a._store
    assert isinstance(db_store, DatabaseLiveBrowserStore)

    with db_store._session_factory() as db:
        session = db.get(LiveBrowserSession, "lbs_runtime_123")
        assert session is not None
        session.runtime_owner_claimed_at = datetime(2026, 3, 10, 11, 50, tzinfo=UTC)
        db.commit()

    queued = manager_b.send_command(
        session_id="lbs_runtime_123",
        expected_session_version=1,
        idempotency_key="cmd-reclaimed-owner",
        actor_type="user",
        actor_id="42",
        command_text="Resume after writer failover",
        now=datetime(2026, 3, 10, 12, 0, tzinfo=UTC),
    )

    assert queued["accepted"] is True
    session = manager_b.get_session("lbs_runtime_123")
    assert session.runtime_owner_id == "writer-b"
