# Feature 157 — Production Assurance, QC Recovery, and Cross-Stage Convergence

Status: implementation plan ready for self-review
Source specification: `spec.md` v1.3.0
Planning inputs: `claude-spec.md`, `claude-research.md`, `claude-interview.md`

## 1. Purpose and implementation strategy

SmartSpecPro currently has the pieces of a reliable Vertical Drama workflow,
but the pieces do not yet share one durable admission/result contract. The
observed failure is a concrete example: a Draft QC attempt can retain a valid
baseline while the API still projects `failed`, and the repair mutation then
rejects the request because it cannot prove a completed current result.

Implement this feature as an additive convergence layer. The layer normalizes
the current domain inputs, calls the existing Agent Runtime only for bounded
structured proposals/evaluation, runs deterministic validators before and after
the proposal, persists attempt/result lineage durably, and lets the existing
domain ledger perform final candidate activation. It must not introduce a
second Agent SDK bridge, a parallel credit ledger, a new provider task owner,
or a new creator navigation flow.

The implementation is organized into ten dependency-ordered sections. Each
section has a narrow ownership boundary, focused tests, a flag/rollback story,
and a commit boundary. The final release is not declared production-ready until
local tests, replay fixtures, browser evidence, migration rehearsal, worker
recovery, provider/canary proof, and operational runbook evidence are all
recorded separately.

The web test command is `npm --workspace apps/web test -- <focused files>`;
browser evidence uses the existing Playwright scripts/project; Python focused
tests use `cd python-backend && pytest <focused tests>`. Broad repository
typecheck is a separate diagnostic because it may be baseline-noisy/OOM; the
plan must report focused validation and baseline-wide validation separately.

## 2. Current architecture and non-negotiable boundaries

### 2.1 Existing authorities to preserve

| Concern | Existing authority | Plan treatment |
| --- | --- | --- |
| Agent request/response, runtime modes, traces, checkpoints | `apps/web/shared/agentRuntime`, `apps/web/server/services/agentRuntime`, Python internal Agent Runtime | extend schemas/adapters additively; reuse `AgentRuntimeClient`, request builder, skill orchestrator, final gate, replay, redaction |
| Profile/source/visual canon | `apps/web/shared/verticalDramaSeries/*`, source pack and visual snapshot services | compose `ProductionContextSnapshot` from these contracts; do not let LLM output replace IDs/statuses |
| Draft candidate/active version | `verticalDramaDraftLedger`, story/prompt/domain ledgers | candidate-first persistence and CAS; never write Agent output directly to active state |
| Draft QC loop and repair | `verticalDramaDraftQualityQc.ts`, `verticalDramaDraftQualityQcJobs.ts`, `verticalDramaSeries` router | repair the projection/recovery contract while preserving existing fields and UI actions |
| Credits | existing `creditService` and media credit owner | one billing owner per adapter; no Agent-side deduction when Node owns billing |
| Provider/media submission | existing media generation/task services | `provider_ready` is a precondition; one-time authorization and reconciliation fence duplicate submission |
| Browser UX | `CreateSeriesWizard`, `VerticalDramaDraftQualityQcPanel`, existing episode/storyboard screens | additive projection and error metadata; preserve routes, step IDs, save/edit/preview/confirm |

### 2.2 Runtime topology

```text
Client/router mutation
  -> domain adapter admission (tenant + source + context + idempotency)
  -> deterministic preflight
  -> existing Agent Runtime (legacy/shadow/active, bounded)
  -> structured transform and deterministic post-validation
  -> durable result/event + credit/provider reconciliation
  -> domain final gate and active-version CAS
  -> additive UI projection / next action
```

The model call and provider call must never run while holding a long database
transaction. Database transactions are reserved for short admission,
reservation, event, and CAS operations. Every network call receives an
application-owned `providerCallId`; every attempt receives a durable `attemptId`
and `idempotencyKey` scoped by tenant, surface, task kind, source fingerprint,
and contract/policy version.

### 2.3 Explicit task mapping

The Vertical Drama task taxonomy is not the wire enum. Add a shared mapping
module that maps each domain task to an existing runtime capability and records
both names in the assurance attempt. The initial mapping is:

| Domain task | Existing runtime kind | Required output authority |
| --- | --- | --- |
| premise expansion, story architecture, full story, season QC | `structured_generation` | Feature 152/153 story contracts plus deterministic domain gates |
| draft QC, draft repair, video prompt QC, B-roll assembly QC | `skill_execution` | Node QC/domain validators and final gate |
| start-frame prompt, reference/image prompt | `image_prompt` | existing prompt composer and image contract |

