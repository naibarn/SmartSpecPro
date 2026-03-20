"""
Alert configuration and notification system
Sends alerts via multiple channels when critical events occur
"""

import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum
import structlog
import httpx

logger = structlog.get_logger(__name__)


class AlertSeverity(str, Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertChannel(str, Enum):
    """Available alert channels"""
    LOG = "log"
    EMAIL = "email"
    SLACK = "slack"
    DISCORD = "discord"
    WEBHOOK = "webhook"
    IN_APP = "in_app"


class AlertRule:
    """Define an alert rule with conditions and actions"""

    def __init__(
        self,
        name: str,
        condition: callable,
        severity: AlertSeverity,
        channels: List[AlertChannel],
        message_template: str,
        cooldown_seconds: int = 300
    ):
        self.name = name
        self.condition = condition
        self.severity = severity
        self.channels = channels
        self.message_template = message_template
        self.cooldown_seconds = cooldown_seconds
        self.last_triggered = None

    def should_trigger(self, metrics: Dict[str, Any]) -> bool:
        """Check if alert should be triggered"""
        # Check cooldown
        if self.last_triggered:
            elapsed = (datetime.utcnow() - self.last_triggered).total_seconds()
            if elapsed < self.cooldown_seconds:
                return False

        # Check condition
        try:
            return self.condition(metrics)
        except Exception as e:
            logger.error("alert_condition_error", rule=self.name, error=str(e))
            return False

    def mark_triggered(self):
        """Mark alert as triggered"""
        self.last_triggered = datetime.utcnow()

    def format_message(self, metrics: Dict[str, Any]) -> str:
        """Format alert message with metrics"""
        return self.message_template.format(**metrics)


class AlertManager:
    """Manages alert rules and sends notifications"""

    def __init__(self):
        self.rules: List[AlertRule] = []
        self._http_client: Optional[httpx.AsyncClient] = None
        self._setup_default_rules()

    @property
    def http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=10.0)
        return self._http_client

    def _setup_default_rules(self):
        """Setup default alert rules for marketplace"""

        # High error rate alert
        self.rules.append(AlertRule(
            name="high_error_rate",
            condition=lambda m: m.get("error_rate", 0) > 0.05,
            severity=AlertSeverity.ERROR,
            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
            message_template="High error rate detected: {error_rate:.1%} (threshold: 5%)",
            cooldown_seconds=600  # 10 minutes
        ))

        # Slow response time alert
        self.rules.append(AlertRule(
            name="slow_response_time",
            condition=lambda m: m.get("avg_response_time_ms", 0) > 2000,
            severity=AlertSeverity.WARNING,
            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
            message_template="Slow response time: {avg_response_time_ms:.0f}ms (threshold: 2000ms)",
            cooldown_seconds=300  # 5 minutes
        ))

        # High concurrent load alert
        self.rules.append(AlertRule(
            name="high_concurrent_load",
            condition=lambda m: m.get("concurrent_purchases", 0) > 100,
            severity=AlertSeverity.WARNING,
            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
            message_template="High concurrent load: {concurrent_purchases} purchases in progress",
            cooldown_seconds=300
        ))

        # Revenue anomaly alert
        self.rules.append(AlertRule(
            name="revenue_split_anomaly",
            condition=lambda m: self._check_revenue_anomaly(m),
            severity=AlertSeverity.CRITICAL,
            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
            message_template=(
                "Revenue split anomaly detected! Expected 85/15 split, "
                "got creator={creator_percent:.1%}, platform={platform_percent:.1%}"
            ),
            cooldown_seconds=3600  # 1 hour
        ))

        # No purchases alert (business monitoring)
        self.rules.append(AlertRule(
            name="no_recent_purchases",
            condition=lambda m: m.get("total_purchases", 0) == 0 and m.get("uptime_hours", 0) > 1,
            severity=AlertSeverity.INFO,
            channels=[AlertChannel.LOG],
            message_template="No purchases in the last hour",
            cooldown_seconds=3600
        ))

    def _check_revenue_anomaly(self, metrics: Dict[str, Any]) -> bool:
        """Check for revenue split anomaly"""
        revenue_total = metrics.get("revenue_total", 0)
        if revenue_total == 0:
            return False

        revenue_creator = metrics.get("revenue_creator", 0)
        revenue_platform = metrics.get("revenue_platform", 0)

        creator_percent = revenue_creator / revenue_total
        platform_percent = revenue_platform / revenue_total

        # Check if split deviates from 85/15 by more than 1%
        return abs(creator_percent - 0.85) > 0.01 or abs(platform_percent - 0.15) > 0.01

    async def check_and_send_alerts(self, metrics: Dict[str, Any]):
        """Check all rules and send alerts if triggered"""
        for rule in self.rules:
            if rule.should_trigger(metrics):
                await self._send_alert(rule, metrics)
                rule.mark_triggered()

    async def _send_alert(self, rule: AlertRule, metrics: Dict[str, Any]):
        """Send alert through configured channels"""
        message = rule.format_message(metrics)

        logger.info(
            "alert_triggered",
            rule=rule.name,
            severity=rule.severity,
            message=message
        )

        # Send through each channel concurrently
        tasks = []
        for channel in rule.channels:
            tasks.append(self._send_to_channel(channel, rule, message, metrics))
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_to_channel(
        self, channel: AlertChannel, rule: AlertRule, message: str, metrics: Dict[str, Any]
    ):
        """Send to a single channel with error handling"""
        try:
            if channel == AlertChannel.LOG:
                await self._send_log_alert(rule, message, metrics)
            elif channel == AlertChannel.SLACK:
                await self._send_slack_alert(rule, message, metrics)
            elif channel == AlertChannel.DISCORD:
                await self._send_discord_alert(rule, message, metrics)
            elif channel == AlertChannel.WEBHOOK:
                await self._send_webhook_alert(rule, message, metrics)
            elif channel == AlertChannel.IN_APP:
                await self._send_in_app_alert(rule, message, metrics)
        except Exception as e:
            logger.error(
                "alert_send_failed",
                rule=rule.name,
                channel=channel,
                error=str(e)
            )

    async def _send_log_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to logs"""
        log_method = {
            AlertSeverity.INFO: logger.info,
            AlertSeverity.WARNING: logger.warning,
            AlertSeverity.ERROR: logger.error,
            AlertSeverity.CRITICAL: logger.critical
        }.get(rule.severity, logger.info)

        # Scrub financial/PII metrics before logging
        safe_metrics = {
            k: v for k, v in metrics.items()
            if not k.startswith("revenue_") and k not in ("creator_percent", "platform_percent")
        }
        log_method(
            "ALERT",
            rule=rule.name,
            severity=rule.severity,
            message=message,
            metrics=safe_metrics
        )

    async def _send_slack_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to Slack via webhook"""
        webhook_url = os.getenv("SLACK_WEBHOOK_URL")
        if not webhook_url:
            logger.debug("slack_webhook_not_configured")
            return

        color_map = {
            AlertSeverity.INFO: "#36a64f",
            AlertSeverity.WARNING: "#ff9900",
            AlertSeverity.ERROR: "#ff0000",
            AlertSeverity.CRITICAL: "#990000"
        }

        payload = {
            "attachments": [{
                "color": color_map.get(rule.severity, "#cccccc"),
                "title": f"[{rule.severity.value.upper()}] {rule.name}",
                "text": message,
                "fields": [
                    {"title": "Severity", "value": rule.severity.value.upper(), "short": True},
                    {"title": "Timestamp", "value": datetime.utcnow().isoformat(), "short": True},
                ],
                "footer": "SmartSpecPro Monitoring"
            }]
        }

        # Add key metrics to fields
        for key in ["error_rate", "avg_response_time_ms", "concurrent_purchases"]:
            if key in metrics:
                val = metrics[key]
                if key == "error_rate":
                    val = f"{val:.1%}"
                elif key == "avg_response_time_ms":
                    val = f"{val:.0f}ms"
                payload["attachments"][0]["fields"].append({
                    "title": key.replace("_", " ").title(),
                    "value": str(val),
                    "short": True
                })

        resp = await self.http_client.post(webhook_url, json=payload)
        if resp.status_code != 200:
            logger.error("slack_alert_failed", status=resp.status_code, body=resp.text[:200])

    async def _send_discord_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to Discord via webhook"""
        webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
        if not webhook_url:
            logger.debug("discord_webhook_not_configured")
            return

        color_map = {
            AlertSeverity.INFO: 3581519,     # Green
            AlertSeverity.WARNING: 16761095,  # Orange
            AlertSeverity.ERROR: 16711680,    # Red
            AlertSeverity.CRITICAL: 10027008  # Dark Red
        }

        payload = {
            "embeds": [{
                "title": f"[{rule.severity.value.upper()}] {rule.name}",
                "description": message,
                "color": color_map.get(rule.severity, 8421504),
                "timestamp": datetime.utcnow().isoformat(),
                "fields": [
                    {"name": "Severity", "value": rule.severity.value.upper(), "inline": True},
                ],
                "footer": {"text": "SmartSpecPro Monitoring"}
            }]
        }

        resp = await self.http_client.post(webhook_url, json=payload)
        if resp.status_code not in (200, 204):
            logger.error("discord_alert_failed", status=resp.status_code, body=resp.text[:200])

    async def _send_webhook_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to generic webhook"""
        webhook_url = os.getenv("ALERT_WEBHOOK_URL")
        if not webhook_url:
            logger.debug("generic_webhook_not_configured")
            return

        payload = {
            "rule": rule.name,
            "severity": rule.severity.value,
            "message": message,
            "metrics": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }

        resp = await self.http_client.post(webhook_url, json=payload)
        if resp.status_code not in (200, 201, 204):
            logger.error("webhook_alert_failed", status=resp.status_code, body=resp.text[:200])

    async def _send_in_app_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Forward alert to Node.js notification system via internal API.

        Creates in-app notifications for admin users by calling the web app's
        internal notification endpoint.
        """
        web_base = os.getenv("WEB_APP_URL", "http://localhost:3000")
        gateway_token = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")

        if not gateway_token:
            logger.debug("in_app_alert_skipped", reason="no gateway token")
            return

        # Map severity to priority
        priority_map = {
            AlertSeverity.INFO: "low",
            AlertSeverity.WARNING: "normal",
            AlertSeverity.ERROR: "high",
            AlertSeverity.CRITICAL: "critical",
        }

        # Map rule names to resource types and action URLs
        action_map = {
            "high_error_rate": ("/admin/system-guardian", "View System Guardian"),
            "slow_response_time": ("/admin/system-guardian", "View System Guardian"),
            "high_concurrent_load": ("/admin/queues", "View Queues"),
            "revenue_split_anomaly": ("/admin/settings", "View Settings"),
            "no_recent_purchases": ("/admin/settings", "View Settings"),
        }

        action_url, action_label = action_map.get(rule.name, ("/admin/system-guardian", "View Details"))

        payload = {
            "type": "alert",
            "title": f"[{rule.severity.value.upper()}] {rule.name.replace('_', ' ').title()}",
            "content": message,
            "priority": priority_map.get(rule.severity, "normal"),
            "relatedResourceType": "system_health",
            "actionUrl": action_url,
            "actionLabel": action_label,
            "groupKey": f"python_alert:{rule.name}",
            "metadata": {
                "source": f"python.monitoring.{rule.name}",
                "metrics": {k: v for k, v in metrics.items() if isinstance(v, (int, float, str, bool))},
            },
        }

        try:
            resp = await self.http_client.post(
                f"{web_base}/api/internal/notifications/admin-broadcast",
                json=payload,
                headers={
                    "Authorization": f"Bearer {gateway_token}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code in (200, 201):
                logger.info("in_app_alert_sent", rule=rule.name)
            else:
                logger.warning(
                    "in_app_alert_failed",
                    rule=rule.name,
                    status=resp.status_code,
                    body=resp.text[:200],
                )
        except httpx.RequestError as e:
            logger.warning("in_app_alert_unreachable", rule=rule.name, error=str(e))

    async def close(self):
        """Close HTTP client"""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()


# Global alert manager instance
_alert_manager: Optional[AlertManager] = None


def get_alert_manager() -> AlertManager:
    """Get or create global alert manager instance"""
    global _alert_manager
    if _alert_manager is None:
        _alert_manager = AlertManager()
    return _alert_manager
