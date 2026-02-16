"""Provider switch-state orchestration for staged cutover and rollback."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.library import LibraryProviderSwitchState
from app.services.library_observability import emit_metric, log_observability_event

DEFAULT_READ_PROVIDER = "cloudflare_vectorize"
SUPPORTED_PROVIDERS = ("cloudflare_vectorize", "pgvector", "chromadb")
READINESS_GATE_NAME = "coverage_95_plus_smoke"

ACTIVE_CUTOVER_STATUSES = {"active", "ready_for_cutover"}

DEFAULT_COVERAGE_THRESHOLD = 0.95
DEFAULT_PARITY_THRESHOLD = 0.95
DEFAULT_FAILURE_RATE_THRESHOLD = 0.05
DEFAULT_LATENCY_REGRESSION_THRESHOLD = 1.5


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

    return state


async def approve_read_cutover(
    db: AsyncSession,
    *,
    tenant_id: str | int | None = None,
    coverage_ratio: float,
    smoke_passed: bool,
    parity_ratio: float,
    reconciliation_report: dict[str, Any] | None = None,
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

    return {
        "rollback_applied": True,
        "status": state.status,
        "current_read_provider": state.current_read_provider,
        "failed_triggers": trigger["failed_triggers"],
    }
