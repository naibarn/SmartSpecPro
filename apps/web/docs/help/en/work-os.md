---
slug: work-os
title: Work OS Guide
description: Start tracked requests, cases, and legacy work in one place
icon: ClipboardList
section: features
order: 11
pages: ["/chat", "/work/request", "/admin/work-os", "/admin/monitoring"]
tags:
  - "work os"
  - "intake"
  - "request"
  - "case"
  - "task"
  - "queue"
  - "chat"
  - "webhook"
  - "api"
  - "legacy"
  - "import"
  - "triage"
  - "help"
  - "help/en"
  - "help/automation"
  - "automation"
  - "work-os"
aliases:
  - "work-os"
  - "Work OS Guide"
  - "Work OS Guide help"
---

# Work OS Guide

## What Work OS is

Work OS is the place where a real business request becomes tracked work.

It keeps one shared story for the whole job:

- where the work came from
- who owns it
- what it is waiting for
- whether it needs approval
- whether it is blocked or at risk
- what the final result was

## How work enters Work OS

Work can enter from several trigger types:

| Trigger | When to use it |
|---|---|
| Chat | A person explains the work in plain language and it should become a tracked request |
| Webhook | Another system sends a request into SmartAIHub |
| API | A product, integration, or internal tool creates the work directly |
| Form | A human submits a structured request |
| Document flow | A file, SOP, or intake document starts the work |
| Schedule trigger | A time-based job creates work automatically |

## How to start from Chat

1. Open Chat.
2. Use the **Start tracked work** card when this conversation should become a real request.
3. Open the Work Request page from that card when you want to start the work yourself.
4. Fill in the request details such as title, source, urgency, and who should own it first.
5. The request is created first, then it becomes a case that can be tracked in Work OS.

## How legacy work is brought in

If your team already has work in another tool or a legacy task system, you can attach that work to a Work OS case.

That keeps the old history and the new tracking in one place instead of splitting the story across multiple screens.

## Who owns the work

Work OS can assign a request or case to:

- a person
- a team
- a queue
- a role
- a hybrid mix of the above

Ownership changes are saved so you can see who had the work before and why it moved.

## When automation helps

Automation can step in when:

- a request is low-confidence and should go to triage
- an approval times out
- a policy blocks progress
- an SLA is at risk or breached
- a task needs to be linked back to existing work

## Where to look next

- Open **Work Request** to create a new request as a regular user.
- Open **Work OS Console** to review the inbox, timeline, approvals, exceptions, and outcomes.
- Open **Admin Monitoring** if you want the system overview first.
- Return to **Chat** when you need to describe the next step in plain language.

## Permalinks and filters

You can share a specific Work OS view with a bookmarkable URL:

- `/admin/work-os` opens the main console.
- `/admin/work-os?caseId=case-123` opens one case directly.
- `/admin/work-os?caseId=case-123&timelineSource=role_routine` focuses on role-routine evidence.
- `/admin/work-os?caseId=case-123&timelineSource=team_run` focuses on team-run evidence.
- `/admin/work-os?caseId=case-123&timelineSource=workpack_record` focuses on workpack evidence.
- `/admin/work-os?caseId=case-123&timelineSource=work_os` shows the core Work OS event stream.

Use `caseId` to keep the console on one case, and `timelineSource` to narrow the timeline to one evidence slice.
That makes the view easier to share, copy, and return to later.

## Quick glossary

- `caseId` keeps the console on one case.
- `timelineSource` filters the timeline to one evidence slice.
- `work_os` means the main case stream.
- `role_routine`, `team_run`, and `workpack_record` mean source-specific evidence slices.

<!-- knowledge-graph:related:start -->
## Related Help

- [[workflows|Workflows & Automation]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[automation|Process Automation]]
- [[factory|SaaS Factory]]
- [[webhooks|Webhooks & Integrations]]
- [[workflow-editor|Workflow Editor]]
<!-- knowledge-graph:related:end -->
