"""
Media Task Service
Handles async media generation task management
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.models.user import User


class MediaTaskService:
    """Service for managing media generation tasks"""

    @staticmethod
    async def create_task(
        db: AsyncSession,
        user: User,
        media_type: MediaType,
        model: str,
        prompt: str,
        parameters: Optional[dict] = None
    ) -> MediaTask:
        """Create a new media generation task"""
        # Convert enum to string value for database storage
        media_type_value = media_type.value if isinstance(media_type, MediaType) else str(media_type)

        task = MediaTask(
            id=str(uuid.uuid4()),
            user_id=user.id,
            media_type=media_type_value,
            status=TaskStatus.PENDING.value,
            model=model,
            prompt=prompt,
            parameters=parameters or {},
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_task(
        db: AsyncSession,
        task_id: str,
        user_id: Optional[str] = None
    ) -> Optional[MediaTask]:
        """Get a task by ID, optionally filtered by user"""
        query = select(MediaTask).where(MediaTask.id == task_id)
        if user_id:
            query = query.where(MediaTask.user_id == user_id)

        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_task_status(
        db: AsyncSession,
        task_id: str,
        status: TaskStatus,
        result_url: Optional[str] = None,
        result_data: Optional[dict] = None,
        error_message: Optional[str] = None,
        credits_used: Optional[int] = None,
        credits_balance: Optional[int] = None,
        external_task_id: Optional[str] = None
    ) -> Optional[MediaTask]:
        """Update task status and results"""
        task = await MediaTaskService.get_task(db, task_id)
        if not task:
            return None

        # Convert enum to string value for database storage
        status_value = status.value if isinstance(status, TaskStatus) else str(status)
        task.status = status_value

        if result_url:
            task.result_url = result_url
        if result_data:
            task.result_data = result_data
        if error_message:
            task.error_message = error_message
        if credits_used is not None:
            task.credits_used = credits_used
        if credits_balance is not None:
            task.credits_balance = credits_balance
        if external_task_id:
            task.task_id = external_task_id  # Store external provider's task ID

        # Update timestamps - compare with string values
        if status_value == TaskStatus.PROCESSING.value and not task.started_at:
            task.started_at = datetime.utcnow()
        if status_value in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value]:
            task.completed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def cancel_task(
        db: AsyncSession,
        task_id: str,
        user_id: str
    ) -> Optional[MediaTask]:
        """Cancel a pending or processing task"""
        task = await MediaTaskService.get_task(db, task_id, user_id)
        if not task:
            return None

        # Only allow cancelling pending or processing tasks - compare with string values
        if task.status not in [TaskStatus.PENDING.value, TaskStatus.PROCESSING.value]:
            return None

        return await MediaTaskService.update_task_status(
            db,
            task_id,
            TaskStatus.CANCELLED
        )

    @staticmethod
    async def delete_task(
        db: AsyncSession,
        task_id: str,
        user_id: str
    ) -> bool:
        """Delete a task from the database"""
        task = await MediaTaskService.get_task(db, task_id, user_id)
        if not task:
            return False

        try:
            await db.delete(task)
            await db.commit()
            return True
        except Exception as e:
            await db.rollback()
            return False

    @staticmethod
    async def list_user_tasks(
        db: AsyncSession,
        user_id: str,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None,
        limit: int = 50,
        offset: int = 0,
        days_ago: Optional[int] = None
    ) -> List[MediaTask]:
        """List tasks for a user with optional filters"""
        query = select(MediaTask).where(MediaTask.user_id == user_id)

        if media_type:
            # Convert enum to string value for comparison
            media_type_value = media_type.value if isinstance(media_type, MediaType) else str(media_type)
            query = query.where(MediaTask.media_type == media_type_value)
        if status:
            # Convert enum to string value for comparison
            status_value = status.value if isinstance(status, TaskStatus) else str(status)
            query = query.where(MediaTask.status == status_value)

        # Filter by days ago if specified
        if days_ago is not None and days_ago > 0:
            cutoff_date = datetime.utcnow() - timedelta(days=days_ago)
            query = query.where(MediaTask.created_at >= cutoff_date)

        query = query.order_by(MediaTask.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_task_count(
        db: AsyncSession,
        user_id: str,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None,
        days_ago: Optional[int] = None
    ) -> int:
        """Get count of tasks for a user"""
        from sqlalchemy import func

        query = select(func.count(MediaTask.id)).where(MediaTask.user_id == user_id)

        if media_type:
            # Convert enum to string value for comparison
            media_type_value = media_type.value if isinstance(media_type, MediaType) else str(media_type)
            query = query.where(MediaTask.media_type == media_type_value)
        if status:
            # Convert enum to string value for comparison
            status_value = status.value if isinstance(status, TaskStatus) else str(status)
            query = query.where(MediaTask.status == status_value)

        # Filter by days ago if specified
        if days_ago is not None and days_ago > 0:
            cutoff_date = datetime.utcnow() - timedelta(days=days_ago)
            query = query.where(MediaTask.created_at >= cutoff_date)

        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def list_all_tasks(
        db: AsyncSession,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[MediaTask]:
        """List ALL tasks across all users (admin only)"""
        query = select(MediaTask)

        if media_type:
            media_type_value = media_type.value if isinstance(media_type, MediaType) else str(media_type)
            query = query.where(MediaTask.media_type == media_type_value)
        if status:
            status_value = status.value if isinstance(status, TaskStatus) else str(status)
            query = query.where(MediaTask.status == status_value)

        query = query.order_by(MediaTask.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def count_all_tasks(
        db: AsyncSession,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None,
    ) -> int:
        """Count ALL tasks across all users (admin only)"""
        from sqlalchemy import func

        query = select(func.count(MediaTask.id))

        if media_type:
            media_type_value = media_type.value if isinstance(media_type, MediaType) else str(media_type)
            query = query.where(MediaTask.media_type == media_type_value)
        if status:
            status_value = status.value if isinstance(status, TaskStatus) else str(status)
            query = query.where(MediaTask.status == status_value)

        result = await db.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def get_task_by_external_id(
        db: AsyncSession,
        external_task_id: str
    ) -> Optional[MediaTask]:
        """Get a task by external provider task ID (e.g., Kie.ai task ID)"""
        query = select(MediaTask).where(MediaTask.task_id == external_task_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def update_task_by_external_id(
        db: AsyncSession,
        external_task_id: str,
        status: TaskStatus,
        result_url: Optional[str] = None,
        result_data: Optional[dict] = None,
        error_message: Optional[str] = None,
        credits_used: Optional[int] = None,
        credits_balance: Optional[int] = None
    ) -> Optional[MediaTask]:
        """Update task by external provider task ID (e.g., Kie.ai callback)"""
        if not external_task_id:
            raise ValueError("external_task_id (provider_task_id) is required")

        task = await MediaTaskService.get_task_by_external_id(db, external_task_id)
        if not task:
            return None

        # Convert enum to string value for database storage
        status_value = status.value if isinstance(status, TaskStatus) else str(status)

        # Idempotency guard: don't overwrite terminal states with another terminal update.
        if task.status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value]:
            if task.status == status_value:
                return task
            # Preserve first terminal transition as source of truth.
            return task

        task.status = status_value

        if result_url:
            task.result_url = result_url
        if result_data:
            task.result_data = result_data
        if error_message:
            task.error_message = error_message
        if credits_used is not None:
            task.credits_used = credits_used
        if credits_balance is not None:
            task.credits_balance = credits_balance

        # Update timestamps - compare with string values
        if status_value == TaskStatus.PROCESSING.value and not task.started_at:
            task.started_at = datetime.utcnow()
        if status_value in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, TaskStatus.CANCELLED.value]:
            task.completed_at = datetime.utcnow()

        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def cleanup_old_tasks(
        db: AsyncSession,
        days: int = 12
    ) -> int:
        """
        Delete tasks older than specified days (default: 12 days).
        Returns the number of deleted tasks.
        """
        from sqlalchemy import delete

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        # Delete old tasks
        stmt = delete(MediaTask).where(MediaTask.created_at < cutoff_date)
        result = await db.execute(stmt)
        await db.commit()

        return result.rowcount
