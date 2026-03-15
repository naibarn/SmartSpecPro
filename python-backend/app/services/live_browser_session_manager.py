"""Authoritative in-process live-browser session manager primitives."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from app.models.live_browser import (
    LiveBrowserEvent as LiveBrowserEventModel,
    LiveBrowserIdempotencyKey as LiveBrowserIdempotencyKeyModel,
    LiveBrowserSession as LiveBrowserSessionModel,
)


TERMINAL_SESSION_STATUSES = {
    "completed",
    "cancelled",
    "failed",
    "expired",
    "failed_recovery_required",
}
ACTIVE_SESSION_STATUSES = {
    "ready",
    "agent_running",
    "waiting_for_human",
    "human_controlling",
    "waiting_for_runtime_recovery",
}
MAX_COMMAND_QUEUE_DEPTH = 3


@dataclass(slots=True)
class LiveBrowserSessionMutationError(Exception):
    code: str
    message: str
    current_session_version: int | None = None
    retryable: bool = False
    reason_codes: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return self.message

    def to_response(self) -> dict[str, Any]:
        response = {
            "accepted": False,
            "error": {
                "code": self.code,
                "message": self.message,
                "retryable": self.retryable,
                "reasonCodes": list(self.reason_codes),
            },
        }
        if self.current_session_version is not None:
            response["error"]["currentSessionVersion"] = self.current_session_version
        return response


@dataclass(slots=True)
class LiveBrowserSessionRecord:
    session_id: str
    tenant_id: str
    user_id: int
    source_type: str
    source_id: str | None
    status: str
    control_mode: str
    session_version: int = 1
    controller_actor_type: str | None = None
    controller_actor_id: str | None = None
    controller_connection_id: str | None = None
    controller_lease_expires_at: datetime | None = None
    pause_reason: str | None = None
    pending_assist_request_id: str | None = None
    pending_approval_request_id: str | None = None
    policy_context: dict[str, Any] = field(default_factory=dict)
    browser_context_ref: dict[str, Any] = field(default_factory=dict)
    stream_ref: dict[str, Any] = field(default_factory=dict)
    active_tab_count: int = 1
    runtime_owner_id: str | None = None
    runtime_owner_claimed_at: datetime | None = None
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_activity_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None
    end_reason: str | None = None


@dataclass(slots=True)
class LiveBrowserEventRecord:
    event_id: str
    session_id: str
    tenant_id: str
    session_version_at: int
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, Any]
    cursor: str
    screenshot_ref: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(slots=True)
class FollowUpEvent:
    event_type: str
    actor_type: str
    actor_id: str | None
    payload: dict[str, Any]
    screenshot_ref: str | None = None


@dataclass(slots=True)
class MutationTransitionResult:
    session: LiveBrowserSessionRecord
    response: dict[str, Any]
    follow_up_events: list[FollowUpEvent] = field(default_factory=list)


class LiveBrowserStore(Protocol):
    def save_session(self, session: LiveBrowserSessionRecord) -> LiveBrowserSessionRecord: ...

    def get_session(self, session_id: str) -> LiveBrowserSessionRecord: ...

    def append_event(self, event: LiveBrowserEventRecord) -> None: ...

    def list_events(self, session_id: str) -> list[LiveBrowserEventRecord]: ...

    def list_sessions(self) -> list[LiveBrowserSessionRecord]: ...

    def save_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
        command_type: str,
        response: dict[str, Any],
    ) -> dict[str, Any]: ...

    def get_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
    ) -> dict[str, Any] | None: ...

    def delete_expired_idempotency_results(self, *, expires_before: datetime) -> int: ...


class SingleWriterCoordinator(Protocol):
    def claim(self, session_id: str, writer_id: str) -> None: ...

    def release(self, session_id: str, writer_id: str) -> None: ...


def _copy_json(value: dict[str, Any]) -> dict[str, Any]:
    return {key: value[key] for key in value}


def _copy_command_queue(queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in queue]


def _current_origin(url: str | None) -> str | None:
    if not url:
        return None
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return None
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return None


class InMemoryLiveBrowserStore:
    def __init__(self) -> None:
        self.sessions: dict[str, LiveBrowserSessionRecord] = {}
        self.events: dict[str, list[LiveBrowserEventRecord]] = {}
        self.idempotency_results: dict[tuple[str, str], dict[str, Any]] = {}
        self.idempotency_expiry: dict[tuple[str, str], datetime] = {}

    def save_session(self, session: LiveBrowserSessionRecord) -> LiveBrowserSessionRecord:
        self.sessions[session.session_id] = replace(session)
        return self.sessions[session.session_id]

    def get_session(self, session_id: str) -> LiveBrowserSessionRecord:
        session = self.sessions.get(session_id)
        if session is None:
            raise LiveBrowserSessionMutationError(
                code="session_not_found",
                message=f"Session {session_id} was not found",
                retryable=False,
            )
        return replace(session)

    def append_event(self, event: LiveBrowserEventRecord) -> None:
        self.events.setdefault(event.session_id, []).append(event)

    def list_events(self, session_id: str) -> list[LiveBrowserEventRecord]:
        return [replace(event) for event in self.events.get(session_id, [])]

    def list_sessions(self) -> list[LiveBrowserSessionRecord]:
        return [replace(session) for session in self.sessions.values()]

    def save_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
        command_type: str,
        response: dict[str, Any],
    ) -> dict[str, Any]:
        key = (session_id, idempotency_key)
        self.idempotency_results[key] = dict(response)
        self.idempotency_expiry[key] = datetime.now(UTC) + timedelta(days=1)
        return dict(response)

    def get_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
    ) -> dict[str, Any] | None:
        key = (session_id, idempotency_key)
        result = self.idempotency_results.get(key)
        return dict(result) if result is not None else None

    def delete_expired_idempotency_results(self, *, expires_before: datetime) -> int:
        deleted = 0
        for key, expires_at in list(self.idempotency_expiry.items()):
            if expires_at <= expires_before:
                self.idempotency_expiry.pop(key, None)
                self.idempotency_results.pop(key, None)
                deleted += 1
        return deleted


class InMemorySingleWriterCoordinator:
    def __init__(self) -> None:
        self._owners: dict[str, str] = {}

    def claim(self, session_id: str, writer_id: str) -> None:
        owner = self._owners.get(session_id)
        if owner is None or owner == writer_id:
            self._owners[session_id] = writer_id
            return

        raise LiveBrowserSessionMutationError(
            code="single_writer_conflict",
            message=f"Session {session_id} is owned by {owner}",
            retryable=True,
        )

    def release(self, session_id: str, writer_id: str) -> None:
        if self._owners.get(session_id) == writer_id:
            self._owners.pop(session_id, None)


class DatabaseLiveBrowserStore:
    def __init__(self, *, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory

    def save_session(self, session: LiveBrowserSessionRecord) -> LiveBrowserSessionRecord:
        with self._session_factory() as db:
            row = db.get(LiveBrowserSessionModel, session.session_id)
            if row is None:
                row = LiveBrowserSessionModel(id=session.session_id)
                db.add(row)
            self._apply_session_record(row, session)
            db.commit()
        return self.get_session(session.session_id)

    def get_session(self, session_id: str) -> LiveBrowserSessionRecord:
        with self._session_factory() as db:
            row = db.get(LiveBrowserSessionModel, session_id)
            if row is None:
                raise LiveBrowserSessionMutationError(
                    code="session_not_found",
                    message=f"Session {session_id} was not found",
                    retryable=False,
                )
            return self._to_session_record(row)

    def list_sessions(self) -> list[LiveBrowserSessionRecord]:
        with self._session_factory() as db:
            rows = db.query(LiveBrowserSessionModel).all()
            return [self._to_session_record(row) for row in rows]

    def append_event(self, event: LiveBrowserEventRecord) -> None:
        with self._session_factory() as db:
            db.add(
                LiveBrowserEventModel(
                    id=event.event_id,
                    session_id=event.session_id,
                    tenant_id=event.tenant_id,
                    session_version_at=event.session_version_at,
                    event_type=event.event_type,
                    actor_type=event.actor_type,
                    actor_id=event.actor_id,
                    payload_json=dict(event.payload),
                    screenshot_ref=event.screenshot_ref,
                    cursor=event.cursor,
                    created_at=event.created_at,
                )
            )
            db.commit()

    def list_events(self, session_id: str) -> list[LiveBrowserEventRecord]:
        with self._session_factory() as db:
            rows = (
                db.query(LiveBrowserEventModel)
                .filter(LiveBrowserEventModel.session_id == session_id)
                .order_by(LiveBrowserEventModel.created_at.asc(), LiveBrowserEventModel.id.asc())
                .all()
            )
            return [self._to_event_record(row) for row in rows]

    def save_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
        command_type: str,
        response: dict[str, Any],
    ) -> dict[str, Any]:
        with self._session_factory() as db:
            row = (
                db.query(LiveBrowserIdempotencyKeyModel)
                .filter(
                    LiveBrowserIdempotencyKeyModel.session_id == session_id,
                    LiveBrowserIdempotencyKeyModel.idempotency_key == idempotency_key,
                )
                .one_or_none()
            )
            if row is None:
                row = LiveBrowserIdempotencyKeyModel(
                    session_id=session_id,
                    idempotency_key=idempotency_key,
                    command_type=command_type,
                    created_at=datetime.now(UTC),
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
                db.add(row)
            row.command_type = command_type
            row.response_json = dict(response)
            db.commit()
        return dict(response)

    def get_idempotency_result(
        self,
        session_id: str,
        idempotency_key: str,
    ) -> dict[str, Any] | None:
        with self._session_factory() as db:
            row = (
                db.query(LiveBrowserIdempotencyKeyModel)
                .filter(
                    LiveBrowserIdempotencyKeyModel.session_id == session_id,
                    LiveBrowserIdempotencyKeyModel.idempotency_key == idempotency_key,
                )
                .one_or_none()
            )
            if row is None:
                return None
            return dict(row.response_json or {})

    def delete_expired_idempotency_results(self, *, expires_before: datetime) -> int:
        with self._session_factory() as db:
            deleted = (
                db.query(LiveBrowserIdempotencyKeyModel)
                .filter(LiveBrowserIdempotencyKeyModel.expires_at <= expires_before)
                .delete()
            )
            db.commit()
            return int(deleted or 0)

    @staticmethod
    def _apply_session_record(row: LiveBrowserSessionModel, session: LiveBrowserSessionRecord) -> None:
        row.tenant_id = session.tenant_id
        row.user_id = session.user_id
        row.source_type = session.source_type
        row.source_id = session.source_id
        row.status = session.status
        row.control_mode = session.control_mode
        row.session_version = session.session_version
        row.controller_actor_type = session.controller_actor_type
        row.controller_actor_id = session.controller_actor_id
        row.controller_connection_id = session.controller_connection_id
        row.controller_lease_expires_at = session.controller_lease_expires_at
        row.pause_reason = session.pause_reason
        row.pending_assist_request_id = session.pending_assist_request_id
        row.pending_approval_request_id = session.pending_approval_request_id
        row.policy_context_json = dict(session.policy_context)
        row.browser_context_ref = dict(session.browser_context_ref)
        row.stream_ref = dict(session.stream_ref)
        row.active_tab_count = session.active_tab_count
        row.runtime_owner_id = session.runtime_owner_id
        row.runtime_owner_claimed_at = session.runtime_owner_claimed_at
        row.started_at = session.started_at
        row.last_activity_at = session.last_activity_at
        row.ended_at = session.ended_at
        row.end_reason = session.end_reason

    @staticmethod
    def _to_session_record(row: LiveBrowserSessionModel) -> LiveBrowserSessionRecord:
        return LiveBrowserSessionRecord(
            session_id=row.id,
            tenant_id=row.tenant_id,
            user_id=row.user_id,
            source_type=row.source_type,
            source_id=row.source_id,
            status=row.status,
            control_mode=row.control_mode,
            session_version=row.session_version,
            controller_actor_type=row.controller_actor_type,
            controller_actor_id=row.controller_actor_id,
            controller_connection_id=row.controller_connection_id,
            controller_lease_expires_at=row.controller_lease_expires_at,
            pause_reason=row.pause_reason,
            pending_assist_request_id=row.pending_assist_request_id,
            pending_approval_request_id=row.pending_approval_request_id,
            policy_context=dict(row.policy_context_json or {}),
            browser_context_ref=dict(row.browser_context_ref or {}),
            stream_ref=dict(row.stream_ref or {}),
            active_tab_count=row.active_tab_count,
            runtime_owner_id=row.runtime_owner_id,
            runtime_owner_claimed_at=row.runtime_owner_claimed_at,
            started_at=row.started_at,
            last_activity_at=row.last_activity_at,
            ended_at=row.ended_at,
            end_reason=row.end_reason,
        )

    @staticmethod
    def _to_event_record(row: LiveBrowserEventModel) -> LiveBrowserEventRecord:
        return LiveBrowserEventRecord(
            event_id=row.id,
            session_id=row.session_id,
            tenant_id=row.tenant_id,
            session_version_at=row.session_version_at,
            event_type=row.event_type,
            actor_type=row.actor_type,
            actor_id=row.actor_id,
            payload=dict(row.payload_json or {}),
            cursor=row.cursor,
            screenshot_ref=row.screenshot_ref,
            created_at=row.created_at,
        )


class DatabaseSingleWriterCoordinator:
    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        claim_ttl: timedelta = timedelta(minutes=5),
    ) -> None:
        self._session_factory = session_factory
        self._claim_ttl = claim_ttl

    def claim(self, session_id: str, writer_id: str) -> None:
        now = datetime.now(UTC)
        with self._session_factory() as db:
            row = db.get(LiveBrowserSessionModel, session_id)
            if row is None:
                raise LiveBrowserSessionMutationError(
                    code="session_not_found",
                    message=f"Session {session_id} was not found",
                    retryable=False,
                )

            claimed_at = row.runtime_owner_claimed_at
            if claimed_at is not None and claimed_at.tzinfo is None:
                claimed_at = claimed_at.replace(tzinfo=UTC)
            owner_is_stale = claimed_at is not None and claimed_at <= now - self._claim_ttl
            if row.runtime_owner_id not in {None, writer_id} and not owner_is_stale:
                raise LiveBrowserSessionMutationError(
                    code="single_writer_conflict",
                    message=f"Session {session_id} is owned by {row.runtime_owner_id}",
                    retryable=True,
                )

            row.runtime_owner_id = writer_id
            row.runtime_owner_claimed_at = now
            db.commit()

    def release(self, session_id: str, writer_id: str) -> None:
        with self._session_factory() as db:
            row = db.get(LiveBrowserSessionModel, session_id)
            if row is None or row.runtime_owner_id != writer_id:
                return
            row.runtime_owner_id = None
            row.runtime_owner_claimed_at = None
            db.commit()


class LiveBrowserSessionManager:
    def __init__(
        self,
        *,
        store: LiveBrowserStore | None = None,
        coordinator: SingleWriterCoordinator | None = None,
        writer_id: str = "live-runtime-1",
        lease_ttl: timedelta = timedelta(minutes=1),
    ) -> None:
        self._store = store or InMemoryLiveBrowserStore()
        self._coordinator = coordinator or InMemorySingleWriterCoordinator()
        self._writer_id = writer_id
        self._lease_ttl = lease_ttl

    def create_session(
        self,
        *,
        session_id: str,
        tenant_id: str,
        user_id: int,
        source_type: str,
        source_id: str | None = None,
        status: str = "ready",
        control_mode: str = "observe",
        policy_context: dict[str, Any] | None = None,
        browser_context_ref: dict[str, Any] | None = None,
        stream_ref: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> LiveBrowserSessionRecord:
        timestamp = now or datetime.now(UTC)
        context_ref = dict(browser_context_ref or {})
        context_ref.setdefault("commandQueue", [])
        context_ref.setdefault("activeTabId", "tab_1")
        session = LiveBrowserSessionRecord(
            session_id=session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            status=status,
            control_mode=control_mode,
            policy_context=dict(policy_context or {}),
            browser_context_ref=context_ref,
            stream_ref=dict(stream_ref or {}),
            started_at=timestamp,
            last_activity_at=timestamp,
        )
        self._store.save_session(session)
        self._coordinator.claim(session_id, self._writer_id)
        self.append_runtime_event(
            session_id=session_id,
            event_type="session_created",
            actor_type="system",
            actor_id=None,
            payload={"status": session.status, "controlMode": session.control_mode},
            now=timestamp,
        )
        return self._store.get_session(session_id)

    def get_session(self, session_id: str) -> LiveBrowserSessionRecord:
        return self._store.get_session(session_id)

    def list_sessions(self) -> list[LiveBrowserSessionRecord]:
        return self._store.list_sessions()

    def list_events(
        self,
        *,
        session_id: str,
        cursor: str | None = None,
        limit: int = 100,
    ) -> tuple[list[LiveBrowserEventRecord], str | None, bool]:
        events = self._store.list_events(session_id)
        start_index = 0
        if cursor:
            for index, event in enumerate(events):
                if event.cursor == cursor:
                    start_index = index + 1
                    break
        sliced = events[start_index:start_index + limit]
        next_cursor = sliced[-1].cursor if sliced else cursor
        has_more = start_index + limit < len(events)
        return sliced, next_cursor, has_more

    def send_command(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_type: str,
        actor_id: str,
        command_text: str,
        target_tab_id: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="command_queued",
            mutation_name="send_command",
            now=now,
            transition=self._transition_send_command(
                command_text=command_text,
                actor_type=actor_type,
                actor_id=actor_id,
                target_tab_id=target_tab_id,
            ),
        )

    def pause_agent(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_type: str,
        actor_id: str,
        reason: str,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="session_state_changed",
            mutation_name="pause_agent",
            now=now,
            transition=self._transition_pause_agent(reason),
        )

    def request_approval(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        approval_request_id: str,
        prompt: str,
        tab_id: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="policy",
            actor_id=actor_id,
            event_type="approval_requested",
            mutation_name="request_approval",
            now=now,
            transition=self._transition_request_approval(
                approval_request_id=approval_request_id,
                prompt=prompt,
                tab_id=tab_id,
            ),
        )

    def resolve_approval(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        approval_request_id: str,
        decision: str,
        notes: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="user",
            actor_id=actor_id,
            event_type="approval_resolved",
            mutation_name="resolve_approval",
            now=now,
            transition=self._transition_resolve_approval(
                approval_request_id=approval_request_id,
                decision=decision,
                notes=notes,
            ),
        )

    def request_assist(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        assist_request_id: str,
        request_type: str,
        prompt: str,
        tab_id: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="agent",
            actor_id=actor_id,
            event_type="assist_requested",
            mutation_name="request_assist",
            now=now,
            transition=self._transition_request_assist(
                assist_request_id=assist_request_id,
                request_type=request_type,
                prompt=prompt,
                tab_id=tab_id,
            ),
        )

    def submit_assist_response(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        assist_request_id: str,
        response_payload: dict[str, Any],
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="user",
            actor_id=actor_id,
            event_type="assist_resolved",
            mutation_name="submit_assist_response",
            now=now,
            transition=self._transition_submit_assist_response(
                assist_request_id=assist_request_id,
                response_payload=response_payload,
            ),
        )

    def take_control(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        reason: str,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        timestamp = now or datetime.now(UTC)

        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if session.status not in {"ready", "waiting_for_human", "agent_running"}:
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message=f"Cannot take control from {session.status}",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            updated = replace(
                session,
                status="human_controlling",
                control_mode="takeover",
                controller_actor_type="user",
                controller_actor_id=actor_id,
                controller_lease_expires_at=timestamp + self._lease_ttl,
                pause_reason=reason,
            )
            response = {
                "accepted": True,
                "status": updated.status,
                "controlMode": updated.control_mode,
                "sessionVersion": updated.session_version + 1,
                "reason": reason,
                "leaseExpiresAt": updated.controller_lease_expires_at.isoformat(),
            }
            return MutationTransitionResult(session=updated, response=response)

        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="user",
            actor_id=actor_id,
            event_type="takeover_started",
            mutation_name="take_control",
            now=timestamp,
            transition=transition,
        )

    def return_control(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_id: str,
        checkpoint: str,
        notes: str | None = None,
        revalidation_ok: bool = True,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type="user",
            actor_id=actor_id,
            event_type="takeover_ended",
            mutation_name="return_control",
            now=now,
            transition=self._transition_return_control(
                checkpoint=checkpoint,
                notes=notes,
                revalidation_ok=revalidation_ok,
            ),
        )

    def cancel_session(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_type: str,
        actor_id: str,
        reason: str,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        timestamp = now or datetime.now(UTC)

        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            follow_up_events = self._build_invalidation_events(
                session,
                reason="session_cancelled",
                actor_type=actor_type,
                actor_id=actor_id,
            )
            updated = replace(
                self._clear_human_blockers(session),
                status="cancelled",
                control_mode="observe",
                ended_at=timestamp,
                end_reason=reason,
                browser_context_ref=self._with_command_state(
                    session.browser_context_ref,
                    active_command_id=None,
                    queue=[],
                ),
            )
            response = {
                "accepted": True,
                "status": updated.status,
                "sessionVersion": updated.session_version + 1,
            }
            return MutationTransitionResult(
                session=updated,
                response=response,
                follow_up_events=follow_up_events,
            )

        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="session_failed",
            mutation_name="cancel_session",
            now=timestamp,
            transition=transition,
        )

    def update_tab_context(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_type: str,
        actor_id: str,
        tab_id: str,
        url: str,
        dom_fingerprint: str,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="url_changed",
            mutation_name="update_tab_context",
            now=now,
            transition=self._transition_update_tab_context(
                tab_id=tab_id,
                url=url,
                dom_fingerprint=dom_fingerprint,
            ),
        )

    def expire_controller_lease(
        self,
        *,
        session_id: str,
        now: datetime | None = None,
    ) -> LiveBrowserSessionRecord:
        timestamp = now or datetime.now(UTC)
        session = self._store.get_session(session_id)

        if session.status != "human_controlling":
            return session

        if session.controller_lease_expires_at is None or session.controller_lease_expires_at > timestamp:
            return session

        updated = replace(
            session,
            status="waiting_for_human",
            control_mode="approve_only",
            session_version=session.session_version + 1,
            controller_actor_type=None,
            controller_actor_id=None,
            controller_connection_id=None,
            controller_lease_expires_at=None,
            pause_reason="lease_expired",
            last_activity_at=timestamp,
        )
        self._store.save_session(updated)
        self._append_event(
            updated,
            event_type="takeover_ended",
            actor_type="system",
            actor_id=None,
            payload={"reason": "lease_expired"},
            now=timestamp,
        )
        return self._store.get_session(session_id)

    def mark_recovery_state(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        runtime_metadata_complete: bool,
        actor_type: str = "system",
        actor_id: str = "runtime",
        now: datetime | None = None,
    ) -> dict[str, Any]:
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            next_status = (
                "waiting_for_runtime_recovery"
                if runtime_metadata_complete
                else "failed_recovery_required"
            )
            updated = replace(
                session,
                status=next_status,
                end_reason=None if runtime_metadata_complete else "runtime_reconstruction_incomplete",
            )
            response = {
                "accepted": True,
                "status": next_status,
                "sessionVersion": updated.session_version + 1,
                "runtimeMetadataComplete": runtime_metadata_complete,
            }
            return MutationTransitionResult(session=updated, response=response)

        return self._run_mutation(
            session_id=session_id,
            expected_session_version=expected_session_version,
            idempotency_key=idempotency_key,
            actor_type=actor_type,
            actor_id=actor_id,
            event_type="session_state_changed",
            mutation_name="mark_recovery_state",
            now=now,
            transition=transition,
        )

    def append_runtime_event(
        self,
        *,
        session_id: str,
        event_type: str,
        actor_type: str,
        actor_id: str | None,
        payload: dict[str, Any],
        now: datetime | None = None,
        screenshot_ref: str | None = None,
    ) -> LiveBrowserEventRecord:
        session = self._store.get_session(session_id)
        timestamp = now or datetime.now(UTC)
        return self._append_event(
            session,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            payload=payload,
            now=timestamp,
            screenshot_ref=screenshot_ref,
        )

    def cleanup_stale_sessions(
        self,
        *,
        now: datetime | None = None,
        provisioning_timeout: timedelta = timedelta(minutes=10),
        session_ttl: timedelta = timedelta(hours=4),
    ) -> dict[str, int]:
        timestamp = now or datetime.now(UTC)
        stale_provisioning = 0
        expired_sessions = 0
        expired_leases = 0
        for session in self._store.list_sessions():
            if session.status == "provisioning" and session.last_activity_at <= timestamp - provisioning_timeout:
                updated = replace(
                    session,
                    status="failed",
                    control_mode="observe",
                    end_reason="provisioning_timeout",
                    ended_at=timestamp,
                    last_activity_at=timestamp,
                    session_version=session.session_version + 1,
                )
                self._store.save_session(updated)
                self._append_event(
                    updated,
                    event_type="session_failed",
                    actor_type="system",
                    actor_id=None,
                    payload={"reason": "provisioning_timeout"},
                    now=timestamp,
                )
                stale_provisioning += 1
                continue

            if session.status in ACTIVE_SESSION_STATUSES and session.last_activity_at <= timestamp - session_ttl:
                updated = replace(
                    session,
                    status="expired",
                    control_mode="observe",
                    end_reason="session_ttl_expired",
                    ended_at=timestamp,
                    last_activity_at=timestamp,
                    session_version=session.session_version + 1,
                )
                self._store.save_session(updated)
                self._append_event(
                    updated,
                    event_type="session_failed",
                    actor_type="system",
                    actor_id=None,
                    payload={"reason": "session_ttl_expired"},
                    now=timestamp,
                )
                expired_sessions += 1

            previous_version = self._store.get_session(session.session_id).session_version
            expired = self.expire_controller_lease(session_id=session.session_id, now=timestamp)
            if expired.session_version != previous_version:
                expired_leases += 1

        return {
            "staleProvisioningSessions": stale_provisioning,
            "expiredSessions": expired_sessions,
            "expiredControllerLeases": expired_leases,
        }

    def cleanup_expired_idempotency_results(self, *, now: datetime | None = None) -> int:
        return self._store.delete_expired_idempotency_results(expires_before=now or datetime.now(UTC))

    def _run_mutation(
        self,
        *,
        session_id: str,
        expected_session_version: int,
        idempotency_key: str,
        actor_type: str,
        actor_id: str,
        event_type: str,
        mutation_name: str,
        now: datetime | None,
        transition,
    ) -> dict[str, Any]:
        cached = self._store.get_idempotency_result(session_id, idempotency_key)
        if cached is not None:
            return cached

        self._coordinator.claim(session_id, self._writer_id)
        session = self._store.get_session(session_id)
        self._assert_mutation_allowed(session, expected_session_version)
        result: MutationTransitionResult = transition(session)
        timestamp = now or datetime.now(UTC)
        updated = replace(
            result.session,
            session_version=session.session_version + 1,
            last_activity_at=timestamp,
        )
        self._store.save_session(updated)
        self._append_event(
            updated,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            payload={"mutation": mutation_name, "response": result.response},
            now=timestamp,
        )
        for follow_up_event in result.follow_up_events:
            self._append_event(
                updated,
                event_type=follow_up_event.event_type,
                actor_type=follow_up_event.actor_type,
                actor_id=follow_up_event.actor_id,
                payload=follow_up_event.payload,
                now=timestamp,
                screenshot_ref=follow_up_event.screenshot_ref,
            )
        return self._store.save_idempotency_result(
            session_id,
            idempotency_key,
            mutation_name,
            result.response,
        )

    def _assert_mutation_allowed(
        self,
        session: LiveBrowserSessionRecord,
        expected_session_version: int,
    ) -> None:
        if session.status in TERMINAL_SESSION_STATUSES:
            raise LiveBrowserSessionMutationError(
                code="session_terminated",
                message=f"Session {session.session_id} is terminal",
                current_session_version=session.session_version,
                retryable=False,
            )

        if session.session_version != expected_session_version:
            raise LiveBrowserSessionMutationError(
                code="session_version_conflict",
                message=(
                    f"Session version mismatch: expected {session.session_version}, "
                    f"got {expected_session_version}"
                ),
                current_session_version=session.session_version,
                retryable=True,
            )

    def _append_event(
        self,
        session: LiveBrowserSessionRecord,
        *,
        event_type: str,
        actor_type: str,
        actor_id: str | None,
        payload: dict[str, Any],
        now: datetime,
        screenshot_ref: str | None = None,
    ) -> LiveBrowserEventRecord:
        event_nonce = uuid4().hex
        event = LiveBrowserEventRecord(
            event_id=f"lbe_{event_nonce}",
            session_id=session.session_id,
            tenant_id=session.tenant_id,
            session_version_at=session.session_version,
            event_type=event_type,
            actor_type=actor_type,
            actor_id=actor_id,
            payload=dict(payload),
            cursor=f"{session.session_id}:{session.session_version}:{event_nonce}",
            created_at=now,
            screenshot_ref=screenshot_ref,
        )
        self._store.append_event(event)
        return event

    def _transition_send_command(
        self,
        *,
        command_text: str,
        actor_type: str,
        actor_id: str,
        target_tab_id: str | None,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if (
                actor_type == "agent"
                and (session.pending_approval_request_id or session.pending_assist_request_id)
            ):
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Cannot queue agent work while human input is pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            if session.status not in {"ready", "agent_running"}:
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message=f"Cannot queue commands from {session.status}",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            if session.pending_approval_request_id or session.pending_assist_request_id:
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Cannot queue commands while human input is pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            context = _copy_json(session.browser_context_ref)
            command_queue = _copy_command_queue(context.get("commandQueue", []))
            active_tab_id = target_tab_id or context.get("activeTabId")
            queued_count = len(command_queue) + (1 if context.get("activeCommandId") else 0)
            if queued_count >= MAX_COMMAND_QUEUE_DEPTH:
                raise LiveBrowserSessionMutationError(
                    code="command_queue_full",
                    message="Command queue is full",
                    current_session_version=session.session_version,
                    retryable=True,
                    reason_codes=["command_queue_full"],
                )

            command_id = f"lbc_{uuid4().hex[:12]}"
            command_payload = {
                "commandId": command_id,
                "text": command_text,
                "actorType": actor_type,
                "actorId": actor_id,
                "tabId": active_tab_id,
                "queuedAtSessionVersion": session.session_version + 1,
            }
            if context.get("activeCommandId") is None:
                context["activeCommandId"] = command_id
                context["activeCommand"] = dict(command_payload)
            else:
                command_queue.append(dict(command_payload))
            context["commandQueue"] = command_queue
            updated = replace(
                session,
                status="agent_running",
                control_mode="agent_control",
                browser_context_ref=context,
            )
            response = {
                "accepted": True,
                "sessionVersion": updated.session_version + 1,
                "queuedCommandId": command_id,
            }
            return MutationTransitionResult(session=updated, response=response)

        return transition

    @staticmethod
    def _transition_pause_agent(reason: str):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if session.status != "agent_running":
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message=f"Cannot pause from {session.status}",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            updated = replace(
                session,
                status="waiting_for_human",
                control_mode="approve_only",
                pause_reason=reason,
            )
            response = {
                "accepted": True,
                "status": updated.status,
                "controlMode": updated.control_mode,
                "sessionVersion": updated.session_version + 1,
            }
            return MutationTransitionResult(session=updated, response=response)

        return transition

    def _transition_request_approval(
        self,
        *,
        approval_request_id: str,
        prompt: str,
        tab_id: str | None,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if session.pending_approval_request_id:
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Approval already pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            active_tab_id = tab_id or session.browser_context_ref.get("activeTabId")
            pending = {
                "requestId": approval_request_id,
                "prompt": prompt,
                "tabId": active_tab_id,
                "url": session.browser_context_ref.get("url"),
                "origin": session.browser_context_ref.get("origin"),
                "domFingerprint": session.browser_context_ref.get("domFingerprint"),
            }
            policy_context = _copy_json(session.policy_context)
            policy_context["pendingApproval"] = pending
            updated = replace(
                session,
                status="waiting_for_human",
                control_mode="approve_only",
                pause_reason="approval_pending",
                pending_approval_request_id=approval_request_id,
                policy_context=policy_context,
            )
            response = {
                "accepted": True,
                "approvalRequestId": approval_request_id,
                "status": updated.status,
                "sessionVersion": updated.session_version + 1,
            }
            return MutationTransitionResult(session=updated, response=response)

        return transition

    def _transition_resolve_approval(
        self,
        *,
        approval_request_id: str,
        decision: str,
        notes: str | None,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            pending = session.policy_context.get("pendingApproval")
            if session.pending_approval_request_id != approval_request_id or not isinstance(pending, dict):
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Approval request is not pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            if not self._is_bound_context_current(session, pending):
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Approval context drifted and requires revalidation",
                    current_session_version=session.session_version,
                    retryable=False,
                    reason_codes=["tab_context_drifted"],
                )

            policy_context = _copy_json(session.policy_context)
            policy_context.pop("pendingApproval", None)
            policy_context["lastApprovalResolution"] = {
                "requestId": approval_request_id,
                "decision": decision,
                "notes": notes,
            }
            should_resume = decision == "approved"
            next_status, next_mode = self._resume_state_from_work_queue(session, allow_resume=should_resume)
            updated = replace(
                self._clear_human_blockers(session),
                status=next_status,
                control_mode=next_mode,
                policy_context=policy_context,
                pause_reason=None if should_resume else "approval_rejected",
            )
            response = {
                "accepted": True,
                "approvalStatus": decision,
                "sessionVersion": updated.session_version + 1,
                "agentResumed": should_resume and next_status == "agent_running",
            }
            follow_up_events: list[FollowUpEvent] = []
            if response["agentResumed"]:
                follow_up_events.append(
                    FollowUpEvent(
                        event_type="agent_resumed",
                        actor_type="system",
                        actor_id=None,
                        payload={"reason": "approval_approved"},
                    )
                )
            return MutationTransitionResult(
                session=updated,
                response=response,
                follow_up_events=follow_up_events,
            )

        return transition

    def _transition_request_assist(
        self,
        *,
        assist_request_id: str,
        request_type: str,
        prompt: str,
        tab_id: str | None,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if session.pending_assist_request_id:
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Assist request already pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            active_tab_id = tab_id or session.browser_context_ref.get("activeTabId")
            policy_context = _copy_json(session.policy_context)
            policy_context["pendingAssist"] = {
                "requestId": assist_request_id,
                "requestType": request_type,
                "prompt": prompt,
                "tabId": active_tab_id,
                "url": session.browser_context_ref.get("url"),
                "origin": session.browser_context_ref.get("origin"),
                "domFingerprint": session.browser_context_ref.get("domFingerprint"),
            }
            updated = replace(
                session,
                status="waiting_for_human",
                control_mode="approve_only",
                pause_reason="assist_pending",
                pending_assist_request_id=assist_request_id,
                policy_context=policy_context,
            )
            response = {
                "accepted": True,
                "assistRequestId": assist_request_id,
                "status": updated.status,
                "sessionVersion": updated.session_version + 1,
            }
            return MutationTransitionResult(session=updated, response=response)

        return transition

    def _transition_submit_assist_response(
        self,
        *,
        assist_request_id: str,
        response_payload: dict[str, Any],
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            pending = session.policy_context.get("pendingAssist")
            if session.pending_assist_request_id != assist_request_id or not isinstance(pending, dict):
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Assist request is not pending",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            if not self._is_bound_context_current(session, pending):
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message="Assist context drifted and requires revalidation",
                    current_session_version=session.session_version,
                    retryable=False,
                    reason_codes=["tab_context_drifted"],
                )

            response_type = response_payload.get("type")
            should_resume = response_type != "takeover_required"
            policy_context = _copy_json(session.policy_context)
            policy_context.pop("pendingAssist", None)
            policy_context["lastAssistResolution"] = {
                "requestId": assist_request_id,
                "response": dict(response_payload),
            }
            next_status, next_mode = self._resume_state_from_work_queue(session, allow_resume=should_resume)
            updated = replace(
                self._clear_human_blockers(session),
                status=next_status if should_resume else "waiting_for_human",
                control_mode=next_mode if should_resume else "approve_only",
                policy_context=policy_context,
                pause_reason=None if should_resume else "takeover_required",
            )
            response = {
                "accepted": True,
                "assistRequestStatus": "resolved",
                "sessionVersion": updated.session_version + 1,
            }
            follow_up_events: list[FollowUpEvent] = []
            if should_resume and next_status == "agent_running":
                follow_up_events.append(
                    FollowUpEvent(
                        event_type="agent_resumed",
                        actor_type="system",
                        actor_id=None,
                        payload={"reason": "assist_resolved"},
                    )
                )
            return MutationTransitionResult(
                session=updated,
                response=response,
                follow_up_events=follow_up_events,
            )

        return transition

    def _transition_return_control(
        self,
        *,
        checkpoint: str,
        notes: str | None,
        revalidation_ok: bool,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            if session.status != "human_controlling":
                raise LiveBrowserSessionMutationError(
                    code="invalid_state_transition",
                    message=f"Cannot return control from {session.status}",
                    current_session_version=session.session_version,
                    retryable=False,
                )

            updated_session = self._clear_human_blockers(session)
            if not revalidation_ok:
                updated = replace(
                    updated_session,
                    status="waiting_for_human",
                    control_mode="approve_only",
                    pause_reason="revalidation_failed",
                )
            else:
                next_status, next_mode = self._resume_state_from_work_queue(session, allow_resume=True)
                updated = replace(
                    updated_session,
                    status=next_status,
                    control_mode=next_mode,
                    pause_reason=None,
                )

            response = {
                "accepted": True,
                "status": updated.status,
                "controlMode": updated.control_mode,
                "sessionVersion": updated.session_version + 1,
                "checkpoint": checkpoint,
                "notes": notes,
            }
            follow_up_events: list[FollowUpEvent] = []
            if revalidation_ok and updated.status == "agent_running":
                follow_up_events.append(
                    FollowUpEvent(
                        event_type="agent_resumed",
                        actor_type="system",
                        actor_id=None,
                        payload={"reason": "controller_returned"},
                    )
                )
            return MutationTransitionResult(
                session=updated,
                response=response,
                follow_up_events=follow_up_events,
            )

        return transition

    def _transition_update_tab_context(
        self,
        *,
        tab_id: str,
        url: str,
        dom_fingerprint: str,
    ):
        def transition(session: LiveBrowserSessionRecord) -> MutationTransitionResult:
            context = _copy_json(session.browser_context_ref)
            previous_tab_id = context.get("activeTabId")
            previous_origin = context.get("origin")
            previous_dom_fingerprint = context.get("domFingerprint")
            context["activeTabId"] = tab_id
            context["url"] = url
            context["origin"] = _current_origin(url)
            context["domFingerprint"] = dom_fingerprint

            follow_up_events: list[FollowUpEvent] = []
            material_change = (
                previous_tab_id != tab_id
                or previous_origin != context.get("origin")
                or previous_dom_fingerprint != dom_fingerprint
            )
            if material_change:
                invalidation_events, updated_context = self._invalidate_queued_commands_for_tab_change(
                    context,
                    previous_tab_id=previous_tab_id,
                    reason="active_tab_changed",
                )
                context = updated_context
                follow_up_events.extend(invalidation_events)

            updated = replace(session, browser_context_ref=context)
            response = {
                "accepted": True,
                "sessionVersion": updated.session_version + 1,
                "activeTabId": tab_id,
                "url": url,
            }
            return MutationTransitionResult(
                session=updated,
                response=response,
                follow_up_events=follow_up_events,
            )

        return transition

    @staticmethod
    def _with_command_state(
        context: dict[str, Any],
        *,
        active_command_id: str | None,
        queue: list[dict[str, Any]],
    ) -> dict[str, Any]:
        updated = _copy_json(context)
        updated["activeCommandId"] = active_command_id
        if active_command_id is None:
            updated.pop("activeCommand", None)
        updated["commandQueue"] = _copy_command_queue(queue)
        return updated

    def _invalidate_queued_commands_for_tab_change(
        self,
        context: dict[str, Any],
        *,
        previous_tab_id: str | None,
        reason: str,
    ) -> tuple[list[FollowUpEvent], dict[str, Any]]:
        updated_context = _copy_json(context)
        queue = _copy_command_queue(updated_context.get("commandQueue", []))
        surviving: list[dict[str, Any]] = []
        invalidated: list[FollowUpEvent] = []
        for item in queue:
            if item.get("tabId") == previous_tab_id:
                invalidated.append(
                    FollowUpEvent(
                        event_type="command_failed",
                        actor_type="system",
                        actor_id=None,
                        payload={
                            "commandId": item.get("commandId"),
                            "reason": reason,
                        },
                    )
                )
            else:
                surviving.append(item)
        updated_context["commandQueue"] = surviving
        return invalidated, updated_context

    @staticmethod
    def _clear_human_blockers(session: LiveBrowserSessionRecord) -> LiveBrowserSessionRecord:
        return replace(
            session,
            controller_actor_type=None,
            controller_actor_id=None,
            controller_connection_id=None,
            controller_lease_expires_at=None,
            pending_assist_request_id=None,
            pending_approval_request_id=None,
        )

    @staticmethod
    def _resume_state_from_work_queue(
        session: LiveBrowserSessionRecord,
        *,
        allow_resume: bool,
    ) -> tuple[str, str]:
        if not allow_resume:
            return "waiting_for_human", "approve_only"
        has_work = bool(
            session.browser_context_ref.get("activeCommandId")
            or session.browser_context_ref.get("commandQueue")
        )
        if has_work:
            return "agent_running", "agent_control"
        return "ready", "observe"

    @staticmethod
    def _is_bound_context_current(session: LiveBrowserSessionRecord, pending: dict[str, Any]) -> bool:
        active_tab_id = session.browser_context_ref.get("activeTabId")
        if pending.get("tabId") and pending.get("tabId") != active_tab_id:
            return False
        for key in ("url", "origin", "domFingerprint"):
            expected = pending.get(key)
            if expected and expected != session.browser_context_ref.get(key):
                return False
        return True

    def _build_invalidation_events(
        self,
        session: LiveBrowserSessionRecord,
        *,
        reason: str,
        actor_type: str,
        actor_id: str,
    ) -> list[FollowUpEvent]:
        events: list[FollowUpEvent] = []
        active_command = session.browser_context_ref.get("activeCommand")
        if isinstance(active_command, dict) and active_command.get("commandId"):
            events.append(
                FollowUpEvent(
                    event_type="command_failed",
                    actor_type=actor_type,
                    actor_id=actor_id,
                    payload={
                        "commandId": active_command.get("commandId"),
                        "reason": reason,
                    },
                )
            )
        for queued in session.browser_context_ref.get("commandQueue", []) or []:
            if not isinstance(queued, dict):
                continue
            events.append(
                FollowUpEvent(
                    event_type="command_failed",
                    actor_type=actor_type,
                    actor_id=actor_id,
                    payload={
                        "commandId": queued.get("commandId"),
                        "reason": reason,
                    },
                )
            )
        return events
