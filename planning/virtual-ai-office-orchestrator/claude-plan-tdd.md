# Virtual AI Office Orchestrator — TDD Plan

Mirrors the structure of `claude-plan.md`. Defines what tests to write BEFORE implementing each component.

**Frontend:** Vitest + React Testing Library + Happy DOM
**Backend (Node):** Vitest
**Backend (Python):** pytest with markers (unit, integration, e2e)

---

## 2. Schema Foundation

### 2.1 Core Identity Tables
- Test: teamService.createTeam creates all linked records (agency + team + profiles) in one transaction
- Test: teamService.createTeam rolls back ALL records if profile creation fails mid-way
- Test: assistant_profiles.isLead constraint — exactly one lead per team
- Test: assistant_profiles.personaId references valid persona for the tenant
- Test: user_orchestrator_profiles defaults are applied when fields omitted

### 2.2 Room & Message Tables
- Test: team_room_messages with senderType="assistant" requires senderAssistantId
- Test: team_room_messages visibility filtering — private_internal messages excluded from user queries
- Test: team_room_participants uniqueness — same user/assistant cannot join room twice

### 2.3 Run & Execution Tables
- Test: team_runs.stopPolicyJson validates against StopPolicy type shape
- Test: team_runs.status transitions follow valid state machine (queued→running→paused→completed)
- Test: team_runs.budgetSnapshotJson tracks per-agent cost accumulation

### 2.4 Scoped Memory Tables
- Test: scoped_memories ownerType="agent" + ownerId=A not readable by assistantId=B (isolation)
- Test: scoped_memories with ownerType="team" readable by all team members
- Test: memory_promotions creates audit record when memory scope changes
- Test: scoped_memories.embedding column accepts 1536-dim vector and null

### 2.5-2.7 Monitoring, Inter-Agent, Automation Tables
- Test: agent_activity_events append-only (no update/delete operations exposed)
- Test: inter_agent_messages channel validation (only system agents can use system_control)
- Test: automation_handoffs.approvalState transitions (not_required→N/A, pending→approved/rejected)
- Test: external_task_inbox.status transitions follow valid flow

---

## 3. Service Layer

### 3.1 Team Service
- Test: createTeam with valid input creates agency + team + profiles + memory scopes
- Test: createTeam with invalid input (no members) throws validation error
- Test: createTeam with missing lead throws validation error
- Test: createFromTemplate loads template config and instantiates correct number of members
- Test: updateTeamMember syncs changes to both assistant_profile and underlying agency_agent
- Test: archiveTeam sets status=archived, does NOT delete data

### 3.2 Room Service
- Test: createRoom creates room + adds orchestrator as participant
- Test: sendMessage from user routes to all agents (recipientType=all)
- Test: sendMessage from user to specific agent (recipientType=assistant) only visible to that agent
- Test: getMessages with viewMode=milestone filters out non-milestone messages
- Test: getMessages with viewMode=summary returns only summary turnType messages

### 3.3 Run Engine
- Test: startRun creates team_run with status=queued, then transitions to running
- Test: executeTurn calls promptComposer, then LLM, then records events
- Test: evaluateStopPolicy returns shouldStop=true when maxRounds reached
- Test: evaluateStopPolicy returns shouldStop=true when maxBudgetCredits exceeded
- Test: evaluateStopPolicy returns shouldStop=true when idleTimeoutSeconds elapsed
- Test: evaluateStopPolicy returns shouldStop=true when lead emits summary (if stopOnLeadSummary=true)
- Test: evaluateStopPolicy returns shouldStop=false when no conditions met
- Test: pauseRun preserves activeAssistantId and allows resumeRun to continue
- Test: stopRun generates agent_run_summaries for each participant
- Test: stopRun with requireFinalSummary=true triggers summary generation

### 3.4 Prompt Composition Engine
- Test: composePrompt includes persona section within 2000 token budget
- Test: composePrompt retrieves memories in correct order (agent→run→room→team→project→user)
- Test: composePrompt truncates conversation history when exceeding budget
- Test: composePrompt includes system resource state warnings when provider degraded
- Test: composePrompt excludes muted agents from available handoff targets
- Test: retrieveMemories deduplicates same fact across scopes (prefers more specific)
- Test: compressHistory preserves handoff, decision, and summary messages

