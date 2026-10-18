#!/usr/bin/env python3
"""Collect host telemetry and push it to the web monitoring endpoint."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import psutil
from dotenv import dotenv_values


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_ENV_FILE = PROJECT_ROOT / "python-backend" / ".env"
MAX_RESPONSE_BYTES = 4096


def _systemd_value(unit: str, property_name: str) -> str:
    try:
        result = subprocess.run(
            ["systemctl", "show", unit, f"--property={property_name}", "--value"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return result.stdout.strip() or "unknown"


def _service_status(unit: str) -> str:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return "active" if result.returncode == 0 else "failed"


def collect_metrics() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu_percent = psutil.cpu_percent(interval=0.2)
    services = {
        "web": _service_status("smartspec-web.service"),
        "backend": _service_status("smartspec-backend.service"),
        "node_worker": _service_status("smartspec-node-worker.service"),
        "python_job_worker": _service_status("smartspec-python-job-worker.service"),
    }
    restart_counts = {
        "web": _as_nonnegative_int(_systemd_value("smartspec-web.service", "NRestarts")),
        "backend": _as_nonnegative_int(_systemd_value("smartspec-backend.service", "NRestarts")),
        "node_worker": _as_nonnegative_int(
            _systemd_value("smartspec-node-worker.service", "NRestarts")
        ),
        "python_job_worker": _as_nonnegative_int(
            _systemd_value("smartspec-python-job-worker.service", "NRestarts")
        ),
    }
    return {
        "memoryUsedMb": round(memory.used / 1024 / 1024),
        "memoryTotalMb": round(memory.total / 1024 / 1024),
        "memoryPercent": round(memory.percent, 1),
        "cpuPercent": round(cpu_percent, 1),
        "diskUsedGb": round(disk.used / 1024**3, 2),
        "diskTotalGb": round(disk.total / 1024**3, 2),
        "services": services,
        "processRestartCounts": restart_counts,
    }


def _as_nonnegative_int(value: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(parsed, 0)


def monitoring_status(metrics: dict[str, Any]) -> str:
    services = metrics.get("services", {})
    if any(value == "failed" for value in services.values()):
        return "critical"
    if metrics.get("memoryPercent", 0) >= 85:
        return "critical"
    if metrics.get("memoryPercent", 0) >= 80 or any(
        value == "unknown" for value in services.values()
    ):
        return "warning"
    return "ok"


def push_metrics(
    metrics: dict[str, Any],
    *,
    token: str,
    base_url: str = "http://127.0.0.1:3000",
) -> int:
    payload = {
        "checkType": "host_telemetry",
        "status": monitoring_status(metrics),
        "source": "systemd_monitor_daemon",
        "details": metrics,
        "alert": None,
    }
    request = Request(
        f"{base_url.rstrip('/')}/api/internal/metrics/push",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": token,
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            body = json.loads(response.read(MAX_RESPONSE_BYTES).decode("utf-8"))
    except (OSError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("monitoring endpoint request failed") from exc
    if not isinstance(body, dict) or body.get("success") is not True:
        raise RuntimeError("monitoring endpoint rejected telemetry")
    return _as_nonnegative_int(str(body.get("checkId", 0)))


def main() -> int:
    env_path = Path(os.environ.get("SMARTSPEC_MONITOR_ENV_FILE", DEFAULT_ENV_FILE))
    config = dotenv_values(env_path)
    token = str(config.get("SMARTSPEC_WEB_GATEWAY_TOKEN") or "").strip()
    if not token:
        print("[host-telemetry] gateway token is not configured", file=sys.stderr)
        return 1

    base_url = (
        os.environ.get("SMARTSPEC_MONITOR_WEB_URL")
        or str(config.get("SMARTSPEC_MONITOR_WEB_URL") or "http://127.0.0.1:3000")
    )
    try:
        check_id = push_metrics(collect_metrics(), token=token, base_url=base_url)
    except RuntimeError as exc:
        print(f"[host-telemetry] {exc}", file=sys.stderr)
        return 1
    print(f"[host-telemetry] check recorded: {check_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
