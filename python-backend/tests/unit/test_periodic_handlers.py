"""Tests for the active worker_jobs scheduled-work monitoring surface.

The legacy Cloud Scheduler ``/tasks/*`` handlers are intentionally not
mounted. Scheduled work is owned by Cloudflare consumers and the canonical
``worker_jobs`` ledger; this module protects that boundary and the current
read-only monitoring routes from accidental removal.
"""

import ast
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.api import scheduled_jobs


ACTIVE_SCHEDULED_JOB_ROUTES = {
    ("/api/v1/scheduled-jobs/schedule", "GET"),
    ("/api/v1/scheduled-jobs/runs", "GET"),
    ("/api/v1/scheduled-jobs/stats", "GET"),
}


def _registered_route_methods(app: FastAPI) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None) or set()
        if path:
            routes.update((path, method) for method in methods)
    return routes


@pytest.mark.unit
def test_legacy_cloud_scheduler_handlers_remain_unmounted() -> None:
    main_path = Path(__file__).resolve().parents[2] / "app" / "main.py"
    main_module = ast.parse(main_path.read_text())
    mounted_routers = {
        ast.unparse(call.args[0])
        for call in ast.walk(main_module)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "include_router"
        and call.args
    }

    assert "scheduled_jobs.router" in mounted_routers
    assert "task_handlers.router" not in mounted_routers
    assert "former provider-specific task-handler router is intentionally not" in main_path.read_text()


@pytest.mark.unit
def test_worker_jobs_scheduled_work_monitoring_routes_are_registered() -> None:
    isolated_app = FastAPI()
    isolated_app.include_router(scheduled_jobs.router)

    assert ACTIVE_SCHEDULED_JOB_ROUTES <= _registered_route_methods(isolated_app)
