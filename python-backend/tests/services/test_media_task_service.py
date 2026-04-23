"""
Tests for MediaTaskService
"""

import pytest
import uuid
from decimal import Decimal

from app.services.media_task_service import MediaTaskService, normalize_media_prompt
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.models.user import User


@pytest.mark.unit
class TestMediaTaskService:
    """Test MediaTaskService"""

    @pytest.mark.asyncio
    async def test_create_task(self, test_db):
        """Test creating a media task"""
        user = User(
            id=str(uuid.uuid4()),
            email="test@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "A beautiful sunset",
            {"size": "1024x1024"}
        )

        assert task.id is not None
        assert task.user_id == user.id
        assert task.media_type == MediaType.IMAGE
        assert task.status == TaskStatus.PENDING
        assert task.model == "dalle-3"
        assert task.prompt == "A beautiful sunset"

    @pytest.mark.asyncio
    async def test_create_task_sanitizes_json_unsafe_parameters(self, test_db):
        """create_task should normalize JSON-unsafe parameter payloads."""
        user = User(
            id=str(uuid.uuid4()),
            email="test-safe@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "Test",
            {
                "duration": Decimal("5"),
                "nested": {"ratio": Decimal("1.25")},
            },
        )

        assert task.parameters["duration"] == 5
        assert task.parameters["nested"]["ratio"] == 1.25

    def test_normalize_media_prompt_unwraps_fenced_json(self):
        """Normalize helper should unwrap markdown fenced prompt blocks."""
        raw = """```json
{
  "prompt": "A cinematic Thai nursery scene",
  "duration": 5
}
```"""
        expected = """{
  "prompt": "A cinematic Thai nursery scene",
  "duration": 5
}"""
        assert normalize_media_prompt(raw) == expected

    def test_normalize_media_prompt_handles_json_label_prefix(self):
        """Normalize helper should unwrap plain json-label prefixed outputs."""
        raw = """json
{
  "prompt": "A clean image prompt"
}"""
        expected = """{
  "prompt": "A clean image prompt"
}"""
        assert normalize_media_prompt(raw) == expected

    @pytest.mark.asyncio
    async def test_create_task_normalizes_fenced_prompt(self, test_db):
        """create_task stores normalized prompt text instead of fenced markdown."""
        user = User(
            id=str(uuid.uuid4()),
            email="test-normalize@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "sora-2",
            """```json
{
  "prompt": "A cinematic scene",
  "duration": 5
}
```"""
        )

        assert task.prompt == """{
  "prompt": "A cinematic scene",
  "duration": 5
}"""

    @pytest.mark.asyncio
    async def test_get_task(self, test_db):
        """Test getting a task by ID"""
        user = User(
            id=str(uuid.uuid4()),
            email="test2@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "Flying birds"
        )

        retrieved = await MediaTaskService.get_task(test_db, task.id, user.id)

        assert retrieved is not None
        assert retrieved.id == task.id
        assert retrieved.prompt == "Flying birds"

    @pytest.mark.asyncio
    async def test_get_task_wrong_user(self, test_db):
        """Test getting task with wrong user returns None"""
        user1 = User(
            id=str(uuid.uuid4()),
            email="user1@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        user2 = User(
            id=str(uuid.uuid4()),
            email="user2@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add_all([user1, user2])
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user1,
            MediaType.IMAGE,
            "dalle-3",
            "Test"
        )

        # Try to get with different user
        retrieved = await MediaTaskService.get_task(test_db, task.id, user2.id)

        assert retrieved is None

    @pytest.mark.asyncio
    async def test_update_task_status(self, test_db):
        """Test updating task status"""
        user = User(
            id=str(uuid.uuid4()),
            email="test3@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.AUDIO,
            "elevenlabs-tts",
            "Hello world"
        )

        updated = await MediaTaskService.update_task_status(
            test_db,
            task.id,
            TaskStatus.PROCESSING
        )

        assert updated.status == TaskStatus.PROCESSING
        assert updated.started_at is not None

    @pytest.mark.asyncio
    async def test_update_task_status_completed(self, test_db):
        """Test updating task to completed status"""
        user = User(
            id=str(uuid.uuid4()),
            email="test4@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Test"
        )

        updated = await MediaTaskService.update_task_status(
            test_db,
            task.id,
            TaskStatus.COMPLETED,
            result_url="https://example.com/image.png",
            credits_used=50,
            credits_balance=950
        )

        assert updated.status == TaskStatus.COMPLETED
        assert updated.result_url == "https://example.com/image.png"
        assert updated.credits_used == 50
        assert updated.credits_balance == 950
        assert updated.completed_at is not None

    @pytest.mark.asyncio
    async def test_update_task_status_sanitizes_result_data(self, test_db):
        """result_data should be JSON safe before persistence."""
        user = User(
            id=str(uuid.uuid4()),
            email="test4b@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "sora-2",
            "Test"
        )

        updated = await MediaTaskService.update_task_status(
            test_db,
            task.id,
            TaskStatus.COMPLETED,
            result_data={
                "response": {
                    "credits_used": Decimal("12"),
                    "credits_balance": Decimal("988"),
                },
                "metrics": {
                    "ratio": Decimal("1.5"),
                },
            },
        )

        assert updated.result_data["response"]["credits_used"] == 12
        assert updated.result_data["response"]["credits_balance"] == 988
        assert updated.result_data["metrics"]["ratio"] == 1.5

    @pytest.mark.asyncio
    async def test_update_task_status_failed(self, test_db):
        """Test updating task to failed status"""
        user = User(
            id=str(uuid.uuid4()),
            email="test5@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "sora-v2",
            "Test"
        )

        updated = await MediaTaskService.update_task_status(
            test_db,
            task.id,
            TaskStatus.FAILED,
            error_message="Generation failed due to timeout"
        )

        assert updated.status == TaskStatus.FAILED
        assert updated.error_message == "Generation failed due to timeout"
        assert updated.completed_at is not None

    @pytest.mark.asyncio
    async def test_cancel_task(self, test_db):
        """Test cancelling a task"""
        user = User(
            id=str(uuid.uuid4()),
            email="test6@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Test"
        )

        cancelled = await MediaTaskService.cancel_task(test_db, task.id, user.id)

        assert cancelled is not None
        assert cancelled.status == TaskStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_cancel_completed_task_fails(self, test_db):
        """Test that completed tasks cannot be cancelled"""
        user = User(
            id=str(uuid.uuid4()),
            email="test7@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Test"
        )

        # Complete it
        await MediaTaskService.update_task_status(
            test_db,
            task.id,
            TaskStatus.COMPLETED
        )

        # Try to cancel
        cancelled = await MediaTaskService.cancel_task(test_db, task.id, user.id)

        assert cancelled is None

    @pytest.mark.asyncio
    async def test_list_user_tasks(self, test_db):
        """Test listing user tasks"""
        user = User(
            id=str(uuid.uuid4()),
            email="test8@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        # Create multiple tasks
        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Image 1"
        )
        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "Video 1"
        )
        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.AUDIO,
            "elevenlabs-tts",
            "Audio 1"
        )

        tasks = await MediaTaskService.list_user_tasks(test_db, user.id)

        assert len(tasks) == 3

    @pytest.mark.asyncio
    async def test_list_user_tasks_with_media_filter(self, test_db):
        """Test listing user tasks with media type filter"""
        user = User(
            id=str(uuid.uuid4()),
            email="test9@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Image 1"
        )
        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Image 2"
        )
        await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.VIDEO,
            "veo-3-1",
            "Video 1"
        )

        tasks = await MediaTaskService.list_user_tasks(
            test_db,
            user.id,
            media_type=MediaType.IMAGE
        )

        assert len(tasks) == 2
        assert all(t.media_type == MediaType.IMAGE for t in tasks)

    @pytest.mark.asyncio
    async def test_list_user_tasks_with_status_filter(self, test_db):
        """Test listing user tasks with status filter"""
        user = User(
            id=str(uuid.uuid4()),
            email="test10@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        task1 = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Test 1"
        )
        task2 = await MediaTaskService.create_task(
            test_db,
            user,
            MediaType.IMAGE,
            "dalle-3",
            "Test 2"
        )

        # Complete one
        await MediaTaskService.update_task_status(
            test_db,
            task1.id,
            TaskStatus.COMPLETED
        )

        completed_tasks = await MediaTaskService.list_user_tasks(
            test_db,
            user.id,
            status=TaskStatus.COMPLETED
        )

        assert len(completed_tasks) == 1
        assert completed_tasks[0].id == task1.id

    @pytest.mark.asyncio
    async def test_get_task_count(self, test_db):
        """Test getting task count"""
        user = User(
            id=str(uuid.uuid4()),
            email="test11@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        for i in range(5):
            await MediaTaskService.create_task(
                test_db,
                user,
                MediaType.IMAGE,
                "dalle-3",
                f"Test {i}"
            )

        count = await MediaTaskService.get_task_count(test_db, user.id)

        assert count == 5

    @pytest.mark.asyncio
    async def test_pagination(self, test_db):
        """Test task list pagination"""
        user = User(
            id=str(uuid.uuid4()),
            email="test12@example.com",
            password_hash="hash",
            credits_balance=1000
        )
        test_db.add(user)
        await test_db.commit()

        for i in range(10):
            await MediaTaskService.create_task(
                test_db,
                user,
                MediaType.IMAGE,
                "dalle-3",
                f"Test {i}"
            )

        # Get first page
        page1 = await MediaTaskService.list_user_tasks(
            test_db,
            user.id,
            limit=5,
            offset=0
        )

        # Get second page
        page2 = await MediaTaskService.list_user_tasks(
            test_db,
            user.id,
            limit=5,
            offset=5
        )

        assert len(page1) == 5
        assert len(page2) == 5
        assert page1[0].id != page2[0].id
