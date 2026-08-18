from app.services.agency_migration_export import build_read_only_export, reconcile_export


def test_export_is_stable_read_only_and_reconciles_idempotently():
    first = build_read_only_export(tenant_id="tenant", agency_id="agency", records=[{"id": "2"}, {"id": "1"}])
    second = build_read_only_export(tenant_id="tenant", agency_id="agency", records=[{"id": "1"}, {"id": "2"}])
    assert first["checksum"] == second["checksum"]
    assert first["readOnly"] is True
    assert reconcile_export(source_checksum=first["checksum"], exported=first, credit_outcomes_reconciled=True)["state"] == "read_only_archived"
