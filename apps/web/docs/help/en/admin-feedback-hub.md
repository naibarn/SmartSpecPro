---
slug: admin-feedback-hub
title: Feedback Hub (Admin)
description: Triage, respond to, and resolve user feedback tickets
icon: MessageSquare
section: admin
order: 61
pages: ["/admin/feedback-hub"]
tags:
  - "feedback"
  - "ticket"
  - "triage"
  - "respond"
  - "resolve"
  - "bug"
  - "feature-request"
  - "admin"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-feedback-hub"
aliases:
  - "admin-feedback-hub"
  - "Feedback Hub (Admin)"
  - "Feedback Hub (Admin) help"
---

# Feedback Hub (Admin)

## Overview

The Feedback Hub gives administrators a unified inbox for all user-submitted feedback. Every bug report, feature request, observation, and question submitted through the platform appears here. The hub includes AI-assisted triage to help prioritize work and keep response times low.

> **Note:** Users can track their own tickets at `/my-feedback`. Everything they see comes from this same data set — your replies are visible to them, but internal notes are not.

## Ticket List

The left panel shows all tickets with real-time filtering:

- **Filter by status**: All / New / Triaged / In Progress / Resolved / Closed / Deferred / Duplicate
- **Filter by type**: Bug Report / Feature Request / Observation / Question
- **Sort**: Newest first, oldest first, or by priority

### Stats Bar

The top of the list shows running totals:

| Stat | Description |
|------|-------------|
| Total | All tickets across all statuses |
| New | Unreviewed submissions |
| Triaged | AI-classified but not yet actioned |
| In Progress | Actively being worked on |
| Resolved | Closed with a resolution |

## Ticket Detail

Click any ticket to open the full detail panel on the right:

- **Description** — The user's original submission text.
- **Steps to reproduce** — Filled in for Bug Report type; empty for others.
- **Expected behavior** — What the user expected to happen.
- **Actual behavior** — What actually happened.
- **Metadata** — User, submission time, browser/OS info (if captured), page URL at time of submission.

## AI Analysis

Every ticket is automatically analyzed on submission:

| Field | What AI provides |
|-------|----------------|
| **Auto-category** | Bug / Performance / Feature Request / Question / Other |
| **Auto-priority** | High / Normal / Low (based on keywords and severity signals) |
| **Auto-summary** | One-line summary of the issue |
| **Duplicate detection** | Links to similar open tickets if a match is found |

> **Tip:** AI priority is a starting point. Override it manually if you have domain context the AI lacks.

## Status Workflow

Move tickets through the following statuses:

```
new → triaged → in_progress → resolved
                            ↘ closed
                            ↘ deferred
                            ↘ duplicate
```

| Status | When to use |
|--------|-------------|
| `new` | Default — not yet reviewed |
| `triaged` | Reviewed and categorized; queued for work |
| `in_progress` | Actively being fixed or investigated |
| `resolved` | Fix shipped or answer provided |
| `closed` | Won't fix, out of scope, or user withdrew |
| `deferred` | Acknowledged but postponed to a future cycle |
| `duplicate` | Linked to an existing ticket |

Change status using the **Status** dropdown in the ticket detail header.

## Comments

Two types of comments are available in the comment panel:

- **Reply to user** — Visible to the user on their My Feedback page. Use this to ask for clarification, provide an ETA, or confirm a fix.
- **Internal note** — Hidden from the user. Use for investigation notes, links to code changes, or team discussion.

Both types are time-stamped and attributed to the admin who posted them. Users receive a notification when a visible reply is added.

## Attachments

Users can attach up to 5 files per ticket. In the detail panel:

- **View** — Click an image thumbnail to open it full size.
- **Download** — Click the download icon next to any attachment to save it locally.
- **Delete** — Click the trash icon to permanently remove an attachment. This cannot be undone.

Supported file types: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.md`.

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
