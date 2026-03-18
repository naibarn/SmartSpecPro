# Virtual AI Office Orchestrator — Implementation Plan

## 1. Project Overview

### What We're Building

A multi-agent virtual office system for SmartSpecPro that transforms the platform from single-user-to-single-assistant chat into orchestrated teams of AI specialists that collaborate, remember, and execute work autonomously.

### Why

Currently, complex work requires repeated user prompting. The orchestrator allows a user to assign goals to a team of virtual assistants who discuss, delegate, and produce artifacts — while the user controls how hands-on or hands-off they want to be.

### How It Fits

The system layers on top of existing infrastructure:
- **Personas** become team member identities
- **Agencies** become team execution graphs
- **Chat** becomes team rooms with multi-party messaging
- **Entity memories** become scoped memories (6 levels)
- **Notifications** gain team event types and orchestrator alerts

### Architecture Principles

1. **Additive-first**: New tables, no modifications to existing tables
2. **1:1 mapping**: Each `assistant_team` maps to one `agency`, each `assistant_profile` maps to one `agency_agent`
3. **Compatibility**: Existing agency/chat flows continue unchanged
4. **Event-driven**: All agent actions emit events for streaming, monitoring, and audit
5. **Tenant isolation**: Every new table has `tenantId`

---

## 2. Schema Foundation

### 2.1 Core Identity Tables

#### `user_orchestrator_profiles`

Stores the user's orchestration preferences. One row per user.

Fields: id (uuid PK), userId (FK users), defaultPersonaId (FK personaTemplates), orchestratorDisplayName, preferredViewMode (enum: transparent/milestone/summary), preferredAutonomyLevel (enum: manual/guided/autonomous), preferredSummaryStyle, defaultApprovalPolicy (jsonb), createdAt, updatedAt.

#### `assistant_teams`

Product-facing team definition. Each team wraps one agency.

Fields: id (uuid PK), tenantId (FK tenants), ownerUserId (FK users), agencyId (FK agencies), name, description, category, teamPersonaOverlay (jsonb), defaultViewMode, defaultSummaryMode, defaultAutonomyLevel, defaultModelId, modelBudgetPolicy, memoryPolicyJson (jsonb), artifactPolicyJson (jsonb), status (enum: active/archived/draft), createdAt, updatedAt.

#### `assistant_profiles`

Product-facing assistant identity. Each profile wraps one agency_agent and binds one persona.

Fields: id (uuid PK), tenantId (FK tenants), teamId (FK assistant_teams), agencyAgentId (FK agencyAgents), personaId (FK personaTemplates), displayName, nickname, roleTitle, genderStyle, specialtyTags (text[]), preferredModelId, modelSelectionPolicy (enum: fixed/cost_optimized/quality_optimized/auto), toolPolicyJson (jsonb), approvalPolicyJson (jsonb), memoryPolicyJson (jsonb), visibilityPolicyJson (jsonb), sortOrder (int), isLead (bool), isActive (bool), createdAt, updatedAt.

#### `assistant_team_templates`

Reusable preset team definitions (system or tenant-created).

Fields: id (uuid PK), tenantId (nullable FK tenants — null = platform-wide), name, description, category, teamConfigJson (jsonb), memberTemplateJson (jsonb), defaultDiscussionMode, isSystem (bool), createdAt, updatedAt.

### 2.2 Room & Message Tables

#### `team_rooms`

Durable room abstraction for team conversations.

Fields: id (uuid PK), tenantId (FK tenants), teamId (FK assistant_teams), orchestratorUserId (FK users), backingAgencyConversationId (FK agencyConversations nullable), roomType (enum: direct/team/auto-team/job-review), title, goalPrompt (text), projectId (nullable), viewMode, summaryMode, autonomyLevel, status (enum: active/archived/paused), lastRunId (nullable), createdAt, updatedAt.

#### `team_room_participants`

Explicit participant roster per room.

Fields: id (uuid PK), roomId (FK team_rooms), participantType (enum: user/assistant/observer), participantUserId (nullable FK users), participantAssistantId (nullable FK assistant_profiles), participantLabel, roleInRoom, isMuted (bool), canWriteSharedMemory (bool), joinedAt.

#### `team_room_messages`

Multi-party message store for team conversations.

