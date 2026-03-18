---
slug: admin-orchestration-logs
title: Orchestration Logs
description: Browse and filter logs from the AI orchestration system including team runs and agent interactions.
icon: ScrollText
section: admin
order: 260
pages: ["/admin/orchestration-logs"]
tags: [admin, orchestration, logs, runs, monitoring, debugging]
---

# Orchestration Logs

## Overview
Orchestration Logs captures the full activity trail of the AI orchestration system: every team run, agent turn, room session, and inter-agent message is recorded here. Use this page to understand what the orchestrator did during a specific run, diagnose unexpected agent behavior, and audit automated workflows that completed without human oversight.

## Getting there
Log in as an administrator and navigate to **Admin > Orchestration Logs** from the left sidebar.

## Key capabilities
- Browse log entries for all team runs and individual agent turns
- Filter by team, room, run status (running, completed, failed), and time range
- Expand a run to see the full turn-by-turn transcript of agent interactions
- View input and output payloads for each agent invocation
- Identify which runs exceeded their time budget or token limit
- Export filtered log results as JSON or CSV for offline analysis

## Workflow / How to use
1. Open **Admin > Orchestration Logs**. The list shows recent runs in reverse chronological order.
2. Use the **Team** dropdown to narrow logs to a specific AI team.
3. Set a **Time range** to focus on a particular window (e.g., the last hour or a specific date).
4. Use the **Status** filter to show only Failed runs when investigating errors.
5. Click a run row to expand the run detail. The detail panel shows:
   - Run metadata (team name, trigger, start/end time, total tokens used)
   - A turn-by-turn list of agent interactions with timestamps
   - Input and output content for each turn
   - Any errors or warnings raised during the run
6. To share a specific run for team review, copy the run ID from the detail panel and paste it into the search box for direct lookup.
7. To export the current filtered view, click **Export** and choose JSON or CSV format.

## Tips
- Searching by run ID is the fastest way to jump directly to a specific run when you have the ID from an error report or audit trail.
- Runs with a status of Failed often have a truncated transcript. Look at the last agent turn before failure to identify the breaking point.
- Token usage is shown per turn. Turns with unusually high token counts may indicate that a context window is being over-filled, which can degrade agent reasoning quality.
- Use the time range filter together with the team filter when investigating a reported incident; this avoids scrolling through unrelated runs.
- Log retention follows the platform's audit log policy. Logs older than the retention window are automatically archived and no longer visible in this UI.
