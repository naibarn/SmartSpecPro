---
slug: admin-system-health
title: System Health
description: Real-time dashboard showing the status and performance of all platform services.
icon: Activity
section: admin
order: 250
pages: ["/admin/system-health"]
tags: [admin, system health, monitoring, services, status, uptime]
---

# System Health

## Overview
The System Health dashboard gives administrators a live view of every critical service in the platform. It tracks uptime, response times, and error rates for the database, Redis cache, Celery workers, LLM providers, and other dependencies. Use this page as the first stop when investigating slowdowns or outages.

## Getting there
Log in as an administrator and navigate to **Admin > System Health** from the left sidebar.

## Key capabilities
- See the current status (Healthy, Degraded, Down) of each service at a glance
- View uptime percentage and mean response time for each component over the last 24 hours
- Inspect recent error rates and compare them against baseline thresholds
- Drill into a service card for a historical status timeline
- Receive inline alerts when a service transitions from Healthy to Degraded or Down
- Manually trigger a health check on demand for any individual service

## Workflow / How to use
1. Open **Admin > System Health**. The overview grid shows all services with color-coded status badges.
2. Check the **Overall Status** banner at the top. A green banner means all services are healthy; yellow indicates degradation; red indicates one or more services are down.
3. Click any service card to expand the detail panel. Review the last 10 health check results, response time trend chart, and recent error messages.
4. To force an immediate health check rather than waiting for the next scheduled check, click **Check now** inside the detail panel.
5. Use the **Time range** selector to review historical status from the past 1 hour, 6 hours, 24 hours, or 7 days.
6. If a service is degraded, use the linked documentation or the **Runbook** button (where configured) for guided remediation steps.

## Tips
- The dashboard auto-refreshes every 30 seconds. You do not need to reload the page manually.
- LLM provider health checks verify connectivity and model availability; a Degraded status may indicate a provider outage rather than a platform issue.
- Celery worker status reflects the number of active workers. A count of zero means no tasks can be processed; restart the worker service immediately.
- Redis latency above 50 ms consistently indicates memory pressure or network issues between the app server and Redis host.
- Keep this page open during deployments to catch regressions before users report them.
