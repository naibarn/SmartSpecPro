---
slug: agency-builder
title: Agency Builder
description: Design custom multi-agent teams visually
icon: Boxes
section: advanced
order: 75
pages: ["/agencies", "/agencies/templates"]
tags:
  - "agency"
  - "builder"
  - "visual editor"
  - "nodes"
  - "agents"
  - "custom"
  - "design"
  - "template"
  - "help"
  - "help/en"
  - "help/teams"
  - "teams"
  - "agency-builder"
aliases:
  - "agency-builder"
  - "Agency Builder"
  - "Agency Builder help"
---

# Agency Builder

## What is Agency Builder?

Agency Builder is a visual drag-and-drop editor for designing custom multi-agent teams. Instead of using a pre-built agency template, you can compose your own team from scratch by placing nodes on a canvas, connecting them, and configuring each agent's role, model, and tools.

Use Agency Builder when the built-in agency templates do not match your workflow, or when you want fine-grained control over how agents interact.

## Node types

| Node | Role |
|---|---|
| **Agent** | A core LLM agent with a specific role and system instructions. The primary building block of every agency. |
| **Supervisor** | Orchestrates other agents, decides which agent handles a sub-task, and synthesizes their outputs. |
| **Router** | Routes the incoming request to one of several downstream agents based on conditional logic. |
| **Aggregator** | Collects outputs from multiple agents and combines them into a single result. |
| **Knowledge Base** | Provides reference documents, FAQs, or domain knowledge to agents connected downstream. |
| **Skill Call** | Executes a specific SmartAI Hub skill (image generation, research, etc.) as a step in the workflow. |
| **Human Approval** | Pauses the workflow and waits for a human reviewer to approve or reject before continuing. |

## Building an agency

1. Go to **Agencies** and click **New Agency** (or open an existing one to edit).
2. Choose **Start from template** or **Blank canvas**.
3. Drag node types from the left palette onto the canvas.
4. Connect nodes by clicking an output port and dragging to an input port — this defines the data flow.
5. Click any node to open its configuration panel:
   - **Agent / Supervisor** — set the role name, system instructions, model, and temperature
   - **Router** — define the routing conditions
   - **Knowledge Base** — upload or link reference documents
   - **Skill Call** — choose the skill and map inputs
   - **Human Approval** — set the approval instructions and timeout
6. Mark the **entry point** — the first node the agency will call (must be an Agent or Supervisor).
7. Click **Save** when finished.

## Tools

Each Agent node can be equipped with tools that extend its capabilities:

- **Web Search** — search the internet for current information
- **Browser** — navigate and extract content from web pages
- **Calculator** — perform arithmetic and unit conversions
- **Code Interpreter** — execute Python snippets
- **File Reader** — read uploaded documents
- **API Caller** — make HTTP requests to external services

Click a node, open the **Tools** tab, and toggle the tools you want that agent to have access to. Some tools have additional configuration (e.g., API Caller requires an endpoint and auth details).

## AI Creator

If you are not sure how to structure your agency, use the **AI Creator**:

1. Click **AI Creator** on the canvas toolbar.
2. Describe what you want your agency to do in plain language.
3. The AI will design a suggested node layout for you.
4. Review the suggested design and click **Apply** to place it on your canvas.
5. Adjust the design as needed before saving.

## Templates

Four built-in templates are available as starting points:

| Template | Purpose |
|---|---|
| **Deep Research** | Multi-source researcher → analyst → writer pipeline |
| **Storyboard** | Scene planner → visual prompter → storyboard assembler |
| **Deck Builder** | Outline planner → slide writer → deck formatter |
| **Comparison** | Parallel researchers → aggregator → recommendation writer |

Open **Agencies → Templates** to browse and customize any of these.

## Versioning

Agency Builder automatically saves a version each time you click **Save**. To manage versions:

- Click the **Versions** button in the toolbar to see the history.
- Click any version to preview it.
- Click **Restore** to roll back to that version.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected node or edge |
| `Ctrl+A` / `Cmd+A` | Select all nodes |
| `Escape` | Deselect / close panel |

## Tips

- **Start with a template** — templates provide a proven structure you can modify rather than design from scratch.
- **Keep teams small** — agencies with 3–5 agents are easier to debug and produce more focused results than large teams.
- **Set clear instructions** — each Agent node should have a focused system prompt that defines its specific role without overlap.
- **Use Human Approval for critical decisions** — insert a Human Approval node before any step that publishes content or makes irreversible changes.
- **Test with a simple request first** — run the agency with a short, specific request to verify the routing works before using it for complex tasks.

<!-- knowledge-graph:related:start -->
## Related Help

- [[teams|AI Teams]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[agencies|Agencies - Multi-Agent Teams]]
- [[agency-chat|Agency Chat — Running & Testing Agencies]]
- [[groups|Groups]]
- [[team-monitoring|Team Monitoring & Scoped Memory]]
<!-- knowledge-graph:related:end -->
