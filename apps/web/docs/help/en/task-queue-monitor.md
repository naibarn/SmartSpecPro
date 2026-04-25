---
slug: task-queue-monitor
title: Task Queue Monitor
description: Monitor Celery background task queues including worker status, throughput, and failed job details.
icon: ListTodo
section: admin
order: 290
pages: ["/admin/task-queue"]
tags:
  - "admin"
  - "task queue"
  - "jobs"
  - "Celery"
  - "monitoring"
  - "workers"
  - "help"
  - "help/en"
  - "help/core"
  - "core"
  - "task-queue-monitor"
aliases:
  - "task-queue-monitor"
  - "Task Queue Monitor"
  - "Task Queue Monitor help"
---

# Task Queue Monitor

## Overview
The Task Queue Monitor gives administrators a live view of all background tasks running through the Celery queue system. Background tasks handle resource-intensive work such as media generation, video processing, and skill execution. This page shows active, pending, completed, and failed tasks alongside worker health and throughput metrics, making it the primary tool for diagnosing stuck or slow generation jobs.

## Getting there
Log in as an administrator and navigate to **Admin > Task Queue** from the left sidebar.

## Key capabilities
- View all tasks grouped by status: active, pending (queued), completed, and failed
- See which worker processed (or is processing) each task
- Inspect task input arguments, output, and error traceback for failed tasks
- Monitor worker count, worker uptime, and tasks-per-minute throughput
- View retry counts for tasks that have been automatically retried
- Manually retry a failed task without resubmitting from the UI
- Revoke (cancel) a pending or active task that should not run

## Workflow / How to use
1. Open **Admin > Task Queue**. The **Workers** panel at the top shows how many Celery workers are online and their combined throughput.
2. Use the **Status** tabs to switch between Active, Pending, Completed, and Failed task lists.
3. Each task row shows the task name, queue name, submission time, and current state. Click a row to open the detail panel.
4. In the detail panel, review the **Arguments** section to confirm the task received the correct input, and the **Result / Error** section for output or traceback.
5. For a failed task, read the traceback to identify the root cause. If the failure is transient (e.g., a temporary provider outage), click **Retry** to re-queue the task immediately.
6. To cancel a task that is stuck or should no longer run, click **Revoke**. Active tasks will be terminated at the next safe checkpoint; pending tasks are removed from the queue.
7. Use the **Queue** filter dropdown to focus on a specific queue (e.g., `media`, `video`, `default`) when one queue is backing up.

## Tips
- A large Pending count with zero Active tasks is the most common sign that all workers are down. Check System Health to confirm worker status and restart the Celery service if needed.
- Tasks with a high retry count (3 or more) indicate a persistent failure. Retrying further without fixing the underlying cause wastes credits and delays users. Investigate the traceback first.
- Media generation tasks can take 30-120 seconds under normal conditions. Only treat a task as stuck if it has been Active for more than 5 minutes without completing.
- The throughput metric (tasks per minute) drops to zero when no tasks are being processed, not necessarily when workers are down. Check the worker count to distinguish an idle system from an outage.
- Completed tasks are retained for 12 days before automatic cleanup. Use the date filter to narrow searches when looking for a specific historical task.

<!-- knowledge-graph:related:start -->
## Related Help

- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[content-quality-dashboard|Content Quality]]
<!-- knowledge-graph:related:end -->
