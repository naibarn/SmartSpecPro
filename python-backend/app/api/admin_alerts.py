"""
Admin Alerts API

Endpoint for Cloud Scheduler to check thresholds and send email alerts.
Checks system health metrics and sends notifications to admin users
when critical thresholds are breached.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
import structlog

from app.core.database import get_db
from app.core.config import settings
from app.models.user import User

logger = structlog.get_logger()

router = APIRouter(prefix="/api/admin", tags=["Admin Alerts"])

# Alert thresholds
THRESHOLDS = {
    "error_rate_5xx": 5.0,       # 5% error rate
    "job_failure_rate": 10.0,    # 10% job failure rate
    "callback_miss_rate": 50.0,  # 50% callback miss rate
    "dlq_count": 10,             # 10 items in dead letter queue
}

# Dedup TTL in seconds (1 hour)
ALERT_DEDUP_TTL = 3600


async def _get_redis():
    """Get async Redis client."""
    try:
        from app.core.cache import cache_manager
        return cache_manager.redis
    except Exception:
        return None


async def _check_dedup(redis, metric: str) -> bool:
    """Check if alert was already sent recently. Returns True if should skip."""
    if not redis:
        return False
    try:
        key = f"alert:{metric}:sent"
        return await redis.exists(key) > 0
    except Exception:
        return False


async def _set_dedup(redis, metric: str):
    """Mark alert as sent to prevent duplicates."""
    if not redis:
        return
    try:
        key = f"alert:{metric}:sent"
        await redis.set(key, "1", ex=ALERT_DEDUP_TTL)
    except Exception:
        pass


async def _get_admin_emails(db: AsyncSession) -> list[str]:
    """Get email addresses of all admin users."""
    result = await db.execute(
        select(User.email).where(
            User.role.in_(["admin", "domain_admin"]),
            User.email.isnot(None),
            User.isDisabled == False,  # noqa: E712
        )
    )
    return [row[0] for row in result.fetchall() if row[0]]


async def _send_alert_email(
    metric_name: str,
    current_value: str,
    threshold_value: str,
    admin_emails: list[str],
):
    """Send alert email to all admin users."""
    if not admin_emails:
        logger.warning("no_admin_emails", metric=metric_name)
        return 0

    try:
        from app.services.email_service import get_email_service
        email_service = get_email_service()

        subject = f"[SmartSpecPro Alert] {metric_name} threshold breached"
        text_content = (
            f"Alert: {metric_name}\n"
            f"Current Value: {current_value}\n"
            f"Threshold: {threshold_value}\n"
            f"Time: {datetime.now(timezone.utc).isoformat()}\n\n"
            f"Dashboard: https://smartaihub.app/admin/ops\n\n"
            f"This alert will not repeat for 1 hour unless the issue persists."
        )
        html_content = (
            f"<h2>Alert: {metric_name}</h2>"
            f"<p><strong>Current Value:</strong> {current_value}</p>"
            f"<p><strong>Threshold:</strong> {threshold_value}</p>"
            f"<p><strong>Time:</strong> {datetime.now(timezone.utc).isoformat()}</p>"
            f"<p><a href='https://smartaihub.app/admin/ops'>View Dashboard</a></p>"
            f"<p><em>This alert will not repeat for 1 hour.</em></p>"
        )

        sent = 0
        for email in admin_emails:
            try:
                await email_service.send_email(email, subject, html_content, text_content)
                sent += 1
            except Exception as e:
                logger.error("alert_email_failed", email=email, error=str(e))
        return sent
    except Exception as e:
        logger.error("alert_send_failed", metric=metric_name, error=str(e))
        return 0


def _verify_internal_token(request: Request):
    """Verify internal proxy token for Cloud Scheduler calls."""
    token = request.headers.get("X-Proxy-Token")
    expected = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not expected or token != expected:
        raise HTTPException(status_code=403, detail="Invalid internal token")


@router.post("/alerts/check")
async def check_admin_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Check alert thresholds and send emails when breached.
    Called by Cloud Scheduler every 5 minutes.
    Requires X-Proxy-Token header for authentication.
    """
    _verify_internal_token(request)
    redis = await _get_redis()
    alerts_sent = 0
    checks_performed = []

    admin_emails = await _get_admin_emails(db)

    # Check 1: API error rate (5xx from provider_usage_log)
    try:
        since = datetime.now(timezone.utc) - timedelta(minutes=5)
        result = await db.execute(text(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE "statusCode" >= 500) as errors
            FROM provider_usage_log
            WHERE "createdAt" >= :since
            """
        ), {"since": since})
        row = result.fetchone()
        if row and row.total > 0:
            error_rate = (row.errors / row.total) * 100
            if error_rate > THRESHOLDS["error_rate_5xx"]:
                if not await _check_dedup(redis, "error_rate_5xx"):
                    sent = await _send_alert_email(
                        "API 5xx Error Rate",
                        f"{error_rate:.1f}%",
                        f"{THRESHOLDS['error_rate_5xx']}%",
                        admin_emails,
                    )
                    await _set_dedup(redis, "error_rate_5xx")
                    alerts_sent += sent
        checks_performed.append("error_rate_5xx")
    except Exception as e:
        logger.error("alert_check_failed", check="error_rate_5xx", error=str(e))

    # Check 2: Job failure rate (from cloud_task_events)
    try:
        result = await db.execute(text(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter')) as failures
            FROM cloud_task_events
            WHERE "createdAt" >= :since
            """
        ), {"since": datetime.now(timezone.utc) - timedelta(minutes=30)})
        row = result.fetchone()
        if row and row.total > 0:
            failure_rate = (row.failures / row.total) * 100
            if failure_rate > THRESHOLDS["job_failure_rate"]:
                if not await _check_dedup(redis, "job_failure_rate"):
                    sent = await _send_alert_email(
                        "Job Failure Rate",
                        f"{failure_rate:.1f}%",
                        f"{THRESHOLDS['job_failure_rate']}%",
                        admin_emails,
                    )
                    await _set_dedup(redis, "job_failure_rate")
                    alerts_sent += sent
        checks_performed.append("job_failure_rate")
    except Exception as e:
        logger.error("alert_check_failed", check="job_failure_rate", error=str(e))

    # Check 3: Media callback miss rate
    try:
        result = await db.execute(text(
            """
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM media_callback_events
            WHERE "created_at" >= :since
            """
        ), {"since": datetime.now(timezone.utc) - timedelta(minutes=30)})
        row = result.fetchone()
        if row and row.total > 0:
            miss_rate = ((row.total - row.completed) / row.total) * 100
            if miss_rate > THRESHOLDS["callback_miss_rate"]:
                if not await _check_dedup(redis, "callback_miss_rate"):
                    sent = await _send_alert_email(
                        "Media Callback Miss Rate",
                        f"{miss_rate:.1f}%",
                        f"{THRESHOLDS['callback_miss_rate']}%",
                        admin_emails,
                    )
                    await _set_dedup(redis, "callback_miss_rate")
                    alerts_sent += sent
        checks_performed.append("callback_miss_rate")
    except Exception as e:
        logger.error("alert_check_failed", check="callback_miss_rate", error=str(e))

    # Check 4: Dead letter queue count
    try:
        result = await db.execute(text(
            "SELECT COUNT(*) as count FROM media_callback_dlq WHERE status = 'pending'"
        ))
        row = result.fetchone()
        if row and row.count > THRESHOLDS["dlq_count"]:
            if not await _check_dedup(redis, "dlq_count"):
                sent = await _send_alert_email(
                    "Dead Letter Queue Size",
                    str(row.count),
                    str(THRESHOLDS["dlq_count"]),
                    admin_emails,
                )
                await _set_dedup(redis, "dlq_count")
                alerts_sent += sent
        checks_performed.append("dlq_count")
    except Exception as e:
        logger.error("alert_check_failed", check="dlq_count", error=str(e))

    logger.info(
        "admin_alerts_checked",
        checks=checks_performed,
        alerts_sent=alerts_sent,
    )

    return {
        "success": True,
        "checks_performed": checks_performed,
        "alerts_sent": alerts_sent,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
