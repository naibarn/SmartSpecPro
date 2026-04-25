---
slug: admin-ops
title: Ops Dashboard
description: Real-time operational monitoring and system health
icon: Activity
section: admin
order: 85
pages: ["/admin/ops"]
tags:
  - "admin"
  - "ops"
  - "monitoring"
  - "health"
  - "services"
  - "metrics"
  - "dashboard"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-ops"
aliases:
  - "admin-ops"
  - "Ops Dashboard"
  - "Ops Dashboard help"
---

# Ops Dashboard

## Overview

The Ops Dashboard provides real-time operational monitoring for system administrators. View system health, active services, error rates, response times, queue depths, and worker status at a glance.

## System health

The top section shows overall system health:

- **Service status** — green/yellow/red indicators for each service (web, backend, database, Redis, Celery).
- **Uptime** — how long each service has been running without restart.
- **Error rate** — percentage of requests returning errors in the last hour.

## Key metrics

| Metric | Description |
|--------|-------------|
| Response time | Average API response time (P50, P95, P99) |
| Request throughput | Requests per second across all endpoints |
| Queue depth | Number of pending jobs in BullMQ and Celery queues |
| Worker count | Active Celery workers and their task load |
| Database connections | Active/idle PostgreSQL connection pool status |
| Redis memory | Current Redis memory usage and eviction rate |

## Error monitoring

- Recent errors are listed with timestamp, endpoint, and error message.
- Click an error to view the full stack trace and request details.
- Errors are grouped by type to identify recurring issues.

## Worker status

View Celery worker details:

- **Active tasks** — what each worker is currently processing.
- **Completed** — tasks finished in the last hour.
- **Failed** — tasks that errored with failure reason.

## Tips

- Check the Ops Dashboard after deployments to verify system stability.
- Monitor queue depth — if it grows steadily, workers may need scaling.
- Use error grouping to prioritize which bugs to fix first.

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
