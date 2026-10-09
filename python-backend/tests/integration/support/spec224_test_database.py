"""Strict locator guard for the task-owned SPEC-224 PostgreSQL test cluster."""

import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse


def database_url() -> str:
    raw = os.environ.get("DATABASE_URL", "")
    parsed = urlparse(raw)
    run_id = os.environ.get("SPEC224_TEST_RUN_ID", "")
    port = os.environ.get("SPEC224_TEST_PG_PORT", "")
    container_name = os.environ.get("SPEC224_TEST_PG_CONTAINER", "")
    network_name = os.environ.get("SPEC224_TEST_PG_NETWORK", "")
    data_directory = os.environ.get("SPEC224_TEST_PGDATA", "")
    proxy_pid = os.environ.get("SPEC224_TEST_PG_PROXY_PID", "")
    expected_identity = (
        f"spec224-safe-{run_id}|spec224_d385_test|"
        "spec224_d385_runtime|PostgreSQL 15.17"
    )
    expected_container = f"codex-spec224-safe-pg-{run_id}"
    expected_network = f"codex-spec224-safe-net-{run_id}"
    expected_data = f"/tmp/codex-spec224-safe-postgres-{run_id}/pgdata"
    if (
        not re.fullmatch(r"[a-f0-9]{8}", run_id)
        or not port.isdigit()
        or not 55400 < int(port) <= 55999
        or port == "55493"
        or parsed.scheme != "postgresql"
        or parsed.hostname != "127.0.0.1"
        or parsed.port != int(port)
        or parsed.path != "/spec224_d385_test"
        or parsed.username != "spec224_d385_runtime"
        or os.environ.get("SPEC224_TEST_DATABASE_IDENTITY") != expected_identity
        or container_name != expected_container
        or network_name != expected_network
        or data_directory != expected_data
        or str(Path(data_directory).resolve()) != expected_data
        or not proxy_pid.isdigit()
        or int(proxy_pid) < 2
    ):
        raise RuntimeError("SPEC224_DISPOSABLE_POSTGRES_TARGET_FORBIDDEN")
    try:
        inspected = json.loads(
            subprocess.check_output(
                ["docker", "inspect", container_name], text=True, timeout=5
            )
        )[0]
    except (OSError, subprocess.SubprocessError, IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError("SPEC224_DISPOSABLE_POSTGRES_CONTAINER_UNVERIFIED") from exc
    mounts = inspected.get("Mounts", [])
    bindings = inspected.get("NetworkSettings", {}).get("Ports", {}).get("5432/tcp") or []
    try:
        network = json.loads(
            subprocess.check_output(
                ["docker", "network", "inspect", network_name], text=True, timeout=5
            )
        )[0]
        proxy_cmdline = Path(f"/proc/{proxy_pid}/cmdline").read_bytes().decode()
    except (OSError, subprocess.SubprocessError, IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError("SPEC224_DISPOSABLE_POSTGRES_PROXY_UNVERIFIED") from exc
    attached = next(
        (
            entry
            for entry in network.get("Containers", {}).values()
            if entry.get("Name") == container_name
        ),
        None,
    )
    if (
        inspected.get("Name") != f"/{container_name}"
        or inspected.get("Config", {}).get("Image") != "pgvector/pgvector:pg15"
        or inspected.get("Config", {}).get("Labels", {}).get("com.smartspecpro.workunit")
        != "spec224-safe-postgres-admission"
        or inspected.get("Config", {}).get("Labels", {}).get("com.smartspecpro.run-id")
        != run_id
        or inspected.get("State", {}).get("Running") is not True
        or inspected.get("HostConfig", {}).get("NetworkMode") != network_name
        or not any(
            mount.get("Type") == "bind"
            and mount.get("Source") == expected_data
            and mount.get("Destination") == "/var/lib/postgresql/data"
            for mount in mounts
        )
        or bindings
        or network.get("Internal") is not True
        or network.get("Labels", {}).get("com.smartspecpro.workunit")
        != "spec224-safe-postgres-admission"
        or not attached
        or f"/tmp/codex-spec224-safe-postgres-{run_id}/pg_proxy.py" not in proxy_cmdline
        or port not in proxy_cmdline
        or attached.get("IPv4Address", "").split("/")[0] not in proxy_cmdline
    ):
        raise RuntimeError("SPEC224_DISPOSABLE_POSTGRES_CONTAINER_MISMATCH")
    if raw.startswith("postgresql://"):
        raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql://")
    return raw
