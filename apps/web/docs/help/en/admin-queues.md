---
slug: admin-queues
title: Queue Monitoring
description: Monitor LLM and media job queues
icon: BarChart3
section: admin
order: 110
pages: ["/admin/queues", "/admin/queues/llm", "/admin/queues/media"]
tags: [admin, queues, jobs, monitoring, llm queue, media queue, retry, failed]
---

# Queue Monitoring

## Overview

The Queue Monitoring dashboard gives administrators a real-time view into all background processing on the platform. LLM inference requests and media generation jobs run asynchronously through separate queues — this page is where you diagnose slowdowns, investigate failures, and manually intervene when needed.

## Queue Dashboard

The top-level dashboard shows a summary card for each queue:

- **Active** — jobs currently being processed.
- **Waiting** — jobs queued and waiting for a worker.
- **Completed** — successfully finished jobs in the last hour.
- **Failed** — jobs that errored out and need attention.

Health indicators use color coding: green (healthy), amber (elevated wait time or error rate), red (queue stalled or high failure rate).

## LLM Queue

The LLM queue handles all language model inference requests — chat messages, skill executions, prompt enhancements, and team discussion runs.

- **Filter** by status, user, model, or time range.
- Each job row shows: user, model requested, input token estimate, status, wait time, and processing time.
- **Job detail** — click a job to see the full request payload, response payload, provider selected, actual tokens used, cost in USD and credits, and any error message.
- **Trace ID** — each job has a traceId; use it to correlate with audit log entries.

## Media Queue

The media queue handles image, video, and audio generation tasks processed by Celery workers.

- Filter by media type (image, video, audio), status, user, or provider.
- Each job shows: user, media type, model/provider, estimated duration, status, and creation time.
- **Job detail** — shows the generation prompt, reference images (if any), provider response, output file URL, and timing breakdown.
- Long-running video generation jobs show a **progress percentage** when the provider supports it.

## Job details

Every job detail panel includes:

- **Request payload** — exactly what was sent to the provider.
- **Response payload** — what the provider returned, including raw error messages for failed jobs.
- **Timing** — queue wait time, processing time, total elapsed.
- **Cost** — credits charged and USD cost at the provider's rate.
- **Error** — full error message and stack trace for failed jobs.

## Retrying failed jobs

- Click **Retry** on any failed job to resubmit it with the original parameters.
- Retried jobs are treated as new jobs — they get a new job ID but preserve the original traceId for audit correlation.
- **Auto-retry** — configure the number of automatic retries and backoff interval in **Admin → System Settings → Queue**.
- Jobs that exceed the retry limit move to the **Dead Letter** state; they can still be manually retried.

## Health indicators

The queue dashboard calculates:

- **Throughput** — jobs completed per minute (LLM and media separately).
- **P50 / P95 latency** — median and tail processing time.
- **Error rate** — percentage of jobs that failed in the last 15 minutes.
- **Worker count** — active Celery workers and their current load.

Set alert thresholds in **Admin → System Settings → Monitoring** to receive notifications when any metric crosses a configured limit.
