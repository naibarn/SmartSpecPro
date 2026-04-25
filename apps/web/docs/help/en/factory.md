---
slug: factory
title: SaaS Factory
description: Project orchestration dashboard for multi-step workflows
icon: Factory
section: advanced
order: 70
pages: ["/factory"]
tags:
  - "factory"
  - "project"
  - "orchestrator"
  - "workflow"
  - "session"
  - "artifact"
  - "approval"
  - "help"
  - "help/en"
  - "help/automation"
  - "automation"
aliases:
  - "factory"
  - "SaaS Factory"
  - "SaaS Factory help"
---

# SaaS Factory

## Overview

SaaS Factory is a project orchestration dashboard that lets you create projects, run complex multi-step workflows, manage sessions, evaluate quality gates, and handle generated artifacts with an approval system.

## Creating a project

1. Click **New Project** on the Factory dashboard.
2. Enter a project name and description.
3. Configure workflow steps — each step defines an action (LLM call, media generation, code execution, etc.).
4. Set quality gates between steps to ensure output meets criteria before proceeding.

## Running workflows

- **Start a session** within your project to begin execution.
- The orchestrator runs each step sequentially, passing outputs between steps.
- **Quality gates** automatically evaluate step outputs — if a gate fails, the workflow pauses for review.
- Monitor progress in real-time with status indicators for each step.

## Managing artifacts

Generated content (text, images, code) from each step is stored as **artifacts**.

- View artifacts in the session detail panel.
- **Approve or reject** artifacts before they proceed to the next step.
- Download artifacts individually or export the entire session output.

## Session history

- All sessions are saved with their full execution history.
- Re-run failed sessions or clone successful ones as templates.
- Filter sessions by status: running, completed, failed, or paused.

## Tips

- Break complex workflows into smaller steps with quality gates between them.
- Use descriptive step names so the execution log is easy to follow.
- Review artifacts promptly — paused workflows hold resources until approved.

<!-- knowledge-graph:related:start -->
## Related Help

- [[workflows|Workflows & Automation]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[automation|Process Automation]]
- [[webhooks|Webhooks & Integrations]]
- [[work-os|Work OS Guide]]
- [[workflow-editor|Workflow Editor]]
<!-- knowledge-graph:related:end -->