Fields: id (uuid PK), roomId (FK team_rooms), runId (nullable), senderType (enum: user/assistant/system), senderUserId (nullable), senderAssistantId (nullable), recipientType (enum: all/assistant/subgroup/user), recipientAssistantId (nullable), recipientGroupJson (jsonb nullable), turnType (enum: discussion/handoff/review/decision/execution_update/summary), visibility (enum: transparent/milestone/summary_only/private_internal), content (text), summaryContent (text nullable), artifactRefsJson (jsonb), memoryRefsJson (jsonb), metadataJson (jsonb), tokenUsageJson (jsonb), createdAt.

### 2.3 Run & Execution Tables

#### `team_runs`

One orchestrated work session inside a room.

Fields: id (uuid PK), roomId (FK team_rooms), teamId (FK assistant_teams), backingAgencyRunId (nullable), initiatedByUserId (FK users), executionMode (enum: team_chat/auto_team/review), objective (text), constraintsJson (jsonb), status (enum: queued/running/paused/completed/failed/stopped), activeAssistantId (nullable), stopPolicyJson (jsonb), approvalPolicyJson (jsonb), budgetSnapshotJson (jsonb), summaryArtifactId (nullable), stopReason (text nullable), startedAt, endedAt.

Stop policy shape (stored in stopPolicyJson):
```
maxRounds: number (default 20)
maxDurationMinutes: number (default 30)
maxBudgetCredits: number (required)
stopOnConsensus: boolean
stopOnArtifactReady: boolean
stopOnLeadSummary: boolean
requireFinalSummary: boolean
idleTimeoutSeconds: number
```

### 2.4 Scoped Memory Tables

#### `scoped_memories`

Unified memory table for all 6 scopes.

Fields: id (uuid PK), tenantId (FK tenants), ownerType (enum: user/agent/team/room/project/run), ownerId (text), memoryKind (enum: fact/rule/preference/decision/note/checklist/artifact_note/handoff_note/episode), visibility (enum: private/shared_team/shared_room/shared_project), sourceType (enum: auto/manual/promoted), sourceUserId (nullable), sourceAssistantId (nullable), sourceRoomId (nullable), projectId (nullable), title, content (text), summary (text nullable), tags (text[]), metadataJson (jsonb), embedding (vector(1536) — pgvector), confidence (numeric 0-1), importance (int 1-10), reinforcementCount (int default 0), lastAccessedAt, expiresAt (nullable), createdAt, updatedAt.

Indexes: (ownerType, ownerId, createdAt), (tenantId, memoryKind), GIN on tags, HNSW on embedding for vector search.

#### `memory_promotions`

Audit trail for memory scope changes.

Fields: id (uuid PK), memoryId (FK scoped_memories), fromOwnerType, fromOwnerId, toOwnerType, toOwnerId, promotedByUserId (nullable), promotedByAssistantId (nullable), reason (text), createdAt.

### 2.5 Monitoring Tables

#### `agent_activity_events`

Append-only event log for monitoring.

Fields: id (uuid PK), tenantId, teamId, roomId, runId, assistantId, eventType (text), eventCategory (enum: status_change/communication/tool_use/memory_op/artifact_op/handoff/approval/error), visibility (enum: transparent/milestone/summary_only/private_internal), summary (text), detailJson (jsonb), tokenUsageSnapshot (int), costSnapshot (numeric), durationMs (int), createdAt.

Indexes: (runId, createdAt), (assistantId, createdAt).

#### `agent_run_summaries`

Per-agent performance summary computed on run completion.

Fields: id (uuid PK), runId (FK team_runs), assistantId (FK assistant_profiles), turnCount, totalInputTokens, totalOutputTokens, totalCostCredits, toolCallCount, toolSuccessCount, toolFailureCount, memoriesRead, memoriesWritten, memoriesPromoted, artifactsCreated, handoffsSent, handoffsReceived, errorCount, activeDurationMs, waitDurationMs, createdAt.

#### `run_snapshots`

Periodic state captures during active runs.

Fields: id (uuid PK), runId (FK team_runs), capturedAt, activeAssistantId, agentStatusesJson (jsonb), tokenUsageJson (jsonb), costJson (jsonb), artifactCountJson (jsonb), pendingApprovalsCount (int).

#### `orchestrator_notifications`

Persistent notification records.

Fields: id (uuid PK), tenantId, userId, teamId (nullable), roomId (nullable), runId (nullable), notificationType (text), severity (enum: info/warning/error/critical), title, body (text), actionUrl (nullable), isRead (bool), isDismissed (bool), createdAt, readAt (nullable).

### 2.6 Inter-Agent Communication Tables

#### `inter_agent_messages`

