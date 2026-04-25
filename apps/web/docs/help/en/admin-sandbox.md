---
slug: admin-sandbox
title: Sandbox Management
description: Manage and monitor isolated code execution environments and jobs.
icon: Container
section: admin
order: 230
pages: ["/admin/sandbox"]
tags:
  - "admin"
  - "sandbox"
  - "code execution"
  - "jobs"
  - "isolated"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-sandbox"
aliases:
  - "admin-sandbox"
  - "Sandbox Management"
  - "Sandbox Management help"
---

# Sandbox Management

## Overview
Sandbox Management lets administrators view and control isolated code execution jobs. Each sandbox runs in a fully isolated environment, preventing jobs from interfering with each other or with platform services. Use this page to monitor resource usage, inspect job output, and clean up stale or failed runs.

## Getting there
Log in as an administrator and navigate to **Admin > Sandbox** from the left sidebar.

## Key capabilities
- View all sandbox jobs grouped by status: running, completed, and failed
- Inspect job metadata including start time, duration, and resource consumption
- Terminate a running job that is consuming excessive resources
- Clear completed or failed job records to keep the list manageable
- See the isolated environment configuration (memory limit, timeout) for each job

## Workflow / How to use
1. Open **Admin > Sandbox**. The table loads with the most recent jobs at the top.
2. Use the **Status** filter tabs to narrow the view to Running, Completed, or Failed jobs.
3. Click a job row to expand its detail panel and see stdout/stderr output and resource metrics.
4. To stop a running job, open its detail panel and click **Terminate**. Confirm the prompt.
5. To remove old records, select one or more completed jobs and click **Delete selected**.
6. Use the **Refresh** button or enable auto-refresh to see live updates without reloading the page.

## Tips
- Failed jobs retain their output logs. Always review the log before deleting to understand the root cause.
- Jobs that exceed the configured timeout are automatically moved to Failed status.
- If a job appears stuck in Running for an unusually long time, check system health to confirm workers are responsive before terminating.
- Resource limits (memory, CPU) are set globally in platform settings; contact your infrastructure team to adjust them.

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
