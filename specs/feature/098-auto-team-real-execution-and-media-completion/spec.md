# Feature 098: Auto-Team Real Execution And Media Completion

## Problem

Features 095 and 096 created the Work OS and auto-team foundation, but production traces show that an `auto_team` run can still look active in the room while failing to complete the actual goal.

The clearest example is room `ad2e7e07-8820-40ff-bc74-3d976572deb9`.

Observed from the database:

- room language was `th`, room type was `auto_team`, and autonomy was `autonomous`
- the run was created as `auto_team`, but ended with `stopReason = max_rounds_reached`
- plan artifacts existed and included owner/reviewer mappings
- 20 of 22 room messages had no `workItemId`
- 20 messages routed to `writing.article` with `selectedSkillId = parenting-article-writer`
- 0 messages routed to image, video, or agency swarm execution
- 0 messages contained artifact references
- the final review was missing
- the active work item remained `in_progress`

This means the room produced discussion-like text, but not verified work output. The system needs to execute real work, create durable artifacts, call media or swarm capabilities when required, review the result, and finish with a clear terminal outcome.

## Product Goal

When a user starts automation from Work OS or My Requests, the system must drive the selected team to a real final result.

For a video request, success means the system progresses from brief to research, storyboard, prompt generation, video job creation, result tracking, reviewer validation, and final user-facing completion. It must not stop at conversational updates such as "we are ready to produce the video".

For an image request, success means the system creates image prompts, starts an image job, tracks the result, validates it, and records artifacts.

For complex work, success means the system delegates to Agency Swarm or another governed executor, tracks its job lifecycle, and resumes the auto-team workflow from the result.

## Dependency Notes

Feature 099 defines the shared context-engine contract for state, retrieval, compaction, tools/MCP, and evals.

Feature 098 does not re-implement that context engine. Instead, it consumes the shared context pack so that auto-team execution, guided Team turns, and media/agency routing operate on the same context sources as Chat where available.

## Scope

In scope:

- enforce typed execution routes for auto-team runs
- prevent media objectives from falling into generic article-writing routes
- require every meaningful turn to bind to a current work item, plan step, or job
- chain prompt-generation skills into real image or video generation
- support Agency Swarm for complex multi-agent work
- persist route decisions, selected skills, job handles, artifacts, reviews, and final outcomes
- make Work OS and Teams show the same execution trail
- consume the shared context pack from Feature 099 so Team prompt composition receives user, project, room, run, summary, and durable-memory continuity without duplicating retrieval logic
- make guided/manual Team room sends start or resume a real `team_chat` run instead of persisting user messages without an assistant execution path
- restrict scoped-memory CRUD/search/promote operations by actual room/team/project/run access, not tenant scope alone
- require artifact reads/downloads to use the same access policy as room/run/job/review reads, with redacted projections and server-side signed URLs only
- freeze the execution mode for a run at creation time so shadow/enforced/rollback behavior cannot change mid-run
- add retention cleanup for prompts, provider payloads, generated assets, artifact refs, and trace data according to policy
- add anomaly detection for repeated low-progress messages
- add deterministic completion criteria before a run can be marked complete

Out of scope:

- replacing the whole run engine
- removing chat messages from the room UI
- making every provider synchronous
- bypassing tenant, budget, media-safety, or human approval policy

## Non-Negotiable Rules

### Messages Are Evidence, Not Completion

A room message can describe progress, but it cannot by itself prove a step is complete.

A step is complete only when durable state advances, such as:

- work item status changes
- artifact refs are created
- media job ids are persisted
- review notes are attached
- Work OS mirror state updates
- final result is linked to the run

### Auto-Team Turns Must Stay Attached

Every auto-team execution turn after kickoff must include at least one durable attachment:

- `workItemId`
- `planStepKey`
- `jobHandle`
- `artifactRefs`
- `reviewId`
- `caseId`

If no durable attachment can be resolved, the engine must block with a diagnosable reason instead of generating free-floating text.

### Media Work Must Call Media Capabilities

If the objective is about image, video, storyboard, cinematic prompt, visual generation, or a named media model such as VEO, the route must enter a media chain.

Allowed media chain examples:

- video request: `video-orchestrator -> storyboard -> video-prompt -> video-creator -> media_job`
- image request: `image-orchestrator -> image-prompt -> image-creator -> media_job`