Messages between system agents and team agents.

Fields: id (uuid PK), tenantId, channel (enum: system_broadcast/system_control/team_escalation/system_direct/system_context), sourceAgentType (enum: team/system/external), sourceAgentId, targetType (enum: room/run/team/user/all_active_runs), targetId, priority (enum: low/normal/high/critical), messageType (text), payload (jsonb), displayMessage (text), actionRequired (bool), status (enum: delivered/acknowledged), acknowledgedAt (nullable), expiresAt (nullable), relatedIncidentId (nullable FK virtual_admin_incidents), relatedRunId (nullable), relatedRoomId (nullable), createdAt.

#### `system_resource_state`

Current state of shared system resources (updated by Virtual Admin Agent sensors).

Fields: id (text PK — e.g. "provider:openai"), tenantId (nullable), resourceType (text), status (enum: healthy/degraded/down/critical), stateJson (jsonb), updatedBy (text), updatedAt.

### 2.7 Automation & External Intake Tables

#### `automation_handoffs`

Cross-surface actions initiated by team agents.

Fields: id (uuid PK), roomId, runId, assistantId, destinationType (enum: workflow/presentation/video_edit/browser_session/agency_job/scheduled_job), destinationId (nullable), intent (text), requestPayloadJson (jsonb), resultPayloadJson (jsonb nullable), status (enum: pending/approved/rejected/executing/completed/failed), approvalState (enum: not_required/pending/approved/rejected), createdAt, updatedAt.

#### `external_task_sources`

Trusted external systems that can submit work.

Fields: id (uuid PK), tenantId, ownerUserId, name, sourceType (enum: api_client/webhook_partner/mcp_client/external_agent_platform), authMode, authConfigJson (jsonb encrypted), defaultTeamId (nullable), defaultRoomMode, defaultAutonomyLevel, trustTier (enum: untrusted/verified/trusted_internal), isActive (bool), createdAt, updatedAt.

#### `external_task_inbox`

Intake queue for external submissions.

Fields: id (uuid PK), tenantId, sourceId (FK external_task_sources), receivedAt, status (enum: received/awaiting_review/approved/rejected/materialized/failed), submittedByLabel, externalTaskId, targetTeamId (nullable), targetRoomId (nullable), suggestedAssistantId (nullable), intent, objective (text), payloadJson (jsonb), attachmentsJson (jsonb), routingDecisionJson (jsonb nullable), approvalRequirement, approvedByUserId (nullable), approvedAt (nullable), rejectedByUserId (nullable), rejectedAt (nullable), materializedRunId (nullable), materializedRoomId (nullable), createdAt, updatedAt.

#### `external_task_bindings`

Binds external threads to SmartSpec rooms/runs.

Fields: id (uuid PK), tenantId, sourceId, externalThreadId, externalTaskId, teamId (nullable), roomId (nullable), runId (nullable), syncMode (text), metadataJson (jsonb), createdAt, updatedAt.

---

## 3. Service Layer Architecture

### 3.1 Team Service (`teamService.ts`)

Responsibilities:
- Team CRUD (create/update/archive)
- Team template instantiation (clone template → create agency + agents + profiles)
- Member management (add/remove/reorder assistants)
- Validation (at least 1 member, exactly 1 lead, each member has persona + memory scope)

Key operations (all within a single Drizzle transaction — if any step fails, full rollback):
- `createTeam(input)` → within tx: creates agency via existing agencyRouter, then creates assistant_team + assistant_profiles wrapping each agency_agent + provisions private memory scopes per member
- `createFromTemplate(templateId, overrides)` → loads template, instantiates team
- `updateTeamMember(profileId, updates)` → syncs changes to both assistant_profile and underlying agency_agent

### 3.2 Room Service (`roomService.ts`)

Responsibilities:
- Room lifecycle (create/archive/update)
- Participant management
- Message routing (user→team, user→agent, agent→agent)
- View mode enforcement (transparent/milestone/summary)

Key operations:
- `createRoom(teamId, roomType, goal)` → creates team_room + participants, optionally creates backing agency_conversation
- `sendMessage(roomId, message)` → validates sender/recipient, stores in team_room_messages, triggers run engine if auto-team
- `getMessages(roomId, filters)` → returns messages filtered by visibility mode

### 3.3 Run Engine (`runEngine.ts`)

Responsibilities:
- Run lifecycle (start/pause/resume/stop)
- Turn order management (lead-directed, round-robin, handoff)
- Stop policy evaluation (7 conditions checked after each turn)
- Budget tracking per agent
- Summary generation on completion

