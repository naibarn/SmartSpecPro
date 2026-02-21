"""OneDrive sync service helpers.

Provides file filtering and subscription management for OneDrive sync.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Microsoft Office MIME types that should be indexed
INDEXABLE_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/html",
    "application/json",
    "application/xml",
    "text/xml",
}

# File extensions to index (fallback if MIME type not available)
INDEXABLE_EXTENSIONS = {
    ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt",
    ".pdf", ".txt", ".csv", ".md", ".html", ".htm",
    ".json", ".xml", ".yaml", ".yml", ".log",
}

DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def should_index_file(
    name: str,
    mime_type: str,
    size: int,
    *,
    file_type_filter: Optional[list[str]] = None,
    max_file_size: int = DEFAULT_MAX_FILE_SIZE,
) -> bool:
    """Determine if a OneDrive file should be indexed."""
    if size > max_file_size:
        return False

    # Check MIME type
    if mime_type and mime_type.lower() in INDEXABLE_MIME_TYPES:
        return True

    # Check extension
    name_lower = name.lower()
    for ext in INDEXABLE_EXTENSIONS:
        if name_lower.endswith(ext):
            return True

    return False


async def setup_subscription(
    access_token: str,
    resource: str = "/me/drive/root",
    webhook_url: str = "",
    expiry_hours: int = 72,
) -> Optional[dict[str, Any]]:
    """Create a Microsoft Graph subscription for change notifications.

    Max subscription lifetime for OneDrive is 3 days (4230 minutes).
    """
    if not webhook_url:
        logger.warning("No webhook URL configured for OneDrive subscription")
        return None

    expiry = datetime.now(timezone.utc) + timedelta(hours=min(expiry_hours, 72))

    payload = {
        "changeType": "updated",
        "notificationUrl": webhook_url,
        "resource": resource,
        "expirationDateTime": expiry.isoformat(),
        "clientState": "smartspec-onedrive-sync",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{GRAPH_BASE}/subscriptions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )

        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info("Created OneDrive subscription: %s", data.get("id"))
            return {
                "subscriptionId": data["id"],
                "expirationDateTime": data["expirationDateTime"],
                "resource": data["resource"],
            }
        else:
            logger.error(
                "Failed to create OneDrive subscription: %d %s",
                resp.status_code, resp.text[:300],
            )
            return None

    except Exception as e:
        logger.error("OneDrive subscription setup failed: %s", e)
        return None


async def renew_subscription(
    access_token: str,
    subscription_id: str,
    expiry_hours: int = 72,
) -> Optional[str]:
    """Renew an existing subscription. Returns new expiry datetime string."""
    expiry = datetime.now(timezone.utc) + timedelta(hours=min(expiry_hours, 72))

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{GRAPH_BASE}/subscriptions/{subscription_id}",
                json={"expirationDateTime": expiry.isoformat()},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )

        if resp.status_code == 200:
            data = resp.json()
            logger.info("Renewed OneDrive subscription %s", subscription_id)
            return data.get("expirationDateTime")
        else:
            logger.error("Failed to renew subscription %s: %d", subscription_id, resp.status_code)
            return None

    except Exception as e:
        logger.error("Subscription renewal failed: %s", e)
        return None
