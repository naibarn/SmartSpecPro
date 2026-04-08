"""
System Health Monitor Celery Beat Task

Collects memory/CPU/disk/process metrics every 60 seconds and pushes
them to the internal Node.js metrics endpoint.
"""

import logging
import os
import subprocess
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

# Alert threshold constants
_MEM_CRITICAL_PCT = 85.0
_MEM_WARNING_PCT = 70.0
_RESTART_LOOP_THRESHOLD = 3

# Sentinel file used to suppress duplicate memory alerts within the same
# threshold level.  We only store one flag so the logic is simple:
# file absent  → no alert yet
# file present → an alert was sent at or above the current threshold;
#                re-alert only when the threshold crosses to a higher level.
_MEM_ALERT_FLAG = "/tmp/ssp_mem_alerted"

# Services to monitor
_MONITORED_SERVICES = {
    "web": "smartspec-web.service",
    "backend": "smartspec-backend.service",
}


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(
    name="app.tasks.system_health_task.monitor_system_health",
    bind=True,
    max_retries=0,
)
def monitor_system_health(self: Any) -> None:
    """Collect system metrics and push to Node.js monitoring endpoint every 60s."""
    try:
        metrics = _collect_metrics()
        alert = _check_thresholds(metrics)
        _push_metrics(metrics, alert)
    except Exception as exc:
        logger.error("monitor_system_health failed: %s", exc, exc_info=True)


# ---------------------------------------------------------------------------
# Metric collection helpers
# ---------------------------------------------------------------------------


def _collect_metrics() -> dict[str, Any]:
    """Return a dict of current system metrics."""
    try:
        import psutil  # optional dep guarded here

        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        cpu_pct = psutil.cpu_percent(interval=1)

        memory_used_mb = int(mem.used / 1024 / 1024)
        memory_total_mb = int(mem.total / 1024 / 1024)
        memory_percent = round(mem.percent, 1)
        disk_used_gb = round(disk.used / 1024**3, 2)
        disk_total_gb = round(disk.total / 1024**3, 2)
    except ImportError:
        logger.warning("psutil not installed — using zero metrics")
        memory_used_mb = 0
        memory_total_mb = 0
        memory_percent = 0.0
        cpu_pct = 0.0
        disk_used_gb = 0.0
        disk_total_gb = 0.0

    services: dict[str, str] = {}
    restart_counts: dict[str, int] = {}

    for alias, unit in _MONITORED_SERVICES.items():
        services[alias] = _get_service_status(alias, unit)
        restart_counts[alias] = _get_service_restart_count(unit)

    return {
        "memoryUsedMb": memory_used_mb,
        "memoryTotalMb": memory_total_mb,
        "memoryPercent": memory_percent,
        "cpuPercent": round(cpu_pct, 1),
        "diskUsedGb": disk_used_gb,
        "diskTotalGb": disk_total_gb,
        "services": services,
        "processRestartCounts": restart_counts,
    }


def _default_service_probe_url(alias: str) -> str | None:
    """Return an HTTP probe URL for services that are not visible via systemd."""
    if alias == "web":
        base_url = (
            os.environ.get("SMARTSPEC_WEB_HEALTH_URL")
            or os.environ.get("WEB_APP_URL")
            or os.environ.get("SMARTSPEC_WEB_GATEWAY_URL")
        )
        if base_url:
            return base_url.rstrip("/") + "/"
        return None

    if alias == "backend":
        return (
            os.environ.get("SMARTSPEC_BACKEND_HEALTH_URL")
            or "http://host.docker.internal:8000/health"
        )

    return None


def _probe_service_status(alias: str) -> str:
    probe_url = _default_service_probe_url(alias)
    if not probe_url:
        return "unknown"

    try:
        with urllib_request.urlopen(probe_url, timeout=5) as response:
            return "active" if 200 <= response.status < 400 else "failed"
    except urllib_error.HTTPError:
        return "failed"
    except Exception:
        return "unknown"


