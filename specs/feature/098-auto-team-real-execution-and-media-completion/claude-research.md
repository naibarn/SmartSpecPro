# Deep Plan Research: Feature 098 Auto-Team Real Execution and Media Completion

## Research Decision

Codebase: yes.
Reason: this is an existing git repository with Work OS, Team Rooms, Media Studio, Agency, and automation services already implemented.

Web topics: limited.
Reason: the spec names video generation and Veo 3.1, and the implementation handles user-supplied media references. Official Google AI docs and OWASP guidance were checked only for lifecycle/security constraints, not for new product scope.

Testing: existing TypeScript/Vitest setup.
Reason: `apps/web/package.json` uses `vitest run`, with server tests under `apps/web/server/**/__tests__`, client React tests under `apps/web/client/src/**/__tests__`, shared contract tests under `apps/web/shared/**/__tests__`, and schema tests under `apps/web/drizzle/__tests__`.

## Primary Codebase Findings

### Current Auto-Team Flow

`apps/web/server/services/runEngine.ts` owns team run lifecycle:

- `startRun()` creates `team_runs`, sets `team_rooms.lastRunId`, creates an initial `team_work_items` record, captures a plan artifact snapshot, and queues auto-advance for `auto_team`.
- `initializeRunWorkContext()` creates a kickoff work item, posts kickoff messages, and routes the work item to `research`.
- `runNextTurn()` selects an assistant, picks an active work item, builds an auto-team objective, resolves a route, executes a skill turn, posts the assistant message, updates budget and snapshots, and advances/stops the loop.
- Human plan-choice and final-approval pauses already exist in concept, but completion still relies on turn counts, stop policy, and message-level progress more than objective-specific evidence.

Current gap: the run engine has a plan artifact and work items, but it does not have canonical per-stage execution records, route-decision records, media job references, review records, or final-result records that can prove a media objective completed.

### Current Routing Behavior

`apps/web/server/services/teamRunSkillExecutor.ts` owns auto-team skill turn execution:

- `buildAutoTeamTurnRoute()` currently starts auto-team turns at `skill-orchestrator`.
- `resolveTeamOrchestratorRoute()` attempts agency detection, image/video regex detection, classifier fallback, then room intent fallback.
- Video objectives can select `video-prompt-engineer`, `video-storyboard-to-prompts`, or `cinematic-video-createprompt`.
- Image objectives can select `image_prompt_engineer` or `smart-landscape-designer`.
- Prompt skills with `chainTo` can call `executeUnified()` and produce a media job result.

Current gap: media routing is opportunistic. There is no persisted route class, no hard route-family gate before execution, no block reason when a media request resolves to article writing, and no mandatory downstream media job before completion.

### Unified Orchestrator and Media Executors

`apps/web/server/services/unifiedOrchestrator.ts` provides a useful internal execution boundary:

- `classifyCapability()` maps skill category or execution policy to `media.image`, `media.video`, `media.audio`, `writing.article`, `writing.review`, `orchestration.swarm`, or `skill_factory.create`.
- `executeUnified()` supports `capabilitiesAllowed`, server-generated media bearer token injection, credit modes, executor selection, audit logging, and persistence hooks.
- `apps/web/server/services/executors/videoExecutor.ts` calls `mediaGenerationService.generateVideoAsync()`.
- `apps/web/server/services/executors/imageExecutor.ts` currently calls `mediaGenerationService.generateImage()` synchronously, while `mediaGenerationService.generateImageAsync()` exists.

Current gap: auto-team does not consistently use `capabilitiesAllowed` to enforce media route families, does not persist media job handles into Work OS/Team durable records, and does not poll/resume media jobs as execution stages.

### Media Generation Service

`apps/web/server/services/mediaGenerationService.ts` already has:

- `generateImageAsync()`
- `generateVideoAsync()`
- `generateAudioAsync()`
- `getTask(taskId)`
- request/response audit logging
- provider/model normalization
- SSRF-style helper usage for media model extra params and reference URLs

Current gap: Team auto-run needs a durable adapter around these existing methods so media jobs become first-class auto-team execution stage records instead of transient executor payloads.

### Work OS, Requests, and Cases

`apps/web/server/services/workOsService.ts` already models:

- `work_requests`
- `work_cases`
- assignments, approvals, exceptions, outcomes, SLAs, events
- `WorkInboxCase` and `MyWorkRequestRecord` projections with team run linkage
- Work OS automation projection functions from `workAutomationFabricService`

Migrations already present:

- `apps/web/drizzle/0150_work_os_automation_fabric.sql`
- `apps/web/drizzle/0151_work_os_automation_policy_resolution.sql`
- `apps/web/drizzle/0152_work_os_automation_step_idempotency_unique.sql`
- `apps/web/drizzle/0154_team_room_language.sql`

Current gap: the automation fabric tables are useful but too generic for the observed failure. Feature 098 should add or map canonical auto-team records so Work OS can show route/stage/media/review/final-result evidence without deriving it from room messages.

### Team Work Items and Role Assignments

`apps/web/server/services/workItemService.ts` provides:

