# Section 04: Media Job Lifecycle

## Goal

Make media routes call real media capabilities and persist provider job/result evidence. A video or image request must never finish as text-only chat. It must create prompt/storyboard artifacts, submit a provider job, poll or capture result state, review the result, and expose final evidence.

## Dependencies

- Section 01 schema/contracts
- Section 02 route policy/family gate
- Section 03 execution service/stage engine

## Files to Create or Modify

- Create `apps/web/server/services/autoTeamMediaExecutionService.ts`
- Create `apps/web/server/services/autoTeamProviderPolicy.ts`
- Create `apps/web/server/services/autoTeamBudgetService.ts`
- Create `apps/web/server/services/autoTeamSafetyService.ts`
- Create `apps/web/server/services/autoTeamArtifactRefService.ts`
- Modify `apps/web/server/services/teamRunSkillExecutor.ts`
- Modify `apps/web/server/services/executors/imageExecutor.ts` if image execution needs async job behavior or terminal job-ref adaptation
- Modify `apps/web/server/services/mediaGenerationService.ts` only if a small polling/status adapter is missing
- Modify `apps/web/server/services/runEngine.ts` to dispatch media stages through this service
- Create `apps/web/server/services/__tests__/autoTeamMediaExecutionService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamProviderPolicy.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamBudgetService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamSafetyService.test.ts`
- Create `apps/web/server/services/__tests__/autoTeamArtifactRefService.test.ts`
- Create `apps/web/server/services/__tests__/mediaRoutingIntegration.autoTeam.test.ts`
- Create `apps/web/server/services/__tests__/mediaJobIdempotency.autoTeam.test.ts`

## TDD First

Write failing tests for:

- video route creates required media stage sequence
- media submit creates one job ref per stable idempotency key
- retry of media submit reuses existing unfinished job ref
- poll updates existing job ref and stage
- provider success attaches result artifact refs
- provider failure blocks/fails stage with sanitized user message
- provider entitlement/unavailable errors do not produce fake completion
- image route has consistent job-ref behavior even if underlying image executor is synchronous
- client-provided provider tokens are ignored or rejected
- unsafe media reference URLs are rejected
- explicit `veo 3.1` preference is preserved or visibly blocked with provider/model reason
- provider substitution records requested and selected provider/model
- budget or quota preflight blocks provider call before paid execution
- media submit retry reuses billing idempotency key and does not double-charge
- prompt-injection content from uploaded/archived/external context is scrubbed
- provider payload excludes unrelated Work OS context, internal notes, room history, secrets, and private URLs
- output safety failure blocks final completion and creates repair/human-review/block state
- canonical artifact refs are created and tenant-scoped for prompt, storyboard, media result, and final result

## Service Design

Create `autoTeamMediaExecutionService.ts` with functions:

- `executeMediaStage(input)`
- `executeResearchStage(input)`
- `executeStoryboardStage(input)`
- `executePromptStage(input)`
- `submitMediaJob(input)`
- `pollMediaJob(input)`
- `attachMediaResult(input)`
- `buildMediaSubmitIdempotencyKey(input)`
- `sanitizeProviderError(error)`
- `resolveProviderDecision(input)`
- `assertBudgetAllowsMediaJob(input)`
- `buildCanonicalArtifactRef(input)`
- `sanitizeProviderPayload(input)`
- `validateMediaOutputSafety(input)`

Inputs must include:

- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `stageId`
- `workItemId`
- `routeDecision`
- `language`
- `objective`
- `provider`
- `model`
- `promptArtifactRef`
- `attempt`

## Video Chain

For `media.video`, the service must produce these durable steps:

1. Research/source summary artifact
2. Storyboard or scene plan artifact
3. Video prompt artifact
4. Media job ref for provider submit
5. Poll stage updates until terminal provider state
6. Result artifact refs attached to job/stage/work item

The media submit stage must call existing media generation capability:

- Prefer `executeUnified()` with `capabilitiesAllowed: ["media.video"]` if it already wraps token injection, audit logging, and provider executor selection.
- Otherwise call `mediaGenerationService.generateVideoAsync()` through a small adapter that preserves the same security and audit behavior.

Do not let a video prompt skill become the final output. Prompt artifacts are intermediate evidence only.

## Provider and Model Decision

Use `autoTeamProviderPolicy.ts` before media submit.

Provider decision must capture:

- explicit requested provider/model from user text, such as `veo 3.1`
- room/team defaults
- Media Studio defaults
- tenant policy and entitlement
- provider availability
- budget/quota result
- selected provider/model
- fallback/substitution reason when selected differs from requested

Allowed failure outcomes:

