"""
Webhook Service for Media Generation Callbacks
Sends notifications when tasks complete/fail
"""

import ipaddress
import socket
import httpx
import structlog
from typing import Optional, Dict, Any
from urllib.parse import urlparse
from app.models.media_task import MediaTask, TaskStatus
from datetime import datetime

logger = structlog.get_logger()


# --- SSRF protection ---
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / cloud metadata
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_safe_webhook_url(url: str) -> bool:
    """Return False if URL targets a private/internal network (SSRF protection)."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return False
    # Block non-HTTPS in production
    if parsed.scheme != "https":
        logger.warning("webhook_non_https", url=url)
    try:
        infos = socket.getaddrinfo(hostname, None)
        for _family, _type, _proto, _canonname, sockaddr in infos:
            ip = ipaddress.ip_address(sockaddr[0])
            for net in _BLOCKED_NETWORKS:
                if ip in net:
                    logger.warning("ssrf_blocked_webhook", url=url, resolved_ip=str(ip))
                    return False
    except (socket.gaierror, ValueError):
        return False  # unresolvable → block
    return True


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

        # SSRF protection — block requests to internal networks
        if not _is_safe_webhook_url(webhook_url):
            logger.error("webhook_ssrf_blocked", webhook_url=webhook_url, task_id=task.id)
            return False

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
