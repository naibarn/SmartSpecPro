from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def test_vector_maintenance_schedulers_use_the_canonical_dispatch_boundary():
    admin_source = (REPO_ROOT / "python-backend/app/api/admin.py").read_text()
    backfill_source = (
        REPO_ROOT / "python-backend/app/tasks/vector_db_backfill_tasks.py"
    ).read_text()

    assert "run_vector_db_backfill_campaign.delay(" not in admin_source
    assert "retry_library_index_jobs.delay(" not in admin_source
    assert "run_vector_db_backfill_campaign.apply_async(" not in backfill_source
    assert admin_source.count("dispatch_python_task(") >= 2
    assert "dispatch_python_task(" in backfill_source
