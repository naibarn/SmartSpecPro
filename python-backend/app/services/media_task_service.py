"""
Media Task Service
Handles async media generation task management
"""

import uuid
from datetime import datetime
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
        task = MediaTask(
            id=str(uuid.uuid4()),
            user_id=user.id,
            media_type=media_type,
            status=TaskStatus.PENDING,
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
        credits_balance: Optional[int] = None
    ) -> Optional[MediaTask]:
        """Update task status and results"""
        task = await MediaTaskService.get_task(db, task_id)
        if not task:
            return None

        task.status = status
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

        # Update timestamps
        if status == TaskStatus.PROCESSING and not task.started_at:
            task.started_at = datetime.utcnow()
        if status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
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

        # Only allow cancelling pending or processing tasks
        if task.status not in [TaskStatus.PENDING, TaskStatus.PROCESSING]:
            return None

        return await MediaTaskService.update_task_status(
            db,
            task_id,
            TaskStatus.CANCELLED
        )

    @staticmethod
    async def list_user_tasks(
        db: AsyncSession,
        user_id: str,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[MediaTask]:
        """List tasks for a user with optional filters"""
        query = select(MediaTask).where(MediaTask.user_id == user_id)

        if media_type:
            query = query.where(MediaTask.media_type == media_type)
        if status:
            query = query.where(MediaTask.status == status)

        query = query.order_by(MediaTask.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_task_count(
        db: AsyncSession,
        user_id: str,
        media_type: Optional[MediaType] = None,
        status: Optional[TaskStatus] = None
    ) -> int:
        """Get count of tasks for a user"""
        from sqlalchemy import func

        query = select(func.count(MediaTask.id)).where(MediaTask.user_id == user_id)

        if media_type:
            query = query.where(MediaTask.media_type == media_type)
        if status:
            query = query.where(MediaTask.status == status)

        result = await db.execute(query)
        return result.scalar() or 0
