#!/usr/bin/env python3
"""Run a command against a task-owned, loopback-only SPEC-224 PostgreSQL DB.

The database is never published on a host port or attached to an external
Docker network. A host proxy binds only to 127.0.0.1 so the existing strict
integration-test guards can independently verify the exact disposable target.
"""

from __future__ import annotations

import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path


IMAGE = "pgvector/pgvector:pg15@sha256:7f5681e45237acdf546cf7cdc0dfc0ed7752ede857fda6e54f6ea21b936f8742"
WORKUNIT = "spec224-safe-postgres-admission"
DATABASE = "spec224_d385_test"
RUNTIME_ROLE = "spec224_d385_runtime"
BOOTSTRAP_ROLE = "spec224_bootstrap"


def run(args: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE if capture else subprocess.DEVNULL,
        timeout=30,
    )
    return result.stdout.strip() if capture else ""


def choose_port() -> int:
    for _ in range(128):
        port = 55401 + secrets.randbelow(599)
        if port == 55493:
            continue
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
        return port
    raise RuntimeError("SPEC224_TEST_POSTGRES_PORT_UNAVAILABLE")


def write_proxy(path: Path) -> None:
    path.write_text(
        """#!/usr/bin/env python3
import select
import socket
import socketserver
import sys

port, target = int(sys.argv[1]), sys.argv[2]

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            with socket.create_connection((target, 5432), timeout=10) as upstream:
                self.request.settimeout(None)
                upstream.settimeout(None)
                peers = [self.request, upstream]
                while True:
                    readable, _, exceptional = select.select(peers, [], peers)
                    if exceptional:
                        return
                    for source in readable:
                        data = source.recv(65536)
                        if not data:
                            return
                        destination = upstream if source is self.request else self.request
                        destination.sendall(data)
        except OSError:
            return

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(("127.0.0.1", port), Handler) as server:
    server.serve_forever(poll_interval=0.2)
""",
        encoding="utf-8",
    )
    path.chmod(0o700)


def wait_for_postgres(container: str) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["docker", "exec", container, "pg_isready", "-U", BOOTSTRAP_ROLE, "-d", "postgres"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        if result.returncode == 0:
            return
        state = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", container],
            text=True,
            capture_output=True,
            timeout=5,
        )
        if state.returncode != 0 or state.stdout.strip() != "true":
            raise RuntimeError("SPEC224_TEST_POSTGRES_CONTAINER_EXITED")
        time.sleep(1)
    raise RuntimeError("SPEC224_TEST_POSTGRES_START_TIMEOUT")


