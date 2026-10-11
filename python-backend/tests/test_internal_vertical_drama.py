"""Contract tests for the Feature 137 P3 media-worker sampling endpoint."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


@pytest.mark.unit
def test_clip_qc_frames_dispatches_media_task(client):
    task_result = MagicMock(id="clip-qc-task-1")
    with (
        patch.dict("os.environ", {"FEATURE_186_SYSTEM_TENANT_ID": "tenant-test"}),
        patch("app.api.internal_vertical_drama.settings") as settings,
        patch("app.services.job_control_plane.dispatch_python_task", return_value=task_result) as dispatch,
        patch(
            "app.api.internal_vertical_drama._read_clip_qc_status",
            new_callable=AsyncMock,
            return_value={
                "status": "succeeded",
                "output": {"samples": [{"index": 0, "url": "https://cdn.example/sample.jpg"}]},
            },
        ),
    ):
        settings.SMARTSPEC_PROXY_TOKEN = "test-token"
        settings.SMARTSPEC_WEB_GATEWAY_TOKEN = ""
        response = client.post(
            "/api/internal/vertical-drama/clip-qc-frames",
            headers={"x-proxy-token": "test-token"},
            json={
                "source_url": "https://cdn.example/clip.mp4",
                "user_id": 42,
                "wait": True,
            },
        )
    assert response.status_code == 200
    assert response.json() == {
        "task_id": "clip-qc-task-1",
        "status": "succeeded",
        "samples": [{"index": 0, "url": "https://cdn.example/sample.jpg"}],
    }
    dispatch.assert_called_once()
    args, kwargs = dispatch.call_args
    assert args[0] == "app.tasks.media_tasks.extract_clip_qc_frames"
    assert kwargs["args"] == ["https://cdn.example/clip.mp4", [0.10, 0.40, 0.70, 0.95], 6, 42]
    assert kwargs["tenant_id"] == "tenant-test"
    assert kwargs["queue"] == "media"
    assert kwargs["user_id"] == 42


@pytest.mark.unit
def test_clip_qc_frames_rejects_missing_token(client):
    with patch("app.api.internal_vertical_drama.settings") as settings:
        settings.SMARTSPEC_PROXY_TOKEN = "test-token"
        settings.SMARTSPEC_WEB_GATEWAY_TOKEN = ""
        response = client.post(
            "/api/internal/vertical-drama/clip-qc-frames",
            json={"source_url": "https://cdn.example/clip.mp4"},
        )
    assert response.status_code == 401


@pytest.mark.unit
def test_clip_qc_task_uses_bounded_default_positions():
    from app.tasks import media_tasks

    extract = AsyncMock(return_value={"status": "completed", "samples": []})
    task_self = SimpleNamespace(
        request=SimpleNamespace(id="clip-qc-task-2", retries=0),
        max_retries=1,
    )

    with patch.object(media_tasks, "_extract_clip_qc_frames_async", extract), \
         patch.object(media_tasks, "_run_async", side_effect=asyncio.run) as run_async:
        result = media_tasks.extract_clip_qc_frames.run(
            task_self,
            "https://cdn.example/clip.mp4",
            positions=None,
            max_frames=6,
            user_id=42,
        )
    assert result["status"] == "completed"
    run_async.assert_called_once()
    extract.assert_awaited_once_with(
        source_url="https://cdn.example/clip.mp4",
        positions=[0.10, 0.40, 0.70, 0.95],
        max_frames=6,
        user_id=42,
        task_id="clip-qc-task-2",
    )
