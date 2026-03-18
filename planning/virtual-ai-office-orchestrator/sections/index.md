<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-identity
section-02-schema-rooms-runs
section-03-scoped-memory
section-04-team-service
section-05-room-run-engine
section-06-prompt-composer-turn-order
section-07-monitoring-notifications
section-08-summary-service
section-09-inter-agent-communication
section-10-trpc-routers
section-11-sse-streaming
section-12-frontend-shell-sidebar
section-13-frontend-team-builder
section-14-frontend-room-monitor
section-15-python-orchestrator-memory
section-16-automation-external-intake
section-17-brainstorm-cutover-migration
section-18-testing-integration
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-identity | - | 02, 03, 04, 05, 10 | Yes |
| section-02-schema-rooms-runs | 01 | 05, 07, 10 | Yes |
| section-03-scoped-memory | 01 | 06, 08, 15 | Yes |
| section-04-team-service | 01 | 05, 10, 13 | No |
| section-05-room-run-engine | 01, 02, 04 | 06, 07, 11, 14 | No |
| section-06-prompt-composer-turn-order | 03, 05 | 15 | No |
| section-07-monitoring-notifications | 02, 05 | 14 | Yes |
| section-08-summary-service | 03 | 05 (runtime) | Yes |
| section-09-inter-agent-communication | 02, 07 | 16 | No |
| section-10-trpc-routers | 01, 02, 04, 05, 07 | 11, 12 | No |
| section-11-sse-streaming | 05, 10 | 14 | No |
| section-12-frontend-shell-sidebar | 10 | 13, 14 | No |
| section-13-frontend-team-builder | 04, 12 | - | Yes |
| section-14-frontend-room-monitor | 05, 07, 11, 12 | - | No |
| section-15-python-orchestrator-memory | 03, 06 | - | Yes |
| section-16-automation-external-intake | 09 | - | Yes |
| section-17-brainstorm-cutover-migration | 05 | - | Yes |
| section-18-testing-integration | all | - | No (final) |

## Execution Order

1. **Batch 1** (no dependencies):
   - section-01-schema-identity

2. **Batch 2** (after 01):
   - section-02-schema-rooms-runs
   - section-03-scoped-memory
   - section-04-team-service

3. **Batch 3** (after 01-04):
   - section-05-room-run-engine
   - section-08-summary-service

4. **Batch 4** (after 05):
   - section-06-prompt-composer-turn-order
   - section-07-monitoring-notifications

5. **Batch 5** (after 05-07):
   - section-09-inter-agent-communication
   - section-10-trpc-routers

6. **Batch 6** (after 10):
   - section-11-sse-streaming
   - section-12-frontend-shell-sidebar

7. **Batch 7** (after 11-12):
   - section-13-frontend-team-builder
   - section-14-frontend-room-monitor
   - section-15-python-orchestrator-memory
   - section-16-automation-external-intake
   - section-17-brainstorm-cutover-migration

8. **Batch 8** (final, after all):
   - section-18-testing-integration

## Section Summaries

### section-01-schema-identity
Drizzle schema for core identity tables: user_orchestrator_profiles, assistant_teams, assistant_profiles, assistant_team_templates. Migrations + seed data.

### section-02-schema-rooms-runs
Drizzle schema for rooms and execution: team_rooms, team_room_participants, team_room_messages, team_runs. Plus monitoring tables: agent_activity_events, agent_run_summaries, run_snapshots, orchestrator_notifications.

### section-03-scoped-memory
Drizzle schema for scoped_memories + memory_promotions. pgvector extension setup. Hybrid retrieval service (keyword + vector). Memory CRUD with scope isolation.

### section-04-team-service
Team CRUD service: create (with transaction), update, archive, template instantiation, member management, validation.

### section-05-room-run-engine
Room lifecycle, message routing, run engine (start/pause/resume/stop), stop policy evaluation (7 conditions), budget tracking per agent.

### section-06-prompt-composer-turn-order
Prompt assembly (persona + memory + history + task context), token budget management, turn order strategies (lead-directed, round-robin, handoff), loop detection.

### section-07-monitoring-notifications
Monitoring service (event recording, snapshots, stuck detection), notification service extension (orchestrator notifications, preferences, delivery).

### section-08-summary-service
Three generation methods (agent-generated, system-generated, extractive), structured output format, freshness tracking.

### section-09-inter-agent-communication
Inter-agent message table + service, system resource state, impact assessment engine, escalation protocol, 046 integration endpoints.

### section-10-trpc-routers
All new tRPC routers: team, assistantProfile, teamRoom, teamRun, scopedMemory, monitoring, notification extension, automationHandoff, externalIntake.

### section-11-sse-streaming
SSE Express routes for run/team/user streams, Redis pub/sub fan-out, reconnection with Last-Event-ID, heartbeat.

### section-12-frontend-shell-sidebar
Chat shell migration (ActiveThreadRef), sidebar redesign (sections + badges), creation menu, route model, backward compat for existing chats.

### section-13-frontend-team-builder
Agency Builder extension for teams: metadata panel, persona binding, policy config, template quick mode, validation overlay.

### section-14-frontend-room-monitor
Team room view (multi-avatar messages, system bubbles), live run monitor (agent roster, timeline, controls), orchestrator dashboard, right panel extensions.

### section-15-python-orchestrator-memory
Python team orchestrator service, memory embedding service (Celery + FastAPI), summary generation endpoint, inter-agent bridge endpoints.

### section-16-automation-external-intake
automation_handoffs schema + service, external_task_sources/inbox/bindings schema + intake pipeline, trust tiers, MCP task tools.

### section-17-brainstorm-cutover-migration
Remove brainstorm fields, discussion preset templates, entity_memories → scoped_memories migration, localization fields, rate limiting config.

### section-18-testing-integration
Integration tests: full run lifecycle, memory scope isolation, inter-agent communication, load test configs, final quality verification.
