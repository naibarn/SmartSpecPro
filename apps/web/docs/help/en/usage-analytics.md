---
slug: usage-analytics
title: Usage Analytics & Task Monitor
description: Track credit usage, model costs, and monitor background tasks
icon: BarChart3
section: features
order: 69
pages: ["/usage", "/tasks"]
tags: [usage, analytics, costs, statistics, tasks, queue, monitor, budget]
---

# Usage Analytics & Task Monitor

## Overview

SmartAI Hub gives you two dedicated views for staying on top of your consumption and background work: the **Usage Dashboard** at /usage and the **Task Queue Monitor** at /tasks. Use them together to understand where your credits are going and what the platform is doing in the background.

## Usage Dashboard (/usage)

The Usage Dashboard shows your credit consumption over time and breaks it down by model and feature type.

### Time range selector

Switch between daily, weekly, and monthly views using the range selector at the top of the page. The chart updates immediately to show consumption for that period.

### Credit consumption charts

- **Total credits used** — a bar or line chart of your overall consumption over the selected period.
- **By model** — see which LLM or media model consumed the most credits. Useful for optimizing model selection.
- **By feature** — breakdown by chat, media generation, agency runs, presentations, and other surfaces.

### Admin view — per-user breakdown

Admins see an additional table showing consumption broken down by user. This is useful for:

- Identifying heavy users who may need a higher credit allocation.
- Spotting unusual usage patterns that might indicate automation abuse.
- Exporting a report for billing or chargebacks.

### Cost analysis

The cost panel translates credit usage into approximate USD cost based on the model pricing configured by your admin. Use this to:

- Identify which models cost the most per request.
- Compare the cost of an agency run versus a direct chat query.
- Make decisions about enabling or restricting expensive models.

### Budget alerts

Admins can configure spending thresholds from **Admin → Settings → Credits and billing**:

- Set a monthly credit budget per user or for the entire domain.
- Users receive an in-app notification when they reach 80% and 100% of their budget.
- Admins receive a summary email when the domain budget is approaching the limit.

## Task Queue Monitor (/tasks)

The Task Queue Monitor shows background tasks that are running or have recently completed. Tasks are created when you trigger operations that take more than a few seconds.

### Task types

| Task type | Triggered by |
|---|---|
| Media generation | Generating images, videos, or audio |
| Presentation export | Exporting a presentation to PDF or video |
| Agency run | Starting a multi-agent agency workflow |
| Skill execution | Running a skill that calls external APIs |
| Document processing | Uploading and indexing a large document |

### Task statuses

| Status | Meaning |
|---|---|
| Pending | Task is queued and waiting for a worker |
| Running | Task is actively being processed |
| Completed | Task finished successfully |
| Failed | Task encountered an error — see the error message for details |

### Managing tasks

- **Cancel** — click the cancel button on a pending or running task to stop it. Credits for cancelled tasks may be partially refunded depending on how far processing has progressed.
- **Retry** — failed tasks show a Retry button. Click it to re-queue the task with the same parameters.
- **View result** — completed tasks link to their output (media file, presentation, library item).

## Tips for managing costs

- Prefer smaller models for simple drafts and switch to larger ones only for final output.
- Use **Prompt Enhancement** before generating images to get better results on the first attempt and avoid re-generations.
- Monitor the **By feature** breakdown regularly — agency runs tend to consume more credits than direct chat.
- Set budget alerts before you need them, not after you've already overspent.