### 3.5 Turn Order Engine
- Test: Lead-Directed strategy extracts nextSpeakerHint from LLM response
- Test: Lead-Directed falls back to round-robin when no hint provided
- Test: Round-Robin cycles through agents in sortOrder
- Test: Handoff-Based allows agent to specify next speaker
- Test: Loop detection triggers after 3 A→B→A→B cycles
- Test: Max consecutive turns (3) prevents agent monopolization
- Test: Muted agents are skipped in all strategies

### 3.6 Monitoring Service
- Test: recordEvent creates agent_activity_event with correct fields
- Test: captureSnapshot saves all agent statuses at capture time
- Test: computeRunSummaries produces one row per agent per run
- Test: detectStuckAgent returns stuck=true when agent has no events for >threshold
- Test: notifyOrchestrator creates orchestrator_notification record

### 3.7 Summary Service
- Test: agent-generated summary calls LLM with lead agent's persona
- Test: system-generated summary uses neutral prompt (no persona)
- Test: extractive summary collects only decision+summary+execution_update messages
- Test: output structure contains all required fields (objective, decisions, findings, etc.)

### 3.8 Memory Service Extension
- Test: createMemory with ownerType=agent sets visibility=private by default
- Test: searchMemories returns results from multiple scopes in correct priority order
- Test: hybrid retrieval combines keyword score + vector similarity
- Test: hybrid retrieval works when embedding is null (keyword-only fallback)
- Test: promoteMemory changes ownerType and creates memory_promotions record
- Test: agent A cannot read agent B's private memories via searchMemories

### 3.9 Inter-Agent Communication Service
- Test: sendSystemBroadcast creates inter_agent_messages for each target room
- Test: assessImpact maps provider_down incident to runs using that provider
- Test: assessImpact with credit_exhausted maps to all tenant runs
- Test: handleTeamEscalation creates inter_agent_message with channel=team_escalation
- Test: updateResourceState upserts system_resource_state correctly
- Test: getResourceState returns all current states for prompt injection

---

## 4. API Layer

### 4.1 tRPC Routers
- Test: team.create requires authenticated user with correct tenant
- Test: team.create returns teamId + agencyId + member list
- Test: teamRoom.sendMessage validates sender is a participant
- Test: teamRun.start requires valid roomId and budget cap
- Test: teamRun.intervene only allowed by orchestrator user
- Test: monitoring.getActivityTimeline returns paginated events with cursor
- Test: notification.markRead updates isRead and readAt
- Test: scopedMemory.search returns results filtered by caller's accessible scopes
- Test: automationHandoff.approve transitions status and triggers execution

### 4.2 SSE Endpoints
- Test: /api/runs/:runId/stream returns SSE content-type header
- Test: SSE events are filtered by visibility before sending to client
- Test: SSE reconnection with Last-Event-ID replays missed events
- Test: SSE heartbeat sent every 15 seconds

### 4.3 Internal REST APIs
- Test: POST /api/internal/orchestrator/system-impact returns affected runs
- Test: POST /api/internal/virtual-admin/team-escalation creates incident
- Test: Internal APIs require gateway authentication token

---

## 5. Frontend

### 5.1 Chat Shell Migration
- Test: ActiveThreadRef renders correct component for kind=team_room
- Test: Sidebar shows Teams section with active run badges
- Test: New creation menu renders all 4 options
- Test: Route /chat?thread=team_room:room_123 selects correct room

### 5.2 Team Builder
- Test: Team builder loads ReactFlow with team metadata panel
- Test: Team builder validates at least 1 member and 1 lead
- Test: Persona binding modal shows existing personas for selection
- Test: Template instantiation populates all member slots

### 5.3 Team Room View
- Test: Messages render with correct agent avatar and color
- Test: System messages render with distinct style
- Test: Recipient indicator shows @agent_name for directed messages
- Test: Turn type badges display correctly for each type

### 5.4 Live Run Monitor
- Test: Agent roster shows correct status indicator per agent
- Test: Activity timeline renders events in chronological order
- Test: Pause/Stop/Intervene buttons call correct API
- Test: Budget progress bar updates on new cost events

### 5.7 Brainstorm Hard Cutover
- Test: Brainstorm toggle is removed from ChatView header
- Test: Old brainstorm conversations still render messages correctly
- Test: New conversation creation does not offer brainstorm option