Use a new shared runtime enum only when the capability manifest cannot represent
the task, and then version Node/Python schemas together with compatibility tests.
Do not pass arbitrary Vertical Drama strings through `OrchestraTaskKindSchema`.

### 2.4 Feature flags and compatibility defaults

Use the existing flag registry conventions and add/confirm these independent
controls: `verticalDramaAssuranceShadow`,
`verticalDramaDraftQcOrchestraActive`, `verticalDramaPromptQcOrchestraActive`,
`verticalDramaStoryAssuranceActive`, and
`verticalDramaAssuranceKillSwitch`. The kill switch selects the safe existing
deterministic/legacy adapter, preserves accepted durable data, and does not
clear queues, refund without ledger proof, or resubmit uncertain provider work.
All new request fields are optional for legacy clients; all new durable fields
are nullable/versioned until the consuming boundary is enabled.

## 3. Section 01 — Assurance contracts, context snapshot, and runtime mapping

### Goal

Create the shared types and pure normalization/admission seams that every later
adapter consumes. This section must be safe to deploy with all feature flags off.

### Files and symbols

- `apps/web/shared/verticalDramaSeries/verticalDramaAssuranceContext.ts` (new
  additive module) for the versioned `ProductionContextSnapshot`, source
  policy, readiness, role, and fingerprint types. Keep the existing generic
  `StoryboardProductionContext` used by Media Studio/Storyboard Review as a
  compatibility input; do not conflate or rename the two contexts.
- `apps/web/shared/verticalDramaSeries/assurance.ts` (new additive module) for
  Vertical Drama task taxonomy, disposition, readiness, assurance mode,
  UI projection, stable error codes, and logical request/result schemas.
- `apps/web/shared/agentRuntime/orchestraSchemas.ts` and `types.ts` only when
  the existing assurance envelope needs an additive field or versioned mapping.
- `apps/web/server/services/verticalDramaProductionContext.ts` (new adapter)
  for server-owned snapshot capture, canonical hashing, stage readiness, and
  stale/invalidation decisions.
- `apps/web/server/services/verticalDramaAssuranceAdapter.ts` (new shared
  manager) for domain-task to runtime-task mapping, admission metadata,
  fallback mode, and final result normalization.
- Existing shared profile/source/visual modules and snapshot services as inputs.

### Contract requirements

`ProductionContextSnapshot` must contain stable `snapshotId`, numeric revision,
overall fingerprint, series/profile/version, source policy, optional/null
source-pack decision, visual canon fingerprint, claim/coverage fingerprints,
slot/asset/segment IDs, semantic roles, evidence/rights/disclosure statuses,
and readiness. Canonical hashing includes explicit null source-pack decisions
and bindings; it never hashes only generated prose.

The shared assurance request must include tenant/user, domain task kind, mapped
runtime kind, source reference, context reference, input references, contract
and output versions, rule/policy/model hashes, compatibility mode, required
readiness, idempotency key, bounded budget, and side-effect policy. The shared
result must preserve execution/attempt IDs, state, findings, trace/runtime
metadata, fallback mode, and next action without making raw model text the
contract.

### Tests first

- Snapshot canonical hash is stable for key-order changes and changes for any
  profile/source/claim/canon/coverage/binding change.
- Fiction with optional source produces an explicit null/empty-source decision;
  required documentary/review/news/hybrid sources require stage-appropriate
  readiness.
- Every registered profile maps to a policy and profile registry drift fails.
- Every domain task maps to a valid shared runtime task kind/capability.
- Tenant mismatch, unsupported role/status, stale snapshot, malformed request,
  and unsupported runtime version fail with stable codes.
- Legacy requests are wrapped without changing their current required fields.

### Acceptance and rollout

Deploy schemas and pure helpers first, add no new hard gate, and leave all
runtime flags disabled. Verify existing tests plus the new contract tests before
starting the persistence section.

## 4. Section 02 — Durable attempts, state machine, events, and reconciliation

### Goal

Make run state durable beyond Redis TTL and make every transition/recovery
replayable and fenced. Reuse Feature 151/152 durable owners if present; add the
smallest additive assurance records only if the inventory proves they cannot
represent the required relation.

### Files and symbols

- Existing schema/migration directory, beginning with the existing Feature 152
  assurance migration (`apps/web/drizzle/0238_vertical_drama_story_generation_assurance.sql`)
  and its Drizzle schema owner; add nullable/versioned attempt/event/lineage
  fields there when it can represent the relation, otherwise add the smallest
  additive assurance records with a documented ownership decision.
