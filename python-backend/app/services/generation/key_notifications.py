"""
SmartSpec Pro - Key Notification Service
Handles notifications for API key events.
"""

from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key_v2 import APIKeyV2, KeyStatus
from app.services.generation.key_repository import KeyRepository

logger = structlog.get_logger()


# =============================================================================
# NOTIFICATION TYPES
# =============================================================================

class NotificationType(str, Enum):
    """Types of key-related notifications."""
    KEY_EXPIRING_SOON = "key_expiring_soon"
    KEY_EXPIRED = "key_expired"
    KEY_ROTATED = "key_rotated"
    KEY_ROTATION_DUE = "key_rotation_due"
    KEY_REVOKED = "key_revoked"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    GRACE_PERIOD_ENDING = "grace_period_ending"
    USAGE_LIMIT_WARNING = "usage_limit_warning"


class NotificationChannel(str, Enum):
    """Notification delivery channels."""
    EMAIL = "email"
    WEBHOOK = "webhook"
    IN_APP = "in_app"
    SLACK = "slack"


class NotificationPriority(str, Enum):
    """Notification priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# =============================================================================
# NOTIFICATION MODELS
# =============================================================================

class Notification(BaseModel):
    """Notification record."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: NotificationType
    priority: NotificationPriority
    user_id: str
    api_key_id: Optional[str] = None
    title: str
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)
    channels: List[NotificationChannel] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None


class NotificationTemplate(BaseModel):
    """Template for generating notifications."""
    type: NotificationType
    priority: NotificationPriority
    title_template: str
    message_template: str
    channels: List[NotificationChannel]


# =============================================================================
# NOTIFICATION TEMPLATES
# =============================================================================

