"""Tests for the active worker_jobs scheduled-work monitoring surface.

The legacy Cloud Scheduler ``/tasks/*`` handlers are intentionally not
mounted. Scheduled work is owned by Cloudflare consumers and the canonical
``worker_jobs`` ledger; this module protects that boundary and the current
read-only monitoring routes from accidental removal.
"""

import pytest

from app.main import app


RETIRED_PERIODIC_HANDLER_PATHS = {
    "/tasks/cleanup-expired",
    "/tasks/retry-failed",
    "/tasks/retry-callbacks",
    "/tasks/recover-stuck",
    "/tasks/check-workflows",
    "/tasks/cleanup-sessions",
    "/tasks/renew-drive-channels",
    "/tasks/poll-drive-changes",
    "/tasks/process-dead-letters",
    "/tasks/cleanup-redis-stale",
    "/tasks/deliver-scheduled-fallback",
}

ACTIVE_SCHEDULED_JOB_ROUTES = {
    ("/api/v1/scheduled-jobs/schedule", "GET"),
    ("/api/v1/scheduled-jobs/runs", "GET"),
    ("/api/v1/scheduled-jobs/stats", "GET"),
}


def _registered_route_methods() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None) or set()
        if path:
            routes.update((path, method) for method in methods)
    return routes


@pytest.mark.unit
def test_legacy_cloud_scheduler_handlers_remain_unmounted() -> None:
    registered_paths = {path for path, _method in _registered_route_methods()}

    assert RETIRED_PERIODIC_HANDLER_PATHS.isdisjoint(registered_paths)


@pytest.mark.unit
def test_worker_jobs_scheduled_work_monitoring_routes_are_registered() -> None:
    assert ACTIVE_SCHEDULED_JOB_ROUTES <= _registered_route_methods()
