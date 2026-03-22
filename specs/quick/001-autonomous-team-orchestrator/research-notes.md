# Research Notes

## Planning Depth

Promoted in spirit to architecture-heavy analysis, but kept in a compact quick-plan package because the current request asks for impact analysis and direction rather than immediate implementation.

## Current SmartSpec Capabilities

### Persona

- Persona already supports templates, nickname, gender style, tone, restrictions, and optional working hours.
- Persona is reusable data and can be attached to multiple teams because `assistant_profiles.personaId` is indexed but not unique.
- Persona is better understood as identity + expertise + behavior defaults.

Relevant files:

- `apps/web/client/src/components/settings/PersonaEditorFields.tsx`
- `apps/web/client/src/components/settings/personaForm.ts`
- `apps/web/server/services/personaService.ts`
- `apps/web/drizzle/schema.ts`

### Teams and lead model

- Teams are durable entities backed by agencies.
- Team validation already requires exactly one lead member.
- Team members are stored as `assistant_profiles`, which wrap team-specific role data around a reusable persona.
- `agencyAgents.isEntryPoint` mirrors lead selection at team creation/add-member time.

Relevant files:

- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/drizzle/schema.ts`

### Team room and inspectable trace

- Team rooms are durable.
- Room messages support sender/recipient, turn type, visibility, and per-run linkage.
- View modes already exist: `transparent`, `milestone`, `summary`.
- User callers can retrieve room history with filtering.

Relevant files:

- `apps/web/server/services/roomService.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`

### Run engine and orchestration gap

- Team runs support lifecycle, stop policies, active assistant tracking, budget snapshots, and summary generation.
- Start-run seeds `activeAssistantId` with the team's lead member.
- However, the current run engine does not yet execute a full multi-turn autonomous orchestration loop over members.
- There is a `turnOrderEngine` with strategies like `lead_directed`, `handoff`, and `round_robin`, but it is not currently wired into the run engine.
- There is a Python bridge for `execute-turn` and it supports `nextSpeakerHint`.

Relevant files:

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/turnOrderEngine.ts`
- `apps/web/server/services/teamOrchestrationBridge.ts`

### Summaries and performance visibility

- There is already a summary service for extractive or LLM-generated run summaries.
- Agent run summaries and monitoring events exist.
- This is a strong foundation for daily recap, “yesterday review”, and problem digests.

Relevant files:

- `apps/web/server/services/summaryService.ts`
- `apps/web/server/services/monitoringService.ts`

### Scheduling and routine automation

- SmartSpec already has a scheduler backed by Cloud Tasks / Cloud Scheduler style flows.
- Scheduled work can deliver reminders, execute skills, create notifications, and even run headless presentation draft generation.
- This is strong evidence that daily routine task triggering should reuse the existing scheduler infrastructure rather than invent a new scheduler.

Relevant files:

- `apps/web/server/routers/scheduledMessages.ts`
- `apps/web/server/routes/tasks.ts`
- `apps/web/server/services/scheduler.ts`

### Approvals and notifications

- Approvals already exist through a dedicated approval router that proxies to Python backend APIs.
- Notifications exist in two parallel surfaces:
  - user notifications for general reminders/alerts
  - orchestrator notifications for team/run-specific events
- SSE streaming exists for both notifications and orchestrator events.

Relevant files:

- `apps/web/server/routers/approvals.ts`
- `apps/web/server/services/notificationService.ts`
- `apps/web/server/services/orchestratorNotificationService.ts`
- `apps/web/server/routes/notificationStream.ts`
- `apps/web/server/routes/orchestratorStream.ts`

## Product Implications

### Persona reuse across many teams is safe

- Current schema intentionally allows one persona to be attached to many teams.
- This is desirable because persona should act like a reusable employee archetype or named collaborator identity.
- Team-specific duty, authority, and approval behavior should live in `assistant_profiles` or adjacent runtime config, not by cloning personas per team.

### Main gap for “autonomous employee” behavior

The missing layer is not persona creation. The missing layer is:

- a durable work-inbox model
- a routine planner / routine catalog
- automatic run kickoff logic
- orchestration loop execution
- approval routing rules
- daily review and recovery pass

## External Research: OpenClaw

Reviewed official OpenClaw documentation on March 19, 2026.

### Findings

- OpenClaw treats multiple agents as isolated workers with separate workspaces, auth, sessions, and bindings.
- OpenClaw has built-in cron jobs that persist schedules, can wake an agent/session automatically, and can deliver output back to a chat or webhook.
- OpenClaw exposes operational checks such as auth monitoring suitable for cron/systemd alerting.

### Why it matters

- The “many named workers with isolated execution contexts” mental model is a strong fit for SmartSpec teams.
- The “scheduler wakes agent and posts result back to a conversation” model is also directly relevant.
- However, SmartSpec still needs product-specific layers that OpenClaw docs do not solve for us:
  - team memory scopes
  - artifact approval workflow
  - tenant-safe shared business automation
  - team-level dashboards
  - cross-surface outputs like presentations/media/workflows inside one product

### Official sources

- https://docs.openclaw.ai/concepts/multi-agent
- https://docs.openclaw.ai/tools/multi-agent-sandbox-tools
- https://docs.openclaw.ai/automation/cron-jobs
- https://docs.openclaw.ai/automation/auth-monitoring
