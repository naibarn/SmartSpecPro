"""
Notification Service
Multi-channel notification system (in-app, email, webhooks)
"""

import uuid
import aiosmtplib
import httpx
from typing import Dict, Any, List, Optional
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update

from app.models.notification import Notification
from app.core.config import settings


class NotificationService:
    """Service for managing notifications"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_notification(
        self,
        user_id: str,
        type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        send_email: bool = False,
        send_webhook: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new notification
        
        Args:
            user_id: User ID
            type: Notification type (info, warning, error, success)
            title: Notification title
            message: Notification message
            data: Additional data
            send_email: Whether to send email
            send_webhook: Whether to send webhook
        
        Returns:
            Created notification
        """
        # Create in-app notification
        notification_id = str(uuid.uuid4())
        notification = Notification(
            id=notification_id,
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            data=data,
            is_read=False,
            created_at=datetime.utcnow()
        )
        
        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)
        
        # Send email if requested
        if send_email:
            try:
                await self._send_email_notification(
                    user_id=user_id,
                    type=type,
                    title=title,
                    message=message
                )
            except Exception as e:
                # Log error but don't fail
                print(f"Failed to send email notification: {e}")
        
        # Send webhook if requested
        if send_webhook:
            try:
                await self._send_webhook_notification(
                    user_id=user_id,
                    type=type,
                    title=title,
                    message=message,
                    data=data
                )
            except Exception as e:
                # Log error but don't fail
                print(f"Failed to send webhook notification: {e}")
        
        return self._notification_to_dict(notification)
    
    async def get_notifications(
        self,
        user_id: str,
        is_read: Optional[bool] = None,
        type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get user's notifications
        
        Args:
            user_id: User ID
            is_read: Filter by read status
            type: Filter by type
            limit: Maximum number of results
            offset: Offset for pagination
        
        Returns:
            List of notifications
        """
        conditions = [Notification.user_id == user_id]
        
        if is_read is not None:
            conditions.append(Notification.is_read == is_read)
        
        if type:
            conditions.append(Notification.type == type)
        
        result = await self.db.execute(
            select(Notification)
            .where(and_(*conditions))
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        notifications = result.scalars().all()
        
        return [self._notification_to_dict(n) for n in notifications]
    
    async def mark_as_read(
        self,
        notification_id: str,
        user_id: str
    ) -> bool:
        """
        Mark notification as read
        
        Args:
            notification_id: Notification ID
            user_id: User ID
        
        Returns:
            True if marked, False if not found
        """
        result = await self.db.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user_id
                )
            )
        )
        notification = result.scalar_one_or_none()
        
        if not notification:
            return False
        
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        
        await self.db.commit()
        
        return True
    
    async def mark_all_as_read(
        self,
        user_id: str
    ) -> int:
        """
        Mark all notifications as read
        
        Args:
            user_id: User ID
        
        Returns:
            Number of notifications marked
        """
        result = await self.db.execute(
            update(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False
                )
            )
            .values(
                is_read=True,
                read_at=datetime.utcnow()
            )
        )
        
        await self.db.commit()
        
        return result.rowcount
    
    async def delete_notification(
        self,
        notification_id: str,
        user_id: str
    ) -> bool:
        """
        Delete a notification
        
        Args:
            notification_id: Notification ID
            user_id: User ID
        
        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user_id
                )
            )
        )
        notification = result.scalar_one_or_none()
        
        if not notification:
            return False
        
        await self.db.delete(notification)
        await self.db.commit()
        
        return True
    
    async def get_unread_count(
        self,
        user_id: str
    ) -> int:
        """
        Get count of unread notifications
        
        Args:
            user_id: User ID
        
        Returns:
            Unread count
        """
        result = await self.db.execute(
            select(Notification).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.is_read == False
                )
            )
        )
        notifications = result.scalars().all()
        
        return len(notifications)
    
    async def _send_email_notification(
        self,
        user_id: str,
        type: str,
        title: str,
        message: str
    ):
        """Send email notification"""
        # TODO: Get user email from database
        # For now, skip if SMTP not configured
        if not settings.SMTP_HOST:
            return
        
        # Create email
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[SmartSpec Pro] {title}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = "user@example.com"  # TODO: Get from user
        
        # HTML body
        html = f"""
        <html>
          <body>
            <h2>{title}</h2>
            <p>{message}</p>
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from SmartSpec Pro.
            </p>
          </body>
        </html>
        """
        
        part = MIMEText(html, "html")
        msg.attach(part)
        
        # Send email
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=settings.SMTP_PASSWORD,
            use_tls=settings.SMTP_USE_TLS
        )
    
    async def _send_webhook_notification(
        self,
        user_id: str,
        type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Send webhook notification"""
        # TODO: Get user webhook URL from preferences
        webhook_url = None  # Get from user preferences
        
        if not webhook_url:
            return
        
        payload = {
            "event": "notification",
            "type": type,
            "title": title,
            "message": message,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        async with httpx.AsyncClient() as client:
            await client.post(
                webhook_url,
                json=payload,
                timeout=5.0
            )
    
    def _notification_to_dict(self, notification: Notification) -> Dict[str, Any]:
        """Convert notification to dictionary"""
        return {
            "id": notification.id,
            "user_id": notification.user_id,
            "type": notification.type,
            "title": notification.title,
            "message": notification.message,
            "data": notification.data,
            "is_read": notification.is_read,
            "read_at": notification.read_at.isoformat() if notification.read_at else None,
            "created_at": notification.created_at.isoformat()
        }


# Helper functions for common notifications

async def notify_low_credits(db: AsyncSession, user_id: str, credits_remaining: int):
    """Notify user of low credits"""
    service = NotificationService(db)
    await service.create_notification(
        user_id=user_id,
        type="warning",
        title="Low Credits",
        message=f"Your credit balance is low ({credits_remaining} credits remaining). Consider topping up to continue using SmartSpec Pro.",
        data={"credits_remaining": credits_remaining},
        send_email=True
    )


async def notify_payment_success(db: AsyncSession, user_id: str, amount_usd: float, credits_added: int):
    """Notify user of successful payment"""
    service = NotificationService(db)
    await service.create_notification(
        user_id=user_id,
        type="success",
        title="Payment Successful",
        message=f"Your payment of ${amount_usd:.2f} was successful. {credits_added:,} credits have been added to your account.",
        data={
            "amount_usd": amount_usd,
            "credits_added": credits_added
        },
        send_email=True
    )


async def notify_payment_failed(db: AsyncSession, user_id: str, amount_usd: float, reason: str):
    """Notify user of failed payment"""
    service = NotificationService(db)
    await service.create_notification(
        user_id=user_id,
        type="error",
        title="Payment Failed",
        message=f"Your payment of ${amount_usd:.2f} failed. Reason: {reason}",
        data={
            "amount_usd": amount_usd,
            "reason": reason
        },
        send_email=True
    )


async def notify_refund_processed(db: AsyncSession, user_id: str, amount_usd: float):
    """Notify user of processed refund"""
    service = NotificationService(db)
    await service.create_notification(
        user_id=user_id,
        type="info",
        title="Refund Processed",
        message=f"Your refund of ${amount_usd:.2f} has been processed and will appear in your account within 5-10 business days.",
        data={"amount_usd": amount_usd},
        send_email=True
    )