---

## 6. Python Backend

### 6.1 Team Orchestrator
- Test: execute_turn calls LLM with correctly assembled prompt
- Test: execute_turn tracks token usage per agent
- Test: execute_turn extracts nextSpeakerHint from response

### 6.2 Memory Embedding
- Test: embed endpoint returns 1536-dim vector for valid input
- Test: batch embedding processes multiple memories correctly
- Test: embedding failure returns null (graceful degradation)

### 6.3 Summary Generation
- Test: generate_summary returns structured JSON with all required fields
- Test: generate_summary uses cheapest model for system-generated type
- Test: generate_summary respects roomLanguage instruction

### 6.4 Inter-Agent Bridge
- Test: system-impact endpoint validates authentication
- Test: system-impact returns list of affected runs with correct impact levels
- Test: team-escalation endpoint creates incident in virtual_admin_incidents

---

## 7-11. Event System, Migration, Rate Limiting, Localization, Testing

### Events
- Test: event envelope includes all required fields (eventId, tenantId, teamId, etc.)
- Test: visibility filtering excludes private_internal events from user-facing queries

### Migration
- Test: entity_memories → scoped_memories migration preserves all data
- Test: dual-write creates records in both tables during transition
- Test: brainstorm column drop migration does not affect existing messages

### Rate Limiting
- Test: concurrent run limit rejects run.start when limit reached
- Test: agent turn tool call limit stops agent after max 5 tool calls per turn
- Test: inter-agent message rate limit rejects after 100/minute

### Localization
- Test: summary generation includes roomLanguage instruction
- Test: Thai characters accepted in agent displayName and nickname

### Integration Tests
- Test: full run lifecycle (create team → room → run → 3 turns → stop → summary)
- Test: memory scope isolation across agents in same team
- Test: inter-agent communication (system incident → room message → notification)

---

## Missing Coverage Additions (from review)

### Orchestrator Dashboard Tests (§5.5)
- Test: active runs list renders with team name and status
- Test: pending approvals section shows items with aging
- Test: cost overview displays per-team breakdown
- Test: system status indicator reflects resource state
- Test: navigates to run detail on row click

### Right Panel Extension Tests (§5.6)
- Test: participants panel shows assistant identity and status
- Test: activity panel renders event stream in human-readable form
- Test: approvals panel shows pending checkpoints with approve/reject
- Test: summary panel shows latest run summary

### teamOrchestrationBridge Tests
- Test: gateway token header sent to Python backend
- Test: timeout handling returns error response
- Test: Python backend error does not crash caller
- Test: nextSpeakerHint extracted from response

### trustTierPolicy Tests (§16)
- Test: untrusted source always requires human review
- Test: verified source requires review for side-effecting destinations only
- Test: trusted_internal allows auto-materialization
- Test: team-level policy overrides source trust tier
- Test: externalSourceAuth middleware rejects invalid token

### orchestratorRateLimitGuard Tests
- Test: Redis sorted-set inter-agent message rate tracking
- Test: getEffectiveRateLimits merges tenant overrides with defaults

### Client SSE Hook Tests (§4.4 — useRunStream)
- Test: connects to correct URL for runId
- Test: passes Last-Event-ID on reconnection
- Test: exponential backoff (1s, 2s, 4s, max 30s)
- Test: detects stale connection after 30s
- Test: cleanup on unmount disconnects stream

### orchestratorNotificationService Tests (§3.6b)
- Test: markAllRead bulk updates for user
- Test: dismiss sets isDismissed without delete
- Test: getUnreadCount returns correct count
- Test: listNotifications paginated with cursor

### Additional Stop Policy Tests
- Test: maxDurationMinutes triggers stop
- Test: stopOnConsensus triggers stop
- Test: stopOnArtifactReady triggers stop

### Additional Missing Stubs
- Test: Celery embed_memory task updates embedding column
- Test: Celery backfill_memory_embeddings batch processes
- Test: SnapshotIntervalManager starts/stops capture per run
- Test: dead-letter fallback when all agents unavailable
- Test: brainstorm remains valid CreditSourceType for historical records
- Test: seed creates 4 discussion templates with valid JSON
- Test: isSummaryFresh returns false when new messages exist
- Test: system-broadcast endpoint creates inter_agent_messages per room
