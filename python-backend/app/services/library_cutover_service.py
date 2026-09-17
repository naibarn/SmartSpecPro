"""Provider switch-state orchestration for staged cutover and rollback."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import (
    LibraryBackfillCampaign,
    LibraryItem,
    LibraryProviderSwitchState,
    VectorIndexRecord,
)
from app.services.library_observability import emit_metric, log_observability_event
from app.services.library_vector_observability_service import (
    build_vector_audit_event,
    record_vector_audit_event,
)

# pgvector remains the active read provider while Vectorize is staged; the
# measured coverage/parity/smoke gates promote the target automatically.
DEFAULT_READ_PROVIDER = "pgvector"
SUPPORTED_PROVIDERS = ("cloudflare_vectorize", "pgvector", "chromadb")
READINESS_GATE_NAME = "coverage_95_plus_smoke"

ACTIVE_CUTOVER_STATUSES = {"active", "ready_for_cutover"}

DEFAULT_COVERAGE_THRESHOLD = 0.95
DEFAULT_PARITY_THRESHOLD = 0.95
DEFAULT_FAILURE_RATE_THRESHOLD = 0.05
DEFAULT_LATENCY_REGRESSION_THRESHOLD = 1.5
LIBRARY_ELIGIBLE_ITEM_STATUSES = ("ready", "failed", "indexing")
LIBRARY_GALLERY_SOURCE = "media_history"


def _safe_record_switch_audit_event(**kwargs: Any) -> None:
    try:
        event = build_vector_audit_event(**kwargs)
        record_vector_audit_event(event)
    except Exception:  # noqa: BLE001
        # Audit path must not break cutover controls.
        return


def _normalize_tenant_id(tenant_id: str | int | None) -> str | None:
    if tenant_id is None:
        return None
    value = str(tenant_id).strip()
    return value or None


def _normalize_provider(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized not in SUPPORTED_PROVIDERS:
        raise ValueError(f"unsupported_provider:{normalized}")
    return normalized


async def get_or_create_switch_state(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    default_provider: str = DEFAULT_READ_PROVIDER,
) -> LibraryProviderSwitchState:
    resolved_tenant = _normalize_tenant_id(tenant_id)
    default_provider = _normalize_provider(default_provider)

    query = select(LibraryProviderSwitchState).where(
        LibraryProviderSwitchState.tenant_id == resolved_tenant
    )
    state = await db.scalar(query)
    if state is not None:
        return state

    state = LibraryProviderSwitchState(
        tenant_id=resolved_tenant,
        current_read_provider=default_provider,
        previous_read_provider=default_provider,
        target_provider=default_provider,
        campaign_status="idle",
        status="idle",
        switch_version=1,
        readiness_gate=READINESS_GATE_NAME,
        freeze_non_emergency_edits=False,
        mirror_writes=False,
        readiness_json={},
        reconciliation_json={},
    )
    db.add(state)
    await db.commit()
    await db.refresh(state)
    return state


def assert_config_edit_allowed(
    state: LibraryProviderSwitchState,
    *,
    emergency: bool = False,
) -> None:
    if state.freeze_non_emergency_edits and not emergency:
        raise PermissionError("cutover_non_emergency_edit_blocked")


async def _assert_version(
    state: LibraryProviderSwitchState,
    *,
    expected_version: int | None,
) -> None:
    if expected_version is None:
        return
    if int(expected_version) != int(state.switch_version):
        raise RuntimeError(
            f"switch_state_version_conflict:expected={expected_version}:actual={state.switch_version}"
        )


async def _apply_state_update(
    db: AsyncSession,
    *,
    state: LibraryProviderSwitchState,
    values: dict[str, Any],
) -> LibraryProviderSwitchState:
    expected_version = int(state.switch_version or 0)
    next_version = expected_version + 1

    payload = {
        **values,
        "switch_version": next_version,
        "updated_at": datetime.utcnow(),
    }
    stmt = (
        update(LibraryProviderSwitchState)
        .where(
            LibraryProviderSwitchState.id == state.id,
            LibraryProviderSwitchState.switch_version == expected_version,
        )
        .values(**payload)
    )
    result = await db.execute(stmt)
    if int(result.rowcount or 0) != 1:
        await db.rollback()
        raise RuntimeError("switch_state_version_conflict:concurrent_update_detected")

    await db.commit()
    refreshed = await db.scalar(
        select(LibraryProviderSwitchState).where(LibraryProviderSwitchState.id == state.id)
    )
    if refreshed is None:
        raise RuntimeError(f"switch_state_missing_after_update:{state.id}")
    return refreshed


def detect_reconciliation_drift(
    *,
    expected_entity_ids: list[str],
    actual_entity_ids: list[str],
    sample_limit: int = 50,
) -> dict[str, Any]:
    expected = {str(entity).strip() for entity in expected_entity_ids if str(entity).strip()}
    actual = {str(entity).strip() for entity in actual_entity_ids if str(entity).strip()}

    missing = sorted(expected - actual)
    unexpected = sorted(actual - expected)
    drift_count = len(missing) + len(unexpected)

    return {
        "drift_count": drift_count,
        "missing_in_target": missing[: max(sample_limit, 0)],
        "unexpected_in_target": unexpected[: max(sample_limit, 0)],
        "sample_limit": max(sample_limit, 0),
    }


def evaluate_cutover_readiness(
    *,
    coverage_ratio: float,
    smoke_passed: bool,
    parity_ratio: float,
    reconciliation_drift_count: int,
    coverage_threshold: float = DEFAULT_COVERAGE_THRESHOLD,
    parity_threshold: float = DEFAULT_PARITY_THRESHOLD,
) -> dict[str, Any]:
    failed_checks: list[str] = []

    if float(coverage_ratio) < float(coverage_threshold):
        failed_checks.append("coverage_below_threshold")
    if not bool(smoke_passed):
        failed_checks.append("smoke_failed")
    if float(parity_ratio) < float(parity_threshold):
        failed_checks.append("parity_below_threshold")
    if int(reconciliation_drift_count) > 0:
        failed_checks.append("reconciliation_drift")

    return {
        "gate": READINESS_GATE_NAME,
        "passed": len(failed_checks) == 0,
        "coverage_ratio": float(coverage_ratio),
        "coverage_threshold": float(coverage_threshold),
        "smoke_passed": bool(smoke_passed),
        "parity_ratio": float(parity_ratio),
        "parity_threshold": float(parity_threshold),
        "reconciliation_drift_count": int(reconciliation_drift_count),
        "failed_checks": failed_checks,
    }


async def evaluate_server_vectorize_readiness(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    target_index: str,
    smoke_passed: bool,
) -> dict[str, Any]:
    """Measure cutover evidence from canonical SQL and the projection registry.

    A backfill campaign only proves that index jobs were enqueued. This check
    waits for the canonical library snapshot to have an acknowledged,
    non-failed Vectorize projection for every eligible item before allowing an
    automatic read switch. It never reads legacy vector payloads.
    """
    resolved_tenant = _normalize_tenant_id(tenant_id)
    index_name = str(target_index or "").strip()
    state = await get_or_create_switch_state(db, tenant_id=resolved_tenant)

    campaign_row = None
    if state.campaign_id is not None:
        campaign_row = await db.scalar(
            select(LibraryBackfillCampaign).where(
                LibraryBackfillCampaign.id == state.campaign_id,
                LibraryBackfillCampaign.domain == "library",
                LibraryBackfillCampaign.tenant_id == resolved_tenant,
            )
        )

    source_predicates = [
        LibraryItem.deleted_at.is_(None),
        LibraryItem.status.in_(LIBRARY_ELIGIBLE_ITEM_STATUSES),
        LibraryItem.source != LIBRARY_GALLERY_SOURCE,
    ]
    if resolved_tenant is not None:
        source_predicates.append(LibraryItem.tenant_id == resolved_tenant)

    source_high_water_mark = None
    if campaign_row is not None:
        checkpoint = dict(campaign_row.checkpoint_json or {})
        raw_high_water_mark = checkpoint.get("source_high_water_mark")
        if raw_high_water_mark is not None:
            source_high_water_mark = int(raw_high_water_mark)
            source_predicates.append(LibraryItem.id <= source_high_water_mark)

    expected_rows = (
        await db.execute(
            select(LibraryItem.id).where(and_(*source_predicates)).order_by(LibraryItem.id.asc())
        )
    ).all()
    expected_entity_ids = [f"library:{int(row.id)}" for row in expected_rows]
    expected_source_ids = {entity_id.split(":", 1)[1] for entity_id in expected_entity_ids}

    registry_rows = (
        await db.execute(
            select(
                VectorIndexRecord.source_id,
                VectorIndexRecord.chunk_id,
                VectorIndexRecord.status,
                VectorIndexRecord.updated_at,
            )
            .where(
                VectorIndexRecord.vector_index == index_name,
                VectorIndexRecord.source_family == "library_chunks",
                *([VectorIndexRecord.tenant_id == resolved_tenant] if resolved_tenant else []),
                *(
                    [VectorIndexRecord.updated_at >= campaign_row.started_at]
                    if campaign_row is not None and campaign_row.started_at is not None
                    else []
                ),
            )
            .order_by(VectorIndexRecord.updated_at.desc())
        )
    ).all()

    # Keep the newest projection state per source/chunk. Older model/revision
    # rows are retained as audit evidence but must not satisfy coverage.
    latest_by_chunk: dict[tuple[str, str], str] = {}
    for row in registry_rows:
        source_id = str(row.source_id or "")
        if not source_id:
            continue
        chunk_id = str(row.chunk_id or "")
        latest_by_chunk.setdefault((source_id, chunk_id), str(row.status or ""))

    source_statuses: dict[str, set[str]] = {}
    for (source_id, _chunk_id), row_status in latest_by_chunk.items():
        source_statuses.setdefault(source_id, set()).add(row_status)

    indexed_source_ids = {
        source_id
        for source_id, statuses in source_statuses.items()
        if source_id in expected_source_ids
        and "indexed" in statuses
        and not statuses.intersection({"queued", "indexing", "failed"})
    }
    failed_source_ids = sorted(
        source_id
        for source_id, statuses in source_statuses.items()
        if source_id in expected_source_ids and "failed" in statuses
    )
    pending_source_ids = sorted(
        source_id
        for source_id, statuses in source_statuses.items()
        if source_id in expected_source_ids
        and statuses.intersection({"queued", "indexing"})
    )
    actual_entity_ids = [f"library:{source_id}" for source_id in sorted(indexed_source_ids)]
    reconciliation = detect_reconciliation_drift(
        expected_entity_ids=expected_entity_ids,
        actual_entity_ids=actual_entity_ids,
    )

    source_count = len(expected_source_ids)
    indexed_count = len(indexed_source_ids)
    projection_ratio = float(indexed_count) / float(source_count) if source_count else 1.0
    gate = evaluate_cutover_readiness(
        coverage_ratio=projection_ratio,
        smoke_passed=smoke_passed,
        parity_ratio=projection_ratio,
        reconciliation_drift_count=int(reconciliation["drift_count"]),
    )
    failed_checks = list(gate["failed_checks"])
    if campaign_row is None:
        failed_checks.append("campaign_prerequisite_incomplete")
    elif str(campaign_row.status or "").strip().lower() != "completed":
        failed_checks.append("campaign_not_completed")
    if campaign_row is not None and int(campaign_row.failed_count or 0) > 0:
        failed_checks.append("campaign_enqueue_failures")
    if failed_source_ids:
        failed_checks.append("projection_failures")
    if pending_source_ids:
        failed_checks.append("projection_pending")
    gate["failed_checks"] = sorted(set(failed_checks))
    gate["passed"] = len(gate["failed_checks"]) == 0
    gate["server_evidence"] = {
        "source_count": source_count,
        "indexed_count": indexed_count,
        "pending_count": len(pending_source_ids),
        "failed_count": len(failed_source_ids),
        "source_high_water_mark": source_high_water_mark,
        "failed_source_ids": failed_source_ids[:50],
        "pending_source_ids": pending_source_ids[:50],
        "expected_entity_count": len(expected_entity_ids),
        "actual_indexed_entity_count": len(actual_entity_ids),
        "target_index": index_name,
    }
    return {
        "passed": bool(gate["passed"]),
        "coverage_ratio": projection_ratio,
        "parity_ratio": projection_ratio,
        "smoke_passed": bool(smoke_passed),
        "reconciliation_report": reconciliation,
        "gate": gate,
    }


async def maybe_auto_promote_vectorize_cutover(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    target_index: str,
    smoke_passed: bool,
) -> dict[str, Any]:
    """Promote immediately when server-measured Vectorize gates are complete."""
    resolved_tenant = _normalize_tenant_id(tenant_id)
    state = await get_or_create_switch_state(db, tenant_id=resolved_tenant)
    if (
        state.status not in ACTIVE_CUTOVER_STATUSES
        or str(state.target_provider or "").strip().lower() != "cloudflare_vectorize"
    ):
        return {
            "cutover_applied": False,
            "automatic": True,
            "current_read_provider": state.current_read_provider,
            "failed_checks": ["cutover_not_ready_for_auto_promotion"],
        }

    evidence = await evaluate_server_vectorize_readiness(
        db,
        tenant_id=resolved_tenant,
        target_index=target_index,
        smoke_passed=smoke_passed,
    )
    if not evidence["passed"]:
        return {
            "cutover_applied": False,
            "automatic": True,
            "current_read_provider": state.current_read_provider,
            "failed_checks": evidence["gate"]["failed_checks"],
            "gate": evidence["gate"],
        }

    result = await approve_read_cutover(
        db,
        tenant_id=resolved_tenant,
        coverage_ratio=float(evidence["coverage_ratio"]),
        smoke_passed=bool(evidence["smoke_passed"]),
        parity_ratio=float(evidence["parity_ratio"]),
        reconciliation_report=evidence["reconciliation_report"],
        server_evidence=evidence["gate"].get("server_evidence"),
        expected_version=int(state.switch_version),
    )
    return {
        **result,
        "automatic": True,
        "server_evidence": evidence["gate"].get("server_evidence", {}),
    }


def evaluate_either_rollback_trigger(
    *,
    indexing_failure_rate: float,
    search_latency_factor: float,
    search_regression_detected: bool = False,
    failure_rate_threshold: float = DEFAULT_FAILURE_RATE_THRESHOLD,
    latency_regression_threshold: float = DEFAULT_LATENCY_REGRESSION_THRESHOLD,
) -> dict[str, Any]:
    failed_triggers: list[str] = []
    if float(indexing_failure_rate) >= float(failure_rate_threshold):
        failed_triggers.append("indexing_failure_rate_breach")

    search_regression = bool(search_regression_detected) or (
        float(search_latency_factor) >= float(latency_regression_threshold)
    )
    if search_regression:
        failed_triggers.append("search_regression")

    return {
        "triggered": len(failed_triggers) > 0,
        "failed_triggers": failed_triggers,
        "indexing_failure_rate": float(indexing_failure_rate),
        "failure_rate_threshold": float(failure_rate_threshold),
        "search_latency_factor": float(search_latency_factor),
        "latency_regression_threshold": float(latency_regression_threshold),
        "search_regression_detected": bool(search_regression_detected),
    }


async def request_provider_cutover(
    db: AsyncSession,
    *,
    target_provider: str,
    tenant_id: str | int | None = None,
    campaign_id: int | None = None,
    campaign_completed: bool = False,
    connectivity_ok: bool = False,
    expected_version: int | None = None,
) -> LibraryProviderSwitchState:
    resolved_tenant = _normalize_tenant_id(tenant_id)
    resolved_target = _normalize_provider(target_provider)
    state = await get_or_create_switch_state(db, tenant_id=resolved_tenant)
    await _assert_version(state, expected_version=expected_version)

    if not connectivity_ok:
        raise RuntimeError("target_connectivity_check_failed")
    if not campaign_completed:
        raise RuntimeError("campaign_prerequisite_incomplete")
    if resolved_target == state.current_read_provider:
        raise RuntimeError("target_matches_current_read_provider")

    state = await _apply_state_update(
        db,
        state=state,
        values={
            "previous_read_provider": state.current_read_provider,
            "target_provider": resolved_target,
            "campaign_id": campaign_id,
            "campaign_status": "ready_for_cutover",
            "status": "active",
            "readiness_gate": READINESS_GATE_NAME,
            "freeze_non_emergency_edits": True,
            "mirror_writes": True,
            "started_at": datetime.utcnow(),
            "completed_at": None,
        },
    )

    emit_metric(
        "library.cutover.requested_total",
        tenant_id=resolved_tenant,
        target_provider=resolved_target,
    )
    log_observability_event(
        "library_cutover_requested",
        tenant_id=resolved_tenant,
        current_read_provider=state.current_read_provider,
        target_provider=state.target_provider,
        campaign_id=campaign_id,
        switch_version=state.switch_version,
    )
    _safe_record_switch_audit_event(
        operation="switch",
        outcome="success",
        tenant_id=resolved_tenant,
        provider=state.target_provider or state.current_read_provider,
        correlation_id=f"library-cutover:{state.id}:{state.switch_version}",
        domain="library",
        entity_id=None,
        details={
            "status": state.status,
            "campaign_status": state.campaign_status,
            "current_read_provider": state.current_read_provider,
            "target_provider": state.target_provider,
            "switch_version": state.switch_version,
        },
    )

    return state


async def approve_read_cutover(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    coverage_ratio: float,
    smoke_passed: bool,
    parity_ratio: float,
    reconciliation_report: dict[str, Any] | None = None,
    server_evidence: dict[str, Any] | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    resolved_tenant = _normalize_tenant_id(tenant_id)
    state = await get_or_create_switch_state(db, tenant_id=resolved_tenant)
    await _assert_version(state, expected_version=expected_version)

    if state.status not in ACTIVE_CUTOVER_STATUSES:
        raise RuntimeError(f"cutover_not_active:{state.status}")

    reconciliation = dict(reconciliation_report or {})
    drift_count = int(reconciliation.get("drift_count") or 0)
    gate = evaluate_cutover_readiness(
        coverage_ratio=coverage_ratio,
        smoke_passed=smoke_passed,
        parity_ratio=parity_ratio,
        reconciliation_drift_count=drift_count,
    )
    if server_evidence:
        gate["server_evidence"] = dict(server_evidence)

    update_values: dict[str, Any] = {
        "readiness_json": gate,
        "reconciliation_json": reconciliation,
    }
    if gate["passed"] and state.target_provider:
        update_values.update(
            {
                "current_read_provider": str(state.target_provider),
                "status": "cutover_complete",
                "campaign_status": "completed",
                "freeze_non_emergency_edits": False,
                "mirror_writes": False,
                "completed_at": datetime.utcnow(),
            }
        )
        cutover_applied = True
        emit_metric("library.cutover.completed_total", tenant_id=resolved_tenant)
    else:
        update_values.update(
            {
                "status": "ready_for_cutover",
                "campaign_status": "ready_check_failed",
            }
        )
        cutover_applied = False
        emit_metric("library.cutover.gate_failed_total", tenant_id=resolved_tenant)
    state = await _apply_state_update(db, state=state, values=update_values)

    log_observability_event(
        "library_cutover_gate_evaluated",
        tenant_id=resolved_tenant,
        gate=READINESS_GATE_NAME,
        cutover_applied=cutover_applied,
        failed_checks=gate["failed_checks"],
        current_read_provider=state.current_read_provider,
        target_provider=state.target_provider,
        switch_version=state.switch_version,
    )
    _safe_record_switch_audit_event(
        operation="switch",
        outcome="success" if cutover_applied else "skipped",
        tenant_id=resolved_tenant,
        provider=state.current_read_provider,
        correlation_id=f"library-cutover:{state.id}:{state.switch_version}",
        domain="library",
        entity_id=None,
        details={
            "cutover_applied": cutover_applied,
            "failed_checks": gate["failed_checks"],
            "current_read_provider": state.current_read_provider,
            "target_provider": state.target_provider,
            "switch_version": state.switch_version,
        },
    )

    return {
        "cutover_applied": cutover_applied,
        "current_read_provider": state.current_read_provider,
        "target_provider": state.target_provider,
        "mirror_writes": bool(state.mirror_writes),
        "failed_checks": gate["failed_checks"],
        "gate": gate,
    }


async def apply_either_trigger_rollback(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    indexing_failure_rate: float,
    search_latency_factor: float,
    search_regression_detected: bool = False,
    expected_version: int | None = None,
) -> dict[str, Any]:
    resolved_tenant = _normalize_tenant_id(tenant_id)
    state = await get_or_create_switch_state(db, tenant_id=resolved_tenant)
    await _assert_version(state, expected_version=expected_version)

    trigger = evaluate_either_rollback_trigger(
        indexing_failure_rate=indexing_failure_rate,
        search_latency_factor=search_latency_factor,
        search_regression_detected=search_regression_detected,
    )
    if not trigger["triggered"]:
        return {
            "rollback_applied": False,
            "status": state.status,
            "current_read_provider": state.current_read_provider,
            "failed_triggers": [],
        }

    stable_provider = state.previous_read_provider or DEFAULT_READ_PROVIDER
    state = await _apply_state_update(
        db,
        state=state,
        values={
            "current_read_provider": stable_provider,
            "target_provider": stable_provider,
            "status": "rolled_back",
            "campaign_status": "rolled_back",
            "freeze_non_emergency_edits": False,
            "mirror_writes": False,
            "last_rollback_reason": ",".join(trigger["failed_triggers"]),
            "completed_at": datetime.utcnow(),
        },
    )

    emit_metric(
        "library.cutover.rollback_total",
        tenant_id=resolved_tenant,
        reasons=state.last_rollback_reason,
    )
    log_observability_event(
        "library_cutover_rolled_back",
        tenant_id=resolved_tenant,
        current_read_provider=state.current_read_provider,
        failed_triggers=trigger["failed_triggers"],
        switch_version=state.switch_version,
    )
    _safe_record_switch_audit_event(
        operation="switch",
        outcome="failure",
        tenant_id=resolved_tenant,
        provider=state.current_read_provider,
        correlation_id=f"library-cutover:{state.id}:{state.switch_version}",
        domain="library",
        entity_id=None,
        details={
            "rollback_applied": True,
            "failed_triggers": trigger["failed_triggers"],
            "status": state.status,
            "switch_version": state.switch_version,
        },
    )

    return {
        "rollback_applied": True,
        "status": state.status,
        "current_read_provider": state.current_read_provider,
        "failed_triggers": trigger["failed_triggers"],
    }
