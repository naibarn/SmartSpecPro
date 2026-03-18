---
slug: team-monitoring
title: Team Monitoring & Scoped Memory
description: Real-time monitoring, scoped memory, and notifications for AI teams
icon: Activity
section: advanced
order: 76
pages: ["/chat", "/team"]
tags: [monitoring, memory, scoped, notification, events, run, agent, status, live]
---

# Team Monitoring & Scoped Memory

## Run Monitor Panel

The Run Monitor shows live status for an active team run. It appears in the right panel when a run is in progress.

### What You See

- **Stats Bar** — three counters showing total events, tokens used, and active agents.
- **Agent Roster** — each agent's name, role, turn count, and active/idle status. The Lead is marked with a badge.
- **Event Timeline** — a scrolling log of every action: messages sent, tool calls, handoffs, decisions, and errors.
- **Connection Status** — a green dot means the live stream is connected; gray means disconnected (auto-reconnects).

### Run Controls

| Button | What it does |
|--------|-------------|
| **Pause** | Freezes the run. Agents stop, but state is preserved for resuming. |
| **Resume** | Continues a paused run from exactly where it stopped. |
| **Stop** | Ends the run. Generates agent summaries and optional final report. |

### Event Types

| Icon | Event | Description |
|------|-------|-------------|
| 💬 | Message | An agent sent a response |
| 🚀 | Run Started | The run began execution |
| ✅ | Run Completed | The run finished successfully |
| ⏸️ | Run Paused | The run was paused by user |
| 🔧 | Tool Call | An agent used a tool (search, code execution, etc.) |
| 🤝 | Handoff | One agent passed the conversation to another |
| ❌ | Error | Something went wrong (retried automatically) |
| 🔄 | Status Change | An agent changed state (active ↔ idle) |

## Scoped Memory

Each AI team uses a hierarchical memory system with strict scope isolation.

### Memory Scopes

Scopes control who can read and write memories:

| Scope | Owner | Who can read |
|-------|-------|-------------|
| **Agent** | Individual agent | Only that agent (private) |
| **Run** | Current run session | All agents in the run |
| **Room** | Chat room | All participants in the room |
| **Team** | Entire team | All agents in the team |
| **Project** | Project tag | All users/agents in the project |
| **User** | You (the user) | All your conversations |

### Priority Order

When searching memories, results from more specific scopes rank higher:

**Agent → Run → Room → Team → Project → User**

If the same fact exists in both Agent and Team scope, the Agent version is used.

### Memory Types

| Type | Use for |
|------|---------|
| **Fact** | Verified information |
| **Rule** | Hard constraints (always follow) |
| **Preference** | Preferred ways of working |
| **Decision** | Choices made during discussion |
| **Note** | General observations |
| **Checklist** | Step-by-step items |
| **Artifact Note** | Notes about produced artifacts |
| **Handoff Note** | Context for agent-to-agent transitions |
| **Episode** | Full conversation episodes for reference |

### Searching Memories

The search system uses **hybrid retrieval**:

1. **Keyword matching** — finds memories containing your search terms.
2. **Vector similarity** — finds memories with semantically similar meaning (even if different words are used).
3. **Combined score** — 40% keyword + 60% vector similarity, weighted by importance and recency.

### Promoting Memories

Move a memory from a narrow scope to a broader one:

1. Find the memory in the Memory panel.
2. Click **Promote**.
3. Choose the target scope (e.g., Agent → Team).
4. Optionally add a reason.

This is useful when an agent discovers something that the whole team should know.

## Notifications

Orchestrator notifications keep you informed about team activity.

### Notification Types

| Type | Severity | When it fires |
|------|----------|---------------|
| **Run Completed** | Info | A run finished successfully |
| **Budget Warning** | Warning | Credit usage approaching the limit |
| **Agent Stuck** | Warning | An agent hasn't produced output for 2+ minutes |
| **Budget Exceeded** | Error | Run auto-stopped due to cost limit |
| **System Alert** | Critical | Infrastructure issue affecting team execution |

### Managing Notifications

- Unread notifications appear with a badge count.
- Click to mark as read, or dismiss to hide permanently.
- Notifications include a **deep link** — click to jump directly to the affected room or run.

## Stuck Agent Detection

The system automatically monitors for stuck agents:

- If no agent activity occurs for **2 minutes**, a "stuck" alert triggers.
- You'll see a notification with the stuck agent's name and how long it's been idle.
- Options: **Resume** the run (retry), **Stop** the run, or **Mute** the stuck agent and continue with others.

## Live Streaming (SSE)

Team rooms use Server-Sent Events (SSE) for real-time updates:

- Events stream automatically when a run is active.
- If disconnected, the client **auto-reconnects** with exponential backoff.
- **Last-Event-ID** ensures no events are missed during brief disconnections.
- A heartbeat keeps the connection alive (every 15 seconds).
- Maximum connection duration is 30 minutes (auto-reconnects after).
