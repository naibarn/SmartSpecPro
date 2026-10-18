import json
from unittest.mock import MagicMock, patch

from app.services.host_telemetry_collector import monitoring_status, push_metrics


def test_monitoring_status_tracks_pressure_and_service_failures():
    assert monitoring_status({"memoryPercent": 40, "services": {"web": "active"}}) == "ok"
    assert monitoring_status({"memoryPercent": 82, "services": {"web": "active"}}) == "warning"
    assert monitoring_status({"memoryPercent": 90, "services": {"web": "active"}}) == "critical"
    assert monitoring_status({"memoryPercent": 40, "services": {"web": "failed"}}) == "critical"
    assert monitoring_status({"memoryPercent": 40, "services": {"web": "unknown"}}) == "warning"


def test_push_metrics_sends_authenticated_bounded_payload():
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps({"success": True, "checkId": 23}).encode()
    metrics = {
        "memoryUsedMb": 100,
        "memoryTotalMb": 500,
        "memoryPercent": 20,
        "cpuPercent": 1,
        "diskUsedGb": 10,
        "diskTotalGb": 100,
        "services": {"web": "active"},
        "processRestartCounts": {"web": 0},
    }

    with patch("app.services.host_telemetry_collector.urlopen", return_value=response) as open_url:
        check_id = push_metrics(metrics, token="secret", base_url="http://localhost:3000/")

    request = open_url.call_args.args[0]
    body = json.loads(request.data)
    assert check_id == 23
    assert request.full_url == "http://localhost:3000/api/internal/metrics/push"
    assert request.get_header("X-internal-token") == "secret"
    assert body["checkType"] == "host_telemetry"
    assert body["source"] == "systemd_monitor_daemon"
    assert body["status"] == "ok"
    assert body["details"] == metrics
