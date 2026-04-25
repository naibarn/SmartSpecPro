---
slug: admin-system-guardian
title: System Guardian
description: Monitor system health, manage incidents, and configure automated responses
icon: ShieldCheck
section: admin
order: 60
pages: ["/admin/system-guardian"]
tags:
  - "guardian"
  - "monitor"
  - "incident"
  - "sensor"
  - "health"
  - "approval"
  - "auto-fix"
  - "watchdog"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin"
  - "admin-system-guardian"
aliases:
  - "admin-system-guardian"
  - "System Guardian"
  - "System Guardian help"
---

# System Guardian

## Overview

System Guardian is the platform's automated watchdog. It continuously monitors 11 system sensors, raises incidents when thresholds are breached, and can apply approved fixes without human intervention. The Guardian gives admins a single command center for system health instead of checking individual dashboards separately.

> **Tip:** Enable the Guardian on every tenant to get early warnings before users notice a degradation.

## Dashboard Tabs

The Guardian page has four tabs:

| Tab | Purpose |
|-----|---------|
| **Incidents** | Active and resolved incident log |
| **Approvals** | Pending actions that require admin sign-off |
| **Sensors** | Real-time status of all 11 health sensors |
| **Chat** | Command-line interface for querying and controlling the Guardian |

## Incident Management

### Severity Levels

| Level | Color | Meaning |
|-------|-------|---------|
| `info` | Blue | Informational — no action needed |
| `warning` | Amber | Degraded performance — monitor closely |
| `error` | Orange | Service impaired — action recommended |
| `critical` | Red | Service down — immediate action required |

### Incident Actions

- **Acknowledge** — Marks the incident as seen. Stops repeat notifications. The incident stays open until resolved.
- **Resolve** — Closes the incident. Records resolution time and calculates MTTR.

Click any incident row to expand the full detail panel, which includes the triggering sensor reading, timeline of status changes, and any auto-fix attempts that were made.

### System Health Banner

When any `critical` incident is open, a red banner appears at the top of every admin page. It links directly to the incident. The banner clears automatically when the incident is resolved.

## Approval Workflow

Some Guardian actions — such as restarting a worker or flushing a queue — require explicit admin approval before execution.

1. The Guardian raises an **Approval Request** with a description of what action it wants to take and why.
2. An admin reviews the request in the **Approvals** tab.
3. Click **Approve** or **Reject**.

> **Note:** Approvals use optimistic locking. If two admins attempt to act on the same request simultaneously, only the first will succeed — the second sees an "already actioned" message.

## Sensor Status

The **Sensors** tab shows the current reading for each of the 11 monitored sensors:

| Sensor | What It Monitors |
|--------|----------------|
| Queue Health | BullMQ queue depth and stall rate |
| Celery | Worker availability and task failure rate |
| Error Spike | Error rate across all tRPC endpoints |
| LLM Provider | Provider availability and latency |
| Credit Balance | Tenant credit balance below threshold |
| Disk | Disk usage on media storage volume |
| Database | PostgreSQL connection pool and query latency |
| Certificate | TLS certificate expiry (warns at 30 days) |
| API Latency | P95 latency across all API endpoints |
| Media Pipeline | Success rate for image/video generation tasks |
| Team Escalation | Unacknowledged incidents older than 30 minutes |

Each sensor shows a **status badge** (OK / Warning / Error / Critical) and the **last reading** with a timestamp.

## Guardian Chat

The **Chat** tab lets you query or control the Guardian using simple commands:

| Command | Action |
|---------|--------|
| `status` | Show overall health summary and open incident count |
| `incidents` | List all open incidents |
| `retry <id>` | Retry the auto-fix for a specific incident |
| `approve <id>` | Approve a pending approval request |
| `queue` | Show current queue depths for LLM and media queues |
| `help` | List all available commands |

Example:
```
> status
Guardian: OK — 0 critical, 1 warning (queue health), last scan 12s ago
```

## Settings

Open **Admin → System Settings → Guardian** to configure:

- **Enable / Disable Guardian** — Toggle automated monitoring on or off for the tenant.
- **Auto-fix per tenant** — Allow the Guardian to apply low-risk fixes (e.g., clearing a stuck job) without approval.
- **Notification channels** — Choose where incident alerts are sent: in-app, email, Slack, or PagerDuty webhook.

> **Tip:** Use per-tenant auto-fix only on tenants where you trust the Guardian's judgment. For production tenants, keep manual approvals enabled.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-approvals|Approvals]]
- [[admin-audit|Audit Logs]]
<!-- knowledge-graph:related:end -->
