"""Unit tests for docker_command_bridge helpers."""

from app.integrations.opensandbox.docker_command_bridge import _exec_command_sync


class _FakeAPI:
    def __init__(self, exit_code):
        self._exit_code = exit_code

    def exec_create(self, **kwargs):
        return {"Id": "exec-1"}

    def exec_start(self, exec_id, demux=True, tty=False):  # noqa: ARG002
        return (b"ok\n", b"")

    def exec_inspect(self, exec_id):  # noqa: ARG002
        return {"ExitCode": self._exit_code}


class _FakeContainer:
    id = "container-1"


class _FakeContainers:
    def get(self, name):  # noqa: ARG002
        return _FakeContainer()


class _FakeClient:
    def __init__(self, exit_code):
        self.api = _FakeAPI(exit_code)
        self.containers = _FakeContainers()


def test_exec_command_preserves_zero_exit_code(monkeypatch):
    monkeypatch.setattr(
        "app.integrations.opensandbox.docker_command_bridge._docker_client",
        lambda: _FakeClient(exit_code=0),
    )
    result = _exec_command_sync("sandbox-1", "echo ok")
    assert result.exit_code == 0
    assert "ok" in result.stdout


def test_exec_command_defaults_to_nonzero_when_missing_exit_code(monkeypatch):
    monkeypatch.setattr(
        "app.integrations.opensandbox.docker_command_bridge._docker_client",
        lambda: _FakeClient(exit_code=None),
    )
    result = _exec_command_sync("sandbox-1", "echo ok")
    assert result.exit_code == 1