Key operations:
- `startRun(roomId, config)` → creates team_run, initializes agent states, begins first turn
- `executeTurn(runId)` → determine next agent, compose prompt, call LLM, process response, emit events
- `evaluateStopPolicy(runId)` → check all 7 conditions, return shouldStop + reason
- `pauseRun(runId)` → preserve state, emit run_paused event
- `stopRun(runId, reason)` → generate summary, compute agent_run_summaries, emit run_completed

### 3.4 Prompt Composition Engine (`promptComposer.ts`)

Responsibilities:
- Assemble LLM prompt from persona + memory + history + task context
- Manage token budgets per section
- Retrieve memories using hybrid search (keyword + vector)
- Compress conversation history when exceeding budget

Assembly order:
1. System message: persona + team overlay + task instructions + behavioral rules (~2000 tokens)
2. Memory context: top-K from each scope per retrieval order (~3000 tokens)
3. Conversation history: room messages visible to this agent (remaining budget)
4. Current turn: user/agent message + tool results + intervention (uncapped)

Key operations:
- `composePrompt(assistantId, runId, turnInput)` → assembled prompt string
- `retrieveMemories(assistantId, runId, query, budget)` → ranked memory items
- `compressHistory(messages, budget)` → truncated/summarized history

### 3.5 Turn Order Engine (`turnOrderEngine.ts`)

Strategies:
- **Lead-Directed** (default): Lead agent's response includes `nextSpeakerHint`; system extracts it
- **Round-Robin**: Fixed order based on assistant_profiles.sortOrder
- **Handoff-Based**: Each agent declares `nextSpeakerHint` in their response
- **Orchestrator-Directed**: User explicitly selects next agent

Safety rules:
- Muted agents skipped
- Max 3 consecutive turns per agent
- Loop detection: A→B→A→B 3x → escalate to lead or stop
- Dead-letter: if suggested speaker unavailable → fall back to lead or round-robin

### 3.6 Monitoring Service (`monitoringService.ts`)

Responsibilities:
- Record agent_activity_events for every agent action
- Capture run_snapshots at configurable intervals (default 15s)
- Compute agent_run_summaries on run completion
- Generate orchestrator_notifications for alertable events
- Detect stuck/looping agents

Key operations:
- `recordEvent(runId, assistantId, eventType, detail)` → append to agent_activity_events
- `captureSnapshot(runId)` → save current state of all agents
- `computeRunSummaries(runId)` → aggregate per-agent stats
- `detectStuckAgent(runId, thresholdMs)` → check last event time per active agent
- `notifyOrchestrator(userId, notification)` → create orchestrator_notification + SSE push

### 3.7 Summary Service (`summaryService.ts`)

Three generation methods:
- **Agent-generated**: Prompt lead agent to produce structured summary (highest quality)
- **System-generated**: Lightweight model call with neutral summarizer prompt (fallback)
- **Extractive**: Collect all decision/summary/execution_update messages (cheapest)

Output structure: objective, participants, keyDecisions, keyFindings, artifactsProduced, openQuestions, nextSteps, totalCost, totalDuration.

### 3.8 Memory Service Extension (`scopedMemoryService.ts`)

Extends existing memoryService.ts with scoped ownership:

Key operations:
- `createMemory(ownerType, ownerId, content, kind, visibility)` → insert into scoped_memories
- `searchMemories(scopes[], query, topK)` → hybrid retrieval (keyword score + vector similarity)
- `promoteMemory(memoryId, toOwnerType, toOwnerId, reason)` → update ownership + create memory_promotions record
- `retrieveForPrompt(assistantId, runId, query, budget)` → ordered retrieval per Section 14A spec

Hybrid retrieval algorithm:
1. Keyword phase: full-text search on content + title + tags, score by importance × recency
2. Vector phase: embed query, cosine similarity on pgvector embedding column
3. Merge: combine scores with configurable weights (default 0.4 keyword + 0.6 vector)
4. Deduplicate across scopes (prefer more specific scope)
5. Truncate to token budget

### 3.9 Inter-Agent Communication Service (`interAgentService.ts`)

Responsibilities:
- Send/receive inter-agent messages across system and team worlds
- Impact assessment (incident → affected runs mapping)
- System resource state publishing and querying
- Escalation protocol (team → system → diagnosis → response)