Disallowed for media objectives:

- `writing.article`
- `parenting-article-writer`
- generic article/blog skills
- repeated discussion-only execution updates

### Review Must Review Output, Not Intent

Reviewer personas must review actual artifacts or job results.

They must not approve based only on statements like:

- "the script is ready"
- "we are ready to produce"
- "the team has started production"

### Completion Must Be Evidence-Based

An auto-team run can be marked `completed` only when all required completion evidence exists for the objective class.

For a video objective, minimum evidence is:

- research or source summary artifact
- storyboard or scene plan artifact
- final video prompt artifact
- video media job id
- terminal media job status
- final reviewer score and comment
- final result link or failure explanation

### Team Context Must Consume The Shared Context Pack

Team and guided room prompts must consume the shared context pack contract defined by Feature 099.

That pack is responsible for the continuity sources that matter to correctness, including:

- user entity memories
- user rule memories
- project continuity summaries
- scoped assistant, run, room, and team memories
- selected room language

The Team-side implementation may use a Team-specific adapter rather than the exact `conversationId` pipeline used by Chat, but it must forward the contextual inputs that determine the pack:

- `initiatedByUserId`
- `currentMessage`
- `projectId` when available
- `room language`
- `memoryMode` or equivalent policy-controlled memory switch

If the shared context pack is disabled by mode or policy, the runtime state must make that explicit rather than silently omitting continuity context.

### Guided Team Chat Must Execute Through The Run Engine

In guided or manual Team rooms, a user message that requests assistant help must not be stored as a write-only chat event.

Required behavior:

- the message can start or resume a `team_chat` run
- the latest user message becomes the next turn's active objective/current message
- the assistant turn is emitted through the run engine and appears in run snapshots
- the response respects the room language and available memory context
- the assistant turn must be packed through the shared context-engine contract from Feature 099, not rebuilt as an ad hoc Team-only memory flow

`auto_team` rooms remain automation-led. User messages there may be captured as context for the current automation, but they must not masquerade as unrestricted free-chat completions when the room is still governed by the automation flow

## Execution Route Model

The run engine must classify every auto-team objective into an execution route before the first production turn.

Required route classes:

- `media.video`
- `media.image`
- `agency.swarm`
- `workflow.automation`
- `research.synthesis`
- `document.writing`
- `unknown.blocked`

Route classification must consider:

- objective text
- Work OS category
- selected team capabilities
- room type
- available skills
- media model mentions
- provider readiness
- policy constraints

The route decision must be persisted as:

- `routeClass`
- `selectedSkillId`
- `routeReason`
- `confidence`
- `blockedReason`
- `fallbackAttempted`
- `createdAt`

If confidence is low and the work is not safe to infer, the engine must use human choice or block. It must not silently route to article writing.

### Route Family Hard Gate

Classifier output is advisory until the route family is validated.

After classification, the engine must validate that the selected skill belongs to the allowed skill family for the selected route.

Required route families:

- `media.video`: video orchestrator, storyboard, video prompt, video creator, media video provider skills
- `media.image`: image orchestrator, image prompt, image creator, media image provider skills
- `agency.swarm`: agency swarm, multi-agent agency runtime, governed external agency executors
- `workflow.automation`: workflow execution, browser/session automation, connector actions, workpack routines
- `research.synthesis`: research, retrieval, evidence synthesis, source analysis
- `document.writing`: article, document, copy, summary, proposal, email, script text only

If a selected skill is outside the allowed family, the engine must reject it before execution and emit:

- `reason = route_skill_family_mismatch`
- `routeClass`
- `selectedSkillId`
- `allowedSkillFamilies[]`
- `objectiveClass`

For media objectives, `document.writing` skills may only be used as supporting substeps when the active plan step explicitly requests script text and the downstream media job is still required before completion.

## Canonical Durable Records

The implementation must standardize the records below before changing execution behavior. These records may be stored in existing tables or new tables, but their semantic fields must be durable and queryable.

### Durable Record Ownership

Before implementation, each canonical record must have one service owner and one source of truth.

Default ownership:

- route decisions: run engine or route policy service
- execution stages: run engine or automation fabric service
- media job refs: media job service shared with Media Studio
- review records: run engine review service
- final results: Work OS mirror or run completion service