NOTIFICATION_TEMPLATES: Dict[NotificationType, NotificationTemplate] = {
    NotificationType.KEY_EXPIRING_SOON: NotificationTemplate(
        type=NotificationType.KEY_EXPIRING_SOON,
        priority=NotificationPriority.HIGH,
        title_template="API Key Expiring Soon: {key_name}",
        message_template=(
            "Your API key '{key_name}' will expire in {days_remaining} days on {expiry_date}. "
            "Please rotate or renew the key to avoid service interruption."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.KEY_EXPIRED: NotificationTemplate(
        type=NotificationType.KEY_EXPIRED,
        priority=NotificationPriority.CRITICAL,
        title_template="API Key Expired: {key_name}",
        message_template=(
            "Your API key '{key_name}' has expired. "
            "All requests using this key will be rejected. "
            "Please create a new key or contact support."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.KEY_ROTATED: NotificationTemplate(
        type=NotificationType.KEY_ROTATED,
        priority=NotificationPriority.MEDIUM,
        title_template="API Key Rotated: {key_name}",
        message_template=(
            "Your API key '{key_name}' has been rotated to version {new_version}. "
            "The old key (version {old_version}) will remain valid until {grace_period_ends}. "
            "Please update your applications with the new key."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.KEY_ROTATION_DUE: NotificationTemplate(
        type=NotificationType.KEY_ROTATION_DUE,
        priority=NotificationPriority.HIGH,
        title_template="API Key Rotation Due: {key_name}",
        message_template=(
            "Your API key '{key_name}' is scheduled for rotation on {rotation_date}. "
            "Please ensure your applications are prepared for the key change."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.KEY_REVOKED: NotificationTemplate(
        type=NotificationType.KEY_REVOKED,
        priority=NotificationPriority.CRITICAL,
        title_template="API Key Revoked: {key_name}",
        message_template=(
            "Your API key '{key_name}' has been revoked. "
            "Reason: {reason}. "
            "All requests using this key will be rejected immediately."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.SUSPICIOUS_ACTIVITY: NotificationTemplate(
        type=NotificationType.SUSPICIOUS_ACTIVITY,
        priority=NotificationPriority.CRITICAL,
        title_template="Suspicious Activity Detected on API Key: {key_name}",
        message_template=(
            "Suspicious activity has been detected on your API key '{key_name}'. "
            "Details: {activity_details}. "
            "If you did not perform this action, please revoke the key immediately."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.SLACK],
    ),
    
    NotificationType.GRACE_PERIOD_ENDING: NotificationTemplate(
        type=NotificationType.GRACE_PERIOD_ENDING,
        priority=NotificationPriority.HIGH,
        title_template="Grace Period Ending: {key_name}",
        message_template=(
            "The grace period for your old API key '{key_name}' (version {old_version}) "
            "will end in {hours_remaining} hours. "
            "Please ensure all applications have been updated to use the new key."
        ),
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    ),
    
    NotificationType.USAGE_LIMIT_WARNING: NotificationTemplate(
        type=NotificationType.USAGE_LIMIT_WARNING,
        priority=NotificationPriority.MEDIUM,
        title_template="API Key Usage Warning: {key_name}",
        message_template=(
            "Your API key '{key_name}' has used {usage_percent}% of its daily limit. "
            "Current usage: {current_usage}/{daily_limit} requests. "
            "Consider upgrading your plan if you need higher limits."
        ),
        channels=[NotificationChannel.IN_APP],
    ),
}


# =============================================================================
# NOTIFICATION SERVICE
# =============================================================================

class KeyNotificationService:
    """
    Service for managing key-related notifications.
    
    Features:
    - Multiple notification channels
    - Template-based messages
    - Scheduled notifications
    - Notification preferences
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = KeyRepository(session)
        
        # In-memory notification queue (use Redis/DB in production)
        self._notifications: List[Notification] = []
        self._sent_notifications: Dict[str, datetime] = {}  # Deduplication
    
    # =========================================================================
    # NOTIFICATION GENERATION
    # =========================================================================
    
    def _generate_notification(
        self,
        notification_type: NotificationType,
        user_id: str,
        api_key_id: Optional[str] = None,
        template_vars: Optional[Dict[str, Any]] = None,
        extra_data: Optional[Dict[str, Any]] = None,
    ) -> Notification:
        """Generate a notification from template."""
        template = NOTIFICATION_TEMPLATES.get(notification_type)
        if not template:
            raise ValueError(f"Unknown notification type: {notification_type}")
        
        vars = template_vars or {}
        
        return Notification(
            type=notification_type,
            priority=template.priority,
            user_id=user_id,
            api_key_id=api_key_id,
            title=template.title_template.format(**vars),
            message=template.message_template.format(**vars),
            data=extra_data or {},
            channels=template.channels,
        )
    
    def _should_send(self, notification: Notification, cooldown_hours: int = 24) -> bool:
        """Check if notification should be sent (deduplication)."""
        dedup_key = f"{notification.user_id}:{notification.type}:{notification.api_key_id}"
        
        last_sent = self._sent_notifications.get(dedup_key)
        if last_sent:
            if datetime.utcnow() - last_sent < timedelta(hours=cooldown_hours):
                return False
        
        return True
    
    # =========================================================================
    # NOTIFICATION SENDING
    # =========================================================================
    
    async def send_notification(self, notification: Notification) -> bool:
        """Send a notification through configured channels."""
        if not self._should_send(notification):
            logger.debug(
                "Notification skipped (cooldown)",
                type=notification.type,
                user_id=notification.user_id,
            )
            return False
        
        success = True
        
        for channel in notification.channels:
            try:
                if channel == NotificationChannel.EMAIL:
                    await self._send_email(notification)
                elif channel == NotificationChannel.WEBHOOK:
                    await self._send_webhook(notification)
                elif channel == NotificationChannel.IN_APP:
                    await self._send_in_app(notification)
                elif channel == NotificationChannel.SLACK:
                    await self._send_slack(notification)
            except Exception as e:
                logger.error(
                    "Failed to send notification",
                    channel=channel,
                    error=str(e),
                )
                success = False
        
        if success:
            notification.sent_at = datetime.utcnow()
            dedup_key = f"{notification.user_id}:{notification.type}:{notification.api_key_id}"
            self._sent_notifications[dedup_key] = datetime.utcnow()
        
        self._notifications.append(notification)
        
        logger.info(
            "Notification sent",
            type=notification.type,
            user_id=notification.user_id,
            channels=notification.channels,
        )
        
        return success
    
    async def _send_email(self, notification: Notification):
        """Send email notification."""
        # TODO: Integrate with email service (SendGrid, SES, etc.)
        logger.info(
            "Email notification queued",
            user_id=notification.user_id,
            title=notification.title,
        )
    
    async def _send_webhook(self, notification: Notification):
        """Send webhook notification."""
        # TODO: Implement webhook delivery
        logger.info(
            "Webhook notification queued",
            user_id=notification.user_id,
        )
    
    async def _send_in_app(self, notification: Notification):
        """Send in-app notification."""
        # Store in database for retrieval by frontend
        # TODO: Implement in-app notification storage
        logger.info(
            "In-app notification stored",
            user_id=notification.user_id,
        )
    
    async def _send_slack(self, notification: Notification):
        """Send Slack notification."""
        # TODO: Integrate with Slack API
        logger.info(
            "Slack notification queued",
            user_id=notification.user_id,
        )
    
    # =========================================================================
    # KEY EVENT NOTIFICATIONS
    # =========================================================================
    
    async def notify_key_expiring(
        self,
        key: APIKeyV2,
        days_remaining: int,
    ):
        """Notify user that their key is expiring soon."""
        notification = self._generate_notification(
            notification_type=NotificationType.KEY_EXPIRING_SOON,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "days_remaining": days_remaining,
                "expiry_date": key.expires_at.strftime("%Y-%m-%d %H:%M UTC") if key.expires_at else "N/A",
            },
        )
        
        await self.send_notification(notification)
    
    async def notify_key_expired(self, key: APIKeyV2):
        """Notify user that their key has expired."""
        notification = self._generate_notification(
            notification_type=NotificationType.KEY_EXPIRED,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={"key_name": key.name},
        )
        
        await self.send_notification(notification)
    
    async def notify_key_rotated(
        self,
        key: APIKeyV2,
        old_version: int,
        new_version: int,
        grace_period_ends: datetime,
    ):
        """Notify user that their key has been rotated."""
        notification = self._generate_notification(
            notification_type=NotificationType.KEY_ROTATED,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "old_version": old_version,
                "new_version": new_version,
                "grace_period_ends": grace_period_ends.strftime("%Y-%m-%d %H:%M UTC"),
            },
        )
        
        await self.send_notification(notification)
    
    async def notify_rotation_due(self, key: APIKeyV2):
        """Notify user that their key rotation is due."""
        notification = self._generate_notification(
            notification_type=NotificationType.KEY_ROTATION_DUE,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "rotation_date": key.next_rotation_at.strftime("%Y-%m-%d %H:%M UTC") if key.next_rotation_at else "N/A",
            },
        )
        
        await self.send_notification(notification)
    
    async def notify_key_revoked(
        self,
        key: APIKeyV2,
        reason: str,
    ):
        """Notify user that their key has been revoked."""
        notification = self._generate_notification(
            notification_type=NotificationType.KEY_REVOKED,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "reason": reason or "No reason provided",
            },
        )
        
        await self.send_notification(notification)
    
    async def notify_suspicious_activity(
        self,
        key: APIKeyV2,
        activity_details: str,
    ):
        """Notify user of suspicious activity on their key."""
        notification = self._generate_notification(
            notification_type=NotificationType.SUSPICIOUS_ACTIVITY,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "activity_details": activity_details,
            },
        )
        
        await self.send_notification(notification)
    
    async def notify_grace_period_ending(
        self,
        key: APIKeyV2,
        old_version: int,
        hours_remaining: int,
    ):
        """Notify user that grace period is ending."""
        notification = self._generate_notification(
            notification_type=NotificationType.GRACE_PERIOD_ENDING,
            user_id=key.user_id,
            api_key_id=key.id,
            template_vars={
                "key_name": key.name,
                "old_version": old_version,
                "hours_remaining": hours_remaining,
            },
        )
        
        await self.send_notification(notification)
    
    # =========================================================================
    # SCHEDULED NOTIFICATIONS
    # =========================================================================
    
    async def check_and_send_scheduled_notifications(self):
        """
        Check for keys that need notifications and send them.
        
        This should be called periodically (e.g., every hour) by a background task.
        """
        # Get keys expiring soon
        expiring_keys = await self._get_keys_expiring_soon()
        for key, days in expiring_keys:
            await self.notify_key_expiring(key, days)
        
        # Get keys due for rotation
        rotation_due_keys = await self.repo.get_keys_needing_notification()
        for key in rotation_due_keys:
            await self.notify_rotation_due(key)
        
        # Get grace periods ending soon
        grace_ending = await self._get_grace_periods_ending_soon()
        for key, version, hours in grace_ending:
            await self.notify_grace_period_ending(key, version, hours)
        
        logger.info(
            "Scheduled notifications processed",
            expiring_keys=len(expiring_keys),
            rotation_due=len(rotation_due_keys),
            grace_ending=len(grace_ending),
        )
    
    async def _get_keys_expiring_soon(
        self,
        days_threshold: int = 7,
    ) -> List[tuple]:
        """Get keys expiring within threshold days."""
        # TODO: Implement database query
        return []
    
    async def _get_grace_periods_ending_soon(
        self,
        hours_threshold: int = 4,
    ) -> List[tuple]:
        """Get grace periods ending within threshold hours."""
        # TODO: Implement database query
        return []
    
    # =========================================================================
    # NOTIFICATION RETRIEVAL
    # =========================================================================
    
    async def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50,
    ) -> List[Notification]:
        """Get notifications for a user."""
        notifications = [
            n for n in self._notifications
            if n.user_id == user_id
        ]
        
        if unread_only:
            notifications = [n for n in notifications if n.read_at is None]
        
        # Sort by created_at descending
        notifications.sort(key=lambda n: n.created_at, reverse=True)
        
        return notifications[:limit]
    
    async def mark_notification_read(self, notification_id: str) -> bool:
        """Mark a notification as read."""
        for notification in self._notifications:
            if notification.id == notification_id:
                notification.read_at = datetime.utcnow()
                return True
        return False


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_key_notification_service(session: AsyncSession) -> KeyNotificationService:
    """Get key notification service instance."""
    return KeyNotificationService(session)
