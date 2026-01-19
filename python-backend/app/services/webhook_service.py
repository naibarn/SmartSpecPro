"""
Webhook Service for Media Generation Callbacks
Sends notifications when tasks complete/fail
"""

import httpx
import structlog
from typing import Optional, Dict, Any
from app.models.media_task import MediaTask, TaskStatus
from datetime import datetime

logger = structlog.get_logger()


class WebhookService:
    """Service for sending webhook notifications"""

    @staticmethod
    async def send_webhook(
        webhook_url: str,
        task: MediaTask,
        event_type: str = "task.completed",
        retry_count: int = 3
    ) -> bool:
        """
        Send webhook notification for task completion/failure

        Args:
            webhook_url: URL to send webhook to
            task: MediaTask instance
            event_type: Type of event (task.completed, task.failed, task.cancelled)
            retry_count: Number of retry attempts

        Returns:
            bool: True if webhook sent successfully, False otherwise
        """
        payload = {
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "task_id": task.id,
                "user_id": task.user_id,
                "media_type": task.media_type.value if task.media_type else None,
                "status": task.status.value if task.status else None,
                "model": task.model,
                "prompt": task.prompt,
                "result_url": task.result_url,
                "error_message": task.error_message,
                "credits_used": task.credits_used,
                "credits_balance": task.credits_balance,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            }
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            for attempt in range(retry_count):
                try:
                    response = await client.post(
                        webhook_url,
                        json=payload,
                        headers={"Content-Type": "application/json"}
                    )

                    if response.status_code in [200, 201, 202, 204]:
                        logger.info(
                            "webhook_sent_successfully",
                            webhook_url=webhook_url,
                            task_id=task.id,
                            event_type=event_type,
                            attempt=attempt + 1
                        )
                        return True
                    else:
                        logger.warning(
                            "webhook_failed_http_error",
                            webhook_url=webhook_url,
                            task_id=task.id,
                            status_code=response.status_code,
                            attempt=attempt + 1
                        )

                except Exception as e:
                    logger.error(
                        "webhook_send_error",
                        webhook_url=webhook_url,
                        task_id=task.id,
                        error=str(e),
                        attempt=attempt + 1
                    )

                # Wait before retry (exponential backoff)
                if attempt < retry_count - 1:
                    await asyncio.sleep(2 ** attempt)

        return False

    @staticmethod
    async def notify_task_completed(task: MediaTask, webhook_url: Optional[str] = None):
        """Send webhook notification when task completes"""
        if not webhook_url:
            return

        if task.status == TaskStatus.COMPLETED:
            await WebhookService.send_webhook(webhook_url, task, "task.completed")
        elif task.status == TaskStatus.FAILED:
            await WebhookService.send_webhook(webhook_url, task, "task.failed")
        elif task.status == TaskStatus.CANCELLED:
            await WebhookService.send_webhook(webhook_url, task, "task.cancelled")


# Webhook configuration per user (would be stored in database)
# For now, this is a simple in-memory store
_webhook_urls: Dict[str, str] = {}


def set_user_webhook(user_id: str, webhook_url: str):
    """Set webhook URL for a user"""
    _webhook_urls[user_id] = webhook_url
    logger.info("webhook_url_set", user_id=user_id, webhook_url=webhook_url)


def get_user_webhook(user_id: str) -> Optional[str]:
    """Get webhook URL for a user"""
    return _webhook_urls.get(user_id)


def remove_user_webhook(user_id: str):
    """Remove webhook URL for a user"""
    if user_id in _webhook_urls:
        del _webhook_urls[user_id]
        logger.info("webhook_url_removed", user_id=user_id)
