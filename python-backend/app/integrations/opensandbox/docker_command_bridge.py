"""Docker-backed command/file bridge for lifecycle-only OpenSandbox servers.

This module enables command and file operations against sandbox containers when
the OpenSandbox control plane does not expose legacy `/commands` and `/files`
REST endpoints.
"""

from __future__ import annotations

import asyncio
import io
import os
import shlex
import tarfile
from typing import Optional

import docker

from .models import CommandResult


class DockerSandboxBridgeError(RuntimeError):
    """Raised when docker bridge operations fail."""


def is_lifecycle_only_error(exc: Exception) -> bool:
    """Return True when OpenSandbox server reports lifecycle-only APIs."""
    return "lifecycle APIs only" in str(exc)


def _sandbox_container_name(sandbox_id: str) -> str:
    return f"sandbox-{sandbox_id}"


def _docker_client() -> docker.DockerClient:
    try:
        return docker.from_env()
    except Exception as exc:  # pragma: no cover - runtime environment dependent
        raise DockerSandboxBridgeError(f"Failed to initialize docker client: {exc}") from exc


def _get_container_id(client: docker.DockerClient, sandbox_id: str) -> str:
    container_name = _sandbox_container_name(sandbox_id)
    try:
        container = client.containers.get(container_name)
    except Exception as exc:  # pragma: no cover - runtime environment dependent
        raise DockerSandboxBridgeError(
            f"Sandbox container not found for id {sandbox_id} (name={container_name}): {exc}"
        ) from exc
    return container.id


def _exec_command_sync(sandbox_id: str, command: str) -> CommandResult:
    client = _docker_client()
    container_id = _get_container_id(client, sandbox_id)

    exec_id = client.api.exec_create(
        container=container_id,
        cmd=["/bin/sh", "-lc", command],
        stdout=True,
        stderr=True,
        tty=False,
        workdir="/",
    )["Id"]
    stdout_bytes, stderr_bytes = client.api.exec_start(exec_id, demux=True, tty=False)  # type: ignore[misc]
    inspect = client.api.exec_inspect(exec_id)
    exit_code_raw = inspect.get("ExitCode")
    exit_code = int(exit_code_raw) if exit_code_raw is not None else 1

    return CommandResult(
        exit_code=exit_code,
        stdout=(stdout_bytes or b"").decode("utf-8", errors="replace"),
        stderr=(stderr_bytes or b"").decode("utf-8", errors="replace"),
    )


async def run_command_via_docker_bridge(
    sandbox_id: str,
    command: str,
    timeout_seconds: int = 30,
) -> CommandResult:
    """Execute command in sandbox container via docker exec.

    Timeout is enforced on the bridge call. If timeout elapses, the call fails
    with a timeout-like CommandResult.
    """
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(_exec_command_sync, sandbox_id, command),
            timeout=max(timeout_seconds, 1),
        )
    except asyncio.TimeoutError:
        return CommandResult(
            exit_code=124,
            stdout="",
            stderr="Command timed out in docker bridge execution mode",
        )
    except DockerSandboxBridgeError as exc:
        return CommandResult(exit_code=1, stdout="", stderr=str(exc))


def _make_single_file_tar(filename: str, content: bytes, mode: int = 0o644) -> bytes:
    fileobj = io.BytesIO()
    with tarfile.open(fileobj=fileobj, mode="w") as tar:
        info = tarfile.TarInfo(name=filename)
        info.size = len(content)
        info.mode = mode
        tar.addfile(info, io.BytesIO(content))
    fileobj.seek(0)
    return fileobj.read()


def _write_file_sync(sandbox_id: str, path: str, content: bytes) -> None:
    client = _docker_client()
    container_id = _get_container_id(client, sandbox_id)
    dirname = os.path.dirname(path) or "/"
    filename = os.path.basename(path)
    if not filename:
        raise DockerSandboxBridgeError(f"Invalid target file path: {path}")

    # Ensure destination directory exists.
    mkdir_exec_id = client.api.exec_create(
        container=container_id,
        cmd=["/bin/sh", "-lc", f"mkdir -p {shlex.quote(dirname)}"],
        stdout=True,
        stderr=True,
        tty=False,
        workdir="/",
    )["Id"]
    client.api.exec_start(mkdir_exec_id, demux=True, tty=False)

    archive = _make_single_file_tar(filename, content)
    ok = client.api.put_archive(container=container_id, path=dirname, data=archive)
    if not ok:
        raise DockerSandboxBridgeError(f"Failed to write file to sandbox: {path}")


async def write_file_via_docker_bridge(sandbox_id: str, path: str, content: bytes) -> None:
    await asyncio.to_thread(_write_file_sync, sandbox_id, path, content)


def _read_file_sync(sandbox_id: str, path: str) -> bytes:
    client = _docker_client()
    container_id = _get_container_id(client, sandbox_id)

    try:
        tar_stream, _ = client.api.get_archive(container=container_id, path=path)
    except Exception as exc:  # pragma: no cover - runtime environment dependent
        raise DockerSandboxBridgeError(f"Failed to read file from sandbox: {path}: {exc}") from exc

    tar_bytes = b"".join(tar_stream)
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:*") as tar:
        members = [m for m in tar.getmembers() if m.isfile()]
        if not members:
            raise DockerSandboxBridgeError(f"No file content in archive for path: {path}")
        file_member = members[0]
        extracted = tar.extractfile(file_member)
        if extracted is None:
            raise DockerSandboxBridgeError(f"Failed to extract file for path: {path}")
        return extracted.read()


async def read_file_via_docker_bridge(sandbox_id: str, path: str) -> bytes:
    return await asyncio.to_thread(_read_file_sync, sandbox_id, path)
