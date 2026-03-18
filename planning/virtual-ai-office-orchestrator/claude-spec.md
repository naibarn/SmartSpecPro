# Virtual AI Office Orchestrator — Synthesized Specification

## Overview

Transform SmartSpecPro from a single-user-to-single-assistant chat platform into a multi-agent virtual office where teams of AI specialists collaborate, remember, and execute work autonomously.

**Scope:** All 7 phases — from team identity foundations through autonomous sessions and system integration.

**Source spec:** `spec.md` (3939 lines, 26 sections + 046 inter-agent communication)

---

## Core Decisions (from Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Implementation scope | All Phases 1-7 | Full system coverage |
| Team Builder UI | Extend Agency Builder (ReactFlow) | Reuse existing graph editor, reduce effort |
| Brainstorm migration | Hard cutover | No backward compat, replace entirely with team presets |
| Memory retrieval | Hybrid (keyword + vector) | pgvector + importance×recency scoring from Phase 2 |
| Turn order default | Lead-Directed | Lead agent decides next speaker |
| 046 Feedback System | Separate plan | Focus this plan on orchestrator only |
| All APIs | tRPC | Matches existing codebase |
| Schema | Drizzle ORM | Matches existing |
| Tests | Vitest + pytest | Matches existing |
| Streaming | SSE | Matches existing agency chat |

---

## What Exists (from Research)

### Reuse Directly
- `personaTemplates` table + personaService.ts (resolution chain, RBAC, prompt building)
- `agencies` + `agencyAgents` + `agencyCommunicationFlows` tables (graph substrate)
- `agencyBridge.ts` (tRPC ↔ Python FastAPI)
- `AgencyBuilder.tsx` (ReactFlow editor)
- `AgencyActivityPanel.tsx` (activity stream)
- `memoryService.ts` (buffer + summary + entity memory)
- `notificationService.ts` (channel-agnostic notifications)
- `queueHealthMonitor.ts` (health checks)
- Vitest + pytest test infrastructure

### Extend
- `conversations` table → add team room semantics
- `messages` table → add sender/recipient agent routing
- `entityMemories` table → migrate to `scoped_memories` with 6 ownership levels
- `ChatView.tsx` → unified orchestration shell
- `ChatSidebar.tsx` → unified thread navigator
- Brainstorm → hard cutover to team discussion presets

### Build New
- 17+ new database tables (Section 16.4.2 of spec)
- 4 monitoring tables (agent_activity_events, agent_run_summaries, run_snapshots, orchestrator_notifications)
- 2 inter-agent tables (inter_agent_messages, system_resource_state)
- Team room runtime (turn order, stop policy, prompt composition)
- Orchestrator dashboard with monitoring
- Inter-agent communication protocol
- Summary generation engine
- Concurrency/conflict resolution

---

## Phase Breakdown

### Phase 1: Identity & Team Foundations
- `user_orchestrator_profiles` table
- `assistant_teams` table (wraps agency)
- `assistant_profiles` table (wraps agency_agent, binds persona)
- `assistant_team_templates` table
- Extend Agency Builder for team creation (ReactFlow overlay)
- Team CRUD APIs (team.list/get/create/update/archive/cloneFromTemplate)
- Assistant profile APIs (create/update/reorder/setPersona/setPolicies)

### Phase 2: Scoped Memory
- `scoped_memories` table with 6 owner types (user/agent/team/room/project/run)
- `memory_promotions` audit table
- Hybrid retrieval: keyword (importance × recency) + vector (pgvector embeddings)
- Memory retrieval order: agent → run → room → team → project → user
- Memory promotion rules (private → suggest → approve → shared)
- Memory APIs (list/search/create/update/promote/dismiss)
- Python embedding service for vector indexing

### Phase 3: Brainstorm Hard Cutover & Discussion Presets
- Remove brainstorm toggle and brainstormPartnerModel/brainstormMaxRounds fields
- Create discussion preset templates (Debate Pair, Research Trio, Strategy+Critic+Synthesizer, etc.)
- Map old brainstorm entries to team discussion format (read-only migration)
- New composer controls: "Discuss as Team", "Debate", "Critique Draft", "Synthesize"

