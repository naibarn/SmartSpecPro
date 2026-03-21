---
slug: teams
title: AI Teams
description: Create and manage collaborative AI assistant teams
icon: UsersRound
section: features
order: 25
pages: ["/teams", "/teams/:teamId", "/chat"]
tags: [team, assistant, collaboration, agent, orchestrator, room, discussion, sidebar, workflow board, approval, team room]
---

# AI Teams

## Overview

AI Teams let you assemble groups of AI assistants that collaborate to solve complex tasks. Instead of relying on a single assistant, a team can break work into parallel tracks, review each other's output, and converge on a higher-quality result than any single agent could produce alone.

Common uses:
- Research tasks that benefit from multiple perspectives
- Content drafts that need both creation and editorial review
- Multi-step workflows where each step requires a different specialty
- Structured discussions with synthesis

## Finding Teams

Teams are accessible from **two places**:

### Teams Page

Click **Teams** in the main sidebar (requires the `ORCHESTRATOR_ENABLED` feature flag).

The Teams page has two panels:
- **Left sidebar** — lists all your teams with search. Each entry shows member count and room count.
- **Main area** — shows the selected team's members and rooms, or the active team room conversation.

### Chat Sidebar

At the bottom of the **Chat** sidebar, there's a collapsible **Team Rooms** section. Click to expand and see your teams. Clicking a team navigates you to the Teams page.

## Creating a Team

### From Scratch

1. Navigate to **Teams** in the main menu.
2. Click the **+** button in the sidebar header (or **New Team** on the empty state).
3. Enter a **name** and optional **description** for the team.
4. Add members by selecting personas from the dropdown. The first member is automatically assigned as Lead.
5. Click the star icon to change which member is the Lead.
6. Click **Create Team**.

### From a Template

In the New Team dialog, you can also choose a **Quick Start template** to pre-populate the team with recommended roles:

| Template | Use case |
|----------|---------|
| Research & Analysis Team | Structured research and analysis |
| Content Creation Team | Writing, editing, and review |
| Code Review Team | Implementation and code review |

Select a template to create the team instantly. You can customize members after creation.

## Team Members

### Adding Members

Click **Add Member** in the team detail page. Select a persona from the list — it will be added as a Member by default.

Each member is a persona (an AI assistant with a configured system prompt and model).

### Roles

| Role | Responsibilities |
|------|----------------|
| **Lead** | Coordinates the team. Synthesizes member outputs. Produces the final response. |
| **Member** | Performs assigned subtasks. Reports results to the lead. |

> **Tip:** A team works best with one Lead and two to four Members. Larger teams increase token usage without always improving quality.

## Team Rooms

Each team has one or more **rooms** — discussion spaces where agents exchange messages during a run.

### Creating a Room

1. Select a team on the Teams page.
2. Click **New Room** in the team detail page or the top bar.
3. Choose a **Room Type**:
   - **Team Chat** — collaborative multi-agent discussion (most common).
   - **Direct** — one-on-one with a specific agent.
   - **Auto Team** — system-managed execution with minimal user interaction.
   - **Job Review** — structured review workflow.
4. Describe the **Objective / Goal** — e.g., "Research the top 5 CRM tools for small businesses."
5. Click **Create Room**.

### Room Cards

On the team detail page, rooms appear as cards showing:
- Room type and status (active / archived)
- The goal prompt
- Click a card to enter the room conversation

### Sending Messages

Inside a room, use the message input at the bottom:
- Type your message and press **Enter** (or click **Send**).
- Use **Shift+Enter** for multi-line messages.
- System messages (budget warnings, errors) appear with a distinct style.

## Opening Team Room and Workflow Board from Chat

- If you are chatting with a persona that also belongs to a team, Chat can summarize that persona's work status, latest draft, prepared artifacts, and recent room updates.
- When the question is about pending work, approvals, revisions, or workflow navigation, Chat may show **action cards / links** that open the exact Team Room or Workflow Board for that work item.
- These links can open:
  - the relevant team room
  - the thread that needs a reply
  - the room's Workflow Board directly
- This work-aware context is scoped to the **currently active persona** in Chat.

## Workflow Board

- Each Team Room includes a **Workflow Board** for viewing work by status, such as in progress, awaiting feedback, or blocked items.
- You can reach the Workflow Board from:
  - the Teams page by opening the room
  - the **Open Workflow Board** action card shown in Chat
- When opened from a deep link, the app will try to focus the correct room and highlight the workflow panel automatically.

## Approvals and send-back flow

- If a work item is waiting for approval or revision, complete that action inside **Team Room**.
- Chat is used to inspect context, summarize what has been prepared, and take you to the right location.
- Use Team Room for **approve / reject / send back** actions so workflow state stays consistent.

## Starting a Run

1. Open a room and click **Start Run**.
2. Enter the **objective** — describe what you want the team to accomplish.
3. Click **Start**.

The lead agent receives your objective, breaks it into subtasks, and assigns them to members. Each member works on their subtask and posts results back to the room. The lead synthesizes the results into a final response.

> **Note:** Runs consume credits from all participating agents.

### Unified Skill Execution

When a team agent uses a skill during a run, it goes through the same **unified execution pipeline** as Chat:

- **Consistent results** — the same skill produces the same output regardless of which agent or channel triggers it.
- **Automatic model selection** — the orchestrator picks the best available model based on skill requirements (vision, web search, thinking mode).
- **Rate limiting** — executions are rate-limited per user to prevent excessive credit consumption during automated runs.
- **Audit trail** — every skill execution within a run is logged for debugging and cost tracking.

## Monitoring a Run

While a run is active:

- On desktop, the **Run Monitor** panel appears on the right side showing:
  - **Agent Roster** — each agent's name and turn count
  - **Stats** — event count, token usage, and agent count
  - **Event Timeline** — real-time feed of agent activities
- Messages appear in the room in **real time** via live streaming (SSE).
- Use **Pause** to temporarily halt the run, or **Stop** to end it immediately.

Partial results remain in the room after stopping.

## URL Deep-Linking

You can bookmark or share direct links to teams:
- `/teams` — opens the Teams page
- `/teams/:teamId` — opens the Teams page with a specific team pre-selected
- `/teams/:teamId?roomId=...&workItemId=...` — opens a room and focuses the related work item
- `/teams/:teamId?roomId=...&workItemId=...&messageId=...&composeReply=1` — opens the thread that needs a reply
- `/teams/:teamId?roomId=...&workItemId=...&panel=workflow` — opens the room's Workflow Board

## Archiving a Team

Click the **Archive** button on the team's top bar. Archived teams are hidden from the default list but can be recovered by an admin.
