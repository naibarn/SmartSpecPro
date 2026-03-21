---
slug: admin-notifications
title: Notification Center
description: Unified notification dashboard for monitoring and managing all system notifications
icon: Bell
section: admin
order: 115
pages: ["/admin/notifications"]
tags: [admin, notifications, alerts, monitoring, unified, dedup, escalation, dashboard]
---

# Notification Center

## Overview

The Notification Center is a unified admin dashboard that aggregates notifications from all sources — user notifications, orchestrator events, and Guardian alerts — into a single view. Use it to monitor system health, track unacknowledged alerts, and review notification delivery patterns.

**Feature flag:** `notificationUnifiedCenter` must be enabled for this page to appear.

## Dashboard Cards

Four summary cards at the top provide a quick pulse:

- **Total** — total notifications across all sources in the selected time range.
- **Unread** — notifications that have not been opened or acknowledged.
- **Critical** — high and critical severity notifications that may need immediate attention.
- **Today** — notifications created in the last 24 hours.

## Unified Notification List

The main table shows notifications from all sources, sorted newest first. Each row shows:

- Source badge (User, Orchestrator, Guardian)
- Severity indicator (low, normal, high, critical)
- Title, content preview, and timestamp
- Related resource link (if available)

### Filtering

- **Source** — filter by User Notifications, Orchestrator, or Guardian.
- **Severity** — filter by low, normal, high, or critical.
- **Date range** — start and end date pickers to narrow the time window.
- **Pagination** — page through results (20 per page).

## Notification Deduplication

When deduplication is enabled (`notificationDedupEnabled`), repeated notifications with the same `groupKey` are collapsed into a single entry:

- **Occurrence badge** (×N) — shows how many times the event has occurred.
- **Expand group** — click to view all individual occurrences with their timestamps.
- **First / Last occurred** — time range of the grouped events.

This prevents alert fatigue from repeated events like recurring health check failures or repeated job errors.

## Detail Panel

Click any notification to open the detail panel showing:

- Full notification content
- Metadata (source, event ID, error details, metrics)
- Action button (navigates to the related resource)
- Dismiss / Mark as read controls

## Health Monitoring

The notification health status is available via the monitoring API (`monitoring.notificationHealth`). It checks three probes:

1. **Redis Pub/Sub** — round-trip latency test (alert if timeout > 5s).
2. **Admin Broadcast** — error rate over a 5-minute sliding window (alert if > 10%).
3. **SSE Connections** — active real-time connection count (alert if > 500).

## Tips

- Use severity filters to focus on critical and high-priority items first.
- Check the notification center after deploying changes to catch early health warnings.
- Notifications older than the retention period (configured in retention job) are automatically cleaned up.
- Enable deduplication to reduce noise from repeated alerts — configure `groupKey` patterns in notification call sites.