No UI component may be the source of truth for these records. UI can derive and display state, but cannot invent route decisions, media jobs, reviews, or final results.

### Route Decision Record

- `routeDecisionId`
- `tenantId`
- `requestId`
- `caseId`
- `teamId`
- `roomId`
- `runId`
- `workItemId`
- `planStepKey`
- `routeClass`
- `selectedSkillId`
- `selectedSkillFamily`
- `routeReason`
- `confidence`
- `fallbackAttempted`
- `blockedReason`
- `createdAt`

### Execution Stage Record

- `stageId`
- `tenantId`
- `runId`
- `roomId`
- `workItemId`
- `planStepKey`
- `stageType`
- `status`
- `ownerMemberId`
- `reviewerMemberId`
- `routeDecisionId`
- `jobRefId`
- `artifactRefs[]`
- `startedAt`
- `completedAt`
- `blockedReason`

### Media Job Reference

- `jobRefId`
- `tenantId`
- `requestId`
- `caseId`
- `teamId`
- `roomId`
- `runId`
- `workItemId`
- `planStepKey`
- `provider`
- `providerModel`
- `requestedModel`
- `mediaType`
- `promptArtifactRef`
- `inputArtifactRefs[]`
- `idempotencyKey`
- `providerJobId`
- `status`
- `lastPolledAt`
- `nextPollAt`
- `resultArtifactRefs[]`
- `terminalError`
- `createdAt`
- `updatedAt`

### Review Record

- `reviewId`
- `tenantId`
- `runId`
- `roomId`
- `workItemId`
- `planStepKey`
- `reviewerMemberId`
- `reviewerPersona`
- `reviewType`
- `score`
- `recommendation`
- `comment`
- `issues[]`
- `artifactRefs[]`
- `jobRefId`
- `status`
- `createdAt`

### Final Result Record

- `finalResultId`
- `tenantId`
- `requestId`
- `caseId`
- `teamId`
- `roomId`
- `runId`
- `objective`
- `routeClass`
- `status`
- `artifactRefs[]`
- `jobRefIds[]`
- `reviewIds[]`
- `humanApprovalState`
- `summary`
- `createdAt`
- `completedAt`

## Artifact Taxonomy

Artifact refs must use stable types so the engine, UI, and tests can evaluate completion consistently.

Required artifact types:

- `research_brief`: factual source summary or research notes
- `storyboard`: scene-by-scene plan for video or visual sequence
- `script`: narration, dialogue, captions, or copy text
- `image_prompt`: prompt ready for image generation
- `video_prompt`: prompt ready for video generation
- `media_job_request`: serialized provider request after redaction
- `media_result`: generated image/video asset or provider result reference
- `review_note`: reviewer score, recommendation, and comments
- `repair_plan`: instructions for fixing failed review or provider output
- `final_summary`: final user-facing summary and result links

Every artifact must include:

- artifact id
- artifact type
- tenant id
- room id
- run id
- work item id when available
- plan step key when available
- source stage id
- created by member or system component
- redaction state
- created at

Artifact refs must not point to raw provider payloads unless the payload has passed redaction policy.

## Media Execution Contract

### Video Chain

A video route must produce these durable stages:

- `research_brief`
- `storyboard`
- `video_prompt`
- `media_job_created`
- `media_job_running`
- `media_job_completed` or `media_job_failed`
- `final_review`
- `final_result`

Each stage must have:

- owner persona
- reviewer persona or policy reviewer
- artifact refs
- state transition
- timestamp
- failure or retry rule

The `video-creator` stage must call the same media job infrastructure used by Media Studio or chat media skills. If the provider cannot accept the job, the run must enter `blocked` or `waiting_for_worker`, not pretend generation started.

### Idempotency And Polling

Media job creation must be idempotent.

The idempotency key must include:

- tenant id
- run id
- work item id
- plan step key
- prompt artifact checksum or version
- requested provider/model

Repeated execution of the same stage must reuse the existing non-terminal media job when the idempotency key matches.

Polling must be durable and safe to repeat:

- `queued` and `running` jobs move the run to `waiting_for_worker` or `waiting_for_poll`
- `succeeded` jobs attach result artifact refs and resume the plan
- `failed` jobs create a repair decision or block with terminal error
- timed-out jobs block or retry according to policy
- missing provider job ids block with `media_job_missing_provider_id`

