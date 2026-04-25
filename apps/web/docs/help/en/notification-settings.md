---
slug: notification-settings
title: Notification Preferences
description: Configure per-category notification delivery preferences
icon: BellRing
section: features
order: 66
pages: ["/settings"]
tags:
  - "notifications"
  - "preferences"
  - "categories"
  - "mute"
  - "email"
  - "digest"
  - "severity"
  - "settings"
  - "help"
  - "help/en"
  - "help/account"
  - "account"
  - "notification-settings"
aliases:
  - "notification-settings"
  - "Notification Preferences"
  - "Notification Preferences help"
---

# Notification Preferences

## Overview

Notification Preferences let you control how and when you receive notifications for each category. Access the Notifications tab from the Settings page to configure delivery channels, severity filters, and mute schedules per category.

**Feature flag:** `notificationPreferencesEnabled` must be enabled for the Notifications tab to appear in Settings.

## Categories

SmartAI Hub organizes notifications into 10 categories:

| Category | Description |
|----------|-------------|
| System Health | Infrastructure alerts, service outages, health check failures |
| Media Jobs | Media generation completion, failures, and quota warnings |
| Workflows | Workflow execution results, step completions, errors |
| Skills | Skill execution results, detection alerts |
| Feedback | User feedback submissions and responses |
| Agencies | Agency execution results, agent actions |
| Follows | Follow notifications from watched content or users |
| Scheduled Messages | Scheduled message deliveries and reminders |
| Security | Login alerts, 2FA changes, suspicious activity warnings |
| Business | Credit alerts, billing notifications, usage thresholds |

## Per-Category Controls

For each category, you can configure:

### Delivery Channels

- **In-App** — notifications appear in the notification bell and notification panel (enabled by default).
- **Email** — receive an email for high/critical notifications, or a batched digest for others.
- **Telegram** — receive notifications via Telegram bot (when configured).

### Minimum Severity

Set a severity floor per category. Notifications below this level are silently suppressed:

- **Low** — receive everything (default).
- **Normal** — skip low-priority notifications.
- **High** — only receive high and critical alerts.
- **Critical** — only the most urgent notifications.

### Mute

Temporarily mute a category until a specific date and time. Muted categories deliver no notifications until the mute expires. Useful during maintenance windows or known-noisy periods.

## Email Digest

Instead of receiving individual emails for every notification, configure a digest:

- **Hourly** — receive a summary email once per hour with all non-critical notifications.
- **Daily** — receive a daily digest at a chosen hour (0–23).

High and critical notifications are always sent immediately regardless of digest settings.

## Webhook Management

When the `notificationWebhookDelivery` feature flag is enabled, a **Webhook Management** section appears below the category preferences grid. Webhooks let you push notifications to external HTTP endpoints in real time.

### Creating a Webhook

- **Name** — a label for your reference (e.g., "Slack Alerts").
- **URL** — HTTPS endpoint that receives POST requests. Only public URLs are allowed (private/internal IPs are blocked for security).
- **Signing Secret** — auto-generated or custom (minimum 16 characters). Used to create an HMAC-SHA256 signature so your server can verify requests are genuine.
- **Categories** — optionally filter which notification categories trigger this webhook (e.g., only System Health and Security).
- **Minimum Severity** — optionally filter by minimum severity level.

### Webhook Payload

Each delivery sends a JSON POST with headers:

- `X-Signature-256: sha256=<hmac>` — HMAC-SHA256 over the body, using your signing secret.
- `X-Delivery-Timestamp` — ISO timestamp included in the signature to prevent replay attacks. Receivers should reject requests older than 5 minutes.
- `Content-Type: application/json`

### Auto-Disable

If a webhook endpoint fails 3 consecutive deliveries, it is automatically disabled. You will receive an in-app notification about the auto-disable. Re-enable it from the webhook settings after fixing the endpoint.

### Testing

Use the **Test** button to send a test payload to your webhook endpoint. The response status code is shown immediately so you can verify your integration works.

## Rate Limiting

To prevent notification flood, the system enforces a per-user rate limit:

- **200 notifications per 5 minutes** per user.
- If exceeded, new notifications are silently dropped for 1 minute.
- **Escalated notifications** (from escalation policies) are never rate limited — they always get through.

This protects against runaway automation or misconfigured alert rules generating excessive notifications.

## How Preferences Interact with Other Features

- **Escalation bypass** — escalated notifications (`isEscalated: true`) always bypass your preferences and rate limits, and are delivered through all channels.
- **Admin broadcasts** — system-wide admin broadcasts are always delivered regardless of category preferences.
- **Deduplication** — deduplicated notifications respect your preferences; you only see the grouped result.
- **Webhooks** — webhook delivery is separate from user preferences; webhooks fire based on their own category and severity filters.
- **Rate limiting** — applies before preference checks. If you are rate limited, the notification is dropped entirely.

## Tips

- Start by muting categories you don't need — you can always unmute later.
- Set "High" minimum severity for noisy categories like Media Jobs to focus on failures only.
- Use the hourly email digest to stay informed without inbox overload.
- Escalation policies will still reach you even if you've muted a category — this is by design for critical alerts.
- Test your webhooks after creation to verify the endpoint receives payloads correctly.
- If a webhook gets auto-disabled, check the endpoint health before re-enabling.

<!-- knowledge-graph:related:start -->
## Related Help

- [[settings|Settings & Preferences]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[api-keys|API Keys]]
- [[credits|Credits System]]
- [[profile|Profile & Account]]
- [[usage-analytics|Usage Analytics & Task Monitor]]
<!-- knowledge-graph:related:end -->