### Phase 4: Orchestrator Workspace & Agent Monitoring
- `team_rooms` table with room types (direct, team, auto-team, job-review)
- `team_room_participants` table
- `team_room_messages` table (multi-party, sender/recipient/visibility/turnType)
- `team_runs` table (orchestrated work sessions)
- `agent_activity_events` table (append-only monitoring log)
- `agent_run_summaries` table (per-agent stats on run completion)
- `run_snapshots` table (periodic state captures)
- `orchestrator_notifications` table
- Room APIs (create/update/sendMessage/listMessages/getSummary)
- Run APIs (start/pause/resume/stop/intervene/muteAgent/adjustBudget)
- Monitoring APIs (getRunStatus/getActivityTimeline/getAgentDetail/getCostBreakdown)
- Notification APIs (list/markRead/getPreferences/updatePreferences)
- SSE streaming endpoints for real-time monitoring
- Live Run Monitor UI (agent roster + activity timeline + run controls)
- Agent Detail Popover (turn history, tools, tokens, memories)
- Run History Browser (per-agent attribution, filtering, export)
- Orchestrator Dashboard monitoring tab
- Prompt composition engine (persona + memory + history assembly)
- Stop policy evaluation engine (7 conditions)
- Summary generation (agent-generated, system-generated, extractive)
- Concurrency controls (artifact locks, last-writer-wins for memory)

### Phase 5: Inter-Agent Communication & System Integration
- `inter_agent_messages` table
- `system_resource_state` table
- Impact assessment engine (incident → affected runs)
- 5 communication channels (system broadcast, system control, team escalation, system direct, cross-team context)
- System-to-room broadcast (system messages in team rooms)
- System-to-run control (auto-pause/stop on incidents)
- Team-to-system escalation (agent failure → system diagnosis loop)
- Resource state injection into agent prompts
- Extend 046 actuators with inter-agent side effects
- New 046 sensor: team_escalation
- UI: system message bubbles, system status bar, impact indicators
- Internal REST APIs between Node.js ↔ Python for impact/escalation/broadcast

### Phase 6: Automation Integration
- `automation_handoffs` table
- Cross-surface execution: workflow, presentation, video_edit, browser_session, agency_job, scheduled_job
- Automation handoff APIs (create/get/listByRun/approve/reject)
- Agent-triggered automation with approval gates (per risk tier)
- Artifact creation and management within team runs

### Phase 7: Autonomous Sessions
- Turn order engine (Lead-Directed default, Round-Robin, Handoff-Based, Orchestrator-Directed)
- Agent communication rules (recipientType, turnType, nextSpeakerHint)
- Loop detection (3+ A→B→A→B cycles → escalate)
- Max consecutive turns per agent (default 3)
- Visibility modes (transparent, milestone, summary)
- Chat UI migration: unified thread reference, sidebar redesign, composer integration, right panel redesign
- External task intake: `external_task_sources`, `external_task_inbox`, `external_task_bindings` tables
- REST/webhook/MCP intake pipeline with trust tiers and policy evaluation
- Human-in-the-loop approval policies
- Localization support (multi-language rooms, Thai names)
- Rate limiting (concurrent runs, agents per team, rounds per run)
- Data migration (entity_memories → scoped_memories, brainstorm → team_runs)
- Full testing strategy (unit 90%+, integration, load testing)

---

## New Database Tables (Total: 21+)

### Core (Phase 1-4)
1. user_orchestrator_profiles
2. assistant_teams
3. assistant_profiles
4. assistant_team_templates
5. team_rooms
6. team_room_participants
7. team_room_messages
8. team_runs
9. scoped_memories
10. memory_promotions

### Monitoring (Phase 4)
11. agent_activity_events
12. agent_run_summaries
13. run_snapshots
14. orchestrator_notifications

### Inter-Agent (Phase 5)
15. inter_agent_messages
16. system_resource_state

### Automation (Phase 6)
17. automation_handoffs

### External Intake (Phase 7)
18. external_task_sources
19. external_task_inbox
20. external_task_bindings

---

## Key Technical Constraints

1. **Compatibility-first**: New tables are additive. Existing agency/chat/persona tables unchanged.
2. **Team→Agency 1:1 mapping**: assistant_teams.agencyId references agencies.id
3. **assistant_profiles wraps agency_agents**: agencyAgentId + personaId binding
4. **Memory isolation**: agent memory is PRIVATE by default, explicit promotion to share
5. **Sequential turns (Phase 1-6)**: Only one agent speaks at a time. Parallel turns deferred.
6. **SSE streaming**: Extend existing agency SSE patterns for team run events
7. **Credit tracking**: Per-agent, per-run cost tracking via existing creditService patterns
8. **Tenant isolation**: All new tables have tenantId column
9. **Hard brainstorm cutover**: No backward compatibility layer
10. **Hybrid memory retrieval**: pgvector + importance×recency from Phase 2