## Stage SLA And Timeout Budgets

Each execution stage must have a timeout budget and terminal behavior.

Default budgets:

- route decision: 30 seconds
- plan artifact creation: 2 minutes
- research brief: 5 minutes
- storyboard: 5 minutes
- prompt generation: 3 minutes
- media job creation: 2 minutes
- media job polling: provider policy or 30 minutes default
- step review: 5 minutes
- final review: 5 minutes
- human final approval: 5 minutes
- Work OS mirror update: 1 minute

Timeout behavior:

- transient provider timeout may retry with backoff
- repeated timeout creates a repair item or blocks
- human final approval timeout follows the human approval policy
- media provider timeout must not mark the media stage complete
- review timeout must not approve the step

Every timeout must create a durable trace event and visible UI state.

### Image Chain

An image route must produce:

- image prompt artifact
- image media job id
- terminal media job status
- final review
- final result

### Provider And Model Selection

The system must choose provider/model from:

- explicit user request
- room/team defaults
- media studio defaults
- policy and availability

If the user explicitly names a provider/model such as `veo 3.1`, the route must preserve that preference in the job payload or explain why it cannot.

### Provider Unavailable And Entitlement Failure

If the requested provider or model is unavailable, disabled, over budget, or not allowed for the user/tenant, the system must not silently downgrade to text-only work.

Allowed outcomes:

- block with `provider_unavailable`
- block with `model_not_entitled`
- request human choice between allowed alternative providers/models
- retry when the provider status is transient and policy allows
- continue with a substitute provider only when policy allows and the substitution is recorded

Required evidence for provider/model failure:

- requested provider/model
- selected fallback provider/model when applicable
- entitlement or policy decision
- user-visible explanation
- retry or escalation decision

Disallowed outcomes:

- completing the run with only prompts
- claiming a media job was created without a provider job id or durable local job id
- hiding the provider failure in room chat

## Agency Swarm Contract

Complex objectives must route to Agency Swarm when the work needs more than a simple skill chain.

Agency Swarm delegation must persist:

- swarm job id
- selected agency or swarm template
- input brief
- expected artifacts
- current status
- result artifact refs
- error state

The auto-team engine must poll or subscribe to the swarm job and resume only after it has durable output.

Minimum completion evidence for `agency.swarm`:

- swarm job id
- selected agency or template version
- input brief artifact
- result artifact refs
- evaluation score or reviewer score
- reviewer comment
- handoff summary
- terminal swarm status

Agency Swarm must not be considered complete if it only returns chat text without durable result artifacts or evaluation evidence.

## Work Item State Machine

Auto-team work items must move through explicit states.

Required states:

- `planned`
- `assigned`
- `in_progress`
- `waiting_for_job`
- `ready_for_review`
- `reviewing`
- `needs_repair`
- `approved`
- `completed`
- `blocked`
- `failed`

Transitions must be validated.

### Database State Mapping

The implementation must explicitly choose one of these approaches before changing the state machine:

- migrate the `team_work_items.status` enum to include the required states
- or keep the existing DB enum and store the richer state in a separate runtime/stage record

The chosen mapping must be documented in code and covered by tests. UI labels must display semantic states, not raw enum compromises.

Invalid examples:

- `in_progress -> completed` with no artifact refs
- `ready_for_review -> approved` with no reviewer note
- `waiting_for_job -> completed` with no terminal job result
- repeated `in_progress` messages without new evidence

## Plan And Persona Enforcement

The durable plan artifact must be the authority for who does what.

Each plan step must include:

- `stepKey`
- `objective`
- `ownerPersona`
- `ownerMemberId`
- `reviewerPersona`
- `reviewerMemberId`
- `requiredArtifacts`
- `completionCriteria`
- `retryRule`

The engine must dispatch turns according to the active plan step.

If the active assistant does not match the plan owner or reviewer, the engine must either select the correct persona or record why the substitution is allowed.

## Review And Repair Loop

Review must happen at two levels:

- step review
- final result review

Step review must validate:

- output exists
- output matches the step objective
- evidence refs are attached
- provider/job result is real when media was required
- next step can proceed

Final review must validate:

- original objective was satisfied
- required artifacts exist
- media outputs are accessible
- language requirement was followed
- quality score meets threshold
- reviewer comment explains the score

