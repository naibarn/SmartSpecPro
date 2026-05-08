from app.models.media_task import MediaTask
from app.services.media_thumbnail_backfill_service import (
    build_thumbnail_failure_result_data_patch,
    build_thumbnail_result_data_patch,
    extract_task_result_url,
    has_task_thumbnail,
)


def make_task(**kwargs):
    defaults = {
        "id": "task-1",
        "user_id": 1,
        "media_type": "video",
        "status": "completed",
        "model": "test/video",
        "prompt": "test prompt",
    }
    defaults.update(kwargs)
    return MediaTask(**defaults)


def test_extract_task_result_url_prefers_direct_result_url():
    task = make_task(
        result_url="/api/storage/files/videos/generated/1/task-1.mp4",
        result_data={"result": {"url": "https://example.com/older.mp4"}},
    )

    assert extract_task_result_url(task) == "/api/storage/files/videos/generated/1/task-1.mp4"


def test_has_task_thumbnail_detects_nested_thumbnail_url():
    task = make_task(
        result_data={
            "result": {
                "url": "/api/storage/files/images/generated/1/task-1.png",
                "thumbnail_url": "/api/storage/files/images/thumbnails/300/task-1.jpg",
            }
        }
    )

    assert has_task_thumbnail(task) is True


def test_build_thumbnail_result_data_patch_preserves_existing_result_url():
    patched = build_thumbnail_result_data_patch(
        {"result": {"url": "/api/storage/files/videos/generated/1/task-1.mp4"}},
        thumbnail_key="videos/thumbnails/task-1.jpg",
        thumbnail_url="/api/storage/files/videos/thumbnails/task-1.jpg",
    )

    assert patched["result"]["url"] == "/api/storage/files/videos/generated/1/task-1.mp4"
    assert patched["result"]["thumbnail_url"] == "/api/storage/files/videos/thumbnails/task-1.jpg"
    assert patched["urls"]["thumbnail"] == "/api/storage/files/videos/thumbnails/task-1.jpg"
    assert patched["r2_keys"]["thumbnail"] == "videos/thumbnails/task-1.jpg"
    assert patched["thumbnail_backfill"]["status"] == "completed"


def test_build_thumbnail_failure_result_data_patch_records_short_error():
    patched = build_thumbnail_failure_result_data_patch({}, error="x" * 600)

    assert patched["thumbnail_backfill"]["status"] == "failed"
    assert len(patched["thumbnail_backfill"]["error"]) == 500