- `apps/web/server/services/verticalDramaAssuranceRepository.ts` (new adapter
  over the selected durable owner) for admission, event append, projection,
  lease/fence, and CAS operations.
- `apps/web/server/services/agentRuntime/orchestraEventReplay.ts`,
  `checkpointService.ts`, and `orchestraFinalGate.ts` for reuse/compatibility.
- `verticalDramaDraftLedger.ts` for accepted/recovered candidate references and
  expected-active-version fencing.
- `verticalDramaDraftQualityQcJobs.ts` reconciliation hooks for Redis/worker
  expiry and retry classification.

### Data model and transitions

Persist one immutable attempt row/record with tenant/entity scope, domain task,
mapped runtime task, source/context fingerprints, contract/policy hashes,
idempotency key, runtime mode, lease/fence token, current state, disposition,
readiness, next action, error code, and timestamps. Persist ordered events with
monotonic sequence and redacted trace reference. Candidate artifacts remain in
domain ledgers; assurance storage stores references and decisions rather than a
second content authority.

Admission is a short transaction with a unique key on tenant/surface/task/source
fingerprint/idempotency key. A duplicate returns the existing attempt. A worker
must renew a lease/fence; a stale worker cannot append success or activate a
candidate. Final CAS compares expected active version and candidate version
against the domain ledger. Reconciliation is repeat-safe.

Public state mapping must distinguish queued/running, succeeded/verified,
recovered/recovered-needs-repair, awaiting-action, retryable-failed, stale,
reconciliation-required, fatal-failed, and cancelled. Legacy `failed` records
are projected as recovered only when exact evidence proves a usable current
baseline; never fabricate a score, owner, or fingerprint.

### Tests first

- Duplicate admission returns one attempt and one event stream.
- Concurrent admission/repair/save demonstrates no duplicate accepted version.
- Lease loss fences a worker before final gate and activation.
- Redis expiry recovers durable state without losing a completed baseline.
- Event replay rebuilds the same UI projection after refresh.
- CAS rejects a newer user edit and classifies the result as stale/retryable.
- Unknown provider/credit outcome enters reconciliation and is not resubmitted.
- Migration reads legacy and new records through the same projection.

### Acceptance and rollout

Run migration tests and repository-level tests with flags off. Do not make a
new field mandatory for old records until dual-read/dual-write compatibility
is proven.

## 5. Section 03 — Credit, retry, provider authorization, and final-gate policy

### Goal

Prevent double charging, hidden shadow costs, unsafe fallback calls, and paid
provider replay while keeping deterministic no-op checks free.

### Files and symbols

- Existing `creditService` reservation/draw/refund APIs and credit transaction
  metadata/ledger schemas.
- `verticalDramaPromptQc.ts`, Draft QC credit dependencies, and media provider
  submission services.
- `apps/web/server/services/verticalDramaAssuranceBilling.ts` (new thin
  policy/ledger adapter only if existing owner lacks shared call metadata).
- Existing media authorization/idempotency utilities and
  `orchestraFinalGate.ts`.

### Policy

Choose and record one billing owner for each adapter during implementation.
Record logical attempt ID, provider-call ID, reservation ID, actual/estimated
credits, runtime mode, provider/model, retry ordinal, and reconciliation state.
Known usage from malformed/timeout responses is charged exactly once; unknown
usage remains pending reconciliation. Shadow calls are platform-owned or
fixture-backed and never deduct user credits or create domain side effects.
Fallback is allowed only within the attempt budget and records both calls.

Provider submission receives a one-time authorization token bound to tenant,
contract/output hash, provider profile, and idempotency key. Cancellation after
possible acceptance fences activation and enters reconciliation; it cannot
automatically refund or submit again.

### Tests first

- No-op deterministic checks create no reservation.
- Reservation/draw/refund is exact once under duplicate delivery.
- Schema-invalid, timeout, fallback, and shadow calls have correct billing
  ownership and call IDs.
- Failure after provider request/acceptance/credit draw never duplicates the
  provider task or user deduction.
- Final gate rejects wrong readiness, missing authorization, stale fingerprint,
  and unresolved provider uncertainty.

### Acceptance and rollout

Run fault injection with fake credit/provider owners before any active paid
flag. Keep existing provider selection and media task owners unchanged.

## 6. Section 04 — Draft QC recovery and repair integration

### Goal

Fix the observed repair precondition mismatch and make Draft QC recovery
explicit, current, durable, and UX-safe.

### Files and symbols

