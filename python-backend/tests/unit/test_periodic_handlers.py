"""Tests for the active worker_jobs scheduled-work monitoring surface.

The legacy Cloud Scheduler ``/tasks/*`` handlers are intentionally not
mounted. Scheduled work is owned by Cloudflare consumers and the canonical
``worker_jobs`` ledger; this module protects that boundary and the current
read-only monitoring routes from accidental removal.
"""

import ast
from pathlib import Path

import pytest


ACTIVE_SCHEDULED_JOB_ROUTES = {
    ("/api/v1/scheduled-jobs/schedule", "GET"),
    ("/api/v1/scheduled-jobs/runs", "GET"),
    ("/api/v1/scheduled-jobs/stats", "GET"),
}


def _main_module_path() -> Path:
    return Path(__file__).resolve().parents[2] / "app" / "main.py"


def _mounted_routers() -> set[str]:
    module = ast.parse(_main_module_path().read_text())
    return {
        ast.unparse(call.args[0])
        for call in ast.walk(module)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Attribute)
        and call.func.attr == "include_router"
        and call.args
    }


def _scheduled_job_route_methods() -> set[tuple[str, str]]:
    module_path = (
        Path(__file__).resolve().parents[2]
        / "app"
        / "api"
        / "scheduled_jobs.py"
    )
    module = ast.parse(module_path.read_text())
    prefix = next(
        ast.literal_eval(keyword.value)
        for node in module.body
        if isinstance(node, ast.Assign)
        and any(
            isinstance(target, ast.Name) and target.id == "router"
            for target in node.targets
        )
        for keyword in node.value.keywords
        if keyword.arg == "prefix"
    )
    routes: set[tuple[str, str]] = set()
    for node in module.body:
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        for decorator in node.decorator_list:
            if (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "router"
                and decorator.func.attr == "get"
            ):
                routes.add((prefix + ast.literal_eval(decorator.args[0]), "GET"))
    return routes


@pytest.mark.unit
def test_legacy_cloud_scheduler_handlers_remain_unmounted() -> None:
    main_path = _main_module_path()
    mounted_routers = _mounted_routers()

    assert "scheduled_jobs.router" in mounted_routers
    assert "task_handlers.router" not in mounted_routers
    assert (
        "former provider-specific task-handler router is intentionally not"
        in main_path.read_text()
    )


@pytest.mark.unit
def test_worker_jobs_scheduled_work_monitoring_routes_are_registered() -> None:
    assert ACTIVE_SCHEDULED_JOB_ROUTES <= _scheduled_job_route_methods()
