---
slug: admin-guardian
title: System Guardian
description: AI-powered system monitoring dashboard for incidents, sensors, approvals, and Guardian Chat
icon: ShieldCheck
section: admin
order: 200
pages: ["/admin/guardian"]
tags: [admin, guardian, monitoring, incidents, sensors, approvals, AI admin]
---

# System Guardian

## Overview

System Guardian is an AI-powered monitoring dashboard that watches platform health, raises incidents, and surfaces pending system actions for admin review. It consolidates incident tracking, sensor status, and human-in-the-loop approval requests into a single interface. Admins can interact directly with the Guardian AI through a built-in chat panel for natural language queries about system state.

## Getting there

Navigate to **Admin** in the sidebar, then select **System Guardian**. This page is only visible to users with admin or domain_admin roles.

## Key capabilities

- **Dashboard tab**: High-level statistics including open incident count, sensor health summary, and recent activity
- **Incidents tab**: Full list of incidents filtered by status — open, acknowledged, or resolved — with severity levels (info, warning, critical)
- **Sensors tab**: Live health status of all registered system sensors, showing last check time and current state
- **Approvals tab**: Pending system actions that require admin approval before execution
- Acknowledge or resolve incidents directly from the incidents list
- Approve or reject pending actions with optional comments
- Guardian Chat panel for natural language interaction with the AI monitor

## Severity levels

| Level | Meaning |
|---|---|
| `info` | Low-priority notice, no immediate action required |
| `warning` | Potential issue, should be reviewed soon |
| `critical` | Active problem requiring immediate attention |

## Workflow

1. Open **System Guardian** from the Admin section.
2. Check the **Dashboard** tab for an overview of current system health.
3. Switch to the **Incidents** tab to review open and acknowledged incidents. Click an incident to see its full details and history.
4. Click **Acknowledge** to mark an incident as being handled. Click **Resolve** once the issue is addressed.
5. Open the **Sensors** tab to verify that all monitoring sensors are reporting healthy status.
6. Switch to the **Approvals** tab to review any pending system actions. Click **Approve** or **Reject** with an optional comment.
7. Use the **Guardian Chat** panel to ask the AI about specific incidents, sensor trends, or system behavior.

## Tips

- Acknowledge incidents before resolving them so other admins know the issue is being handled.
- Use Guardian Chat to ask questions like "What triggered the last critical incident?" or "Which sensors have failed in the past 24 hours?" for faster diagnosis.
- Critical severity incidents appear highlighted at the top of the incidents list regardless of sort order.
- Approvals in this tab are the same actions surfaced in the dedicated Approvals page — resolving one updates the other.