def _get_service_status(alias: str, service_name: str) -> str:
    """Return 'active', 'failed', 'inactive', or 'unknown'."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True,
            text=True,
            timeout=5,
        )
        status = result.stdout.strip() or "unknown"
        if status != "unknown":
            return status
    except Exception:
        pass

    return _probe_service_status(alias)


def _get_service_restart_count(service_name: str) -> int:
    """Return the NRestarts count reported by systemctl, or 0 on error."""
    try:
        result = subprocess.run(
            ["systemctl", "show", service_name, "--property=NRestarts"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        # Output format: "NRestarts=N"
        raw = result.stdout.strip()
        if raw.startswith("NRestarts="):
            return int(raw.split("=", 1)[1])
    except Exception:
        pass
    return 0


# ---------------------------------------------------------------------------
# Threshold / alert helpers
# ---------------------------------------------------------------------------


def _check_thresholds(metrics: dict[str, Any]) -> dict[str, Any] | None:
    """
    Evaluate metrics against alert thresholds.

    Memory alerts use a file sentinel to avoid spamming.  Restart-loop
    alerts fire every time the threshold is exceeded (stateless — low
    frequency by design).
    """
    mem_pct: float = metrics["memoryPercent"]

    # --- Memory alert ---
    mem_severity: str | None = None
    if mem_pct > _MEM_CRITICAL_PCT:
        mem_severity = "critical"
    elif mem_pct > _MEM_WARNING_PCT:
        mem_severity = "warning"

    if mem_severity:
        if not _already_alerted_memory(mem_severity):
            _set_memory_alert_flag(mem_severity)
            return {
                "severity": mem_severity,
                "title": "High Memory Usage",
                "message": f"System RAM at {mem_pct}% — risk of OOM",
                "channel": "log",
            }
    else:
        # Recovered below warning threshold — clear the flag so we alert again
        # if usage climbs back up.
        _clear_memory_alert_flag()

    # --- Service restart-loop alert ---
    restart_counts: dict[str, int] = metrics["processRestartCounts"]
    for service_alias, count in restart_counts.items():
        if count > _RESTART_LOOP_THRESHOLD:
            return {
                "severity": "warning",
                "title": "Service Restart Loop Detected",
                "message": f"{service_alias} has restarted {count} times",
                "channel": "log",
            }

    return None


def _already_alerted_memory(severity: str) -> bool:
    """
    Return True if we already sent an alert at *at least* the given severity.

    We encode the level in the flag file so that a warning alert does not
    suppress a subsequent critical alert.
    """
    try:
        with open(_MEM_ALERT_FLAG) as fh:
            stored = fh.read().strip()
        # If stored level is 'critical' but we are only 'warning', suppress.
        # If stored level is 'warning' and we are now 'critical', let it through.
        if stored == "critical":
            return True  # already at highest level
        if stored == "warning" and severity == "warning":
            return True  # same level, suppress
        return False
    except OSError:
        return False


def _set_memory_alert_flag(severity: str) -> None:
    try:
        with open(_MEM_ALERT_FLAG, "w") as fh:
            fh.write(severity)
    except OSError as exc:
        logger.warning("Could not write memory alert flag: %s", exc)


def _clear_memory_alert_flag() -> None:
    try:
        os.remove(_MEM_ALERT_FLAG)
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.warning("Could not remove memory alert flag: %s", exc)


# ---------------------------------------------------------------------------
# HTTP push helper
# ---------------------------------------------------------------------------


def _push_metrics(metrics: dict[str, Any], alert: dict[str, Any] | None) -> None:
    """
    POST metrics payload to the Node.js internal endpoint.

    Skipped silently when SMARTSPEC_WEB_GATEWAY_TOKEN is not configured so
    that local / test environments without the token don't raise errors.
    """
    token = os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
    if not token:
        logger.debug("SMARTSPEC_WEB_GATEWAY_TOKEN not set — skipping metrics push")
        return

    web_app_url = os.environ.get("WEB_APP_URL") or os.environ.get("SMARTSPEC_WEB_GATEWAY_URL", "http://localhost:3000")
    endpoint = f"{web_app_url}/api/internal/metrics/push"

    # Determine overall status
    services_status = metrics.get("services", {})
    any_failed = any(v not in ("active", "unknown") for v in services_status.values())
    if alert and alert.get("severity") == "critical":
        overall_status = "critical"
    elif alert or any_failed:
        overall_status = "warning"
    else:
        overall_status = "ok"

    payload: dict[str, Any] = {
        "checkType": "celery_health_monitor",
        "status": overall_status,
        "source": "celery_task",
        "details": metrics,
        "alert": alert,
    }

    try:
        import httpx  # optional dep, guarded here

        response = httpx.post(
            endpoint,
            json=payload,
            headers={
                "X-Internal-Token": token,
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
        if response.status_code != 200:
            logger.warning(
                "Metrics push returned non-200: %s %s",
                response.status_code,
                response.text[:200],
            )
        else:
            logger.debug("Metrics pushed successfully (status=%s)", overall_status)
    except ImportError:
        logger.warning("httpx not installed — cannot push metrics to Node.js endpoint")
    except Exception as exc:
        logger.warning("Failed to push metrics to %s: %s", endpoint, exc)
