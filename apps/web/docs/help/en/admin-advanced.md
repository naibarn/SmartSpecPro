---
slug: admin-advanced
title: Advanced Administration
description: Agency management, approvals, tenants, and operations monitoring
icon: Shield
section: admin
order: 130
pages: ["/admin/agencies", "/admin/approvals", "/admin/tenants", "/admin/ops", "/admin/funnel", "/admin/services", "/admin/channel-router", "/admin/system-guardian", "/admin/feedback-hub", "/admin/content-quality", "/admin/sandbox"]
tags: [admin, agencies, approvals, tenants, multi-tenant, operations, monitoring, guardian, feedback, quality]
---

# Advanced Administration

## Overview

Advanced Administration covers the specialized admin surfaces that go beyond basic user, provider, and settings management. These pages give platform operators full visibility and control over agencies, multi-tenant environments, system health, and automated governance.

## Agency Management (/admin/agencies)

The Agencies admin view gives administrators oversight of all agencies created by users across the platform.

- **List all agencies** — search and filter by creator, status, template type, or creation date.
- **Inspect agency configuration** — view the agent setup, tools, and system prompts for any agency.
- **Enable / Disable** — toggle whether an agency is available to its owner.
- **Delete** — remove an agency and its run history permanently (requires confirmation).
- Use this page to enforce content policies or investigate agencies that are generating unexpected output.

## Approval Workflows (/admin/approvals)

Certain agency configurations require a human approval step before they can proceed. The Approvals page is the queue for those pending decisions.

- **Pending approvals** — list of agency runs paused at an approval gate, with the requesting user, agency name, and the step awaiting approval.
- **Review** — open a run's context, see what the agent is proposing to do, and decide whether to approve or reject.
- **Approve** — the agency resumes from the approval step.
- **Reject** — the agency is cancelled and the user is notified with your reason.
- **Bulk actions** — approve or reject multiple pending items at once.

Approval gates are configured per agency in the Agency Builder. See the [Agency Builder](/help/agency-builder) guide for setup details.

## Multi-Tenant Management (/admin/tenants)

If your installation supports multiple tenants (organizations with their own isolated environments), manage them here.

- **Create tenant** — provision a new tenant with a domain name, display name, and initial admin user.
- **Configure tenant** — set feature flags, credit limits, storage quotas, and branding per tenant.
- **Domain assignment** — map one or more domains to a tenant for automatic tenant resolution.
- **Suspend / Reactivate** — temporarily block all access for a tenant without deleting data.
- **Delete tenant** — permanently removes the tenant and all associated data. This action is irreversible and requires typed confirmation.

## Operations Dashboard (/admin/ops)

The Operations Dashboard gives a real-time view of platform health and performance.

- **Request throughput** — messages per minute, LLM requests per minute.
- **Latency percentiles** — p50, p95, p99 response times for LLM and media requests.
- **Error rates** — percentage of failed requests over the last 5, 15, and 60 minutes.
- **Queue depths** — current length of the LLM, media, and background task queues.
- **Active sessions** — number of currently connected users and live browser sessions.

## Funnel Analytics (/admin/funnel)

The Funnel page shows how users progress from signup to active usage.

- **Registration → First login** — drop-off between account creation and first sign-in.
- **First login → First chat** — how quickly users start engaging.
- **First chat → Feature adoption** — which features new users explore first.
- **Conversion over time** — funnel metrics by day, week, or month.

Use funnel data to identify friction points in the onboarding flow and prioritize improvements.

## Service Status (/admin/services)

The Services page shows the health of every backend component the platform depends on.

| Service | What is monitored |
|---|---|
| PostgreSQL | Connection pool, query latency, replication lag |
| Redis | Memory usage, connection count, eviction rate |
| Celery workers | Worker count, queue length, task failure rate |
| LLM providers | Response time, error rate, circuit breaker state |
| Storage (S3/R2) | Upload/download success rate, latency |

- **Green** — healthy, operating within normal parameters.
- **Yellow** — degraded, some metrics above threshold but service is functioning.
- **Red** — critical, service is down or severely degraded.

Click any service for a detailed view with recent metrics and error logs.

## Channel Router (/admin/channel-router)

The Channel Router controls how messages are routed between users, agents, and AI models.

- **Routing rules** — define rules that direct specific message types to specific providers or models.
- **Priority** — set rule priority when multiple rules could match the same message.
- **Default channel** — the fallback model when no routing rule matches.
- **Test routing** — enter a sample message and see which model it would be routed to.

## System Guardian (/admin/system-guardian)

The System Guardian is an automated health monitoring system that evaluates the platform against a set of rules and triggers alerts or actions when thresholds are breached.

- **Rules** — a list of 18+ deterministic rules covering credit exhaustion, queue backup, error rate spikes, and provider outages.
- **Rule status** — each rule shows its current pass/fail state and the last time it was evaluated.
- **Alerts** — configure where alerts are sent (email, webhook) when a rule fails.
- **Auto-remediation** — some rules can trigger automatic actions (circuit breaker reset, worker restart) without human intervention.
- **Audit log** — every rule evaluation, alert, and remediation action is logged.

## Feedback Hub (/admin/feedback-hub)

The Feedback Hub aggregates user feedback submitted through the in-app feedback mechanism.

- **All feedback** — filterable list of feedback items by rating, feature area, and date.
- **Sentiment trends** — aggregate positive/negative sentiment over time.
- **Top issues** — automatically grouped themes from free-text feedback.
- **Export** — download feedback data as CSV for analysis in external tools.

## Content Quality (/admin/content-quality)

Content Quality monitors the quality scores of AI-generated outputs across the platform.

- **Quality scores** — aggregate scores by model, skill, and feature area.
- **Flagged outputs** — items that scored below the quality threshold for manual review.
- **Review queue** — inspect flagged outputs and mark them as acceptable or problematic.
- **Trends** — track quality score changes over time to detect model degradation.

## Sandbox (/admin/sandbox)

The Sandbox is an isolated test environment where admins can test skills and agencies without affecting production users.

- **Skill testing** — run any skill with test inputs to verify behavior before publishing.
- **Agency testing** — create a sandbox agency run with full logging for debugging.
- **Model testing** — send raw prompts to any configured provider to compare outputs.
- Changes in the Sandbox do not consume user credits and are not visible to regular users.
