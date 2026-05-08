from __future__ import annotations

import pytest

from app.services.media_pipeline import upload_to_r2


class FakeR2StorageService:
    def __init__(self) -> None:
        self.uploads: list[dict] = []

    async def upload_bytes(self, key, data, content_type, db_session=None):
        self.uploads.append(
            {
                "key": key,
                "data": data,
                "content_type": content_type,
                "db_session": db_session,
            }
        )
        return f"https://cdn.example.test/{key}"


@pytest.mark.asyncio
async def test_upload_to_r2_uses_database_backed_storage_service(monkeypatch, tmp_path):
    result_path = tmp_path / "result.png"
    thumb_path = tmp_path / "thumb.jpg"
    result_path.write_bytes(b"png-bytes")
    thumb_path.write_bytes(b"jpg-bytes")
    fake_r2 = FakeR2StorageService()
    db_session = object()

    monkeypatch.setattr(
        "app.services.r2_storage_service.get_r2_storage_service",
        lambda: fake_r2,
    )

    r2_info = await upload_to_r2(
        "user-1",
        "task-1",
        str(result_path),
        str(thumb_path),
        "image",
        db_session=db_session,
    )

    assert r2_info == {
        "result_key": "images/generated/user-1/task-1.png",
        "result_url": "/api/storage/files/images/generated/user-1/task-1.png",
        "thumbnail_key": "images/thumbnails/300/task-1.jpg",
        "thumbnail_url": "/api/storage/files/images/thumbnails/300/task-1.jpg",
    }
    assert fake_r2.uploads == [
        {
            "key": "images/generated/user-1/task-1.png",
            "data": b"png-bytes",
            "content_type": "image/png",
            "db_session": db_session,
        },
        {
            "key": "images/thumbnails/300/task-1.jpg",
            "data": b"jpg-bytes",
            "content_type": "image/jpeg",
            "db_session": db_session,
        },
    ]
