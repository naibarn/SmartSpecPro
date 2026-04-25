---
slug: workflow-editor
title: Workflow Editor
description: Visual flow builder for designing and running multi-step automation workflows
icon: GitBranch
section: features
order: 50
pages: ["/workflows/editor", "/workflows/editor/:id"]
tags:
  - "workflow"
  - "automation"
  - "flow builder"
  - "nodes"
  - "visual editor"
  - "help"
  - "help/en"
  - "help/automation"
  - "workflow-editor"
aliases:
  - "workflow-editor"
  - "Workflow Editor"
  - "Workflow Editor help"
---

# Workflow Editor

## Overview

The Workflow Editor is a canvas-based visual tool for building multi-step automation workflows. Nodes are defined by a registry and rendered with dynamically generated forms, so no code is required to wire together complex pipelines. Workflows execute in real time with server-sent event streaming, and the editor tracks credit costs and provides cost estimates before you run.

Worker-runtime orchestration is rollout-gated. The editor should not imply that every declared worker runtime already has a drag-and-drop workflow node. Runtime-aware worker dispatch, wait, publish, and indexing surfaces only appear when the matching backend support and tenant rollout flags are both enabled.

## Getting there

Open **Workflows** in the sidebar, then click **New Workflow** or click an existing workflow to open it in the editor. The editor is also accessible directly at `/workflows/editor` for a blank canvas or `/workflows/editor/:id` to load a saved workflow.

## Key capabilities

- Drag-and-drop node placement on an infinite canvas
- Registry-driven node definitions — all available node types and their configuration schemas are loaded from the server
- Dynamic form generation for node configuration — each node type produces its own settings panel automatically
- Connect nodes with directed edges to define data flow and execution order
- Real-time execution with SSE streaming — see output appear as each node completes
- Credit cost estimation before running — the editor calculates expected cost based on selected models and node count
- Credit management panel — view your available credits and top up without leaving the editor
- Save workflows with a name and description
- Load workflows from the template marketplace to start from a pre-built pattern

## Workflow

1. Open the editor from the Workflows gallery or via direct URL.
2. Use the node palette on the left to drag the first node onto the canvas.
3. Click the node to open its configuration panel. Fill in the required fields generated for that node type.
4. Drag additional nodes onto the canvas and connect them by drawing edges from output handles to input handles.
5. Review the cost estimate shown in the toolbar before running.
6. Click **Run** to execute the workflow. Watch node outputs stream in real time on the canvas.
7. Click **Save** to store the workflow under a name for later reuse.

## Tips

- Read the cost estimate carefully before running large workflows — nodes that invoke LLMs or media generation accumulate credits quickly.
- Use the template marketplace as a starting point. Modify a template rather than building from scratch whenever a suitable one exists.
- If a node turns red during execution, click it to read the error output from that step before re-running.
- Saving frequently preserves intermediate states. The editor auto-saves a draft, but only a manual save creates a named version visible in the gallery.
- For worker-backed flows, separate these states mentally:
  dispatch accepted, worker execution completed, artifacts published, and indexing finished. A successful dispatch does not guarantee later publication or search availability.

<!-- knowledge-graph:related:start -->
## Related Help

- [[workflows|Workflows & Automation]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[automation|Process Automation]]
- [[factory|SaaS Factory]]
- [[webhooks|Webhooks & Integrations]]
- [[work-os|Work OS Guide]]
<!-- knowledge-graph:related:end -->
