---
slug: workflows
title: Workflows & Automation
description: Build and run automated task workflows
icon: GitBranch
section: advanced
order: 72
pages: ["/workflows", "/workflows/editor", "/workflows/gallery"]
tags:
  - "workflows"
  - "automation"
  - "pipeline"
  - "editor"
  - "triggers"
  - "actions"
  - "schedule"
  - "help"
  - "help/en"
  - "help/automation"
aliases:
  - "workflows"
  - "Workflows & Automation"
  - "Workflows & Automation help"
---

# Workflows & Automation

## What are workflows?

Workflows are automated multi-step task pipelines that connect triggers, actions, and conditions into a repeatable process. Instead of performing the same sequence of steps manually each time, you define it once and run it on demand or on a schedule.

Workflows are best suited for tasks you perform repeatedly — generating reports, processing content through multiple AI steps, or integrating with external systems.

## Creating a workflow

1. Go to **Workflows** in the sidebar.
2. Click **New Workflow** or pick a template from the Gallery.
3. The visual editor opens with a blank canvas.
4. Drag nodes from the palette on the left onto the canvas.
5. Connect nodes by drawing edges between their output and input ports.
6. Configure each node by clicking it and filling in the settings panel.
7. Click **Save** to save your workflow.

## Node types

| Node | Description |
|---|---|
| **Trigger** | Starts the workflow — manual button, schedule, webhook, or event |
| **Action** | Performs a task — LLM call, skill execution, media generation, or API call |
| **Condition** | Branches the path based on a logical rule (if/else) |
| **Output** | Formats and delivers the final result |

## Triggers

- **Manual** — Run from the Workflows page by clicking **Run**
- **Scheduled** — Runs automatically at a set time (daily, weekly, or cron expression)
- **Webhook** — Triggered by an HTTP POST request from an external system
- **Event-based** — Fires in response to an in-app event (e.g., new message received)

## Actions

- **LLM Call** — Send a prompt to any available AI model and receive a response
- **Skill Execution** — Run a specific skill with defined inputs
- **Media Generation** — Generate images or video clips as a pipeline step
- **API Call** — Make an HTTP request to an external service
- **Transform** — Reformat or process data between steps (JSON, text, extract fields)

Some tenants may also see worker-runtime orchestration features. Those features are runtime-family specific and rollout-gated:

- OpenClaw gateway work is not the same thing as desktop-local media work
- Desktop + ZeroClaw jobs are intended for local files, GPU, and machine-hosted execution
- Secure pool and collaborative cluster runtimes stay admin-gated until explicitly enabled

## Conditions

Add a **Condition** node to branch your workflow based on logic:

- Compare a value to a threshold or keyword
- Check if a previous step succeeded or failed
- Route to different paths based on content type

Each condition has a **true** output port and a **false** output port. Connect each to the next appropriate action.

## Gallery

The Workflow Gallery contains pre-built templates for common use cases:

- **Daily Briefing** — Summarize news or updates every morning
- **Content Pipeline** — Draft, review, and format content in sequence
- **Research to Report** — Research a topic and produce a formatted document
- **Webhook Responder** — Process incoming data and return a structured response

Browse the Gallery at **Workflows → Gallery** and click **Use Template** to start from an existing design.

## Running workflows

- Click **Run** on any saved workflow to execute it immediately.
- For scheduled workflows, the next run time is shown on the workflow card.
- While running, a progress indicator shows which node is currently executing.
- Results are shown in the **Run History** panel on the right side of the workflow detail page.
- Click any past run to see its full output and any errors.

When a workflow dispatches work to a worker runtime, treat these as separate milestones:

- dispatch accepted by the control plane
- worker execution completed
- artifacts uploaded and published
- indexing completed so outputs become searchable

Depending on the workflow, a run can succeed at one milestone and still fail at a later one.

## Tips

- **Start simple** — Build a two-node workflow first to verify your trigger and action work, then add complexity.
- **Test each step** — Use the **Test Node** button in the node settings panel to run a single node in isolation.
- **Use templates** — The Gallery covers most common patterns; modify a template rather than building from scratch.
- **Check run history** — If a workflow fails, the run history shows exactly which node failed and why.
- **Set meaningful names** — Name your nodes descriptively so the workflow is easy to understand when you return to it later.

<!-- knowledge-graph:related:start -->
## Related Help

- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[automation|Process Automation]]
- [[factory|SaaS Factory]]
- [[webhooks|Webhooks & Integrations]]
- [[work-os|Work OS Guide]]
- [[workflow-editor|Workflow Editor]]
<!-- knowledge-graph:related:end -->
