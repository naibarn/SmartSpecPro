"""Read-only, idempotent Agency Swarm migration helpers.

This module intentionally has no execution or deletion capability. It produces
stable checksums for an export record so a later migration worker can reconcile
historical runs without re-running paid work.
"""

from __future__ import annotations

from typing import Any

from app.services.agent_output_assurance import canonical_json, sha256_hex


def build_read_only_export(*, tenant_id: str, agency_id: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(records, key=lambda item: str(item.get("id", "")))
    payload = {"tenantId": tenant_id, "agencyId": agency_id, "records": ordered}
    return {"tenantId": tenant_id, "agencyId": agency_id, "records": ordered, "checksum": sha256_hex(payload), "readOnly": True}


def reconcile_export(*, source_checksum: str, exported: dict[str, Any], credit_outcomes_reconciled: bool) -> dict[str, Any]:
    if exported.get("readOnly") is not True:
        return {"state": "migration_required", "reason": "export_not_read_only"}
    if exported.get("checksum") != source_checksum or not credit_outcomes_reconciled:
        return {"state": "parity_review", "reason": "checksum_or_credit_mismatch"}
    return {"state": "read_only_archived", "reason": "parity_verified"}
