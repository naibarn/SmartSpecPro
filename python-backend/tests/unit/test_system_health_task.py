from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.tasks.system_health_task import _get_service_status

pytestmark = [pytest.mark.unit]


class _ProbeResponse:
    def __init__(self, status: int) -> None:
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_get_service_status_falls_back_to_http_probe(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("WEB_APP_URL", "http://host.docker.internal:3000")
    monkeypatch.setattr(
        "app.tasks.system_health_task.subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout="unknown\n"),
    )
    monkeypatch.setattr(
        "app.tasks.system_health_task.urllib_request.urlopen",
        lambda *args, **kwargs: _ProbeResponse(200),
    )

    assert _get_service_status("web", "smartspec-web.service") == "active"
