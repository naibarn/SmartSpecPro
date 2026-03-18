---
slug: team-orchestrator
title: AI Team Orchestrator
description: Create AI agent teams that collaborate in real-time conversations
icon: Users
section: advanced
order: 75
pages: ["/chat", "/teams", "/teams/:teamId"]
tags: [team, orchestrator, agents, collaboration, room, run, multi-agent, discussion, auto-stop, inter-agent]
---

# AI Team Orchestrator

## What is the AI Team Orchestrator?

The AI Team Orchestrator lets you create teams of AI agents that collaborate in real-time conversations. Each agent has its own persona, expertise, and role — working together to research, write, review, and produce results that a single agent couldn't achieve alone.

- Best for tasks that require **multiple perspectives** — research reports, content creation, code reviews.
- Each agent specializes in a different role (Lead Researcher, Writer, Editor, Security Reviewer, etc.).
- The system manages turn order, budget tracking, and stop conditions automatically.

## Creating a Team

1. Go to **Teams** and click **New Team**.
2. Give it a name, description, and optionally a category (e.g., Research, Content, Engineering).
3. Add **2–10 members**. Each member requires:
   - **Persona** — the personality and expertise template (select from your Personas library).
   - **Role Title** — a label like "Lead Researcher" or "Editor".
   - **Instructions** — specific directions for how this agent should behave.
4. Designate exactly **one member as Lead** — the Lead coordinates the discussion and produces final summaries.
5. Click **Create Team**.

### Using Templates

Pre-built templates let you skip manual setup:

| Template | Members | Best for |
|----------|---------|----------|
| **Research & Analysis** | Lead Researcher, Data Analyst, Report Writer | Market research, competitive analysis, technical investigations |
| **Content Creation** | Content Strategist (Lead), Writer, Editor | Blog posts, marketing copy, social media content |
| **Code Review** | Lead Architect, Security Reviewer, Quality Reviewer | Pull request reviews, architecture audits, technical debt analysis |

Click **Clone from Template** and customize member settings as needed.

## Team Rooms

A **Room** is where team conversations happen.

### Creating a Room

1. Select a team.
2. Describe the **goal** — e.g., "Research the top 5 CRM tools for small businesses and recommend the best one."
3. Choose a **room type**:
   - **Team** — collaborative multi-agent discussion (most common).
   - **Direct** — one-on-one with a specific agent.
   - **Auto Team** — system-managed execution with minimal user interaction.
   - **Job Review** — structured review workflow.

### View Modes

Control how much detail you see in the conversation:

| Mode | What you see |
|------|-------------|
| **Transparent** | Everything — all agent messages, internal reasoning, handoffs |
| **Milestone** | Only key decisions and milestone events |
| **Summary** | Only final summaries and conclusions |

### Messaging

- Send messages to **all agents** (default) or target a **specific agent**.
- **Mute** an agent to temporarily exclude it from the conversation.
- System messages (budget warnings, errors) appear with a distinct yellow style.

## Runs — Orchestrated Execution

A **Run** is an automated work session inside a room.

### Starting a Run

1. Open a room and click **Start Run**.
2. Set the **objective** — what the team should accomplish.
3. Configure the **Stop Policy**:
   - **Max rounds** (default 20) — how many agent turns before auto-stop.
   - **Max duration** (default 30 min) — time limit for the entire run.
   - **Max budget** — credit cap to prevent overspending.
   - **Idle timeout** (default 120s) — auto-stop if no agent activity.
   - **Stop on lead summary** — end when the Lead produces a summary.
   - **Stop on consensus** — end when agents agree.
   - **Require final summary** — generate a structured report at the end.

### Auto-Stop Policy Enforcement

Stop policies are **actively enforced** every 30 seconds by an automatic checker:

- The system evaluates all stop conditions (rounds, duration, budget, idle timeout) continuously.
- If any condition triggers, the run is **automatically stopped** with the appropriate reason.
- The checker starts when a run begins and stops when the run is paused, completed, or stopped.
- You don't need to monitor — the system protects against runaway costs and duration.

### Run Controls

| Action | When to use |
|--------|-------------|
| **Pause** | Review progress mid-run without losing context. The auto-stop checker pauses too. |
| **Resume** | Continue a paused run from where it left off. The auto-stop checker resumes. |
| **Stop** | End the run immediately; generates summaries. |

### Budget Tracking

- Each agent's token usage (input + output) and cost are tracked in real-time.
- The **Budget Snapshot** shows per-agent spending.
- If `maxBudgetCredits` is exceeded, the run auto-stops with reason "budget_exceeded".

### Run Completion

When a run ends (via stop policy or manual stop):

1. **Agent Run Summaries** are generated — per-agent stats including turn count, tokens used, cost, tool calls, and error count.
2. If **Require Final Summary** is enabled, a structured report is produced with key decisions, findings, artifacts, and next steps. This calls the Python backend to generate an LLM-powered summary.
3. An **orchestrator notification** is sent to you.
4. Events are published via SSE for any connected clients to update in real time.

## Inter-Agent Communication

Agents can interact with external systems and other teams:

### System Broadcasts

When a system-wide event occurs (e.g., all LLM providers go down, credit pool exhausted), the system broadcasts an alert to all active runs. Each run receives an **impact assessment**:

| Impact Level | Meaning |
|-------------|---------|
| **Critical** | Run cannot continue — LLM access is blocked or budget depleted |
| **Degraded** | Run can continue but quality may be reduced — a provider went offline |
| **Unaffected** | No impact on this run |

### Automation Handoffs

Agents can hand off work to external automation systems (e.g., trigger a media generation task, start a browser session). Handoffs are tracked and auditable.

## Turn Order Strategies

The orchestrator supports multiple turn-order strategies for how agents take turns:

| Strategy | How it works |
|----------|-------------|
| **Round Robin** | Each agent speaks in fixed order |
| **Lead First** | Lead always goes first, then members |
| **Autonomy Based** | Agents with higher autonomy level speak first |
| **Consensus Driven** | Lead polls members, then synthesizes |

## Tips for Effective Teams

1. **Start with a template** and customize — it's faster than building from scratch.
2. **Give each agent a distinct specialty.** Overlapping roles produce redundant output.
3. **Set a reasonable budget cap** (100–500 credits) and max rounds (10–30) to avoid runaway costs.
4. **Use Milestone view mode** when you only care about key decisions, not the full discussion.
5. **Review the lead's summary** before stopping a run — it captures the team's conclusions.
6. **Pause to intervene** — if agents go off-track, pause, send a correction message, then resume.
7. **Auto-stop protects you** — even if you forget to stop a run, the policy checker will enforce limits every 30 seconds.