- `verticalDramaDraftQualityQc.ts`: `runVerticalDramaDraftQualityQc`,
  `runVerticalDramaDraftQualityQcRepair`,
  `recoverDraftQualityQcRevisionOutput`, immutable-field enforcement, and
  candidate history.
- `verticalDramaDraftQualityQcJobs.ts`: public record/projection,
  `recoverVerticalDramaDraftQualityQcResultFromFailure`, status/reconciliation,
  enqueue, cancel, and worker execution.
- `verticalDramaDraftLedger.ts`: durable QC snapshots, version references,
  candidate/active CAS, and ledger reads.
- `apps/web/server/routers/verticalDramaSeries.ts`: existing estimate/start/
  repair/status/cancel procedures and draft candidate confirmation path.
- `VerticalDramaDraftQualityQcPanel.tsx` and `CreateSeriesWizard.tsx`: additive
  projection fields and error/next-action mapping.

### Behavior

Persist a complete baseline before any improvement call. If a later revision is
invalid or fails, retain the exact baseline and expose `recovered` with a
current result reference, source version/fingerprint, report, history, and
repair eligibility. Repair admission must resolve the current durable result,
not just the Redis record or a client boolean. It accepts exact result/source/
contract/policy metadata, creates a new attempt, re-evaluates the repair output,
and activates only after final gate/CAS.

Preserve existing `failed`, `recoveredFromFailure`, history, candidate
fingerprint, max-round, cancel, and confirmation fields during migration. Add
the new projection fields and stable codes. A true missing/stale result still
returns a typed precondition error with `run_qc`, `refresh`, or `retry` action;
the previously observed error must not occur for a proven current recovered
result.

### Tests first

- Regression test for valid baseline + immutable `storyContract` mutation.
- Current recovered result enables repair and does not return the 409 error.
- Missing, stale, wrong-fingerprint, wrong-contract, and already-running repair
  requests map to distinct codes/actions.
- Invalid repair candidate preserves baseline and remains inspectable.
- Newer draft edit races with repair and wins via CAS without data loss.
- Refresh/reconnect renders the same projection while the job runs.
- `maxImprovementRounds=0` is evaluate-only; normal policy is bounded and
  configured rather than silently zero.

### Acceptance and rollout

Enable only Draft QC canary after the old projection and new projection compare
successfully in shadow. The old edit/save/preview path must remain usable if
the new adapter is disabled.

## 7. Section 05 — Profile/source/visual context and cross-stage admission

### Goal

Admit the correct profile/source/evidence/media context once and propagate its
fingerprint through every downstream artifact.

### Files and symbols

- Profile registry and policy modules: `seriesProfile.ts`, `formatProfiles.ts`,
  `sourcePack.ts`, `visualSource.ts`, `visualGrounding.ts`, `newsReport.ts`,
  `qualityPolicy.ts`.
- Services: `verticalDramaSourcePackService.ts`,
  `verticalDramaVisualSourceCore.ts`,
  `verticalDramaVisualSourceSnapshotService.ts`, and `verticalDramaBrollService.ts`.
- Start-frame/video/prompt expansion entry points named in the source spec.

### Behavior

Capture the production context after profile/source authoring reaches the stage
needed by the requested operation. Fiction may explicitly use null/optional
source; non-fiction/review/news/hybrid must distinguish draft-ready from
production-ready. Source assets are not evidence merely because uploaded.
Preserve exact role/status/rights/disclosure/segment IDs and managed storage
references. A changed profile/source/claim/canon/coverage fingerprint marks only
affected downstream artifacts stale and blocks silent mixing.

Create an adapter helper that every listed entry point calls before model,
provider, activation, or export work. It must accept legacy clients through a
compatibility wrapper but reject direct bypass in contract tests.

### Tests first

- All thirteen profiles produce valid policy/context snapshots.
- Fiction optional-source path remains authorable; required profiles enforce
  appropriate stage readiness.
- Evidence/illustrative/rights/disclosure/claim freshness checks preserve
  server-owned statuses.
- Snapshot drift invalidates only affected artifacts and prevents mixed
  fingerprints.
- B-roll still/footage and scene/reference bindings cannot be interchanged.
- Managed storage missing/unplayable and invalid segment timeline are actionable
  without deleting the source.

### Acceptance and rollout

Run shadow admission through profile/source flows before enforcing production
readiness. Keep attachment editing and preview unblocked by advisory findings.

## 8. Section 06 — Agent Runtime orchestration and graceful degradation

### Goal

