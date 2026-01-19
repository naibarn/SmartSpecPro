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
        self._setup_default_rules()

    def _setup_default_rules(self):
        """Setup default alert rules for marketplace"""

        # High error rate alert
        self.rules.append(AlertRule(
            name="high_error_rate",
            condition=lambda m: m.get("error_rate", 0) > 0.05,
            severity=AlertSeverity.ERROR,
            channels=[AlertChannel.LOG, AlertChannel.EMAIL, AlertChannel.SLACK],
            message_template="High error rate detected: {error_rate:.1%} (threshold: 5%)",
            cooldown_seconds=600  # 10 minutes
        ))

        # Slow response time alert
        self.rules.append(AlertRule(
            name="slow_response_time",
            condition=lambda m: m.get("avg_response_time_ms", 0) > 2000,
            severity=AlertSeverity.WARNING,
            channels=[AlertChannel.LOG, AlertChannel.SLACK],
            message_template="Slow response time: {avg_response_time_ms:.0f}ms (threshold: 2000ms)",
            cooldown_seconds=300  # 5 minutes
        ))

        # High concurrent load alert
        self.rules.append(AlertRule(
            name="high_concurrent_load",
            condition=lambda m: m.get("concurrent_purchases", 0) > 100,
            severity=AlertSeverity.WARNING,
            channels=[AlertChannel.LOG, AlertChannel.SLACK],
            message_template="High concurrent load: {concurrent_purchases} purchases in progress",
            cooldown_seconds=300
        ))

        # Revenue anomaly alert
        self.rules.append(AlertRule(
            name="revenue_split_anomaly",
            condition=lambda m: self._check_revenue_anomaly(m),
            severity=AlertSeverity.CRITICAL,
            channels=[AlertChannel.LOG, AlertChannel.EMAIL, AlertChannel.SLACK],
            message_template="Revenue split anomaly detected! Expected 85/15 split, got creator={creator_percent:.1%}, platform={platform_percent:.1%}",
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

        # Send through each channel
        for channel in rule.channels:
            try:
                if channel == AlertChannel.LOG:
                    await self._send_log_alert(rule, message, metrics)
                elif channel == AlertChannel.EMAIL:
                    await self._send_email_alert(rule, message, metrics)
                elif channel == AlertChannel.SLACK:
                    await self._send_slack_alert(rule, message, metrics)
                elif channel == AlertChannel.DISCORD:
                    await self._send_discord_alert(rule, message, metrics)
                elif channel == AlertChannel.WEBHOOK:
                    await self._send_webhook_alert(rule, message, metrics)
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

        log_method(
            "ALERT",
            rule=rule.name,
            severity=rule.severity,
            message=message,
            metrics=metrics
        )

    async def _send_email_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert via email"""
        # TODO: Implement email sending
        # Use aiosmtplib or similar
        email_to = os.getenv("ALERT_EMAIL", "admin@smartspec.pro")

        logger.info(
            "email_alert_pending",
            to=email_to,
            subject=f"[{rule.severity.upper()}] {rule.name}",
            message=message
        )

        # Example implementation:
        # import aiosmtplib
        # from email.message import EmailMessage
        #
        # msg = EmailMessage()
        # msg["From"] = "alerts@smartspec.pro"
        # msg["To"] = email_to
        # msg["Subject"] = f"[{rule.severity.upper()}] {rule.name}"
        # msg.set_content(f"{message}\n\nMetrics:\n{json.dumps(metrics, indent=2)}")
        #
        # await aiosmtplib.send(msg, hostname="smtp.gmail.com", port=587, ...)

    async def _send_slack_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to Slack"""
        webhook_url = os.getenv("SLACK_WEBHOOK_URL")
        if not webhook_url:
            logger.warning("slack_webhook_not_configured")
            return

        # Slack color coding
        color_map = {
            AlertSeverity.INFO: "#36a64f",
            AlertSeverity.WARNING: "#ff9900",
            AlertSeverity.ERROR: "#ff0000",
            AlertSeverity.CRITICAL: "#990000"
        }

        payload = {
            "attachments": [{
                "color": color_map.get(rule.severity, "#cccccc"),
                "title": f"🚨 {rule.name}",
                "text": message,
                "fields": [
                    {"title": "Severity", "value": rule.severity.upper(), "short": True},
                    {"title": "Timestamp", "value": datetime.utcnow().isoformat(), "short": True},
                ],
                "footer": "SmartSpecPro Marketplace Monitoring"
            }]
        }

        # Add key metrics to fields
        if "error_rate" in metrics:
            payload["attachments"][0]["fields"].append({
                "title": "Error Rate",
                "value": f"{metrics['error_rate']:.1%}",
                "short": True
            })

        if "avg_response_time_ms" in metrics:
            payload["attachments"][0]["fields"].append({
                "title": "Avg Response Time",
                "value": f"{metrics['avg_response_time_ms']:.0f}ms",
                "short": True
            })

        logger.info("slack_alert_pending", webhook_url=webhook_url[:30] + "...")

        # TODO: Send actual HTTP request
        # import aiohttp
        # async with aiohttp.ClientSession() as session:
        #     async with session.post(webhook_url, json=payload) as response:
        #         if response.status != 200:
        #             logger.error("slack_alert_failed", status=response.status)

    async def _send_discord_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to Discord"""
        webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
        if not webhook_url:
            logger.warning("discord_webhook_not_configured")
            return

        # Discord color coding (decimal)
        color_map = {
            AlertSeverity.INFO: 3581519,    # Green
            AlertSeverity.WARNING: 16761095, # Orange
            AlertSeverity.ERROR: 16711680,  # Red
            AlertSeverity.CRITICAL: 10027008 # Dark Red
        }

        payload = {
            "embeds": [{
                "title": f"🚨 {rule.name}",
                "description": message,
                "color": color_map.get(rule.severity, 8421504),
                "timestamp": datetime.utcnow().isoformat(),
                "fields": [
                    {"name": "Severity", "value": rule.severity.upper(), "inline": True},
                ],
                "footer": {"text": "SmartSpecPro Marketplace"}
            }]
        }

        logger.info("discord_alert_pending", webhook_url=webhook_url[:30] + "...")

    async def _send_webhook_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
        """Send alert to generic webhook"""
        webhook_url = os.getenv("ALERT_WEBHOOK_URL")
        if not webhook_url:
            logger.warning("generic_webhook_not_configured")
            return

        payload = {
            "rule": rule.name,
            "severity": rule.severity,
            "message": message,
            "metrics": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }

        logger.info("webhook_alert_pending", webhook_url=webhook_url[:30] + "...")

        # TODO: Send actual HTTP request


# Global alert manager instance
_alert_manager: Optional[AlertManager] = None


def get_alert_manager() -> AlertManager:
    """Get or create global alert manager instance"""
    global _alert_manager
    if _alert_manager is None:
        _alert_manager = AlertManager()
    return _alert_manager
