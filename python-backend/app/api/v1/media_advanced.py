"""
Advanced Media Features API
Bulk operations, search, and analytics
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import structlog

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.media_task import MediaTask, TaskStatus, MediaType
from app.services.media_task_service import MediaTaskService

logger = structlog.get_logger()
router = APIRouter()


# ==================== Request/Response Models ====================

class BulkOperationRequest(BaseModel):
    """Request model for bulk operations"""
    task_ids: List[str]
    operation: str  # "delete", "cancel"


class BulkOperationResponse(BaseModel):
    """Response model for bulk operations"""
    success_count: int
    failed_count: int
    results: List[Dict[str, Any]]


class TaskResponse(BaseModel):
    """Response model for task status"""
    id: str
    user_id: str
    media_type: str
    status: str
    model: str
    prompt: str
    parameters: Optional[dict] = None
    result_url: Optional[str] = None
    result_data: Optional[dict] = None
    error_message: Optional[str] = None
    credits_used: Optional[int] = None
    credits_balance: Optional[int] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class TaskListResponse(BaseModel):
    """Response model for task list"""
    tasks: List[TaskResponse]
    total: int
    limit: int
    offset: int


class AnalyticsResponse(BaseModel):
    """Response model for analytics"""
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    processing_tasks: int
    total_credits_used: int
    by_media_type: Dict[str, int]
    by_model: Dict[str, int]
    recent_activity: List[Dict[str, Any]]


# ==================== Bulk Operations ====================

@router.post("/bulk", response_model=BulkOperationResponse)
async def bulk_operation(
    request: BulkOperationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Perform bulk operations on multiple tasks.

    Operations:
    - delete: Permanently delete tasks
    - cancel: Cancel pending/processing tasks
    """
    success_count = 0
    failed_count = 0
    results = []

    for task_id in request.task_ids:
        try:
            task = await MediaTaskService.get_task(db, task_id, current_user.id, current_user.currentTenantId)

            if not task:
                results.append({"task_id": task_id, "status": "not_found"})
                failed_count += 1
                continue

            if request.operation == "delete":
                await db.delete(task)
                await db.commit()
                results.append({"task_id": task_id, "status": "deleted"})
                success_count += 1

            elif request.operation == "cancel":
                if task.status in [TaskStatus.PENDING, TaskStatus.PROCESSING]:
                    task.status = TaskStatus.CANCELLED
                    task.completed_at = datetime.utcnow()
                    await db.commit()
                    results.append({"task_id": task_id, "status": "cancelled"})
                    success_count += 1
                else:
                    results.append({"task_id": task_id, "status": "cannot_cancel"})
                    failed_count += 1

            else:
                results.append({"task_id": task_id, "status": "unknown_operation"})
                failed_count += 1

        except Exception as e:
            logger.error("bulk_operation_error", task_id=task_id, error=str(e))
            results.append({"task_id": task_id, "status": "error", "error": str(e)})
            failed_count += 1

    logger.info("bulk_operation_completed", operation=request.operation,
                success=success_count, failed=failed_count)

    return BulkOperationResponse(
        success_count=success_count,
        failed_count=failed_count,
        results=results
    )


# ==================== Search ====================

@router.get("/search", response_model=TaskListResponse)
async def search_tasks(
    query: str,
    media_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search tasks by prompt text or model name.
    Full-text search with optional filters.
    """
    # Build base query
    query_obj = select(MediaTask).where(
        MediaTask.user_id == current_user.id,
        MediaTask.tenant_id == current_user.currentTenantId,
    )

    # Apply search filter
    if query:
        query_obj = query_obj.where(
            or_(
                MediaTask.prompt.ilike(f"%{query}%"),
                MediaTask.model.ilike(f"%{query}%")
            )
        )

    # Apply media type filter
    if media_type:
        query_obj = query_obj.where(MediaTask.media_type == MediaType(media_type))

    # Apply status filter
    if status_filter:
        query_obj = query_obj.where(MediaTask.status == TaskStatus(status_filter))

    # Get total count
    count_query = select(func.count(MediaTask.id)).select_from(query_obj.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query_obj = query_obj.order_by(MediaTask.created_at.desc())
    query_obj = query_obj.limit(limit).offset(offset)

    result = await db.execute(query_obj)
    tasks = list(result.scalars().all())

    return TaskListResponse(
        tasks=[TaskResponse(**task.to_dict()) for task in tasks],
        total=total,
        limit=limit,
        offset=offset
    )


# ==================== Analytics ====================

@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get analytics for media generation tasks.

    Returns:
    - Total task counts by status
    - Credits used
    - Breakdown by media type and model
    - Recent activity timeline
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    # Get all user tasks within time range
    query = select(MediaTask).where(
        MediaTask.user_id == current_user.id,
        MediaTask.created_at >= cutoff_date
    )
    result = await db.execute(query)
    tasks = list(result.scalars().all())

    # Calculate statistics
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == TaskStatus.COMPLETED)
    failed_tasks = sum(1 for t in tasks if t.status == TaskStatus.FAILED)
    processing_tasks = sum(1 for t in tasks if t.status in [TaskStatus.PENDING, TaskStatus.PROCESSING])

    total_credits_used = sum(t.credits_used or 0 for t in tasks if t.credits_used)

    # Breakdown by media type
    by_media_type = {}
    for task in tasks:
        media_type = task.media_type.value if task.media_type else "unknown"
        by_media_type[media_type] = by_media_type.get(media_type, 0) + 1

    # Breakdown by model
    by_model = {}
    for task in tasks:
        model = task.model or "unknown"
        by_model[model] = by_model.get(model, 0) + 1

    # Recent activity (last 10 tasks)
    recent_tasks = sorted(tasks, key=lambda t: t.created_at, reverse=True)[:10]
    recent_activity = [
        {
            "task_id": t.id,
            "media_type": t.media_type.value if t.media_type else None,
            "status": t.status.value if t.status else None,
            "credits_used": t.credits_used,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in recent_tasks
    ]

    logger.info("analytics_retrieved", user_id=current_user.id, days=days, total_tasks=total_tasks)

    return AnalyticsResponse(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        failed_tasks=failed_tasks,
        processing_tasks=processing_tasks,
        total_credits_used=total_credits_used,
        by_media_type=by_media_type,
        by_model=by_model,
        recent_activity=recent_activity
    )
