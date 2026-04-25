---
slug: admin-audit
title: Audit Logs
description: Search and analyze system audit logs
icon: FileText
section: admin
order: 115
pages: ["/admin/audit-logs", "/admin/orchestration-logs"]
tags:
  - "admin"
  - "audit"
  - "logs"
  - "trace"
  - "monitoring"
  - "orchestration"
  - "debugging"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-audit"
aliases:
  - "admin-audit"
  - "Audit Logs"
  - "Audit Logs help"
---

# Audit Logs

## Overview

The Audit Log is the authoritative record of everything that happens on the platform — every LLM request, media generation, skill execution, admin action, and error. Use it to investigate user-reported issues, verify billing, audit security events, and trace requests end-to-end.

## Searching audit logs

- **Date range** — narrow to a specific time window.
- **User** — filter to all events from a single account.
- **Event type** — select one or more event categories (see below).
- **Trace ID** — paste a traceId to see every event in a single request's lifecycle.
- **Status** — filter to errors only, or exclude errors to see successful events.

Results are returned newest-first. Each row shows timestamp, user, event type, model/skill (where applicable), duration, and status.

## Event types

| Event Type | Description |
|---|---|
| `llm_request` | Request sent to an LLM provider — includes model, input tokens, parameters. |
| `llm_response` | Response received — includes output tokens, cost, provider latency. |
| `media_request` | Media generation job submitted — prompt, model, reference images. |
| `media_response` | Media generation completed or failed — output URL or error detail. |
| `skill_detect` | Skill detection result — which skill was matched and confidence score. |
| `skill_execute` | Skill execution — parameters extracted, skill name, execution mode. |
| `admin_action` | Any admin panel action — user edit, credit adjustment, settings change. |
| `auth` | Login, logout, token refresh, 2FA events. |
| `error` | Unhandled errors across all subsystems. |

## Trace analysis

Every request that enters the system receives a unique **Trace ID**. Use it to follow a request from the moment it arrived to the final response:

1. Search by Trace ID.
2. The results show all events tagged to that trace in chronological order.
3. You can see the full request → skill detection → LLM call → response chain in one view.
4. Timing columns show how long each step took, making latency hotspots immediately visible.

## Cost audit

- Compare `llm_response.costUsd` against `creditTransactions.amount` for the same traceId.
- Check `costCalculationMethod` on each response event — values are `provider-reported`, `model-lookup`, or `default-rate`.
- For discrepancies: inspect the model pricing table in **Admin → Providers → Models**.
- Export filtered results to CSV for reconciliation in external tools.

## Orchestration logs

The **Orchestration Logs** tab shows execution traces for Agency workflows and multi-step skill chains:

- Each agency run has a root trace with child spans for every agent node that executed.
- Node-level logs show which agent was called, what input it received, and what it returned.
- Failed nodes show the exception and the state of the workflow at the point of failure.
- Use the **visual timeline** to see parallel and sequential execution paths.

## Export

- Click **Export CSV** to download the current filtered result set.
- Large exports (more than 10,000 rows) are processed asynchronously — a download link is emailed to the requesting admin.
- Exported files are retained for 24 hours.
- For compliance and long-term archival, configure log forwarding to an external SIEM in **Admin → System Settings → Integrations**.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-approvals|Approvals]]
- [[admin-billing-phase2-runbook|Admin Billing Phase 2 Runbook]]
<!-- knowledge-graph:related:end -->
