"""The retired custom workflow API must stay out of the application."""

from app.main import app


def test_retired_workflow_api_is_not_registered() -> None:
    workflow_paths = {
        path
        for path in app.openapi()["paths"]
        if path == "/api/v1/workflows" or path.startswith("/api/v1/workflows/")
    }

    assert workflow_paths == set()
