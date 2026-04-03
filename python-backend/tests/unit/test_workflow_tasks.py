from sqlalchemy.dialects import postgresql

from app.tasks.workflow_tasks import _active_workflow_clause


def test_active_workflow_clause_casts_status_to_string():
    compiled = str(
        _active_workflow_clause().compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "CAST(" in compiled
    assert "workflows.status" in compiled
    assert "::VARCHAR" in compiled or " AS VARCHAR" in compiled
    assert "= 'active'" in compiled
