"""Retired custom workflow APIs must stay out of the application."""

from app.main import app


def test_retired_custom_workflow_apis_are_not_registered() -> None:
    paths = set(app.openapi()["paths"])
    retired_prefixes = (
        "/api/v1/workflows",
        "/api/v1/workflow",
        "/api/workflows",
    )

    registered_legacy_paths = {
        path
        for path in paths
        if any(path == prefix or path.startswith(f"{prefix}/") for prefix in retired_prefixes)
    }

    assert registered_legacy_paths == set()
