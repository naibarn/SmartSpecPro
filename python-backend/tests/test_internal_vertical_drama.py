"""Contract tests for the Feature 137 P3 media-worker sampling endpoint."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


@pytest.mark.unit
def test_clip_qc_frames_dispatches_media_task(client):
    task_result = MagicMock(id="clip-qc-task-1")
    task_result.ready.return_value = True
    task_result.failed.return_value = False
    task_result.result = {
        "status": "completed",
        "samples": [{"index": 0, "url": "https://cdn.example/sample.jpg"}],
    }
    with (
        patch("app.api.internal_vertical_drama.settings") as settings,
        patch("app.tasks.media_tasks.extract_clip_qc_frames") as task,
        patch("app.api.internal_vertical_drama.AsyncResult", return_value=task_result),
    ):
        settings.SMARTSPEC_PROXY_TOKEN = "test-token"
        settings.SMARTSPEC_WEB_GATEWAY_TOKEN = ""
        task.apply_async.return_value = task_result
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
    assert response.json()["status"] == "completed"
    task.apply_async.assert_called_once()


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

    def consume(coro):
        coro.close()
        return {"status": "completed", "samples": []}

    with patch.object(media_tasks, "_run_async", side_effect=consume) as run_async:
        result = media_tasks.extract_clip_qc_frames.run(
            "https://cdn.example/clip.mp4",
            positions=None,
            max_frames=6,
            user_id=42,
        )
    assert result["status"] == "completed"
    run_async.assert_called_once()
