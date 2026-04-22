# Implementation Plan - TDD

## Test strategy

Implementation should proceed contract-first, with tests added before each slice is wired into production entry points.

## Slice 1 - Shared contracts and intake brief service

Add tests first for:

- `apps/web/shared/__tests__/workOrchestrator.test.ts`
- `apps/web/server/services/__tests__/workIntakeActorContext.test.ts`
- `apps/web/server/services/__tests__/workIntakeBriefService.test.ts`

Expected failing conditions:

- linked conversation refs are rejected when malformed
- source resolution trusts client-provided tenant, role, permission, or private-vault unlock fields
- compiled brief omits source diagnostics
- required sources do not fail closed
- locked private-vault sources are accepted without explicit unlock state
- secret-bearing source fields are forwarded into planning context
- request edits after preview do not invalidate the preflight revision fingerprint

## Slice 2 - Capability catalog

Add tests first for:

- `apps/web/server/services/__tests__/orchestratorCapabilityCatalogService.test.ts`

Expected failing conditions:

- `workflow` is absent from the planner catalog
- blocked capabilities have no explainable reason
- unsupported surfaces are silently dropped
- `workflow` or `skill_studio` are marked auto-executable without governance approval
- `workflow` or `skill_studio` lack contract-compatibility state
- `skill_studio.create_private_or_pending_review` is blocked for a valid requester-scoped launch
- `skill_studio.auto_apply_proposal` is allowed for non-admin callers

## Slice 3 - Work OS launch preview

Add tests first for:

- `apps/web/server/routers/__tests__/workOs.preflight.test.ts`
- `apps/web/server/routers/__tests__/workOs.preflightApiContracts.test.ts`
- `apps/web/client/src/pages/__tests__/WorkRequest.preflight.test.tsx`
- `apps/web/server/services/__tests__/preflightApprovalLifecycleService.test.ts`
- `apps/web/server/services/__tests__/preflightAccessPolicyService.test.ts`

Expected failing conditions:

- launch preview does not show compiled brief
- source linkage from chat is not persisted
- plan review is bypassed before `createAutomationRun`
- approval snapshots are missing or non-deterministic
- missing team resolution still allows launch to proceed
- requester cannot access a redacted preflight preview for their own request
- non-admin preview callers receive privileged diagnostics that should be redacted
- request title/objective/source edits do not invalidate the preview before launch
- invalid `PreflightApprovalBundle` lifecycle transitions are accepted
- repeated approve/launch requests with conflicting idempotency input create duplicate state
- concurrent launch attempts create duplicate automation runs or Team rooms

## Slice 4 - Team kickoff and execution plan routing

Add tests first for:

- `apps/web/server/services/__tests__/teamExecutionLaunchService.test.ts`
- `apps/web/server/services/__tests__/teamRunSkillExecutor.planRouting.test.ts`
- `apps/web/server/services/__tests__/runEngine.planSeed.test.ts`
- `apps/web/server/services/__tests__/runtimeDispatchPolicy.test.ts`

Expected failing conditions:

- kickoff ignores the approved execution plan
- step routing still prefers heuristics over explicit plan steps
- runtime requests are missing governed-context metadata
- runtime dispatch ignores enforced budget envelope or surface authority
- approval snapshot drift does not stop launch or dispatch
- runtime dispatch attempts a `workflow` or `skill_studio` surface before Work OS contracts support it
- runtime dispatch retries side-effecting media/workflow/agency work without idempotency verification
- timeouts, cancellations, and retry-cap failures do not move steps to an auditable dead-letter state

## Slice 5 - Learning loop

Add tests first for:

- `apps/web/server/services/__tests__/orchestratorLearningService.test.ts`
- `apps/web/server/services/__tests__/workpackLearningBridge.test.ts`
- `apps/web/server/services/__tests__/learningProposalLifecycle.test.ts`

Expected failing conditions:

- successful Team runs do not produce workpack/skill-improvement candidates
- repeated exceptions do not create explainable learning proposals
- rejected, expired, or superseded proposals automatically re-trigger follow-up work
- applied proposals do not link to resulting workpack, workflow change, skill version, or maintenance task

## Slice 6 - Security and governance regressions

Add tests first for:

- `apps/web/server/services/__tests__/workOrchestratorSecurityPolicy.test.ts`
- `apps/web/server/services/__tests__/approvalSourceSnapshotService.test.ts`
- `apps/web/server/services/__tests__/teamResolutionPolicyService.test.ts`
- `apps/web/server/services/__tests__/preflightRevisionService.test.ts`
- `apps/web/server/services/__tests__/runtimeDispatchSecurityPolicy.test.ts`

Expected failing conditions:

- unauthorized `workflow` execution is not blocked
- unauthorized `skill_studio` execution is not blocked
- private-vault state is lost between review and launch
- team resolution falls through to silent null kickoff
- governance downgrade events are not recorded
- team resolution precedence is non-deterministic or uses unrelated-team heuristic search
- stale preview approval is accepted after request mutation
- contract-compatibility blocks are not recorded separately from auth/flag failures
- side-effecting dead-letter recovery is allowed without manual approval or a new approved plan revision

## Slice 7 - Observability, UI accessibility, and rollout controls

Add tests first for:

- `apps/web/server/services/__tests__/workOrchestratorTelemetryTaxonomy.test.ts`
- `apps/web/client/src/pages/__tests__/WorkRequest.preflightAccessibility.test.tsx`

Expected failing conditions:

- Feature 105 telemetry events omit event version, redaction mode, actor class, primary reason code, or required correlation ids when available
- requester-safe telemetry includes raw source excerpts, connector credentials, or admin-only permission internals
- disabled launch controls do not expose a screen-reader-accessible reason
- preflight review cannot be completed with keyboard navigation
- user-facing reason summaries are hard-coded backend prose instead of translation-key mapped labels
- admin diagnostics are visible in requester-safe progressive-disclosure views

## Slice 8 - Broad regression coverage

Run or extend focused regressions for:

- `WorkRequest`
- `MyRequests`
- `workOs` router
- `runEngine`
- `teamRunSkillExecutor`
- `contextPackBuilder`
- Team ledger/read model UI
- privileged-surface launch gating
- approval snapshot drift handling
- budget envelope enforcement paths
- preview access redaction
- contract-migration compatibility paths
- observability taxonomy and UI accessibility paths

## Environment and fixtures

- Prefer Vitest for `apps/web` contract, router, service, and UI tests.
- Reuse existing Team/Work OS fixtures where possible.
- Add minimal fixture builders for linked conversations, library packs, workpack runs, and readiness/replay summaries.

## Manual verification checklist

- Create a request from plain form input and confirm the legacy launch flow still works.
- Create a request from chat context and confirm the compiled brief includes conversation sources.
- Review a capability plan and confirm launch remains manual until approval.
- Start a Team run and confirm the selected plan surfaces appear in kickoff telemetry and runtime snapshots.
- Force a stale preview, budget block, dead-letter step, and missing team state; confirm requester-safe UI explains next action without admin internals.