### Reviewer Availability Policy

For `media.video`, `media.image`, and `agency.swarm`, reviewer unavailability is fail-closed.

The engine must not pass a step or final review with only a heuristic fallback when the objective requires real artifacts or external jobs.

Allowed reviewer-unavailable outcomes:

- retry with the same reviewer
- route to an approved backup reviewer persona
- request human review if policy allows
- block with `reviewer_unavailable`

Disallowed reviewer-unavailable outcomes:

- `status = passed`
- `recommendation = proceed`
- marking a work item `approved`
- marking a run `completed`

For low-risk `document.writing` requests, heuristic review may remain allowed only when policy permits and the UI clearly marks the review as heuristic.

If review fails, the system must create a repair work item and continue from the failed step. It must not restart vague conversation from the original brief unless re-planning is required.

### Human Final Approval

After final reviewer approval, the run may require human final approval depending on route class, risk class, tenant policy, or explicit user preference.

Human final approval must support:

- approve
- reject with comment
- request repair
- request replan
- timeout fallback according to policy

For media and agency routes, human rejection must create a repair or replan work item that carries:

- reviewer score and comment
- human comment
- final artifact refs
- failed stage or final result id
- improvement instructions

The system must not discard history when looping after human rejection. The next plan must reference prior attempts and explain how it improves the result.

## Loop And Repetition Guard

The engine must detect abnormal repetition.

Signals:

- repeated route class and skill with no new artifact
- repeated messages that claim progress but do not update durable state
- repeated same assistant/persona speaking without step transition
- repeated "ready to produce" messages without job creation
- repeated work item revision without status progress

When triggered, the run must move to `blocked` with:

- `reason = repeated_low_progress_execution`
- recent messages
- last route decision
- current work item id
- missing evidence

## Work OS And Teams UI Requirements

Work OS must remain the control plane for every request.

It must show:

- all old and new work requests
- execution trail per request
- target team
- room id
- room created time
- room language
- run id
- run status
- route class
- selected skill
- media job id or swarm job id when present
- current blocker or waiting reason
- final result

Teams must show:

- current room identity even when the room rail is collapsed
- room created time
- language
- autonomy mode
- route class
- selected skill
- current work item
- current plan step
- job state
- reviewer state
- whether the current room is automation-led or guided `team_chat`
- current room/run context even after the top room grid is collapsed
- stop/cancel controls

Guided/manual rooms must surface run-backed assistant replies rather than behaving like persist-only logs.

The UI must never make a handed-off job look lost. If a request moved into a new room, both Work OS and My Requests must show that room and run trail.

### Required Empty And Error States

Work OS, My Requests, and Teams must expose these states clearly:

- `No media job created`
- `Waiting for media provider`
- `Waiting for Agency Swarm`
- `Reviewer unavailable`
- `Blocked: missing artifact`
- `Blocked: route mismatch`
- `Blocked: missing work item binding`
- `Retrying provider`
- `Provider failed`
- `Final review required`
- `Human approval required`
- `Human rejected: repair required`
- `Provider unavailable`
- `Model not entitled`
- `Timed out: waiting for provider`

Each state must include the missing evidence or next expected event.

## Backward Compatibility And Backfill

Existing rooms and runs may not have route decisions, execution stages, media job refs, or final result records.

The implementation must degrade old records explicitly instead of hiding them.

Old room behavior:

- if no route decision exists, show `routeClass = unknown`
- if no execution stage exists, show `stage = legacy_unknown`
- if no media job exists for a media objective, show `No media job created`
- if the run ended with `max_rounds_reached`, show it as an abnormal completion, not successful completion
- if work items are still `in_progress` after the run ended, show `stale in-progress work item`

Optional backfill:

- infer route decisions from stored metadata when reliable
- attach historical messages to the nearest work item only when thread roots or metadata prove the link
- never fabricate media job refs, review records, or final results
- run only from a trusted operator/admin/debug context; `initiatedByUserId` alone does not grant elevated backfill access

Backfill must be idempotent and tenant-scoped.

## Observability And Debugging

Every start automation flow must emit structured trace events.

Required events:

