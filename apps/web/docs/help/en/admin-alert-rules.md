---
slug: admin-alert-rules
title: Alert Rules & Escalation
description: Configure metric-based alert rules and escalation policies for notifications
icon: BellRing
section: admin
order: 116
pages: ["/admin/alert-rules"]
tags:
  - "admin"
  - "alerts"
  - "rules"
  - "escalation"
  - "policies"
  - "monitoring"
  - "thresholds"
  - "notifications"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-alert-rules"
aliases:
  - "admin-alert-rules"
  - "Alert Rules & Escalation"
  - "Alert Rules & Escalation help"
---

# Alert Rules & Escalation

## Overview

The Alert Rules page lets admins define metric-based alerting thresholds and escalation policies. When a metric crosses a threshold, the system creates a notification for the target audience. If critical alerts go unacknowledged, escalation policies automatically notify senior staff.

**Feature flag:** `notificationPreferencesEnabled` must be enabled for this page to appear.

## Alert Rules

### Creating a Rule

Each alert rule monitors a named metric and triggers when it crosses a threshold:

- **Rule Name** — descriptive label (e.g., "High LLM Error Rate").
- **Metric** — the metric to monitor (e.g., `llm_error_rate`, `queue_depth`, `response_latency_p95`).
- **Operator** — comparison operator: greater than, less than, equal to, etc.
- **Threshold** — numeric value that triggers the alert.
- **Window** — time window in minutes for aggregation (default: 5 minutes).
- **Severity** — notification priority when triggered: low, normal, high, or critical.
- **Cooldown** — minimum minutes between repeated alerts for the same rule (prevents alert storms).
- **Target** — who receives the alert: a specific role (e.g., admin) or a specific user.
- **Channels** — delivery channels: in-app, email, or both.

### Managing Rules

- **Enable / Disable** — toggle individual rules without deleting them.
- **Edit** — modify any parameter of an existing rule.
- **Delete** — permanently remove a rule.
- Rules are tenant-scoped — each tenant manages its own set of rules.

## Escalation Policies

Escalation policies ensure critical alerts don't go unnoticed. When a notification at a certain severity remains unacknowledged for too long, the system automatically creates a new escalation notification for a designated target.

### Creating a Policy

- **Name** — descriptive label (e.g., "Critical 15-min Escalation").
- **Trigger Severity** — the severity level to watch (typically "critical" or "high").
- **Trigger After (minutes)** — how long a notification must remain unread before escalating.
- **Escalate To** — either:
  - A **role** (e.g., admin) — all users with that role receive the escalation.
  - A **specific user** — only that user receives the escalation.
- **Escalation Message** — custom message for the escalation notification (optional).
- **Channels** — delivery channels for escalation: in-app, email, or both.

### How Escalation Works

1. A BullMQ job runs every 5 minutes checking all enabled escalation policies.
2. For each policy, it finds unacknowledged notifications matching the trigger severity that are older than the trigger window.
3. It creates new escalation notifications with `isEscalated: true` metadata for each target.
4. Escalated notifications bypass user preference filters — they are always delivered.
5. The original notification is marked with `escalatedAt` metadata to prevent re-escalation.

### Managing Policies

- **Enable / Disable** — toggle policies on/off.
- **Edit** — change trigger conditions or targets.
- **Delete** — permanently remove a policy.
- Policies are tenant-scoped and respect tenant feature flags.

## Tips

- Start with a generous cooldown (e.g., 30 minutes) and tighten as you understand your alert patterns.
- Use escalation policies for critical business alerts — set trigger windows to give the primary team time to respond before escalating.
- The escalation job checks feature flags per-tenant — disable `notificationEscalationEnabled` to pause all escalation without deleting policies.
- Combine alert rules with notification preferences so users only receive alerts for categories they care about.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-approvals|Approvals]]
- [[admin-audit|Audit Logs]]
- [[admin-billing-phase2-runbook|Admin Billing Phase 2 Runbook]]
<!-- knowledge-graph:related:end -->