- `provider_unavailable`
- `model_not_entitled`
- `budget_exceeded`
- `quota_exceeded`
- `human_provider_choice_required`
- `provider_substitution_recorded`

Disallowed:

- silently downgrade a media request to text-only work
- silently drop an explicit provider/model preference
- claim provider job creation without provider job id or durable local job id

## Image Chain

For `media.image`, the service must produce:

1. Image prompt artifact
2. Media job ref or terminal result reference
3. Review evidence
4. Final result evidence

Current code appears to have `generateImageAsync()` and a synchronous image executor path. Choose one of these safe approaches:

- Prefer async image execution through `generateImageAsync()` when provider support is available.
- If a provider returns immediately, create a terminal `auto_team_media_job_refs` row with status `succeeded` and attach result artifact refs.

Do not leave image results as untracked executor payloads.

## Artifact Handling

Use existing artifact/reference mechanisms where possible, but expose them through canonical `auto_team_artifact_refs`:

- work item `artifactRefsJson`
- room message `artifactRefsJson`
- monitoring snapshot artifact refs
- content or conversation artifact services if available and appropriate

If there is no generic server artifact write helper for text artifacts, create a minimal internal helper that still writes canonical artifact refs. Do not use arbitrary JSON refs as final completion evidence.

Minimum artifact refs:

- research summary: `artifactType: "research_summary"`
- storyboard: `artifactType: "storyboard"`
- media prompt: `artifactType: "media_prompt"`
- media result: `artifactType: "media_result"`

Canonical artifact refs must include:

- `tenantId`
- `runId`
- `stageId`
- `workItemId`
- `artifactType`
- `artifactRole`
- `storageRef` or `externalRef`
- `contentHash` when available
- `visibility`
- `retentionPolicyJson`
- `safetyStatus`

Do not store signed URLs directly. Resolve access through existing tenant/user permission checks.

## Idempotency

Build media submit idempotency key from:

- `tenantId`
- `runId`
- `stageId`
- `mediaType`
- `provider`
- `model`
- prompt hash
- attempt

Before provider submit:

1. Look up existing job ref by tenant and idempotency key.
2. If existing job is not terminal, reuse it and do not submit.
3. If existing job succeeded, attach it and continue.
4. If existing job failed and the attempt is unchanged, do not resubmit without explicit retry.

Polling:

- must update the same job ref
- must not create new job refs
- must use sanitized user-visible errors

## Budget and Billing Idempotency

Before paid provider submission:

1. Run budget/quota preflight through `autoTeamBudgetService`.
2. Create or reuse a budget reservation with the same idempotency key as the logical media job.
3. Do not call the provider if budget/quota fails.
4. On retry, reuse the reservation and prevent double charge.
5. On provider failure/cancel, release or mark the reservation according to billing policy.
6. On provider success, finalize charge once.

Budget decisions must appear in trace events and debug snapshots.

## Provider Status Mapping

Normalize provider status into:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `expired`
- `unknown`

Map these to stage statuses:

- queued/running -> `waiting_provider`
- succeeded -> `completed`
- failed/expired -> `failed` or `blocked`
- cancelled -> `cancelled`
- unknown -> keep waiting with timeout, then block

## Safety and Context Minimization

Before prompt/provider execution:

- scrub prompt-injection instructions from external, uploaded, or archived context
- include only objective, approved prompt/storyboard, selected provider/model, and required media parameters
- exclude unrelated Work OS context, tenant secrets, internal review notes, room history, private URLs, and auth tokens

After provider output:

- evaluate provider moderation result
- check unsafe visual/textual content
- check copyright, brand, and likeness concerns
- check language/locale mismatch
- create repair, human review, or blocked state on failure
- never finalize unsafe output

## Security Requirements

- Server injects provider auth tokens. Client input cannot provide tokens.
- Validate user-provided media/reference URLs with existing SSRF validation before provider calls.
- Do not store raw provider secrets in job metadata.
- Store provider errors sanitized for user display; detailed diagnostics only in server logs.
- Enforce tenant on job ref lookups.
- Prevent duplicate paid submissions.
- Enforce provider payload minimization.
- Apply retention controls to prompts, provider payload metadata, and generated assets.

## Acceptance Criteria

- Video route reaches media provider submit and job ref creation.
- Image route produces job/result refs consistently.
- Provider polling updates run snapshot and UI-ready projections.
- Prompt-only media runs cannot complete.
- Duplicate submit attempts are idempotent.
- Unsafe URLs and entitlement/provider failures become visible blocked states.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/autoTeamMediaExecutionService.test.ts server/services/__tests__/mediaRoutingIntegration.autoTeam.test.ts server/services/__tests__/mediaJobIdempotency.autoTeam.test.ts
npm --prefix apps/web run check
```