- status model: `planned`, `in_progress`, `in_review`, `needs_revision`, `awaiting_approval`, `completed`, `failed`, `blocked`, `cancelled`, `superseded`
- role assignment resolution for orchestrator, researcher, reviewer, publisher
- version-safe revisions
- immutable `work_item_events`

Current gap: work items are broad and revision-safe, but they need execution-stage bindings (`planStepKey`, route decision, artifact refs, job refs, reviewer refs) to prevent free-floating assistant messages.

### Room Messages and UI

`apps/web/server/services/roomService.ts` supports `postWorkUpdate()` with:

- `workItemId`
- `artifactRefs`
- `metadataJson`
- redaction and summary behavior

`apps/web/client/src/components/orchestrator/TeamRoomView.tsx`, `RoomWorkflowPanel.tsx`, and `RunMonitorPanel.tsx` already display team room state, plans, Work OS linkage, and policy gates.

Current gap: UI can only display what the backend records. It needs explicit stage/job/review/final-result data, plus a room detail panel and collapsible sections that stay understandable when the room list/header is collapsed.

### Agency Swarm

`teamRunSkillExecutor.ts` has `executeAgencySwarmTurn()` via `agencyBridge.executeRun()`. Agency routers and tests exist under `apps/web/server/routers/agency*.ts` and agency UI under `apps/web/client/src/components/agency`.

Current gap: agency execution is a turn result, not a governed auto-team stage with `agencyRunId`, status polling, artifact refs, and completion evidence.

## Production Failure Evidence from the Reported Room

Room `ad2e7e07-8820-40ff-bc74-3d976572deb9` showed:

- `team_rooms.language = th`
- `roomType = auto_team`
- `autonomyLevel = autonomous`
- `lastRunId = f2588e4a-8c8b-46b3-99c9-c0c30166170c`
- `team_runs.executionMode = auto_team`
- `team_runs.status = completed`
- `team_runs.stopReason = max_rounds_reached`
- 22 messages total, all assistant/system, with 20 messages missing `workItemId`
- 20 messages had route metadata `writing.article` and `selectedSkillId = parenting-article-writer`
- no image/video/agency route, no media job refs, no artifact refs, no final review
- active work item remained `in_progress`

Conclusion: the system had activity but not completion. The plan must make this exact failure impossible by blocking wrong-route media objectives and refusing completion without durable evidence.

## Web Research Findings

Google AI for Developers documents Veo 3.1 as a programmatic Gemini API video generation model and describes generation as a model-backed video capability with variants and prompting guidance, not as plain chat output. This supports the spec requirement that video objectives must produce a provider job/result handle and not just text. Source: https://ai.google.dev/gemini-api/docs/video

OWASP SSRF guidance emphasizes strict validation for URLs/domains/IPs, deny/allow list behavior, redirect handling, and metadata/private-network protections. This is directly relevant to media reference URLs, provider callback URLs, and any auto-team-generated media input references. Source: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

OWASP file upload guidance emphasizes extension/content validation, file signature validation, filename safety, storage location, user permissions, and upload limits. This applies to any future auto-team artifact upload or generated media artifact ingestion path. Source: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

## Testing Findings

Use existing Vitest conventions:

- Server unit tests: `apps/web/server/services/__tests__/*.test.ts`
- Router tests: `apps/web/server/routers/__tests__/*.test.ts`
- Client tests: `apps/web/client/src/**/__tests__/*.test.tsx`
- Shared contract tests: `apps/web/shared/__tests__/*.test.ts`
- Schema tests: `apps/web/drizzle/__tests__/*.test.ts`

Useful existing tests and patterns:

- `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`
- `apps/web/server/services/__tests__/teamRunIntegration.test.ts`
- `apps/web/server/services/__tests__/workOsService.test.ts`
- `apps/web/server/services/__tests__/mediaRoutingIntegration.test.ts`
- `apps/web/server/services/__tests__/workAutomationFabricService.test.ts`
- `apps/web/client/src/components/orchestrator/__tests__/TeamRoomView.test.tsx`
- `apps/web/client/src/components/orchestrator/__tests__/RoomWorkflowPanel.runtimeState.test.tsx`
- `apps/web/drizzle/__tests__/workAutomationSchema.test.ts`

Primary test command:

`npm --prefix apps/web test -- <target test files>`

Typecheck command:

`npm --prefix apps/web run check`

## Security Findings

The current system already has some important safety primitives:

- server-generated media bearer token injection in `executeUnified()`
- media SSRF tests under `apps/web/server/__tests__/media-ssrf-validation.test.ts`
- room content and metadata redaction in `roomService`
- tenant isolation checks in run loading and routers
- rate limiting for team run start and advance

Feature 098 must preserve and extend these:

- never trust room message text as completion evidence
- never accept client-supplied media auth tokens
- enforce tenant ownership for every route, stage, job, review, and final result record
- validate media refs with existing SSRF rules before provider calls
- block or pause on provider entitlement/readiness errors
- use idempotency keys for route decisions, stage records, media job refs, and review records
- record sanitized errors in user-visible UI while preserving detailed server logs