Connect the adapters to the existing Agent Runtime safely, using structured
proposals and guardrails without making Agent availability a prerequisite for
editing or deterministic checks.

### Files and symbols

- `apps/web/server/services/agentRuntime/requestBuilder.ts`, `client.ts`,
  `runtimeSelection.ts`, `skillRuntimeOrchestrator.ts`, `orchestraFinalGate.ts`,
  `checkpointService.ts`, `orchestraEventReplay.ts`, `redaction.ts`.
- `apps/web/shared/agentRuntime/orchestraSchemas.ts`, `types.ts`, and tests.
- Python `openai_agents_contracts.py`, `openai_agents_orchestra.py`,
  `openai_agents_adapter.py`, `openai_agents_trace.py`, skill runtime, and
  internal API tests.
- Vertical Drama adapter call sites for story, Draft QC, and prompt/media
  proposal/repair paths.

### Behavior

Use structured `output_type`/schema hints where supported and treat SDK output
guardrails as one validation layer. Keep deterministic preflight and Node final
gate authoritative because SDK guardrail coverage differs across function
tools, hosted tools, and handoffs. Preserve trace redaction and add context,
attempt, mapping, fallback, and cost metadata without logging private story,
media URLs, signed URLs, or untrusted evidence.

The Python response field `assurance.state = provider_ready` is only evidence
that the bounded runtime adapter completed its own stage. Node must still check
the domain request's `requiredMode`, profile/source readiness, output contract,
rights/disclosure, credit/provider authorization, and current context before
allowing activation or paid submission. Runtime completion is never equivalent
to production readiness.

Implement an explicit adapter fallback matrix:

- legacy: execute the existing helper and validate normally;
- shadow: run legacy once, run bounded comparison with platform-owned cost/no
  side effect, and never use shadow as provider evidence;
- active: use Agent structured proposal, then deterministic post-validation;
- active runtime/manifest failure: use one allowed deterministic fallback for
  advisory/edit stages; at paid/export boundaries return retryable/awaiting
  action unless an independent deterministic path completed all gates.

Bound recursion, turns, tools, wall clock, output tokens, concurrency, and
repair attempts. Treat retrieved text/media/OCR/transcripts as untrusted data;
only server-issued IDs can become citations/assets/claims and Agents cannot
fetch arbitrary URLs or call provider/storage tools directly.

### Tests first

- Request builder accepts mapped assurance envelope and rejects unsupported
  task/version/tenant/side-effect combinations.
- Node/Python canonical hash parity, response attempt/contract echo, and
  provider-ready mapping pass.
- Legacy/shadow/active/manifest-missing/timeout paths produce the expected
  fallback mode and never bypass deterministic validation.
- Guardrail rejection, tool denial, recursion ceiling, checkpoint resume,
  redaction, trace metadata, and provider usage absence are covered.

### Acceptance and rollout

Ship runtime compatibility and shadow instrumentation before active Agent flags.
Use a kill switch that disables only the new adapter path and leaves the old
deterministic path and accepted ledger data intact.

## 9. Section 07 — Story, prompt, video, B-roll, and season adapters

### Goal

Extend the same context/assurance chain to all requested content stages while
preserving the current feature owners and prompt dialects.

### Files and symbols

- Story: `verticalDramaStoryGenerationContracts.ts`, runtime/repository,
  validation/repair/telemetry, prompt expansion, script/story bible services,
  and Feature 152/153 owners.
- Image/start frame: `verticalDramaStartFrameGeneration.ts`, start-frame
  contracts and existing scene-anchor/reference tests.
- Video: `verticalDramaVideoMotionPromptGeneration.ts`, video formatter and
  shot-video jobs.
- B-roll: `verticalDramaBrollService.ts` and assembly/readiness owners.
- Prompt QC: `verticalDramaPromptQc.ts` and existing prompt tests.

### Behavior

Every stage receives a typed input contract with context fingerprint and
predecessor artifact references. The Agent can propose structured additions or
allowlisted compression/repair; existing prompt composers, selected model IDs,
provider capability rules, dialogue/speaker/position logic, and media binding
remain authoritative. Re-run deterministic validators after proposal/repair.

Start frame requires explicit scene anchor and approved lock. Reference/image
prompt requires explicit reference role and cannot overwrite scene anchor.
Video prompt references exact start-frame/reference manifest and preserves
speaker, cast, position, dialogue, action, timing, and provider limits. B-roll
uses immutable approved segments with rights/disclosure, trim, duration,
audio/crop/safe-zone and storage checks. Lossy prompt truncation cannot be
marked provider-ready.

