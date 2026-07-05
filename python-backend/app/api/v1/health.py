"""
Health check and monitoring endpoints
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any
from datetime import datetime
import structlog

from app.core.database import get_db
from app.monitoring.marketplace_metrics import get_metrics
from app.models.user import User
from app.core.auth import get_current_active_superuser

logger = structlog.get_logger()
router = APIRouter()


@router.get("/health", tags=["monitoring"])
async def health_check(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """
    Public health check endpoint
    Returns basic health status
    """
    try:
        # Check database connectivity
        await db.execute(text("SELECT 1"))
        db_healthy = True
        db_error = None
    except Exception as e:
        db_healthy = False
        db_error = str(e)

    # Get marketplace metrics health
    metrics = get_metrics()
    metrics_health = metrics.get_health_status()

    overall_healthy = db_healthy and metrics_health["status"] == "healthy"

    return {
        "status": "healthy" if overall_healthy else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {
            "database": {
                "status": "healthy" if db_healthy else "unhealthy",
                "error": db_error
            },
            "marketplace": metrics_health
        }
    }


@router.get("/health/detailed", tags=["monitoring"])
async def detailed_health_check(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser)
) -> Dict[str, Any]:
    """
    Detailed health check endpoint (admin only)
    Returns comprehensive system health information
    """
    metrics = get_metrics()

    # Get current snapshot
    snapshot = metrics.get_current_snapshot()

    # Check for anomalies
    anomalies = metrics.detect_anomalies()

    # Get recent security events
    recent_security_events = [
        {
            "timestamp": e["timestamp"].isoformat(),
            "event_type": e["event_type"],
            "severity": e["severity"],
            "user_id": e.get("user_id")
        }
        for e in list(metrics.security_events)[-20:]  # Last 20 events
    ]

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "snapshot": {
            "total_purchases": snapshot.total_purchases,
            "revenue_total": snapshot.revenue_total,
            "revenue_creator": snapshot.revenue_creator,
            "revenue_platform": snapshot.revenue_platform,
            "unique_buyers": snapshot.unique_buyers,
            "unique_creators": snapshot.unique_creators,
            "failed_purchases": snapshot.failed_purchases,
            "concurrent_purchases": snapshot.concurrent_purchases,
            "avg_response_time_ms": snapshot.avg_response_time_ms,
            "error_rate": snapshot.error_rate
        },
        "anomalies": anomalies,
        "security_events": recent_security_events,
        "error_breakdown": dict(metrics.error_counts)
    }


@router.get("/metrics", tags=["monitoring"])
async def metrics_endpoint(
    current_user: User = Depends(get_current_active_superuser)
) -> Dict[str, Any]:
    """
    Prometheus-style metrics endpoint (admin only)
    Returns metrics in format suitable for scraping
    """
    metrics = get_metrics()
    return metrics.get_metrics_for_export()


@router.get("/health/database", tags=["monitoring"])
async def database_health(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> Dict[str, Any]:
    """
    Database-specific health check (admin only)
    Tests database connectivity and basic queries
    """
    checks = {}

    try:
        # Basic connectivity
        await db.execute(text("SELECT 1"))
        checks["connectivity"] = "healthy"
    except Exception as e:
        logger.error("database_health_connectivity_failed", error=str(e))
        checks["connectivity"] = {"status": "unhealthy", "error": "connectivity check failed"}

    try:
        # Check users table
        result = await db.execute(text("SELECT COUNT(*) FROM users"))
        user_count = result.scalar()
        checks["users_table"] = {"status": "healthy", "count": user_count}
    except Exception as e:
        logger.error("database_health_users_table_failed", error=str(e))
        checks["users_table"] = {"status": "unhealthy", "error": "users table check failed"}

    try:
        # Check marketplace tables
        result = await db.execute(text("SELECT COUNT(*) FROM marketplace_templates"))
        template_count = result.scalar()
        checks["marketplace_templates"] = {"status": "healthy", "count": template_count}
    except Exception as e:
        logger.error("database_health_marketplace_templates_failed", error=str(e))
        checks["marketplace_templates"] = {
            "status": "unhealthy",
            "error": "marketplace_templates check failed",
        }

    try:
        # Check purchases table
        result = await db.execute(text("SELECT COUNT(*) FROM template_purchases"))
        purchase_count = result.scalar()
        checks["template_purchases"] = {"status": "healthy", "count": purchase_count}
    except Exception as e:
        logger.error("database_health_template_purchases_failed", error=str(e))
        checks["template_purchases"] = {
            "status": "unhealthy",
            "error": "template_purchases check failed",
        }

    all_healthy = all(
        check == "healthy" or (isinstance(check, dict) and check.get("status") == "healthy")
        for check in checks.values()
    )

    return {
        "status": "healthy" if all_healthy else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks
    }


@router.post("/health/reset-metrics", tags=["monitoring"])
async def reset_metrics(
    current_user: User = Depends(get_current_active_superuser)
) -> Dict[str, str]:
    """
    Reset metrics counters (admin only)
    Use this for testing or after maintenance
    """
    global _metrics_instance
    from app.monitoring.marketplace_metrics import MarketplaceMetrics

    # Create fresh instance
    _metrics_instance = MarketplaceMetrics()

    return {
        "status": "success",
        "message": "Metrics have been reset",
        "timestamp": datetime.utcnow().isoformat()
    }
