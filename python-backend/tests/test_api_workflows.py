"""The retired custom workflow API must stay out of the application."""

from fastapi.routing import APIRoute

from app.main import app


def test_retired_workflow_api_is_not_registered() -> None:
    workflow_paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
        and (route.path == "/api/v1/workflows" or route.path.startswith("/api/v1/workflows/"))
    }

    assert workflow_paths == set()
