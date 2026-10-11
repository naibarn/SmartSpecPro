"""Exposure boundary for the retired Cloud Tasks OIDC route surface."""


def test_legacy_cloud_tasks_routes_are_not_registered_in_the_application():
    """Removed /tasks endpoints must not be accidentally exposed by the app."""
    from app.main import app

    paths = app.openapi().get("paths", {})
    task_paths = [path for path in paths if path == "/tasks" or path.startswith("/tasks/")]

    assert task_paths == []
