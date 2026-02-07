"""
Webhook Management API
Configure and manage webhook callbacks for media generation
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, HttpUrl
from typing import Optional
import structlog

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.webhook_service import set_user_webhook, get_user_webhook, remove_user_webhook

logger = structlog.get_logger()
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


class WebhookConfigRequest(BaseModel):
    """Request model for webhook configuration"""
    webhook_url: HttpUrl
    events: list[str] = ["task.completed", "task.failed"]


class WebhookConfigResponse(BaseModel):
    """Response model for webhook configuration"""
    user_id: str
    webhook_url: str
    events: list[str]
    active: bool


@router.post("/config", response_model=WebhookConfigResponse)
async def configure_webhook(
    config: WebhookConfigRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Configure webhook URL for media generation callbacks.

    When media generation tasks complete, fail, or are cancelled,
    a POST request will be sent to the configured webhook URL.

    Payload format:
    ```json
    {
        "event": "task.completed",
        "timestamp": "2025-01-19T10:30:00Z",
        "data": {
            "task_id": "...",
            "user_id": "...",
            "media_type": "image",
            "status": "completed",
            "result_url": "https://...",
            "credits_used": 40
        }
    }
    ```
    """
    webhook_url = str(config.webhook_url)
    # Validate URL is not targeting internal services
    from app.core.media_job_validators import validate_uri_no_ssrf
    try:
        validate_uri_no_ssrf(webhook_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook URL: {e}")
    set_user_webhook(current_user.id, webhook_url)

    logger.info("webhook_configured", user_id=current_user.id, webhook_url=webhook_url)

    return WebhookConfigResponse(
        user_id=current_user.id,
        webhook_url=webhook_url,
        events=config.events,
        active=True
    )


@router.get("/config", response_model=Optional[WebhookConfigResponse])
async def get_webhook_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current webhook configuration"""
    webhook_url = get_user_webhook(current_user.id)

    if not webhook_url:
        return None

    return WebhookConfigResponse(
        user_id=current_user.id,
        webhook_url=webhook_url,
        events=["task.completed", "task.failed", "task.cancelled"],
        active=True
    )


@router.delete("/config")
async def delete_webhook_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove webhook configuration"""
    remove_user_webhook(current_user.id)

    logger.info("webhook_removed", user_id=current_user.id)

    return {"success": True, "message": "Webhook configuration removed"}


@router.post("/test")
async def test_webhook(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Send a test webhook notification to verify configuration.
    """
    webhook_url = get_user_webhook(current_user.id)

    if not webhook_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No webhook configured"
        )

    from app.services.webhook_service import WebhookService
    from app.models.media_task import MediaTask, TaskStatus, MediaType
    from datetime import datetime

    # Create a test task
    test_task = MediaTask(
        id="test_task_123",
        user_id=current_user.id,
        media_type=MediaType.IMAGE,
        status=TaskStatus.COMPLETED,
        model="test-model",
        prompt="Test webhook notification",
        result_url="https://example.com/test.png",
        credits_used=0,
        created_at=datetime.utcnow(),
        completed_at=datetime.utcnow()
    )

    success = await WebhookService.send_webhook(webhook_url, test_task, "test.webhook")

    if success:
        return {"success": True, "message": "Test webhook sent successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test webhook"
        )