def main() -> int:
    command = sys.argv[1:]
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        print("usage: run_disposable_postgres.py -- <command> [args...]", file=sys.stderr)
        return 2
    if shutil.which("docker") is None:
        raise RuntimeError("SPEC224_TEST_POSTGRES_DOCKER_REQUIRED")
    run_id = secrets.token_hex(4)
    root = Path(f"/tmp/codex-spec224-safe-postgres-{run_id}")
    data = root / "pgdata"
    proxy_path = root / "pg_proxy.py"
    container = f"codex-spec224-safe-pg-{run_id}"
    network = f"codex-spec224-safe-net-{run_id}"
    port = choose_port()
    created_network = False
    created_container = False
    proxy: subprocess.Popen[bytes] | None = None
    failed = True
    try:
        root.mkdir(mode=0o700)
        data.mkdir(mode=0o700)
        write_proxy(proxy_path)
        if subprocess.run(["docker", "image", "inspect", IMAGE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            run(["docker", "pull", IMAGE])
        run([
            "docker", "network", "create", "--internal",
            "--label", f"com.smartspecpro.workunit={WORKUNIT}",
            "--label", f"com.smartspecpro.run-id={run_id}", network,
        ])
        created_network = True
        run([
            "docker", "run", "--detach", "--name", container,
            "--network", network, "--network-alias", "postgres",
            "--label", f"com.smartspecpro.workunit={WORKUNIT}",
            "--label", f"com.smartspecpro.run-id={run_id}",
            "--mount", f"type=bind,source={data},target=/var/lib/postgresql/data",
            "--env", f"POSTGRES_USER={BOOTSTRAP_ROLE}",
            "--env", "POSTGRES_DB=postgres",
            "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
            IMAGE,
        ])
        created_container = True
        wait_for_postgres(container)
        version = run([
            "docker", "exec", container, "psql", "-U", BOOTSTRAP_ROLE,
            "-d", "postgres", "-Atc", "SHOW server_version",
        ], capture=True)
        # PostgreSQL appends the Debian build suffix to SHOW server_version.
        if not version.startswith("15.17"):
            raise RuntimeError(
                f"SPEC224_TEST_POSTGRES_VERSION_MISMATCH: expected 15.17, observed {version}"
            )
        run([
            "docker", "exec", container, "psql", "-U", BOOTSTRAP_ROLE,
            "-d", "postgres", "-v", "ON_ERROR_STOP=1",
            "-c", f"CREATE ROLE {RUNTIME_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE",
            "-c", f"CREATE DATABASE {DATABASE} OWNER {RUNTIME_ROLE}",
        ])
        run([
            "docker", "exec", container, "psql", "-U", BOOTSTRAP_ROLE,
            "-d", DATABASE, "-v", "ON_ERROR_STOP=1",
            "-c", "CREATE EXTENSION IF NOT EXISTS vector",
        ])
        run([
            "docker", "exec", container, "psql", "-U", BOOTSTRAP_ROLE,
            "-d", DATABASE, "-Atc",
            f"ALTER DATABASE {DATABASE} OWNER TO {RUNTIME_ROLE}",
        ])
        ip = run([
            "docker", "inspect", "--format",
            f"{{{{(index .NetworkSettings.Networks \"{network}\").IPAddress}}}}",
            container,
        ], capture=True)
        if not ip or "." not in ip:
            raise RuntimeError("SPEC224_TEST_POSTGRES_CONTAINER_IP_INVALID")
        proxy = subprocess.Popen(
            [sys.executable, str(proxy_path), str(port), ip],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if proxy.poll() is not None:
                raise RuntimeError("SPEC224_TEST_POSTGRES_PROXY_EXITED")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("SPEC224_TEST_POSTGRES_PROXY_START_TIMEOUT")

        env = os.environ.copy()
        env.update({
            "DATABASE_URL": f"postgresql://{RUNTIME_ROLE}@127.0.0.1:{port}/{DATABASE}",
            "SPEC224_TEST_RUN_ID": run_id,
            "SPEC224_TEST_PG_PORT": str(port),
            "SPEC224_TEST_PG_CONTAINER": container,
            "SPEC224_TEST_PG_NETWORK": network,
            "SPEC224_TEST_PGDATA": str(data),
            "SPEC224_TEST_PG_PROXY_PID": str(proxy.pid),
            "SPEC224_TEST_DATABASE_IDENTITY": f"spec224-safe-{run_id}|{DATABASE}|{RUNTIME_ROLE}|PostgreSQL 15.17",
        })
        completed = subprocess.run(command, env=env, check=False)
        failed = completed.returncode != 0
        return completed.returncode
    finally:
        if proxy is not None:
            proxy.terminate()
            try:
                proxy.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proxy.kill()
                proxy.wait(timeout=5)
        if created_container:
            try:
                run(["docker", "rm", "--force", container])
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                pass
        if created_network:
            try:
                run(["docker", "network", "rm", network])
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                pass
        # Test DB data is disposable even on assertion failure; CI logs preserve
        # the failure details and no database fixture should survive a run.
        shutil.rmtree(root, ignore_errors=True)
        if not failed:
            print(f"SPEC224_DISPOSABLE_POSTGRES_PASS run_id={run_id} image={IMAGE}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from exc
