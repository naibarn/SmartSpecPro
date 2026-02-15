"""Test that the MediaTask model includes the cloud_task_id column."""

import pytest
from sqlalchemy import inspect as sa_inspect

from app.models.media_task import MediaTask


@pytest.mark.unit
class TestMediaTaskCloudTaskId:
    def test_media_task_has_cloud_task_id_column(self):
        """
        Verify that the MediaTask SQLAlchemy model has a cloud_task_id
        column defined as String, nullable=True, indexed.
        """
        mapper = sa_inspect(MediaTask)
        columns = {c.key: c for c in mapper.columns}

        assert "cloud_task_id" in columns, "MediaTask must have cloud_task_id column"

        col = columns["cloud_task_id"]
        assert col.nullable is True, "cloud_task_id should be nullable"
        assert str(col.type) == "VARCHAR(512)", (
            f"cloud_task_id should be VARCHAR(512), got {col.type}"
        )

    def test_media_task_to_dict_includes_cloud_task_id(self):
        """
        Verify that MediaTask.to_dict() includes cloud_task_id in output.
        """
        task = MediaTask(
            id="test-id",
            user_id=1,
            media_type="image",
            status="pending",
            model="test-model",
            prompt="test prompt",
            cloud_task_id="projects/my-project/locations/us-central1/queues/media-jobs/tasks/task-123",
        )
        result = task.to_dict()

        assert "cloud_task_id" in result, "to_dict() must include cloud_task_id"
        assert result["cloud_task_id"] == (
            "projects/my-project/locations/us-central1/queues/media-jobs/tasks/task-123"
        )

    def test_media_task_cloud_task_id_defaults_to_none(self):
        """
        Verify that cloud_task_id defaults to None when not provided.
        """
        task = MediaTask(
            id="test-id-2",
            user_id=1,
            media_type="image",
            status="pending",
            model="test-model",
            prompt="test prompt",
        )
        result = task.to_dict()
        assert result["cloud_task_id"] is None