- `automation.start.requested`
- `automation.room.created`
- `automation.run.started`
- `route.decision.created`
- `plan.artifact.created`
- `work_item.assigned`
- `skill.execution.started`
- `media_job.created`
- `media_job.completed`
- `review.started`
- `review.completed`
- `run.completed`
- `run.blocked`

Every event must include:

- tenant id
- case id when available
- request id when available
- team id
- room id
- run id
- work item id when available
- route class
- selected skill id
- artifact refs when available

### Trace Event Ordering And Idempotency

Durable trace events must be safe under retries and polling.

Every trace event must include:

- `traceEventId`
- `idempotencyKey`
- `sequence`
- `createdAt`
- `sourceComponent`

For a given run, `sequence` must be monotonic. Replayed or retried operations must reuse the same idempotency key when they represent the same logical transition.

Duplicate trace events must not create duplicate media jobs, duplicate review records, or duplicate final results.

The current `automation-start-trace.log` can remain as a development trace, but production behavior must be backed by durable events and UI-visible status.

## Security And Safety

The implementation must preserve:

- tenant isolation
- requester ownership checks
- team membership and queue ownership checks
- scoped-memory access checks for room, team, project, run, and assistant scopes
- media provider policy controls
- budget limits
- data classification
- human approval for irreversible or high-risk actions
- redaction for sensitive trace payloads
- provider payload redaction
- prompt injection defenses for external or archived context
- copyright, likeness, brand, and generated-media policy checks
- safe handling for user-provided media references
- retention controls for media prompts, generated assets, and provider payloads
- artifact read/download authorization with redacted projections and server-side signed URLs only
- room-health/context-engine monitoring views require room participation or admin/debug permission
- frozen run mode per execution so in-flight runs cannot switch between shadow/enforced/rollback
- idempotent retention cleanup for expired prompts, provider payloads, generated assets, trace data, and artifact refs

The system must not use media or swarm capabilities when the user or tenant is not allowed to access them.

The system must not falsely claim that a media job was created if the provider call failed.

External media providers must receive the minimum context needed to perform the job. Sensitive Work OS context, internal review notes, tenant secrets, and unrelated room history must not be sent to providers unless explicitly allowed by policy.

Scoped-memory mutation and retrieval endpoints must verify actual ownership or membership for the target scope. A user in the same tenant must not be able to create, search, update, delete, or promote memory for another user's room, team, project, or run unless policy explicitly grants that access.

### Post-Generation Output Safety

Generated media must pass an output safety check before final review or user-facing completion.

The safety check must consider:

- provider moderation result
- unsafe visual or textual content
- copyright or brand misuse
- likeness or person-policy concerns
- mismatch between requested language/locale and generated result
- prohibited or sensitive content introduced by provider output

If output safety fails, the run must create a repair item, request human review, or block according to policy. It must not publish or mark the result complete.

## Acceptance Criteria

### Video Request Happy Path

Given a Thai Work Request asking for a 24-30 second Songkran video using VEO, when the requester starts automation:

- a new auto-team room is created in the selected team
- the room language is Thai if the user selected Thai
- the route class is `media.video`
- generic article-writing skills are not selected
- research and storyboard artifacts are created
- a video prompt artifact is created
- a video media job is created
- the media job status is tracked
- the reviewer reviews the actual output or terminal job result
- final result is visible in Work OS, My Requests, and Teams
- the run completes only after evidence exists

### Misroute Guard

Given a media objective, when the router proposes `writing.article` or an article skill:

- the route is rejected
- the engine attempts the media route
- if no media route is available, the run blocks with an explicit reason
- the route decision is persisted with `route_skill_family_mismatch`

### No Floating Turns

Given an auto-team run, when a production turn is emitted:

- it has a `workItemId`, `planStepKey`, `jobHandle`, or `artifactRefs`
- otherwise the run blocks with `missing_execution_attachment`

### Guided Team Chat Memory Parity

Given a guided or manual Team room, when a user sends a follow-up message:

- the system starts or resumes a `team_chat` run instead of persisting the message only
- prompt assembly consumes the shared context pack from Feature 099, including `initiatedByUserId`, the current user message, room language, and available user/project/scoped memories
- the assistant reply is visible in the room as a run-backed turn
- `auto_team` rooms may capture the message as context, but they do not silently switch to unrestricted chat mode

### Scoped Memory Access Guard

Given a scoped-memory create/search/update/delete/promote request:

- user scope can target only the requesting user unless a stronger policy grants otherwise
- room scope requires room participation
- team scope requires ownership or active membership
- run scope requires access to the linked room
- project scope requires actual project participation
- cross-tenant and same-tenant-but-unrelated scope access is denied

### Artifact Access Guard

Given an artifact read or download request from Work OS, Teams, or a debug view:

- the request is authorized through the same shared access policy used for room/run/job/review reads
- raw storage references are not exposed to unauthorized users
- server-generated signed URLs, if used, are short-lived and tenant-scoped
- a copied deep link for an artifact does not leak cross-tenant existence

### Frozen Run Mode

Given an auto-team run that has already started:

- the run keeps the execution mode it was created with
- later feature-flag changes do not alter the mode of that in-flight run
- debug and Work OS views show the frozen mode that governed the run

### Retention Cleanup

Given expired prompts, provider payloads, generated assets, trace data, or artifact refs:

- cleanup is idempotent and tenant-scoped
- provider-side purge is best-effort where the provider supports deletion; otherwise local scrub and redacted placeholders are used
- purged or archived records remain understandable in debug snapshots through redacted placeholders
- live runs and visible work-item history are not broken by cleanup

### Reviewer Unavailable Guard

Given a media or agency route, when the reviewer persona is unavailable:

- the step is not approved
- the run is not completed
- the system retries, selects an approved backup reviewer, requests human review, or blocks
- UI shows `Reviewer unavailable`

### Media Job Idempotency

Given a video prompt stage is retried with the same prompt and provider:

- the existing non-terminal job is reused
- a duplicate provider job is not created
- the execution trail records the reused job reference

### Provider Failure Guard

Given a requested provider or model is unavailable or not entitled:

- the run does not complete with text-only output
- the run blocks or requests human choice with a visible reason
- the provider/model decision is recorded
- no fake media job is created

### Stage Timeout Guard

Given a stage exceeds its timeout budget:

- the run emits a durable timeout event
- media/review stages do not complete without evidence
- retry, repair, escalation, or block behavior follows policy

### Trace Idempotency Guard

Given a polling or retry operation repeats the same logical transition:

- the same idempotency key is reused
- duplicate trace events do not create duplicate jobs, reviews, or final results
- event sequence remains monotonic for the run

### Output Safety Guard

Given a media job returns a result:

- output safety is checked before final review
- unsafe output cannot be marked complete
- repair, human review, or block state is created when safety fails

### Backward Compatibility Guard

Given an old room has no route decisions or stage records:

- Work OS and Teams show explicit legacy/unknown states
- old `max_rounds_reached` runs are not shown as successful completion
- no media job, review, or final result is fabricated

### Repetition Guard

Given repeated messages that do not change work item status, artifacts, or job state:

- the run blocks with `repeated_low_progress_execution`
- UI shows the blocker and missing evidence

### Review Gate

Given a completed media job, when final review runs:

- the reviewer receives artifact refs and job result
- score and comment are recorded
- failed review creates a repair item
- passed review enables final completion

## Implementation Plan

Implementation must proceed in dependency order. Later slices must not fake data that earlier slices have not made durable yet.

### Phase 1: Route Enforcement

- add a typed route classifier for auto-team objectives
- block article routes for media objectives
- persist route decisions
- show route decisions in Teams and Work OS

### Phase 2: Work Item Continuity

- require work item binding for auto-team turns
- attach plan step keys to turn metadata
- update work item status on each stage
- block floating turns

### Phase 3: Media Job Chain

- connect video prompt skills to `video-creator`
- connect image prompt skills to `image-creator`
- persist media job refs
- poll or subscribe to job completion
- resume the workflow from job result

### Phase 4: Review And Completion

- require reviewer notes for step approval
- add final review from actual artifacts
- block completion without required evidence
- create repair items on failed review

### Phase 5: UI And Operations

- show execution trail in Work OS and My Requests
- show room/run/job details in Teams
- add missing evidence and blocker displays
- add durable trace events for debugging

## Implementation Slice Order

The work must be implemented in this order:

1. Durable records and migrations
2. Route decision and skill-family hard gate
3. Work item and execution stage continuity
4. Media job reference, idempotency, and polling
5. Agency Swarm durable delegation
6. Review, repair, and final result gates
7. Backward compatibility and legacy-room rendering
8. Work OS, My Requests, and Teams UI updates
9. End-to-end regression tests using the Songkran video scenario