Story/season adapters remain flag-controlled until context and contract parity
tests pass. New source/profile/claim changes invalidate affected downstream
artifacts and force re-QC rather than mixing old/new context.

### Tests first

- Context and predecessor fingerprint are required at every enabled entry point.
- Full story produces shot contracts sufficient for downstream prompt/B-roll
  derivation without ad hoc reinterpretation.
- Start-frame/reference role conflict, stale visual canon, provider capability
  mismatch, speaker/position/cast drift, prompt over-limit, and B-roll trim/
  rights/storage failures are tested.
- Cross-profile matrix covers all thirteen profiles and each stage output hash,
  blocking gate, repair route, and UI next action.
- Season/story partial/incomplete candidates never enter active production.

### Acceptance and rollout

Enable adapters one task family at a time behind independent flags, but require
one context fingerprint through the whole enabled chain. Do not enable video
prompt alone against an unverified/stale visual input.

## 10. Section 08 — API projection, UI continuity, and accessibility

### Goal

Expose durable state and actionable recovery without disrupting the current
creator experience.

### Files and surfaces

- Router procedures in `apps/web/server/routers/verticalDramaSeries.ts`:
  existing estimate/start/repair/status/cancel/history/candidate procedures,
  extended additively with projection/error metadata.
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx`.
- Existing story/episode/storyboard prompt and job status surfaces identified
  by targeted call-flow research; do not create duplicate status stores.
- Locale resources for Thai/English copy where existing i18n conventions require.

### UI/UX Contract

#### Target User / JTBD

- Role: series creator/editor using the existing Vertical Drama wizard.
- Goal: continue editing and recover QC/media work when AI, worker, provider,
  or network behavior is imperfect.
- Entry point: existing series planning/wizard and draft QC panel.
- Success outcome: the user sees a trustworthy state and next action, never a
  dead repair button, raw exception, or workspace lock.

#### Existing Pattern Reference

- Search used: targeted `rg` over `CreateSeriesWizard.tsx`,
  `VerticalDramaDraftQualityQcPanel.tsx`, existing episode/job status tests,
  request-resilience and reconnect UI tests. SocratiCode was unavailable.
- Found patterns: current QC progress/history/candidate selection/repair/cancel
  props and existing async job polling/reconnect patterns.
- Decision: reuse. Add projection fields and typed copy to the existing panel,
  wizard, query/mutation invalidation, and job status patterns.
- Divergence is limited to exposing server-owned `canRepair`/`nextAction` and
  recovered/reconciliation states because existing booleans caused the observed
  precondition mismatch.

#### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Series planning wizard | existing Vertical Drama series planning route | preserve steps/routes; consume additive projection |
| Draft QC panel | `VerticalDramaDraftQualityQcPanel.tsx` | map stable state/error/next action; preserve history/repair/cancel |
| Wizard orchestration | `CreateSeriesWizard.tsx` | preserve hooks/mutations and add durable refresh/recovery mapping |
| Storyboard/prompt job status | existing episode/storyboard surfaces | reuse job status and context/readiness metadata only where enabled |

#### Component Map

| Component | Owns | Consumes |
| --- | --- | --- |
| server assurance projection adapter | authoritative capability flags and next action | durable attempt/result |
| Draft QC panel | display, action invocation, loading/error copy | projection and mutation callbacks |
| CreateSeriesWizard | workflow state/query invalidation and existing navigation | panel callbacks, router data |
| existing job status components | progress/reconnect presentation | durable state/event replay |

#### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading/queued/running | progress phase, cancel if allowed, editing remains available | Vitest + browser refresh |
| empty/no result | run QC action, no repair action, source/draft unchanged | router/component test |
| recovered | baseline/report/history visible, repair/retry enabled by server | regression scenario 1 |
| awaiting action | reason, affected field/source, concrete edit/repair/retry action | all typed error fixtures |
| retryable/stale | safe retry/refresh, no raw exception, no infinite spinner | worker/network fixture |
| reconciliation | pending message, inspect allowed, paid retry disabled | provider uncertainty fixture |
| succeeded | verified/readiness badge and continue action | final gate fixture |
| disabled/hover/focus/selected | existing control states remain visible and keyboard reachable | browser/accessibility evidence |

#### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | panel stacks, primary next action visible, no clipped error/copy | Playwright/screenshot |
| tablet 768x1024 | wizard/panel remains readable, no horizontal overflow | Playwright/screenshot |
| desktop 1440x900 | existing density/layout preserved, progress/history usable | Playwright/screenshot |
| small-mobile 360x800 | extended dense-layout check; wrap long error/action text | screenshot if browser available |
| laptop 1024x768 | extended multi-panel breakpoint check | screenshot if browser available |
| wide-desktop 1280x800 | extended overflow/content-wrap check | screenshot if browser available |

#### Accessibility Acceptance

- Keyboard path reaches run, cancel, inspect, repair, retry, and continue
  actions in logical order; disabled actions explain why.
- Focus remains visible and returns to the triggering control after mutation.
- Status uses semantic live-region behavior without announcing every poll;
  action labels include the operation, not icon-only meaning.
- Error/status colors are paired with text/icon semantics and preserve contrast.
- Reduced-motion users receive static progress/status updates.

#### Visual Direction and Token Strategy

Reuse current Astryx/Tailwind/product tokens, existing card/button/status
primitives, spacing, typography, radius, border/elevation, and light/dark
mapping from the QC panel and wizard. Do not add raw colors or a new visual
system. Keep operational density balanced; use restrained progress motion and
preserve current panel hierarchy.

#### Copy Contract

- Tone: calm, direct, actionable; distinguish “ตรวจไม่ผ่าน” from
  “ระบบขัดข้องชั่วคราว”.
- Primary languages: Thai UI with existing English fallback/technical codes.
- Required labels: ตรวจ QC, ซ่อม, ลองใหม่, ตรวจสอบผล, รอการยืนยัน,
  กำลังประสานผลลัพธ์, ใช้ Draft ต่อ, ดำเนินการต่อ.
- Error copy must map stable codes to next action and never expose raw
  `TRPCClientError` as the only message.
- Loading/success/recovered copy must explain whether editing and continuation
  are still allowed.
- Add translations through existing locale conventions with English fallback.

#### Browser Evidence Required

Record `implementation/ui-browser-evidence.md` using the required viewport
matrix, console/error, overflow, keyboard, labels, loading/error/success and
light/dark checks from `ui-browser-verification.md`. Skipped browser checks are
explicitly skipped, never counted as pass.

### Tests first

- Existing component props/queries remain compatible.
- The existing generic `StoryboardProductionContext` remains parseable and is
  translated into the new Vertical Drama assurance context only through an
  explicit adapter.
- Every projection state maps to the correct enabled actions and localized copy.
- Refresh/reconnect and mutation invalidation do not duplicate admission.
- Mobile/tablet/desktop layout tests or browser evidence show no clipping,
  horizontal overflow, dead action, or lost draft.
- Keyboard/focus/semantic status and reduced-motion behavior are covered.

### Acceptance and rollout

Ship additive projection first. Keep the old client fields populated during
dual-read/write. Do not block save/edit/navigation because a new projection
field is unavailable; only server-side unsafe transitions are gated.

The plan must preserve existing procedures such as
`getDraftQualityQcEstimate`, `startDraftQualityQc`, `repairDraftQualityQc`,
`getDraftQualityQcStatus`, `cancelDraftQualityQc`, `getDraftHistory`, and
candidate confirmation. If a logical operation is implemented through a new
service rather than a new router procedure, the plan must state the existing
procedure that owns the public contract and its compatibility projection.

## 11. Section 09 — Security, observability, migration, rollout, and runbook

### Goal

Make the feature operable and reversible in real tenants without treating test
success as production proof.

### Files and symbols

- Existing auth/tenant scope helpers and `adminProcedure`/domain procedures.
- Schema migrations and backfill scripts selected by Section 02.
- Agent Runtime redaction/trace/metrics services and operational dashboards.
- Feature flag registry and existing kill-switch/rollout conventions.
- New or updated runbook under the repository's operational docs location.

### Security and tenancy

Require tenant/user/domain ownership on every read, repair, source, event,
trace, and reconciliation lookup. Treat retrieved pages, uploads, OCR,
transcripts, subtitles, and media metadata as untrusted prompt-injection data.
Pass minimum structured evidence and server-owned IDs to Agents. Resolve media
through tenant-scoped managed storage; never let Agents fetch arbitrary URLs,
follow redirects, access internal addresses, or turn provider URLs into proof.
Bound request size, media count, tokens, wall clock, concurrency, retries, and
per-tenant queue pressure.

### Observability

Emit tenant-safe metrics by task/profile/model/provider/release for admission,
terminality, recovery, repair, stale/reconciliation age, invalid activation,
duplicate effects, latency, tokens, and actual/reserved/refunded credits.
Correlate Node execution/attempt/provider call/trace/event IDs. Redact story,
prompt, media URLs, signed URLs, tokens, and private evidence. Replays use
redacted fixtures and cannot call paid providers.

### Migration and rollout

Use additive nullable/versioned fields and indexes, dual-read/write, proven-only
backfill, then boundary-specific enforcement. Keep the legacy path and kill
switch until old leases/reconciliations are terminal. Roll out in shadow → Draft
QC canary → prompt/media canary → story/season canary, with independent flags
and rollback that preserves accepted data and does not blindly refund/resubmit.

### Runbook deliverables

Document how to inspect an attempt/fingerprint, recover Redis/worker expiry,
repair a recovered QC result, reconcile credit/provider uncertainty, disable
Agent path, roll back one task-kind flag, and distinguish application,
provider, migration, browser, and deployment failures.

### Tests first

- Tenant isolation and authorization failures never reveal cross-tenant data.
- Prompt injection/arbitrary URL/oversized input/resource exhaustion are
  rejected or bounded.
- Metrics and traces are redacted and correlated.
- Migration upgrade/dual-read/backfill/rollback fixtures preserve old records
  and do not block draft save/edit.
- Flag matrix proves shadow/kill-switch/rollback behavior per task family.
- Runbook commands/queries are read-only or explicitly scoped for operator use.

### Acceptance and rollout

Do not enable active flags until Section 10 evidence is complete. Record
staging/deployed/browser/provider/canary evidence separately from local tests.

## 12. Section 10 — Cross-section integration, production proof, and closeout

### Goal

Prove that all sections work together and close remaining gaps through bounded
review loops before claiming completion.

### Integration checks

1. Run focused web unit/service suites for all changed seams with
   `npm --workspace apps/web test -- <focused files>`.
2. Run Python Agent Runtime contract/orchestration tests with
   `cd python-backend && pytest <focused tests>`.
3. Run cross-stage replay matrix for every registered profile.
4. Run migration/restart/Redis expiry/duplicate delivery fault scenarios.
5. Run authenticated browser flows at mobile 390x844, tablet 768x1024,
   desktop 1440x900, and extended risk viewports where available.
6. Run staging/provider/canary proof only with explicit environment evidence;
   do not infer it from local tests.

### Review loops

- Per section: implementation completeness review, focused tests, code review,
  auto-fix obvious issues, and re-run tests.
- After all sections: cross-section interface/dependency/coverage review up to
  three rounds; fix mismatched schemas, imports, flags, projections, and tests.
- Final quality sweep: compare implementation against spec/plan/TDD/sections,
  run `git diff --check`, focused type/test commands, and classify residual
  optional risks without hiding skipped browser/provider evidence.

### Definition of implementation completion

- The original Draft QC repair error has a regression test and cannot recur for
  a current recovered result.
- Every enabled entry point has context/assurance admission or an explicitly
  documented legacy wrapper.
- No invalid candidate activation, duplicate user charge, or duplicate paid
  provider task in deterministic crash/retry tests.
- All thirteen profiles pass the cross-stage contract matrix.
- Existing UX save/edit/preview/navigation works while work is queued/running,
  degraded, stale, or awaiting action.
- Browser/deployment/provider/migration/canary/runbook evidence is reported
  honestly and separately.
- Unrelated dirty worktree changes remain untouched and unstaged.

## 13. Dependency and execution matrix

| Section | Depends on | Safe parallel work | Blocks |
| --- | --- | --- | --- |
| 01 contracts/context | research only | none | 02–10 |
| 02 durable attempts | 01 + persistence inventory | migration fixture preparation | 04, 08, 09, 10 |
| 03 billing/provider policy | 01 + existing credit/provider inventory | focused credit/provider fixtures | 04, 06, 07, 09, 10 |
| 04 Draft QC | 01–03 | none; touches critical path | 08, 10 |
| 05 context admission | 01–02 | profile/source test fixtures | 06, 07, 10 |
| 06 Agent runtime | 01–03 | Python/Node contract tests | 07, 10 |
| 07 story/prompt/media | 03, 05, 06 | profile-specific pure validators | 10 |
| 08 API/UI | 02, 04, 05 | locale/browser fixture preparation | 10 |
| 09 security/ops/migration | 02, 03, 06, 08 | runbook/metric dashboards | 10 |
| 10 integration/proof | 01–09 | evidence collection by environment | release |

Do not run parallel writers against the same file. Parallelizable work is
limited to independent tests/fixtures/research; shared schema, router, ledger,
and UI files follow the dependency order above. Each section is committed with
its tests and section documentation, and later sections must consume the
exported contracts rather than redefine them.
