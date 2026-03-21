---
slug: notification-settings
title: Notification Preferences
description: Configure per-category notification delivery preferences
icon: BellRing
section: features
order: 66
pages: ["/settings"]
tags: [notifications, preferences, categories, mute, email, digest, severity, settings]
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

## How Preferences Interact with Other Features

- **Escalation bypass** — escalated notifications (`isEscalated: true`) always bypass your preferences and are delivered through all channels.
- **Admin broadcasts** — system-wide admin broadcasts are always delivered regardless of category preferences.
- **Deduplication** — deduplicated notifications respect your preferences; you only see the grouped result.
- **Webhooks** — webhook delivery is separate from user preferences; webhooks fire based on their own category and severity filters.

## Tips

- Start by muting categories you don't need — you can always unmute later.
- Set "High" minimum severity for noisy categories like Media Jobs to focus on failures only.
- Use the hourly email digest to stay informed without inbox overload.
- Escalation policies will still reach you even if you've muted a category — this is by design for critical alerts.