Key operations:
- `sendSystemBroadcast(targetRoomIds, messageType, displayMessage, severity)` → write inter_agent_messages + inject into room timeline
- `assessImpact(incidentId, incidentType, affectedResources)` → load active runs, classify impact, execute actions
- `handleTeamEscalation(roomId, runId, escalationType, context)` → create inter_agent_message, forward to 046 sensor
- `updateResourceState(resourceId, status, stateJson)` → upsert system_resource_state
- `getResourceState()` → read all system_resource_state for prompt injection

---

## 4. API Layer

### 4.1 tRPC Routers

New routers to create in `apps/web/server/routers/`:

#### `team.ts`
- team.list, team.get, team.create, team.update, team.archive
- team.cloneFromTemplate, team.listTemplates

#### `assistantProfile.ts`
- assistantProfile.create, assistantProfile.update, assistantProfile.reorder
- assistantProfile.setPersona, assistantProfile.setPolicies, assistantProfile.setMemoryPolicy

#### `teamRoom.ts`
- teamRoom.list, teamRoom.get, teamRoom.create, teamRoom.update
- teamRoom.setViewMode, teamRoom.addParticipant, teamRoom.removeParticipant
- teamRoom.sendMessage, teamRoom.listMessages, teamRoom.getSummary

#### `teamRun.ts`
- teamRun.start, teamRun.get, teamRun.listByRoom
- teamRun.pause, teamRun.resume, teamRun.stop
- teamRun.approve, teamRun.reject
- teamRun.intervene, teamRun.muteAgent, teamRun.unmuteAgent, teamRun.adjustBudget

#### `scopedMemory.ts`
- memory.list, memory.search, memory.create, memory.update
- memory.promote, memory.dismiss, memory.getAccessLog

#### `monitoring.ts`
- monitoring.getRunStatus, monitoring.getAgentStatuses, monitoring.getActivityTimeline
- monitoring.getAgentDetail, monitoring.getRunSummary, monitoring.getAgentRunSummaries
- monitoring.getActiveRuns, monitoring.getCostBreakdown, monitoring.getAgentPerformanceCard

#### `notification.ts` (extend existing)
- notification.list, notification.markRead, notification.markAllRead
- notification.dismiss, notification.getPreferences, notification.updatePreferences

#### `automationHandoff.ts`
- automationHandoff.create, automationHandoff.get, automationHandoff.listByRun
- automationHandoff.approve, automationHandoff.reject

#### `externalIntake.ts`
- externalSource.list/create/update/rotateSecret
- externalTaskInbox.list/get/approve/reject/materialize

### 4.2 SSE Streaming Endpoints

Express routes (not tRPC — SSE requires raw HTTP):

- `GET /api/runs/:runId/stream` — all events for a specific run
- `GET /api/teams/:teamId/stream` — events across active runs for a team
- `GET /api/monitoring/active-stream` — events across all active runs for user

### 4.3 Internal REST APIs (Node ↔ Python)

- `POST /api/internal/orchestrator/system-impact` — 046 → orchestrator: incident impact
- `POST /api/internal/orchestrator/system-broadcast` — 046 → orchestrator: system messages
- `POST /api/internal/virtual-admin/team-escalation` — orchestrator → 046: escalation
- `POST /api/internal/team-runs/:runId/execute-turn` — Node → Python: execute agent turn via LLM
- `GET /api/internal/team-runs/:runId/agent-status` — Node → Python: get agent execution state

### 4.4 Python FastAPI Endpoints

- `POST /api/team-orchestrator/execute-turn` — execute one agent turn (prompt → LLM → response)
- `POST /api/team-orchestrator/generate-summary` — generate run summary via LLM
- `POST /api/memory/embed` — generate embedding for memory content
- `POST /api/memory/search` — vector similarity search on scoped_memories

---

## 5. Frontend Architecture

### 5.1 Chat Shell Migration

Transform `/chat` from single-conversation shell to unified orchestration shell.

**Unified thread reference** (replace `selectedConversationId: number | null`):
```
type ActiveThreadRef =
  | { kind: "chat"; id: number }
  | { kind: "team_room"; id: string }
  | { kind: "agency_conversation"; id: string; agencyId: string }
  | { kind: "external_inbox_task"; id: string }
```

**Sidebar redesign**: Sections: Chats, Teams, Auto Sessions, Inbox, Agency Jobs. Badges for participant count, pending approval, active run, unread.

**New creation menu**: New Chat, New Team Chat, New Automatic Team Chat, New Team.

**Route model**: `/chat?thread=chat:123`, `/chat?thread=team_room:room_123`, etc.