Each slice must ship with tests before the next slice depends on it.

## Primary Codebase Touchpoints

The exact implementation must be confirmed during codebase research, but these modules are expected owners:

- route decisions and auto-team continuation: `apps/web/server/services/runEngine.ts`
- skill execution and media/agency chaining: `apps/web/server/services/teamRunSkillExecutor.ts`
- Team prompt assembly and room-language continuity: `apps/web/server/services/promptComposer.ts`
- Team context forwarding via shared context pack contract: `apps/web/server/services/executors/contextBuilder.ts`, `apps/web/server/services/contextEngineAdapter.ts`
- Team room memory persistence: `apps/web/server/services/teamRoomMemoryService.ts`
- Work OS request/case trail: `apps/web/server/services/workOsService.ts`
- Work OS start automation route: `apps/web/server/routers/workOs.ts`
- room language and room records: `apps/web/server/services/roomService.ts`
- team room APIs: `apps/web/server/routers/teamRoom.ts`
- scoped memory retrieval and ACL enforcement: `apps/web/server/services/scopedMemoryService.ts`, `apps/web/server/routers/scopedMemory.ts`
- snapshot/runtime state: `apps/web/server/services/monitoringService.ts`
- media job integration: the same media services used by Media Studio and chat media skills
- team UI: `apps/web/client/src/pages/Teams.tsx`
- room workflow UI: `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- room detail panel: `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- Work OS UI: `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`
- requester tracking UI: `apps/web/client/src/pages/MyRequests.tsx`
- request creation UI: `apps/web/client/src/pages/WorkRequest.tsx`
- shared Work OS bridge: `apps/web/shared/workStatusBridge.ts`
- schema and migrations: `apps/web/drizzle/schema.ts`, `apps/web/drizzle/schema.js`, and new migration files

The deep-plan phase must verify these touchpoints before implementation and update the section plan if code ownership has moved.

## Test Plan

Unit tests:

- media objectives cannot route to article skills
- selected skill family must match route class
- explicit `veo` objective routes to video chain
- auto-team turns without work item/artifact/job are blocked
- repeated low-progress turns are blocked
- completion fails without media job evidence
- final review requires artifact refs
- reviewer unavailable cannot pass media or agency review
- media job idempotency key prevents duplicate provider jobs
- provider payload redaction strips unrelated Work OS context
- DB enum mapping or semantic stage mapping covers all required work item states
- provider unavailable and model entitlement failures block or request human choice
- stage timeout handling does not mark stages complete without evidence
- artifact taxonomy validation rejects unknown required artifact types
- human final approval rejection creates repair or replan work
- trace event idempotency prevents duplicate downstream records
- output safety failure blocks final completion

Integration tests:

- Work Request -> Start automation -> new room -> video route -> media job created
- media job completion resumes run
- failed media job creates repair or blocked state
- Work OS and My Requests show execution trail
- Teams shows current room, run, work item, job, and reviewer state
- Agency Swarm route creates a swarm job and resumes from durable result artifacts
- route mismatch creates a visible blocked state instead of article output
- provider unavailable flow appears in Work OS, My Requests, and Teams
- human final approval reject loop preserves history and improves the next plan
- repeated provider polling does not duplicate media jobs or reviews
- unsafe media output appears as blocked or repair-required in all three UI surfaces

Regression tests:

- existing non-media article requests can still use article skills
- manual/semi-auto rooms still allow guided chat, but the guided reply path is run-backed rather than persist-only
- tenant ownership and requester permissions still apply
- language selection continues into room prompts and media job metadata
- old rooms with missing route records degrade to explicit unknown states without crashing
- old `max_rounds_reached` rooms render as abnormal completion, not success

## Success Definition

This feature is complete when a real user can submit a media request, start automation, watch the job move through plan, execution, media generation, review, and final result, and see the same trail in Work OS, My Requests, and Teams.

It is also complete when a guided/manual Team room can continue the work with a run-backed assistant turn that uses the same critical continuity inputs as Chat: room language, user memory, project continuity, and scoped workspace memory.

The system must no longer produce a room full of plausible progress messages while failing to create the artifacts or jobs required by the original objective.
