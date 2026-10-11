"""Schema boundary checks for retired workflow-engine persistence."""


def test_retired_workflow_engine_tables_are_not_registered():
    """Legacy workflow-engine tables must not enter the active ORM schema."""
    from app.core.database import Base
    import app.models  # noqa: F401

    retired_tables = {
        "workflow_executions",
        "workflow_dead_letter_queue",
        "workflow_audit_events",
        "workflow_secrets",
        "workflow_policy_rules",
        "workflow_cache_metadata",
    }

    assert retired_tables.isdisjoint(Base.metadata.tables)