### 5.2 Team Builder (Extend Agency Builder)

Add team-specific overlay to existing AgencyBuilder.tsx:
- Team metadata panel (name, description, category)
- Member persona binding (select existing persona or create inline)
- Policy configuration (autonomy, visibility, memory, approval)
- Quick mode: pre-populate from template
- Validation overlay (lead required, persona required, memory scope created)

### 5.3 Team Room View

New component rendering team conversations:
- Multi-avatar message bubbles (different colors per agent)
- System message bubbles (distinct style for system guardian messages)
- Recipient indicators (@agent_name or @all)
- Turn type badges (discussion/handoff/review/decision/summary)
- Run status bar (when a run is active)

### 5.4 Live Run Monitor

Split-panel view during active runs:
- Left: Agent roster with live status indicators (idle/active/thinking/error)
- Center: Activity timeline with chronological events
- Bottom: Run controls (pause/stop/intervene/cost detail)
- Budget progress bar
- Duration indicator

### 5.5 Orchestrator Dashboard

New dashboard page or tab:
- Active runs across all teams
- Agent utilization (active/idle/errored)
- Pending approvals with aging
- Recent completions with outcome summary
- Cost overview by team/agent/period
- System status indicator (from system_resource_state)

### 5.6 Right Panel Extension

Add new panel modes for team rooms:
- `participants` — assistant identity, status, assigned task
- `activity` — event stream in human-readable form
- `approvals` — pending human-in-loop checkpoints
- `summary` — latest run summary
- Existing modes (memory, skills, artifacts, schedule, canvas) remain

### 5.7 Brainstorm Hard Cutover

- Remove brainstorm toggle from ChatView header
- Remove brainstormPartnerModel/brainstormMaxRounds from conversation creation
- Replace with "Discuss as Team" / "Debate" / "Critique Draft" / "Synthesize" actions
- Old brainstorm conversation entries remain readable (legacy message format unchanged)

---

## 6. Python Backend Extensions

All Python files go under `python-backend/app/services/` (services) or `python-backend/app/api/` (FastAPI routes).

### 6.1 Team Orchestrator Service (`python-backend/app/services/team_orchestrator.py`)

Extends existing `agency_orchestrator.py` pattern for team-specific execution:
- Execute agent turns with team context (persona, memory scopes, room history)
- Handle lead-directed turn order (extract nextSpeakerHint from LLM response)
- Track token usage and cost per agent per turn
- Emit structured events for monitoring

### 6.2 Memory Embedding Service (`python-backend/app/services/memory_embedding.py`)

New Celery task + FastAPI endpoint:
- Generate embeddings using configured model (e.g., text-embedding-3-small)
- Batch embedding for bulk memory creation
- Triggered on memory create/update

### 6.3 Summary Generation Service (`python-backend/app/services/summary_generator.py`)

FastAPI endpoint for generating run summaries:
- Accept conversation history + run metadata
- Generate structured summary (objective, decisions, findings, artifacts, next steps)
- Use cheapest model for system-generated summaries

### 6.4 Inter-Agent Bridge (`python-backend/app/api/inter_agent_bridge.py`)

FastAPI endpoints for 046 integration:
- Receive impact notifications from Node.js
- Forward escalation requests to 046 sensor system
- Publish diagnosis results back to Node.js

---

## 7. Event System

### 7.1 Event Taxonomy

Core events: room_created, participant_joined, run_queued, run_started, assistant_activated, assistant_message_delta, assistant_message_final, handoff_requested, handoff_completed, tool_call_started, tool_call_completed, artifact_created, artifact_updated, memory_written, memory_promoted, approval_required, approval_resolved, summary_updated, summary_ready, run_paused, run_completed, run_failed.

Monitoring events: agent_status_changed, agent_task_assigned, agent_task_completed, agent_error, agent_retry, agent_stuck_detected, agent_loop_detected, agent_budget_warning, agent_budget_exceeded, agent_muted, agent_unmuted, agent_turn_completed, agent_slow_response, run_milestone_reached, run_budget_threshold, run_snapshot_captured.

Intervention events: orchestrator_intervened, orchestrator_paused_run, orchestrator_resumed_run, orchestrator_stopped_run, orchestrator_redirected_agent, orchestrator_adjusted_budget.

Inter-agent events: system_message_received, system_run_paused, system_run_stopped, system_run_resumed, system_context_injected, system_context_cleared, team_escalation_sent, team_escalation_resolved, resource_state_changed, impact_assessment_completed.

