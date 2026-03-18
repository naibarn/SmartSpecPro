---
slug: teams
title: AI Teams
description: Create and manage collaborative AI assistant teams
icon: UsersRound
section: features
order: 25
pages: ["/teams", "/teams/:teamId", "/chat"]
tags: [team, assistant, collaboration, agent, orchestrator, room, discussion, sidebar]
---

# AI Teams

## Overview

AI Teams let you assemble groups of AI assistants that collaborate to solve complex tasks. Instead of relying on a single assistant, a team can break work into parallel tracks, review each other's output, and converge on a higher-quality result than any single agent could produce alone.

Common uses:
- Research tasks that benefit from multiple perspectives
- Content drafts that need both creation and editorial review
- Multi-step workflows where each step requires a different specialty
- Brainstorming sessions with structured synthesis

## Finding Teams

Teams are accessible from **two places**:

### Teams Page

Click **Teams** in the main sidebar (requires the `ORCHESTRATOR_ENABLED` feature flag).

The Teams page has two panels:
- **Left sidebar** — lists all your teams with search. Each entry shows member count and room count.
- **Main area** — shows the selected team's rooms or the active team room conversation.

### Chat Sidebar

At the bottom of the **Chat** sidebar, there's a collapsible **Team Rooms** section. Click to expand and see your teams. Clicking a team navigates you to the Teams page.

## Creating a Team

1. Navigate to **Teams** in the main menu.
2. Click **New Team**.
3. Enter a **name** and optional **description** for the team.
4. Click **Create**.

The team starts empty. Add members in the next step.

## Team Members

### Adding Members

Click **Add Member** in the team detail page. Each member is a persona (an AI assistant with a configured system prompt and model). Assign:

- **Persona** — Select from your configured personas. Each persona brings a distinct set of instructions and capabilities.
- **Role** — `Lead` or `Member`.

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
2. Click **New Room** in the top bar.
3. Choose a **Room Type**:
   - **Team** — collaborative multi-agent discussion (most common).
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
- Messages go to **all agents** by default.
- Target a **specific agent** using the recipient selector.
- System messages (budget warnings, errors) appear with a distinct style.

## Starting a Run

1. Open a room and click **Start Run**.
2. Enter your prompt — describe what you want the team to accomplish.
3. Click **Send**.

The lead agent receives your prompt first, breaks it into subtasks, and assigns them to members. Each member works on their subtask and posts results back to the room. The lead synthesizes the results into a final response.

> **Note:** Runs consume credits from all participating agents. Estimated credit cost is shown before you confirm.

## Monitoring a Run

While a run is active:

- The **Activity** panel shows each agent's current status: idle, thinking, or responding.
- Messages appear in the room in **real time** via live streaming (SSE).
- A **progress indicator** shows how many subtasks are complete vs. pending.

You can interrupt a run at any time by clicking **Stop Run**. Partial results remain in the room.

## URL Deep-Linking

You can bookmark or share direct links to teams:
- `/teams` — opens the Teams page
- `/teams/:teamId` — opens the Teams page with a specific team pre-selected

## Templates

Use a pre-built team template to get started quickly:

| Template | Use case |
|----------|---------|
| Research Trio | One researcher, one analyst, one writer |
| Content Review | One drafter, one editor, one fact-checker |
| Brainstorm Panel | Three members with divergent styles, one synthesizer lead |
| Technical Review | One implementer, one code reviewer, one documentation writer |

Select a template when creating a new team to pre-populate member roles. You can customize personas and roles after the team is created.

## Archiving a Team

Click the **Archive** button on the team's top bar. Archived teams are hidden from the default list but can be recovered by an admin.
