---
slug: admin-approvals
title: Approvals
description: Review and act on pending approval requests from workflow automation and System Guardian
icon: ClipboardCheck
section: admin
order: 220
pages: ["/admin/approvals"]
tags:
  - "admin"
  - "approvals"
  - "workflow"
  - "review"
  - "approve"
  - "reject"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-approvals"
aliases:
  - "admin-approvals"
  - "Approvals"
  - "Approvals help"
---

# Approvals

## Overview

The Approvals page is the central queue for human-in-the-loop decisions required by workflow automation and the System Guardian. When an automated process reaches a step that requires admin authorization before continuing, a pending request appears here. Admins can review the full context for each request and approve or reject it with an optional comment.

## Getting there

Navigate to **Admin** in the sidebar, then select **Approvals**. This page is only visible to users with admin or domain_admin roles.

## Key capabilities

- Tabs for pending, approved, and rejected requests — each tab shows requests in that state
- View full request details: who requested it, what action is proposed, context data, and timestamps
- Approve a request to allow the automated process to continue
- Reject a request to halt or cancel the pending action
- Add a comment when approving or rejecting to explain the decision
- Requests from System Guardian incidents appear alongside workflow automation requests
- The count of pending approvals is shown as a badge on the sidebar nav item

## Tabs

| Tab | Contents |
|---|---|
| Pending | Requests awaiting a decision — these block the automated process from continuing |
| Approved | Historical log of requests you or other admins have approved |
| Rejected | Historical log of requests that were rejected and the reason given |

## Workflow

1. Open **Approvals** from the Admin section.
2. The **Pending** tab loads by default. Review the count of outstanding requests.
3. Click a pending request to open its detail view.
4. Read the request description and any context data provided by the automated system.
5. Click **Approve** to allow the action to proceed. The automated workflow or Guardian process resumes immediately.
6. Click **Reject** to block the action. Add a comment explaining why — this is stored in the audit trail and visible to the requesting system.
7. Switch to the **Approved** or **Rejected** tabs to review historical decisions.

## Tips

- Pending requests block the automated process that generated them. Check this page regularly if your team runs time-sensitive workflows.
- Comments on rejections are important — they help other admins understand past decisions and help workflow authors improve their automation.
- Approvals triggered by System Guardian incidents are also shown in the Guardian dashboard. Resolving from either location updates both views.
- If a request description is unclear, check the System Guardian incidents or workflow run logs for the originating trace ID to get full context before deciding.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-audit|Audit Logs]]
- [[admin-billing-phase2-runbook|Admin Billing Phase 2 Runbook]]
<!-- knowledge-graph:related:end -->