External events: external_task_received, external_task_routed, external_task_materialized, external_task_rejected, human_review_required, human_review_completed.

### 7.2 Event Envelope

All events normalize to: eventId, eventType, tenantId, teamId, roomId, runId, ts, actorType (user/assistant/system), actorId, visibility, audience, data (jsonb).

### 7.3 SSE Fan-out

Events are published to Redis pub/sub channels keyed by runId/teamId. SSE endpoints subscribe to relevant channels and filter by visibility before forwarding to client.

**Reconnection strategy**: Each SSE response includes a `Last-Event-ID` header with the eventId. On reconnection, the client sends this ID; the server replays missed events from `agent_activity_events` table (queried by runId + createdAt > lastEventTimestamp). Replay window: max 5 minutes of events. Beyond that, client must do a full state fetch via `monitoring.getRunStatus`.

**Heartbeat**: SSE endpoints send a comment-only heartbeat (`:heartbeat\n\n`) every 15 seconds to prevent proxy/load-balancer timeout. Client detects connection loss if no data/heartbeat for 30 seconds and auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s).

### 7.4 Event Compatibility Mapping (from spec §18.5)

Current agency event streams map to the new taxonomy:

| Legacy Event | New Event | Notes |
|---|---|---|
| `agent_switch` | `assistant_activated` | Same semantics, new name |
| `tool_call` | `tool_call_started` | Split into started/completed |
| `tool_result` | `tool_call_completed` | Pairs with tool_call_started |
| `handoff` | `handoff_requested` or `handoff_completed` | Split by phase |
| `preview_ready` | `artifact_created` | Generalized |
| `brainstorm_done` | `summary_ready` + `run_completed` | Decomposed into two events |

Legacy consumers should be updated to subscribe to new event names. During transition, the SSE streaming layer (section-11) can emit both old and new event names if `legacyCompat: true` is set on the stream endpoint.

---

## 8. Data Migration

### 8.1 Brainstorm Hard Cutover

- Drop `brainstormPartnerModel` and `brainstormMaxRounds` columns from conversations table
- Old brainstorm messages remain in messages table (no deletion)
- No conversion of old brainstorm sessions to team_runs (read-only legacy)

### 8.2 Entity Memory Migration

- Create `scoped_memories` table (additive)
- Write migration script: copy entity_memories → scoped_memories with ownerType mapping
- Dual-write during transition: new memories go to scoped_memories, old path also writes entity_memories
- Cutover: switch all reads to scoped_memories, deprecate entity_memories path
- Keep entity_memories table readable indefinitely (no drop)

### 8.3 pgvector Setup

Prerequisites: pgvector extension must be installed on PostgreSQL (already available in Docker image or `apt install postgresql-15-pgvector`).

Migration SQL:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- embedding column is part of scoped_memories table definition
-- HNSW index for approximate nearest neighbor:
CREATE INDEX scoped_memories_embedding_idx ON scoped_memories
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

Backfill strategy:
1. Celery task `backfill_memory_embeddings` processes memories in batches of 100
2. Uses configured embedding model (default: text-embedding-3-small, 1536 dims)
3. Rate-limited to avoid API cost spike (max 1000 embeddings/hour)
4. Null embeddings are valid (keyword-only retrieval still works)

---

## 9. Rate Limiting & Safety

### Limits

| Limit | Default | Configurable |
|-------|---------|-------------|
| Max concurrent runs per user | 3 | Tenant setting |
| Max concurrent runs per tenant | 10 | Platform setting |
| Max agents per team | 10 | Yes |
| Max rounds per run | 50 | Stop policy |
| Max run duration | 60 minutes | Stop policy |
| Max tool calls per agent per turn | 5 | Yes |
| Max memory writes per run | 100 | Yes |
| Max inter-agent messages per minute | 100 | Per source agent |

### Concurrency Controls

- Artifact locks: one agent per artifact at a time (60s timeout)
- Memory writes: append-only for new, last-writer-wins for updates
- Automation destinations: one agent per destination per run at a time
- Sequential turns only (Phase 1-6): one agent speaks at a time

### Abuse Detection (from spec §23.2-23.3)

The system detects and flags:
- Runs that consistently hit max rounds without producing artifacts
- Agents that call the same tool repeatedly with same parameters
- Runs consuming credits far above team historical average
- Rapid room/run creation (potential bot abuse)

