"""
Marketplace Monitoring and Metrics
Tracks key metrics for security, performance, and business analytics
"""

import time
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
from threading import Lock
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class MetricSnapshot:
    """Snapshot of metrics at a point in time"""
    timestamp: datetime
    total_purchases: int
    revenue_total: int
    revenue_creator: int
    revenue_platform: int
    unique_buyers: int
    unique_creators: int
    failed_purchases: int
    concurrent_purchases: int
    avg_response_time_ms: float
    error_rate: float


class MarketplaceMetrics:
    """
    Centralized metrics tracking for marketplace operations
    Tracks security events, performance, and business metrics
    """

    def __init__(self, window_minutes: int = 60):
        self.window_minutes = window_minutes
        self._lock = Lock()

        # Business metrics
        self.total_purchases = 0
        self.revenue_total = 0
        self.revenue_creator = 0
        self.revenue_platform = 0
        self.unique_buyers = set()
        self.unique_creators = set()

        # Performance metrics
        self.response_times = deque(maxlen=1000)
        self.concurrent_purchases = 0

        # Error tracking
        self.failed_purchases = 0
        self.error_counts = defaultdict(int)
        self.security_events = deque(maxlen=100)

        # Rate limiting tracking
        self.purchase_attempts = deque(maxlen=10000)

        # Historical snapshots
        self.snapshots = deque(maxlen=1440)  # 24 hours at 1-minute intervals

    def record_purchase(
        self,
        buyer_id: int,
        creator_id: int,
        template_id: int,
        credits_paid: int,
        creator_revenue: int,
        platform_commission: int,
        response_time_ms: float
    ):
        """Record successful purchase"""
        with self._lock:
            self.total_purchases += 1
            self.revenue_total += credits_paid
            self.revenue_creator += creator_revenue
            self.revenue_platform += platform_commission
            self.unique_buyers.add(buyer_id)
            self.unique_creators.add(creator_id)
            self.response_times.append(response_time_ms)

            logger.info(
                "purchase_recorded",
                buyer_id=buyer_id,
                creator_id=creator_id,
                template_id=template_id,
                credits=credits_paid,
                response_time_ms=response_time_ms
            )

    def record_purchase_failure(
        self,
        buyer_id: int,
        template_id: int,
        error_type: str,
        error_message: str
    ):
        """Record failed purchase attempt"""
        with self._lock:
            self.failed_purchases += 1
            self.error_counts[error_type] += 1

            logger.warning(
                "purchase_failed",
                buyer_id=buyer_id,
                template_id=template_id,
                error_type=error_type,
                error_message=error_message
            )

    def record_security_event(
        self,
        event_type: str,
        severity: str,
        details: Dict[str, Any],
        user_id: Optional[int] = None
    ):
        """Record security event for monitoring"""
        event = {
            "timestamp": datetime.utcnow(),
            "event_type": event_type,
            "severity": severity,
            "details": details,
            "user_id": user_id
        }

        with self._lock:
            self.security_events.append(event)

        logger.warning(
            "security_event",
            event_type=event_type,
            severity=severity,
            user_id=user_id,
            **details
        )

        # Alert on critical security events
        if severity == "critical":
            self._send_alert(event)

    def increment_concurrent_purchases(self):
        """Increment concurrent purchase counter"""
        with self._lock:
            self.concurrent_purchases += 1

    def decrement_concurrent_purchases(self):
        """Decrement concurrent purchase counter"""
        with self._lock:
            self.concurrent_purchases = max(0, self.concurrent_purchases - 1)

    def get_current_snapshot(self) -> MetricSnapshot:
        """Get current metrics snapshot"""
        with self._lock:
            avg_response_time = (
                sum(self.response_times) / len(self.response_times)
                if self.response_times else 0.0
            )

            error_rate = (
                self.failed_purchases / (self.total_purchases + self.failed_purchases)
                if (self.total_purchases + self.failed_purchases) > 0 else 0.0
            )

            return MetricSnapshot(
                timestamp=datetime.utcnow(),
                total_purchases=self.total_purchases,
                revenue_total=self.revenue_total,
                revenue_creator=self.revenue_creator,
                revenue_platform=self.revenue_platform,
                unique_buyers=len(self.unique_buyers),
                unique_creators=len(self.unique_creators),
                failed_purchases=self.failed_purchases,
                concurrent_purchases=self.concurrent_purchases,
                avg_response_time_ms=avg_response_time,
                error_rate=error_rate
            )

    def save_snapshot(self):
        """Save current metrics snapshot"""
        snapshot = self.get_current_snapshot()
        with self._lock:
            self.snapshots.append(snapshot)

    def get_health_status(self) -> Dict[str, Any]:
        """Get health status for monitoring"""
        snapshot = self.get_current_snapshot()

        # Determine health status
        is_healthy = True
        warnings = []

        # Check error rate
        if snapshot.error_rate > 0.05:  # 5% error rate threshold
            is_healthy = False
            warnings.append(f"High error rate: {snapshot.error_rate:.1%}")

        # Check response time
        if snapshot.avg_response_time_ms > 1000:  # 1 second threshold
            warnings.append(f"Slow response time: {snapshot.avg_response_time_ms:.0f}ms")

        # Check concurrent load
        if snapshot.concurrent_purchases > 50:
            warnings.append(f"High concurrent load: {snapshot.concurrent_purchases}")

        # Check recent security events
        recent_critical_events = [
            e for e in self.security_events
            if e["severity"] == "critical"
            and (datetime.utcnow() - e["timestamp"]).seconds < 300  # Last 5 minutes
        ]

        if recent_critical_events:
            is_healthy = False
            warnings.append(f"Critical security events: {len(recent_critical_events)}")

        return {
            "status": "healthy" if is_healthy else "degraded",
            "timestamp": datetime.utcnow().isoformat(),
            "warnings": warnings,
            "metrics": asdict(snapshot),
            "error_breakdown": dict(self.error_counts)
        }

    def check_rate_limit(self, user_id: int, max_per_minute: int = 10) -> bool:
        """Check if user is within rate limits"""
        now = time.time()
        cutoff = now - 60  # 1 minute window

        with self._lock:
            # Clean old attempts
            self.purchase_attempts = deque(
                [a for a in self.purchase_attempts if a[0] > cutoff],
                maxlen=10000
            )

            # Count user's attempts in window
            user_attempts = sum(1 for timestamp, uid in self.purchase_attempts if uid == user_id)

            if user_attempts >= max_per_minute:
                self.record_security_event(
                    event_type="rate_limit_exceeded",
                    severity="warning",
                    details={
                        "user_id": user_id,
                        "attempts": user_attempts,
                        "limit": max_per_minute
                    },
                    user_id=user_id
                )
                return False

            # Record this attempt
            self.purchase_attempts.append((now, user_id))
            return True

    def detect_anomalies(self) -> list[Dict[str, Any]]:
        """Detect anomalous patterns"""
        anomalies = []

        with self._lock:
            # Check for duplicate purchase attempts (race condition attempts)
            recent_purchases = list(self.purchase_attempts)[-100:]
            user_frequency = defaultdict(int)

            for _, user_id in recent_purchases:
                user_frequency[user_id] += 1

            # Flag users with suspicious frequency
            for user_id, count in user_frequency.items():
                if count > 5:  # More than 5 purchases in rolling window
                    anomalies.append({
                        "type": "suspicious_purchase_frequency",
                        "user_id": user_id,
                        "count": count,
                        "severity": "warning"
                    })

            # Check for revenue calculation anomalies
            if self.total_purchases > 0:
                expected_creator_percent = self.revenue_creator / self.revenue_total
                expected_platform_percent = self.revenue_platform / self.revenue_total

                if abs(expected_creator_percent - 0.85) > 0.01:
                    anomalies.append({
                        "type": "revenue_split_anomaly",
                        "expected": 0.85,
                        "actual": expected_creator_percent,
                        "severity": "critical"
                    })

        return anomalies

    def _send_alert(self, event: Dict[str, Any]):
        """Send alert for critical events"""
        # Integration point for alert services (email, Slack, PagerDuty, etc.)
        logger.error(
            "CRITICAL_ALERT",
            event_type=event["event_type"],
            details=event["details"],
            user_id=event.get("user_id")
        )

        # TODO: Integrate with actual alerting service
        # Example integrations:
        # - Send email via SMTP
        # - Post to Slack webhook
        # - Create PagerDuty incident
        # - Send SMS via Twilio

    def get_metrics_for_export(self) -> Dict[str, Any]:
        """Get metrics in format suitable for external monitoring (Prometheus, Datadog, etc.)"""
        snapshot = self.get_current_snapshot()

        return {
            # Counters
            "marketplace_purchases_total": snapshot.total_purchases,
            "marketplace_revenue_total": snapshot.revenue_total,
            "marketplace_revenue_creator": snapshot.revenue_creator,
            "marketplace_revenue_platform": snapshot.revenue_platform,
            "marketplace_purchase_failures_total": snapshot.failed_purchases,

            # Gauges
            "marketplace_unique_buyers": snapshot.unique_buyers,
            "marketplace_unique_creators": snapshot.unique_creators,
            "marketplace_concurrent_purchases": snapshot.concurrent_purchases,

            # Histograms
            "marketplace_response_time_ms": snapshot.avg_response_time_ms,
            "marketplace_error_rate": snapshot.error_rate,

            # Error breakdown
            "marketplace_errors_by_type": dict(self.error_counts)
        }


# Global metrics instance
_metrics_instance: Optional[MarketplaceMetrics] = None


def get_metrics() -> MarketplaceMetrics:
    """Get or create global metrics instance"""
    global _metrics_instance
    if _metrics_instance is None:
        _metrics_instance = MarketplaceMetrics()
    return _metrics_instance


# Context manager for tracking request timing
class MetricsTimer:
    """Context manager for tracking operation timing"""

    def __init__(self, operation_name: str):
        self.operation_name = operation_name
        self.start_time = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.time() - self.start_time) * 1000

        if exc_type is None:
            logger.info(
                "operation_completed",
                operation=self.operation_name,
                duration_ms=elapsed_ms
            )
        else:
            logger.error(
                "operation_failed",
                operation=self.operation_name,
                duration_ms=elapsed_ms,
                error=str(exc_val)
            )