Throttling behavior:
- Soft limits: warn orchestrator, continue with reduced autonomy
- Hard limits: pause run, require orchestrator approval to continue

---

## 10. Localization

- `team_rooms.roomLanguage` field (default: inherit from user.preferredLanguage)
- Agent names and role titles: text columns, no Latin-only constraints
- `summaryService.ts`: pass roomLanguage as instruction in summary generation prompt
- `promptComposer.ts`: include `roomLanguage` in system message behavioral rules
- Cross-language agents: room language in system prompt says "All shared output must be in {roomLanguage}"
- UI labels: use existing i18n infrastructure (`apps/web/client/src/lib/i18n/`)
- Monitoring event summaries: generated in room language via summary prompt instruction

### Tracing & Debugging (from spec §14.8)

Developer/advanced user features:
- `monitoring.getTrace` tRPC procedure: full trace view per LLM call
- Trace filtering by agent, event type, time range
- Trace export as JSONL
- Correlation IDs linking team events to underlying agency runtime events
- Link from any team event to corresponding `provider_usage_log` entry

### Data Retention Policies

- `agent_activity_events`: 90 days, then archive or summarize
- `run_snapshots`: 7 days after run completion
- `orchestrator_notifications`: 30 days after read/dismissed
- `inter_agent_messages`: 90 days

---

## 11. Testing Strategy

### Unit Tests (Vitest for TS, pytest for Python)

| Component | Coverage Target | Key Test Cases |
|-----------|----------------|----------------|
| Team CRUD service | 90% | Create/update/archive, template instantiation, validation |
| Room service | 90% | Create room, add/remove participants, message routing |
| Run engine | 95% | Start/pause/resume/stop, turn execution, budget tracking |
| Prompt composer | 90% | Memory retrieval order, budget truncation, persona injection |
| Stop policy | 95% | All 7 conditions, graceful vs hard stop |
| Turn order engine | 90% | All 4 strategies, loop detection, mute handling |
| Memory service | 95% | Scope isolation, hybrid retrieval, promotion |
| Monitoring service | 85% | Event recording, snapshot capture, stuck detection |
| Summary service | 85% | All 3 generation methods, output structure |
| Inter-agent service | 90% | Impact assessment, escalation, broadcast |

### Integration Tests

- Full run lifecycle: create team → room → run → turns → stop → summary
- Cross-surface automation: agent triggers presentation, approval required
- External intake: submit task → inbox → materialize → run → complete
- Memory promotion: agent writes private → suggest → approve → shared
- Inter-agent: system incident → impact assessment → run paused → notification

### Load Tests

- 10 concurrent runs with 5 agents each
- SSE fan-out to 50 browser tabs
- agent_activity_events write throughput under load
- Memory retrieval latency with 10K+ scoped_memories

---

## 12. Open Product Questions

These questions from spec §21 must be resolved before or during implementation of the corresponding phase:

### Phase 1-2 (must resolve before implementation)
- Should team membership be defined per room, per reusable team, or both? → **Recommendation: per reusable team (simpler), with room-level overrides for muting**
- Should entity_memories be dual-written or migrated batch-wise? → **Decision: dual-write (per claude-interview.md)**

### Phase 3-4 (resolve during implementation)
- Should room summaries be generated continuously or only on demand? → **Recommendation: on-demand + on-completion**
- What is the stuck-agent detection threshold? → **Default: 120s, configurable per team**
- Should run snapshots be captured at fixed intervals or event-driven? → **Default: fixed 15s intervals**
- Should notification preferences be per-team or global? → **Recommendation: global with per-team overrides**

### Phase 5-7 (can defer)
- Should the orchestrator be represented as a participant avatar? → **Recommendation: yes, as a special "orchestrator" participant type**
- Should the user be able to "replay" completed runs step-by-step? → **Defer to post-MVP**
- What is the max concurrent active runs per user/tenant? → **Default: 3/user, 10/tenant**
- Should system-paused runs auto-resume when issue resolves? → **Recommendation: auto-resume with notification**
- Should the system auto-detect consensus or require explicit declaration? → **Recommendation: explicit declaration by lead agent initially, LLM-based detection later**
- What model for system-generated summaries? → **Decision: cheapest available (per claude-interview.md)**
- Should parallel agent turns be supported in Phase 1? → **Decision: deferred (per spec §14F.3)**
- How should cross-language teams handle artifact language? → **Decision: room language (per spec §22.3)**
- What is the max agents per team for UX feasibility? → **Decision: 10 (per spec §23.1)**
